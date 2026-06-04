/**
 * Standalone Migration Runner
 * ===========================
 * 
 * Runs Knex migrations without requiring the full knex CLI.
 * Designed to work in the minimal production Docker image.
 * 
 * Handles TypeScript migrations by using tsx/ts-node or 
 * falling back to requiring them directly (Node 22+ can handle simple TS).
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const knex = require('knex');
const path = require('path');
const fs = require('fs');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Determine migration directories (production vs development).
  // Production image copies core migrations to /app/migrations and user migrations
  // to /app/migrations/user. Both must be scanned so historical ledgers and
  // extension migrations stay valid across upgrades.
  const migrationDirs = fs.existsSync(path.join(__dirname, 'migrations'))
    ? [
        path.join(__dirname, 'migrations'),
        path.join(__dirname, 'migrations/user'),
      ].filter((dir) => fs.existsSync(dir))
    : [
        path.join(__dirname, '../src/core/db/migrations'),
        path.join(__dirname, '../src/user/extensions/db/migrations'),
      ].filter((dir) => fs.existsSync(dir));

  console.log('📂 Using migrations from:');
  migrationDirs.forEach((dir) => console.log(`   - ${dir}`));

  const db = knex({
    client: 'pg',
    connection: databaseUrl,
    migrations: {
      directory: migrationDirs,
      tableName: 'knex_migrations',
      // Support both .ts and .js files
      loadExtensions: ['.ts', '.js'],
    },
  });

  try {
    console.log('🔍 Checking pending migrations...');
    
    const [, pending] = await db.migrate.list();

    if (pending.length === 0) {
      console.log('✅ Database is up to date (no pending migrations)');
    } else {
      console.log(`📦 Found ${pending.length} pending migration(s):`);
      pending.forEach(m => console.log(`   - ${m.name || m.file || m}`));
      
      console.log('⏳ Applying migrations...');
      const [batchNo, applied] = await db.migrate.latest();
      
      if (applied.length > 0) {
        console.log(`✅ Batch ${batchNo} applied ${applied.length} migration(s):`);
        applied.forEach(m => console.log(`   ✓ ${m}`));
      }
    }

    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    await db.destroy();
    process.exit(1);
  }
}

runMigrations();
