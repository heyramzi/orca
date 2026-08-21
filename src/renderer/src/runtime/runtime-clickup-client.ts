import type {
  ClickUpComment,
  ClickUpConnectionStatus,
  ClickUpCreateTaskArgs,
  ClickUpCreateTaskResult,
  ClickUpMutationResult,
  ClickUpTask,
  ClickUpTaskFilter,
  ClickUpTaskUpdate,
  ClickUpViewer,
  ClickUpWorkspaceSelection
} from '../../../shared/clickup-types'
import { searchLocalClickUpTasks } from './local-clickup-search-cancellation'
import { callRuntimeRpc } from './runtime-rpc-client'
import { isRuntimeProviderSearchQueryWithinLimit } from './runtime-provider-search-bounds'
import { getClickUpRuntimeTarget, type RuntimeClickUpSettings } from './runtime-clickup-target'

export {
  clickupLookupTaskSummary,
  clickupReadStatus
} from './runtime-clickup-summary-client'
export type { RuntimeClickUpSettings } from './runtime-clickup-target'

export type ClickUpConnectResult =
  | { ok: true; viewer: ClickUpViewer }
  | { ok: false; error: string }
export type ClickUpCommentResult = { ok: true; id: string } | { ok: false; error: string }

export type ClickUpTaskScope = {
  filter?: ClickUpTaskFilter
  limit?: number
  workspaceId?: ClickUpWorkspaceSelection | null
  listId?: string | null
}

function toQueryArgs(scope: ClickUpTaskScope): {
  filter?: ClickUpTaskFilter
  limit?: number
  workspaceId?: string
  listId?: string
} {
  return {
    filter: scope.filter,
    limit: scope.limit,
    workspaceId: scope.workspaceId ?? undefined,
    listId: scope.listId ?? undefined
  }
}

export async function clickupStatus(
  settings: RuntimeClickUpSettings
): Promise<ClickUpConnectionStatus> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpConnectionStatus>(target, 'clickup.status', undefined, {
        timeoutMs: 15_000
      })
    : window.api.clickup.status()
}

export async function clickupConnect(
  settings: RuntimeClickUpSettings,
  args: { apiToken: string }
): Promise<ClickUpConnectResult> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpConnectResult>(target, 'clickup.connect', args, { timeoutMs: 30_000 })
    : window.api.clickup.connect(args)
}

export async function clickupDisconnect(
  settings: RuntimeClickUpSettings,
  accountId?: string | null
): Promise<void> {
  const target = getClickUpRuntimeTarget(settings)
  if (target.kind === 'environment') {
    await callRuntimeRpc<{ ok: true }>(
      target,
      'clickup.disconnect',
      accountId ? { accountId } : undefined,
      { timeoutMs: 15_000 }
    )
    return
  }
  await window.api.clickup.disconnect(accountId ? { accountId } : undefined)
}

export async function clickupSelectWorkspace(
  settings: RuntimeClickUpSettings,
  workspaceId: ClickUpWorkspaceSelection
): Promise<ClickUpConnectionStatus> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpConnectionStatus>(
        target,
        'clickup.selectWorkspace',
        { workspaceId },
        { timeoutMs: 15_000 }
      )
    : window.api.clickup.selectWorkspace({ workspaceId })
}

export async function clickupRefreshWorkspaces(
  settings: RuntimeClickUpSettings
): Promise<ClickUpConnectionStatus> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpConnectionStatus>(target, 'clickup.refreshWorkspaces', undefined, {
        timeoutMs: 30_000
      })
    : window.api.clickup.refreshWorkspaces()
}

export async function clickupTestConnection(
  settings: RuntimeClickUpSettings,
  accountId?: string | null
): Promise<ClickUpConnectResult> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpConnectResult>(
        target,
        'clickup.testConnection',
        accountId ? { accountId } : undefined,
        { timeoutMs: 30_000 }
      )
    : window.api.clickup.testConnection(accountId ? { accountId } : undefined)
}

export async function clickupSearchTasks(
  settings: RuntimeClickUpSettings,
  query: string,
  scope: ClickUpTaskScope = {},
  signal?: AbortSignal
): Promise<ClickUpTask[]> {
  if (!isRuntimeProviderSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getClickUpRuntimeTarget(settings)
  const args = { ...toQueryArgs(scope), query }
  if (target.kind === 'environment') {
    return callRuntimeRpc<ClickUpTask[]>(target, 'clickup.searchTasks', args, {
      timeoutMs: 30_000,
      signal
    })
  }
  return signal ? searchLocalClickUpTasks(args, signal) : window.api.clickup.searchTasks(args)
}

export async function clickupListTasks(
  settings: RuntimeClickUpSettings,
  scope: ClickUpTaskScope = {}
): Promise<ClickUpTask[]> {
  const target = getClickUpRuntimeTarget(settings)
  const args = toQueryArgs(scope)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpTask[]>(target, 'clickup.listTasks', args, { timeoutMs: 30_000 })
    : window.api.clickup.listTasks(args)
}

export async function clickupGetTask(
  settings: RuntimeClickUpSettings,
  taskId: string,
  workspaceId?: string | null
): Promise<ClickUpTask | null> {
  const target = getClickUpRuntimeTarget(settings)
  const args = { taskId, workspaceId: workspaceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpTask | null>(target, 'clickup.getTask', args, { timeoutMs: 30_000 })
    : window.api.clickup.getTask(args)
}

export async function clickupCreateTask(
  settings: RuntimeClickUpSettings,
  args: ClickUpCreateTaskArgs
): Promise<ClickUpCreateTaskResult> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpCreateTaskResult>(target, 'clickup.createTask', args, {
        timeoutMs: 30_000
      })
    : window.api.clickup.createTask(args)
}

export async function clickupUpdateTask(
  settings: RuntimeClickUpSettings,
  taskId: string,
  updates: ClickUpTaskUpdate,
  workspaceId?: string | null
): Promise<ClickUpMutationResult> {
  const target = getClickUpRuntimeTarget(settings)
  const args = { taskId, updates, workspaceId: workspaceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpMutationResult>(target, 'clickup.updateTask', args, {
        timeoutMs: 30_000
      })
    : window.api.clickup.updateTask(args)
}

export async function clickupAddTaskComment(
  settings: RuntimeClickUpSettings,
  taskId: string,
  body: string,
  workspaceId?: string | null
): Promise<ClickUpCommentResult> {
  const target = getClickUpRuntimeTarget(settings)
  const args = { taskId, body, workspaceId: workspaceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpCommentResult>(target, 'clickup.addTaskComment', args, {
        timeoutMs: 30_000
      })
    : window.api.clickup.addTaskComment(args)
}

export async function clickupTaskComments(
  settings: RuntimeClickUpSettings,
  taskId: string,
  workspaceId?: string | null
): Promise<ClickUpComment[]> {
  const target = getClickUpRuntimeTarget(settings)
  const args = { taskId, workspaceId: workspaceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpComment[]>(target, 'clickup.taskComments', args, { timeoutMs: 30_000 })
    : window.api.clickup.taskComments(args)
}
