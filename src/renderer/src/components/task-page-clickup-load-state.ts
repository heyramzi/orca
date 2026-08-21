import type { ClickUpTask } from '../../../shared/clickup-types'

export type TaskPageClickUpLoadError = {
  title: string
  details: string | null
}

export type TaskPageClickUpLoadFailureState = {
  tasks: ClickUpTask[]
  error: TaskPageClickUpLoadError
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load ClickUp tasks.'
}

function getErrorCode(message: string): number | null {
  const explicit = /^Error\s+(\d{3})\b/i.exec(message)?.[1]
  if (explicit) {
    return Number(explicit)
  }
  if (/\bforbidden\b/i.test(message)) {
    return 403
  }
  if (/\bunauthorized\b|\bunauthenticated\b|\btoken\b.*\binvalid\b/i.test(message)) {
    return 401
  }
  if (/\btoo many requests\b|\brate limit\b/i.test(message)) {
    return 429
  }
  if (/\bservice unavailable\b/i.test(message)) {
    return 503
  }
  return null
}

function getErrorDetails(message: string, code: number | null): string | null {
  const normalized =
    code === null ? message : message.replace(new RegExp(`^Error\\s+${code}:\\s*`, 'i'), '')
  return normalized.trim() || null
}

function getTaskSearchErrorSummary(message: string, code: number | null): string {
  if (code === 401) {
    return 'ClickUp authentication failed. Reconnect ClickUp in Settings, then try again.'
  }
  if (code === 403) {
    return 'ClickUp denied access to these tasks. Check Space and List permissions for this token.'
  }
  if (code === 429) {
    return 'ClickUp rate-limited this request. Try again in a moment.'
  }
  if (code !== null && code >= 500) {
    return 'ClickUp had a server error while loading tasks. Try again in a moment.'
  }
  if (/\bnetwork\b|\bfetch failed\b|\btimed? ?out\b|\beconn/i.test(message)) {
    return "Couldn't reach ClickUp. Check your connection and try again."
  }
  return "Couldn't load ClickUp tasks. Try again in a moment."
}

export function createTaskPageClickUpLoadFailureState(
  error: unknown
): TaskPageClickUpLoadFailureState {
  const message = getErrorMessage(error)
  const code = getErrorCode(message)
  const summary = getTaskSearchErrorSummary(message, code)
  return {
    tasks: [],
    error: {
      title: code === null ? summary : `Error ${code}: ${summary}`,
      details: getErrorDetails(message, code)
    }
  }
}
