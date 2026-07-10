import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_BASELINE_TABLES,
  CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY,
  CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
  CALENDAR_LIFECYCLE_PURGE_POLICY_KEY,
  CALENDAR_LIFECYCLE_UNINSTALL_POLICY,
  CALENDAR_LIFECYCLE_UNINSTALL_POLICY_KEY,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('calendar phase 5 lifecycle safety semantics', () => {
  it('advertises non-destructive lifecycle policy metadata', () => {
    expect(calendarPluginManifest.lifecyclePolicy).toMatchObject({
      disablePolicy: 'non-destructive',
      uninstallPolicy: 'non-destructive',
      dataRetention: CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY,
      purge: {
        requiresConfirmPluginId: true,
        destructiveDataWipe: 'blocked',
        blockedWhenDataPresent: true,
      },
    });

    expect(calendarPluginManifest.settings?.map((setting) => setting.key)).toEqual(
      expect.arrayContaining([
        CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
        CALENDAR_LIFECYCLE_UNINSTALL_POLICY_KEY,
        CALENDAR_LIFECYCLE_PURGE_POLICY_KEY,
      ])
    );

    const uninstallSetting = calendarPluginManifest.settings?.find(
      (setting) => setting.key === CALENDAR_LIFECYCLE_UNINSTALL_POLICY_KEY
    );
    expect(uninstallSetting?.defaultValue).toBe(CALENDAR_LIFECYCLE_UNINSTALL_POLICY);
  });

  it('keeps disable and uninstall hooks non-destructive while validating baseline tables', async () => {
    const hasTable = vi.fn(async () => true);
    const del = vi.fn(async () => 0);
    const dbMock = Object.assign(
      vi.fn(() => ({
        del,
      })),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { calendarBeforeDisable, calendarBeforeUninstall } = await import(
      '@user/extensions/plugins/calendar/lifecycle/hooks'
    );

    await calendarBeforeDisable();
    await calendarBeforeUninstall();

    expect(hasTable).toHaveBeenCalledTimes(CALENDAR_BASELINE_TABLES.length * 2);
    expect(del).not.toHaveBeenCalled();
  });

  it('blocks purge when calendar data exists and reports table counts', async () => {
    const hasTable = vi.fn(async () => true);
    const tableCounts: Record<string, number> = {
      calendar_collections: 2,
      calendar_event_types: 5,
      calendar_blocks: 7,
      calendar_bookings: 3,
      calendar_integrations: 1,
    };

    const dbMock = Object.assign(
      vi.fn((tableName: string) => ({
        count: vi.fn(() => ({
          first: vi.fn(async () => ({ row_count: tableCounts[tableName] ?? 0 })),
        })),
      })),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { calendarPurge } = await import('@user/extensions/plugins/calendar/lifecycle/hooks');

    await expect(calendarPurge()).rejects.toThrow(/Calendar purge is blocked while data exists/);
  });

  it('allows purge hook to complete only when baseline tables are empty', async () => {
    const hasTable = vi.fn(async () => true);
    const dbMock = Object.assign(
      vi.fn(() => ({
        count: vi.fn(() => ({
          first: vi.fn(async () => ({ row_count: 0 })),
        })),
      })),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { calendarPurge } = await import('@user/extensions/plugins/calendar/lifecycle/hooks');
    await expect(calendarPurge()).resolves.toBeUndefined();
  });

  it('keeps baseline table checks intact for install hooks', async () => {
    const hasTable = vi.fn(async () => true);
    hasTable.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValue(true);

    const dbMock = Object.assign(
      vi.fn(() => ({})),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { calendarAfterInstall } = await import(
      '@user/extensions/plugins/calendar/lifecycle/hooks'
    );

    await expect(calendarAfterInstall()).rejects.toThrow(
      /Calendar baseline schema is missing required tables/
    );
  });

  it('keeps URL shortener lifecycle behavior unaffected', () => {
    expect(urlShortenerPluginManifest.lifecyclePolicy).toBeUndefined();
    expect(typeof urlShortenerPluginManifest.lifecycle?.purge).toBe('function');
    expect(calendarPluginManifest.id).toBe(CALENDAR_PLUGIN_ID);
  });

  it('keeps generated plugin registry deterministic for calendar, gallery, and url-shortener', () => {
    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string; migrations: unknown[] }>;
    };

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
    expect(registry.plugins.find((plugin) => plugin.id === CALENDAR_PLUGIN_ID)?.migrations).toEqual(
      []
    );
  });
});
