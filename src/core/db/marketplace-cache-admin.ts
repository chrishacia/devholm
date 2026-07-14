import { randomUUID } from 'node:crypto';
import { getDb } from './index';

export const MARKETPLACE_CACHE_POLICY_VERSION = 1;

export interface MarketplaceCachePolicy {
  version: number;
  maxCacheBytes: number;
  maxArtifactAgeMs: number;
  warnUsageRatio: number;
  evictionBatchSize: number;
}

export interface MarketplaceCacheEntryRecord {
  cacheKey: string;
  pluginId: string | null;
  pluginVersion: string | null;
  artifactUrl: string | null;
  approvedHost: string | null;
  source: 'cache' | 'network';
  sizeBytes: number;
  firstCachedAt: string;
  lastAccessedAt: string;
  lastVerifiedAt: string | null;
  accessCount: number;
  hitCount: number;
  networkWriteCount: number;
  integrityState: string;
  integrityFailures: number;
  lastWarningCode: string | null;
  lastWarningDetail: string | null;
}

export interface MarketplaceCachePinRecord {
  id: number;
  cacheKey: string;
  reasonCode: string;
  reasonDetail: string | null;
  ownerType: string;
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
  releasedAt: string | null;
  releaseReasonCode: string | null;
  releaseReasonDetail: string | null;
}

export interface MarketplaceMirrorRecord {
  mirrorId: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  authType: string;
  authSecretRef: string | null;
  authSecretValue: string | null;
  authHeaders: Record<string, string> | null;
  healthState: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

export interface SafeMarketplaceMirrorRecord
  extends Omit<MarketplaceMirrorRecord, 'authSecretValue'> {
  authSecretValue: string | null;
}

export interface EvictionCandidate {
  cacheKey: string;
  sizeBytes: number;
  lastAccessedAt: string;
  accessCount: number;
  activePinCount: number;
  reasonCodes: string[];
  selected: boolean;
}

export interface EvictionPlanSummary {
  generatedAt: string;
  policy: MarketplaceCachePolicy;
  usageBytes: number;
  usageEntries: number;
  evictableBytes: number;
  evictableEntries: number;
  targetReclaimBytes: number;
  selectedBytes: number;
  selectedEntries: number;
  candidates: EvictionCandidate[];
  degraded: {
    overQuota: boolean;
  };
}

export interface CacheHealthSummary {
  generatedAt: string;
  policy: MarketplaceCachePolicy;
  usageBytes: number;
  usageEntries: number;
  pinnedUsageBytes: number;
  pinnedEntries: number;
  evictableUsageBytes: number;
  evictableEntries: number;
  mirrors: {
    total: number;
    enabled: number;
    degraded: number;
  };
  audits: {
    latestRunId: string | null;
    latestStatus: string | null;
    latestCompletedAt: string | null;
  };
  degraded: {
    overQuota: boolean;
    mirrorsDegraded: boolean;
    latestAuditDegraded: boolean;
  };
}

export interface MarketplaceCleanupRunSummary {
  runId: string;
  mode: 'dry-run' | 'execute';
  status: string;
  policyVersion: number;
  startedAt: string;
  completedAt: string | null;
  totalEntries: number;
  totalBytes: number;
  evictableEntries: number;
  evictableBytes: number;
  plannedEntries: number;
  plannedBytes: number;
  evictedEntries: number;
  evictedBytes: number;
  degraded: boolean;
  reasonCodes: string[];
}

export interface MarketplaceAuditRunSummary {
  runId: string;
  status: string;
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
  scannedEntries: number;
  findingsTotal: number;
  findingsCorrupt: number;
  findingsMissing: number;
  findingsStale: number;
  degraded: boolean;
}

export const DEFAULT_MARKETPLACE_CACHE_POLICY: MarketplaceCachePolicy = {
  version: MARKETPLACE_CACHE_POLICY_VERSION,
  maxCacheBytes: 2 * 1024 * 1024 * 1024,
  maxArtifactAgeMs: 30 * 24 * 60 * 60 * 1000,
  warnUsageRatio: 0.9,
  evictionBatchSize: 250,
};

function parseFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asIso(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function validatePositiveInteger(value: unknown, key: string): number {
  const parsed = parseFiniteNumber(value, Number.NaN);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

export function validateMarketplaceCachePolicy(
  candidate: Partial<MarketplaceCachePolicy>
): MarketplaceCachePolicy {
  const version = validatePositiveInteger(candidate.version, 'version');
  if (version !== MARKETPLACE_CACHE_POLICY_VERSION) {
    throw new Error(
      `Unsupported policy version ${version}; expected ${MARKETPLACE_CACHE_POLICY_VERSION}`
    );
  }

  const maxCacheBytes = validatePositiveInteger(candidate.maxCacheBytes, 'maxCacheBytes');
  const maxArtifactAgeMs = validatePositiveInteger(candidate.maxArtifactAgeMs, 'maxArtifactAgeMs');
  const evictionBatchSize = validatePositiveInteger(
    candidate.evictionBatchSize,
    'evictionBatchSize'
  );
  const warnUsageRatio = parseFiniteNumber(candidate.warnUsageRatio, Number.NaN);

  if (!(warnUsageRatio > 0 && warnUsageRatio <= 1)) {
    throw new Error('warnUsageRatio must be > 0 and <= 1');
  }

  return {
    version,
    maxCacheBytes,
    maxArtifactAgeMs,
    warnUsageRatio,
    evictionBatchSize,
  };
}

export function resolveMarketplaceCachePolicy(
  candidate: unknown,
  fallback: MarketplaceCachePolicy = DEFAULT_MARKETPLACE_CACHE_POLICY
): MarketplaceCachePolicy {
  if (!candidate || typeof candidate !== 'object') {
    return fallback;
  }

  try {
    const merged = {
      ...fallback,
      ...(candidate as Partial<MarketplaceCachePolicy>),
    };
    return validateMarketplaceCachePolicy(merged);
  } catch {
    return fallback;
  }
}

function normalizeCacheEntry(row: Record<string, unknown>): MarketplaceCacheEntryRecord {
  return {
    cacheKey: String(row.cache_key),
    pluginId: row.plugin_id ? String(row.plugin_id) : null,
    pluginVersion: row.plugin_version ? String(row.plugin_version) : null,
    artifactUrl: row.artifact_url ? String(row.artifact_url) : null,
    approvedHost: row.approved_host ? String(row.approved_host) : null,
    source: row.source === 'network' ? 'network' : 'cache',
    sizeBytes: parseFiniteNumber(row.size_bytes, 0),
    firstCachedAt: asIso(row.first_cached_at) ?? new Date(0).toISOString(),
    lastAccessedAt: asIso(row.last_accessed_at) ?? new Date(0).toISOString(),
    lastVerifiedAt: asIso(row.last_verified_at),
    accessCount: parseFiniteNumber(row.access_count, 0),
    hitCount: parseFiniteNumber(row.hit_count, 0),
    networkWriteCount: parseFiniteNumber(row.network_write_count, 0),
    integrityState: row.integrity_state ? String(row.integrity_state) : 'unknown',
    integrityFailures: parseFiniteNumber(row.integrity_failures, 0),
    lastWarningCode: row.last_warning_code ? String(row.last_warning_code) : null,
    lastWarningDetail: row.last_warning_detail ? String(row.last_warning_detail) : null,
  };
}

function normalizePin(row: Record<string, unknown>): MarketplaceCachePinRecord {
  return {
    id: parseFiniteNumber(row.id, 0),
    cacheKey: String(row.cache_key),
    reasonCode: String(row.reason_code),
    reasonDetail: row.reason_detail ? String(row.reason_detail) : null,
    ownerType: String(row.owner_type),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: asIso(row.created_at) ?? new Date(0).toISOString(),
    releasedAt: asIso(row.released_at),
    releaseReasonCode: row.release_reason_code ? String(row.release_reason_code) : null,
    releaseReasonDetail: row.release_reason_detail ? String(row.release_reason_detail) : null,
  };
}

function normalizeMirror(row: Record<string, unknown>): MarketplaceMirrorRecord {
  return {
    mirrorId: String(row.mirror_id),
    baseUrl: String(row.base_url),
    enabled: Boolean(row.enabled),
    priority: parseFiniteNumber(row.priority, 100),
    authType: row.auth_type ? String(row.auth_type) : 'none',
    authSecretRef: row.auth_secret_ref ? String(row.auth_secret_ref) : null,
    authSecretValue: row.auth_secret_value ? String(row.auth_secret_value) : null,
    authHeaders: parseJsonObject(row.auth_headers_json) as Record<string, string> | null,
    healthState: row.health_state ? String(row.health_state) : 'unknown',
    lastCheckedAt: asIso(row.last_checked_at),
    lastSuccessAt: asIso(row.last_success_at),
    lastFailureAt: asIso(row.last_failure_at),
    failureCount: parseFiniteNumber(row.failure_count, 0),
    lastStatusCode:
      row.last_status_code === null ? null : parseFiniteNumber(row.last_status_code, 0),
    lastError: row.last_error ? String(row.last_error) : null,
    metadata: parseJsonObject(row.metadata_json),
    updatedAt: asIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

export function redactMarketplaceMirror(
  record: MarketplaceMirrorRecord
): SafeMarketplaceMirrorRecord {
  const redactedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(record.authHeaders ?? {})) {
    const normalized = key.toLowerCase();
    if (
      normalized === 'authorization' ||
      normalized === 'proxy-authorization' ||
      normalized === 'x-api-key' ||
      normalized === 'api-key'
    ) {
      redactedHeaders[key] = '[REDACTED]';
      continue;
    }

    redactedHeaders[key] = value;
  }

  return {
    ...record,
    authSecretValue: record.authSecretValue ? '[REDACTED]' : null,
    authHeaders: Object.keys(redactedHeaders).length > 0 ? redactedHeaders : null,
  };
}

export async function getMarketplaceCachePolicy(): Promise<MarketplaceCachePolicy> {
  const db = getDb();
  const row = await db('plugin_marketplace_cache_policy').orderBy('id', 'desc').first();

  if (!row) {
    return DEFAULT_MARKETPLACE_CACHE_POLICY;
  }

  const payload = parseJsonObject((row as { policy_json: unknown }).policy_json);
  return resolveMarketplaceCachePolicy(payload);
}

export async function setMarketplaceCachePolicy(
  policy: Partial<MarketplaceCachePolicy>,
  createdBy?: string
): Promise<MarketplaceCachePolicy> {
  const resolved = validateMarketplaceCachePolicy({
    ...DEFAULT_MARKETPLACE_CACHE_POLICY,
    ...policy,
  });

  const db = getDb();
  await db('plugin_marketplace_cache_policy').insert({
    policy_version: resolved.version,
    policy_json: JSON.stringify(resolved),
    created_by: createdBy ?? null,
  });

  return resolved;
}

export async function registerMarketplaceCacheEntryAccess(input: {
  cacheKey: string;
  source: 'cache' | 'network';
  sizeBytes?: number;
  pluginId?: string;
  pluginVersion?: string;
  artifactUrl?: string;
  approvedHost?: string;
  verifiedAt?: Date;
  warningCode?: string;
  warningDetail?: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (trx) => {
    const existing = (await trx('plugin_marketplace_cache_entries')
      .where({ cache_key: input.cacheKey })
      .first()) as Record<string, unknown> | undefined;

    const isCacheHit = input.source === 'cache' ? 1 : 0;
    const isNetworkWrite = input.source === 'network' ? 1 : 0;
    const sizeBytes = Math.max(0, Math.floor(input.sizeBytes ?? 0));

    if (!existing) {
      await trx('plugin_marketplace_cache_entries').insert({
        cache_key: input.cacheKey,
        plugin_id: input.pluginId ?? null,
        plugin_version: input.pluginVersion ?? null,
        artifact_url: input.artifactUrl ?? null,
        approved_host: input.approvedHost ?? null,
        source: input.source,
        size_bytes: sizeBytes,
        first_cached_at: now,
        last_accessed_at: now,
        last_verified_at: input.verifiedAt ?? now,
        access_count: 1,
        hit_count: isCacheHit,
        network_write_count: isNetworkWrite,
        integrity_state: 'verified',
        integrity_failures: 0,
        last_warning_code: input.warningCode ?? null,
        last_warning_detail: input.warningDetail ?? null,
        updated_at: now,
      });
      return;
    }

    await trx('plugin_marketplace_cache_entries')
      .where({ cache_key: input.cacheKey })
      .update({
        plugin_id: input.pluginId ?? existing.plugin_id ?? null,
        plugin_version: input.pluginVersion ?? existing.plugin_version ?? null,
        artifact_url: input.artifactUrl ?? existing.artifact_url ?? null,
        approved_host: input.approvedHost ?? existing.approved_host ?? null,
        source: input.source,
        size_bytes: sizeBytes > 0 ? sizeBytes : parseFiniteNumber(existing.size_bytes, 0),
        last_accessed_at: now,
        last_verified_at: input.verifiedAt ?? existing.last_verified_at ?? now,
        access_count: parseFiniteNumber(existing.access_count, 0) + 1,
        hit_count: parseFiniteNumber(existing.hit_count, 0) + isCacheHit,
        network_write_count: parseFiniteNumber(existing.network_write_count, 0) + isNetworkWrite,
        integrity_state: 'verified',
        last_warning_code: input.warningCode ?? null,
        last_warning_detail: input.warningDetail ?? null,
        updated_at: now,
      });
  });
}

export async function setMarketplaceCachePin(input: {
  cacheKey: string;
  reasonCode: string;
  reasonDetail?: string;
  ownerType: string;
  ownerId?: string;
  createdBy?: string;
}): Promise<MarketplaceCachePinRecord> {
  const db = getDb();

  const existing = await db('plugin_marketplace_cache_pins')
    .where({
      cache_key: input.cacheKey,
      reason_code: input.reasonCode,
      owner_type: input.ownerType,
      owner_id: input.ownerId ?? null,
    })
    .whereNull('released_at')
    .orderBy('id', 'desc')
    .first();

  if (existing) {
    return normalizePin(existing as Record<string, unknown>);
  }

  await db('plugin_marketplace_cache_pins').insert({
    cache_key: input.cacheKey,
    reason_code: input.reasonCode,
    reason_detail: input.reasonDetail ?? null,
    owner_type: input.ownerType,
    owner_id: input.ownerId ?? null,
    created_by: input.createdBy ?? null,
    released_at: null,
  });

  const row = await db('plugin_marketplace_cache_pins')
    .where({
      cache_key: input.cacheKey,
      reason_code: input.reasonCode,
      owner_type: input.ownerType,
      owner_id: input.ownerId ?? null,
    })
    .whereNull('released_at')
    .orderBy('id', 'desc')
    .first();

  if (!row) {
    throw new Error('Failed to create cache pin');
  }

  return normalizePin(row as Record<string, unknown>);
}

export async function listMarketplaceCachePins(
  cacheKey?: string
): Promise<MarketplaceCachePinRecord[]> {
  const db = getDb();
  const query = db('plugin_marketplace_cache_pins')
    .select('*')
    .whereNull('released_at')
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc');

  if (cacheKey) {
    query.andWhere('cache_key', cacheKey);
  }

  const rows = await query;
  return rows.map((row) => normalizePin(row as Record<string, unknown>));
}

export async function releaseMarketplaceCachePins(input: {
  cacheKey?: string;
  reasonCode?: string;
  ownerType?: string;
  ownerId?: string;
  releaseReasonCode: string;
  releaseReasonDetail?: string;
}): Promise<number> {
  const db = getDb();
  const now = new Date();

  const query = db('plugin_marketplace_cache_pins').whereNull('released_at');
  if (input.cacheKey) {
    query.andWhere('cache_key', input.cacheKey);
  }
  if (input.reasonCode) {
    query.andWhere('reason_code', input.reasonCode);
  }
  if (input.ownerType) {
    query.andWhere('owner_type', input.ownerType);
  }
  if (input.ownerId !== undefined) {
    if (input.ownerId === null) {
      query.whereNull('owner_id');
    } else {
      query.andWhere('owner_id', input.ownerId);
    }
  }

  const updated = await query.update({
    released_at: now,
    release_reason_code: input.releaseReasonCode,
    release_reason_detail: input.releaseReasonDetail ?? null,
  });

  return parseFiniteNumber(updated, 0);
}

export function buildDeterministicEvictionPlan(input: {
  entries: MarketplaceCacheEntryRecord[];
  activePins: MarketplaceCachePinRecord[];
  policy: MarketplaceCachePolicy;
  now?: Date;
  limit?: number;
}): EvictionPlanSummary {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.floor(input.limit ?? input.policy.evictionBatchSize));

  const activePinnedKeys = new Set(
    input.activePins.filter((pin) => !pin.releasedAt).map((pin) => pin.cacheKey)
  );
  const pinCountByKey = new Map<string, number>();
  for (const pin of input.activePins) {
    if (pin.releasedAt) {
      continue;
    }
    pinCountByKey.set(pin.cacheKey, (pinCountByKey.get(pin.cacheKey) ?? 0) + 1);
  }

  const usageBytes = input.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const overQuota = usageBytes > input.policy.maxCacheBytes;
  const targetReclaimBytes = overQuota ? usageBytes - input.policy.maxCacheBytes : 0;

  const evictable = input.entries
    .filter((entry) => !activePinnedKeys.has(entry.cacheKey))
    .sort((a, b) => {
      const timeDelta = Date.parse(a.lastAccessedAt) - Date.parse(b.lastAccessedAt);
      if (timeDelta !== 0) return timeDelta;
      if (a.accessCount !== b.accessCount) return a.accessCount - b.accessCount;
      return a.cacheKey.localeCompare(b.cacheKey);
    });

  let selectedBytes = 0;
  let selectedEntries = 0;

  const candidates: EvictionCandidate[] = evictable.slice(0, limit).map((entry) => {
    const ageMs = Math.max(0, now.getTime() - Date.parse(entry.lastAccessedAt));
    const reasonCodes: string[] = [];

    if (ageMs > input.policy.maxArtifactAgeMs) {
      reasonCodes.push('stale-artifact-age');
    }

    if (overQuota) {
      reasonCodes.push('over-quota-lru');
    }

    const shouldSelect =
      selectedEntries < limit &&
      (reasonCodes.includes('stale-artifact-age') || selectedBytes < targetReclaimBytes);

    if (shouldSelect) {
      selectedEntries += 1;
      selectedBytes += entry.sizeBytes;
    }

    return {
      cacheKey: entry.cacheKey,
      sizeBytes: entry.sizeBytes,
      lastAccessedAt: entry.lastAccessedAt,
      accessCount: entry.accessCount,
      activePinCount: pinCountByKey.get(entry.cacheKey) ?? 0,
      reasonCodes,
      selected: shouldSelect,
    };
  });

  return {
    generatedAt: now.toISOString(),
    policy: input.policy,
    usageBytes,
    usageEntries: input.entries.length,
    evictableBytes: evictable.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    evictableEntries: evictable.length,
    targetReclaimBytes,
    selectedBytes,
    selectedEntries,
    candidates,
    degraded: {
      overQuota,
    },
  };
}

export async function listMarketplaceEligibleEvictionCandidates(
  limit?: number
): Promise<EvictionPlanSummary> {
  const [policy, entries, pins] = await Promise.all([
    getMarketplaceCachePolicy(),
    listMarketplaceCacheEntries(),
    listMarketplaceCachePins(),
  ]);

  return buildDeterministicEvictionPlan({
    entries,
    activePins: pins,
    policy,
    limit,
  });
}

export async function listMarketplaceCacheEntries(): Promise<MarketplaceCacheEntryRecord[]> {
  const db = getDb();
  const rows = await db('plugin_marketplace_cache_entries')
    .select('*')
    .orderBy('last_accessed_at', 'asc')
    .orderBy('cache_key', 'asc');

  return rows.map((row) => normalizeCacheEntry(row as Record<string, unknown>));
}

export async function upsertMarketplaceMirror(input: {
  mirrorId: string;
  baseUrl: string;
  enabled?: boolean;
  priority?: number;
  authType?: string;
  authSecretRef?: string | null;
  authSecretValue?: string | null;
  authHeaders?: Record<string, string> | null;
  healthState?: string;
  lastCheckedAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
  failureCount?: number;
  lastStatusCode?: number | null;
  lastError?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<SafeMarketplaceMirrorRecord> {
  const db = getDb();
  const now = new Date();

  await db('plugin_marketplace_cache_mirrors')
    .insert({
      mirror_id: input.mirrorId,
      base_url: input.baseUrl,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
      auth_type: input.authType ?? 'none',
      auth_secret_ref: input.authSecretRef ?? null,
      auth_secret_value: input.authSecretValue ?? null,
      auth_headers_json: input.authHeaders ? JSON.stringify(input.authHeaders) : null,
      health_state: input.healthState ?? 'unknown',
      last_checked_at: input.lastCheckedAt ?? null,
      last_success_at: input.lastSuccessAt ?? null,
      last_failure_at: input.lastFailureAt ?? null,
      failure_count: input.failureCount ?? 0,
      last_status_code: input.lastStatusCode ?? null,
      last_error: input.lastError ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: now,
      updated_at: now,
    })
    .onConflict('mirror_id')
    .merge({
      base_url: input.baseUrl,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
      auth_type: input.authType ?? 'none',
      auth_secret_ref: input.authSecretRef ?? null,
      auth_secret_value: input.authSecretValue ?? null,
      auth_headers_json: input.authHeaders ? JSON.stringify(input.authHeaders) : null,
      health_state: input.healthState ?? 'unknown',
      last_checked_at: input.lastCheckedAt ?? null,
      last_success_at: input.lastSuccessAt ?? null,
      last_failure_at: input.lastFailureAt ?? null,
      failure_count: input.failureCount ?? 0,
      last_status_code: input.lastStatusCode ?? null,
      last_error: input.lastError ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      updated_at: now,
    });

  const row = await db('plugin_marketplace_cache_mirrors')
    .where({ mirror_id: input.mirrorId })
    .first();

  if (!row) {
    throw new Error('Failed to persist mirror record');
  }

  return redactMarketplaceMirror(normalizeMirror(row as Record<string, unknown>));
}

export async function listMarketplaceMirrors(): Promise<SafeMarketplaceMirrorRecord[]> {
  const db = getDb();
  const rows = await db('plugin_marketplace_cache_mirrors')
    .select('*')
    .orderBy('priority', 'asc')
    .orderBy('mirror_id', 'asc');

  return rows.map((row) =>
    redactMarketplaceMirror(normalizeMirror(row as Record<string, unknown>))
  );
}

export async function getMarketplaceMirrorById(
  mirrorId: string
): Promise<MarketplaceMirrorRecord | null> {
  const db = getDb();
  const row = await db('plugin_marketplace_cache_mirrors').where({ mirror_id: mirrorId }).first();
  if (!row) {
    return null;
  }

  return normalizeMirror(row as Record<string, unknown>);
}

async function getRunningMarketplaceIntegrityAuditRun(): Promise<MarketplaceAuditRunSummary | null> {
  const db = getDb();
  const row = await db('plugin_marketplace_cache_audit_runs')
    .where({ status: 'running' })
    .orderBy('started_at', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return normalizeAuditRun(row as Record<string, unknown>);
}

async function getRunningMarketplaceCleanupRun(): Promise<MarketplaceCleanupRunSummary | null> {
  const db = getDb();
  const row = await db('plugin_marketplace_cache_cleanup_runs')
    .where({ status: 'running' })
    .orderBy('started_at', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return normalizeCleanupRun(row as Record<string, unknown>);
}

export async function startMarketplaceIntegrityAuditRun(
  startedBy?: string
): Promise<MarketplaceAuditRunSummary> {
  const active = await getRunningMarketplaceIntegrityAuditRun();
  if (active) {
    throw new Error(`integrity audit already running: ${active.runId}`);
  }

  const db = getDb();
  const runId = randomUUID();

  await db('plugin_marketplace_cache_audit_runs').insert({
    run_id: runId,
    status: 'running',
    started_by: startedBy ?? null,
    started_at: new Date(),
  });

  const row = await db('plugin_marketplace_cache_audit_runs').where({ run_id: runId }).first();
  if (!row) {
    throw new Error('Failed to start integrity audit run');
  }

  return normalizeAuditRun(row as Record<string, unknown>);
}

export async function completeMarketplaceIntegrityAuditRun(input: {
  runId: string;
  status: 'succeeded' | 'failed';
  scannedEntries: number;
  findingsTotal: number;
  findingsCorrupt: number;
  findingsMissing: number;
  findingsStale: number;
  degraded?: boolean;
  notes?: string;
  summary?: Record<string, unknown>;
}): Promise<MarketplaceAuditRunSummary> {
  const db = getDb();

  await db('plugin_marketplace_cache_audit_runs')
    .where({ run_id: input.runId })
    .update({
      status: input.status,
      completed_at: new Date(),
      scanned_entries: Math.max(0, Math.floor(input.scannedEntries)),
      findings_total: Math.max(0, Math.floor(input.findingsTotal)),
      findings_corrupt: Math.max(0, Math.floor(input.findingsCorrupt)),
      findings_missing: Math.max(0, Math.floor(input.findingsMissing)),
      findings_stale: Math.max(0, Math.floor(input.findingsStale)),
      degraded: Boolean(input.degraded ?? (input.status === 'failed' || input.findingsTotal > 0)),
      notes: input.notes ?? null,
      summary_json: input.summary ? JSON.stringify(input.summary) : null,
    });

  const row = await db('plugin_marketplace_cache_audit_runs')
    .where({ run_id: input.runId })
    .first();
  if (!row) {
    throw new Error('Integrity audit run not found');
  }

  return normalizeAuditRun(row as Record<string, unknown>);
}

export async function getLatestMarketplaceIntegrityAuditRun(): Promise<MarketplaceAuditRunSummary | null> {
  const db = getDb();
  const row = await db('plugin_marketplace_cache_audit_runs').orderBy('started_at', 'desc').first();

  if (!row) {
    return null;
  }

  return normalizeAuditRun(row as Record<string, unknown>);
}

function normalizeAuditRun(row: Record<string, unknown>): MarketplaceAuditRunSummary {
  return {
    runId: String(row.run_id),
    status: String(row.status),
    startedBy: row.started_by ? String(row.started_by) : null,
    startedAt: asIso(row.started_at) ?? new Date(0).toISOString(),
    completedAt: asIso(row.completed_at),
    scannedEntries: parseFiniteNumber(row.scanned_entries, 0),
    findingsTotal: parseFiniteNumber(row.findings_total, 0),
    findingsCorrupt: parseFiniteNumber(row.findings_corrupt, 0),
    findingsMissing: parseFiniteNumber(row.findings_missing, 0),
    findingsStale: parseFiniteNumber(row.findings_stale, 0),
    degraded: Boolean(row.degraded),
  };
}

function normalizeCleanupRun(row: Record<string, unknown>): MarketplaceCleanupRunSummary {
  const reasonCodesRaw = row.reason_codes_json;
  const parsed = parseJsonObject(reasonCodesRaw);

  return {
    runId: String(row.run_id),
    mode: String(row.mode) === 'execute' ? 'execute' : 'dry-run',
    status: String(row.status),
    policyVersion: parseFiniteNumber(row.policy_version, MARKETPLACE_CACHE_POLICY_VERSION),
    startedAt: asIso(row.started_at) ?? new Date(0).toISOString(),
    completedAt: asIso(row.completed_at),
    totalEntries: parseFiniteNumber(row.total_entries, 0),
    totalBytes: parseFiniteNumber(row.total_bytes, 0),
    evictableEntries: parseFiniteNumber(row.evictable_entries, 0),
    evictableBytes: parseFiniteNumber(row.evictable_bytes, 0),
    plannedEntries: parseFiniteNumber(row.planned_entries, 0),
    plannedBytes: parseFiniteNumber(row.planned_bytes, 0),
    evictedEntries: parseFiniteNumber(row.evicted_entries, 0),
    evictedBytes: parseFiniteNumber(row.evicted_bytes, 0),
    degraded: Boolean(row.degraded),
    reasonCodes: Array.isArray(parsed?.values) ? (parsed.values as string[]) : [],
  };
}

export async function startMarketplaceCleanupRun(input: {
  mode: 'dry-run' | 'execute';
  triggeredBy?: string;
  policyVersion: number;
  plan: EvictionPlanSummary;
}): Promise<MarketplaceCleanupRunSummary> {
  const active = await getRunningMarketplaceCleanupRun();
  if (active) {
    throw new Error(`cleanup already running: ${active.runId}`);
  }

  const db = getDb();
  const runId = randomUUID();

  const reasonCodes = Array.from(
    new Set(input.plan.candidates.flatMap((candidate) => candidate.reasonCodes))
  );

  await db('plugin_marketplace_cache_cleanup_runs').insert({
    run_id: runId,
    mode: input.mode,
    status: 'running',
    triggered_by: input.triggeredBy ?? null,
    policy_version: input.policyVersion,
    started_at: new Date(),
    total_entries: input.plan.usageEntries,
    total_bytes: input.plan.usageBytes,
    evictable_entries: input.plan.evictableEntries,
    evictable_bytes: input.plan.evictableBytes,
    planned_entries: input.plan.selectedEntries,
    planned_bytes: input.plan.selectedBytes,
    reason_codes_json: JSON.stringify({ values: reasonCodes }),
    plan_json: JSON.stringify(input.plan),
    degraded: input.plan.degraded.overQuota,
  });

  const row = await db('plugin_marketplace_cache_cleanup_runs').where({ run_id: runId }).first();
  if (!row) {
    throw new Error('Failed to start cleanup run');
  }

  return normalizeCleanupRun(row as Record<string, unknown>);
}

export async function completeMarketplaceCleanupRun(input: {
  runId: string;
  status: 'succeeded' | 'failed';
  evictedEntries: number;
  evictedBytes: number;
  errorSummary?: string;
}): Promise<MarketplaceCleanupRunSummary> {
  const db = getDb();

  await db('plugin_marketplace_cache_cleanup_runs')
    .where({ run_id: input.runId })
    .update({
      status: input.status,
      completed_at: new Date(),
      evicted_entries: Math.max(0, Math.floor(input.evictedEntries)),
      evicted_bytes: Math.max(0, Math.floor(input.evictedBytes)),
      error_summary: input.errorSummary ?? null,
      degraded: input.status !== 'succeeded',
    });

  const row = await db('plugin_marketplace_cache_cleanup_runs')
    .where({ run_id: input.runId })
    .first();
  if (!row) {
    throw new Error('Cleanup run not found');
  }

  return normalizeCleanupRun(row as Record<string, unknown>);
}

export async function executeMarketplaceCleanupPlan(input: {
  initiatedBy?: string;
  limit?: number;
}): Promise<{ run: MarketplaceCleanupRunSummary; plan: EvictionPlanSummary }> {
  const plan = await listMarketplaceEligibleEvictionCandidates(input.limit);
  const run = await startMarketplaceCleanupRun({
    mode: 'execute',
    triggeredBy: input.initiatedBy,
    policyVersion: plan.policy.version,
    plan,
  });

  const keys = plan.candidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => candidate.cacheKey);
  if (keys.length === 0) {
    const completed = await completeMarketplaceCleanupRun({
      runId: run.runId,
      status: 'succeeded',
      evictedEntries: 0,
      evictedBytes: 0,
    });
    return { run: completed, plan };
  }

  const db = getDb();
  let evictedEntries = 0;
  let evictedBytes = 0;
  const failures: string[] = [];
  let skippedByRecheck = 0;

  for (const cacheKey of keys) {
    try {
      const entry = (await db('plugin_marketplace_cache_entries')
        .select('cache_key', 'size_bytes')
        .where({ cache_key: cacheKey })
        .first()) as Record<string, unknown> | undefined;

      if (!entry) {
        continue;
      }

      const deleted = await db('plugin_marketplace_cache_entries')
        .where({ cache_key: cacheKey })
        .whereNotExists(
          db('plugin_marketplace_cache_pins')
            .select(1)
            .whereRaw(
              'plugin_marketplace_cache_pins.cache_key = plugin_marketplace_cache_entries.cache_key'
            )
            .whereNull('released_at')
        )
        .del();

      const deletedCount = parseFiniteNumber(deleted, 0);
      if (deletedCount > 0) {
        evictedEntries += deletedCount;
        evictedBytes += parseFiniteNumber((entry as { size_bytes?: unknown }).size_bytes, 0);
      } else {
        skippedByRecheck += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${cacheKey}:${message}`);
    }
  }

  const completed = await completeMarketplaceCleanupRun({
    runId: run.runId,
    status: failures.length > 0 ? 'failed' : 'succeeded',
    evictedEntries,
    evictedBytes,
    errorSummary:
      failures.length > 0 || skippedByRecheck > 0
        ? JSON.stringify({
            skippedByRecheck,
            failures,
          })
        : undefined,
  });

  return {
    run: completed,
    plan,
  };
}

export async function computeMarketplaceCacheHealthSummary(): Promise<CacheHealthSummary> {
  const [policy, entries, activePins, mirrors, latestAudit] = await Promise.all([
    getMarketplaceCachePolicy(),
    listMarketplaceCacheEntries(),
    listMarketplaceCachePins(),
    listMarketplaceMirrors(),
    getLatestMarketplaceIntegrityAuditRun(),
  ]);

  const pinnedKeys = new Set(activePins.map((pin) => pin.cacheKey));
  const usageBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const pinnedEntries = entries.filter((entry) => pinnedKeys.has(entry.cacheKey));
  const pinnedUsageBytes = pinnedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const evictableEntries = entries.filter((entry) => !pinnedKeys.has(entry.cacheKey));
  const evictableUsageBytes = evictableEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const enabledMirrors = mirrors.filter((mirror) => mirror.enabled);
  const degradedMirrors = enabledMirrors.filter(
    (mirror) => mirror.healthState === 'degraded' || mirror.healthState === 'error'
  );

  return {
    generatedAt: new Date().toISOString(),
    policy,
    usageBytes,
    usageEntries: entries.length,
    pinnedUsageBytes,
    pinnedEntries: pinnedEntries.length,
    evictableUsageBytes,
    evictableEntries: evictableEntries.length,
    mirrors: {
      total: mirrors.length,
      enabled: enabledMirrors.length,
      degraded: degradedMirrors.length,
    },
    audits: {
      latestRunId: latestAudit?.runId ?? null,
      latestStatus: latestAudit?.status ?? null,
      latestCompletedAt: latestAudit?.completedAt ?? null,
    },
    degraded: {
      overQuota: usageBytes > policy.maxCacheBytes,
      mirrorsDegraded: degradedMirrors.length > 0,
      latestAuditDegraded: Boolean(latestAudit?.degraded),
    },
  };
}
