import type { Knex } from 'knex';

/**
 * E2E Fixture User Seeds
 * ======================
 *
 * Seeds deterministic site_users records for E2E Stage 3 authorization testing.
 *
 * These users correspond to the fixed UUIDs in e2e/fixtures/auth-jwt.ts
 * (E2E_FIXTURE_IDS). They are required because:
 *
 *   GET /api/admin/dashboard calls getAuthOnboardingStatus(userId) which calls
 *   getLinkedAccountsForUser(userId). That function queries auth_provider_accounts
 *   WHERE user_id = userId. The user_id column is typed uuid in PostgreSQL.
 *   Passing a non-UUID value causes: invalid input syntax for type uuid → HTTP 500.
 *
 * Guard: this seed only runs when ADMIN_EMAIL ends with @example.test (the CI
 * test domain). It will NOT run in production where ADMIN_EMAIL is a real address.
 *
 * Role assignments use production-compatible auth_user_roles rows. JWT-only
 * permission claims (admin.access, users.manage on member-role identities) are
 * NOT replicated in auth_role_permissions — Stage 3 authorization reads JWT claims
 * directly, not the DB. This seed does not create admin_users rows for fixture
 * identities, so they cannot authenticate via credentials.
 */

// These UUIDs must match E2E_FIXTURE_IDS in e2e/fixtures/auth-jwt.ts exactly.
const E2E_FIXTURE_IDS = {
  admin: 'e2e00000-0000-4000-8000-00000000a001',
  superadmin: 'e2e00000-0000-4000-8000-00000000a002',
  'admin-access-only': 'e2e00000-0000-4000-8000-00000000a003',
  'users-manage-only': 'e2e00000-0000-4000-8000-00000000a004',
  member: 'e2e00000-0000-4000-8000-00000000a005',
} as const;

const FIXTURE_USERS = [
  {
    id: E2E_FIXTURE_IDS['admin'],
    email: 'e2e-admin@example.test',
    display_name: 'E2E Admin',
    // DB role: admin (JWT claims: role=admin, roles=[admin], isAdmin=true)
    roleSlug: 'admin',
  },
  {
    id: E2E_FIXTURE_IDS['superadmin'],
    email: 'e2e-superadmin@example.test',
    display_name: 'E2E Super Admin',
    // DB role: superadmin (JWT claims: role=superadmin, roles=[superadmin], isAdmin=true)
    roleSlug: 'superadmin',
  },
  {
    id: E2E_FIXTURE_IDS['admin-access-only'],
    email: 'e2e-admin-access-only@example.test',
    display_name: 'E2E Admin Access Only',
    // DB role: member (JWT claims: role=member, permissions=[admin.access], isAdmin=true)
    // The admin.access permission comes from the JWT claim only, not from DB role assignment.
    // This keeps the fixture genuinely permission-only as required.
    roleSlug: 'member',
  },
  {
    id: E2E_FIXTURE_IDS['users-manage-only'],
    email: 'e2e-users-manage-only@example.test',
    display_name: 'E2E Users Manage Only',
    // DB role: member (JWT claims: role=member, permissions=[users.manage], isAdmin=false)
    roleSlug: 'member',
  },
  {
    id: E2E_FIXTURE_IDS['member'],
    email: 'e2e-member@example.test',
    display_name: 'E2E Member',
    // DB role: member (JWT claims: role=member, isAdmin=false)
    roleSlug: 'member',
  },
] as const;

export async function seed(knex: Knex): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? '';

  // Production guard: only run in CI/test environments where ADMIN_EMAIL uses
  // the @example.test domain. Never seed synthetic identities in production.
  if (!adminEmail.endsWith('@example.test')) {
    console.log('⏭  Skipping E2E fixture users (not a test environment)');
    return;
  }

  const siteUsersExists = await knex.schema.hasTable('site_users');
  const authUserRolesExists = await knex.schema.hasTable('auth_user_roles');
  const authRolesExists = await knex.schema.hasTable('auth_roles');

  if (!siteUsersExists) {
    console.log('⏭  Skipping E2E fixture users (site_users table not found)');
    return;
  }

  // Fetch role IDs from DB (they are auto-generated UUIDs; do not hardcode).
  const roleRows = authRolesExists
    ? await knex('auth_roles')
        .whereIn('slug', ['admin', 'superadmin', 'member'])
        .select('id', 'slug')
    : [];
  const roleIdBySlug = new Map<string, string>(
    roleRows.map((row) => [row.slug as string, row.id as string])
  );

  for (const fixture of FIXTURE_USERS) {
    await knex('site_users')
      .insert({
        id: fixture.id,
        email: fixture.email,
        display_name: fixture.display_name,
        primary_auth_provider: null,
        is_active: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('id')
      .ignore();

    if (authUserRolesExists && authRolesExists) {
      const roleId = roleIdBySlug.get(fixture.roleSlug);
      if (roleId) {
        await knex('auth_user_roles')
          .insert({
            user_id: fixture.id,
            role_id: roleId,
            created_at: knex.fn.now(),
          })
          .onConflict(['user_id', 'role_id'])
          .ignore();
      }
    }
  }

  console.log(`✓ E2E fixture users seeded (${FIXTURE_USERS.length} identities)`);
}
