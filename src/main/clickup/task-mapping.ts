import type {
  ClickUpComment,
  ClickUpList,
  ClickUpPriority,
  ClickUpTask,
  ClickUpUser
} from '../../shared/clickup-types'
import { buildClickUpTaskUrl } from '../../shared/clickup-task-url'
import { asIdentifier, asOptionalString, asRecord, asString } from './account-identity'
import { mapStatus } from './lists'
import type { ClickUpClientForWorkspace } from './authenticated-request'

// ClickUp priority ids are fixed workspace-wide, so the labels can be resolved
// without a round trip.
export const CLICKUP_PRIORITIES: readonly ClickUpPriority[] = [
  { id: '1', name: 'Urgent', color: '#f50000', orderIndex: 1 },
  { id: '2', name: 'High', color: '#ffcc00', orderIndex: 2 },
  { id: '3', name: 'Normal', color: '#6fddff', orderIndex: 3 },
  { id: '4', name: 'Low', color: '#d8d8d8', orderIndex: 4 }
]

// ClickUp timestamps are epoch milliseconds delivered as strings.
export function toIsoDate(value: unknown): string | null {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null
  }
  const date = new Date(numeric)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function mapUser(value: unknown): ClickUpUser | undefined {
  const raw = asRecord(value)
  const id = asIdentifier(raw.id)
  if (!id) {
    return undefined
  }
  return {
    id,
    username: asString(raw.username, asString(raw.email, id)),
    email: asOptionalString(raw.email) ?? null,
    ...(asOptionalString(raw.profilePicture)
      ? { avatarUrl: asOptionalString(raw.profilePicture) as string }
      : {}),
    ...(asOptionalString(raw.color) ? { color: asOptionalString(raw.color) as string } : {})
  }
}

export function mapPriority(value: unknown): ClickUpPriority | undefined {
  const raw = asRecord(value)
  const id = asIdentifier(raw.id)
  const known = CLICKUP_PRIORITIES.find((priority) => priority.id === id)
  if (known) {
    return known
  }
  const label = asOptionalString(raw.priority)
  if (!label) {
    return undefined
  }
  const orderIndex = Number(raw.orderindex)
  return {
    id: id || label,
    name: `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
    ...(asOptionalString(raw.color) ? { color: asOptionalString(raw.color) as string } : {}),
    orderIndex: Number.isFinite(orderIndex) ? orderIndex : CLICKUP_PRIORITIES.length + 1
  }
}

function mapTaskList(raw: Record<string, unknown>, workspaceId: string, workspaceName: string): ClickUpList {
  const list = asRecord(raw.list)
  const space = asRecord(raw.space)
  const folder = asRecord(raw.folder)
  const folderId = asIdentifier(folder.id)
  // ClickUp calls the enclosing Folder "project" on task payloads, and reports
  // a folderless List through a placeholder folder marked hidden.
  const projectName = asOptionalString(asRecord(raw.project).name)
  const listId = asIdentifier(list.id)
  return {
    id: listId,
    name: asString(list.name, listId),
    workspaceId,
    workspaceName,
    spaceId: asIdentifier(space.id),
    spaceName: asString(space.name, ''),
    folderId: folderId && folder.hidden !== true ? folderId : null,
    folderName:
      folderId && folder.hidden !== true ? asString(folder.name, projectName ?? folderId) : null,
    taskCount: null
  }
}

export function mapTags(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).flatMap((tag) => {
    const name = asOptionalString(asRecord(tag).name)
    return name ? [name] : []
  })
}

export function mapTask(value: unknown, client: ClickUpClientForWorkspace): ClickUpTask | null {
  const raw = asRecord(value)
  const id = asIdentifier(raw.id)
  if (!id) {
    return null
  }
  const customId = asOptionalString(raw.custom_id) ?? null
  const createdAt = toIsoDate(raw.date_created)
  const updatedAt = toIsoDate(raw.date_updated)
  const parent = asIdentifier(raw.parent)
  return {
    id,
    customId,
    workspaceId: client.workspace.id,
    workspaceName: client.workspace.name,
    name: asString(raw.name, id),
    // `description` is the plain-text body; `text_content` repeats it for
    // older payloads. Markdown lands in `markdown_description` when requested.
    description:
      asOptionalString(raw.markdown_description) ??
      asOptionalString(raw.description) ??
      asOptionalString(raw.text_content),
    url:
      asOptionalString(raw.url) ??
      buildClickUpTaskUrl({ taskId: id, customId, workspaceId: client.workspace.id }),
    list: mapTaskList(raw, client.workspace.id, client.workspace.name),
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    assignees: (Array.isArray(raw.assignees) ? raw.assignees : []).flatMap((assignee) => {
      const user = mapUser(assignee)
      return user ? [user] : []
    }),
    creator: mapUser(raw.creator),
    tags: mapTags(raw.tags),
    parentId: parent || null,
    dueDate: toIsoDate(raw.due_date),
    startDate: toIsoDate(raw.start_date),
    createdAt: createdAt ?? new Date(0).toISOString(),
    updatedAt: updatedAt ?? createdAt ?? new Date(0).toISOString()
  }
}

// A ClickUp comment body arrives as an array of rich-text fragments; the flat
// `comment_text` is the same content already rendered to plain text.
export function mapCommentBody(raw: Record<string, unknown>): string {
  const flat = asOptionalString(raw.comment_text)
  if (flat) {
    return flat
  }
  return (Array.isArray(raw.comment) ? raw.comment : [])
    .map((fragment) => asString(asRecord(fragment).text))
    .join('')
}

export function mapComment(value: unknown): ClickUpComment | null {
  const raw = asRecord(value)
  const id = asIdentifier(raw.id)
  if (!id) {
    return null
  }
  const createdAt = toIsoDate(raw.date)
  return {
    id,
    body: mapCommentBody(raw),
    createdAt: createdAt ?? new Date(0).toISOString(),
    user: mapUser(raw.user)
  }
}
