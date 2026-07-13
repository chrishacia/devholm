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
      export const migrationPlanV1 = {
        protocolVersion: 'migration-plan-v1',
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:20260701010000_url_shortener_foundation',
        checksum: 'placeholder',
        artifactIdentity: 'placeholder',
        sourceVersion: '0.0.0',
        targetVersion: '0.1.0',
        reversible: true,
        up: [
          {
            type: 'create-table',
            table: 'u_url_shortener_packaged_test',
            columns: [
              { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
            ],
          },
        ],
        down: [{ type: 'drop-table', table: 'u_url_shortener_packaged_test' }],
      };
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
      checksumManifest: vi.fn(() => 'checksum'),
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => ({
        transaction: async (
          callback: (trx: {
            raw: (sql: string, args?: unknown[]) => Promise<void>;
            schema: {
              createTable: (
                name: string,
                builder: (table: Record<string, unknown>) => void
              ) => Promise<void>;
              alterTable: (
                name: string,
                builder: (table: Record<string, unknown>) => void
              ) => Promise<void>;
              dropTableIfExists: (name: string) => Promise<void>;
            };
          }) => Promise<void>
        ) => {
          const chain = {
            primary: () => chain,
            unique: () => chain,
            notNullable: () => chain,
            nullable: () => chain,
            defaultTo: () => chain,
          };

          const tableBuilder = {
            uuid: () => chain,
            string: () => chain,
            text: () => chain,
            boolean: () => chain,
            timestamp: () => chain,
            integer: () => chain,
            bigInteger: () => chain,
            smallint: () => chain,
            date: () => chain,
            jsonb: () => chain,
            enu: () => chain,
            client: { raw: () => undefined },
            index: () => undefined,
            unique: () => undefined,
            foreign: () => ({
              references: () => ({ inTable: () => ({ onDelete: () => undefined }) }),
            }),
            dropIndex: () => undefined,
            dropForeign: () => undefined,
            dropColumn: () => undefined,
          };

          await callback({
            raw: async () => undefined,
            schema: {
              createTable: async (_name, builder) => {
                builder(tableBuilder);
              },
              alterTable: async (_name, builder) => {
                builder(tableBuilder);
              },
              dropTableIfExists: async () => undefined,
            },
          });
        },
      })),
    }));

    vi.doMock('@core/lib/plugin-migration-contract.server', () => ({
      executePluginMigrationWithGate: vi.fn(async (input: { execute: () => Promise<void> }) => {
        await input.execute();
        return {
          executionId: '00000000-0000-4000-8000-000000000000',
          state: 'succeeded',
        };
      }),
    }));

    vi.doMock('@core/lib/plugin-isolation-runtime.server', () => ({
      runIsolatedMigrationPlan: vi.fn(async (input: { artifactIdentity: string }) => ({
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:20260701010000_url_shortener_foundation',
          checksum,
          artifactIdentity: input.artifactIdentity,
          sourceVersion: '0.0.0',
          targetVersion: '0.1.0',
          reversible: true,
          up: [
            {
              type: 'create-table',
              table: 'u_url_shortener_packaged_test',
              columns: [{ name: 'id', type: 'uuid', primary: true, defaultUuid: true }],
            },
          ],
          down: [{ type: 'drop-table', table: 'u_url_shortener_packaged_test' }],
        },
        meta: {
          executionId: '00000000-0000-4000-8000-000000000000',
          childPid: 123,
        },
      })),
    }));

    const { applyPendingPluginMigrations } = await import(
      '@core/lib/plugin-migration-runner.server'
    );

    await applyPendingPluginMigrations('url-shortener');

    expect(insertLedger).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(tempDir, 'src/user/extensions/plugins'))).toBe(false);
  });
});
