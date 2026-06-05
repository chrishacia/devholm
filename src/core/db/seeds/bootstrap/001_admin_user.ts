import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { admin } from '@/config/env';

export async function seed(knex: Knex): Promise<void> {
  await knex('sessions').del();
  await knex('admin_users').del();
  const siteUsersTableExists = await knex.schema.hasTable('site_users');
  const authUserRolesTableExists = await knex.schema.hasTable('auth_user_roles');

  const adminEmail = admin.email;
  const adminPassword = admin.password;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const insertedAdminRows = await knex('admin_users')
    .insert({
      email: adminEmail,
      password_hash: passwordHash,
      display_name: 'Site Admin',
      totp_enabled: false,
    })
    .returning(['id', 'email', 'display_name', 'avatar_url']);

  const insertedAdmin = insertedAdminRows[0];

  if (siteUsersTableExists && insertedAdmin) {
    await knex('site_users')
      .insert({
        id: insertedAdmin.id,
        email: insertedAdmin.email,
        display_name: insertedAdmin.display_name,
        avatar_url: insertedAdmin.avatar_url,
        primary_auth_provider: 'credentials',
        is_active: true,
      })
      .onConflict('id')
      .merge({
        email: insertedAdmin.email,
        display_name: insertedAdmin.display_name,
        avatar_url: insertedAdmin.avatar_url,
        updated_at: knex.fn.now(),
      });
  }

  if (siteUsersTableExists && authUserRolesTableExists && insertedAdmin) {
    const superadminRole = await knex('auth_roles').where('slug', 'superadmin').first('id');
    if (superadminRole?.id) {
      await knex('auth_user_roles')
        .insert({
          user_id: insertedAdmin.id,
          role_id: superadminRole.id,
        })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }
  }

  console.log('✓ Admin user seeded');
  console.log(`  Email: ${adminEmail}`);
  console.log('  IMPORTANT: Change the password after first login!');
}
