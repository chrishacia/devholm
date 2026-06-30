import { getSetting, upsertSetting } from '@/db/settings';
import { decryptSecret, encryptSecret } from '@/lib/secret-store';

const GITHUB_UPDATES_CONFIG_KEY = 'github_updates_config';

interface GithubUpdatesConfig {
  tokenEncrypted: string | null;
  tokenHint: string | null;
  tokenUpdatedAt: string | null;
}

export interface PublicGithubUpdatesConfig {
  tokenConfigured: boolean;
  tokenHint: string | null;
  tokenUpdatedAt: string | null;
}

const defaultConfig: GithubUpdatesConfig = {
  tokenEncrypted: null,
  tokenHint: null,
  tokenUpdatedAt: null,
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseConfig(value: unknown): GithubUpdatesConfig {
  if (!value || typeof value !== 'object') {
    return { ...defaultConfig };
  }

  const source = value as Record<string, unknown>;
  return {
    tokenEncrypted: asNonEmptyString(source.tokenEncrypted),
    tokenHint: asNonEmptyString(source.tokenHint),
    tokenUpdatedAt: asNonEmptyString(source.tokenUpdatedAt),
  };
}

function makeTokenHint(token: string): string {
  if (token.length <= 8) {
    return `${token.slice(0, 2)}...${token.slice(-2)}`;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function getGithubUpdatesConfig(): Promise<GithubUpdatesConfig> {
  const value = await getSetting(GITHUB_UPDATES_CONFIG_KEY);
  return parseConfig(value);
}

export async function getGithubUpdatesTokenFromDb(): Promise<string | null> {
  const config = await getGithubUpdatesConfig();
  return decryptSecret(config.tokenEncrypted);
}

export async function setGithubUpdatesToken(token: string): Promise<PublicGithubUpdatesConfig> {
  const trimmed = token.trim();
  const next: GithubUpdatesConfig = {
    tokenEncrypted: encryptSecret(trimmed),
    tokenHint: makeTokenHint(trimmed),
    tokenUpdatedAt: new Date().toISOString(),
  };

  await upsertSetting(
    GITHUB_UPDATES_CONFIG_KEY,
    next,
    'json',
    'automation',
    'GitHub PAT for admin-triggered update workflows'
  );

  return toPublicGithubUpdatesConfig(next);
}

export function toPublicGithubUpdatesConfig(
  config: GithubUpdatesConfig
): PublicGithubUpdatesConfig {
  return {
    tokenConfigured: Boolean(config.tokenEncrypted),
    tokenHint: config.tokenHint,
    tokenUpdatedAt: config.tokenUpdatedAt,
  };
}
