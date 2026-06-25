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
  return withoutPrefix || '0.0.0';
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
  const buildSha =
    process.env.GITHUB_SHA || process.env.COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA || '';

  return {
    version: normalizeVersion(
      process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version
    ),
    buildSha,
  };
}

export async function fetchLatestRelease(
  repo: string,
  fetchImpl: FetchLike = fetch
): Promise<LatestReleaseInfo | null> {
  const endpoint = `https://api.github.com/repos/${repo}/releases/latest`;
  const response = await fetchImpl(endpoint, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'devholm-update-checker',
    },
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

export async function getUpdateStatus(
  sourceRepo: string,
  fetchImpl: FetchLike = fetch
): Promise<UpdateStatus> {
  const current = getCurrentBuildInfo();

  try {
    const latest = await fetchLatestRelease(sourceRepo, fetchImpl);
    return {
      sourceRepo,
      current,
      latest,
      updateAvailable: latest ? compareVersions(current.version, latest.version) < 0 : null,
      ...(latest
        ? {}
        : { warning: 'Unable to determine latest release metadata for source repository.' }),
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
