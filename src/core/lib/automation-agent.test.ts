import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getSetting = vi.hoisted(() => vi.fn());
const upsertSetting = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const getClientIp = vi.hoisted(() => vi.fn());

vi.mock('@/db/settings', () => ({
  getSetting,
  upsertSetting,
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit,
  getClientIp,
}));

import {
  createAgentToken,
  getAutomationAgentConfig,
  hashAgentToken,
  setAutomationAgentConfig,
  verifyAutomationAgentToken,
} from './automation-agent';

describe('automation-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
    getClientIp.mockReturnValue('127.0.0.1');
  });

  it('returns safe defaults when setting is missing', async () => {
    getSetting.mockResolvedValue(null);

    const config = await getAutomationAgentConfig();

    expect(config.enabled).toBe(false);
    expect(config.postsEnabled).toBe(false);
    expect(config.tokenHash).toBeNull();
  });

  it('persists merged updates without dropping existing booleans', async () => {
    getSetting.mockResolvedValue({
      enabled: true,
      postsEnabled: true,
      messagesReadEnabled: false,
      messagesWriteEnabled: false,
      allowCustomAuthor: false,
      defaultAuthorId: null,
      tokenExpiresAt: null,
      allowedIps: [],
      requireHttps: true,
      tokenHash: null,
      tokenHint: null,
      tokenUpdatedAt: null,
    });

    const updated = await setAutomationAgentConfig({ messagesReadEnabled: true });

    expect(updated.enabled).toBe(true);
    expect(updated.postsEnabled).toBe(true);
    expect(updated.messagesReadEnabled).toBe(true);
    expect(upsertSetting).toHaveBeenCalledTimes(1);
  });

  it('verifies bearer token hash when automation is enabled', async () => {
    const token = createAgentToken();
    getSetting.mockResolvedValue({
      enabled: true,
      postsEnabled: true,
      messagesReadEnabled: true,
      messagesWriteEnabled: false,
      allowCustomAuthor: false,
      defaultAuthorId: null,
      tokenExpiresAt: null,
      allowedIps: [],
      requireHttps: false,
      tokenHash: hashAgentToken(token),
      tokenHint: 'hint',
      tokenUpdatedAt: new Date().toISOString(),
    });

    const request = new NextRequest('http://localhost:3000/api/agent/posts', {
      headers: {
        authorization: `Bearer ${token}`,
        'x-agent-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-agent-nonce': 'nonce_1234567890',
        'x-forwarded-proto': 'https',
      },
    });

    const result = await verifyAutomationAgentToken(request);
    expect(result).not.toBeNull();
    expect(result?.enabled).toBe(true);
  });

  it('rejects invalid bearer token', async () => {
    getSetting.mockResolvedValue({
      enabled: true,
      postsEnabled: true,
      messagesReadEnabled: true,
      messagesWriteEnabled: true,
      allowCustomAuthor: false,
      defaultAuthorId: null,
      tokenExpiresAt: null,
      allowedIps: [],
      requireHttps: false,
      tokenHash: hashAgentToken('correct-token'),
      tokenHint: 'hint',
      tokenUpdatedAt: new Date().toISOString(),
    });

    const request = new NextRequest('http://localhost:3000/api/agent/posts', {
      headers: {
        authorization: 'Bearer wrong-token',
        'x-agent-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-agent-nonce': 'nonce_abcdefghij',
        'x-forwarded-proto': 'https',
      },
    });

    const result = await verifyAutomationAgentToken(request);
    expect(result).toBeNull();
  });
});
