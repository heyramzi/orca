import { useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, Unlink } from 'lucide-react'
import { ClickUpConnectDialog } from '@/components/clickup-connect-dialog'
import { ClickUpIcon } from '@/components/icons/ClickUpIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  getProviderRuntimeContextKey,
  hasRemoteProviderRuntime
} from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { CLICKUP_INTEGRATION_SECTION_ID } from './task-provider-integration-section-ids'
import { translate } from '@/i18n/i18n'

type VerificationResult = { state: 'ok' | 'error'; error?: string }

export function ClickUpIntegrationCard(): React.JSX.Element {
  const clickupStatus = useAppStore((s) => s.clickupStatus)
  const clickupStatusChecked = useAppStore((s) => s.clickupStatusChecked)
  const clickupStatusContextKey = useAppStore((s) => s.clickupStatusContextKey)
  const checkClickUpConnection = useAppStore((s) => s.checkClickUpConnection)
  const disconnectClickUp = useAppStore((s) => s.disconnectClickUp)
  const testClickUpConnection = useAppStore((s) => s.testClickUpConnection)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null)
  const [testResultByAccount, setTestResultByAccount] = useState<
    Record<string, VerificationResult>
  >({})

  const contextMatches = clickupStatusContextKey === getProviderRuntimeContextKey(settings)
  const checking = !contextMatches || !clickupStatusChecked
  const connected = contextMatches && clickupStatus.connected
  const accounts = clickupStatus.accounts ?? []
  const workspaces = clickupStatus.workspaces ?? []
  const workspaceCount = workspaces.length
  const accountScope = getProviderAccountScope(settings)
  const credentialCopy = hasRemoteProviderRuntime(settings)
    ? translate(
        'auto.components.settings.clickup.integration.card.credentials_remote',
        'Connect ClickUp with a personal API token from Settings → Apps. Credentials are sent to the selected remote runtime and stored there with runtime-supported encryption.'
      )
    : translate(
        'auto.components.settings.clickup.integration.card.credentials_local',
        'Connect ClickUp with a personal API token from Settings → Apps. Credentials are stored locally and encrypted when local runtime storage supports it.'
      )
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const accountScopeRowClass = useIntegrationSubordinateRowClass('text-xs')

  const handleDisconnect = async (accountId?: string): Promise<void> => {
    await disconnectClickUp(accountId)
    if (mountedRef.current) {
      setTestResultByAccount({})
    }
  }

  // Why: explicit user-triggered verification. This is the only settings path
  // that decrypts a stored ClickUp token, avoiding surprise keychain prompts.
  const handleTest = async (accountId: string): Promise<void> => {
    setTestingAccountId(accountId)
    setTestResultByAccount((prev) => {
      const next = { ...prev }
      delete next[accountId]
      return next
    })
    const result = await testClickUpConnection(accountId)
    if (!mountedRef.current) {
      return
    }
    setTestResultByAccount((prev) => ({
      ...prev,
      [accountId]: result.ok ? { state: 'ok' } : { state: 'error', error: result.error }
    }))
    setTestingAccountId(null)
  }

  const workspaceSummary = (accountId: string): string => {
    const owned = workspaces.filter((workspace) => workspace.accountId === accountId)
    return owned.length > 0
      ? owned.map((workspace) => workspace.name).join(', ')
      : translate(
          'auto.components.settings.clickup.integration.card.no_workspaces',
          'No Workspaces reachable'
        )
  }

  return (
    <IntegrationCardShell
      settingsSectionId={CLICKUP_INTEGRATION_SECTION_ID}
      icon={<ClickUpIcon className="size-5" />}
      name="ClickUp"
      description={
        connected
          ? translate(
              'auto.components.settings.clickup.integration.card.connected_count',
              '{{value0}} Workspace{{value1}} connected',
              { value0: workspaceCount, value1: workspaceCount === 1 ? '' : 's' }
            )
          : checking
            ? translate(
                'auto.components.settings.clickup.integration.card.checking',
                'Checking ClickUp access before showing setup actions.'
              )
            : translate(
                'auto.components.settings.clickup.integration.card.summary',
                'Browse, create, and start work from ClickUp tasks.'
              )
      }
      checking={checking}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={
        connected
          ? translate(
              'auto.components.settings.clickup.integration.card.statusConnected',
              'Connected'
            )
          : translate(
              'auto.components.settings.clickup.integration.card.statusNotConnected',
              'Not connected'
            )
      }
      actions={
        !checking ? (
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {connected
              ? translate(
                  'auto.components.settings.clickup.integration.card.add_account',
                  'Add ClickUp account'
                )
              : translate(
                  'auto.components.settings.clickup.integration.card.connect',
                  'Connect ClickUp'
                )}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        <ProviderHostScopeControl
          labelPrefix={translate(
            'auto.components.settings.task.tracker.integration.cards.account_scope_prefix',
            'Account scope'
          )}
          scope={accountScope}
          className={accountScopeRowClass}
        />
        {connected && accounts.length > 0 ? (
          <div className="space-y-2">
            {accounts.map((account) => {
              const testResult = testResultByAccount[account.id]
              const testing = testingAccountId === account.id
              return (
                <div key={account.id} className={subordinateRowClass}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {account.username}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {workspaceSummary(account.id)}
                      {account.email ? ` · ${account.email}` : ''}
                    </p>
                  </div>
                  {testResult?.state === 'ok' ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-status-success">
                      <CheckCircle2 className="size-3.5" />
                      {translate(
                        'auto.components.settings.task.tracker.integration.cards.a2c0015fb8',
                        'Verified'
                      )}
                    </span>
                  ) : null}
                  {testResult?.state === 'error' ? (
                    <span className="flex min-w-0 max-w-[220px] shrink items-center gap-1 truncate text-xs text-destructive">
                      <AlertCircle className="size-3.5 shrink-0" />
                      <span className="truncate">{testResult.error}</span>
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTest(account.id)}
                    disabled={testing}
                  >
                    {testing ? (
                      <>
                        <LoaderCircle className="size-3.5 mr-1.5 animate-spin" />
                        {translate(
                          'auto.components.settings.task.tracker.integration.cards.3e7c10d286',
                          'Testing...'
                        )}
                      </>
                    ) : (
                      translate(
                        'auto.components.settings.task.tracker.integration.cards.c24e56c532',
                        'Test'
                      )
                    )}
                  </Button>
                  <button
                    onClick={() => void handleDisconnect(account.id)}
                    aria-label={translate(
                      'auto.components.settings.task.tracker.integration.cards.dd3529015d',
                      'Disconnect {{value0}}',
                      { value0: account.username }
                    )}
                    className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                  >
                    <Unlink className="size-3.5" />
                  </button>
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground/70">
              {translate(
                'auto.components.settings.clickup.integration.card.token_note',
                'Each connected ClickUp account has one token stored by the active runtime. It reaches every Workspace, Space, and List that account can open.'
              )}
            </p>
          </div>
        ) : !checking ? (
          <>
            <p className="text-xs text-muted-foreground">{credentialCopy}</p>
            <Button variant="ghost" size="sm" onClick={() => void checkClickUpConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
          </>
        ) : null}
      </IntegrationCardDetails>

      <ClickUpConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={() => setTestResultByAccount({})}
        overlayClassName="z-[110]"
        contentClassName="z-[120]"
      />
    </IntegrationCardShell>
  )
}
