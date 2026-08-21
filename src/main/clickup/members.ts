import type {
  ClickUpPriority,
  ClickUpUser,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'
import { getClients } from './client'
import { acquire, release } from './request-queue'
import { clickUpRequest } from './authenticated-request'
import { asRecord } from './account-identity'
import { CLICKUP_PRIORITIES, mapUser } from './task-mapping'

export function listPriorities(): ClickUpPriority[] {
  return [...CLICKUP_PRIORITIES]
}

function matchesQuery(user: ClickUpUser, query: string): boolean {
  if (!query) {
    return true
  }
  const needle = query.toLowerCase()
  return (
    user.username.toLowerCase().includes(needle) ||
    (user.email ?? '').toLowerCase().includes(needle)
  )
}

export async function listAssignableUsers(
  listId: string,
  query?: string,
  workspaceId?: ClickUpWorkspaceSelection | null
): Promise<ClickUpUser[]> {
  const trimmed = query?.trim() ?? ''
  for (const client of getClients(workspaceId)) {
    await acquire()
    try {
      const response = await clickUpRequest<{ members?: unknown }>(
        client,
        `/list/${listId}/member`
      )
      const members = asRecord(response).members
      const users = (Array.isArray(members) ? members : []).flatMap((member) => {
        const user = mapUser(member)
        return user && matchesQuery(user, trimmed) ? [user] : []
      })
      if (users.length > 0) {
        return users
      }
    } catch {
      // A List can belong to another Workspace under an 'all' selection.
      continue
    } finally {
      release()
    }
  }
  return []
}
