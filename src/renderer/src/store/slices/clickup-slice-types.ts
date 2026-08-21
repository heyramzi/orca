import type {
  ClickUpConnectionStatus,
  ClickUpTask,
  ClickUpTaskFilter,
  ClickUpViewer,
  ClickUpWorkspaceSelection
} from '../../../../shared/clickup-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { CacheEntry } from './github'

export type ClickUpReadOptions = {
  sourceContext?: TaskSourceContext | null
  workspaceId?: ClickUpWorkspaceSelection | null
  listId?: string | null
}
export type ClickUpSearchOptions = ClickUpReadOptions & {
  signal?: AbortSignal
  filter?: ClickUpTaskFilter
}
export type ClickUpPatchOptions = { sourceContext?: TaskSourceContext | null }
export type ClickUpTaskSummaryLookupOptions = { force?: boolean; signal?: AbortSignal }

export type ClickUpConnectOutcome =
  | { ok: true; viewer: ClickUpViewer }
  | { ok: false; error: string }

export type ClickUpSlice = {
  clickupStatus: ClickUpConnectionStatus
  clickupStatusChecked: boolean
  clickupStatusContextKey: string | null
  clickupConnectionRevisions: Record<string, number>
  clickupTaskCache: Record<string, CacheEntry<ClickUpTask>>
  clickupTaskSummaryCache: Record<string, CacheEntry<ClickUpTask | null>>
  clickupSearchCache: Record<string, CacheEntry<ClickUpTask[]>>

  checkClickUpConnection: () => Promise<void>
  readClickUpStatus: (sourceContext: TaskSourceContext) => Promise<ClickUpConnectionStatus>
  lookupClickUpTaskSummary: (
    sourceContext: TaskSourceContext,
    taskId: string,
    workspaceId: string,
    options?: ClickUpTaskSummaryLookupOptions
  ) => Promise<ClickUpTask | null>
  connectClickUp: (args: { apiToken: string }) => Promise<ClickUpConnectOutcome>
  testClickUpConnection: (accountId?: string | null) => Promise<ClickUpConnectOutcome>
  selectClickUpWorkspace: (workspaceId: ClickUpWorkspaceSelection) => Promise<void>
  refreshClickUpWorkspaces: () => Promise<void>
  disconnectClickUp: (accountId?: string | null) => Promise<void>
  fetchClickUpTask: (
    taskId: string,
    workspaceId?: string | null,
    options?: ClickUpReadOptions
  ) => Promise<ClickUpTask | null>
  searchClickUpTasks: (
    query: string,
    limit?: number,
    options?: ClickUpSearchOptions
  ) => Promise<ClickUpTask[]>
  listClickUpTasks: (
    filter?: ClickUpTaskFilter,
    limit?: number,
    options?: ClickUpReadOptions
  ) => Promise<ClickUpTask[]>
  patchClickUpTask: (
    taskId: string,
    patch: Partial<ClickUpTask>,
    options?: ClickUpPatchOptions
  ) => void
}
