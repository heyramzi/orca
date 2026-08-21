import type { ClickUpAccount, ClickUpViewer, ClickUpWorkspace } from '../../shared/clickup-types'

export type ClickUpRecord = Record<string, unknown>

export function asRecord(value: unknown): ClickUpRecord {
  return value && typeof value === 'object' ? (value as ClickUpRecord) : {}
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

// ClickUp is inconsistent about id types: user ids come back as numbers and
// team/task ids as strings, so every id is normalized to a string here.
export function asIdentifier(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

export function asOptionalString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text : undefined
}

// The account id is derived from the ClickUp user, so reconnecting with a new
// token for the same person replaces that credential instead of duplicating it.
export function getAccountId(userId: string): string {
  return `cu_${userId}`
}

export function toViewer(userRecord: unknown): ClickUpViewer | null {
  const user = asRecord(userRecord)
  const userId = asIdentifier(user.id)
  if (!userId) {
    return null
  }
  return {
    userId,
    username: asString(user.username, asString(user.email, userId)),
    email: asOptionalString(user.email) ?? null,
    ...(asOptionalString(user.profilePicture)
      ? { avatarUrl: asOptionalString(user.profilePicture) as string }
      : {})
  }
}

export function toAccount(viewer: ClickUpViewer): ClickUpAccount {
  return {
    id: getAccountId(viewer.userId),
    userId: viewer.userId,
    username: viewer.username,
    email: viewer.email ?? '',
    ...(viewer.avatarUrl ? { avatarUrl: viewer.avatarUrl } : {})
  }
}

export function accountToViewer(account: ClickUpAccount | null): ClickUpViewer | null {
  if (!account) {
    return null
  }
  return {
    userId: account.userId,
    username: account.username,
    email: account.email || null,
    ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {})
  }
}

export function toWorkspace(value: unknown, accountId: string): ClickUpWorkspace | null {
  const team = asRecord(value)
  const id = asIdentifier(team.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: asString(team.name, id),
    accountId,
    ...(asOptionalString(team.color) ? { color: asOptionalString(team.color) as string } : {}),
    ...(asOptionalString(team.avatar) ? { avatarUrl: asOptionalString(team.avatar) as string } : {})
  }
}
