import type {
  ClickUpList,
  ClickUpStatus,
  ClickUpStatusType,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'
import { getClients } from './client'
import { acquire, release } from './request-queue'
import { clickUpRequest, type ClickUpClientForWorkspace } from './authenticated-request'
import { asIdentifier, asOptionalString, asRecord, asString } from './account-identity'

// Enumerating every List costs one request per Space, so the resolved tree is
// held briefly: the Tasks panel re-reads it on nearly every render.
const LIST_CACHE_TTL_MS = 60_000
const listCache = new Map<string, { lists: ClickUpList[]; fetchedAt: number }>()

type SpaceRef = { id: string; name: string }

export function clearClickUpListCache(workspaceId?: string): void {
  if (!workspaceId) {
    listCache.clear()
    return
  }
  listCache.delete(workspaceId)
}

function toStatusType(value: unknown): ClickUpStatusType {
  switch (value) {
    case 'open':
    case 'closed':
    case 'done':
      return value
    default:
      return 'custom'
  }
}

export function mapStatus(value: unknown, fallbackOrderIndex = 0): ClickUpStatus {
  const raw = asRecord(value)
  const name = asString(raw.status, 'Open')
  const orderIndex = Number(raw.orderindex)
  return {
    // Some ClickUp payloads omit the status id and identify by name alone.
    id: asIdentifier(raw.id) || name.toLowerCase(),
    name,
    type: toStatusType(raw.type),
    ...(asOptionalString(raw.color) ? { color: asOptionalString(raw.color) as string } : {}),
    orderIndex: Number.isFinite(orderIndex) ? orderIndex : fallbackOrderIndex
  }
}

export function mapStatuses(value: unknown): ClickUpStatus[] {
  return (Array.isArray(value) ? value : [])
    .map((status, index) => mapStatus(status, index))
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

function mapList(
  value: unknown,
  context: {
    workspaceId: string
    workspaceName: string
    space: SpaceRef
    folder?: { id: string; name: string } | null
  }
): ClickUpList | null {
  const raw = asRecord(value)
  const id = asIdentifier(raw.id)
  if (!id) {
    return null
  }
  const taskCount = Number(raw.task_count)
  return {
    id,
    name: asString(raw.name, id),
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    spaceId: context.space.id,
    spaceName: context.space.name,
    folderId: context.folder?.id ?? null,
    folderName: context.folder?.name ?? null,
    taskCount: Number.isFinite(taskCount) ? taskCount : null
  }
}

async function listSpaces(client: ClickUpClientForWorkspace): Promise<SpaceRef[]> {
  const response = await clickUpRequest<{ spaces?: unknown }>(
    client,
    `/team/${client.workspace.id}/space?archived=false`
  )
  const spaces = asRecord(response).spaces
  return (Array.isArray(spaces) ? spaces : []).flatMap((space) => {
    const raw = asRecord(space)
    const id = asIdentifier(raw.id)
    return id ? [{ id, name: asString(raw.name, id) }] : []
  })
}

async function listSpaceLists(
  client: ClickUpClientForWorkspace,
  space: SpaceRef
): Promise<ClickUpList[]> {
  const context = {
    workspaceId: client.workspace.id,
    workspaceName: client.workspace.name,
    space
  }
  const [folderResponse, looseResponse] = await Promise.all([
    clickUpRequest<{ folders?: unknown }>(client, `/space/${space.id}/folder?archived=false`),
    clickUpRequest<{ lists?: unknown }>(client, `/space/${space.id}/list?archived=false`)
  ])

  const folders = asRecord(folderResponse).folders
  const fromFolders = (Array.isArray(folders) ? folders : []).flatMap((folder) => {
    const raw = asRecord(folder)
    const folderId = asIdentifier(raw.id)
    if (!folderId) {
      return []
    }
    const folderRef = { id: folderId, name: asString(raw.name, folderId) }
    const lists = Array.isArray(raw.lists) ? raw.lists : []
    return lists.flatMap((list) => {
      const mapped = mapList(list, { ...context, folder: folderRef })
      return mapped ? [mapped] : []
    })
  })

  const looseLists = asRecord(looseResponse).lists
  const fromSpace = (Array.isArray(looseLists) ? looseLists : []).flatMap((list) => {
    const mapped = mapList(list, { ...context, folder: null })
    return mapped ? [mapped] : []
  })

  return [...fromFolders, ...fromSpace]
}

function sortLists(lists: ClickUpList[]): ClickUpList[] {
  return [...lists].sort((a, b) => {
    const left = `${a.spaceName}/${a.folderName ?? ''}/${a.name}`
    const right = `${b.spaceName}/${b.folderName ?? ''}/${b.name}`
    return left.localeCompare(right)
  })
}

export async function listLists(
  workspaceSelection?: ClickUpWorkspaceSelection | null
): Promise<ClickUpList[]> {
  const clients = getClients(workspaceSelection)
  const results: ClickUpList[] = []
  for (const client of clients) {
    const cached = listCache.get(client.workspace.id)
    if (cached && Date.now() - cached.fetchedAt < LIST_CACHE_TTL_MS) {
      results.push(...cached.lists)
      continue
    }
    await acquire()
    let lists: ClickUpList[]
    try {
      const spaces = await listSpaces(client)
      const perSpace = await Promise.all(spaces.map((space) => listSpaceLists(client, space)))
      lists = sortLists(perSpace.flat())
    } finally {
      release()
    }
    listCache.set(client.workspace.id, { lists, fetchedAt: Date.now() })
    results.push(...lists)
  }
  return sortLists(results)
}

export async function getList(
  listId: string,
  workspaceSelection?: ClickUpWorkspaceSelection | null
): Promise<{ list: ClickUpList; statuses: ClickUpStatus[] } | null> {
  for (const client of getClients(workspaceSelection)) {
    await acquire()
    try {
      const response = await clickUpRequest<Record<string, unknown>>(client, `/list/${listId}`)
      const raw = asRecord(response)
      if (!asIdentifier(raw.id)) {
        continue
      }
      const space = asRecord(raw.space)
      const folder = asRecord(raw.folder)
      const folderId = asIdentifier(folder.id)
      const list = mapList(raw, {
        workspaceId: client.workspace.id,
        workspaceName: client.workspace.name,
        space: {
          id: asIdentifier(space.id),
          name: asString(space.name, asIdentifier(space.id))
        },
        // ClickUp reports a folderless List with a placeholder folder whose
        // `hidden` flag is set; that is not a folder the user can see.
        folder: folderId && folder.hidden !== true ? { id: folderId, name: asString(folder.name, folderId) } : null
      })
      if (list) {
        return { list, statuses: mapStatuses(raw.statuses) }
      }
    } catch {
      // A List can belong to another Workspace under an 'all' selection.
      continue
    } finally {
      release()
    }
  }
  return null
}

export async function listStatuses(
  listId: string,
  workspaceSelection?: ClickUpWorkspaceSelection | null
): Promise<ClickUpStatus[]> {
  return (await getList(listId, workspaceSelection))?.statuses ?? []
}
