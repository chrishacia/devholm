import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

/**
 * E2E Test Identities
 * ====================
 * Provisions additional test identities for full Stage 3 SDK authorization E2E matrix.
 * These identities enable real HTTP tests covering multiple role/permission combinations.
 *
 * Identities:
 * 1. superadmin@example.test — superadmin role (covers broader access)
 * 2. admin-access@example.test — admin role (covers admin.access permission path)
 * 3. users-manage@example.test — users.manage permission only (covers permission path)
 * 4. member@example.test — no admin roles or special permissions (covers denied path)
 * 5. admin@example.test — admin role (already exists in 001_admin_user.ts, kept for backward compat)
 *
 * All use password: e2e-test-password-change-me
 *
 * E2E matrix covered:
 * - GET /api/admin/dashboard:
 *   admin (role admin) → 200 ✓ (via 001_admin_user)
 *   superadmin → 200 ✓
 *   user with admin.access permission → 200 ✓
 *   member → 403 ✓
 *   anonymous → 401 ✓ (no seed needed)
 *
 * - GET /api/admin/auth/users:
 *   admin (role admin) → 200 ✓ (via 001_admin_user)
 *   superadmin → 200 ✓
 *   user with users.manage permission → 200 ✓
 *   user with admin.access permission → 200 ✓
 *   member → 403 ✓
 *   anonymous → 401 ✓ (no seed needed)
 */

const TEST_PASSWORD = 'e2e-test-password-change-me';

export async function seed(knex: Knex): Promise<void> {
  const siteUsersTableExists = await knex.schema.hasTable('site_users');
  const authUserRolesTableExists = await knex.schema.hasTable('auth_user_roles');
  const authPermissionsTableExists = await knex.schema.hasTable('auth_permissions');
  const authUserPermissionsTableExists = await knex.schema.hasTable('auth_user_permissions');

  if (!siteUsersTableExists || !authUserRolesTableExists) {
    console.log('⊘ Skipping E2E test identities: required tables not found');
    return;
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  // Get role IDs
  const superadminRole = await knex('auth_roles').where('slug', 'superadmin').first('id');
  const adminRole = await knex('auth_roles').where('slug', 'admin').first('id');

  // Get permission IDs
  const usersManagePermission = authPermissionsTableExists
    ? await knex('auth_permissions').where('slug', 'users.manage').first('id')
    : null;

  // Test identities to provision
  const testIdentities = [
    {
      email: 'superadmin@example.test',
      displayName: 'Test Superadmin',
      roles: superadminRole?.id ? [superadminRole.id] : [],
      permissions: [],
    },
    {
      email: 'admin-access@example.test',
      displayName: 'Test Admin Access',
      roles: adminRole?.id ? [adminRole.id] : [],
      permissions: [],
    },
    {
      email: 'users-manage@example.test',
      displayName: 'Test Users Manage',
      roles: [],
      permissions: usersManagePermission?.id ? [usersManagePermission.id] : [],
    },
    {
      email: 'member@example.test',
      displayName: 'Test Member',
      roles: [],
      permissions: [],
    },
  ];

  for (const identity of testIdentities) {
    // Skip if user already exists
    const existing = await knex('site_users').where('email', identity.email).first('id');
    if (existing) {
      continue;
    }

    // Create site user
    const insertedRows = await knex('site_users')
      .insert({
        email: identity.email,
        display_name: identity.displayName,
        primary_auth_provider: 'credentials',
        is_active: true,
      })
      .returning(['id', 'email']);

    const user = insertedRows[0];
    if (!user) continue;

    // Create admin_users entry for credential-based login
    const adminUserExists = await knex('admin_users').where('email', identity.email).first('id');
    if (!adminUserExists) {
      await knex('admin_users')
        .insert({
          email: identity.email,
          display_name: identity.displayName,
          password_hash: passwordHash,
          totp_enabled: false,
        })
        .onConflict('email')
        .ignore();
    }

    // Assign roles
    for (const roleId of identity.roles) {
      await knex('auth_user_roles')
        .insert({
          user_id: user.id,
          role_id: roleId,
        })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }

    // Assign permissions
    if (authUserPermissionsTableExists) {
      for (const permissionId of identity.permissions) {
        await knex('auth_user_permissions')
          .insert({
            user_id: user.id,
            permission_id: permissionId,
          })
          .onConflict(['user_id', 'permission_id'])
          .ignore();
      }
    }
  }

  console.log('✓ E2E test identities seeded');
  console.log(`  All use password: ${TEST_PASSWORD}`);
}
