import { createPublicKey } from 'node:crypto';
import type { MarketplaceTrustedMarketplaceKeyRecord } from '@core/types/plugin-marketplace-contract';

const TRUSTED_KEYS_ENV = 'DEVHOLM_MARKETPLACE_TRUSTED_KEYS_JSON';

function parseTrustedKeysJson(raw: string): MarketplaceTrustedMarketplaceKeyRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('trusted marketplace keys JSON must be an array');
  }

  return parsed as MarketplaceTrustedMarketplaceKeyRecord[];
}

function parseIsoTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function isValidPublisherId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(value);
}

function isValidKeyId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{4,128}$/.test(value);
}

export function validateTrustedMarketplaceKeys(
  keys: MarketplaceTrustedMarketplaceKeyRecord[]
): string[] {
  const errors: string[] = [];
  const keyIds = new Set<string>();

  for (const key of keys) {
    if (!key || typeof key !== 'object') {
      errors.push('trusted marketplace key record must be an object');
      continue;
    }

    if (!isValidKeyId(key.keyId)) {
      errors.push('trusted marketplace key keyId must match [A-Za-z0-9._:-]{4,128}');
      continue;
    }

    if (keyIds.has(key.keyId)) {
      errors.push(`duplicate trusted marketplace keyId is not allowed: ${key.keyId}`);
      continue;
    }

    keyIds.add(key.keyId);

    if (key.algorithm !== 'Ed25519') {
      errors.push(`trusted marketplace key ${key.keyId} must use Ed25519`);
    }

    if (!key.publicKey.trim()) {
      errors.push(`trusted marketplace key ${key.keyId} requires a public key`);
    }

    if (key.intendedUsage !== 'marketplace-artifact-signing') {
      errors.push(
        `trusted marketplace key ${key.keyId} must have intendedUsage=marketplace-artifact-signing`
      );
    }

    if (key.metadataVersion !== 1) {
      errors.push(`trusted marketplace key ${key.keyId} must have metadataVersion=1`);
    }

    if (!key.permittedPublisherIds.length) {
      errors.push(`trusted marketplace key ${key.keyId} requires permitted publisher IDs`);
    } else {
      const uniquePublishers = new Set<string>();
      for (const publisherId of key.permittedPublisherIds) {
        if (!isValidPublisherId(publisherId)) {
          errors.push(
            `trusted marketplace key ${key.keyId} has invalid permitted publisherId: ${publisherId}`
          );
          continue;
        }
        if (uniquePublishers.has(publisherId)) {
          errors.push(
            `trusted marketplace key ${key.keyId} contains duplicate permitted publisherId: ${publisherId}`
          );
          continue;
        }
        uniquePublishers.add(publisherId);
      }
    }

    try {
      createPublicKey(key.publicKey);
    } catch {
      errors.push(`trusted marketplace key ${key.keyId} has an invalid public key`);
    }

    const activationAt = parseIsoTimestamp(key.activationAt);
    const retirementAt = parseIsoTimestamp(key.retirementAt);
    const revocationAt = parseIsoTimestamp(key.revocationAt);

    if (key.activationAt && activationAt === null) {
      errors.push(`trusted marketplace key ${key.keyId} has invalid activationAt timestamp`);
    }
    if (key.retirementAt && retirementAt === null) {
      errors.push(`trusted marketplace key ${key.keyId} has invalid retirementAt timestamp`);
    }
    if (key.revocationAt && revocationAt === null) {
      errors.push(`trusted marketplace key ${key.keyId} has invalid revocationAt timestamp`);
    }

    if (activationAt !== null && retirementAt !== null && activationAt > retirementAt) {
      errors.push(`trusted marketplace key ${key.keyId} has activationAt after retirementAt`);
    }

    if (activationAt !== null && revocationAt !== null && activationAt > revocationAt) {
      errors.push(`trusted marketplace key ${key.keyId} has activationAt after revocationAt`);
    }

    if (retirementAt !== null && revocationAt !== null && retirementAt > revocationAt) {
      errors.push(`trusted marketplace key ${key.keyId} has retirementAt after revocationAt`);
    }

    if (key.status === 'revoked' && revocationAt === null) {
      errors.push(`trusted marketplace key ${key.keyId} is revoked but revocationAt is missing`);
    }

    if (key.status !== 'revoked' && key.revocationReason) {
      errors.push(`trusted marketplace key ${key.keyId} has revocationReason but is not revoked`);
    }
  }

  return errors;
}

export function loadTrustedMarketplaceKeysFromEnv(): MarketplaceTrustedMarketplaceKeyRecord[] {
  const raw = process.env[TRUSTED_KEYS_ENV];
  if (!raw) {
    return [];
  }

  try {
    const keys = parseTrustedKeysJson(raw);
    const errors = validateTrustedMarketplaceKeys(keys);
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
    return keys;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to load trusted marketplace keys: ${message}`);
  }
}

export function getTrustedMarketplaceKeyById(
  keyId: string,
  keys: MarketplaceTrustedMarketplaceKeyRecord[]
): MarketplaceTrustedMarketplaceKeyRecord | null {
  return keys.find((key) => key.keyId === keyId) ?? null;
}
