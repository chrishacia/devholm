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

  await db('admin_users').insert({
    email,
    display_name: displayName,
    password_hash: passwordHash,
    totp_enabled: false,
  });

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
