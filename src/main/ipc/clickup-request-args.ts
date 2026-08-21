import type {
  ClickUpTaskFilter,
  ClickUpTaskUpdate,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'

const VALID_FILTERS = new Set<ClickUpTaskFilter>(['assigned', 'created', 'all', 'done'])

export function normalizeId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeWorkspaceSelection(value: unknown): ClickUpWorkspaceSelection | undefined {
  return normalizeId(value) as ClickUpWorkspaceSelection | undefined
}

export function normalizeFilter(value: unknown): ClickUpTaskFilter | undefined {
  return VALID_FILTERS.has(value as ClickUpTaskFilter) ? (value as ClickUpTaskFilter) : undefined
}

export function clampLimit(value: unknown, fallback = 30): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(1, limit), 200)
}

function isOptionalStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  )
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

export function normalizeTaskUpdate(value: unknown): ClickUpTaskUpdate | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const input = value as ClickUpTaskUpdate
  if (input.name !== undefined && typeof input.name !== 'string') {
    return null
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    return null
  }
  if (input.statusName !== undefined && typeof input.statusName !== 'string') {
    return null
  }
  if (!isOptionalStringArray(input.addAssigneeIds)) {
    return null
  }
  if (!isOptionalStringArray(input.removeAssigneeIds)) {
    return null
  }
  if (!isOptionalNullableString(input.priorityId)) {
    return null
  }
  if (!isOptionalNullableString(input.dueDate)) {
    return null
  }
  return input
}
