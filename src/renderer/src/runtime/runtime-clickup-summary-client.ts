import type { ClickUpConnectionStatus, ClickUpTask } from '../../../shared/clickup-types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { callRuntimeRpc } from './runtime-rpc-client'
import { getClickUpRuntimeTarget, type RuntimeClickUpSettings } from './runtime-clickup-target'

export async function clickupReadStatus(
  settings: RuntimeClickUpSettings
): Promise<ClickUpConnectionStatus> {
  const target = getClickUpRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<ClickUpConnectionStatus>(target, 'clickup.readStatus', undefined, {
        timeoutMs: 15_000
      })
    : window.api.clickup.readStatus()
}

export async function clickupLookupTaskSummary(
  settings: RuntimeClickUpSettings,
  taskId: string,
  workspaceId: string,
  signal?: AbortSignal
): Promise<ClickUpTask | null> {
  const target = getClickUpRuntimeTarget(settings)
  const args = { taskId, workspaceId }
  if (target.kind === 'environment') {
    return callRuntimeRpc<ClickUpTask | null>(target, 'clickup.lookupTaskSummary', args, {
      timeoutMs: 30_000,
      signal
    })
  }
  if (signal?.aborted) {
    throw createSummaryAbortError()
  }
  const requestId = createBrowserUuid()
  const handleAbort = (): void => {
    void window.api.clickup.cancelTaskSummary({ requestId }).catch(() => {})
  }
  signal?.addEventListener('abort', handleAbort, { once: true })
  try {
    return await window.api.clickup.lookupTaskSummary({ ...args, requestId })
  } finally {
    signal?.removeEventListener('abort', handleAbort)
  }
}

function createSummaryAbortError(): Error {
  const error = new Error('ClickUp summary lookup aborted')
  error.name = 'AbortError'
  return error
}
