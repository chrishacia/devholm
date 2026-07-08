import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const listPluginStates = vi.hoisted(() => vi.fn());
const enablePlugin = vi.hoisted(() => vi.fn());
const disablePlugin = vi.hoisted(() => vi.fn());
const installPlugin = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/plugins', () => ({
  listPluginStates,
}));

vi.mock('@core/lib/plugin-lifecycle.server', () => ({
  enablePlugin,
  disablePlugin,
  installPlugin,
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
    enablePlugin.mockResolvedValue(undefined);
    disablePlugin.mockResolvedValue(undefined);
    installPlugin.mockResolvedValue(undefined);
  });

  it('delegates enable requests to enablePlugin with initiator identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'url-shortener', isEnabled: true }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(enablePlugin).toHaveBeenCalledWith('url-shortener', 'admin@example.com');
    expect(disablePlugin).not.toHaveBeenCalled();
  });

  it('delegates disable requests to disablePlugin with initiator identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins', {
      method: 'PATCH',
      body: JSON.stringify({ pluginId: 'url-shortener', isEnabled: false }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(disablePlugin).toHaveBeenCalledWith('url-shortener', 'admin@example.com');
    expect(enablePlugin).not.toHaveBeenCalled();
  });

  it('returns conflict response for uninstalled-enable failures', async () => {
    enablePlugin.mockRejectedValue(
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
    disablePlugin.mockRejectedValue(
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
    expect(installPlugin).toHaveBeenCalledWith('url-shortener', {
      initiatedBy: 'admin@example.com',
    });
  });

  it('returns conflict response for install dependency rejection', async () => {
    installPlugin.mockRejectedValue(
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
});
