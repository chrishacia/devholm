import type {
  PluginLifecycleActionAuthority,
  PluginLifecycleActionDecision,
  PluginLifecycleActionId,
} from '@core/lib/plugin-lifecycle-action-authority.server';
import type {
  CanonicalPluginStateAxes,
  CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';

export type PluginPresentationTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface PluginActionPresentation {
  id: PluginLifecycleActionId | 'inspect';
  label: string;
  explanation: string;
  destructive: boolean;
  approvalRequired: boolean;
}

export interface PluginBlockedActionPresentation {
  id: PluginLifecycleActionId;
  label: string;
  reasonCode: string | null;
  explanation: string;
  destructive: boolean;
}

export interface PluginRemediationPresentation {
  title: string;
  detail: string;
}

export interface PluginManagementPresentation {
  primaryStatus: {
    id: string;
    label: string;
    tone: PluginPresentationTone;
    explanation: string;
  };
  sourceLabel: string;
  versionSummary: string;
  primaryAction: PluginActionPresentation | null;
  secondaryActions: PluginActionPresentation[];
  blockedActions: PluginBlockedActionPresentation[];
  remediation: PluginRemediationPresentation | null;
  flags: {
    localOverride: boolean;
    pendingBuild: boolean;
    pendingDeployment: boolean;
    updateAvailable: boolean;
    rollbackAvailable: boolean;
    degraded: boolean;
    recoveryRequired: boolean;
  };
}

export interface PluginManagementPresentationInput {
  plugin: {
    name: string;
    installed: boolean;
    isEnabled: boolean;
    installedVersion: string | null;
    bundledVersion: string | null;
  };
  lifecycleState: {
    axes: CanonicalPluginStateAxes;
    summaryState: CanonicalPluginSummaryState;
  };
  actionAuthority: PluginLifecycleActionAuthority;
  sourceResolution: {
    configuredSourceKind: string;
    resolvedSourceKind: string | null;
    localOverrideEnabled: boolean;
  };
  trustPolicy: {
    outcome: 'allow' | 'deny' | 'unknown';
    reasonCode: string;
  };
  reconciliation: {
    action: string;
    message: string;
    remediation: string;
  };
  rollback: {
    eligible: boolean;
  };
  operation: {
    hasActive: boolean;
    recoveryRequired: boolean;
  };
  catalogEntry: {
    version: string;
  };
}

const ACTION_LABELS: Record<PluginLifecycleActionId | 'inspect', string> = {
  inspect: 'Inspect',
  install: 'Install',
  resolve: 'Resolve source',
  approve: 'Approve',
  build: 'Prepare build',
  deploy: 'Prepare deploy',
  activate: 'Activate',
  enable: 'Enable',
  disable: 'Disable',
  update: 'Update',
  rollback: 'Rollback',
  recover: 'Open recovery',
  retry: 'Retry',
  'take-over-expired-operation': 'Take over expired operation',
  'acknowledge-manual-intervention': 'Acknowledge manual intervention',
};

const PRIMARY_ACTION_PRIORITY: PluginLifecycleActionId[] = [
  'recover',
  'retry',
  'take-over-expired-operation',
  'acknowledge-manual-intervention',
  'install',
  'enable',
  'update',
  'rollback',
  'disable',
  'approve',
  'resolve',
  'build',
  'deploy',
  'activate',
];

function toActionPresentation(
  action: PluginLifecycleActionDecision | undefined
): PluginActionPresentation | null {
  if (!action?.enabled) {
    return null;
  }

  return {
    id: action.id,
    label: ACTION_LABELS[action.id],
    explanation: action.safeExplanation,
    destructive: action.destructive,
    approvalRequired: action.approvalRequired,
  };
}

function toBlockedActionPresentation(
  action: PluginLifecycleActionDecision
): PluginBlockedActionPresentation | null {
  if (action.enabled) {
    return null;
  }

  if (!['install', 'enable', 'disable', 'update', 'rollback', 'recover'].includes(action.id)) {
    return null;
  }

  return {
    id: action.id,
    label: ACTION_LABELS[action.id],
    reasonCode: action.reasonCode,
    explanation: action.safeExplanation,
    destructive: action.destructive,
  };
}

function buildSourceLabel(input: PluginManagementPresentationInput): string {
  if (input.sourceResolution.localOverrideEnabled) {
    return 'Local override';
  }

  switch (
    input.sourceResolution.resolvedSourceKind ??
    input.sourceResolution.configuredSourceKind
  ) {
    case 'bundled-fallback-artifact':
      return 'Bundled default';
    case 'local-development-checkout':
      return 'Local source';
    case 'marketplace':
      return 'Marketplace artifact';
    default:
      return 'Configured source';
  }
}

function buildVersionSummary(input: PluginManagementPresentationInput): string {
  const available = input.catalogEntry.version;
  const installed = input.plugin.installedVersion ?? 'not installed';

  if (installed === available) {
    return `v${installed}`;
  }

  return `Installed ${installed} • Available ${available}`;
}

function buildPrimaryStatus(
  input: PluginManagementPresentationInput
): PluginManagementPresentation['primaryStatus'] {
  const summary = input.lifecycleState.summaryState;

  switch (summary) {
    case 'recovery-required':
      return {
        id: summary,
        label: 'Needs recovery',
        tone: 'error',
        explanation:
          input.reconciliation.message || 'Recovery is required before safe changes can continue.',
      };
    case 'failed':
      return {
        id: summary,
        label: 'Failed',
        tone: 'error',
        explanation: 'A lifecycle, build, deployment, or runtime failure needs operator attention.',
      };
    case 'blocked':
      return {
        id: summary,
        label: 'Blocked',
        tone: 'warning',
        explanation:
          input.trustPolicy.outcome === 'deny'
            ? 'Trust or policy requirements are blocking this plugin.'
            : 'A required gate is blocking this plugin.',
      };
    case 'incompatible':
      return {
        id: summary,
        label: 'Incompatible',
        tone: 'warning',
        explanation: 'This plugin is not compatible with the current site or framework version.',
      };
    case 'updating':
    case 'building':
    case 'deploying':
    case 'activating':
      return {
        id: summary,
        label: 'In progress',
        tone: 'info',
        explanation:
          'A lifecycle operation is currently moving this plugin toward its desired state.',
      };
    case 'build-pending':
      return {
        id: summary,
        label: 'Pending build',
        tone: 'info',
        explanation:
          'The current plugin configuration has not yet been included in a build artifact.',
      };
    case 'deploy-pending':
      return {
        id: summary,
        label: 'Pending deployment',
        tone: 'info',
        explanation: 'A build is ready, but the current state is not yet deployed to production.',
      };
    case 'degraded':
      return {
        id: summary,
        label: 'Degraded',
        tone: 'warning',
        explanation:
          'The plugin is present but diagnostics show degraded behavior or incomplete health.',
      };
    case 'active':
      return {
        id: summary,
        label: 'Active',
        tone: 'success',
        explanation:
          'This plugin is built, deployed, enabled, and currently serving its runtime role.',
      };
    case 'disabled':
      return {
        id: summary,
        label: 'Disabled',
        tone: 'neutral',
        explanation: 'The plugin is installed but not active at runtime.',
      };
    case 'rollback-available':
      return {
        id: summary,
        label: 'Rollback available',
        tone: 'warning',
        explanation: 'A previously successful version can be restored if rollback is needed.',
      };
    case 'update-available':
      return {
        id: summary,
        label: 'Update available',
        tone: 'info',
        explanation: 'A newer eligible version is available for this plugin.',
      };
    case 'configured':
    case 'resolved':
    case 'verified':
    case 'build-included':
    case 'deployed':
      return {
        id: summary,
        label: input.plugin.installed ? 'Installed' : 'Available',
        tone: input.plugin.installed ? 'neutral' : 'info',
        explanation: input.plugin.installed
          ? 'This plugin is configured and recognized, but not yet active in the current runtime state.'
          : 'This plugin is available to configure or install.',
      };
    case 'awaiting-approval':
      return {
        id: summary,
        label: 'Needs approval',
        tone: 'warning',
        explanation:
          'Trust or approval requirements must be satisfied before this plugin can proceed.',
      };
    default:
      return {
        id: summary,
        label: 'Needs review',
        tone: 'warning',
        explanation: 'This plugin is in an uncommon state and should be reviewed in diagnostics.',
      };
  }
}

function buildRemediation(
  input: PluginManagementPresentationInput,
  blockedActions: PluginBlockedActionPresentation[]
): PluginRemediationPresentation | null {
  if (input.operation.recoveryRequired) {
    return {
      title: 'Recovery required',
      detail: input.reconciliation.remediation,
    };
  }

  const firstBlocked = blockedActions[0];
  if (!firstBlocked) {
    return null;
  }

  return {
    title: `Why ${firstBlocked.label.toLowerCase()} is blocked`,
    detail: firstBlocked.explanation,
  };
}

export function derivePluginManagementPresentation(
  input: PluginManagementPresentationInput
): PluginManagementPresentation {
  const availableById = new Map(
    input.actionAuthority.available.map((action) => [action.id, action])
  );

  const primaryAction =
    PRIMARY_ACTION_PRIORITY.map((actionId) =>
      toActionPresentation(availableById.get(actionId))
    ).find((action): action is PluginActionPresentation => Boolean(action)) ?? null;

  const secondaryActions = [
    {
      id: 'inspect' as const,
      label: ACTION_LABELS.inspect,
      explanation: 'Open details, diagnostics, and advanced state information.',
      destructive: false,
      approvalRequired: false,
    },
    ...input.actionAuthority.available
      .filter((action) => action.id !== primaryAction?.id)
      .map((action) => toActionPresentation(action))
      .filter((action): action is PluginActionPresentation => Boolean(action)),
  ];

  const blockedActions = Object.values(input.actionAuthority.byId)
    .map((action) => toBlockedActionPresentation(action))
    .filter((action): action is PluginBlockedActionPresentation => Boolean(action));

  return {
    primaryStatus: buildPrimaryStatus(input),
    sourceLabel: buildSourceLabel(input),
    versionSummary: buildVersionSummary(input),
    primaryAction,
    secondaryActions,
    blockedActions,
    remediation: buildRemediation(input, blockedActions),
    flags: {
      localOverride: input.sourceResolution.localOverrideEnabled,
      pendingBuild: input.lifecycleState.summaryState === 'build-pending',
      pendingDeployment: input.lifecycleState.summaryState === 'deploy-pending',
      updateAvailable: input.lifecycleState.summaryState === 'update-available',
      rollbackAvailable: input.rollback.eligible,
      degraded: input.lifecycleState.summaryState === 'degraded',
      recoveryRequired: input.operation.recoveryRequired,
    },
  };
}
