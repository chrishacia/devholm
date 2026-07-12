import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeArtifactSha256,
  extractTarGzToStaging,
  inspectTarGzArtifact,
} from '@core/lib/plugin-marketplace-staging.server';

type TarEntry = {
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'hardlink';
  content?: Buffer;
  linkname?: string;
};

const tempRoots: string[] = [];

function octal(value: number, length: number): Buffer {
  const rendered = value
    .toString(8)
    .padStart(length - 1, '0')
    .slice(0, length - 1);
  return Buffer.from(`${rendered}\0`, 'ascii');
}

function writeString(target: Buffer, offset: number, length: number, value: string): void {
  const source = Buffer.from(value, 'utf8');
  source.copy(target, offset, 0, Math.min(source.length, length));
}

function createTarBuffer(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const normalizedPath = entry.path.replace(/\\/g, '/');

    writeString(header, 0, 100, normalizedPath);
    writeString(header, 100, 8, '0000644');
    writeString(header, 108, 8, '0000000');
    writeString(header, 116, 8, '0000000');

    const content = entry.content ?? Buffer.alloc(0);
    const size = entry.type === 'file' ? content.length : 0;

    octal(size, 12).copy(header, 124);
    octal(Math.floor(Date.now() / 1000), 12).copy(header, 136);

    for (let index = 148; index < 156; index += 1) {
      header[index] = 0x20;
    }

    const typeFlag =
      entry.type === 'directory'
        ? '5'
        : entry.type === 'symlink'
          ? '2'
          : entry.type === 'hardlink'
            ? '1'
            : '0';
    writeString(header, 156, 1, typeFlag);

    if (entry.type === 'symlink' && entry.linkname) {
      writeString(header, 157, 100, entry.linkname);
    }

    writeString(header, 257, 6, 'ustar');
    writeString(header, 263, 2, '00');

    let checksum = 0;
    for (let index = 0; index < 512; index += 1) {
      checksum += header[index] as number;
    }

    const checksumField = Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ', 'ascii');
    checksumField.copy(header, 148);

    chunks.push(header);

    if (entry.type === 'file') {
      chunks.push(content);
      const remainder = content.length % 512;
      if (remainder !== 0) {
        chunks.push(Buffer.alloc(512 - remainder, 0));
      }
    }
  }

  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
}

function createTarGzFile(entries: TarEntry[]): string {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'devholm-staging-test-'));
  tempRoots.push(tempRoot);

  const tarBuffer = createTarBuffer(entries);
  const archivePath = path.join(tempRoot, 'archive.tar.gz');
  writeFileSync(archivePath, gzipSync(tarBuffer));

  return archivePath;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('plugin-marketplace-staging: inspection and extraction safety', () => {
  it('inspects and extracts a valid archive into an isolated staging directory', async () => {
    const archivePath = createTarGzFile([
      { path: 'plugins/calendar/', type: 'directory' },
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/calendar',
            lifecycle: {
              afterInstall: 'scripts/after-install.js',
            },
            migrations: ['migrations/001-initial.sql'],
          }),
          'utf8'
        ),
      },
      {
        path: 'plugins/calendar/README.md',
        type: 'file',
        content: Buffer.from('# Calendar', 'utf8'),
      },
    ]);

    const inspection = await inspectTarGzArtifact(archivePath);
    expect(inspection.totalEntries).toBe(3);
    expect(inspection.entries.some((entry) => entry.path.endsWith('manifest.json'))).toBe(true);

    const extraction = await extractTarGzToStaging(archivePath);
    expect(extraction.totalEntries).toBe(3);
    expect(extraction.extractedFiles).toContain('plugins/calendar/manifest.json');
    expect(extraction.extractedDirectories).toContain('plugins/calendar/');
    expect(extraction.validation.pluginId).toBe('calendar');
    expect(extraction.validation.version).toBe('0.1.0');
    expect(extraction.validation.hasLifecycleDeclarations).toBe(true);
    expect(extraction.validation.hasMigrationDeclarations).toBe(true);
  });

  it('computes deterministic SHA-256 for artifact bytes', async () => {
    const archivePath = createTarGzFile([
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

    const digest = await computeArtifactSha256(archivePath);
    const expected = createHash('sha256').update(readFileSync(archivePath)).digest('hex');

    expect(digest).toBe(expected);
  });

  it('rejects path traversal archives', async () => {
    const archivePath = createTarGzFile([
      { path: '../escape.txt', type: 'file', content: Buffer.from('escape', 'utf8') },
    ]);

    await expect(extractTarGzToStaging(archivePath)).rejects.toThrow(
      /path traversal|unsafe archive path/i
    );
  });

  it('rejects absolute path archives', async () => {
    const archivePath = createTarGzFile([
      { path: '/abs/path.txt', type: 'file', content: Buffer.from('bad', 'utf8') },
    ]);

    await expect(inspectTarGzArtifact(archivePath)).rejects.toThrow(/unsafe archive path/i);
  });

  it('rejects symlink entries', async () => {
    const archivePath = createTarGzFile([
      { path: 'plugins/calendar/link', type: 'symlink', linkname: '/etc/passwd' },
    ]);

    await expect(extractTarGzToStaging(archivePath)).rejects.toThrow(/unsupported tar entry type/i);
  });

  it('rejects hardlink entries', async () => {
    const archivePath = createTarGzFile([
      { path: 'plugins/calendar/hardlink', type: 'hardlink', linkname: 'plugins/calendar/target' },
    ]);

    await expect(extractTarGzToStaging(archivePath)).rejects.toThrow(/unsupported tar entry type/i);
  });

  it('rejects duplicate normalized archive paths', async () => {
    const archivePath = createTarGzFile([
      { path: 'plugins/calendar/manifest.json', type: 'file', content: Buffer.from('{}', 'utf8') },
      {
        path: 'plugins/calendar/./manifest.json',
        type: 'file',
        content: Buffer.from('{}', 'utf8'),
      },
    ]);

    await expect(inspectTarGzArtifact(archivePath)).rejects.toThrow(
      /duplicate normalized archive path/i
    );
  });

  it('rejects Windows drive path entries', async () => {
    const archivePath = createTarGzFile([
      { path: 'C:/temp/payload.txt', type: 'file', content: Buffer.from('x', 'utf8') },
    ]);

    await expect(inspectTarGzArtifact(archivePath)).rejects.toThrow(/windows drive path/i);
  });

  it('rejects UNC path entries', async () => {
    const archivePath = createTarGzFile([
      { path: '\\\\server\\share\\payload.txt', type: 'file', content: Buffer.from('x', 'utf8') },
    ]);

    await expect(inspectTarGzArtifact(archivePath)).rejects.toThrow(
      /UNC path|unsafe archive path/i
    );
  });

  it('rejects high compression-ratio archives', async () => {
    const repetitiveContent = Buffer.alloc(6 * 1024 * 1024, 0);
    const archivePath = createTarGzFile([
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
      { path: 'plugins/calendar/repetitive.bin', type: 'file', content: repetitiveContent },
    ]);

    await expect(
      inspectTarGzArtifact(archivePath, {
        limits: {
          maxCompressionRatio: 2,
        },
      })
    ).rejects.toThrow(/compression ratio/i);
  });

  it('rejects missing staged package manifest', async () => {
    const archivePath = createTarGzFile([
      { path: 'plugins/calendar/README.md', type: 'file', content: Buffer.from('readme', 'utf8') },
    ]);

    await expect(extractTarGzToStaging(archivePath)).rejects.toThrow(/exactly one manifest.json/i);
  });

  it('rejects manifest and pluginSubdirectory mismatch', async () => {
    const archivePath = createTarGzFile([
      {
        path: 'plugins/calendar/manifest.json',
        type: 'file',
        content: Buffer.from(
          JSON.stringify({
            id: 'calendar',
            version: '0.1.0',
            pluginSubdirectory: 'plugins/gallery',
          }),
          'utf8'
        ),
      },
    ]);

    await expect(extractTarGzToStaging(archivePath)).rejects.toThrow(
      /manifest path does not match manifest.pluginSubdirectory/i
    );
  });

  it('rejects archives exceeding safety limits', async () => {
    const largeContent = Buffer.alloc(2048, 1);
    const archivePath = createTarGzFile([
      { path: 'plugins/calendar/large.bin', type: 'file', content: largeContent },
    ]);

    await expect(
      inspectTarGzArtifact(archivePath, {
        limits: {
          maxUncompressedBytes: 1024,
        },
      })
    ).rejects.toThrow(/maxUncompressedBytes/i);
  });
});
