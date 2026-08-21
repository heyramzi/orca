import { z } from 'zod'
import { defineMethod, type RpcAnyMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredString
} from '../schemas'

const VALID_FILTERS = ['assigned', 'created', 'all', 'done'] as const

const WorkspaceSelection = z
  .object({
    workspaceId: OptionalString
  })
  .optional()

const AccountSelection = z
  .object({
    accountId: OptionalString
  })
  .optional()

const Connect = z.object({
  apiToken: requiredString('API token is required')
})

const SelectWorkspace = z.object({
  workspaceId: requiredString('Workspace ID is required')
})

const TaskQuery = z
  .object({
    filter: z.enum(VALID_FILTERS).optional(),
    limit: OptionalFiniteNumber,
    workspaceId: OptionalString,
    listId: OptionalString
  })
  .optional()

const SearchTasks = z.object({
  query: requiredString('Missing search text'),
  filter: z.enum(VALID_FILTERS).optional(),
  limit: OptionalFiniteNumber,
  workspaceId: OptionalString,
  listId: OptionalString
})

const TaskId = z.object({
  taskId: requiredString('Task ID is required'),
  workspaceId: OptionalString
})

const CreateTask = z.object({
  workspaceId: OptionalString,
  listId: requiredString('List is required'),
  name: requiredString('Task name is required'),
  description: OptionalPlainString,
  statusName: OptionalString,
  priorityId: z.union([z.string(), z.null()]).optional(),
  assigneeIds: z.array(z.string()).optional()
})

const TaskUpdate = z.object({
  taskId: requiredString('Task ID is required'),
  workspaceId: OptionalString,
  updates: z.object({
    name: OptionalString,
    description: OptionalPlainString,
    statusName: OptionalString,
    addAssigneeIds: z.array(z.string()).optional(),
    removeAssigneeIds: z.array(z.string()).optional(),
    priorityId: z.union([z.string(), z.null()]).optional(),
    dueDate: z.union([z.string(), z.null()]).optional()
  })
})

const TaskComment = z.object({
  taskId: requiredString('Task ID is required'),
  body: requiredString('Comment body is required'),
  workspaceId: OptionalString
})

const ListScope = z.object({
  listId: requiredString('List is required'),
  workspaceId: OptionalString
})

const AssignableUsers = z.object({
  listId: requiredString('List is required'),
  query: OptionalPlainString,
  workspaceId: OptionalString
})

export const CLICKUP_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'clickup.connect',
    params: Connect,
    handler: async (params, { runtime }) =>
      runtime.clickupConnect({ apiToken: params.apiToken.trim() })
  }),
  defineMethod({
    name: 'clickup.disconnect',
    params: AccountSelection,
    handler: async (params, { runtime }) => runtime.clickupDisconnect(params?.accountId)
  }),
  defineMethod({
    name: 'clickup.selectWorkspace',
    params: SelectWorkspace,
    handler: async (params, { runtime }) =>
      runtime.clickupSelectWorkspace(params.workspaceId.trim())
  }),
  defineMethod({
    name: 'clickup.status',
    params: null,
    handler: async (_params, { runtime }) => runtime.clickupStatus()
  }),
  defineMethod({
    name: 'clickup.readStatus',
    params: null,
    handler: async (_params, { runtime }) => runtime.clickupReadStatus()
  }),
  defineMethod({
    name: 'clickup.refreshWorkspaces',
    params: null,
    handler: async (_params, { runtime }) => runtime.clickupRefreshWorkspaces()
  }),
  defineMethod({
    name: 'clickup.testConnection',
    params: AccountSelection,
    handler: async (params, { runtime }) => runtime.clickupTestConnection(params?.accountId)
  }),
  defineMethod({
    name: 'clickup.searchTasks',
    params: SearchTasks,
    handler: async (params, { runtime, signal }) =>
      runtime.clickupSearchTasks(
        {
          query: params.query,
          filter: params.filter,
          limit: params.limit,
          workspaceId: params.workspaceId,
          listId: params.listId
        },
        signal
      )
  }),
  defineMethod({
    name: 'clickup.listTasks',
    params: TaskQuery,
    handler: async (params, { runtime }) =>
      runtime.clickupListTasks({
        filter: params?.filter,
        limit: params?.limit,
        workspaceId: params?.workspaceId,
        listId: params?.listId
      })
  }),
  defineMethod({
    name: 'clickup.getTask',
    params: TaskId,
    handler: async (params, { runtime }) =>
      runtime.clickupGetTask(params.taskId.trim(), params.workspaceId)
  }),
  defineMethod({
    name: 'clickup.lookupTaskSummary',
    params: TaskId,
    handler: async (params, { runtime, signal }) => {
      if (!params.workspaceId) {
        throw new Error('Workspace ID is required')
      }
      return runtime.clickupLookupTaskSummary(params.taskId.trim(), params.workspaceId, signal)
    }
  }),
  defineMethod({
    name: 'clickup.taskComments',
    params: TaskId,
    handler: async (params, { runtime }) =>
      runtime.clickupTaskComments(params.taskId.trim(), params.workspaceId)
  }),
  defineMethod({
    name: 'clickup.createTask',
    params: CreateTask,
    handler: async (params, { runtime }) =>
      runtime.clickupCreateTask({
        workspaceId: params.workspaceId,
        listId: params.listId.trim(),
        name: params.name.trim(),
        description: params.description?.trim() || undefined,
        statusName: params.statusName,
        priorityId: params.priorityId,
        assigneeIds: params.assigneeIds
      })
  }),
  defineMethod({
    name: 'clickup.updateTask',
    params: TaskUpdate,
    handler: async (params, { runtime }) =>
      runtime.clickupUpdateTask(params.taskId.trim(), params.updates, params.workspaceId)
  }),
  defineMethod({
    name: 'clickup.addTaskComment',
    params: TaskComment,
    handler: async (params, { runtime }) =>
      runtime.clickupAddTaskComment(params.taskId.trim(), params.body.trim(), params.workspaceId)
  }),
  defineMethod({
    name: 'clickup.listLists',
    params: WorkspaceSelection,
    handler: async (params, { runtime }) => runtime.clickupListLists(params?.workspaceId)
  }),
  defineMethod({
    name: 'clickup.listStatuses',
    params: ListScope,
    handler: async (params, { runtime }) =>
      runtime.clickupListStatuses(params.listId.trim(), params.workspaceId)
  }),
  defineMethod({
    name: 'clickup.listPriorities',
    params: null,
    handler: async (_params, { runtime }) => runtime.clickupListPriorities()
  }),
  defineMethod({
    name: 'clickup.listAssignableUsers',
    params: AssignableUsers,
    handler: async (params, { runtime }) =>
      runtime.clickupListAssignableUsers(params.listId.trim(), params.query, params.workspaceId)
  })
]
