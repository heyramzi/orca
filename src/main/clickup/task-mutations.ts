import type {
  ClickUpCreateTaskArgs,
  ClickUpCreateTaskResult,
  ClickUpMutationResult,
  ClickUpTaskUpdate,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'
import { buildClickUpTaskUrl } from '../../shared/clickup-task-url'
import { getClients } from './client'
import { clearClickUpListCache } from './lists'
import { acquire, release } from './request-queue'
import {
  buildQuery,
  ClickUpApiError,
  clickUpRequest,
  type ClickUpClientForWorkspace
} from './authenticated-request'
import { asIdentifier, asOptionalString, asRecord } from './account-identity'
import { looksLikeCustomTaskId } from './task-detail'

function toNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

// ClickUp takes assignee ids as integers; anything else is rejected outright.
function toAssigneeIds(ids: readonly string[] | undefined): number[] | undefined {
  if (!ids || ids.length === 0) {
    return undefined
  }
  const numeric = ids.map((id) => toNumericId(id)).filter((id): id is number => id !== null)
  return numeric.length > 0 ? numeric : undefined
}

function toPriorityValue(priorityId: string | null | undefined): number | null | undefined {
  if (priorityId === undefined) {
    return undefined
  }
  if (priorityId === null || priorityId === '') {
    return null
  }
  const numeric = toNumericId(priorityId)
  return numeric === null ? undefined : numeric
}

function customTaskIdQuery(client: ClickUpClientForWorkspace, taskId: string): string {
  return buildQuery(
    looksLikeCustomTaskId(taskId)
      ? { custom_task_ids: 'true', team_id: client.workspace.id }
      : {}
  )
}

function isMissingTask(error: unknown): boolean {
  return error instanceof ClickUpApiError && (error.status === 404 || error.status === 401)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function createTask(
  args: ClickUpCreateTaskArgs
): Promise<ClickUpCreateTaskResult> {
  const client = getClients(args.workspaceId ?? null)[0]
  if (!client) {
    return { ok: false, error: 'Not connected to ClickUp.' }
  }
  const body: Record<string, unknown> = { name: args.name }
  if (args.description) {
    body.markdown_content = args.description
  }
  if (args.statusName) {
    body.status = args.statusName
  }
  const priority = toPriorityValue(args.priorityId)
  if (priority !== undefined) {
    body.priority = priority
  }
  const assignees = toAssigneeIds(args.assigneeIds)
  if (assignees) {
    body.assignees = assignees
  }

  await acquire()
  try {
    const response = await clickUpRequest<Record<string, unknown>>(
      client,
      `/list/${args.listId}/task`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    const raw = asRecord(response)
    const id = asIdentifier(raw.id)
    if (!id) {
      return { ok: false, error: 'ClickUp did not return the created task.' }
    }
    const customId = asOptionalString(raw.custom_id) ?? null
    clearClickUpListCache(client.workspace.id)
    return {
      ok: true,
      id,
      customId,
      url:
        asOptionalString(raw.url) ??
        buildClickUpTaskUrl({ taskId: id, customId, workspaceId: client.workspace.id })
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Could not create the ClickUp task.') }
  } finally {
    release()
  }
}

function buildUpdateBody(updates: ClickUpTaskUpdate): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (updates.name !== undefined) {
    body.name = updates.name
  }
  if (updates.description !== undefined) {
    body.markdown_content = updates.description
  }
  if (updates.statusName !== undefined) {
    body.status = updates.statusName
  }
  const priority = toPriorityValue(updates.priorityId)
  if (priority !== undefined) {
    body.priority = priority
  }
  if (updates.dueDate !== undefined) {
    const parsed = updates.dueDate === null ? null : Date.parse(updates.dueDate)
    body.due_date = parsed === null || Number.isNaN(parsed) ? null : parsed
  }
  const add = toAssigneeIds(updates.addAssigneeIds)
  const rem = toAssigneeIds(updates.removeAssigneeIds)
  if (add || rem) {
    body.assignees = { add: add ?? [], rem: rem ?? [] }
  }
  return body
}

export async function updateTask(
  taskId: string,
  updates: ClickUpTaskUpdate,
  workspaceId?: ClickUpWorkspaceSelection | null
): Promise<ClickUpMutationResult> {
  const body = buildUpdateBody(updates)
  if (Object.keys(body).length === 0) {
    return { ok: true }
  }
  let lastError: unknown = null
  for (const client of getClients(workspaceId)) {
    await acquire()
    try {
      await clickUpRequest(
        client,
        `/task/${encodeURIComponent(taskId)}${customTaskIdQuery(client, taskId)}`,
        { method: 'PUT', body: JSON.stringify(body) }
      )
      return { ok: true }
    } catch (error) {
      lastError = error
      if (!isMissingTask(error)) {
        return { ok: false, error: errorMessage(error, 'Could not update the ClickUp task.') }
      }
    } finally {
      release()
    }
  }
  return {
    ok: false,
    error: lastError
      ? errorMessage(lastError, 'Could not update the ClickUp task.')
      : 'Not connected to ClickUp.'
  }
}

export async function addTaskComment(
  taskId: string,
  body: string,
  workspaceId?: ClickUpWorkspaceSelection | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let lastError: unknown = null
  for (const client of getClients(workspaceId)) {
    await acquire()
    try {
      const response = await clickUpRequest<Record<string, unknown>>(
        client,
        `/task/${encodeURIComponent(taskId)}/comment${customTaskIdQuery(client, taskId)}`,
        { method: 'POST', body: JSON.stringify({ comment_text: body, notify_all: false }) }
      )
      return { ok: true, id: asIdentifier(asRecord(response).id) }
    } catch (error) {
      lastError = error
      if (!isMissingTask(error)) {
        return { ok: false, error: errorMessage(error, 'Could not add the ClickUp comment.') }
      }
    } finally {
      release()
    }
  }
  return {
    ok: false,
    error: lastError
      ? errorMessage(lastError, 'Could not add the ClickUp comment.')
      : 'Not connected to ClickUp.'
  }
}
