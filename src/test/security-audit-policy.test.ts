import { describe, expect, it } from 'vitest';
import { evaluateSecurityAuditPayload } from '@core/lib/security-audit-policy';

function payloadWithCounts(counts: Partial<Record<string, number>>) {
  return {
    metadata: {
      vulnerabilities: {
        info: counts.info ?? 0,
        low: counts.low ?? 0,
        moderate: counts.moderate ?? 0,
        high: counts.high ?? 0,
        critical: counts.critical ?? 0,
        total:
          counts.total ??
          (counts.info ?? 0) +
            (counts.low ?? 0) +
            (counts.moderate ?? 0) +
            (counts.high ?? 0) +
            (counts.critical ?? 0),
      },
    },
  };
}

describe('security audit policy evaluator', () => {
  it('passes when only low and moderate vulnerabilities are present', () => {
    const result = evaluateSecurityAuditPayload(payloadWithCounts({ low: 1, moderate: 4 }));
    expect(result.outcome).toBe('pass');
    if (result.outcome !== 'pass') {
      throw new Error('expected pass outcome');
    }
    expect(result.counts.high).toBe(0);
    expect(result.counts.critical).toBe(0);
  });

  it('fails policy when high vulnerabilities are present', () => {
    const result = evaluateSecurityAuditPayload(payloadWithCounts({ high: 1, moderate: 2 }));
    expect(result.outcome).toBe('policy-failure');
    if (result.outcome !== 'policy-failure') {
      throw new Error('expected policy-failure outcome');
    }
    expect(result.reason).toBe('high-or-critical-present');
  });

  it('fails policy when critical vulnerabilities are present', () => {
    const result = evaluateSecurityAuditPayload(payloadWithCounts({ critical: 1 }));
    expect(result.outcome).toBe('policy-failure');
  });

  it('reports scanner failure for malformed payload', () => {
    const result = evaluateSecurityAuditPayload({ bad: 'shape' });
    expect(result.outcome).toBe('scanner-failure');
  });

  it('reports scanner failure for explicit audit error payload', () => {
    const result = evaluateSecurityAuditPayload({
      error: {
        code: 'ERR_TEST',
        summary: 'simulated scanner error',
      },
    });
    expect(result.outcome).toBe('scanner-failure');
  });
});
