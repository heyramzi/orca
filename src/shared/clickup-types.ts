// ClickUp hierarchy is Workspace (called "team" by the API) > Space > Folder >
// List > Task. A List owns the status set a task moves through, so a List is
// the unit Orca treats as a "project": it is the smallest container whose
// statuses are stable for every task inside it.

export type ClickUpAccount = {
  id: string
  userId: string
  username: string
  email: string
  avatarUrl?: string
}

export type ClickUpWorkspace = {
  id: string
  name: string
  accountId: string
  color?: string
  avatarUrl?: string
}

export type ClickUpViewer = {
  userId: string
  username: string
  email: string | null
  avatarUrl?: string
}

export type ClickUpWorkspaceSelection = (string & {}) | 'all'

export type ClickUpConnectionStatus = {
  connected: boolean
  viewer: ClickUpViewer | null
  accounts?: ClickUpAccount[]
  workspaces?: ClickUpWorkspace[]
  activeWorkspaceId?: string | null
  selectedWorkspaceId?: ClickUpWorkspaceSelection | null
  // Set when a stored token file exists but could not be decrypted, so the
  // UI can explain reads failing while the connection still looks saved.
  credentialError?: string
}

export type ClickUpList = {
  id: string
  name: string
  workspaceId: string
  workspaceName?: string
  spaceId: string
  spaceName: string
  folderId?: string | null
  folderName?: string | null
  taskCount?: number | null
}

// ClickUp reports four status types. 'open' is the first column, 'closed' and
// 'done' both mean finished work, and everything the workspace admin added in
// between reports as 'custom'.
export type ClickUpStatusType = 'open' | 'custom' | 'closed' | 'done'

export type ClickUpStatus = {
  id: string
  name: string
  type: ClickUpStatusType
  color?: string
  orderIndex: number
}

export type ClickUpUser = {
  id: string
  username: string
  email?: string | null
  avatarUrl?: string
  color?: string
}

// ClickUp priority ids are fixed: 1 urgent, 2 high, 3 normal, 4 low.
export type ClickUpPriority = {
  id: string
  name: string
  color?: string
  orderIndex: number
}

export type ClickUpTask = {
  id: string
  // Present only when the workspace enables custom task ids (e.g. "ORCA-42").
  customId?: string | null
  workspaceId: string
  workspaceName?: string
  name: string
  description?: string
  url: string
  list: ClickUpList
  status: ClickUpStatus
  priority?: ClickUpPriority
  assignees: ClickUpUser[]
  creator?: ClickUpUser
  tags: string[]
  parentId?: string | null
  dueDate?: string | null
  startDate?: string | null
  createdAt: string
  updatedAt: string
}

export type ClickUpComment = {
  id: string
  body: string
  createdAt: string
  updatedAt?: string
  user?: ClickUpUser
}

export type ClickUpTaskUpdate = {
  name?: string
  description?: string
  // ClickUp moves a task by status *name*, not id, so this carries the label.
  statusName?: string
  addAssigneeIds?: string[]
  removeAssigneeIds?: string[]
  priorityId?: string | null
  dueDate?: string | null
}

export type ClickUpTaskFilter = 'assigned' | 'created' | 'all' | 'done'

export type ClickUpConnectArgs = {
  apiToken: string
}

export type ClickUpCreateTaskArgs = {
  workspaceId?: string
  listId: string
  name: string
  description?: string
  statusName?: string
  priorityId?: string | null
  assigneeIds?: string[]
}

export type ClickUpCreateTaskResult =
  | { ok: true; id: string; customId: string | null; url: string }
  | { ok: false; error: string }

export type ClickUpMutationResult = { ok: true } | { ok: false; error: string }

export type ClickUpTaskQuery = {
  workspaceId?: ClickUpWorkspaceSelection | null
  listId?: string | null
  filter?: ClickUpTaskFilter
  limit?: number
}
