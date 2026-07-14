import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKETPLACE_CACHE_POLICY,
  MARKETPLACE_CACHE_POLICY_VERSION,
  buildDeterministicEvictionPlan,
  redactMarketplaceMirror,
  resolveMarketplaceCachePolicy,
  validateMarketplaceCachePolicy,
  type MarketplaceCacheEntryRecord,
  type MarketplaceCachePinRecord,
} from './marketplace-cache-admin';

describe('marketplace-cache-admin policy validation', () => {
  it('returns defaults when policy payload is missing or invalid', () => {
    expect(resolveMarketplaceCachePolicy(null)).toEqual(DEFAULT_MARKETPLACE_CACHE_POLICY);

    const invalid = resolveMarketplaceCachePolicy({
      version: MARKETPLACE_CACHE_POLICY_VERSION,
      maxCacheBytes: -1,
      maxArtifactAgeMs: 1000,
      warnUsageRatio: 0.5,
      evictionBatchSize: 10,
    });

    expect(invalid).toEqual(DEFAULT_MARKETPLACE_CACHE_POLICY);
  });

  it('rejects unsupported policy versions strictly', () => {
    expect(() =>
      validateMarketplaceCachePolicy({
        version: MARKETPLACE_CACHE_POLICY_VERSION + 1,
        maxCacheBytes: 1024,
        maxArtifactAgeMs: 1000,
        warnUsageRatio: 0.9,
        evictionBatchSize: 10,
      })
    ).toThrow(/Unsupported policy version/i);
  });
});

describe('marketplace-cache-admin eviction planning', () => {
  it('plans deterministic eviction order and never selects pinned entries', () => {
    const entries: MarketplaceCacheEntryRecord[] = [
      {
        cacheKey: 'ccc',
        pluginId: 'calendar',
        pluginVersion: '1.0.0',
        artifactUrl: null,
        approvedHost: null,
        source: 'cache',
        sizeBytes: 60,
        firstCachedAt: '2026-07-01T00:00:00.000Z',
        lastAccessedAt: '2026-07-01T00:00:00.000Z',
        lastVerifiedAt: null,
        accessCount: 1,
        hitCount: 1,
        networkWriteCount: 0,
        integrityState: 'verified',
        integrityFailures: 0,
        lastWarningCode: null,
        lastWarningDetail: null,
      },
      {
        cacheKey: 'aaa',
        pluginId: 'calendar',
        pluginVersion: '1.0.0',
        artifactUrl: null,
        approvedHost: null,
        source: 'cache',
        sizeBytes: 90,
        firstCachedAt: '2026-07-01T00:00:00.000Z',
        lastAccessedAt: '2026-07-01T00:00:00.000Z',
        lastVerifiedAt: null,
        accessCount: 1,
        hitCount: 1,
        networkWriteCount: 0,
        integrityState: 'verified',
        integrityFailures: 0,
        lastWarningCode: null,
        lastWarningDetail: null,
      },
      {
        cacheKey: 'bbb',
        pluginId: 'calendar',
        pluginVersion: '1.0.0',
        artifactUrl: null,
        approvedHost: null,
        source: 'cache',
        sizeBytes: 40,
        firstCachedAt: '2026-07-01T00:00:00.000Z',
        lastAccessedAt: '2026-07-02T00:00:00.000Z',
        lastVerifiedAt: null,
        accessCount: 2,
        hitCount: 2,
        networkWriteCount: 0,
        integrityState: 'verified',
        integrityFailures: 0,
        lastWarningCode: null,
        lastWarningDetail: null,
      },
    ];

    const pins: MarketplaceCachePinRecord[] = [
      {
        id: 1,
        cacheKey: 'aaa',
        reasonCode: 'manual-retain',
        reasonDetail: 'do not evict',
        ownerType: 'admin',
        ownerId: 'admin-1',
        createdBy: 'admin@example.com',
        createdAt: '2026-07-03T00:00:00.000Z',
        releasedAt: null,
        releaseReasonCode: null,
        releaseReasonDetail: null,
      },
    ];

    const plan = buildDeterministicEvictionPlan({
      entries,
      activePins: pins,
      policy: {
        ...DEFAULT_MARKETPLACE_CACHE_POLICY,
        maxCacheBytes: 100,
        maxArtifactAgeMs: 1000,
        evictionBatchSize: 10,
      },
      now: new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(plan.usageBytes).toBe(190);
    expect(plan.degraded.overQuota).toBe(true);
    expect(plan.candidates.map((candidate) => candidate.cacheKey)).toEqual(['ccc', 'bbb']);
    expect(plan.candidates.every((candidate) => candidate.cacheKey !== 'aaa')).toBe(true);
    expect(plan.candidates[0].selected).toBe(true);
    expect(plan.candidates[1].selected).toBe(true);
  });
});

describe('marketplace-cache-admin mirror redaction', () => {
  it('redacts secret values and auth headers in API-safe shape', () => {
    const redacted = redactMarketplaceMirror({
      mirrorId: 'main',
      baseUrl: 'https://mirror.example.com',
      enabled: true,
      priority: 10,
      authType: 'bearer',
      authSecretRef: 'vault://plugins/main',
      authSecretValue: 'super-secret-token',
      authHeaders: {
        Authorization: 'Bearer super-secret-token',
        'X-Custom': 'safe',
      },
      healthState: 'healthy',
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      lastStatusCode: null,
      lastError: null,
      metadata: null,
      updatedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(redacted.authSecretValue).toBe('[REDACTED]');
    expect(redacted.authHeaders?.Authorization).toBe('[REDACTED]');
    expect(redacted.authHeaders?.['X-Custom']).toBe('safe');
  });
});
