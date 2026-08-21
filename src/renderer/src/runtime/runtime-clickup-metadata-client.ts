import type {
  ClickUpList,
  ClickUpPriority,
  ClickUpStatus,
  ClickUpUser,
  ClickUpWorkspaceSelection
} from '../../../shared/clickup-types'
import { callRuntimeRpc } from './runtime-rpc-client'
import { isRuntimeProviderSearchQueryWithinLimit } from './runtime-provider-search-bounds'
import { getClickUpRuntimeTarget, type RuntimeClickUpSettings } from './runtime-clickup-target'

export async function clickupListLists(
  settings: RuntimeClickUpSettings,
  workspaceId?: ClickUpWorkspaceSelection | null
): Promise<ClickUpList[]> {
  const target = getClickUpRuntimeTarget(settings)
  const args = workspaceId ? { workspaceId } : undefined
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpList[]>(target, 'clickup.listLists', args, { timeoutMs: 30_000 })
    : window.api.clickup.listLists(args)
}

export async function clickupListStatuses(
  settings: RuntimeClickUpSettings,
  listId: string,
  workspaceId?: string | null
): Promise<ClickUpStatus[]> {
  const target = getClickUpRuntimeTarget(settings)
  const args = { listId, workspaceId: workspaceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpStatus[]>(target, 'clickup.listStatuses', args, { timeoutMs: 30_000 })
    : window.api.clickup.listStatuses(args)
}

export async function clickupListPriorities(
  settings: RuntimeClickUpSettings
): Promise<ClickUpPriority[]> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpPriority[]>(target, 'clickup.listPriorities', undefined, {
        timeoutMs: 15_000
      })
    : window.api.clickup.listPriorities()
}

export async function clickupListAssignableUsers(
  settings: RuntimeClickUpSettings,
  listId: string,
  query?: string,
  workspaceId?: string | null
): Promise<ClickUpUser[]> {
  if (!isRuntimeProviderSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getClickUpRuntimeTarget(settings)
  const args = { listId, query, workspaceId: workspaceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpUser[]>(target, 'clickup.listAssignableUsers', args, {
        timeoutMs: 30_000
      })
    : window.api.clickup.listAssignableUsers(args)
}
