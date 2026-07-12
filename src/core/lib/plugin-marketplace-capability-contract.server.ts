import type {
  MarketplaceCapabilityContractEvaluation,
  MarketplaceCapabilityEscalation,
  MarketplaceCapabilitySnapshot,
} from '@core/types/plugin-marketplace-capability-contract';

const PROHIBITED_CAPABILITY_TOKENS = [
  'process',
  'exec',
  'shell',
  'filesystem',
  'secret',
  'unrestricted-network',
  'migration',
  'lifecycle',
  'background-job',
  'scheduled-job',
  'cron',
];
const PRIVILEGED_REVIEW_TOKENS = ['admin', 'api', 'auth'];

function normalized(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function addedValues(previous: string[], next: string[]): string[] {
  const previousSet = new Set(previous);
  return next.filter((value) => !previousSet.has(value));
}

function pushEscalation(
  escalations: MarketplaceCapabilityEscalation[],
  field: MarketplaceCapabilityEscalation['field'],
  added: string[],
  level: MarketplaceCapabilityEscalation['level'],
  reason: string
): void {
  if (added.length === 0) {
    return;
  }

  escalations.push({
    field,
    added,
    level,
    reason,
  });
}

function matchingTokenValues(values: string[], tokens: string[]): string[] {
  return values.filter((value) => {
    const lower = value.toLowerCase();
    return tokens.some((token) => lower.includes(token));
  });
}

function evaluateStaticPolicy(candidateSnapshot: MarketplaceCapabilitySnapshot): {
  blockers: string[];
  approvals: string[];
} {
  const blockers: string[] = [];
  const approvals: string[] = [];

  const prohibitedCapabilities = matchingTokenValues(
    normalized(candidateSnapshot.capabilities),
    PROHIBITED_CAPABILITY_TOKENS
  );
  if (prohibitedCapabilities.length > 0) {
    blockers.push(
      `capabilities include prohibited tokens in this phase: ${prohibitedCapabilities.join(', ')}`
    );
  }

  const prohibitedPermissionKeys = matchingTokenValues(
    normalized(candidateSnapshot.permissionKeys),
    PROHIBITED_CAPABILITY_TOKENS
  );
  if (prohibitedPermissionKeys.length > 0) {
    blockers.push(
      `permission keys include prohibited tokens in this phase: ${prohibitedPermissionKeys.join(', ')}`
    );
  }

  const privilegedCapabilities = matchingTokenValues(
    normalized(candidateSnapshot.capabilities),
    PRIVILEGED_REVIEW_TOKENS
  );
  if (privilegedCapabilities.length > 0) {
    approvals.push(
      `privileged capability declarations require review: ${privilegedCapabilities.join(', ')}`
    );
  }

  return { blockers, approvals };
}

export function evaluateMarketplaceCapabilityContract(
  previousSnapshot: MarketplaceCapabilitySnapshot | null,
  candidateSnapshot: MarketplaceCapabilitySnapshot
): MarketplaceCapabilityContractEvaluation {
  const staticPolicy = evaluateStaticPolicy(candidateSnapshot);

  if (!previousSnapshot) {
    return {
      hasEscalation: staticPolicy.approvals.length > 0 || staticPolicy.blockers.length > 0,
      escalations: [],
      approvals: staticPolicy.approvals,
      blockers: staticPolicy.blockers,
      summary:
        staticPolicy.approvals.length === 0 && staticPolicy.blockers.length === 0
          ? 'no prior capability snapshot; treating as first install baseline'
          : `first install requires policy review: ${staticPolicy.approvals.length} approval item(s), ${staticPolicy.blockers.length} blocker(s)`,
    };
  }

  const escalations: MarketplaceCapabilityEscalation[] = [];

  pushEscalation(
    escalations,
    'permissionKeys',
    addedValues(
      normalized(previousSnapshot.permissionKeys),
      normalized(candidateSnapshot.permissionKeys)
    ),
    'approval-required',
    'new permission keys introduced'
  );

  pushEscalation(
    escalations,
    'capabilities',
    addedValues(
      normalized(previousSnapshot.capabilities),
      normalized(candidateSnapshot.capabilities)
    ),
    'approval-required',
    'new capabilities introduced'
  );

  const addedScopes = addedValues(
    normalized(previousSnapshot.scopes),
    normalized(candidateSnapshot.scopes)
  );
  const blockedScopes = addedScopes.filter((scope) => scope === 'policy-scoped');
  const approvalScopes = addedScopes.filter((scope) => scope !== 'policy-scoped');
  pushEscalation(
    escalations,
    'scopes',
    approvalScopes,
    'approval-required',
    'new permission scopes introduced'
  );
  pushEscalation(
    escalations,
    'scopes',
    blockedScopes,
    'blocked',
    'policy-scoped permission expansion requires explicit policy rollout and is blocked in this phase'
  );

  pushEscalation(
    escalations,
    'publicRouteExtensionIds',
    addedValues(
      normalized(previousSnapshot.publicRouteExtensionIds),
      normalized(candidateSnapshot.publicRouteExtensionIds)
    ),
    'approval-required',
    'new public route extension declarations introduced'
  );

  pushEscalation(
    escalations,
    'adminPageHrefs',
    addedValues(
      normalized(previousSnapshot.adminPageHrefs),
      normalized(candidateSnapshot.adminPageHrefs)
    ),
    'approval-required',
    'new admin page declarations introduced'
  );

  pushEscalation(
    escalations,
    'apiPaths',
    addedValues(normalized(previousSnapshot.apiPaths), normalized(candidateSnapshot.apiPaths)),
    'approval-required',
    'new API path declarations introduced'
  );

  pushEscalation(
    escalations,
    'settingKeys',
    addedValues(
      normalized(previousSnapshot.settingKeys),
      normalized(candidateSnapshot.settingKeys)
    ),
    'approval-required',
    'new setting declarations introduced'
  );

  const approvals = escalations
    .filter((item) => item.level === 'approval-required')
    .map((item) => `${item.field}: ${item.reason} (${item.added.join(', ')})`)
    .concat(staticPolicy.approvals);
  const blockers = escalations
    .filter((item) => item.level === 'blocked')
    .map((item) => `${item.field}: ${item.reason} (${item.added.join(', ')})`)
    .concat(staticPolicy.blockers);

  return {
    hasEscalation: escalations.length > 0,
    escalations,
    approvals,
    blockers,
    summary:
      escalations.length === 0
        ? 'no capability escalation detected compared with installed snapshot'
        : `capability escalation detected: ${approvals.length} approval item(s), ${blockers.length} blocker(s)`,
  };
}
