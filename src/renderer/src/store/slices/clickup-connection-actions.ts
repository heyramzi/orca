import type { AppState } from '../types'
import type { ClickUpConnectionStatus } from '../../../../shared/clickup-types'
import { translate } from '@/i18n/i18n'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  clickupConnect,
  clickupDisconnect,
  clickupRefreshWorkspaces,
  clickupSelectWorkspace,
  clickupStatus,
  clickupTestConnection
} from '@/runtime/runtime-clickup-client'
import {
  beginClickUpMutation,
  beginClickUpStatusRead,
  clearClickUpInflight,
  currentClickUpMutation,
  isCurrentClickUpMutation,
  isCurrentClickUpRuntimeContext,
  isCurrentClickUpStatusRead
} from './clickup-read-registry'
import { getSelectedWorkspaceId, nextClickUpConnectionRevisions } from './clickup-read-scope'
import type { ClickUpSlice } from './clickup-slice-types'

type Set = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
type Get = () => AppState

const EMPTY_CLICKUP_READ_CACHES = {
  clickupTaskCache: {},
  clickupTaskSummaryCache: {},
  clickupSearchCache: {}
} satisfies Partial<ClickUpSlice>

const DISCONNECTED: ClickUpConnectionStatus = { connected: false, viewer: null }

/** Status write that also bumps the revision watchers use to re-read a lazily-loaded status. */
export function clickupStatusUpdate(
  state: AppState,
  contextKey: string,
  status: ClickUpConnectionStatus,
  extra?: Partial<ClickUpSlice>
): Partial<ClickUpSlice> {
  return {
    clickupStatus: status,
    clickupStatusChecked: true,
    clickupStatusContextKey: contextKey,
    clickupConnectionRevisions: nextClickUpConnectionRevisions(
      state.clickupConnectionRevisions,
      contextKey
    ),
    ...extra
  }
}

function statusChanged(prev: ClickUpConnectionStatus, next: ClickUpConnectionStatus): boolean {
  return (
    prev.connected !== next.connected ||
    prev.credentialError !== next.credentialError ||
    prev.viewer?.userId !== next.viewer?.userId ||
    getSelectedWorkspaceId(prev) !== getSelectedWorkspaceId(next) ||
    (prev.workspaces?.length ?? 0) !== (next.workspaces?.length ?? 0) ||
    (prev.accounts?.length ?? 0) !== (next.accounts?.length ?? 0)
  )
}

function settleStatus(set: Set, get: Get, contextKey: string, status: ClickUpConnectionStatus): void {
  if (statusChanged(get().clickupStatus, status)) {
    set((state) => clickupStatusUpdate(state, contextKey, status))
    return
  }
  if (!get().clickupStatusChecked) {
    set({ clickupStatusChecked: true, clickupStatusContextKey: contextKey })
    return
  }
  if (get().clickupStatusContextKey !== contextKey) {
    set({ clickupStatusContextKey: contextKey })
  }
}

export function createClickUpConnectionActions(
  set: Set,
  get: Get
): Pick<
  ClickUpSlice,
  | 'checkClickUpConnection'
  | 'connectClickUp'
  | 'testClickUpConnection'
  | 'selectClickUpWorkspace'
  | 'refreshClickUpWorkspaces'
  | 'disconnectClickUp'
> {
  const stillCurrent = (contextKey: string, generation: number, readGeneration: number): boolean =>
    isCurrentClickUpMutation(generation) &&
    isCurrentClickUpStatusRead(readGeneration) &&
    getProviderRuntimeContextKey(get().settings) === contextKey

  return {
    checkClickUpConnection: async () => {
      const contextKey = getProviderRuntimeContextKey(get().settings)
      const readGeneration = beginClickUpStatusRead()
      const generation = currentClickUpMutation()
      if (get().clickupStatusContextKey !== contextKey) {
        set({ clickupStatusChecked: false })
      }
      try {
        const status = await clickupStatus(get().settings)
        if (stillCurrent(contextKey, generation, readGeneration)) {
          settleStatus(set, get, contextKey, status)
        }
      } catch {
        if (!stillCurrent(contextKey, generation, readGeneration)) {
          return
        }
        if (get().clickupStatus.connected) {
          set((state) => clickupStatusUpdate(state, contextKey, DISCONNECTED))
          return
        }
        settleStatus(set, get, contextKey, get().clickupStatus)
      }
    },

    connectClickUp: async (args) => {
      const generation = beginClickUpMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      try {
        const result = await clickupConnect(get().settings, args)
        if (!result.ok) {
          return result
        }
        if (
          !isCurrentClickUpMutation(generation) ||
          !isCurrentClickUpRuntimeContext(contextKey, get().settings)
        ) {
          return {
            ok: false as const,
            error: translate(
              'auto.store.slices.clickup.connect_superseded',
              'ClickUp connection was superseded by a newer request.'
            )
          }
        }
        set((state) =>
          clickupStatusUpdate(state, contextKey, { connected: true, viewer: result.viewer })
        )
        void get().checkClickUpConnection()
        return result
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Connection failed'
        }
      }
    },

    testClickUpConnection: async (accountId) => {
      const generation = beginClickUpMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      try {
        const result = await clickupTestConnection(get().settings, accountId)
        if (
          !isCurrentClickUpMutation(generation) ||
          !isCurrentClickUpRuntimeContext(contextKey, get().settings)
        ) {
          return result
        }
        const status = await clickupStatus(get().settings)
        if (
          isCurrentClickUpMutation(generation) &&
          isCurrentClickUpRuntimeContext(contextKey, get().settings)
        ) {
          set((state) => clickupStatusUpdate(state, contextKey, status))
        }
        return result
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : 'Test failed' }
      }
    },

    selectClickUpWorkspace: async (workspaceId) => {
      const generation = beginClickUpMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      const status = await clickupSelectWorkspace(get().settings, workspaceId)
      if (
        !isCurrentClickUpMutation(generation) ||
        getProviderRuntimeContextKey(get().settings) !== contextKey
      ) {
        return
      }
      clearClickUpInflight()
      set((state) =>
        clickupStatusUpdate(state, contextKey, status, EMPTY_CLICKUP_READ_CACHES)
      )
    },

    refreshClickUpWorkspaces: async () => {
      const generation = beginClickUpMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      const status = await clickupRefreshWorkspaces(get().settings)
      if (
        !isCurrentClickUpMutation(generation) ||
        getProviderRuntimeContextKey(get().settings) !== contextKey
      ) {
        return
      }
      clearClickUpInflight()
      set((state) =>
        clickupStatusUpdate(state, contextKey, status, EMPTY_CLICKUP_READ_CACHES)
      )
    },

    disconnectClickUp: async (accountId) => {
      const generation = beginClickUpMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      await clickupDisconnect(get().settings, accountId)
      if (
        !isCurrentClickUpMutation(generation) ||
        !isCurrentClickUpRuntimeContext(contextKey, get().settings)
      ) {
        return
      }
      clearClickUpInflight()
      const status = await clickupStatus(get().settings)
      if (
        !isCurrentClickUpMutation(generation) ||
        !isCurrentClickUpRuntimeContext(contextKey, get().settings)
      ) {
        return
      }
      set((state) =>
        clickupStatusUpdate(
          state,
          contextKey,
          status.connected ? status : DISCONNECTED,
          EMPTY_CLICKUP_READ_CACHES
        )
      )
    }
  }
}
