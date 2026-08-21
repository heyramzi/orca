import { describe, expect, it } from 'vitest'
import { AI_VAULT_TITLE_AGENTS } from '../../shared/ai-vault-session-title'
import { parseWorkspaceSession } from '../../shared/workspace-session-schema'
import { parseAiVaultSessionTitlesResult } from './session-title-result-validation'

function sessionWithTabTitle(agent: string): unknown {
  return {
    activeRepoId: null,
    activeWorktreeId: 'wt',
    activeTabId: 'tab1',
    tabsByWorktree: {
      wt: [
        {
          id: 'tab1',
          ptyId: null,
          worktreeId: 'wt',
          title: 'Terminal 1',
          aiVaultTitle: { agent, sessionId: 'session-1', title: 'Ship the release notes' },
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 0
        }
      ]
    },
    terminalLayoutsByTabId: {}
  }
}

describe('AI Vault session title agents', () => {
  // Why: the title survives three boundaries — the host result, the persisted
  // session, and the type. An agent added to only one of them loses its tab
  // title silently, either on the wire or on the next launch.
  it.each(AI_VAULT_TITLE_AGENTS)('carries a %s title across host and disk', (agent) => {
    expect(
      parseAiVaultSessionTitlesResult({
        titles: [{ agent, sessionId: 'session-1', title: 'Ship the release notes' }]
      })
    ).toEqual({ titles: [{ agent, sessionId: 'session-1', title: 'Ship the release notes' }] })

    const result = parseWorkspaceSession(sessionWithTabTitle(agent))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tabsByWorktree.wt[0].aiVaultTitle).toEqual({
        agent,
        sessionId: 'session-1',
        title: 'Ship the release notes'
      })
    }
  })

  it('rejects a host title for an agent this build does not title tabs with', () => {
    expect(() =>
      parseAiVaultSessionTitlesResult({
        titles: [{ agent: 'gemini', sessionId: 'session-1', title: 'First prompt text' }]
      })
    ).toThrow()
  })
})
