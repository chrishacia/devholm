import { describe, expect, it } from 'vitest';
import {
  evaluateMarketplacePublisherTrustPolicy,
  validateMarketplacePublisherTrustPolicyDocument,
} from '@core/lib/plugin-marketplace-publisher-trust.server';
import {
  createEnrollmentFixture,
  createMarketplacePublisherTrustPolicyFixture,
} from './fixtures/marketplace-publisher-trust-policy-fixtures';

describe('plugin-marketplace-publisher-trust: validation', () => {
  it('accepts a valid policy document', () => {
    const policy = createMarketplacePublisherTrustPolicyFixture();
    expect(validateMarketplacePublisherTrustPolicyDocument(policy)).toEqual([]);
  });

  it('rejects conflicting key-to-publisher bindings', () => {
    const policy = createMarketplacePublisherTrustPolicyFixture({
      enrollments: [
        createEnrollmentFixture({
          enrollmentId: 'e-1',
          signingKeyId: 'shared-key',
          publisherId: 'publisher-a',
        }),
        createEnrollmentFixture({
          enrollmentId: 'e-2',
          signingKeyId: 'shared-key',
          publisherId: 'publisher-b',
        }),
      ],
    });

    const errors = validateMarketplacePublisherTrustPolicyDocument(policy);
    expect(errors.some((error) => error.includes('cannot be bound to multiple publishers'))).toBe(
      true
    );
  });
});

describe('plugin-marketplace-publisher-trust: decision engine', () => {
  it('allows explicitly enrolled first-party publishers', () => {
    const policy = createMarketplacePublisherTrustPolicyFixture();

    const decision = evaluateMarketplacePublisherTrustPolicy({
      publisherId: 'devholm-first-party',
      publisherClass: 'first-party',
      signingKeyId: 'devholm-first-party-test-key',
      pluginId: 'calendar',
      artifactChannel: 'stable',
      siteScope: 'global',
      operation: 'install',
      policyDocument: policy,
      evaluatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(decision.outcome).toBe('allow');
    expect(decision.reasonCode).toBe('allowed');
    expect(decision.matchedEnrollmentId).toBe('enroll-devholm-calendar');
  });

  it('denies unknown publisher classes fail-closed', () => {
    const decision = evaluateMarketplacePublisherTrustPolicy({
      publisherId: 'unknown-publisher',
      publisherClass: 'unknown',
      signingKeyId: 'unknown-key',
      pluginId: 'calendar',
      operation: 'install',
      policyDocument: createMarketplacePublisherTrustPolicyFixture(),
    });

    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('publisher-unknown');
  });

  it('denies private publishers outside enrolled site scope', () => {
    const policy = createMarketplacePublisherTrustPolicyFixture({
      enrollments: [
        createEnrollmentFixture({
          enrollmentId: 'private-enrollment',
          publisherId: 'private-partner',
          publisherClass: 'private',
          signingKeyId: 'private-key-1',
          allowedPluginIds: ['calendar'],
          allowedSiteScopes: ['site:alpha'],
        }),
      ],
    });

    const decision = evaluateMarketplacePublisherTrustPolicy({
      publisherId: 'private-partner',
      publisherClass: 'private',
      signingKeyId: 'private-key-1',
      pluginId: 'calendar',
      siteScope: 'site:beta',
      operation: 'install',
      policyDocument: policy,
    });

    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('site-denied');
  });

  it('denies revoked publishers', () => {
    const policy = createMarketplacePublisherTrustPolicyFixture({
      enrollments: [
        createEnrollmentFixture({
          enrollmentId: 'revoked-enrollment',
          publisherId: 'third-party-author',
          publisherClass: 'third-party',
          signingKeyId: 'third-party-key-1',
          publisherStatus: 'revoked',
          revokedAt: '2026-07-12T00:00:00.000Z',
          revocationReason: 'security-incident',
        }),
      ],
    });

    const decision = evaluateMarketplacePublisherTrustPolicy({
      publisherId: 'third-party-author',
      publisherClass: 'third-party',
      signingKeyId: 'third-party-key-1',
      pluginId: 'calendar',
      operation: 'install',
      policyDocument: policy,
      evaluatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('publisher-revoked');
  });

  it('denies missing policies for non-first-party publishers', () => {
    const decision = evaluateMarketplacePublisherTrustPolicy({
      publisherId: 'third-party-author',
      publisherClass: 'third-party',
      signingKeyId: 'third-party-key-1',
      pluginId: 'calendar',
      operation: 'install',
      policyDocument: null,
    });

    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('enrollment-missing');
  });
});
