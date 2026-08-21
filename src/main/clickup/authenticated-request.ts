import { net, session } from 'electron'
import { ensureElectronProxyFromEnvironment } from '../network/proxy-settings'
import { withSpan } from '../observability/tracer'
import type { ClickUpAccount, ClickUpWorkspace } from '../../shared/clickup-types'

export const CLICKUP_API_BASE_URL = 'https://api.clickup.com/api/v2'
const CLICKUP_API_USER_AGENT = 'Orca'
// ClickUp answers a throttled token with 429 and a Retry-After in seconds.
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_RETRY_AFTER_MS = 30_000

export type ClickUpClientForWorkspace = {
  account: ClickUpAccount
  workspace: ClickUpWorkspace
  authorization: string
}

export class ClickUpApiError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}

// ClickUp personal tokens and OAuth access tokens both go in the Authorization
// header verbatim — no Basic or Bearer scheme.
export function authHeader(apiToken: string): string {
  return apiToken
}

function describeErrorCause(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('cause' in error)) {
    return undefined
  }
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`
  }
  return cause === undefined ? undefined : String(cause)
}

async function clickUpFetch(url: string, init: RequestInit): Promise<Response> {
  return withSpan(
    'clickup.request',
    async (span) => {
      span.setAttribute('clickup.path', new URL(url).pathname)
      await ensureElectronProxyFromEnvironment({
        proxySession: session.defaultSession,
        probeUrl: url
      }).catch((error) => {
        span.addEvent('clickup.proxySetupFailed', {
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error)
        })
      })
      try {
        // Why: Electron's network stack follows Chromium proxy/session state,
        // avoiding undici's stale keep-alive sockets after VPN path changes.
        return await net.fetch(url, init)
      } catch (error) {
        span.setAttribute(
          'clickup.transportErrorName',
          error instanceof Error ? error.name : typeof error
        )
        span.setAttribute(
          'clickup.transportErrorMessage',
          error instanceof Error ? error.message : String(error)
        )
        const cause = describeErrorCause(error)
        if (cause) {
          span.setAttribute('clickup.transportErrorCause', cause)
        }
        throw error
      }
    },
    { kind: 'client' }
  )
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) {
    return null
  }
  const seconds = Number.parseFloat(header)
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null
  }
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      const error = new Error('ClickUp request aborted')
      error.name = 'AbortError'
      reject(error)
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function buildHeaders(authorization: string, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('User-Agent', CLICKUP_API_USER_AGENT)
  headers.set('Authorization', authorization)
  return headers
}

async function sendWithRateLimitRetry(
  url: string,
  authorization: string,
  init?: RequestInit
): Promise<Response> {
  let attempt = 0
  for (;;) {
    const response = await clickUpFetch(url, {
      ...init,
      headers: buildHeaders(authorization, init)
    })
    if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
      return response
    }
    // Why: a throttled token recovers on its own; retrying once or twice keeps
    // a busy Tasks panel usable instead of surfacing a bare "rate limited".
    await delay(retryAfterMs(response) ?? 1_000, init?.signal ?? undefined)
    attempt += 1
  }
}

async function readClickUpError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { err?: string; error?: string; ECODE?: string }
    const message = data.err ?? data.error
    if (message) {
      return data.ECODE ? `${message} (${data.ECODE})` : message
    }
  } catch {
    // Fall through to status text.
  }
  if (response.status === 429) {
    return 'ClickUp rate limit reached. Try again in a moment.'
  }
  return response.statusText || `ClickUp request failed (${response.status})`
}

async function readClickUpResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ClickUpApiError(await readClickUpError(response), response.status)
  }
  if (response.status === 204) {
    return null as T
  }
  const text = await response.text()
  if (!text) {
    return null as T
  }
  return JSON.parse(text) as T
}

export async function requestWithToken<T>(
  apiToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await sendWithRateLimitRetry(
    `${CLICKUP_API_BASE_URL}${path}`,
    authHeader(apiToken),
    init
  )
  return readClickUpResponse<T>(response)
}

export async function clickUpRequest<T>(
  client: ClickUpClientForWorkspace,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await sendWithRateLimitRetry(
    `${CLICKUP_API_BASE_URL}${path}`,
    client.authorization,
    init
  )
  return readClickUpResponse<T>(response)
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    if (Array.isArray(value)) {
      // ClickUp reads repeated list filters as `key[]=a&key[]=b`.
      for (const item of value) {
        if (item !== undefined && item !== null) {
          search.append(`${key}[]`, String(item))
        }
      }
      continue
    }
    search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
