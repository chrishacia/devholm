/**
 * Seed script to create initial admin user
 *
 * Usage: pnpm seed:admin
 *
 * This will create an admin user with credentials from environment config.
 * Local: Uses values from .env file
 * Production: Uses values from docker-compose.override.yml (GitHub Secrets)
 *
 * IMPORTANT: Change the password immediately after first login!
 */

import { getDb, closeDb } from './index';
import bcrypt from 'bcryptjs';
import { admin } from '@/config/env';

async function seedAdmin() {
  const email = admin.email;
  const password = admin.password;
  const displayName = admin.name;

  console.log('Creating admin user...');

  const db = getDb();

  // Check if user already exists
  const existingUser = await db('admin_users').where('email', email).first();

  if (existingUser) {
    console.log(`Admin user already exists: ${email}`);
    await closeDb();
    return;
  }

  // Create admin user
  const passwordHash = await bcrypt.hash(password, 12);

  const insertedRows = await db('admin_users')
    .insert({
      email,
      display_name: displayName,
      password_hash: passwordHash,
      totp_enabled: false,
    })
    .returning(['id', 'email', 'display_name', 'avatar_url']);

  const insertedAdmin = insertedRows[0];
  const siteUsersTableExists = await db.schema.hasTable('site_users');
  const authUserRolesTableExists = await db.schema.hasTable('auth_user_roles');

  if (siteUsersTableExists && insertedAdmin) {
    await db('site_users')
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
        updated_at: db.fn.now(),
      });
  }

  if (siteUsersTableExists && authUserRolesTableExists && insertedAdmin) {
    const superadminRole = await db('auth_roles').where('slug', 'superadmin').first('id');
    if (superadminRole?.id) {
      await db('auth_user_roles')
        .insert({
          user_id: insertedAdmin.id,
          role_id: superadminRole.id,
        })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }
  }

  console.log(`✓ Admin user created successfully!`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  console.log('\n⚠️  IMPORTANT: Change this password immediately after first login!\n');

  await closeDb();
}

seedAdmin().catch((error) => {
  console.error('Error seeding admin:', error);
  process.exit(1);
});
