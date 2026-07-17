import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PluginLifecycleError } from '@core/lib/plugin-lifecycle-errors';

const verifyAdmin = vi.hoisted(() => vi.fn());
const listPluginStates = vi.hoisted(() => vi.fn());
const orchestratePluginLifecycleMutation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/plugins', () => ({
  listPluginStates,
}));

vi.mock('@core/lib/plugin-lifecycle-orchestrator.server', () => ({
  orchestratePluginLifecycleMutation,
}));

import { PATCH, POST } from './route';

describe('admin plugins PATCH route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({
      sub: 'admin-123',
      email: 'admin@example.com',
      roles: ['admin'],
    });
    listPluginStates.mockResolvedValue([{ id: 'url-shortener' }]);
    orchestratePluginLifecycleMutation.mockResolvedValue(undefined);
  });

  it('delegates enable requests to enablePlugin with initiator identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'url-shortener', isEnabled: true }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(orchestratePluginLifecycleMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'enable',
        pluginId: 'url-shortener',
        initiatedBy: 'admin@example.com',
      })
    );
  });

  it('delegates disable requests to disablePlugin with initiator identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'url-shortener', isEnabled: false }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(orchestratePluginLifecycleMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'disable',
        pluginId: 'url-shortener',
        initiatedBy: 'admin@example.com',
      })
    );
  });

  it('returns conflict response for uninstalled-enable failures', async () => {
    orchestratePluginLifecycleMutation.mockRejectedValue(
      new Error('Cannot enable url-shortener: plugin is not installed')
    );

    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'url-shortener', isEnabled: true }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('not installed');
  });

  it('returns conflict response for reverse dependency rejection', async () => {
    orchestratePluginLifecycleMutation.mockRejectedValue(
      new Error('Cannot disable/uninstall/purge plugin-a: enabled dependent plugin-b requires it')
    );

    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'plugin-a', isEnabled: false }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('requires it');
  });

  it('delegates install requests to installPlugin with initiator identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'POST',
      body: JSON.stringify({ pluginId: 'url-shortener' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(orchestratePluginLifecycleMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'install',
        pluginId: 'url-shortener',
        initiatedBy: 'admin@example.com',
      })
    );
  });

  it('returns conflict response for install dependency rejection', async () => {
    orchestratePluginLifecycleMutation.mockRejectedValue(
      new Error('Plugin dependency dep-a is not installed for url-shortener')
    );

    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'POST',
      body: JSON.stringify({ pluginId: 'url-shortener' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('not installed');
  });

  it('maps stable lifecycle error metadata to response status and message', async () => {
    orchestratePluginLifecycleMutation.mockRejectedValue(
      new PluginLifecycleError({
        code: 'LIFECYCLE_INFRASTRUCTURE_UNAVAILABLE',
        internalDiagnostic: 'database unavailable',
      })
    );

    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'url-shortener', isEnabled: true }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('Lifecycle infrastructure is temporarily unavailable.');
  });
});
