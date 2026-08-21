import type { AppState } from '../types'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { ClickUpTask } from '../../../../shared/clickup-types'
import type { InflightClickUpRead, SharedClickUpSummaryRequest } from './clickup-read-scope'

export const inflightTaskRequests = new Map<string, InflightClickUpRead<ClickUpTask | null>>()
export const inflightTaskSummaryRequests = new Map<string, SharedClickUpSummaryRequest>()
export const inflightSearchRequests = new Map<string, InflightClickUpRead<ClickUpTask[]>>()
export const inflightListRequests = new Map<string, InflightClickUpRead<ClickUpTask[]>>()

let statusReadGeneration = 0
let mutationGeneration = 0

export function clearClickUpInflight(): void {
  for (const entry of inflightTaskSummaryRequests.values()) {
    entry.controller.abort()
  }
  inflightTaskRequests.clear()
  inflightTaskSummaryRequests.clear()
  inflightSearchRequests.clear()
  inflightListRequests.clear()
}

export function beginClickUpMutation(): number {
  mutationGeneration += 1
  return mutationGeneration
}

export function currentClickUpMutation(): number {
  return mutationGeneration
}

export function isCurrentClickUpMutation(generation: number): boolean {
  return generation === mutationGeneration
}

export function beginClickUpStatusRead(): number {
  statusReadGeneration += 1
  return statusReadGeneration
}

export function isCurrentClickUpStatusRead(generation: number): boolean {
  return generation === statusReadGeneration
}

export function isCurrentClickUpRuntimeContext(
  contextKey: string,
  settings: AppState['settings']
): boolean {
  return getProviderRuntimeContextKey(settings) === contextKey
}

export function canWriteClickUpReadResult(
  contextKey: string,
  generation: number,
  settings: AppState['settings'],
  explicitSource = false
): boolean {
  return (
    generation === mutationGeneration &&
    (explicitSource || isCurrentClickUpRuntimeContext(contextKey, settings))
  )
}
