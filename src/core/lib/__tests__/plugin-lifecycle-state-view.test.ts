import { describe, expect, it } from 'vitest';
import { deriveCanonicalMarketplaceLifecycleView } from '@core/lib/plugin-lifecycle-state-view.server';

describe('canonical marketplace lifecycle view', () => {
  it('derives active deployed state from installed and enabled plugin data', () => {
    const view = deriveCanonicalMarketplaceLifecycleView({
      installed: true,
      enabled: true,
      operation: {
        hasActive: false,
        status: 'succeeded',
        stage: 'complete',
        recoveryRequired: false,
      },
      signature: {
        decision: 'trusted',
        status: 'verified',
      },
      trustPolicy: {
        outcome: 'allow',
        reasonCode: 'allowed',
      },
      sourceResolutionHasErrors: false,
      history: [],
      nowMs: Date.UTC(2026, 6, 16),
    });

    expect(view.axes.runtime).toBe('active');
    expect(view.axes.deployment).toBe('deployed');
    expect(view.axes.build).toBe('build-included');
    expect(view.summaryState).toBe('active');
    expect(view.validationErrors).toEqual([]);
  });

  it('prefers rollback availability when a durable rollback candidate exists', () => {
    const view = deriveCanonicalMarketplaceLifecycleView({
      installed: true,
      enabled: false,
      operation: {
        hasActive: false,
        status: 'succeeded',
        stage: 'complete',
        recoveryRequired: false,
      },
      signature: {
        decision: 'trusted',
        status: 'verified',
      },
      trustPolicy: {
        outcome: 'allow',
        reasonCode: 'allowed',
      },
      sourceResolutionHasErrors: false,
      history: [
        {
          status: 'success',
          rollbackAvailableUntil: '2030-01-01T00:00:00.000Z',
        },
      ],
      nowMs: Date.UTC(2026, 6, 16),
    });

    expect(view.axes.recovery).toBe('rollback-available');
    expect(view.axes.runtime).toBe('disabled');
    expect(view.summaryState).toBe('rollback-available');
    expect(view.validationErrors).toEqual([]);
  });

  it('produces deterministic state for identical inputs', () => {
    const input: Parameters<typeof deriveCanonicalMarketplaceLifecycleView>[0] = {
      installed: true,
      enabled: true,
      operation: {
        hasActive: true,
        status: 'in_progress',
        stage: 'promote_active',
        recoveryRequired: false,
      },
      signature: {
        decision: 'trusted' as const,
        status: 'verified',
      },
      trustPolicy: {
        outcome: 'allow' as const,
        reasonCode: 'allowed',
      },
      sourceResolutionHasErrors: false,
      history: [],
      nowMs: Date.UTC(2026, 6, 16),
    };

    const first = deriveCanonicalMarketplaceLifecycleView(input);
    const second = deriveCanonicalMarketplaceLifecycleView(input);

    expect(second).toEqual(first);
    expect(first.summaryState).toBe('active');
    expect(first.axes.deployment).toBe('deploying');
  });
});
