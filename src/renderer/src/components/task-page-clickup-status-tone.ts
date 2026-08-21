import type { ClickUpStatusType } from '../../../shared/clickup-types'

export function getClickUpStatusTone(statusType: ClickUpStatusType): string {
  if (statusType === 'done' || statusType === 'closed') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
  }
  if (statusType === 'custom') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200'
  }
  return 'border-border/50 bg-muted/40 text-muted-foreground'
}
