import type { ClickUpTask, ClickUpTaskFilter } from '../../../shared/clickup-types'
import { createBrowserUuid } from '@/lib/browser-uuid'

type LocalClickUpSearchArgs = {
  query: string
  filter?: ClickUpTaskFilter
  limit?: number
  workspaceId?: string
  listId?: string
}

function createClickUpSearchAbortError(): Error {
  const error = new Error('ClickUp search aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Run a local ClickUp search the main process can cancel.
 *
 * ClickUp has no text-search endpoint, so a search reads task pages. Without the cancel
 * round-trip a superseded keystroke holds its slot in the shared request pool until those
 * pages drain, which is what stalls the next search.
 */
export async function searchLocalClickUpTasks(
  args: LocalClickUpSearchArgs,
  signal: AbortSignal
): Promise<ClickUpTask[]> {
  if (signal.aborted) {
    throw createClickUpSearchAbortError()
  }
  const requestId = createBrowserUuid()
  const handleAbort = (): void => {
    void window.api.clickup.cancelSearchTasks({ requestId }).catch(() => {})
  }
  signal.addEventListener('abort', handleAbort, { once: true })
  try {
    const tasks = await window.api.clickup.searchTasks({ ...args, requestId })
    // Why: cancel can race ahead of main-process registration; drop late successes.
    if (signal.aborted) {
      throw createClickUpSearchAbortError()
    }
    return tasks
  } finally {
    signal.removeEventListener('abort', handleAbort)
  }
}
