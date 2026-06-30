import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getSetting, upsertSetting } from '@/db/settings';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

const AUTOMATION_SETTING_KEY = 'automation_agent_config';

export interface AutomationAgentConfig {
  enabled: boolean;
  postsEnabled: boolean;
  messagesReadEnabled: boolean;
  messagesWriteEnabled: boolean;
  allowCustomAuthor: boolean;
  defaultAuthorId: string | null;
  tokenExpiresAt: string | null;
  allowedIps: string[];
  requireHttps: boolean;
  tokenHash: string | null;
  tokenHint: string | null;
  tokenUpdatedAt: string | null;
}

export interface PublicAutomationAgentConfig {
  enabled: boolean;
  postsEnabled: boolean;
  messagesReadEnabled: boolean;
  messagesWriteEnabled: boolean;
  allowCustomAuthor: boolean;
  defaultAuthorId: string | null;
  tokenExpiresAt: string | null;
  allowedIps: string[];
  requireHttps: boolean;
  tokenConfigured: boolean;
  tokenHint: string | null;
  tokenUpdatedAt: string | null;
}

const defaultConfig: AutomationAgentConfig = {
  enabled: false,
  postsEnabled: false,
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
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseConfig(value: unknown): AutomationAgentConfig {
  if (!value || typeof value !== 'object') {
    return { ...defaultConfig };
  }

  const source = value as Record<string, unknown>;
  return {
    enabled: source.enabled === true,
    postsEnabled: source.postsEnabled === true,
    messagesReadEnabled: source.messagesReadEnabled === true,
    messagesWriteEnabled: source.messagesWriteEnabled === true,
    allowCustomAuthor: source.allowCustomAuthor === true,
    defaultAuthorId: asNonEmptyString(source.defaultAuthorId),
    tokenExpiresAt: asNonEmptyString(source.tokenExpiresAt),
    allowedIps: parseStringArray(source.allowedIps),
    requireHttps: source.requireHttps !== false,
    tokenHash: asNonEmptyString(source.tokenHash),
    tokenHint: asNonEmptyString(source.tokenHint),
    tokenUpdatedAt: asNonEmptyString(source.tokenUpdatedAt),
  };
}

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAgentToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createAgentTokenExpiry(days = 30): string {
  const now = Date.now();
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length >= 32 ? token : null;
}

function isExpired(iso: string | null): boolean {
  if (!iso) {
    return false;
  }

  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return true;
  }

  return at <= Date.now();
}

function isHttps(request: NextRequest): boolean {
  const protoHeader = request.headers.get('x-forwarded-proto');
  if (protoHeader) {
    return protoHeader.split(',')[0].trim().toLowerCase() === 'https';
  }

  return new URL(request.url).protocol === 'https:';
}

function isAllowedIp(request: NextRequest, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) {
    return true;
  }

  const clientIp = getClientIp(request);
  return allowedIps.includes(clientIp);
}

async function validateReplayHeaders(request: NextRequest): Promise<boolean> {
  const timestamp = request.headers.get('x-agent-timestamp');
  const nonce = request.headers.get('x-agent-nonce');

  if (!timestamp || !nonce) {
    return false;
  }

  if (!/^\d{10}$/.test(timestamp)) {
    return false;
  }

  if (!/^[A-Za-z0-9_-]{12,128}$/.test(nonce)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (Math.abs(now - ts) > 300) {
    return false;
  }

  const nonceCheck = await checkRateLimit({
    action: 'agent-request-nonce',
    identifier: nonce,
    maxRequests: 1,
    windowMs: 10 * 60 * 1000,
  });

  return nonceCheck.allowed;
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function getAutomationAgentConfig(): Promise<AutomationAgentConfig> {
  const value = await getSetting(AUTOMATION_SETTING_KEY);
  return parseConfig(value);
}

export async function setAutomationAgentConfig(
  updates: Partial<AutomationAgentConfig>
): Promise<AutomationAgentConfig> {
  const current = await getAutomationAgentConfig();
  const next: AutomationAgentConfig = {
    enabled: updates.enabled ?? current.enabled,
    postsEnabled: updates.postsEnabled ?? current.postsEnabled,
    messagesReadEnabled: updates.messagesReadEnabled ?? current.messagesReadEnabled,
    messagesWriteEnabled: updates.messagesWriteEnabled ?? current.messagesWriteEnabled,
    allowCustomAuthor: updates.allowCustomAuthor ?? current.allowCustomAuthor,
    defaultAuthorId: asNonEmptyString(updates.defaultAuthorId ?? current.defaultAuthorId),
    tokenExpiresAt: asNonEmptyString(updates.tokenExpiresAt ?? current.tokenExpiresAt),
    allowedIps: updates.allowedIps ? parseStringArray(updates.allowedIps) : current.allowedIps,
    requireHttps: updates.requireHttps ?? current.requireHttps,
    tokenHash: asNonEmptyString(updates.tokenHash ?? current.tokenHash),
    tokenHint: asNonEmptyString(updates.tokenHint ?? current.tokenHint),
    tokenUpdatedAt: asNonEmptyString(updates.tokenUpdatedAt ?? current.tokenUpdatedAt),
  };

  await upsertSetting(
    AUTOMATION_SETTING_KEY,
    next,
    'json',
    'automation',
    'Agent automation config'
  );
  return next;
}

export function toPublicAutomationConfig(
  config: AutomationAgentConfig
): PublicAutomationAgentConfig {
  return {
    enabled: config.enabled,
    postsEnabled: config.postsEnabled,
    messagesReadEnabled: config.messagesReadEnabled,
    messagesWriteEnabled: config.messagesWriteEnabled,
    allowCustomAuthor: config.allowCustomAuthor,
    defaultAuthorId: config.defaultAuthorId,
    tokenExpiresAt: config.tokenExpiresAt,
    allowedIps: config.allowedIps,
    requireHttps: config.requireHttps,
    tokenConfigured: Boolean(config.tokenHash),
    tokenHint: config.tokenHint,
    tokenUpdatedAt: config.tokenUpdatedAt,
  };
}

export async function verifyAutomationAgentToken(
  request: NextRequest
): Promise<AutomationAgentConfig | null> {
  const config = await getAutomationAgentConfig();
  if (!config.enabled || !config.tokenHash) {
    return null;
  }

  if (config.requireHttps && !isHttps(request)) {
    return null;
  }

  if (!isAllowedIp(request, config.allowedIps)) {
    return null;
  }

  if (isExpired(config.tokenExpiresAt)) {
    return null;
  }

  const replaySafe = await validateReplayHeaders(request);
  if (!replaySafe) {
    return null;
  }

  const bearer = parseBearerToken(request);
  if (!bearer) {
    return null;
  }

  const incomingHash = hashAgentToken(bearer);
  if (!safeHashEquals(config.tokenHash, incomingHash)) {
    return null;
  }

  return config;
}
