import { describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
import { executeMigrationPlanWithBroker } from '@core/lib/plugin-migration-broker.server';

type MockTableBuilder = {
  client: { raw: () => unknown };
  uuid: () => MockColumnChain;
  string: () => MockColumnChain;
  text: () => MockColumnChain;
  boolean: () => MockColumnChain;
  timestamp: () => MockColumnChain;
  integer: () => MockColumnChain;
  bigInteger: () => MockColumnChain;
  smallint: () => MockColumnChain;
  date: () => MockColumnChain;
  jsonb: () => MockColumnChain;
  enu: () => MockColumnChain;
  foreign: () => {
    references: () => {
      inTable: () => {
        onDelete: () => void;
      };
    };
  };
  index: () => void;
  unique: () => void;
  dropIndex: () => void;
  dropForeign: () => void;
  dropColumn: () => void;
};

type MockColumnChain = {
  primary: () => MockColumnChain;
  unique: () => MockColumnChain;
  notNullable: () => MockColumnChain;
  nullable: () => MockColumnChain;
  defaultTo: () => MockColumnChain;
};

function createTrxMock() {
  const raw = vi.fn(async () => undefined);
  const schema = {
    createTable: vi.fn(async (_name: string, builder: (table: MockTableBuilder) => void) => {
      const chain = {
        primary: () => chain,
        unique: () => chain,
        notNullable: () => chain,
        nullable: () => chain,
        defaultTo: () => chain,
      } as MockColumnChain;
      const table = {
        client: { raw: () => undefined },
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
        foreign: () => ({
          references: () => ({
            inTable: () => ({
              onDelete: () => undefined,
            }),
          }),
        }),
        index: () => undefined,
        unique: () => undefined,
        dropIndex: () => undefined,
        dropForeign: () => undefined,
        dropColumn: () => undefined,
      } as MockTableBuilder;
      builder(table);
    }),
    alterTable: vi.fn(async (_name: string, builder: (table: MockTableBuilder) => void) => {
      const chain = {
        primary: () => chain,
        unique: () => chain,
        notNullable: () => chain,
        nullable: () => chain,
        defaultTo: () => chain,
      } as MockColumnChain;
      const table = {
        client: { raw: () => undefined },
        index: () => undefined,
        unique: () => undefined,
        dropIndex: () => undefined,
        dropForeign: () => undefined,
        dropColumn: () => undefined,
        foreign: () => ({
          references: () => ({
            inTable: () => ({
              onDelete: () => undefined,
            }),
          }),
        }),
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
      } as MockTableBuilder;
      builder(table);
    }),
    dropTableIfExists: vi.fn(async () => undefined),
  };

  return {
    raw,
    schema,
  };
}

describe('plugin migration broker', () => {
  it('executes approved plugin namespace operations', async () => {
    const trx = createTrxMock();
    await executeMigrationPlanWithBroker({
      trx: trx as unknown as Knex,
      pluginId: 'url-shortener',
      migrationId: 'url-shortener:1',
      checksum: 'a'.repeat(64),
      artifactIdentity: 'bundled:url-shortener@0.1.0:test',
      direction: 'up',
      sourceVersion: '0.0.0',
      targetVersion: '0.1.0',
      plan: {
        protocolVersion: 'migration-plan-v1',
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:1',
        checksum: 'a'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        sourceVersion: '0.0.0',
        targetVersion: '0.1.0',
        reversible: true,
        up: [
          {
            type: 'create-table',
            table: 'u_url_shortener_links',
            columns: [{ name: 'id', type: 'uuid', primary: true, defaultUuid: true }],
          },
        ],
        down: [{ type: 'drop-table', table: 'u_url_shortener_links' }],
      },
    });

    expect(trx.schema.createTable).toHaveBeenCalledTimes(1);
  });

  it('rejects core-schema table operations outside plugin namespace', async () => {
    const trx = createTrxMock();

    await expect(
      executeMigrationPlanWithBroker({
        trx: trx as unknown as Knex,
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:2',
        checksum: 'b'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        direction: 'up',
        sourceVersion: '0.1.0',
        targetVersion: '0.2.0',
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:2',
          checksum: 'b'.repeat(64),
          artifactIdentity: 'bundled:url-shortener@0.1.0:test',
          sourceVersion: '0.1.0',
          targetVersion: '0.2.0',
          reversible: true,
          up: [
            {
              type: 'create-table',
              table: 'devholm_plugins',
              columns: [{ name: 'id', type: 'uuid', primary: true }],
            },
          ],
          down: [],
        },
      })
    ).rejects.toThrow(/outside plugin namespace/);
  });

  it('rejects cross-plugin namespace access', async () => {
    const trx = createTrxMock();

    await expect(
      executeMigrationPlanWithBroker({
        trx: trx as unknown as Knex,
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:3',
        checksum: 'c'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        direction: 'up',
        sourceVersion: '0.1.0',
        targetVersion: '0.2.0',
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:3',
          checksum: 'c'.repeat(64),
          artifactIdentity: 'bundled:url-shortener@0.1.0:test',
          sourceVersion: '0.1.0',
          targetVersion: '0.2.0',
          reversible: true,
          up: [
            {
              type: 'create-table',
              table: 'u_gallery_assets',
              columns: [{ name: 'id', type: 'uuid', primary: true }],
            },
          ],
          down: [],
        },
      })
    ).rejects.toThrow(/outside plugin namespace/);
  });

  it('rejects unsafe identifier SQL fragments', async () => {
    const trx = createTrxMock();

    await expect(
      executeMigrationPlanWithBroker({
        trx: trx as unknown as Knex,
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:4',
        checksum: 'd'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        direction: 'up',
        sourceVersion: '0.1.0',
        targetVersion: '0.2.0',
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:4',
          checksum: 'd'.repeat(64),
          artifactIdentity: 'bundled:url-shortener@0.1.0:test',
          sourceVersion: '0.1.0',
          targetVersion: '0.2.0',
          reversible: true,
          up: [
            {
              type: 'create-index',
              table: 'u_url_shortener_links',
              columns: ['id'],
              name: 'u_url_shortener_links_idx;drop_table',
            },
          ],
          down: [],
        },
      })
    ).rejects.toThrow(/invalid index name identifier/);
  });

  it('rejects unknown migration operation types', async () => {
    const trx = createTrxMock();

    await expect(
      executeMigrationPlanWithBroker({
        trx: trx as unknown as Knex,
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:5',
        checksum: 'e'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        direction: 'up',
        sourceVersion: '0.1.0',
        targetVersion: '0.2.0',
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:5',
          checksum: 'e'.repeat(64),
          artifactIdentity: 'bundled:url-shortener@0.1.0:test',
          sourceVersion: '0.1.0',
          targetVersion: '0.2.0',
          reversible: true,
          up: [
            {
              type: 'raw-sql',
              sql: 'select 1',
            } as unknown as never,
          ],
          down: [],
        } as unknown as Parameters<typeof executeMigrationPlanWithBroker>[0]['plan'],
      })
    ).rejects.toThrow(/unsupported migration operation type/);
  });
});
