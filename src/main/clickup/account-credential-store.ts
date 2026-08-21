import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  CredentialDecryptionError,
  credentialFileHasContent,
  readStoredCredentialToken,
  writeEncryptedCredential
} from '../integration-credential-file'
import type {
  ClickUpAccount,
  ClickUpWorkspace,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'

export type ClickUpAccountFile = {
  version: 1
  activeWorkspaceId: string | null
  selectedWorkspaceId: ClickUpWorkspaceSelection | null
  accounts: ClickUpAccount[]
  workspaces: ClickUpWorkspace[]
}

let cachedAccountFile: ClickUpAccountFile | null = null
let accountFileLoaded = false
const cachedTokens = new Map<string, string>()
// Why: decrypt failures are recorded per account so getStatus can explain
// failing reads without re-touching the keychain on every status poll.
export const credentialErrors = new Map<string, string>()

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getAccountFilePath(): string {
  return join(getOrcaDir(), 'clickup-accounts.json')
}

function getTokenDir(): string {
  return join(getOrcaDir(), 'clickup-tokens')
}

function getTokenPath(accountId: string): string {
  return join(getTokenDir(), `${Buffer.from(accountId).toString('base64url')}.enc`)
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function ensureTokenDir(): void {
  const dir = getTokenDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function emptyAccountFile(): ClickUpAccountFile {
  return {
    version: 1,
    activeWorkspaceId: null,
    selectedWorkspaceId: null,
    accounts: [],
    workspaces: []
  }
}

export function hasStoredToken(accountId: string): boolean {
  return cachedTokens.has(accountId) || credentialFileHasContent(getTokenPath(accountId))
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeAccount(input: unknown): ClickUpAccount | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.userId !== 'string' ||
    typeof record.username !== 'string' ||
    typeof record.email !== 'string'
  ) {
    return null
  }
  return {
    id: record.id,
    userId: record.userId,
    username: record.username,
    email: record.email,
    ...(optionalString(record.avatarUrl) ? { avatarUrl: record.avatarUrl as string } : {})
  }
}

function normalizeWorkspace(input: unknown): ClickUpWorkspace | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.accountId !== 'string'
  ) {
    return null
  }
  return {
    id: record.id,
    name: record.name,
    accountId: record.accountId,
    ...(optionalString(record.color) ? { color: record.color as string } : {}),
    ...(optionalString(record.avatarUrl) ? { avatarUrl: record.avatarUrl as string } : {})
  }
}

function readAccountFileFromDisk(): ClickUpAccountFile {
  const path = getAccountFilePath()
  if (!existsSync(path)) {
    return emptyAccountFile()
  }
  try {
    const parsed = JSON.parse(
      readFileSync(path, { encoding: 'utf-8' })
    ) as Partial<ClickUpAccountFile>
    const accounts = Array.isArray(parsed.accounts)
      ? parsed.accounts
          .map((account) => normalizeAccount(account))
          .filter((account): account is ClickUpAccount => account !== null)
          .filter((account) => hasStoredToken(account.id))
      : []
    const accountIds = new Set(accounts.map((account) => account.id))
    const workspaces = Array.isArray(parsed.workspaces)
      ? parsed.workspaces
          .map((workspace) => normalizeWorkspace(workspace))
          .filter((workspace): workspace is ClickUpWorkspace => workspace !== null)
          .filter((workspace) => accountIds.has(workspace.accountId))
      : []
    return withResolvedSelection({ ...emptyAccountFile(), accounts, workspaces }, parsed)
  } catch {
    return emptyAccountFile()
  }
}

function withResolvedSelection(
  file: ClickUpAccountFile,
  desired: Partial<ClickUpAccountFile>
): ClickUpAccountFile {
  const activeWorkspaceId =
    typeof desired.activeWorkspaceId === 'string' &&
    file.workspaces.some((workspace) => workspace.id === desired.activeWorkspaceId)
      ? desired.activeWorkspaceId
      : (file.workspaces[0]?.id ?? null)
  const selectedWorkspaceId =
    desired.selectedWorkspaceId === 'all' ||
    (typeof desired.selectedWorkspaceId === 'string' &&
      file.workspaces.some((workspace) => workspace.id === desired.selectedWorkspaceId))
      ? desired.selectedWorkspaceId
      : activeWorkspaceId
  return { ...file, activeWorkspaceId, selectedWorkspaceId }
}

export function getAccountFile(): ClickUpAccountFile {
  if (!accountFileLoaded || !cachedAccountFile) {
    cachedAccountFile = readAccountFileFromDisk()
    accountFileLoaded = true
  }
  return cachedAccountFile
}

export function writeAccountFile(file: ClickUpAccountFile): void {
  ensureOrcaDir()
  const accounts = file.accounts.filter((account) => hasStoredToken(account.id))
  const accountIds = new Set(accounts.map((account) => account.id))
  const workspaces = file.workspaces.filter((workspace) => accountIds.has(workspace.accountId))

  cachedAccountFile = withResolvedSelection(
    { version: 1, activeWorkspaceId: null, selectedWorkspaceId: null, accounts, workspaces },
    file
  )
  accountFileLoaded = true
  writeFileSync(getAccountFilePath(), JSON.stringify(cachedAccountFile, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
}

export function readToken(accountId: string): string | null {
  const cached = cachedTokens.get(accountId)
  if (cached !== undefined) {
    return cached
  }
  const path = getTokenPath(accountId)
  if (!existsSync(path)) {
    return null
  }
  try {
    const raw = readFileSync(path)
    const token = readStoredCredentialToken('ClickUp', raw)
    if (token) {
      cachedTokens.set(accountId, token)
    }
    credentialErrors.delete(accountId)
    return token
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      credentialErrors.set(accountId, error.message)
      throw error
    }
    return null
  }
}

export function saveToken(accountId: string, apiToken: string): void {
  ensureOrcaDir()
  ensureTokenDir()
  writeEncryptedCredential('ClickUp', getTokenPath(accountId), apiToken)
  cachedTokens.set(accountId, apiToken)
  credentialErrors.delete(accountId)
}

export function deleteToken(accountId: string): void {
  cachedTokens.delete(accountId)
  credentialErrors.delete(accountId)
  try {
    unlinkSync(getTokenPath(accountId))
  } catch {
    // Token may not exist — safe to ignore.
  }
}

// Test seam: the module caches the parsed file for the process lifetime.
export function resetClickUpCredentialCacheForTests(): void {
  cachedAccountFile = null
  accountFileLoaded = false
  cachedTokens.clear()
  credentialErrors.clear()
}
