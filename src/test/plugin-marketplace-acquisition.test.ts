import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { acquireFirstPartyMarketplaceArtifact } from '@core/lib/plugin-marketplace-acquisition.server';

async function writeCachedArtifact(
  cacheRoot: string,
  digest: string,
  content: Buffer
): Promise<void> {
  const prefix = digest.slice(0, 2);
  const dir = path.join(cacheRoot, 'sha256', prefix);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${digest}.tar.gz`), content);
}

describe('plugin-marketplace-acquisition: policy and cache', () => {
  it('rejects non-https URLs', async () => {
    await expect(
      acquireFirstPartyMarketplaceArtifact({
        artifactUrl: 'http://github.com/example/artifact.tar.gz',
        expectedSha256: 'a'.repeat(64),
        expectedPluginId: 'calendar',
        expectedVersion: '0.1.0',
      })
    ).rejects.toThrow(/HTTPS/i);
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(
      acquireFirstPartyMarketplaceArtifact({
        artifactUrl: 'https://user:pass@github.com/example/artifact.tar.gz',
        expectedSha256: 'a'.repeat(64),
        expectedPluginId: 'calendar',
        expectedVersion: '0.1.0',
      })
    ).rejects.toThrow(/embedded credentials/i);
  });

  it('rejects localhost/private-network destinations by default', async () => {
    await expect(
      acquireFirstPartyMarketplaceArtifact({
        artifactUrl: 'https://127.0.0.1:443/artifact.tar.gz',
        expectedSha256: 'a'.repeat(64),
        expectedPluginId: 'calendar',
        expectedVersion: '0.1.0',
        policyOverrides: {
          allowedHosts: ['127.0.0.1'],
        },
      })
    ).rejects.toThrow(/blocked IPv4 address/i);
  });

  it('serves a valid cached artifact in offline mode', async () => {
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-cache-'));
    const bytes = Buffer.from('cached artifact bytes', 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeCachedArtifact(cacheRoot, digest, bytes);

    const result = await acquireFirstPartyMarketplaceArtifact({
      artifactUrl:
        'https://github.com/chrishacia/devholm-plugins/releases/download/calendar-v0.1.0/calendar-v0.1.0.tar.gz',
      expectedSha256: digest,
      expectedPluginId: 'calendar',
      expectedVersion: '0.1.0',
      cacheRootDir: cacheRoot,
      offlineOnly: true,
    });

    expect(result.source).toBe('cache');
    expect(result.readyForStaging).toBe(true);
    expect(result.verifiedSha256).toBe(digest);

    await rm(cacheRoot, { recursive: true, force: true });
  });

  it('rejects corrupted cache entries and reports offline blocker when no valid cache remains', async () => {
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-cache-bad-'));
    const expectedDigest = 'a'.repeat(64);
    await writeCachedArtifact(cacheRoot, expectedDigest, Buffer.from('tampered', 'utf8'));

    const result = await acquireFirstPartyMarketplaceArtifact({
      artifactUrl:
        'https://github.com/chrishacia/devholm-plugins/releases/download/calendar-v0.1.0/calendar-v0.1.0.tar.gz',
      expectedSha256: expectedDigest,
      expectedPluginId: 'calendar',
      expectedVersion: '0.1.0',
      cacheRootDir: cacheRoot,
      offlineOnly: true,
    });

    expect(result.readyForStaging).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes('offline mode'))).toBe(true);

    await rm(cacheRoot, { recursive: true, force: true });
  });
});
