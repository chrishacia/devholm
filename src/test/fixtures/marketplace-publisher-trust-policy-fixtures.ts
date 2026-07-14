import type {
  MarketplacePublisherTrustPolicyDocument,
  MarketplacePublisherEnrollmentRecord,
} from '@core/types/plugin-marketplace-contract';

function enrollment(
  overrides?: Partial<MarketplacePublisherEnrollmentRecord>
): MarketplacePublisherEnrollmentRecord {
  return {
    policyVersion: 1,
    enrollmentId: 'enroll-devholm-calendar',
    publisherId: 'devholm-first-party',
    publisherClass: 'first-party',
    publisherStatus: 'active',
    signingKeyId: 'devholm-first-party-test-key',
    trustRootId: 'devholm-root-1',
    keyStatus: 'active',
    enrollmentScope: 'composite',
    allowedPluginIds: ['calendar'],
    allowedPluginNamespaces: ['calendar'],
    allowedSiteScopes: ['global'],
    allowedArtifactChannels: ['stable'],
    allowedOperations: ['install', 'update', 'rollback', 'enable', 'lifecycle', 'migration'],
    effectiveAt: '2026-01-01T00:00:00.000Z',
    policySource: 'repo-policy-fixture',
    createdAt: '2026-07-13T00:00:00.000Z',
    createdBy: 'test-suite',
    updatedAt: '2026-07-13T00:00:00.000Z',
    updatedBy: 'test-suite',
    ...overrides,
  };
}

export function createMarketplacePublisherTrustPolicyFixture(
  overrides?: Partial<MarketplacePublisherTrustPolicyDocument>
): MarketplacePublisherTrustPolicyDocument {
  return {
    policyVersion: 1,
    policySource: 'repo-policy-fixture',
    updatedAt: '2026-07-13T00:00:00.000Z',
    enrollments: [enrollment()],
    ...overrides,
  };
}

export function createEnrollmentFixture(
  overrides?: Partial<MarketplacePublisherEnrollmentRecord>
): MarketplacePublisherEnrollmentRecord {
  return enrollment(overrides);
}
