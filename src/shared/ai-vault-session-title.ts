import type { AiVaultAgent } from './ai-vault-types'
import type { ExecutionHostId } from './execution-host'

export const AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT = 64

/** Agents whose transcripts carry a session name the agent itself wrote:
 *  Claude `ai-title`, the Codex session index, Grok `generated_title`, and the
 *  OpenCode / Droid / Kimi session `title`. Only those may retitle a tab —
 *  every other parser derives its title from the first user message, which the
 *  generated-title path already covers with cleaner text. */
export const AI_VAULT_TITLE_AGENTS = [
  'claude',
  'codex',
  'droid',
  'grok',
  'kimi',
  'opencode'
] as const satisfies readonly AiVaultAgent[]

export type AiVaultTitleAgent = (typeof AI_VAULT_TITLE_AGENTS)[number]

export type AiVaultSessionTitle = {
  agent: AiVaultTitleAgent
  sessionId: string
  title: string
}

export type AiVaultSessionTitleRequest = {
  agent: AiVaultSessionTitle['agent']
  sessionId: string
  transcriptPath?: string
}

export type AiVaultSessionTitlesArgs = {
  executionHostScope?: ExecutionHostId
  requests: AiVaultSessionTitleRequest[]
}

export type AiVaultSessionTitlesResult = {
  titles: AiVaultSessionTitle[]
}

const AI_VAULT_TITLE_AGENT_SET: ReadonlySet<string> = new Set(AI_VAULT_TITLE_AGENTS)

export function isAiVaultTitleAgent(agent: unknown): agent is AiVaultSessionTitle['agent'] {
  return typeof agent === 'string' && AI_VAULT_TITLE_AGENT_SET.has(agent)
}
