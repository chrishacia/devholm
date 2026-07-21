import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const runPluginLifecycleRecoveryScan = vi.hoisted(() => vi.fn());
const reconcileSinglePluginLifecycle = vi.hoisted(() => vi.fn());
const initializePluginStartupReconciliation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@core/lib/plugin-lifecycle-recovery-runner.server', () => ({
  runPluginLifecycleRecoveryScan,
  reconcileSinglePluginLifecycle,
}));

vi.mock('@core/lib/plugin-startup-reconciliation.server', () => ({
  initializePluginStartupReconciliation,
}));

import { POST } from './route';

describe('admin plugin recovery reconcile route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({
      sub: 'admin-123',
      email: 'admin@example.com',
      roles: ['admin'],
    });
    runPluginLifecycleRecoveryScan.mockResolvedValue({
      scannedAt: '2026-07-16T00:00:00.000Z',
      pluginCount: 1,
      results: [
        {
          pluginId: 'url-shortener',
          action: 'none',
          reason: 'No nonterminal lifecycle operation detected.',
          operationId: null,
          cutover: {
            pluginId: 'url-shortener',
            classification: 'already-canonical',
            reason: 'installed plugin has canonical lifecycle state and no reconciliation blockers',
            blocking: false,
            evidence: {
              installed: true,
              enabled: true,
              lifecycleState: 'installed',
              operationStatus: 'idle',
              reconciliationAction: 'none',
              hasInterruptedMigrationCheckpoint: false,
              rollbackCompatible: true,
            },
          },
          snapshot: {
            pluginId: 'url-shortener',
            hasEnabledSetting: true,
            enabledSettingValue: 'true',
            hasLifecycleRecord: true,
            lifecycleState: 'installed',
            operationStatus: 'idle',
            installedVersion: '0.1.0',
            activeLifecycleOperationCount: 0,
            runningMigrationCheckpointCount: 0,
            succeededMigrationCount: 3,
            contradictoryState: false,
            contradictionReasons: [],
          },
        },
      ],
    });
    reconcileSinglePluginLifecycle.mockResolvedValue({
      action: 'require-recovery',
      reason: 'Interrupted migration checkpoint requires reconciliation.',
      operationId: 'op-1',
    });
    initializePluginStartupReconciliation.mockResolvedValue(undefined);
  });

  it('returns unauthorized when admin token is missing', async () => {
    verifyAdmin.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('runs bounded scan when pluginId is not provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(initializePluginStartupReconciliation).toHaveBeenCalledTimes(1);
    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledWith({ limit: 10 });
    expect(body.pluginCount).toBe(1);
  });

  it('reconciles a single plugin when pluginId is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ pluginId: 'url-shortener' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(initializePluginStartupReconciliation).toHaveBeenCalledTimes(1);
    expect(reconcileSinglePluginLifecycle).toHaveBeenCalledWith('url-shortener');
    expect(body.results[0].action).toBe('require-recovery');
  });

  it('remains executable when recovery is required and routes to recovery runner', async () => {
    runPluginLifecycleRecoveryScan.mockResolvedValueOnce({
      scannedAt: '2026-07-20T00:00:00.000Z',
      pluginCount: 1,
      results: [
        {
          pluginId: 'url-shortener',
          action: 'require-recovery',
          reason: 'Interrupted migration checkpoint requires reconciliation.',
          operationId: 'op-42',
          cutover: {
            pluginId: 'url-shortener',
            classification: 'recovery-required',
            reason: 'Interrupted migration checkpoint requires reconciliation.',
            blocking: true,
            evidence: {
              installed: true,
              enabled: true,
              lifecycleState: 'installed',
              operationStatus: 'idle',
              reconciliationAction: 'require-recovery',
              hasInterruptedMigrationCheckpoint: true,
              rollbackCompatible: true,
            },
          },
          snapshot: {
            pluginId: 'url-shortener',
            hasEnabledSetting: true,
            enabledSettingValue: 'true',
            hasLifecycleRecord: true,
            lifecycleState: 'installed',
            operationStatus: 'idle',
            installedVersion: '0.1.0',
            activeLifecycleOperationCount: 1,
            runningMigrationCheckpointCount: 1,
            succeededMigrationCount: 3,
            contradictoryState: false,
            contradictionReasons: [],
          },
        },
      ],
    });

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ limit: 50 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(initializePluginStartupReconciliation).toHaveBeenCalledTimes(1);
    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledWith({ limit: 50 });
    expect(body.results[0].action).toBe('require-recovery');
    expect(body.results[0].cutover.classification).toBe('recovery-required');
    expect(body.results[0].snapshot.pluginId).toBe('url-shortener');
  });

  it('returns contradictory legacy states as blocking cutover classifications', async () => {
    runPluginLifecycleRecoveryScan.mockResolvedValueOnce({
      scannedAt: '2026-07-20T00:00:00.000Z',
      pluginCount: 1,
      results: [
        {
          pluginId: 'gallery',
          action: 'none',
          reason: 'No nonterminal lifecycle operation detected.',
          operationId: null,
          cutover: {
            pluginId: 'gallery',
            classification: 'incompatible-legacy-state',
            reason: 'bundled lifecycle state cannot be installed=true',
            blocking: true,
            evidence: {
              installed: true,
              enabled: true,
              lifecycleState: 'bundled',
              operationStatus: 'idle',
              reconciliationAction: 'none',
              hasInterruptedMigrationCheckpoint: false,
              rollbackCompatible: true,
            },
          },
          snapshot: {
            pluginId: 'gallery',
            hasEnabledSetting: true,
            enabledSettingValue: 'true',
            hasLifecycleRecord: true,
            lifecycleState: 'bundled',
            operationStatus: 'idle',
            installedVersion: '0.1.0',
            activeLifecycleOperationCount: 0,
            runningMigrationCheckpointCount: 0,
            succeededMigrationCount: 1,
            contradictoryState: true,
            contradictionReasons: ['bundled-state-has-installed-version'],
          },
        },
      ],
    });

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ limit: 1 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0].cutover.blocking).toBe(true);
    expect(body.results[0].cutover.classification).toBe('incompatible-legacy-state');
    expect(body.results[0].snapshot.contradictoryState).toBe(true);
  });

  it('maps initialization failures to safe recovery error response', async () => {
    initializePluginStartupReconciliation.mockRejectedValueOnce(
      new Error('startup inspection infrastructure unavailable')
    );

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.reasonCode).toBe('lifecycle-recovery-scan-failed');
  });
});
