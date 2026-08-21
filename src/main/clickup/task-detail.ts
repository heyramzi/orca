import type {
  ClickUpComment,
  ClickUpTask,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'
import { CLICKUP_CUSTOM_TASK_ID_PATTERN } from '../../shared/clickup-task-url'
import { getClients } from './client'
import { acquire, release } from './request-queue'
import {
  buildQuery,
  ClickUpApiError,
  clickUpRequest,
  type ClickUpClientForWorkspace
} from './authenticated-request'
import { asRecord } from './account-identity'
import { mapComment, mapTask } from './task-mapping'

// A task read must not hold the panel open forever when a Workspace is slow.
const TASK_READ_DEADLINE_MS = 20_000

export function looksLikeCustomTaskId(taskId: string): boolean {
  return CLICKUP_CUSTOM_TASK_ID_PATTERN.test(taskId)
}

function taskPath(
  client: ClickUpClientForWorkspace,
  taskId: string,
  options?: { customTaskId?: boolean }
): string {
  const useCustomId = options?.customTaskId ?? looksLikeCustomTaskId(taskId)
  return `/task/${encodeURIComponent(taskId)}${buildQuery({
    include_markdown_description: 'true',
    include_subtasks: 'false',
    ...(useCustomId ? { custom_task_ids: 'true', team_id: client.workspace.id } : {})
  })}`
}

// 404 means "not in this Workspace"; under an 'all' selection the next client
// may still hold the task, so only a real failure should surface.
function isMissingTask(error: unknown): boolean {
  return error instanceof ClickUpApiError && (error.status === 404 || error.status === 401)
}

async function readTaskFromClient(
  client: ClickUpClientForWorkspace,
  taskId: string,
  signal?: AbortSignal
): Promise<ClickUpTask | null> {
  await acquire(signal)
  try {
    const response = await clickUpRequest<Record<string, unknown>>(
      client,
      taskPath(client, taskId),
      signal ? { signal } : undefined
    )
    return mapTask(response, client)
  } catch (error) {
    if (isMissingTask(error)) {
      return null
    }
    throw error
  } finally {
    release()
  }
}

function withDeadline<T>(read: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('ClickUp request timed out.')), timeoutMs)
  })
  return Promise.race([read, deadline]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  }) as Promise<T>
}

export async function getTask(
  taskId: string,
  workspaceId?: ClickUpWorkspaceSelection | null,
  signal?: AbortSignal
): Promise<ClickUpTask | null> {
  const clients = getClients(workspaceId)
  let lastError: unknown = null
  for (const client of clients) {
    try {
      const task = await withDeadline(
        readTaskFromClient(client, taskId, signal),
        TASK_READ_DEADLINE_MS
      )
      if (task) {
        return task
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw lastError
  }
  return null
}

// Cheaper read used to resolve a pasted task URL: it stops at the first
// Workspace that answers instead of racing the whole account list.
export async function getTaskSummary(
  taskId: string,
  workspaceId: string,
  signal?: AbortSignal
): Promise<ClickUpTask | null> {
  const client = getClients(workspaceId)[0]
  if (!client) {
    return null
  }
  return withDeadline(readTaskFromClient(client, taskId, signal), TASK_READ_DEADLINE_MS)
}

export async function getTaskComments(
  taskId: string,
  workspaceId?: ClickUpWorkspaceSelection | null
): Promise<ClickUpComment[]> {
  for (const client of getClients(workspaceId)) {
    await acquire()
    try {
      const response = await clickUpRequest<{ comments?: unknown }>(
        client,
        `/task/${encodeURIComponent(taskId)}/comment${buildQuery(
          looksLikeCustomTaskId(taskId)
            ? { custom_task_ids: 'true', team_id: client.workspace.id }
            : {}
        )}`
      )
      const comments = asRecord(response).comments
      return (Array.isArray(comments) ? comments : []).flatMap((comment) => {
        const mapped = mapComment(comment)
        return mapped ? [mapped] : []
      })
    } catch (error) {
      if (!isMissingTask(error)) {
        throw error
      }
    } finally {
      release()
    }
  }
  return []
}
