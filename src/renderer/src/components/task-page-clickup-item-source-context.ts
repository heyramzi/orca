import type { ClickUpTask, ClickUpWorkspace } from '../../../shared/clickup-types'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../../shared/task-source-context'

export function bindTaskPageClickUpItemSourceContext(args: {
  task: ClickUpTask
  workspaces: readonly ClickUpWorkspace[]
  sourceContext: TaskSourceContext | null
}): TaskSourceContext | null {
  if (args.sourceContext?.provider !== 'clickup' || !args.task.workspaceId) {
    return null
  }
  const workspace = args.workspaces.find((candidate) => candidate.id === args.task.workspaceId)
  if (!workspace) {
    return null
  }
  return normalizeTaskSourceContext({
    ...args.sourceContext,
    providerIdentity: {
      provider: 'clickup',
      workspaceId: workspace.id,
      spaceId: args.task.list.spaceId,
      listId: args.task.list.id
    },
    accountLabel: workspace.name
  })
}
