import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authConfig = vi.hoisted(() => ({
  setupBypassEnabled: false,
}));

const verifyAdmin = vi.hoisted(() => vi.fn());
const getAuthSettings = vi.hoisted(() => vi.fn());
const getAuthProviderSummaries = vi.hoisted(() => vi.fn());
const updateAuthProviderConfig = vi.hoisted(() => vi.fn());
const updateAuthSettings = vi.hoisted(() => vi.fn());
const getSiteInfo = vi.hoisted(() => vi.fn());
const getAuthorInfo = vi.hoisted(() => vi.fn());
const getSocialLinks = vi.hoisted(() => vi.fn());
const getSeoConfig = vi.hoisted(() => vi.fn());
const updateSettings = vi.hoisted(() => vi.fn());

vi.mock('@/config/env', () => ({
  auth: authConfig,
}));

vi.mock('@/db/auth', () => ({
  getAuthProviderSummaries,
  getAuthSettings,
  updateAuthProviderConfig,
  updateAuthSettings,
}));

vi.mock('@/db/settings', () => ({
  getAuthorInfo,
  getSeoConfig,
  getSiteInfo,
  getSocialLinks,
  updateSettings,
}));

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/lib/rate-limiter', () => ({
  RateLimits: {
    ADMIN_API: { limit: 100, windowMs: 60_000 },
  },
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 99,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET, POST } from './route';

describe('admin install wizard route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authConfig.setupBypassEnabled = false;
    verifyAdmin.mockResolvedValue({
      sub: 'admin-user-id',
      role: 'superadmin',
      roles: ['superadmin'],
    });
    getAuthSettings.mockResolvedValue({
      registrationEnabled: false,
      accountLinkingEnabled: true,
      installCompleted: false,
      setupBannerDismissed: false,
    });
    getSiteInfo.mockResolvedValue({
      name: 'DevHolm',
      description: 'desc',
      url: 'https://example.com',
    });
    getAuthorInfo.mockResolvedValue({ name: 'Owner', email: 'owner@example.com', tagline: 'tag' });
    getSocialLinks.mockResolvedValue({});
    getSeoConfig.mockResolvedValue({});
    getAuthProviderSummaries.mockResolvedValue([]);
  });

  it('locks GET after initial setup completes', async () => {
    getAuthSettings.mockResolvedValue({
      registrationEnabled: false,
      accountLinkingEnabled: true,
      installCompleted: true,
      setupBannerDismissed: false,
    });

    const request = new NextRequest('http://localhost:3000/api/admin/install-wizard');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body.code).toBe('INSTALL_WIZARD_LOCKED');
    expect(getSiteInfo).not.toHaveBeenCalled();
  });

  it('locks POST after initial setup completes', async () => {
    getAuthSettings.mockResolvedValue({
      registrationEnabled: false,
      accountLinkingEnabled: true,
      installCompleted: true,
      setupBannerDismissed: false,
    });

    const request = new NextRequest('http://localhost:3000/api/admin/install-wizard', {
      method: 'POST',
      body: JSON.stringify({
        site: { name: 'DevHolm', description: 'desc', url: 'https://example.com' },
        author: { name: 'Owner', email: 'owner@example.com', tagline: 'tag' },
        auth: { registrationEnabled: false, accountLinkingEnabled: true },
        providers: [],
      }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body.code).toBe('INSTALL_WIZARD_LOCKED');
    expect(updateSettings).not.toHaveBeenCalled();
    expect(updateAuthSettings).not.toHaveBeenCalled();
  });

  it('allows access when the private setup bypass is enabled', async () => {
    authConfig.setupBypassEnabled = true;
    getAuthSettings.mockResolvedValue({
      registrationEnabled: false,
      accountLinkingEnabled: true,
      installCompleted: true,
      setupBannerDismissed: false,
    });

    const request = new NextRequest('http://localhost:3000/api/admin/install-wizard');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.auth.installCompleted).toBe(true);
    expect(body.data.recoveryOverrideEnabled).toBe(true);
  });
});
