import type {
  ClickUpComment,
  ClickUpConnectionStatus,
  ClickUpCreateTaskArgs,
  ClickUpCreateTaskResult,
  ClickUpList,
  ClickUpMutationResult,
  ClickUpPriority,
  ClickUpStatus,
  ClickUpTask,
  ClickUpTaskFilter,
  ClickUpTaskUpdate,
  ClickUpUser,
  ClickUpViewer,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'

export type ClickUpConnectResult =
  | { ok: true; viewer: ClickUpViewer }
  | { ok: false; error: string }

export type ClickUpTaskQueryArgs = {
  filter?: ClickUpTaskFilter
  limit?: number
  workspaceId?: ClickUpWorkspaceSelection
  listId?: string
}

export type ClickUpApi = {
  connect: (args: { apiToken: string }) => Promise<ClickUpConnectResult>
  disconnect: (args?: { accountId?: string }) => Promise<void>
  selectWorkspace: (args: {
    workspaceId: ClickUpWorkspaceSelection
  }) => Promise<ClickUpConnectionStatus>
  status: () => Promise<ClickUpConnectionStatus>
  readStatus: () => Promise<ClickUpConnectionStatus>
  refreshWorkspaces: () => Promise<ClickUpConnectionStatus>
  testConnection: (args?: { accountId?: string }) => Promise<ClickUpConnectResult>
  searchTasks: (
    args: ClickUpTaskQueryArgs & { query: string; requestId?: string }
  ) => Promise<ClickUpTask[]>
  cancelSearchTasks: (args: { requestId: string }) => Promise<void>
  listTasks: (args?: ClickUpTaskQueryArgs) => Promise<ClickUpTask[]>
  getTask: (args: { taskId: string; workspaceId?: string }) => Promise<ClickUpTask | null>
  lookupTaskSummary: (args: {
    taskId: string
    workspaceId: string
    requestId?: string
  }) => Promise<ClickUpTask | null>
  cancelTaskSummary: (args: { requestId: string }) => Promise<void>
  taskComments: (args: { taskId: string; workspaceId?: string }) => Promise<ClickUpComment[]>
  createTask: (args: ClickUpCreateTaskArgs) => Promise<ClickUpCreateTaskResult>
  updateTask: (args: {
    taskId: string
    updates: ClickUpTaskUpdate
    workspaceId?: string
  }) => Promise<ClickUpMutationResult>
  addTaskComment: (args: {
    taskId: string
    body: string
    workspaceId?: string
  }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  listLists: (args?: { workspaceId?: ClickUpWorkspaceSelection }) => Promise<ClickUpList[]>
  listStatuses: (args: { listId: string; workspaceId?: string }) => Promise<ClickUpStatus[]>
  listPriorities: () => Promise<ClickUpPriority[]>
  listAssignableUsers: (args: {
    listId: string
    query?: string
    workspaceId?: string
  }) => Promise<ClickUpUser[]>
}
