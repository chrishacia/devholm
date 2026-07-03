import { beforeEach, describe, expect, it, vi } from 'vitest';

const tableFactory = vi.hoisted(() => vi.fn());
const whereFactory = vi.hoisted(() => vi.fn());
const andWhereFactory = vi.hoisted(() => vi.fn());

const getPluginDefinitionsMock = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb: vi.fn(() => tableFactory),
}));

vi.mock('@core/lib/plugins', () => ({
  getPluginDefinitions: getPluginDefinitionsMock,
}));

describe('core/db/plugins listPluginStates', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getPluginDefinitionsMock.mockReturnValue([
      {
        id: 'url-shortener',
        name: 'URL Shortener',
        source: 'user',
        enabledByDefault: false,
        capabilities: {
          admin: true,
          api: true,
          publicRoutes: true,
          navigation: true,
          sitemap: true,
          embeds: false,
        },
      },
    ]);
  });

  function setupDb(
    rows: Array<Record<string, unknown>>,
    installedRows: Array<Record<string, unknown>>
  ) {
    const ignore = vi.fn(async () => undefined);
    const onConflict = vi.fn(() => ({ ignore }));
    const insert = vi.fn(() => ({ onConflict }));

    const siteSettingsSelect = vi.fn(() => ({
      where: whereFactory,
    }));
    andWhereFactory.mockResolvedValue(rows);
    whereFactory.mockReturnValue({
      andWhere: andWhereFactory,
    });

    const pluginLedgerSelect = vi.fn(async () => installedRows);

    tableFactory.mockImplementation((tableName?: string) => {
      if (!tableName) {
        throw new Error('Expected table name');
      }

      if (tableName === 'site_settings') {
        return {
          insert,
          select: siteSettingsSelect,
        };
      }

      if (tableName === 'devholm_plugins') {
        return {
          select: pluginLedgerSelect,
        };
      }

      throw new Error(`Unexpected table ${tableName}`);
    });

    (
      tableFactory as unknown as {
        transaction: (cb: (trx: unknown) => Promise<void>) => Promise<void>;
      }
    ).transaction = async (cb) => cb(tableFactory);
  }

  it('loads only plugin:*:enabled rows and ignores ordinary plugin settings', async () => {
    setupDb(
      [
        {
          key: 'plugin:url-shortener:enabled',
          value: 'true',
          updated_at: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          key: 'plugin:url-shortener:route-prefix',
          value: '/s',
          updated_at: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          key: 'plugin:url-shortener:redirect-status',
          value: '301',
          updated_at: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
      []
    );

    const { listPluginStates } = await import('@core/db/plugins');
    const states = await listPluginStates();

    expect(whereFactory).toHaveBeenCalledWith('category', 'plugins');
    expect(andWhereFactory).toHaveBeenCalledWith('key', 'like', 'plugin:%:enabled');
    expect(states).toHaveLength(1);
    expect(states[0].id).toBe('url-shortener');
    expect(states[0].isEnabled).toBe(true);
    expect(states.some((state) => state.id.includes(':route-prefix'))).toBe(false);
  });

  it('uses installed ledger state precedence over settings rows', async () => {
    setupDb(
      [
        {
          key: 'plugin:url-shortener:enabled',
          value: 'false',
          updated_at: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
      [
        {
          plugin_id: 'url-shortener',
          bundled_version: '0.1.0',
          installed_version: '0.1.0',
          enabled: true,
          lifecycle_state: 'installed',
          operation_status: 'idle',
          updated_at: new Date('2026-07-02T00:00:00.000Z'),
        },
      ]
    );

    const { listPluginStates } = await import('@core/db/plugins');
    const [state] = await listPluginStates();

    expect(state.id).toBe('url-shortener');
    expect(state.installed).toBe(true);
    expect(state.lifecycleState).toBe('installed');
    expect(state.isEnabled).toBe(true);
    expect(state.installedVersion).toBe('0.1.0');
  });
});
