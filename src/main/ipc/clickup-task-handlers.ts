import { ipcMain } from 'electron'
import { getTask, getTaskComments, getTaskSummary } from '../clickup/task-detail'
import { listTasks, searchTasks } from '../clickup/task-queries'
import { addTaskComment, createTask, updateTask } from '../clickup/task-mutations'
import { ProviderCancellableRequests } from './provider-cancellable-requests'
import {
  clampLimit,
  normalizeFilter,
  normalizeId,
  normalizeTaskUpdate,
  normalizeWorkspaceSelection
} from './clickup-request-args'
import type { ClickUpCreateTaskArgs, ClickUpTaskUpdate } from '../../shared/clickup-types'

const taskSummaryRequests = new ProviderCancellableRequests()
const searchRequests = new ProviderCancellableRequests()

type TaskQueryArgs = {
  filter?: string
  limit?: number
  workspaceId?: string
  listId?: string
}

export function registerClickUpTaskHandlers(): void {
  ipcMain.handle(
    'clickup:searchTasks',
    async (_event, args: TaskQueryArgs & { query: string; requestId?: string }) => {
      if (typeof args?.query !== 'string') {
        return []
      }
      return searchRequests.run(args.requestId, (signal) =>
        searchTasks(
          {
            query: args.query,
            limit: clampLimit(args.limit),
            filter: normalizeFilter(args.filter),
            workspaceId: normalizeWorkspaceSelection(args.workspaceId),
            listId: normalizeId(args.listId)
          },
          signal
        )
      )
    }
  )

  ipcMain.handle('clickup:cancelSearchTasks', (_event, args: { requestId?: string }) => {
    searchRequests.cancel(args?.requestId)
  })

  ipcMain.handle('clickup:listTasks', async (_event, args?: TaskQueryArgs) =>
    listTasks({
      filter: normalizeFilter(args?.filter),
      limit: clampLimit(args?.limit),
      workspaceId: normalizeWorkspaceSelection(args?.workspaceId),
      listId: normalizeId(args?.listId)
    })
  )

  ipcMain.handle(
    'clickup:getTask',
    async (_event, args: { taskId: string; workspaceId?: string }) => {
      const taskId = normalizeId(args?.taskId)
      return taskId ? getTask(taskId, normalizeWorkspaceSelection(args.workspaceId)) : null
    }
  )

  ipcMain.handle(
    'clickup:lookupTaskSummary',
    async (_event, args: { taskId: string; workspaceId: string; requestId?: string }) => {
      const taskId = normalizeId(args?.taskId)
      const workspaceId = normalizeId(args?.workspaceId)
      if (!taskId || !workspaceId) {
        return null
      }
      return taskSummaryRequests.run(args.requestId, (signal) =>
        getTaskSummary(taskId, workspaceId, signal)
      )
    }
  )

  ipcMain.handle('clickup:cancelTaskSummary', (_event, args: { requestId?: string }) => {
    taskSummaryRequests.cancel(args?.requestId)
  })

  ipcMain.handle(
    'clickup:taskComments',
    async (_event, args: { taskId: string; workspaceId?: string }) => {
      const taskId = normalizeId(args?.taskId)
      return taskId ? getTaskComments(taskId, normalizeWorkspaceSelection(args.workspaceId)) : []
    }
  )

  ipcMain.handle('clickup:createTask', async (_event, args: ClickUpCreateTaskArgs) => {
    const listId = normalizeId(args?.listId)
    const name = typeof args?.name === 'string' ? args.name.trim() : ''
    if (!listId || !name) {
      return { ok: false as const, error: 'A List and a task name are required.' }
    }
    return createTask({
      listId,
      name,
      workspaceId: normalizeWorkspaceSelection(args.workspaceId),
      description: typeof args.description === 'string' ? args.description : undefined,
      statusName: normalizeId(args.statusName),
      priorityId: args.priorityId ?? undefined,
      assigneeIds: Array.isArray(args.assigneeIds) ? args.assigneeIds : undefined
    })
  })

  ipcMain.handle(
    'clickup:updateTask',
    async (
      _event,
      args: { taskId: string; updates: ClickUpTaskUpdate; workspaceId?: string }
    ) => {
      const taskId = normalizeId(args?.taskId)
      const updates = normalizeTaskUpdate(args?.updates)
      if (!taskId || !updates) {
        return { ok: false as const, error: 'Invalid ClickUp task update.' }
      }
      return updateTask(taskId, updates, normalizeWorkspaceSelection(args.workspaceId))
    }
  )

  ipcMain.handle(
    'clickup:addTaskComment',
    async (_event, args: { taskId: string; body: string; workspaceId?: string }) => {
      const taskId = normalizeId(args?.taskId)
      const body = typeof args?.body === 'string' ? args.body.trim() : ''
      if (!taskId || !body) {
        return { ok: false as const, error: 'A comment body is required.' }
      }
      return addTaskComment(taskId, body, normalizeWorkspaceSelection(args.workspaceId))
    }
  )
}
