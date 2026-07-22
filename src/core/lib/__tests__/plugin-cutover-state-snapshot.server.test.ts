import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());
const getPluginDefinitions = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

vi.mock('@core/lib/plugins', () => ({
  getPluginDefinitions,
}));

import { readPluginCutoverStateSnapshots } from '@core/lib/plugin-cutover-state-snapshot.server';

function buildDbMock(data: {
  settingsRows: Array<Record<string, unknown>>;
  lifecycleRows: Array<Record<string, unknown>>;
  activeOperationRows: Array<Record<string, unknown>>;
  runningCheckpointRows: Array<Record<string, unknown>>;
  migrationCountRows: Array<Record<string, unknown>>;
}) {
  return vi.fn((table: string) => {
    if (table === 'site_settings') {
      return {
        select: () => ({
          where: ({ key }: { key?: string } = {}) => {
            if (key) {
              return {
                first: async () => data.settingsRows.find((row) => row.key === key),
              };
            }

            return {
              andWhere: async () => data.settingsRows,
            };
          },
        }),
      };
    }

    if (table === 'devholm_plugins') {
      return {
        select: () => ({
          where: ({ plugin_id }: { plugin_id?: string } = {}) => ({
            first: async () =>
              plugin_id
                ? data.lifecycleRows.find((row) => row.plugin_id === plugin_id) ?? null
                : null,
          }),
        }),
      };
    }

    if (table === 'devholm_plugin_lifecycle_operations') {
      return {
        select: () => ({
          where: ({ plugin_id }: { plugin_id?: string } = {}) => ({
            whereIn: async () =>
              plugin_id
                ? data.activeOperationRows.filter((row) => row.plugin_id === plugin_id)
                : data.activeOperationRows,
          }),
          whereIn: async () => data.activeOperationRows,
        }),
      };
    }

    if (table === 'devholm_plugin_migration_checkpoints') {
      return {
        select: () => ({
          where: async ({ plugin_id, status }: { plugin_id?: string; status?: string } = {}) =>
            data.runningCheckpointRows.filter((row) => {
              const pluginMatch = plugin_id ? row.plugin_id === plugin_id : true;
              const statusMatch = status ? row.status === status : true;
              return pluginMatch && statusMatch;
            }),
        }),
      };
    }

    if (table === 'devholm_plugin_migrations') {
      return {
        select: () => ({
          count: () => ({
            where: ({ plugin_id }: { plugin_id?: string } = {}) => ({
              groupBy: async () =>
                plugin_id
                  ? data.migrationCountRows.filter((row) => row.plugin_id === plugin_id)
                  : data.migrationCountRows,
            }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  });
}

describe('plugin cutover state snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPluginDefinitions.mockReturnValue([
      { id: 'calendar' },
      { id: 'gallery' },
      { id: 'url-shortener' },
    ]);
  });

  it('builds snapshots and flags contradictory states', async () => {
    getDb.mockReturnValue(
      buildDbMock({
        settingsRows: [
          { key: 'plugin:calendar:enabled', value: 'true' },
          { key: 'plugin:url-shortener:enabled', value: 'false' },
        ],
        lifecycleRows: [
          {
            plugin_id: 'calendar',
            lifecycle_state: 'installed',
            operation_status: 'idle',
            installed_version: '0.1.0',
            enabled: true,
          },
          {
            plugin_id: 'gallery',
            lifecycle_state: 'bundled',
            operation_status: 'idle',
            installed_version: '0.1.0',
            enabled: true,
          },
        ],
        activeOperationRows: [{ plugin_id: 'gallery' }, { plugin_id: 'gallery' }],
        runningCheckpointRows: [{ plugin_id: 'url-shortener', status: 'running' }],
        migrationCountRows: [{ plugin_id: 'calendar', count: '4' }],
      })
    );

    const snapshots = await readPluginCutoverStateSnapshots();

    expect(snapshots).toHaveLength(3);

    const calendar = snapshots.find((entry) => entry.pluginId === 'calendar');
    expect(calendar?.contradictoryState).toBe(false);
    expect(calendar?.succeededMigrationCount).toBe(4);

    const gallery = snapshots.find((entry) => entry.pluginId === 'gallery');
    expect(gallery?.contradictoryState).toBe(true);
    expect(gallery?.contradictionReasons).toContain('bundled-state-has-installed-version');
    expect(gallery?.contradictionReasons).toContain('multiple-active-lifecycle-operations');

    const urlShortener = snapshots.find((entry) => entry.pluginId === 'url-shortener');
    expect(urlShortener?.contradictoryState).toBe(true);
    expect(urlShortener?.contradictionReasons).toContain(
      'running-checkpoint-without-active-operation'
    );
  });
});
