import { describe, expect, it } from 'vitest';
import {
  buildMarketplaceArtifactSigningPayload,
  canonicalizeMarketplaceArtifactPayload,
  hashMarketplaceArtifactPayload,
  verifyMarketplaceArtifactSignature,
} from '@core/lib/plugin-marketplace-signing.server';
import { validateTrustedMarketplaceKeys } from '@core/lib/plugin-marketplace-trusted-keys.server';
import type { MarketplaceTrustedMarketplaceKeyRecord } from '@core/types/plugin-marketplace-contract';
import { productionEligibleCatalogFixture } from './fixtures/marketplace-catalog-fixtures';
import {
  MARKETPLACE_TEST_TRUSTED_KEY_ID,
  MARKETPLACE_TEST_TRUSTED_KEYS,
  signMarketplaceCatalogEntryForTests,
} from './fixtures/marketplace-signing-fixtures';

function signedFixture() {
  const signature = signMarketplaceCatalogEntryForTests(productionEligibleCatalogFixture);

  return { signature };
}

describe('marketplace signing canonicalization', () => {
  it('produces stable canonical payload bytes regardless of property order', () => {
    const payload = buildMarketplaceArtifactSigningPayload({
      catalogEntry: productionEligibleCatalogFixture,
      keyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
      issuedAt: '2026-07-12T00:00:00.000Z',
    });

    const shuffled = {
      keyId: payload.keyId,
      issuedAt: payload.issuedAt,
      artifactIdentity: payload.artifactIdentity,
      artifactSha256: payload.artifactSha256,
      pluginId: payload.pluginId,
      publisherId: payload.publisherId,
      version: payload.version,
      schemaVersion: payload.schemaVersion,
      artifactType: payload.artifactType,
      artifactByteSize: payload.artifactByteSize,
      compatibility: {
        bundledFallbackRequired: payload.compatibility.bundledFallbackRequired,
        installReadiness: payload.compatibility.installReadiness,
        manifestChecksum: payload.compatibility.manifestChecksum,
        manifestPath: payload.compatibility.manifestPath,
        packageChecksum: payload.compatibility.packageChecksum,
        pluginSubdirectory: payload.compatibility.pluginSubdirectory,
        runtimeInstallSupported: payload.compatibility.runtimeInstallSupported,
        sourceRef: payload.compatibility.sourceRef,
        sourceRepositoryUrl: payload.compatibility.sourceRepositoryUrl,
      },
    } as const;

    const canonicalA = canonicalizeMarketplaceArtifactPayload(payload);
    const canonicalB = canonicalizeMarketplaceArtifactPayload(shuffled as typeof payload);

    expect(canonicalA).toBe(canonicalB);
    expect(hashMarketplaceArtifactPayload(payload)).toBe(
      hashMarketplaceArtifactPayload(shuffled as typeof payload)
    );
  });

  it('normalizes equivalent unicode strings to the same canonical payload', () => {
    const base = buildMarketplaceArtifactSigningPayload({
      catalogEntry: productionEligibleCatalogFixture,
      keyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
      issuedAt: '2026-07-12T00:00:00.000Z',
    });

    const composed = {
      ...base,
      artifactIdentity: `${base.artifactIdentity}-caf\u00E9`,
    };
    const decomposed = {
      ...base,
      artifactIdentity: `${base.artifactIdentity}-caf\u0065\u0301`,
    };

    expect(canonicalizeMarketplaceArtifactPayload(composed)).toBe(
      canonicalizeMarketplaceArtifactPayload(decomposed)
    );
  });

  it('distinguishes null from omitted optional fields in payload compatibility', () => {
    const base = buildMarketplaceArtifactSigningPayload({
      catalogEntry: productionEligibleCatalogFixture,
      keyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
      issuedAt: '2026-07-12T00:00:00.000Z',
    });

    const withNull = {
      ...base,
      compatibility: {
        ...base.compatibility,
        manifestChecksum: null,
      },
    };
    const omitted = {
      ...base,
      compatibility: {
        ...base.compatibility,
        manifestChecksum: undefined,
      },
    };

    expect(canonicalizeMarketplaceArtifactPayload(withNull)).not.toBe(
      canonicalizeMarketplaceArtifactPayload(omitted)
    );
  });
});

describe('marketplace signing verification', () => {
  it('verifies a valid Ed25519 signature with an active trusted key', () => {
    const { signature } = signedFixture();
    const trust = verifyMarketplaceArtifactSignature({
      catalogEntry: productionEligibleCatalogFixture,
      signature,
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
    });

    expect(trust.trustDecision).toBe('trusted');
    expect(trust.verificationStatus).toBe('verified');
    expect(trust.keyId).toBe(MARKETPLACE_TEST_TRUSTED_KEY_ID);
  });

  it('rejects malformed signature encoding', () => {
    const { signature } = signedFixture();
    const trust = verifyMarketplaceArtifactSignature({
      catalogEntry: productionEligibleCatalogFixture,
      signature: { ...signature, signature: 'not-base64!!' },
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
    });

    expect(trust.trustDecision).toBe('blocked');
    expect(trust.verificationStatus).toBe('invalid-signature');
  });

  it('rejects signature length anomalies', () => {
    const { signature } = signedFixture();
    const trust = verifyMarketplaceArtifactSignature({
      catalogEntry: productionEligibleCatalogFixture,
      signature: {
        ...signature,
        signature: Buffer.alloc(32).toString('base64'),
      },
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
    });

    expect(trust.trustDecision).toBe('blocked');
    expect(trust.verificationStatus).toBe('invalid-signature');
  });

  it('rejects unknown key IDs', () => {
    const { signature } = signedFixture();
    const trust = verifyMarketplaceArtifactSignature({
      catalogEntry: productionEligibleCatalogFixture,
      signature: { ...signature, keyId: 'unknown-key' },
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
    });

    expect(trust.verificationStatus).toBe('unknown-key');
    expect(trust.trustDecision).toBe('blocked');
  });

  it('rejects publisher mismatch for a trusted key', () => {
    const { signature } = signedFixture();
    const trust = verifyMarketplaceArtifactSignature({
      catalogEntry: {
        ...productionEligibleCatalogFixture,
        publisher: {
          publisherId: 'other-first-party',
          classification: 'first-party',
        },
      },
      signature,
      trustedKeys: MARKETPLACE_TEST_TRUSTED_KEYS,
    });

    expect(trust.verificationStatus).toBe('publisher-mismatch');
    expect(trust.trustDecision).toBe('blocked');
  });

  it('supports retired-key verification for historical signatures only', () => {
    const { signature } = signedFixture();
    const retiredKey: MarketplaceTrustedMarketplaceKeyRecord = {
      ...MARKETPLACE_TEST_TRUSTED_KEYS[0],
      status: 'retired',
      retirementAt: '2026-07-13T00:00:00.000Z',
    };

    const trust = verifyMarketplaceArtifactSignature({
      catalogEntry: productionEligibleCatalogFixture,
      signature,
      trustedKeys: [retiredKey],
      verificationTimestamp: '2026-07-12T12:00:00.000Z',
    });

    expect(trust.verificationStatus).toBe('verified');
    expect(trust.trustDecision).toBe('trusted');
  });

  it('rejects duplicate key IDs in the registry', () => {
    const [key] = MARKETPLACE_TEST_TRUSTED_KEYS;
    expect(
      validateTrustedMarketplaceKeys([
        key,
        {
          ...key,
          publicKey: key.publicKey,
        },
      ])
    ).toContainEqual(expect.stringContaining('duplicate trusted marketplace keyId is not allowed'));
  });

  it('rejects revoked keys in the registry validator when revocationAt is missing', () => {
    const [key] = MARKETPLACE_TEST_TRUSTED_KEYS;
    expect(
      validateTrustedMarketplaceKeys([
        {
          ...key,
          status: 'revoked',
          revocationAt: undefined,
        },
      ])
    ).toContainEqual(expect.stringContaining('is revoked but revocationAt is missing'));
  });

  it('rejects malformed public keys in the registry validator', () => {
    const [key] = MARKETPLACE_TEST_TRUSTED_KEYS;
    expect(
      validateTrustedMarketplaceKeys([
        {
          ...key,
          publicKey: 'not-a-valid-pem-key',
        },
      ])
    ).toContainEqual(expect.stringContaining('has an invalid public key'));
  });
});
