import { describe, expect, it, vi } from 'vitest';
import { up } from './20260604000000_add_auth_foundation';

interface MockKnexOptions {
  adminUsers?: Array<Record<string, unknown>>;
  siteUsers?: Array<Record<string, unknown>>;
}

function createMockKnex(options: MockKnexOptions = {}) {
  const operations = {
    siteSettingsUpdates: [] as Array<Record<string, unknown>>,
    siteUserInserts: [] as Array<Record<string, unknown>>,
    authUserRoleInserts: [] as Array<Record<string, unknown>>,
  };

  const adminUsers = options.adminUsers ?? [];
  const siteUsers = options.siteUsers ?? [];

  const roleRows = [
    { id: 'role-superadmin', slug: 'superadmin' },
    { id: 'role-admin', slug: 'admin' },
    { id: 'role-editor', slug: 'editor' },
    { id: 'role-member', slug: 'member' },
  ];

  const permissionRows = [
    'admin.access',
    'settings.manage',
    'users.manage',
    'roles.manage',
    'posts.manage',
    'projects.manage',
    'media.manage',
    'messages.manage',
    'resume.manage',
    'uses.manage',
  ].map((slug, index) => ({ id: `permission-${index + 1}`, slug }));

  const schema = {
    createTable: vi.fn().mockResolvedValue(undefined),
    dropTableIfExists: vi.fn().mockResolvedValue(undefined),
    hasTable: vi.fn().mockResolvedValue(true),
  };

  const now = vi.fn(() => 'NOW');

  const knex = ((tableName: string) => {
    if (tableName === 'auth_roles') {
      return {
        insert: vi.fn().mockReturnValue({
          onConflict: vi.fn().mockReturnValue({
            ignore: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        select: vi.fn().mockResolvedValue(roleRows),
      };
    }

    if (tableName === 'auth_permissions') {
      return {
        insert: vi.fn().mockReturnValue({
          onConflict: vi.fn().mockReturnValue({
            ignore: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        select: vi.fn().mockResolvedValue(permissionRows),
      };
    }

    if (tableName === 'auth_role_permissions' || tableName === 'auth_provider_configs') {
      return {
        insert: vi.fn().mockReturnValue({
          onConflict: vi.fn().mockReturnValue({
            ignore: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
    }

    if (tableName === 'admin_users') {
      return {
        select: vi.fn().mockResolvedValue(adminUsers),
      };
    }

    if (tableName === 'site_users') {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          operations.siteUserInserts.push(payload);
          return {
            onConflict: vi.fn().mockReturnValue({
              ignore: vi.fn().mockResolvedValue(undefined),
            }),
          };
        }),
        select: vi.fn().mockResolvedValue(siteUsers),
        first: vi.fn().mockResolvedValue(siteUsers[0] ?? null),
      };
    }

    if (tableName === 'auth_user_roles') {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          operations.authUserRoleInserts.push(payload);
          return {
            onConflict: vi.fn().mockReturnValue({
              ignore: vi.fn().mockResolvedValue(undefined),
            }),
          };
        }),
      };
    }

    if (tableName === 'site_settings') {
      return {
        insert: vi.fn().mockReturnValue({
          onConflict: vi.fn().mockReturnValue({
            ignore: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        where: vi.fn().mockReturnValue({
          update: vi.fn((payload: Record<string, unknown>) => {
            operations.siteSettingsUpdates.push(payload);
            return Promise.resolve(1);
          }),
        }),
      };
    }

    throw new Error(`Unhandled table mock: ${tableName}`);
  }) as unknown as {
    (tableName: string): Record<string, unknown>;
    schema: typeof schema;
    fn: { now: typeof now };
    raw: (value: string) => string;
  };

  knex.schema = schema;
  knex.fn = { now };
  knex.raw = (value: string) => value;

  return { knex, operations, schema };
}

describe('20260604000000_add_auth_foundation migration', () => {
  it('imports legacy admin users and marks install completed for an already-initialized site', async () => {
    const legacyAdmin = {
      id: 'admin-1',
      email: 'owner@example.com',
      display_name: 'Owner',
      avatar_url: null,
      last_login_at: new Date('2026-06-01T00:00:00.000Z'),
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-06-01T00:00:00.000Z'),
    };

    const { knex, operations } = createMockKnex({
      adminUsers: [legacyAdmin],
      siteUsers: [{ id: legacyAdmin.id }],
    });

    await up(knex as never);

    expect(operations.siteUserInserts).toHaveLength(1);
    expect(operations.siteUserInserts[0]).toMatchObject({
      id: legacyAdmin.id,
      email: legacyAdmin.email,
      primary_auth_provider: 'credentials',
      is_active: true,
    });
    expect(operations.authUserRoleInserts).toContainEqual(
      expect.objectContaining({ user_id: legacyAdmin.id, role_id: 'role-superadmin' })
    );
    expect(operations.siteSettingsUpdates).toContainEqual(
      expect.objectContaining({ value: 'true' })
    );
  });

  it('leaves install incomplete when no existing users are present', async () => {
    const { knex, operations } = createMockKnex({
      adminUsers: [],
      siteUsers: [],
    });

    await up(knex as never);

    expect(operations.siteUserInserts).toHaveLength(0);
    expect(operations.authUserRoleInserts).toHaveLength(0);
    expect(operations.siteSettingsUpdates).toHaveLength(0);
  });
});
