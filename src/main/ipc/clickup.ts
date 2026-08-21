import { ipcMain } from 'electron'
import {
  connect,
  disconnect,
  getStatus,
  refreshWorkspaces,
  selectWorkspace,
  testConnection
} from '../clickup/client'
import { clearClickUpListCache, listLists, listStatuses } from '../clickup/lists'
import { listAssignableUsers, listPriorities } from '../clickup/members'
import { _resetPreflightCache } from './preflight'
import { registerClickUpTaskHandlers } from './clickup-task-handlers'
import { normalizeId, normalizeWorkspaceSelection } from './clickup-request-args'
import type { ClickUpWorkspaceSelection } from '../../shared/clickup-types'

export function registerClickUpHandlers(): void {
  ipcMain.handle('clickup:connect', async (_event, args: { apiToken: string }) => {
    if (typeof args?.apiToken !== 'string') {
      return { ok: false as const, error: 'API token is required.' }
    }
    const result = await connect({ apiToken: args.apiToken })
    if (result.ok) {
      clearClickUpListCache()
      _resetPreflightCache()
    }
    return result
  })

  ipcMain.handle('clickup:disconnect', async (_event, args?: { accountId?: string }) => {
    disconnect(normalizeId(args?.accountId))
    clearClickUpListCache()
    _resetPreflightCache()
  })

  ipcMain.handle(
    'clickup:selectWorkspace',
    async (_event, args: { workspaceId: ClickUpWorkspaceSelection }) => {
      const workspaceId = normalizeWorkspaceSelection(args?.workspaceId)
      return workspaceId ? selectWorkspace(workspaceId) : getStatus()
    }
  )

  ipcMain.handle('clickup:status', async () => getStatus())

  ipcMain.handle('clickup:readStatus', async () => getStatus())

  ipcMain.handle('clickup:refreshWorkspaces', async () => refreshWorkspaces())

  ipcMain.handle('clickup:testConnection', async (_event, args?: { accountId?: string }) =>
    testConnection(normalizeId(args?.accountId))
  )

  ipcMain.handle('clickup:listLists', async (_event, args?: { workspaceId?: string }) =>
    listLists(normalizeWorkspaceSelection(args?.workspaceId))
  )

  ipcMain.handle(
    'clickup:listStatuses',
    async (_event, args: { listId: string; workspaceId?: string }) => {
      const listId = normalizeId(args?.listId)
      return listId ? listStatuses(listId, normalizeWorkspaceSelection(args.workspaceId)) : []
    }
  )

  ipcMain.handle('clickup:listPriorities', async () => listPriorities())

  ipcMain.handle(
    'clickup:listAssignableUsers',
    async (_event, args: { listId: string; query?: string; workspaceId?: string }) => {
      const listId = normalizeId(args?.listId)
      if (!listId) {
        return []
      }
      return listAssignableUsers(
        listId,
        typeof args.query === 'string' ? args.query : undefined,
        normalizeWorkspaceSelection(args.workspaceId)
      )
    }
  )

  registerClickUpTaskHandlers()
}
