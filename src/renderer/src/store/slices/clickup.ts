import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { ClickUpTask } from '../../../../shared/clickup-types'
import {
  clickupLookupTaskSummary,
  clickupReadStatus
} from '@/runtime/runtime-clickup-summary-client'
import { getTaskSourceCacheScope } from '../../../../shared/task-source-context'
import { createClickUpConnectionActions } from './clickup-connection-actions'
import { createClickUpTaskReads } from './clickup-task-reads'
import { currentClickUpMutation, inflightTaskSummaryRequests } from './clickup-read-registry'
import {
  createClickUpAbortError,
  evictStaleEntries,
  getClickUpReadScope,
  isFresh,
  scopedClickUpCacheKey,
  subscribeToClickUpSummaryRequest,
  type SharedClickUpSummaryRequest
} from './clickup-read-scope'
import type { ClickUpSlice } from './clickup-slice-types'

export type { ClickUpSlice } from './clickup-slice-types'

function summaryCacheKey(workspaceId: string, taskId: string): string {
  return `${workspaceId}::${taskId.toUpperCase()}`
}

function isSummaryForRequest(task: ClickUpTask, taskId: string, workspaceId: string): boolean {
  const wanted = taskId.toUpperCase()
  return (
    task.workspaceId === workspaceId &&
    (task.id.toUpperCase() === wanted || (task.customId ?? '').toUpperCase() === wanted)
  )
}

export const createClickUpSlice: StateCreator<AppState, [], [], ClickUpSlice> = (set, get) => ({
  clickupStatus: { connected: false, viewer: null },
  clickupStatusChecked: false,
  clickupStatusContextKey: null,
  clickupConnectionRevisions: {},
  clickupTaskCache: {},
  clickupTaskSummaryCache: {},
  clickupSearchCache: {},

  ...createClickUpConnectionActions(set, get),
  ...createClickUpTaskReads(set, get),

  readClickUpStatus: async (sourceContext) => clickupReadStatus(sourceContext),

  lookupClickUpTaskSummary: async (sourceContext, taskId, workspaceId, options) => {
    const scope = getClickUpReadScope(get().settings, sourceContext)
    const cacheKey = scopedClickUpCacheKey(scope, summaryCacheKey(workspaceId, taskId))
    const cached = get().clickupTaskSummaryCache[cacheKey]
    if (!options?.force && isFresh(cached)) {
      return cached.data
    }
    if (options?.force && cached) {
      set((state) => {
        const clickupTaskSummaryCache = { ...state.clickupTaskSummaryCache }
        delete clickupTaskSummaryCache[cacheKey]
        return { clickupTaskSummaryCache }
      })
    }
    const inflight = inflightTaskSummaryRequests.get(cacheKey)
    if (!options?.force && inflight?.contextKey === scope.contextKey) {
      return subscribeToClickUpSummaryRequest(inflight, options?.signal)
    }
    if (options?.signal?.aborted) {
      throw createClickUpAbortError('task summary lookup')
    }
    let entry: SharedClickUpSummaryRequest
    const controller = new AbortController()
    const promise = clickupLookupTaskSummary(scope.settings, taskId, workspaceId, controller.signal)
      .then((task) => {
        if (
          task &&
          isSummaryForRequest(task, taskId, workspaceId) &&
          inflightTaskSummaryRequests.get(cacheKey) === entry
        ) {
          set((state) => ({
            clickupTaskSummaryCache: evictStaleEntries({
              ...state.clickupTaskSummaryCache,
              [cacheKey]: { data: task, fetchedAt: Date.now() }
            })
          }))
        }
        return task
      })
      .finally(() => {
        if (inflightTaskSummaryRequests.get(cacheKey) === entry) {
          inflightTaskSummaryRequests.delete(cacheKey)
        }
      })
    entry = {
      promise,
      controller,
      subscribers: 0,
      contextKey: scope.contextKey,
      mutationGeneration: currentClickUpMutation()
    }
    inflightTaskSummaryRequests.set(cacheKey, entry)
    return subscribeToClickUpSummaryRequest(entry, options?.signal)
  },

  patchClickUpTask: (taskId, patch, options) => {
    const sourceScope =
      options?.sourceContext?.provider === 'clickup'
        ? getTaskSourceCacheScope(options.sourceContext)
        : null
    const canPatchCacheKey = (key: string): boolean =>
      sourceScope === null || key.startsWith(`${sourceScope}::`)
    set((state) => {
      let changed = false
      const nextTaskCache = { ...state.clickupTaskCache }
      for (const [key, entry] of Object.entries(nextTaskCache)) {
        if (!canPatchCacheKey(key) || entry?.data?.id !== taskId) {
          continue
        }
        nextTaskCache[key] = { ...entry, data: { ...entry.data, ...patch }, fetchedAt: 0 }
        changed = true
      }
      const nextSearchCache = { ...state.clickupSearchCache }
      for (const key of Object.keys(nextSearchCache)) {
        const entry = nextSearchCache[key]
        if (!canPatchCacheKey(key) || !entry?.data) {
          continue
        }
        const index = entry.data.findIndex((task) => task.id === taskId)
        if (index === -1) {
          continue
        }
        const updatedItems = [...entry.data]
        updatedItems[index] = { ...updatedItems[index], ...patch }
        nextSearchCache[key] = { ...entry, data: updatedItems }
        changed = true
      }
      return changed ? { clickupTaskCache: nextTaskCache, clickupSearchCache: nextSearchCache } : {}
    })
  }
})
