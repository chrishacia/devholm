export interface SecurityAuditSeverityCounts {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

export interface SecurityAuditPolicyThreshold {
  maxHigh: number;
  maxCritical: number;
}

export type SecurityAuditEvaluation =
  | {
      outcome: 'pass';
      counts: SecurityAuditSeverityCounts;
      reason: 'policy-satisfied';
    }
  | {
      outcome: 'policy-failure';
      counts: SecurityAuditSeverityCounts;
      reason: 'high-or-critical-present';
    }
  | {
      outcome: 'scanner-failure';
      counts: null;
      reason: string;
    };

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.trunc(value);
  return rounded >= 0 ? rounded : 0;
}

export function evaluateSecurityAuditPayload(
  payload: unknown,
  threshold: SecurityAuditPolicyThreshold = { maxHigh: 0, maxCritical: 0 }
): SecurityAuditEvaluation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      outcome: 'scanner-failure',
      counts: null,
      reason: 'audit payload must be a JSON object',
    };
  }

  const record = payload as Record<string, unknown>;
  if (record.error) {
    return {
      outcome: 'scanner-failure',
      counts: null,
      reason: `audit scanner returned an error payload: ${JSON.stringify(record.error)}`,
    };
  }

  const metadata = record.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      outcome: 'scanner-failure',
      counts: null,
      reason: 'audit payload is missing metadata block',
    };
  }

  const vulnerabilities = (metadata as Record<string, unknown>).vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object' || Array.isArray(vulnerabilities)) {
    return {
      outcome: 'scanner-failure',
      counts: null,
      reason: 'audit payload is missing metadata.vulnerabilities block',
    };
  }

  const rawCounts = vulnerabilities as Record<string, unknown>;
  const counts: SecurityAuditSeverityCounts = {
    info: toNonNegativeInt(rawCounts.info),
    low: toNonNegativeInt(rawCounts.low),
    moderate: toNonNegativeInt(rawCounts.moderate),
    high: toNonNegativeInt(rawCounts.high),
    critical: toNonNegativeInt(rawCounts.critical),
    total: toNonNegativeInt(rawCounts.total),
  };

  const derivedTotal = counts.info + counts.low + counts.moderate + counts.high + counts.critical;
  if (counts.total === 0 && derivedTotal > 0) {
    counts.total = derivedTotal;
  }

  const policyFailed = counts.high > threshold.maxHigh || counts.critical > threshold.maxCritical;
  if (policyFailed) {
    return {
      outcome: 'policy-failure',
      counts,
      reason: 'high-or-critical-present',
    };
  }

  return {
    outcome: 'pass',
    counts,
    reason: 'policy-satisfied',
  };
}
