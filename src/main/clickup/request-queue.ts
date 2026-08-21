// ClickUp meters personal API tokens at 100 requests/minute on the entry
// plans, so reads are funnelled through a small pool rather than fanning out.
const MAX_CONCURRENT = 4
let running = 0
type QueuedClickUpRequest = {
  resolve: () => void
  reject: (error: Error) => void
  signal?: AbortSignal
  onAbort: () => void
}
const queue: QueuedClickUpRequest[] = []

function createClickUpRequestAbortError(): Error {
  const error = new Error('ClickUp request aborted')
  error.name = 'AbortError'
  return error
}

export function acquire(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createClickUpRequestAbortError())
  }
  if (running < MAX_CONCURRENT) {
    running += 1
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const entry: QueuedClickUpRequest = {
      resolve,
      reject,
      signal,
      onAbort: () => {
        const index = queue.indexOf(entry)
        if (index === -1) {
          return
        }
        queue.splice(index, 1)
        reject(createClickUpRequestAbortError())
      }
    }
    signal?.addEventListener('abort', entry.onAbort, { once: true })
    queue.push(entry)
  })
}

export function release(): void {
  running -= 1
  let next = queue.shift()
  while (next) {
    next.signal?.removeEventListener('abort', next.onAbort)
    if (!next.signal?.aborted) {
      running += 1
      next.resolve()
      return
    }
    next.reject(createClickUpRequestAbortError())
    next = queue.shift()
  }
}
