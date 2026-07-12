import { createPrivateKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { MarketplaceCatalogEntry } from '@core/types/plugin-marketplace-contract';
import {
  buildMarketplaceArtifactSigningPayload,
  signMarketplaceArtifactPayload,
} from '@core/lib/plugin-marketplace-signing.server';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

export const MARKETPLACE_TEST_TRUSTED_KEY_ID = 'devholm-first-party-test-key';

export const MARKETPLACE_TEST_TRUSTED_KEYS = [
  {
    keyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
    algorithm: 'Ed25519' as const,
    publicKey: publicKeyPem,
    status: 'active' as const,
    activationAt: '2026-01-01T00:00:00.000Z',
    permittedPublisherIds: ['devholm-first-party'],
    intendedUsage: 'marketplace-artifact-signing' as const,
    metadataVersion: 1 as const,
  },
];

function privateKeyObject(): KeyObject {
  return createPrivateKey(privateKeyPem);
}

export function signMarketplaceCatalogEntryForTests(catalogEntry: MarketplaceCatalogEntry) {
  const payload = buildMarketplaceArtifactSigningPayload({
    catalogEntry,
    keyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
    issuedAt: '2026-07-12T00:00:00.000Z',
  });

  return signMarketplaceArtifactPayload({
    payload,
    privateKey: privateKeyObject(),
    keyId: MARKETPLACE_TEST_TRUSTED_KEY_ID,
    signedAt: '2026-07-12T00:00:00.000Z',
  });
}

export function getMarketplaceTestPrivateKeyPem(): string {
  return privateKeyPem;
}
