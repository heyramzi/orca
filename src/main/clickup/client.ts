import { CredentialDecryptionError } from '../integration-credential-file'
import type {
  ClickUpAccount,
  ClickUpConnectArgs,
  ClickUpConnectionStatus,
  ClickUpViewer,
  ClickUpWorkspace,
  ClickUpWorkspaceSelection
} from '../../shared/clickup-types'
import { acquire, release } from './request-queue'
import {
  credentialErrors,
  deleteToken,
  getAccountFile,
  hasStoredToken,
  readToken,
  saveToken,
  writeAccountFile
} from './account-credential-store'
import {
  authHeader,
  ClickUpApiError,
  clickUpRequest,
  requestWithToken,
  type ClickUpClientForWorkspace
} from './authenticated-request'
import { accountToViewer, asRecord, toAccount, toViewer, toWorkspace } from './account-identity'

export function getClients(
  selection?: ClickUpWorkspaceSelection | null
): ClickUpClientForWorkspace[] {
  const file = getAccountFile()
  const selected = selection ?? file.selectedWorkspaceId ?? file.activeWorkspaceId
  const isAllSelection = selected === 'all'
  const workspaces = isAllSelection
    ? file.workspaces
    : file.workspaces.filter(
        (workspace) => workspace.id === (selected ?? file.activeWorkspaceId)
      )

  return workspaces.flatMap((workspace) => {
    const account = file.accounts.find((entry) => entry.id === workspace.accountId)
    if (!account) {
      return []
    }
    let token: string | null
    try {
      token = readToken(account.id)
    } catch (error) {
      // Why: under an 'all' selection one un-decryptable account must not
      // collapse reads for the healthy ones. readToken already recorded the
      // per-account credentialError for getStatus to surface, so skip it like a
      // missing token. A specific-workspace selection still rethrows so the
      // renderer can surface the decrypt banner promptly.
      if (isAllSelection && error instanceof CredentialDecryptionError) {
        return []
      }
      throw error
    }
    return token ? [{ account, workspace, authorization: authHeader(token) }] : []
  })
}

export function getClientForWorkspace(workspaceId: string): ClickUpClientForWorkspace | null {
  return getClients(workspaceId)[0] ?? null
}

export function getStatus(): ClickUpConnectionStatus {
  const file = getAccountFile()
  const accounts = file.accounts.filter((account) => hasStoredToken(account.id))
  const accountIds = new Set(accounts.map((account) => account.id))
  const workspaces = file.workspaces.filter((workspace) => accountIds.has(workspace.accountId))
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === file.activeWorkspaceId) ?? workspaces[0] ?? null
  const activeAccount =
    accounts.find((account) => account.id === activeWorkspace?.accountId) ?? accounts[0] ?? null
  const credentialError = accounts
    .map((account) => credentialErrors.get(account.id))
    .find((message) => message !== undefined)
  return {
    connected: accounts.length > 0,
    viewer: accountToViewer(activeAccount),
    accounts,
    workspaces,
    activeWorkspaceId: activeWorkspace?.id ?? null,
    selectedWorkspaceId: file.selectedWorkspaceId ?? activeWorkspace?.id ?? null,
    ...(credentialError ? { credentialError } : {})
  }
}

async function fetchIdentity(
  apiToken: string
): Promise<{ viewer: ClickUpViewer; account: ClickUpAccount; workspaces: ClickUpWorkspace[] }> {
  const userResponse = await requestWithToken<{ user?: unknown }>(apiToken, '/user')
  const viewer = toViewer(asRecord(userResponse).user)
  if (!viewer) {
    throw new ClickUpApiError('ClickUp did not return an account for this token.', null)
  }
  const account = toAccount(viewer)
  const teamResponse = await requestWithToken<{ teams?: unknown }>(apiToken, '/team')
  const teams = asRecord(teamResponse).teams
  const workspaces = (Array.isArray(teams) ? teams : [])
    .map((team) => toWorkspace(team, account.id))
    .filter((workspace): workspace is ClickUpWorkspace => workspace !== null)
  return { viewer, account, workspaces }
}

export async function connect(
  args: ClickUpConnectArgs
): Promise<{ ok: true; viewer: ClickUpViewer } | { ok: false; error: string }> {
  const apiToken = args.apiToken.trim()
  if (!apiToken) {
    return { ok: false, error: 'API token is required.' }
  }

  await acquire()
  try {
    const { viewer, account, workspaces } = await fetchIdentity(apiToken)
    if (workspaces.length === 0) {
      return {
        ok: false,
        error: 'This ClickUp token cannot reach any Workspace. Check the token and try again.'
      }
    }
    saveToken(account.id, apiToken)
    const file = getAccountFile()
    writeAccountFile({
      version: 1,
      activeWorkspaceId: workspaces[0].id,
      selectedWorkspaceId: workspaces[0].id,
      accounts: [account, ...file.accounts.filter((entry) => entry.id !== account.id)],
      workspaces: [
        ...workspaces,
        ...file.workspaces.filter((entry) => entry.accountId !== account.id)
      ]
    })
    return { ok: true, viewer }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  } finally {
    release()
  }
}

export function disconnect(accountId?: string): void {
  const file = getAccountFile()
  const ids = accountId ? [accountId] : file.accounts.map((account) => account.id)
  for (const id of ids) {
    deleteToken(id)
  }
  writeAccountFile({
    version: 1,
    activeWorkspaceId: file.activeWorkspaceId,
    selectedWorkspaceId: file.selectedWorkspaceId,
    accounts: file.accounts.filter((account) => !ids.includes(account.id)),
    workspaces: file.workspaces.filter((workspace) => !ids.includes(workspace.accountId))
  })
}

export function selectWorkspace(
  workspaceId: ClickUpWorkspaceSelection
): ClickUpConnectionStatus {
  const file = getAccountFile()
  if (
    workspaceId !== 'all' &&
    !file.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return getStatus()
  }
  writeAccountFile({
    ...file,
    activeWorkspaceId: workspaceId === 'all' ? file.activeWorkspaceId : workspaceId,
    selectedWorkspaceId: workspaceId
  })
  return getStatus()
}

export async function testConnection(
  accountId?: string
): Promise<{ ok: true; viewer: ClickUpViewer } | { ok: false; error: string }> {
  const file = getAccountFile()
  const account = accountId
    ? file.accounts.find((entry) => entry.id === accountId)
    : (file.accounts[0] ?? null)
  if (!account) {
    return { ok: false, error: 'Not connected to ClickUp.' }
  }
  let token: string | null
  try {
    token = readToken(account.id)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  }
  if (!token) {
    return { ok: false, error: 'Not connected to ClickUp.' }
  }
  await acquire()
  try {
    const response = await requestWithToken<{ user?: unknown }>(token, '/user')
    const viewer = toViewer(asRecord(response).user)
    return viewer
      ? { ok: true, viewer }
      : { ok: false, error: 'ClickUp did not return an account for this token.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  } finally {
    release()
  }
}

// Refreshes the Workspace list for every stored account, so a Workspace the
// user joined after connecting shows up without reconnecting.
export async function refreshWorkspaces(): Promise<ClickUpConnectionStatus> {
  const file = getAccountFile()
  const workspaces: ClickUpWorkspace[] = []
  for (const account of file.accounts) {
    let token: string | null
    try {
      token = readToken(account.id)
    } catch {
      // Keep the previously known Workspaces for an account we cannot read.
      workspaces.push(...file.workspaces.filter((entry) => entry.accountId === account.id))
      continue
    }
    if (!token) {
      continue
    }
    await acquire()
    try {
      const response = await requestWithToken<{ teams?: unknown }>(token, '/team')
      const teams = asRecord(response).teams
      workspaces.push(
        ...(Array.isArray(teams) ? teams : [])
          .map((team) => toWorkspace(team, account.id))
          .filter((workspace): workspace is ClickUpWorkspace => workspace !== null)
      )
    } catch {
      workspaces.push(...file.workspaces.filter((entry) => entry.accountId === account.id))
    } finally {
      release()
    }
  }
  writeAccountFile({ ...file, workspaces })
  return getStatus()
}

export function clearToken(accountId: string): void {
  deleteToken(accountId)
  const file = getAccountFile()
  writeAccountFile({
    ...file,
    accounts: file.accounts.filter((account) => account.id !== accountId),
    workspaces: file.workspaces.filter((workspace) => workspace.accountId !== accountId)
  })
}

export function isAuthError(error: unknown): boolean {
  // ClickUp answers an invalid or revoked token with 401; 403 means the token
  // is fine but lacks access to that Space or List.
  return error instanceof ClickUpApiError && error.status === 401
}

export async function pingWorkspace(client: ClickUpClientForWorkspace): Promise<void> {
  await clickUpRequest(client, `/team/${client.workspace.id}/space?archived=false`)
}
