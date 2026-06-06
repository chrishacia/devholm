/**
 * Standalone Admin Seeder
 * =======================
 *
 * Creates or updates the admin user on startup.
 * Designed to work in the minimal production Docker image.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const knex = require('knex');
const bcrypt = require('bcryptjs');

async function seedAdmin() {
  const databaseUrl = process.env.DATABASE_URL;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const forcePasswordReset = ['1', 'true', 'yes'].includes(
    String(process.env.FORCE_ADMIN_PASSWORD_RESET || '').toLowerCase()
  );

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!adminEmail || !adminPassword) {
    console.log('⏭️ ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping admin seed');
    process.exit(0);
  }

  const db = knex({
    client: 'pg',
    connection: databaseUrl,
  });

  try {
    // Check if admin user exists
    const existing = await db('admin_users').where('email', adminEmail).first();

    if (existing) {
      const passwordMatches = await bcrypt.compare(adminPassword, existing.password_hash);
      if (!passwordMatches) {
        if (forcePasswordReset) {
          const passwordHash = await bcrypt.hash(adminPassword, 12);
          await db('admin_users')
            .where('id', existing.id)
            .update({ password_hash: passwordHash, updated_at: new Date() });
          console.log(`✅ Admin user ${adminEmail} password reset via FORCE_ADMIN_PASSWORD_RESET`);
        } else {
          console.log(
            `🔒 Admin user ${adminEmail} exists and password differs; skipped update (set FORCE_ADMIN_PASSWORD_RESET=true to override)`
          );
        }
      } else {
        console.log(`✅ Admin user ${adminEmail} already exists`);
      }
    } else {
      // Hash password and create admin
      const passwordHash = await bcrypt.hash(adminPassword, 12);

      await db('admin_users').insert({
        email: adminEmail,
        password_hash: passwordHash,
        display_name: 'Admin',
        totp_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      console.log(`✅ Created admin user: ${adminEmail}`);
    }

    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Admin seeding failed:', error.message);
    await db.destroy();
    process.exit(1);
  }
}

seedAdmin();
