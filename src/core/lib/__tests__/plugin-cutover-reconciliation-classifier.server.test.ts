import { describe, expect, it } from 'vitest';
import { classifyPluginCutoverState } from '@core/lib/plugin-cutover-reconciliation-classifier.server';

function plugin(
  overrides: Partial<{
    id: string;
    installed: boolean;
    isEnabled: boolean;
    lifecycleState: 'bundled' | 'installed' | 'disabled' | 'uninstalled';
    operationStatus:
      | 'idle'
      | 'pending_install'
      | 'pending_upgrade'
      | 'pending_disable'
      | 'pending_uninstall'
      | 'pending_purge'
      | 'error';
  }>
) {
  return {
    id: overrides.id ?? 'url-shortener',
    bundled: true,
    name: 'URL Shortener',
    description: null,
    source: 'user' as const,
    enabledByDefault: false,
    adminSurface: null,
    capabilities: {
      admin: true,
      api: true,
      publicRoutes: true,
      navigation: true,
      sitemap: false,
      embeds: false,
    },
    installed: overrides.installed ?? true,
    isEnabled: overrides.isEnabled ?? true,
    lifecycleState: overrides.lifecycleState ?? 'installed',
    operationStatus: overrides.operationStatus ?? 'idle',
    installedVersion: '0.1.0',
    bundledVersion: '0.1.0',
    updatedAt: null,
  };
}

describe('plugin cutover reconciliation classifier', () => {
  it('classifies canonical installed state as already-canonical', () => {
    const result = classifyPluginCutoverState({
      plugin: plugin({}),
      reconciliation: {
        action: 'none',
        reason: 'No nonterminal lifecycle operation detected.',
        operationId: null,
      },
      hasInterruptedMigrationCheckpoint: false,
      rollbackCompatible: true,
    });

    expect(result.classification).toBe('already-canonical');
    expect(result.blocking).toBe(false);
  });

  it('classifies recovery-required reconciliation as blocking', () => {
    const result = classifyPluginCutoverState({
      plugin: plugin({}),
      reconciliation: {
        action: 'require-recovery',
        reason: 'Interrupted migration checkpoint requires reconciliation.',
        operationId: 'op-1',
      },
      hasInterruptedMigrationCheckpoint: true,
      rollbackCompatible: true,
    });

    expect(result.classification).toBe('recovery-required');
    expect(result.blocking).toBe(true);
  });

  it('uses checkpoint-specific reason when checkpoint is blocker but reconciliation reason differs', () => {
    const result = classifyPluginCutoverState({
      plugin: plugin({
        operationStatus: 'idle',
      }),
      reconciliation: {
        action: 'resume-safe-retry',
        reason: 'Active operation lease is still valid and may continue safely.',
        operationId: 'op-3',
      },
      hasInterruptedMigrationCheckpoint: true,
      rollbackCompatible: true,
    });

    expect(result.classification).toBe('recovery-required');
    expect(result.blocking).toBe(true);
    expect(result.reason).toBe('Interrupted migration checkpoint requires reconciliation.');
  });

  it('classifies schedule-rollback as blocking rollback-required', () => {
    const result = classifyPluginCutoverState({
      plugin: plugin({}),
      reconciliation: {
        action: 'schedule-rollback',
        reason: 'Expired operation requires rollback path.',
        operationId: 'op-2',
      },
      hasInterruptedMigrationCheckpoint: false,
      rollbackCompatible: true,
    });

    expect(result.classification).toBe('rollback-required');
    expect(result.blocking).toBe(true);
  });

  it('classifies bundled-only state as safe-automatic-migration', () => {
    const result = classifyPluginCutoverState({
      plugin: plugin({
        installed: false,
        isEnabled: false,
        lifecycleState: 'bundled',
      }),
      reconciliation: {
        action: 'none',
        reason: 'No nonterminal lifecycle operation detected.',
        operationId: null,
      },
      hasInterruptedMigrationCheckpoint: false,
      rollbackCompatible: true,
    });

    expect(result.classification).toBe('safe-automatic-migration');
    expect(result.blocking).toBe(false);
  });

  it('classifies contradictory bundled-installed state as incompatible legacy', () => {
    const result = classifyPluginCutoverState({
      plugin: plugin({
        installed: true,
        lifecycleState: 'bundled',
      }),
      reconciliation: {
        action: 'none',
        reason: 'No nonterminal lifecycle operation detected.',
        operationId: null,
      },
      hasInterruptedMigrationCheckpoint: false,
      rollbackCompatible: true,
    });

    expect(result.classification).toBe('incompatible-legacy-state');
    expect(result.blocking).toBe(true);
  });
});
