import type {
  MarketplaceCapabilityContractEvaluation,
  MarketplaceCapabilityEscalation,
  MarketplaceCapabilitySnapshot,
} from '@core/types/plugin-marketplace-capability-contract';

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

export function evaluateMarketplaceCapabilityContract(
  previousSnapshot: MarketplaceCapabilitySnapshot | null,
  candidateSnapshot: MarketplaceCapabilitySnapshot
): MarketplaceCapabilityContractEvaluation {
  if (!previousSnapshot) {
    return {
      hasEscalation: false,
      escalations: [],
      approvals: [],
      blockers: [],
      summary: 'no prior capability snapshot; treating as first install baseline',
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
    .map((item) => `${item.field}: ${item.reason} (${item.added.join(', ')})`);
  const blockers = escalations
    .filter((item) => item.level === 'blocked')
    .map((item) => `${item.field}: ${item.reason} (${item.added.join(', ')})`);

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
