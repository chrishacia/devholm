import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cwdStack: string[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  while (cwdStack.length > 0) {
    process.chdir(cwdStack.pop() as string);
  }
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
  vi.resetModules();
  vi.clearAllMocks();
});

describe('plugin migration production packaging', () => {
  it('executes packaged migration from generated/plugins without source plugin directories', async () => {
    const baseTmpDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(baseTmpDir, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(baseTmpDir, 'devholm-prod-packaged-migrations-'));
    tempDirs.push(tempDir);
    const previousCwd = process.cwd();
    cwdStack.push(previousCwd);

    const generatedRoot = path.join(tempDir, 'generated/plugins');
    const migrationDir = path.join(generatedRoot, 'url-shortener/migrations');
    fs.mkdirSync(migrationDir, { recursive: true });

    const migrationPath = path.join(migrationDir, '20260701010000_url_shortener_foundation.js');
    const migrationSource = `
      export async function up() {
        globalThis.__packagedMigrationExecuted = true;
      }
      export async function down() {}
    `;
    fs.writeFileSync(migrationPath, migrationSource, 'utf8');

    const checksum = await import('@core/lib/plugin-migration-discovery.server').then((mod) =>
      mod.checksumMigrationContent(fs.readFileSync(migrationPath, 'utf8'))
    );

    const registryPath = path.join(generatedRoot, 'registry.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          plugins: [
            {
              id: 'url-shortener',
              version: '0.1.0',
              migrationDir: 'generated/plugins/url-shortener/migrations',
              seedDir: 'src/user/extensions/plugins/url-shortener/db/seeds',
              migrations: [
                {
                  id: 'url-shortener:20260701010000_url_shortener_foundation',
                  file: 'url-shortener/migrations/20260701010000_url_shortener_foundation.js',
                  checksum,
                },
              ],
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    process.chdir(tempDir);

    const insertLedger = vi.fn(async () => undefined);
    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getPluginMigrationLedgerWithDb: vi.fn(async () => []),
      insertPluginMigrationLedger: insertLedger,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => ({
        transaction: async (
          callback: (trx: {
            raw: (sql: string, args?: unknown[]) => Promise<void>;
          }) => Promise<void>
        ) => {
          await callback({
            raw: async () => undefined,
          });
        },
      })),
    }));

    const { applyPendingPluginMigrations } = await import(
      '@core/lib/plugin-migration-runner.server'
    );

    await applyPendingPluginMigrations('url-shortener');

    expect(
      (globalThis as { __packagedMigrationExecuted?: boolean }).__packagedMigrationExecuted
    ).toBe(true);
    expect(insertLedger).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(tempDir, 'src/user/extensions/plugins'))).toBe(false);
  });
});
