import { describe, expect, it, vi } from 'vitest';
import {
  buildMarketplaceInstallDryRunPlan,
  canProceedToStaging,
} from '@core/lib/plugin-marketplace-install-planner.server';
import { parseMarketplaceInstallSourceDescriptor } from '@core/lib/plugin-install-source-descriptor.server';
import type { MarketplaceInstallSourceDescriptor } from '@core/types/plugin-marketplace-contract';
import { productionEligibleCatalogFixture } from './fixtures/marketplace-catalog-fixtures';
import { createMarketplacePublisherTrustPolicyFixture } from './fixtures/marketplace-publisher-trust-policy-fixtures';
import { validMarketplaceInstallSourceDescriptor } from './fixtures/plugin-install-source-descriptor-fixtures';
import {
  MARKETPLACE_TEST_TRUSTED_KEY_ID,
  MARKETPLACE_TEST_TRUSTED_KEYS,
  signMarketplaceCatalogEntryForTests,
} from './fixtures/marketplace-signing-fixtures';

function descriptorForFixture(overrides?: Partial<MarketplaceInstallSourceDescriptor>) {
  const parsed = parseMarketplaceInstallSourceDescriptor({
    ...validMarketplaceInstallSourceDescriptor,
    repoUrl: productionEligibleCatalogFixture.source.repositoryUrl,
    ref: productionEligibleCatalogFixture.source.ref,
    pluginSubdirectory: productionEligibleCatalogFixture.pluginSubdirectory,
    manifestPath: productionEligibleCatalogFixture.manifestPath,
    expectedPluginId: productionEligibleCatalogFixture.pluginId,
    expectedVersion: productionEligibleCatalogFixture.version,
    trustPolicy: {
      policy: 'allowlisted-only' as const,
      allowPrerelease: false,
      requiredApprovers: [],
      notes: 'dry-run planner test baseline',
    },
  });

  if (!parsed.descriptor) {
    throw new Error(`Fixture parse failed: ${parsed.errors.join(', ')}`);
  }

  return {
    ...parsed.descriptor,
    ...overrides,
  };
}

describe('plugin-marketplace-install-planner: dry-run outcomes', () => {
  it('returns ready when descriptor and production-eligible catalog entry align', () => {
    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture(),
      catalogEntry: productionEligibleCatalogFixture,
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(plan.outcome).toBe('ready');
    expect(plan.blockers).toEqual([]);
    expect(plan.approvals).toEqual([]);
    expect(canProceedToStaging(plan)).toBe(true);
    expect(plan.states.map((state) => state.status)).not.toContain('blocked');
  });

  it('returns approval-required when trust policy requires manual approval', () => {
    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture({
        trustPolicy: {
          policy: 'manual-approval',
          requiredApprovers: ['release-manager', 'security-reviewer'],
          notes: 'approval gate required',
        },
      }),
      catalogEntry: productionEligibleCatalogFixture,
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(plan.outcome).toBe('approval-required');
    expect(plan.blockers).toEqual([]);
    expect(plan.approvals).toHaveLength(1);
    expect(plan.approvals[0]?.requiredApprovers).toEqual(['release-manager', 'security-reviewer']);
    expect(canProceedToStaging(plan)).toBe(false);
  });

  it('returns blocked for descriptor/catalong consistency mismatches', () => {
    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture({
        expectedVersion: '9.9.9',
        manifestPath: 'plugins/calendar/manifest-v2.json',
      }),
      catalogEntry: productionEligibleCatalogFixture,
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(plan.outcome).toBe('blocked');
    expect(plan.blockers.some((blocker) => blocker.code === 'version-mismatch')).toBe(true);
    expect(plan.blockers.some((blocker) => blocker.code === 'manifest-path-mismatch')).toBe(true);
    expect(canProceedToStaging(plan)).toBe(false);
  });

  it('returns blocked when catalog readiness is not production-eligible', () => {
    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture(),
      catalogEntry: {
        ...productionEligibleCatalogFixture,
        installReadiness: 'catalog-contract-ready',
        runtimeInstallSupported: false,
        artifact: {
          ...productionEligibleCatalogFixture.artifact,
          readiness: 'planned',
          immutable: false,
          artifactUrl: undefined,
          sha256: undefined,
        },
      },
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(plan.outcome).toBe('blocked');
    expect(
      plan.blockers.some((blocker) => blocker.code === 'readiness-not-production-eligible')
    ).toBe(true);
    expect(plan.blockers.some((blocker) => blocker.code === 'runtime-install-unsupported')).toBe(
      true
    );
    expect(plan.blockers.some((blocker) => blocker.code === 'artifact-not-available')).toBe(true);
    expect(canProceedToStaging(plan)).toBe(false);
  });

  it('returns blocked for third-party production planning without enrollment policy', () => {
    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture(),
      catalogEntry: {
        ...productionEligibleCatalogFixture,
        publisher: {
          publisherId: 'external-publisher',
          classification: 'third-party',
        },
      },
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
    });

    expect(plan.outcome).toBe('blocked');
    expect(plan.blockers.some((blocker) => blocker.code === 'publisher-policy-denied')).toBe(true);
  });

  it('allows private publisher planning when enrollment policy explicitly matches scope', () => {
    const privateCatalogEntry = {
      ...productionEligibleCatalogFixture,
      publisher: {
        publisherId: 'private-partner',
        classification: 'private' as const,
      },
    };

    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture(),
      catalogEntry: {
        ...privateCatalogEntry,
        artifact: {
          ...privateCatalogEntry.artifact,
          signature: signMarketplaceCatalogEntryForTests(privateCatalogEntry),
        },
      },
      trustedKeys: [
        {
          ...MARKETPLACE_TEST_TRUSTED_KEYS[0],
          permittedPublisherIds: ['private-partner'],
        },
      ],
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture({
        enrollments: [
          {
            policyVersion: 1,
            enrollmentId: 'private-enroll-1',
            publisherId: 'private-partner',
            publisherClass: 'private',
            publisherStatus: 'active',
            signingKeyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
            trustRootId: 'private-root-1',
            keyStatus: 'active',
            enrollmentScope: 'composite',
            allowedPluginIds: ['calendar'],
            allowedSiteScopes: ['global'],
            allowedArtifactChannels: ['stable'],
            allowedOperations: ['install'],
            effectiveAt: '2026-01-01T00:00:00.000Z',
            policySource: 'test',
            createdAt: '2026-07-13T00:00:00.000Z',
            createdBy: 'test',
            updatedAt: '2026-07-13T00:00:00.000Z',
            updatedBy: 'test',
          },
        ],
      }),
    });

    expect(plan.outcome).toBe('ready');
  });
});

describe('plugin-marketplace-install-planner: safety guardrails', () => {
  it('performs no network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network call should not happen');
    });

    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture(),
      catalogEntry: productionEligibleCatalogFixture,
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(plan.outcome).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('blocks runtime-ready entries when trusted keys do not verify the signature', () => {
    const plan = buildMarketplaceInstallDryRunPlan({
      descriptor: descriptorForFixture(),
      catalogEntry: productionEligibleCatalogFixture,
      trustedKeys: [],
      publisherTrustPolicy: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(plan.outcome).toBe('blocked');
    expect(plan.blockers.some((blocker) => blocker.code === 'artifact-signature-untrusted')).toBe(
      true
    );
  });
});
