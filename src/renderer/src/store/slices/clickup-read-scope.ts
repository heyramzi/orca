import type { AppState } from '../types'
import type { ClickUpConnectionStatus, ClickUpTask } from '../../../../shared/clickup-types'
import type { CacheEntry } from './github'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getTaskSourceCacheScope,
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../../shared/task-source-context'

export const CLICKUP_CACHE_TTL = 60_000
const MAX_CACHE_ENTRIES = 500

export function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CLICKUP_CACHE_TTL
}

export function evictStaleEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) {
    return cache
  }
  const sorted = keys.sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
  const pruned: Record<string, CacheEntry<T>> = {}
  for (const key of sorted.slice(sorted.length - maxEntries)) {
    pruned[key] = cache[key]
  }
  return pruned
}

export function looksLikeAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  // Why: ClickUp answers 403 when a Space or List is out of reach while the
  // saved token is still valid; do not flip Settings back to disconnected.
  return /authenticat|unauthorized|401|OAUTH_0(19|25|27)/i.test(msg)
}

export type InflightClickUpRead<T> = {
  promise: Promise<T>
  contextKey: string
  mutationGeneration: number
}

export type SharedClickUpSummaryRequest = InflightClickUpRead<ClickUpTask | null> & {
  controller: AbortController
  subscribers: number
}

export function createClickUpAbortError(what: string): Error {
  const error = new Error(`ClickUp ${what} aborted`)
  error.name = 'AbortError'
  return error
}

/**
 * Join one summary read, even when the caller brought its own signal.
 *
 * The shared request is cancelled only once every subscriber has abandoned it, so a superseded
 * keystroke still releases the ClickUp pool without stealing a lookup another caller awaits.
 */
export function subscribeToClickUpSummaryRequest(
  entry: SharedClickUpSummaryRequest,
  signal: AbortSignal | undefined
): Promise<ClickUpTask | null> {
  if (!signal) {
    entry.subscribers += 1
    return entry.promise
  }
  if (signal.aborted) {
    return Promise.reject(createClickUpAbortError('task summary lookup'))
  }
  entry.subscribers += 1
  return new Promise<ClickUpTask | null>((resolve, reject) => {
    const abandon = (): void => {
      entry.subscribers -= 1
      if (entry.subscribers <= 0) {
        entry.controller.abort()
      }
      reject(createClickUpAbortError('task summary lookup'))
    }
    signal.addEventListener('abort', abandon, { once: true })
    const settle = (): void => signal.removeEventListener('abort', abandon)
    entry.promise.then(
      (task) => {
        settle()
        resolve(task)
      },
      (error: unknown) => {
        settle()
        reject(error)
      }
    )
  })
}

export type ClickUpReadScope = {
  settings: AppState['settings'] | TaskSourceContext | null
  contextKey: string
  cachePrefix: string | null
  explicitSource: boolean
}

export function getClickUpReadScope(
  settings: AppState['settings'],
  sourceContext?: TaskSourceContext | null
): ClickUpReadScope {
  if (!sourceContext) {
    return {
      settings,
      contextKey: getProviderRuntimeContextKey(settings),
      cachePrefix: null,
      explicitSource: false
    }
  }
  const runtimeSettings = getTaskSourceRuntimeSettings(sourceContext)
  return {
    settings: sourceContext,
    contextKey: `${getProviderRuntimeContextKey(runtimeSettings)}::${getTaskSourceCacheScope(sourceContext)}`,
    cachePrefix: getTaskSourceCacheScope(sourceContext),
    explicitSource: true
  }
}

export function scopedClickUpCacheKey(scope: ClickUpReadScope, key: string): string {
  return scope.cachePrefix ? `${scope.cachePrefix}::${key}` : key
}

export function getClickUpConnectionRevisionContextKey(
  settings: AppState['settings'] | TaskSourceContext | null
): string {
  return getProviderRuntimeContextKey(
    settings && 'kind' in settings ? getTaskSourceRuntimeSettings(settings) : settings
  )
}

export function nextClickUpConnectionRevisions(
  revisions: Record<string, number>,
  contextKey: string
): Record<string, number> {
  return { ...revisions, [contextKey]: (revisions[contextKey] ?? 0) + 1 }
}

export function getSelectedWorkspaceId(status: ClickUpConnectionStatus): string | null {
  return status.selectedWorkspaceId ?? status.activeWorkspaceId ?? null
}

export function shouldRefreshStatusAfterRead(
  workspaceId: string | null | undefined,
  status: ClickUpConnectionStatus,
  options?: { abortable?: boolean }
): boolean {
  // Why: a visible credential error may have been cleared by a successful credential read.
  if (status.credentialError !== undefined) {
    return true
  }
  // Why: 'all' reads can hide a per-account decrypt failure. Abortable typeahead
  // (composer search) must not re-check status on every keystroke.
  return workspaceId === 'all' && options?.abortable !== true
}
