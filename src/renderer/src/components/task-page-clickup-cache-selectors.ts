import type { CacheEntry } from '@/store/slices/github'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../shared/task-source-context'
import type { ClickUpTask } from '../../../shared/clickup-types'

type ClickUpTaskCache = Record<string, CacheEntry<ClickUpTask>>
type ClickUpSearchCache = Record<string, CacheEntry<ClickUpTask[]>>

export type TaskPageClickUpTaskLookupOptions = {
  sourceContext?: TaskSourceContext | null
  workspaceId?: string | null
}

export function findTaskPageClickUpTask(
  clickupTaskCache: ClickUpTaskCache,
  clickupSearchCache: ClickUpSearchCache,
  taskId: string | null,
  options: TaskPageClickUpTaskLookupOptions = {}
): ClickUpTask | null {
  if (!taskId) {
    return null
  }
  const sourceScope =
    options.sourceContext?.provider === 'clickup'
      ? getTaskSourceCacheScope(options.sourceContext)
      : null
  const matchesLookup = (cacheKey: string, task: ClickUpTask | null | undefined): boolean => {
    if (!task || task.id !== taskId) {
      return false
    }
    if (options.workspaceId && task.workspaceId !== options.workspaceId) {
      return false
    }
    // Why: a task read for one host/account must not answer a lookup scoped to
    // another, even though ClickUp task ids are globally unique.
    return sourceScope === null || cacheKey.startsWith(`${sourceScope}::`)
  }

  for (const [cacheKey, entry] of Object.entries(clickupTaskCache)) {
    if (matchesLookup(cacheKey, entry?.data)) {
      return entry.data
    }
  }

  for (const [cacheKey, entry] of Object.entries(clickupSearchCache)) {
    const found = entry?.data?.find((task) => matchesLookup(cacheKey, task))
    if (found) {
      return found
    }
  }

  return null
}
