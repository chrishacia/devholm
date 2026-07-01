export interface BuildInfo {
  version: string;
  buildSha: string;
}

export interface LatestReleaseInfo {
  repo: string;
  tagName: string;
  version: string;
  name: string;
  url: string;
  publishedAt: string;
}

export interface UpdateStatus {
  sourceRepo: string;
  current: BuildInfo;
  latest: LatestReleaseInfo | null;
  updateAvailable: boolean | null;
  warning?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function getGithubApiToken(explicitToken?: string | null): string {
  const explicit = (explicitToken || '').trim();
  if (explicit) {
    return explicit;
  }

  return (
    process.env.DEVHOLM_TEMPLATE_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  ).trim();
}

function buildGithubHeaders(explicitToken?: string | null): HeadersInit {
  const token = getGithubApiToken(explicitToken);

  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devholm-update-checker',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function cleanVersionPart(part: string): number {
  const match = part.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function normalizeVersion(value: string | null | undefined): string {
  if (!value) {
    return '0.0.0';
  }

  const trimmed = value.trim();
  const withoutPrefix = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  const withoutBuild = withoutPrefix.split('+')[0]?.trim() ?? '';
  return withoutBuild || '0.0.0';
}

export function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split('.');
  const right = normalizeVersion(b).split('.');
  const maxLen = Math.max(left.length, right.length);

  for (let i = 0; i < maxLen; i += 1) {
    const l = cleanVersionPart(left[i] ?? '0');
    const r = cleanVersionPart(right[i] ?? '0');
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

export function getCurrentBuildInfo(): BuildInfo {
  const configuredFrameworkVersion = (process.env.DEVHOLM_FRAMEWORK_VERSION || '').trim();
  const buildSha =
    process.env.GITHUB_SHA || process.env.COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA || '';

  return {
    version: configuredFrameworkVersion ? normalizeVersion(configuredFrameworkVersion) : 'unknown',
    buildSha,
  };
}

export async function fetchLatestRelease(
  repo: string,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<LatestReleaseInfo | null> {
  const endpoint = `https://api.github.com/repos/${repo}/releases/latest`;
  const response = await fetchImpl(endpoint, {
    headers: buildGithubHeaders(explicitToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const tagName = typeof payload.tag_name === 'string' ? payload.tag_name : '';

  if (!tagName) {
    return null;
  }

  return {
    repo,
    tagName,
    version: normalizeVersion(tagName),
    name: typeof payload.name === 'string' ? payload.name : tagName,
    url:
      typeof payload.html_url === 'string'
        ? payload.html_url
        : `https://github.com/${repo}/releases`,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : '',
  };
}

export async function fetchLatestTag(
  repo: string,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<LatestReleaseInfo | null> {
  const endpoint = `https://api.github.com/repos/${repo}/tags?per_page=1`;
  const response = await fetchImpl(endpoint, {
    headers: buildGithubHeaders(explicitToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Array<Record<string, unknown>>;
  const firstTag = payload[0];
  const tagName = typeof firstTag?.name === 'string' ? firstTag.name : '';

  if (!tagName) {
    return null;
  }

  return {
    repo,
    tagName,
    version: normalizeVersion(tagName),
    name: tagName,
    url: `https://github.com/${repo}/tree/${encodeURIComponent(tagName)}`,
    publishedAt: '',
  };
}

export async function getUpdateStatus(
  sourceRepo: string,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<UpdateStatus> {
  const current = getCurrentBuildInfo();
  const hasGithubToken = Boolean(getGithubApiToken(explicitToken));
  const hasExplicitFrameworkVersion = current.version !== 'unknown';

  try {
    const latest =
      (await fetchLatestRelease(sourceRepo, fetchImpl, explicitToken)) ??
      (await fetchLatestTag(sourceRepo, fetchImpl, explicitToken));

    const warnings: string[] = [];
    if (!hasExplicitFrameworkVersion) {
      warnings.push(
        'Current DevHolm framework version is unknown. Set DEVHOLM_FRAMEWORK_VERSION in your deployment environment to compare the installed framework version against upstream.'
      );
    }
    if (!latest) {
      warnings.push(
        hasGithubToken
          ? 'Unable to determine latest release or tag metadata for source repository.'
          : 'Source repository metadata is unavailable. If the template repo is private, configure the GitHub token in Admin -> Updates so the backend can read releases and tags.'
      );
    }

    return {
      sourceRepo,
      current,
      latest,
      updateAvailable:
        latest && hasExplicitFrameworkVersion
          ? compareVersions(current.version, latest.version) < 0
          : null,
      warning: warnings.length > 0 ? warnings.join(' ') : undefined,
    };
  } catch (error) {
    return {
      sourceRepo,
      current,
      latest: null,
      updateAvailable: null,
      warning: error instanceof Error ? error.message : 'Unknown update check failure',
    };
  }
}
