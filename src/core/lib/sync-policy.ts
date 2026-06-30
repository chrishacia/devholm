const SAFE_PREFIXES = ['src/user/', '.github/', 'nginx/'] as const;

const SAFE_EXACT = new Set([
  'devholm.config.ts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-entrypoint.sh',
  'README.md',
  'DEPLOYMENT.md',
  'GITHUB_SECRETS.md',
]);

function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^"|"$/g, '').trim();
}

function normalizeAllowlistPattern(pattern: string): string {
  return pattern.replaceAll('\\', '/').trim();
}

function normalizeStatusPath(rawPath: string): string {
  const normalized = normalizeRepoPath(rawPath);
  const renameTarget = normalized.includes(' -> ')
    ? normalized.slice(normalized.indexOf(' -> ') + 4)
    : normalized;
  return renameTarget.trim();
}

export function isDownstreamSafePath(filePath: string): boolean {
  const normalized = normalizeRepoPath(filePath);
  return (
    SAFE_EXACT.has(normalized) || SAFE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function parsePorcelainChangedFiles(statusOutput: string): string[] {
  const files = statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.replace(/^..\s+/, ''))
    .map((entry) => normalizeStatusPath(entry))
    .filter(Boolean);

  return Array.from(new Set(files));
}

export function parseNameOnlyChangedFiles(diffOutput: string): string[] {
  const files = diffOutput
    .split('\n')
    .map((line) => normalizeRepoPath(line))
    .filter(Boolean);

  return Array.from(new Set(files));
}

export function parseAllowlistPatterns(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => normalizeAllowlistPattern(line));
}

export function isAllowlisted(filePath: string, patterns: string[]): boolean {
  const normalizedPath = normalizeRepoPath(filePath);

  return patterns.some((rawPattern) => {
    const pattern = normalizeAllowlistPattern(rawPattern);
    if (!pattern) {
      return false;
    }

    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return normalizedPath.startsWith(prefix);
    }

    return normalizedPath === pattern;
  });
}

export function classifyDownstreamBoundary(files: string[], allowlistPatterns: string[] = []) {
  const safeFiles: string[] = [];
  const unsafeFiles: string[] = [];

  for (const filePath of files) {
    if (isDownstreamSafePath(filePath) || isAllowlisted(filePath, allowlistPatterns)) {
      safeFiles.push(filePath);
    } else {
      unsafeFiles.push(filePath);
    }
  }

  return { safeFiles, unsafeFiles };
}

export const downstreamBoundaryPolicy = {
  safePrefixes: SAFE_PREFIXES,
  safeExact: Array.from(SAFE_EXACT),
};
