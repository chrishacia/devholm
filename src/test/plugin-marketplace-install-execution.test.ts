import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseMarketplaceInstallSourceDescriptor } from '@core/lib/plugin-install-source-descriptor.server';
import { executeFirstPartyMarketplaceInstall } from '@core/lib/plugin-marketplace-install-execution.server';
import type { MarketplaceCatalogEntry } from '@core/types/plugin-marketplace-contract';

type TarEntry = {
  path: string;
  type: 'file' | 'directory';
  content?: Buffer;
};

function writeTarHeader(target: Buffer, offset: number, entry: TarEntry): void {
  const header = Buffer.alloc(512, 0);
  const nameBuffer = Buffer.from(entry.path, 'utf8');
  nameBuffer.copy(header, 0, 0, Math.min(nameBuffer.length, 100));

  const mode = entry.type === 'directory' ? '0000755\0' : '0000644\0';
  Buffer.from(mode, 'ascii').copy(header, 100);
  Buffer.from('0000000\0', 'ascii').copy(header, 108);
  Buffer.from('0000000\0', 'ascii').copy(header, 116);

  const size = entry.type === 'file' ? entry.content?.length ?? 0 : 0;
  const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
  Buffer.from(sizeOctal, 'ascii').copy(header, 124);

  const mtimeOctal =
    Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, '0') + '\0';
  Buffer.from(mtimeOctal, 'ascii').copy(header, 136);

  Buffer.from('        ', 'ascii').copy(header, 148);
  header[156] = entry.type === 'directory' ? '5'.charCodeAt(0) : '0'.charCodeAt(0);
  Buffer.from('ustar\0', 'ascii').copy(header, 257);
  Buffer.from('00', 'ascii').copy(header, 263);

  let checksum = 0;
  for (let i = 0; i < 512; i += 1) {
    checksum += header[i] ?? 0;
  }
  const checksumOctal = checksum.toString(8).padStart(6, '0');
  Buffer.from(`${checksumOctal}\0 `, 'ascii').copy(header, 148);

  header.copy(target, offset);
}

function createTar(entries: TarEntry[]): Buffer {
  const buffers: Buffer[] = [];

  for (const entry of entries) {
    const payload = entry.type === 'file' ? entry.content ?? Buffer.alloc(0) : Buffer.alloc(0);
    const payloadPadding = (512 - (payload.length % 512)) % 512;
    const block = Buffer.alloc(512 + payload.length + payloadPadding, 0);

    writeTarHeader(block, 0, entry);
    payload.copy(block, 512);
    buffers.push(block);
  }

  buffers.push(Buffer.alloc(1024, 0));
  return Buffer.concat(buffers);
}

async function createTarGzArtifact(
  entries: TarEntry[]
): Promise<{ artifactPath: string; sha256: string }> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-install-test-'));
  const artifactPath = path.join(tmpDir, 'artifact.tar.gz');
  const tar = createTar(entries);
  const compressed = gzipSync(tar);
  await writeFile(artifactPath, compressed);

  return {
    artifactPath,
    sha256: createHash('sha256').update(compressed).digest('hex'),
  };
}

function baseCatalogEntry(version: string, sha256: string): MarketplaceCatalogEntry {
  return {
    pluginId: 'calendar',
    displayName: 'Calendar',
    version,
    installReadiness: 'production-eligible',
    runtimeInstallSupported: true,
    bundledFallbackRequired: true,
    pluginSubdirectory: 'plugins/calendar',
    manifestPath: 'plugins/calendar/manifest.json',
    readmePath: 'plugins/calendar/README.md',
    landingPagePath: 'plugins/calendar/index.html',
    source: {
      sourceType: 'marketplace',
      repositoryUrl: 'https://github.com/chrishacia/devholm-plugins',
      ref: `refs/tags/calendar-v${version}`,
    },
    publisher: {
      publisherId: 'devholm-first-party',
      classification: 'first-party',
    },
    artifact: {
      format: 'tar.gz',
      readiness: 'available',
      immutable: true,
      immutableRefType: 'release-url',
      artifactUrl: `https://github.com/chrishacia/devholm-plugins/releases/download/calendar-v${version}/calendar-v${version}.tar.gz`,
      sha256,
      compressedSizeBytes: 2048,
      maxUncompressedSizeBytes: 10 * 1024 * 1024,
      signature: {
        status: 'not-provided',
      },
    },
  };
}

function descriptorFor(version: string, sha256: string) {
  const parsed = parseMarketplaceInstallSourceDescriptor({
    sourceType: 'marketplace',
    repoUrl: 'https://github.com/chrishacia/devholm-plugins.git',
    ref: `refs/tags/calendar-v${version}`,
    pluginSubdirectory: 'plugins/calendar',
    manifestPath: 'plugins/calendar/manifest.json',
    expectedPluginId: 'calendar',
    expectedVersion: version,
    integrity: {
      packageChecksum: sha256,
    },
    trustPolicy: {
      policy: 'manual-approval',
      requiredApprovers: ['release-manager'],
    },
  });

  if (!parsed.descriptor) {
    throw new Error(`failed to parse descriptor: ${parsed.errors.join(', ')}`);
  }

  return parsed.descriptor;
}

describe('plugin-marketplace-install-execution: first-party runtime install', () => {
  beforeEach(() => {
    process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED = 'true';
  });

  it('blocks execution when runtime install gate is disabled', async () => {
    process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED = 'false';
    const { artifactPath, sha256 } = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.1.0', sha256),
        catalogEntry: baseCatalogEntry('0.1.0', sha256),
        artifactPath,
        explicitAdminApproval: true,
      })
    ).rejects.toThrow(/disabled/i);

    await rm(path.dirname(artifactPath), { recursive: true, force: true });
  });

  it('requires explicit admin approval', async () => {
    const { artifactPath, sha256 } = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.1.0', sha256),
        catalogEntry: baseCatalogEntry('0.1.0', sha256),
        artifactPath,
        explicitAdminApproval: false,
      })
    ).rejects.toThrow(/explicit admin approval/i);

    await rm(path.dirname(artifactPath), { recursive: true, force: true });
  });

  it('blocks non first-party catalog entries', async () => {
    const { artifactPath, sha256: computedSha } = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    const thirdPartyCatalog = {
      ...baseCatalogEntry('0.1.0', computedSha),
      publisher: {
        publisherId: 'third-party',
        classification: 'third-party' as const,
      },
    };

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.1.0', computedSha),
        catalogEntry: thirdPartyCatalog,
        artifactPath,
        explicitAdminApproval: true,
      })
    ).rejects.toThrow(/planner blocked runtime install/i);

    await rm(path.dirname(artifactPath), { recursive: true, force: true });
  });

  it('rejects artifact checksum mismatch', async () => {
    const { artifactPath } = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.1.0', 'f'.repeat(64)),
        catalogEntry: baseCatalogEntry('0.1.0', 'f'.repeat(64)),
        artifactPath,
        explicitAdminApproval: true,
      })
    ).rejects.toThrow(/checksum mismatch/i);

    await rm(path.dirname(artifactPath), { recursive: true, force: true });
  });

  it('installs first-party artifact and records rollback path on upgrade', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-install-root-'));

    const artifactV1 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
            lifecycle: { afterInstall: 'scripts/after-install.js' },
            migrations: ['migrations/001.sql'],
          }),
          'utf8'
        ),
      },
      {
        path: 'plugins/calendar/README.md',
        type: 'file',
        content: Buffer.from('calendar plugin v1', 'utf8'),
      },
    ]);

    const firstInstall = await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.1.0', artifactV1.sha256),
      catalogEntry: baseCatalogEntry('0.1.0', artifactV1.sha256),
      artifactPath: artifactV1.artifactPath,
      explicitAdminApproval: true,
      initiatedBy: 'admin@example.com',
      generatedPluginsRoot: installRoot,
    });

    expect(firstInstall.lifecycleExecution).toBe('skipped');
    expect(firstInstall.migrationExecution).toBe('skipped');
    expect(firstInstall.validation.hasLifecycleDeclarations).toBe(true);
    expect(firstInstall.validation.hasMigrationDeclarations).toBe(true);

    const activeReadmeV1 = await readFile(path.join(firstInstall.activePath, 'README.md'), 'utf8');
    expect(activeReadmeV1).toContain('v1');

    const artifactV2 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.2.0',
            pluginSubdirectory: 'plugins/calendar',
            lifecycle: { afterInstall: 'scripts/after-install.js' },
            migrations: ['migrations/002.sql'],
          }),
          'utf8'
        ),
      },
      {
        path: 'plugins/calendar/README.md',
        type: 'file',
        content: Buffer.from('calendar plugin v2', 'utf8'),
      },
    ]);

    const secondInstall = await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.2.0', artifactV2.sha256),
      catalogEntry: baseCatalogEntry('0.2.0', artifactV2.sha256),
      artifactPath: artifactV2.artifactPath,
      explicitAdminApproval: true,
      initiatedBy: 'admin@example.com',
      generatedPluginsRoot: installRoot,
    });

    expect(secondInstall.previousVersion).toBe('0.1.0');
    expect(secondInstall.rollbackPath).toBeTruthy();

    const activeReadmeV2 = await readFile(path.join(secondInstall.activePath, 'README.md'), 'utf8');
    expect(activeReadmeV2).toContain('v2');

    const rollbackReadme = await readFile(
      path.join(secondInstall.rollbackPath as string, 'README.md'),
      'utf8'
    );
    expect(rollbackReadme).toContain('v1');

    await rm(path.dirname(artifactV1.artifactPath), { recursive: true, force: true });
    await rm(path.dirname(artifactV2.artifactPath), { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  });

  it('returns idempotent success for same version and same digest', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-idempotent-'));

    const artifact = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    const first = await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.1.0', artifact.sha256),
      catalogEntry: baseCatalogEntry('0.1.0', artifact.sha256),
      artifactPath: artifact.artifactPath,
      explicitAdminApproval: true,
      generatedPluginsRoot: installRoot,
    });

    const second = await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.1.0', artifact.sha256),
      catalogEntry: baseCatalogEntry('0.1.0', artifact.sha256),
      artifactPath: artifact.artifactPath,
      explicitAdminApproval: true,
      generatedPluginsRoot: installRoot,
    });

    expect(second.version).toBe(first.version);
    expect(second.sha256).toBe(first.sha256);
    expect(second.activePath).toBe(first.activePath);

    await rm(path.dirname(artifact.artifactPath), { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  });

  it('rejects same-version install when digest differs', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-conflict-'));

    const artifactV1 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
      {
        path: 'plugins/calendar/README.md',
        type: 'file',
        content: Buffer.from('digest-a', 'utf8'),
      },
    ]);

    const artifactV1DifferentDigest = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
      {
        path: 'plugins/calendar/README.md',
        type: 'file',
        content: Buffer.from('digest-b', 'utf8'),
      },
    ]);

    await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.1.0', artifactV1.sha256),
      catalogEntry: baseCatalogEntry('0.1.0', artifactV1.sha256),
      artifactPath: artifactV1.artifactPath,
      explicitAdminApproval: true,
      generatedPluginsRoot: installRoot,
    });

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.1.0', artifactV1DifferentDigest.sha256),
        catalogEntry: baseCatalogEntry('0.1.0', artifactV1DifferentDigest.sha256),
        artifactPath: artifactV1DifferentDigest.artifactPath,
        explicitAdminApproval: true,
        generatedPluginsRoot: installRoot,
      })
    ).rejects.toThrow(/same-version conflict/i);

    await rm(path.dirname(artifactV1.artifactPath), { recursive: true, force: true });
    await rm(path.dirname(artifactV1DifferentDigest.artifactPath), {
      recursive: true,
      force: true,
    });
    await rm(installRoot, { recursive: true, force: true });
  });

  it('blocks downgrade after a newer version is installed', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-downgrade-'));

    const artifactV2 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.2.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    const artifactV1 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
          }),
          'utf8'
        ),
      },
    ]);

    await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.2.0', artifactV2.sha256),
      catalogEntry: baseCatalogEntry('0.2.0', artifactV2.sha256),
      artifactPath: artifactV2.artifactPath,
      explicitAdminApproval: true,
      generatedPluginsRoot: installRoot,
    });

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.1.0', artifactV1.sha256),
        catalogEntry: baseCatalogEntry('0.1.0', artifactV1.sha256),
        artifactPath: artifactV1.artifactPath,
        explicitAdminApproval: true,
        generatedPluginsRoot: installRoot,
      })
    ).rejects.toThrow(/downgrade blocked/i);

    await rm(path.dirname(artifactV2.artifactPath), { recursive: true, force: true });
    await rm(path.dirname(artifactV1.artifactPath), { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  });

  it('blocks update when capability scope escalates to policy-scoped', async () => {
    const installRoot = await mkdtemp(
      path.join(os.tmpdir(), 'devholm-marketplace-scope-escalation-')
    );

    const artifactV1 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
            permissions: [
              {
                key: 'calendar.read',
                capability: 'calendar',
                scope: 'public',
                description: 'Read calendar events',
              },
            ],
          }),
          'utf8'
        ),
      },
    ]);

    const artifactV2 = await createTarGzArtifact([
      { path: 'plugins/', type: 'directory' },
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.2.0',
            pluginSubdirectory: 'plugins/calendar',
            permissions: [
              {
                key: 'calendar.read',
                capability: 'calendar',
                scope: 'public',
                description: 'Read calendar events',
              },
              {
                key: 'calendar.policy',
                capability: 'calendar-policy',
                scope: 'policy-scoped',
                description: 'Policy-scoped capability expansion',
              },
            ],
          }),
          'utf8'
        ),
      },
    ]);

    await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorFor('0.1.0', artifactV1.sha256),
      catalogEntry: baseCatalogEntry('0.1.0', artifactV1.sha256),
      artifactPath: artifactV1.artifactPath,
      explicitAdminApproval: true,
      generatedPluginsRoot: installRoot,
    });

    await expect(
      executeFirstPartyMarketplaceInstall({
        descriptor: descriptorFor('0.2.0', artifactV2.sha256),
        catalogEntry: baseCatalogEntry('0.2.0', artifactV2.sha256),
        artifactPath: artifactV2.artifactPath,
        explicitAdminApproval: true,
        generatedPluginsRoot: installRoot,
      })
    ).rejects.toThrow(/planner blocked runtime install/i);

    await rm(path.dirname(artifactV1.artifactPath), { recursive: true, force: true });
    await rm(path.dirname(artifactV2.artifactPath), { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  });
});
