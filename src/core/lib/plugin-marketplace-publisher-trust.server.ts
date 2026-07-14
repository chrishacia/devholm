import type {
  MarketplacePublisherEnrollmentRecord,
  MarketplacePublisherTrustDecision,
  MarketplacePublisherTrustDecisionInput,
  MarketplacePublisherTrustPolicyDocument,
} from '@core/types/plugin-marketplace-contract';

const TRUST_POLICY_ENV = 'DEVHOLM_MARKETPLACE_PUBLISHER_TRUST_POLICY_JSON';
const FIRST_PARTY_PUBLISHER_ID = 'devholm-first-party';
const IDENTIFIER_RE = /^[A-Za-z0-9._:-]{2,128}$/;
const PUBLISHER_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function parseIsoTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function includesCaseInsensitive(
  values: readonly string[] | undefined,
  candidate: string
): boolean {
  if (!values || values.length === 0) {
    return true;
  }

  const normalizedCandidate = candidate.trim().toLowerCase();
  return values.some((value) => value.trim().toLowerCase() === normalizedCandidate);
}

function matchesNamespace(pluginId: string, namespaces: readonly string[] | undefined): boolean {
  if (!namespaces || namespaces.length === 0) {
    return true;
  }

  const normalizedPluginId = pluginId.trim().toLowerCase();
  return namespaces.some((namespace) => {
    const normalizedNamespace = namespace.trim().toLowerCase();
    if (!normalizedNamespace) {
      return false;
    }
    return (
      normalizedPluginId === normalizedNamespace ||
      normalizedPluginId.startsWith(`${normalizedNamespace}-`)
    );
  });
}

export function validateMarketplacePublisherTrustPolicyDocument(
  policy: MarketplacePublisherTrustPolicyDocument
): string[] {
  const errors: string[] = [];

  if (policy.policyVersion !== 1) {
    errors.push('policyVersion must be 1');
  }

  if (!policy.policySource.trim()) {
    errors.push('policySource is required');
  }

  if (parseIsoTimestamp(policy.updatedAt) === null) {
    errors.push('updatedAt must be a valid ISO timestamp');
  }

  const enrollmentIds = new Set<string>();
  const keyToPublisher = new Map<string, string>();

  for (const enrollment of policy.enrollments) {
    if (enrollment.policyVersion !== 1) {
      errors.push(`enrollment ${enrollment.enrollmentId || '<unknown>'} must use policyVersion=1`);
    }

    if (!IDENTIFIER_RE.test(enrollment.enrollmentId)) {
      errors.push(`enrollmentId is invalid: ${enrollment.enrollmentId}`);
    }

    if (enrollmentIds.has(enrollment.enrollmentId)) {
      errors.push(`duplicate enrollmentId is not allowed: ${enrollment.enrollmentId}`);
    }
    enrollmentIds.add(enrollment.enrollmentId);

    if (!PUBLISHER_ID_RE.test(enrollment.publisherId)) {
      errors.push(`publisherId is invalid: ${enrollment.publisherId}`);
    }

    if (!IDENTIFIER_RE.test(enrollment.signingKeyId)) {
      errors.push(`signingKeyId is invalid: ${enrollment.signingKeyId}`);
    }

    if (!IDENTIFIER_RE.test(enrollment.trustRootId)) {
      errors.push(`trustRootId is invalid: ${enrollment.trustRootId}`);
    }

    if (!enrollment.policySource.trim()) {
      errors.push(`enrollment ${enrollment.enrollmentId} is missing policySource`);
    }

    if (!enrollment.createdBy.trim() || !enrollment.updatedBy.trim()) {
      errors.push(`enrollment ${enrollment.enrollmentId} requires createdBy and updatedBy`);
    }

    const effectiveAt = parseIsoTimestamp(enrollment.effectiveAt);
    const expiresAt = enrollment.expiresAt ? parseIsoTimestamp(enrollment.expiresAt) : null;
    const revokedAt = enrollment.revokedAt ? parseIsoTimestamp(enrollment.revokedAt) : null;

    if (effectiveAt === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} has invalid effectiveAt`);
    }
    if (parseIsoTimestamp(enrollment.createdAt) === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} has invalid createdAt`);
    }
    if (parseIsoTimestamp(enrollment.updatedAt) === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} has invalid updatedAt`);
    }
    if (enrollment.expiresAt && expiresAt === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} has invalid expiresAt`);
    }
    if (enrollment.revokedAt && revokedAt === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} has invalid revokedAt`);
    }

    if (effectiveAt !== null && expiresAt !== null && expiresAt <= effectiveAt) {
      errors.push(`enrollment ${enrollment.enrollmentId} expiresAt must be after effectiveAt`);
    }

    if (enrollment.publisherStatus === 'revoked' && revokedAt === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} is revoked but revokedAt is missing`);
    }

    if (enrollment.keyStatus === 'revoked' && revokedAt === null) {
      errors.push(`enrollment ${enrollment.enrollmentId} keyStatus=revoked requires revokedAt`);
    }

    if (enrollment.revocationReason && !enrollment.revocationReason.trim()) {
      errors.push(`enrollment ${enrollment.enrollmentId} has empty revocationReason`);
    }

    const existingPublisherForKey = keyToPublisher.get(enrollment.signingKeyId);
    if (existingPublisherForKey && existingPublisherForKey !== enrollment.publisherId) {
      errors.push(
        `signingKeyId ${enrollment.signingKeyId} cannot be bound to multiple publishers (${existingPublisherForKey}, ${enrollment.publisherId})`
      );
    } else {
      keyToPublisher.set(enrollment.signingKeyId, enrollment.publisherId);
    }
  }

  return errors;
}

function currentEnrollmentState(
  enrollment: MarketplacePublisherEnrollmentRecord,
  evaluatedAtMs: number
): 'active' | 'expired' | 'revoked' | 'suspended' | 'misconfigured' {
  if (enrollment.publisherStatus === 'misconfigured') {
    return 'misconfigured';
  }

  if (enrollment.publisherStatus === 'suspended') {
    return 'suspended';
  }

  if (enrollment.publisherStatus === 'revoked' || enrollment.keyStatus === 'revoked') {
    return 'revoked';
  }

  const effectiveAt = parseIsoTimestamp(enrollment.effectiveAt);
  const expiresAt = enrollment.expiresAt ? parseIsoTimestamp(enrollment.expiresAt) : null;

  if (effectiveAt === null || (enrollment.expiresAt && expiresAt === null)) {
    return 'misconfigured';
  }

  if (evaluatedAtMs < effectiveAt) {
    return 'misconfigured';
  }

  if (expiresAt !== null && evaluatedAtMs >= expiresAt) {
    return 'expired';
  }

  if (enrollment.publisherStatus === 'expired') {
    return 'expired';
  }

  if (enrollment.keyStatus === 'retired') {
    return 'misconfigured';
  }

  return 'active';
}

export function evaluateMarketplacePublisherTrustPolicy(
  input: MarketplacePublisherTrustDecisionInput
): MarketplacePublisherTrustDecision {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const evaluatedAtMs = parseIsoTimestamp(evaluatedAt) ?? Date.now();
  const artifactChannel = input.artifactChannel?.trim() || 'stable';
  const siteScope = input.siteScope?.trim() || 'global';

  const defaultDecisionBase = {
    matchedEnrollmentId: null,
    matchedTrustRootId: null,
    evaluatedScope: {
      pluginId: input.pluginId,
      artifactChannel,
      siteScope,
      operation: input.operation,
    },
    metadata: {
      policyVersion: input.policyDocument?.policyVersion ?? null,
      policySource: input.policyDocument?.policySource ?? null,
      evaluatedAt,
    },
  } as const;

  if (input.publisherClass === 'unknown') {
    return {
      outcome: 'deny',
      reasonCode: 'publisher-unknown',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  const policy = input.policyDocument;
  if (!policy) {
    if (input.publisherClass === 'first-party' && input.publisherId === FIRST_PARTY_PUBLISHER_ID) {
      return {
        outcome: 'allow',
        reasonCode: 'allowed',
        revocationState: 'none',
        ...defaultDecisionBase,
      };
    }

    return {
      outcome: 'deny',
      reasonCode: 'enrollment-missing',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  if (policy.policyVersion !== 1) {
    return {
      outcome: 'deny',
      reasonCode: 'policy-version-unsupported',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  const validationErrors = validateMarketplacePublisherTrustPolicyDocument(policy);
  if (validationErrors.length > 0) {
    return {
      outcome: 'deny',
      reasonCode: 'policy-malformed',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  const publisherEnrollments = policy.enrollments.filter(
    (enrollment) => enrollment.publisherId === input.publisherId
  );
  if (publisherEnrollments.length === 0) {
    return {
      outcome: 'deny',
      reasonCode: 'enrollment-missing',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  const keyEnrollment = publisherEnrollments.find(
    (enrollment) => enrollment.signingKeyId === input.signingKeyId
  );
  if (!keyEnrollment) {
    return {
      outcome: 'deny',
      reasonCode: 'key-publisher-mismatch',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  if (keyEnrollment.publisherClass !== input.publisherClass) {
    return {
      outcome: 'deny',
      reasonCode: 'publisher-unknown',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  const state = currentEnrollmentState(keyEnrollment, evaluatedAtMs);
  if (state === 'misconfigured') {
    return {
      outcome: 'deny',
      reasonCode: 'policy-malformed',
      revocationState: 'none',
      ...defaultDecisionBase,
    };
  }

  if (state === 'suspended') {
    return {
      outcome: 'deny',
      reasonCode: 'publisher-suspended',
      revocationState: 'suspended',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (state === 'revoked') {
    return {
      outcome: 'deny',
      reasonCode: 'publisher-revoked',
      revocationState: 'revoked',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (state === 'expired') {
    return {
      outcome: 'deny',
      reasonCode: 'enrollment-expired',
      revocationState: 'expired',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (!includesCaseInsensitive(keyEnrollment.allowedPluginIds, input.pluginId)) {
    return {
      outcome: 'deny',
      reasonCode: 'plugin-denied',
      revocationState: 'none',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (!matchesNamespace(input.pluginId, keyEnrollment.allowedPluginNamespaces)) {
    return {
      outcome: 'deny',
      reasonCode: 'scope-denied',
      revocationState: 'none',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (!includesCaseInsensitive(keyEnrollment.allowedSiteScopes, siteScope)) {
    return {
      outcome: 'deny',
      reasonCode: 'site-denied',
      revocationState: 'none',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (!includesCaseInsensitive(keyEnrollment.allowedArtifactChannels, artifactChannel)) {
    return {
      outcome: 'deny',
      reasonCode: 'channel-denied',
      revocationState: 'none',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  if (!includesCaseInsensitive(keyEnrollment.allowedOperations, input.operation)) {
    return {
      outcome: 'deny',
      reasonCode: 'scope-denied',
      revocationState: 'none',
      ...defaultDecisionBase,
      matchedEnrollmentId: keyEnrollment.enrollmentId,
      matchedTrustRootId: keyEnrollment.trustRootId,
    };
  }

  return {
    outcome: 'allow',
    reasonCode: 'allowed',
    revocationState: 'none',
    ...defaultDecisionBase,
    matchedEnrollmentId: keyEnrollment.enrollmentId,
    matchedTrustRootId: keyEnrollment.trustRootId,
  };
}

export function loadMarketplacePublisherTrustPolicyFromEnv(): MarketplacePublisherTrustPolicyDocument | null {
  const raw = process.env[TRUST_POLICY_ENV];
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('failed to parse marketplace publisher trust policy JSON');
  }

  const policy = parsed as MarketplacePublisherTrustPolicyDocument;
  const errors = validateMarketplacePublisherTrustPolicyDocument(policy);
  if (errors.length > 0) {
    throw new Error(`invalid marketplace publisher trust policy: ${errors.join('; ')}`);
  }

  return policy;
}
