import {
  createHash,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
  type KeyLike,
} from 'node:crypto';
import type {
  MarketplaceArtifactSignaturePlaceholder,
  MarketplaceArtifactTrustVerification,
  MarketplaceCatalogEntry,
  MarketplaceTrustedMarketplaceKeyRecord,
} from '@core/types/plugin-marketplace-contract';

export interface MarketplaceArtifactSigningPayloadCompatibility {
  sourceRepositoryUrl: string;
  sourceRef: string;
  pluginSubdirectory: string;
  manifestPath: string;
  runtimeInstallSupported: boolean;
  bundledFallbackRequired: boolean;
  installReadiness: MarketplaceCatalogEntry['installReadiness'];
  manifestChecksum?: string | null;
  packageChecksum?: string | null;
}

export interface MarketplaceArtifactSigningPayload {
  schemaVersion: 'v1';
  pluginId: string;
  version: string;
  publisherId: string;
  artifactType: 'tar.gz';
  artifactSha256: string;
  artifactByteSize: number | null;
  artifactIdentity: string;
  compatibility: MarketplaceArtifactSigningPayloadCompatibility;
  keyId: string;
  issuedAt: string;
}

export interface MarketplaceArtifactSigningEnvelope {
  algorithm: 'Ed25519';
  keyId: string;
  signedPayloadVersion: 'v1';
  signature: string;
  signedAt: string;
  transparencyLogRef?: string;
  certificateChain?: readonly string[];
}

export interface MarketplaceArtifactVerificationOptions {
  catalogEntry: MarketplaceCatalogEntry;
  signature: MarketplaceArtifactSignaturePlaceholder | undefined;
  trustedKeys: MarketplaceTrustedMarketplaceKeyRecord[];
  verificationTimestamp?: string;
}

function stableJsonValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // Canonicalize Unicode equivalence classes so signatures are stable.
    return value.normalize('NFC');
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical payload does not allow non-finite numbers');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item));
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    const result: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      result[key] = stableJsonValue(item);
    }
    return result;
  }

  return value;
}

export function canonicalizeMarketplaceArtifactPayload(
  payload: MarketplaceArtifactSigningPayload
): string {
  return JSON.stringify(stableJsonValue(payload));
}

export function hashMarketplaceArtifactPayload(payload: MarketplaceArtifactSigningPayload): string {
  return createHash('sha256').update(canonicalizeMarketplaceArtifactPayload(payload)).digest('hex');
}

export function buildMarketplaceArtifactSigningPayload(params: {
  catalogEntry: MarketplaceCatalogEntry;
  keyId: string;
  issuedAt?: string;
}): MarketplaceArtifactSigningPayload {
  const { catalogEntry } = params;
  const artifactIdentity =
    catalogEntry.artifact.artifactUrl ??
    `${catalogEntry.source.repositoryUrl}#${catalogEntry.source.ref}:${catalogEntry.pluginSubdirectory}`;

  return {
    schemaVersion: 'v1',
    pluginId: catalogEntry.pluginId,
    version: catalogEntry.version,
    publisherId: catalogEntry.publisher.publisherId,
    artifactType: catalogEntry.artifact.format,
    artifactSha256: catalogEntry.artifact.sha256 ?? '',
    artifactByteSize: catalogEntry.artifact.compressedSizeBytes ?? null,
    artifactIdentity,
    compatibility: {
      sourceRepositoryUrl: catalogEntry.source.repositoryUrl,
      sourceRef: catalogEntry.source.ref,
      pluginSubdirectory: catalogEntry.pluginSubdirectory,
      manifestPath: catalogEntry.manifestPath,
      runtimeInstallSupported: catalogEntry.runtimeInstallSupported,
      bundledFallbackRequired: catalogEntry.bundledFallbackRequired,
      installReadiness: catalogEntry.installReadiness,
      manifestChecksum: catalogEntry.integrity?.manifestChecksum ?? null,
      packageChecksum: catalogEntry.integrity?.packageChecksum ?? null,
    },
    keyId: params.keyId,
    issuedAt: params.issuedAt ?? new Date().toISOString(),
  };
}

export function signMarketplaceArtifactPayload(params: {
  payload: MarketplaceArtifactSigningPayload;
  privateKey: KeyLike;
  keyId: string;
  signedAt?: string;
  transparencyLogRef?: string;
  certificateChain?: readonly string[];
}): MarketplaceArtifactSignaturePlaceholder {
  const canonical = canonicalizeMarketplaceArtifactPayload(params.payload);
  const signature = signBytes(null, Buffer.from(canonical, 'utf8'), params.privateKey).toString(
    'base64'
  );

  return {
    status: 'provided',
    algorithm: 'Ed25519',
    keyId: params.keyId,
    signedPayloadVersion: params.payload.schemaVersion,
    signedAt: params.signedAt ?? params.payload.issuedAt,
    signature,
    transparencyLogRef: params.transparencyLogRef,
    certificateChain: params.certificateChain,
  };
}

function normalizeBase64Signature(signature: string): string | null {
  const trimmed = signature.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const buffer = Buffer.from(trimmed, 'base64');
    if (buffer.length === 0 && trimmed !== '') {
      return null;
    }

    if (buffer.toString('base64').replace(/=+$/, '') !== trimmed.replace(/=+$/, '')) {
      return null;
    }

    return trimmed;
  } catch {
    return null;
  }
}

function isValidEd25519SignatureLength(signatureBase64: string): boolean {
  try {
    return Buffer.from(signatureBase64, 'base64').length === 64;
  } catch {
    return false;
  }
}

function parseIsoTimestamp(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
}

function publicKeyObject(publicKeyPem: string): KeyLike {
  return createPublicKey(publicKeyPem);
}

export function verifyMarketplaceArtifactSignature(
  options: MarketplaceArtifactVerificationOptions
): MarketplaceArtifactTrustVerification {
  const { catalogEntry, signature, trustedKeys, verificationTimestamp } = options;
  const timestamp = verificationTimestamp ?? new Date().toISOString();

  if (!signature || signature.status !== 'provided') {
    return {
      algorithm: 'Ed25519',
      keyId: signature?.keyId ?? 'unavailable',
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'missing-signature',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState: 'none',
      notes: ['artifact signature is required for runtime-ready marketplace artifacts'],
    };
  }

  if (signature.algorithm !== 'Ed25519') {
    return {
      algorithm: 'Ed25519',
      keyId: signature.keyId ?? 'unknown',
      signedPayloadVersion: signature.signedPayloadVersion ?? 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'algorithm-mismatch',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState: 'none',
      notes: [`unsupported signature algorithm: ${signature.algorithm}`],
    };
  }

  if (signature.signedPayloadVersion !== 'v1') {
    return {
      algorithm: 'Ed25519',
      keyId: signature.keyId ?? 'unknown',
      signedPayloadVersion: signature.signedPayloadVersion ?? 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'payload-version-mismatch',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState: 'none',
      notes: [`unsupported signed payload version: ${signature.signedPayloadVersion}`],
    };
  }

  const keyId = signature.keyId?.trim();
  if (!keyId) {
    return {
      algorithm: 'Ed25519',
      keyId: 'unknown',
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'unknown-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState: 'none',
      notes: ['signature keyId is required'],
    };
  }

  const keyRecord = trustedKeys.find((candidate) => candidate.keyId === keyId);
  if (!keyRecord) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'unknown-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState: 'none',
      notes: [`unknown trusted key: ${keyId}`],
    };
  }

  const revocationState: MarketplaceArtifactTrustVerification['revocationState'] =
    keyRecord.status === 'active' ? 'none' : keyRecord.status;
  const signedAt = parseIsoTimestamp(signature.signedAt);
  const activationAt = parseIsoTimestamp(keyRecord.activationAt);
  const retirementAt = parseIsoTimestamp(keyRecord.retirementAt);
  const revocationAt = parseIsoTimestamp(keyRecord.revocationAt);
  const verificationAt = parseIsoTimestamp(timestamp) ?? new Date();

  if (keyRecord.algorithm !== 'Ed25519') {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'algorithm-mismatch',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} does not support Ed25519`],
    };
  }

  if (!keyRecord.permittedPublisherIds.includes(catalogEntry.publisher.publisherId)) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'publisher-mismatch',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [
        `trusted key ${keyId} is not permitted for publisher ${catalogEntry.publisher.publisherId}`,
      ],
    };
  }

  if (keyRecord.status === 'pending') {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'pending-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} is not yet active`],
    };
  }

  if (keyRecord.status === 'revoked') {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'revoked-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [
        `trusted key ${keyId} was revoked${keyRecord.revocationReason ? `: ${keyRecord.revocationReason}` : ''}`,
      ],
    };
  }

  if (revocationAt && signedAt && signedAt >= revocationAt) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'revoked-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} was revoked before or at artifact signing time`],
    };
  }

  if (activationAt && signedAt && signedAt < activationAt) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'pending-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} was not active at artifact signing time`],
    };
  }

  if (activationAt && verificationAt < activationAt) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'pending-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} is not active yet`],
    };
  }

  if (retirementAt && signedAt && signedAt > retirementAt) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'retired-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} retired before the artifact was signed`],
    };
  }

  if (keyRecord.status === 'retired' && retirementAt && (!signedAt || signedAt > retirementAt)) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256: '',
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'retired-key',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: [`trusted key ${keyId} is retired for new artifacts`],
    };
  }

  const payload = buildMarketplaceArtifactSigningPayload({
    catalogEntry,
    keyId,
    issuedAt: signature.signedAt ?? timestamp,
  });
  const canonicalPayload = canonicalizeMarketplaceArtifactPayload(payload);
  const signedPayloadSha256 = createHash('sha256').update(canonicalPayload).digest('hex');
  const normalizedSignature = normalizeBase64Signature(signature.signature ?? '');

  if (!normalizedSignature) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256,
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'invalid-signature',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: ['signature encoding is invalid base64'],
    };
  }

  if (!isValidEd25519SignatureLength(normalizedSignature)) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256,
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'invalid-signature',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: ['signature length is invalid for Ed25519'],
    };
  }

  let verified = false;
  try {
    verified = verifyBytes(
      null,
      Buffer.from(canonicalPayload, 'utf8'),
      publicKeyObject(keyRecord.publicKey),
      Buffer.from(normalizedSignature, 'base64')
    );
  } catch {
    verified = false;
  }

  if (!verified) {
    return {
      algorithm: 'Ed25519',
      keyId,
      signedPayloadVersion: 'v1',
      signedPayloadSha256,
      verificationTimestamp: timestamp,
      trustDecision: 'blocked',
      verificationStatus: 'invalid-signature',
      publisherId: catalogEntry.publisher.publisherId,
      revocationState,
      notes: ['signature verification failed'],
    };
  }

  return {
    algorithm: 'Ed25519',
    keyId,
    signedPayloadVersion: 'v1',
    signedPayloadSha256,
    verificationTimestamp: timestamp,
    trustDecision: 'trusted',
    verificationStatus: 'verified',
    publisherId: catalogEntry.publisher.publisherId,
    revocationState,
    notes: [],
  };
}
