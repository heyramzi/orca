import type { AppState } from '../types'
import type { ClickUpTask } from '../../../../shared/clickup-types'
import type { CacheEntry } from './github'
import { isIntegrationCredentialDecryptionError } from '../../../../shared/integration-credential-errors'
import {
  clickupGetTask,
  clickupListTasks,
  clickupSearchTasks
} from '@/runtime/runtime-clickup-client'
import {
  canWriteClickUpReadResult,
  currentClickUpMutation,
  inflightListRequests,
  inflightSearchRequests,
  inflightTaskRequests
} from './clickup-read-registry'
import {
  createClickUpAbortError,
  evictStaleEntries,
  getClickUpConnectionRevisionContextKey,
  getClickUpReadScope,
  getSelectedWorkspaceId,
  isFresh,
  looksLikeAuthError,
  nextClickUpConnectionRevisions,
  scopedClickUpCacheKey,
  shouldRefreshStatusAfterRead,
  type ClickUpReadScope,
  type InflightClickUpRead
} from './clickup-read-scope'
import type { ClickUpSlice } from './clickup-slice-types'

type Set = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
type Get = () => AppState

/**
 * An auth failure on a read invalidates the connection: bump the revision so lazy readers re-probe.
 * An explicit source context owns its own status, so only the ambient status is reset.
 */
function markClickUpConnectionLost(set: Set, scope: ClickUpReadScope): void {
  const revisionContextKey = getClickUpConnectionRevisionContextKey(scope.settings)
  set((state) => ({
    ...(scope.explicitSource ? {} : { clickupStatus: { connected: false, viewer: null } }),
    clickupConnectionRevisions: nextClickUpConnectionRevisions(
      state.clickupConnectionRevisions,
      revisionContextKey
    )
  }))
}

type ReadContext = {
  set: Set
  get: Get
  scope: ClickUpReadScope
  generation: number
  workspaceId: string | null | undefined
  abortable?: boolean
}

function canWrite(ctx: ReadContext): boolean {
  return canWriteClickUpReadResult(
    ctx.scope.contextKey,
    ctx.generation,
    ctx.get().settings,
    ctx.scope.explicitSource
  )
}

// Credential/auth failures are surfaced through connection state, so they keep the
// empty-list contract. Anything else (forbidden, network, 5xx) rethrows so the Tasks
// panel can show a real error instead of a misleading "No tasks found".
function isConnectionFailure(error: unknown): boolean {
  return isIntegrationCredentialDecryptionError(error) || looksLikeAuthError(error)
}

function recordReadFailure(ctx: ReadContext, error: unknown): void {
  if (!canWrite(ctx)) {
    return
  }
  if (isIntegrationCredentialDecryptionError(error)) {
    if (!shouldRefreshStatusAfterRead(ctx.workspaceId, ctx.get().clickupStatus, ctx)) {
      void ctx.get().checkClickUpConnection()
    }
    return
  }
  if (looksLikeAuthError(error)) {
    markClickUpConnectionLost(ctx.set, ctx.scope)
  }
}

function refreshStatusIfNeeded(ctx: ReadContext): void {
  if (shouldRefreshStatusAfterRead(ctx.workspaceId, ctx.get().clickupStatus, ctx) && canWrite(ctx)) {
    void ctx.get().checkClickUpConnection()
  }
}

function cacheTasks(
  ctx: ReadContext,
  cacheKey: string,
  tasks: ClickUpTask[]
): void {
  ctx.set((state) => ({
    clickupSearchCache: evictStaleEntries({
      ...state.clickupSearchCache,
      [cacheKey]: { data: tasks, fetchedAt: Date.now() }
    })
  }))
}

function readCachedTasks(get: Get, cacheKey: string): ClickUpTask[] | null {
  const cached: CacheEntry<ClickUpTask[]> | undefined = get().clickupSearchCache[cacheKey]
  return isFresh(cached) ? (cached.data ?? []) : null
}

function joinInflight<T>(
  registry: Map<string, InflightClickUpRead<T>>,
  cacheKey: string,
  scope: ClickUpReadScope
): Promise<T> | null {
  const inflight = registry.get(cacheKey)
  return inflight &&
    inflight.contextKey === scope.contextKey &&
    inflight.mutationGeneration === currentClickUpMutation()
    ? inflight.promise
    : null
}

export function createClickUpTaskReads(
  set: Set,
  get: Get
): Pick<ClickUpSlice, 'fetchClickUpTask' | 'searchClickUpTasks' | 'listClickUpTasks'> {
  return {
    fetchClickUpTask: async (taskId, workspaceId, options) => {
      const scope = getClickUpReadScope(get().settings, options?.sourceContext)
      const cacheKey = scopedClickUpCacheKey(scope, `${workspaceId ?? 'selected'}::${taskId}`)
      const cached = get().clickupTaskCache[cacheKey]
      if (isFresh(cached)) {
        return cached.data
      }
      const joined = joinInflight(inflightTaskRequests, cacheKey, scope)
      if (joined) {
        return joined
      }
      const ctx: ReadContext = {
        set,
        get,
        scope,
        generation: currentClickUpMutation(),
        workspaceId
      }
      let entry: InflightClickUpRead<ClickUpTask | null>
      const promise = clickupGetTask(scope.settings, taskId, workspaceId)
        .then((task) => {
          if (inflightTaskRequests.get(cacheKey) === entry && canWrite(ctx)) {
            set((state) => ({
              clickupTaskCache: evictStaleEntries({
                ...state.clickupTaskCache,
                [cacheKey]: { data: task, fetchedAt: Date.now() }
              })
            }))
          }
          return task
        })
        .catch((error: unknown) => {
          console.warn('[clickup] fetchClickUpTask failed:', error)
          recordReadFailure(ctx, error)
          return null
        })
        .finally(() => {
          if (inflightTaskRequests.get(cacheKey) === entry) {
            inflightTaskRequests.delete(cacheKey)
          }
          refreshStatusIfNeeded(ctx)
        })
      entry = { promise, contextKey: scope.contextKey, mutationGeneration: ctx.generation }
      inflightTaskRequests.set(cacheKey, entry)
      return promise
    },

    searchClickUpTasks: async (query, limit = 30, options) => {
      const scope = getClickUpReadScope(get().settings, options?.sourceContext)
      const workspaceId =
        options && 'workspaceId' in options
          ? (options.workspaceId ?? null)
          : getSelectedWorkspaceId(get().clickupStatus)
      const listId = options?.listId ?? null
      const cacheKey = scopedClickUpCacheKey(
        scope,
        `${workspaceId ?? 'default'}::${listId ?? 'any'}::${options?.filter ?? 'all'}::${query}::${limit}`
      )
      const cachedTasks = readCachedTasks(get, cacheKey)
      if (cachedTasks) {
        return cachedTasks
      }
      const abortable = options?.signal !== undefined
      // Why: an abortable search must not be shared — one caller's cleanup would cancel the other's.
      const joined = abortable ? null : joinInflight(inflightSearchRequests, cacheKey, scope)
      if (joined) {
        return joined
      }
      const ctx: ReadContext = {
        set,
        get,
        scope,
        generation: currentClickUpMutation(),
        workspaceId,
        abortable
      }
      let entry: InflightClickUpRead<ClickUpTask[]>
      const promise = clickupSearchTasks(
        scope.settings,
        query,
        { limit, workspaceId, listId, filter: options?.filter },
        options?.signal
      )
        .then((tasks) => {
          if (options?.signal?.aborted) {
            // Late success after cancel must not warm the cache for a superseded query.
            throw createClickUpAbortError('search')
          }
          if ((abortable || inflightSearchRequests.get(cacheKey) === entry) && canWrite(ctx)) {
            cacheTasks(ctx, cacheKey, tasks)
          }
          return tasks
        })
        .catch((error: unknown) => {
          if (options?.signal?.aborted) {
            // Superseded by a newer query: not a connection problem.
            throw error
          }
          console.warn('[clickup] searchClickUpTasks failed:', error)
          recordReadFailure(ctx, error)
          if (isConnectionFailure(error)) {
            return []
          }
          throw error
        })
        .finally(() => {
          if (inflightSearchRequests.get(cacheKey) === entry) {
            inflightSearchRequests.delete(cacheKey)
          }
          if (!options?.signal?.aborted) {
            refreshStatusIfNeeded(ctx)
          }
        })
      entry = { promise, contextKey: scope.contextKey, mutationGeneration: ctx.generation }
      if (!abortable) {
        inflightSearchRequests.set(cacheKey, entry)
      }
      return promise
    },

    listClickUpTasks: async (filter = 'assigned', limit = 30, options) => {
      const scope = getClickUpReadScope(get().settings, options?.sourceContext)
      const workspaceId =
        options && 'workspaceId' in options
          ? (options.workspaceId ?? null)
          : getSelectedWorkspaceId(get().clickupStatus)
      const listId = options?.listId ?? null
      const cacheKey = scopedClickUpCacheKey(
        scope,
        `${workspaceId ?? 'default'}::${listId ?? 'any'}::list::${filter}::${limit}`
      )
      const cachedTasks = readCachedTasks(get, cacheKey)
      if (cachedTasks) {
        return cachedTasks
      }
      const joined = joinInflight(inflightListRequests, cacheKey, scope)
      if (joined) {
        return joined
      }
      const ctx: ReadContext = {
        set,
        get,
        scope,
        generation: currentClickUpMutation(),
        workspaceId
      }
      let entry: InflightClickUpRead<ClickUpTask[]>
      const promise = clickupListTasks(scope.settings, { filter, limit, workspaceId, listId })
        .then((tasks) => {
          if (inflightListRequests.get(cacheKey) === entry && canWrite(ctx)) {
            cacheTasks(ctx, cacheKey, tasks)
          }
          return tasks
        })
        .catch((error: unknown) => {
          console.warn('[clickup] listClickUpTasks failed:', error)
          recordReadFailure(ctx, error)
          if (isConnectionFailure(error)) {
            return []
          }
          throw error
        })
        .finally(() => {
          if (inflightListRequests.get(cacheKey) === entry) {
            inflightListRequests.delete(cacheKey)
          }
          refreshStatusIfNeeded(ctx)
        })
      entry = { promise, contextKey: scope.contextKey, mutationGeneration: ctx.generation }
      inflightListRequests.set(cacheKey, entry)
      return promise
    }
  }
}
