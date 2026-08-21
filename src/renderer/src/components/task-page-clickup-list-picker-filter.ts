import { isClipboardTextByteLengthOverLimit } from '../../../shared/clipboard-text'
import type { ClickUpList } from '../../../shared/clickup-types'

export const CLICKUP_LIST_PICKER_QUERY_MAX_BYTES = 2 * 1024

export function isClickUpListPickerQueryTooLarge(
  query: string,
  maxBytes = CLICKUP_LIST_PICKER_QUERY_MAX_BYTES
): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}

// A List name alone is rarely unique in a ClickUp Workspace ("Sprint 5" repeats
// per Space), so the picker always shows the Space and Folder that own it.
export function getClickUpListPickerDisplayLabel(
  list: ClickUpList,
  includeWorkspaceName: boolean
): string {
  const path = [list.spaceName, list.folderName ?? null, list.name]
    .filter((part): part is string => Boolean(part))
    .join(' / ')
  if (includeWorkspaceName && list.workspaceName) {
    return `${list.workspaceName} · ${path}`
  }
  return path
}

function getClickUpListPickerSearchText(list: ClickUpList, includeWorkspaceName: boolean): string {
  return [
    getClickUpListPickerDisplayLabel(list, includeWorkspaceName),
    list.name,
    list.spaceName,
    list.folderName ?? '',
    list.workspaceName ?? ''
  ]
    .join(' ')
    .toLocaleLowerCase()
}

export function filterClickUpListPickerLists({
  lists,
  query,
  includeWorkspaceName
}: {
  lists: readonly ClickUpList[]
  query: string
  includeWorkspaceName: boolean
}): ClickUpList[] {
  if (isClickUpListPickerQueryTooLarge(query)) {
    return []
  }
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return [...lists]
  }
  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  return lists.filter((list) =>
    getClickUpListPickerSearchText(list, includeWorkspaceName).includes(normalizedQuery)
  )
}

export function getClickUpListSelectionKey(list: ClickUpList): string {
  return `${list.workspaceId}:${list.id}`
}

const clickUpListLabelCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

export function compareClickUpListsByDisplayLabel(
  a: ClickUpList,
  b: ClickUpList,
  includeWorkspaceName: boolean
): number {
  return clickUpListLabelCollator.compare(
    getClickUpListPickerDisplayLabel(a, includeWorkspaceName),
    getClickUpListPickerDisplayLabel(b, includeWorkspaceName)
  )
}
