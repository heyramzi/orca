import type {
  ClickUpTask,
  ClickUpTaskFilter,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'
import { getClients } from './client'
import { acquire, release } from './request-queue'
import { buildQuery, clickUpRequest, type ClickUpClientForWorkspace } from './authenticated-request'
import { asRecord } from './account-identity'
import { mapTask } from './task-mapping'

const CLICKUP_PAGE_SIZE = 100
// ClickUp has no creator filter and no text search, so those two modes read
// pages and narrow locally. The cap stops a large Workspace from spending the
// whole rate-limit budget on one panel refresh.
const MAX_SCANNED_PAGES = 5
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 200

export type ClickUpTaskQueryArgs = {
  filter?: ClickUpTaskFilter
  limit?: number
  workspaceId?: ClickUpWorkspaceSelection | null
  listId?: string | null
}

export function clampLimit(limit: number | undefined, fallback = DEFAULT_LIMIT): number {
  if (!Number.isFinite(limit)) {
    return fallback
  }
  return Math.min(Math.max(Math.trunc(limit as number), 1), MAX_LIMIT)
}

function isFinishedStatus(task: ClickUpTask): boolean {
  return task.status.type === 'done' || task.status.type === 'closed'
}

function taskPagePath(
  client: ClickUpClientForWorkspace,
  args: ClickUpTaskQueryArgs,
  page: number
): string {
  const shared = {
    page,
    order_by: 'updated',
    reverse: 'true',
    subtasks: 'true',
    include_markdown_description: 'true'
  }
  const includeClosed = args.filter === 'done' || args.filter === 'all'
  if (args.listId) {
    return `/list/${args.listId}/task${buildQuery({
      ...shared,
      archived: 'false',
      include_closed: String(includeClosed),
      assignees: args.filter === 'assigned' ? [client.account.userId] : undefined
    })}`
  }
  return `/team/${client.workspace.id}/task${buildQuery({
    ...shared,
    include_closed: String(includeClosed),
    assignees: args.filter === 'assigned' ? [client.account.userId] : undefined
  })}`
}

async function readTaskPage(
  client: ClickUpClientForWorkspace,
  args: ClickUpTaskQueryArgs,
  page: number,
  signal?: AbortSignal
): Promise<{ tasks: ClickUpTask[]; lastPage: boolean }> {
  await acquire(signal)
  try {
    const response = await clickUpRequest<{ tasks?: unknown; last_page?: unknown }>(
      client,
      taskPagePath(client, args, page),
      signal ? { signal } : undefined
    )
    const record = asRecord(response)
    const rawTasks = Array.isArray(record.tasks) ? record.tasks : []
    const tasks = rawTasks.flatMap((task) => {
      const mapped = mapTask(task, client)
      return mapped ? [mapped] : []
    })
    return {
      tasks,
      lastPage: record.last_page === true || rawTasks.length < CLICKUP_PAGE_SIZE
    }
  } finally {
    release()
  }
}

type TaskMatcher = (task: ClickUpTask, client: ClickUpClientForWorkspace) => boolean

function buildFilterMatcher(filter: ClickUpTaskFilter | undefined): TaskMatcher {
  if (filter === 'created') {
    return (task, client) => task.creator?.id === client.account.userId
  }
  if (filter === 'done') {
    return (task) => isFinishedStatus(task)
  }
  if (filter === 'assigned' || filter === 'all' || filter === undefined) {
    return () => true
  }
  return () => true
}

// Scans pages until enough matches accumulate, the provider says it is out of
// pages, or the page budget runs out.
async function collectTasks(
  client: ClickUpClientForWorkspace,
  args: ClickUpTaskQueryArgs,
  limit: number,
  matcher: TaskMatcher,
  signal?: AbortSignal
): Promise<ClickUpTask[]> {
  const collected: ClickUpTask[] = []
  for (let page = 0; page < MAX_SCANNED_PAGES; page += 1) {
    const { tasks, lastPage } = await readTaskPage(client, args, page, signal)
    for (const task of tasks) {
      if (matcher(task, client)) {
        collected.push(task)
      }
    }
    if (lastPage || collected.length >= limit) {
      break
    }
  }
  return collected
}

function sortAndLimit(tasks: ClickUpTask[], limit: number): ClickUpTask[] {
  return [...tasks]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
}

export async function listTasks(
  args: ClickUpTaskQueryArgs = {},
  signal?: AbortSignal
): Promise<ClickUpTask[]> {
  const limit = clampLimit(args.limit)
  const matcher = buildFilterMatcher(args.filter)
  const clients = getClients(args.workspaceId)
  const results = await Promise.all(
    clients.map((client) => collectTasks(client, args, limit, matcher, signal))
  )
  return sortAndLimit(results.flat(), limit)
}

function buildSearchMatcher(query: string, filter: ClickUpTaskFilter | undefined): TaskMatcher {
  const needle = query.trim().toLowerCase()
  const filterMatcher = buildFilterMatcher(filter)
  return (task, client) => {
    if (!filterMatcher(task, client)) {
      return false
    }
    return (
      task.name.toLowerCase().includes(needle) ||
      (task.customId ?? '').toLowerCase().includes(needle) ||
      task.id.toLowerCase() === needle
    )
  }
}

export async function searchTasks(
  args: ClickUpTaskQueryArgs & { query: string },
  signal?: AbortSignal
): Promise<ClickUpTask[]> {
  const query = args.query.trim()
  if (!query) {
    return []
  }
  const limit = clampLimit(args.limit)
  const matcher = buildSearchMatcher(query, args.filter)
  const clients = getClients(args.workspaceId)
  const results = await Promise.all(
    clients.map((client) => collectTasks(client, args, limit, matcher, signal))
  )
  return sortAndLimit(results.flat(), limit)
}
