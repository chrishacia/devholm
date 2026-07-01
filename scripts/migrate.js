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
const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadPluginRegistry(rootDir) {
  const candidatePaths = [
    path.join(rootDir, 'plugins', 'migration-registry.json'),
    path.join(rootDir, 'src', 'user', 'extensions', 'plugins', 'migration-registry.json'),
  ];

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        filePath,
        plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
      };
    } catch {
      return { filePath, plugins: [] };
    }
  }

  return { filePath: null, plugins: [] };
}

function resolvePluginMigrationDirs(rootDir, registryPlugins) {
  return registryPlugins
    .map((plugin) => {
      if (!plugin) {
        return null;
      }

      const candidateDirs = [plugin.migrationDir, plugin.productionMigrationDir]
        .filter((value) => typeof value === 'string' && value.length > 0)
        .map((value) => (path.isAbsolute(value) ? value : path.join(rootDir, value)));

      const absolute = candidateDirs.find((candidate) => fs.existsSync(candidate));

      if (!absolute) {
        return null;
      }

      return {
        pluginId: plugin.id,
        version: plugin.version || '0.0.0',
        dir: absolute,
      };
    })
    .filter(Boolean);
}

function listPluginMigrationFiles(pluginMigrationDirs) {
  const discovered = [];
  for (const plugin of pluginMigrationDirs) {
    const files = fs
      .readdirSync(plugin.dir)
      .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const absolutePath = path.join(plugin.dir, file);
      const content = fs.readFileSync(absolutePath, 'utf8');
      discovered.push({
        pluginId: plugin.pluginId,
        pluginVersion: plugin.version,
        file,
        absolutePath,
        checksum: sha256(content),
        migrationId: `${plugin.pluginId}:${file.replace(/\.(ts|js)$/u, '')}`,
      });
    }
  }
  return discovered;
}

async function reconcilePluginMigrationLedger(db, pluginMigrations) {
  if (pluginMigrations.length === 0) {
    return;
  }

  const duplicateIds = new Set();
  const seenIds = new Set();
  for (const migration of pluginMigrations) {
    if (seenIds.has(migration.migrationId)) {
      duplicateIds.add(migration.migrationId);
    }
    seenIds.add(migration.migrationId);
  }
  if (duplicateIds.size > 0) {
    throw new Error(
      `Duplicate plugin migration IDs detected: ${Array.from(duplicateIds).sort().join(', ')}`
    );
  }

  for (const migration of pluginMigrations) {
    await db('devholm_plugins')
      .insert({
        plugin_id: migration.pluginId,
        installed_version: migration.pluginVersion,
        enabled: false,
        lifecycle_state: 'installed',
        installed_at: new Date(),
        upgraded_at: new Date(),
        manifest_checksum: null,
        updated_at: new Date(),
      })
      .onConflict('plugin_id')
      .merge({
        installed_version: migration.pluginVersion,
        updated_at: new Date(),
      });
  }

  const existingLedger = await db('devholm_plugin_migrations').select(
    'plugin_id',
    'migration_id',
    'checksum'
  );

  const ledgerById = new Map(
    existingLedger.map((row) => [`${row.plugin_id}:${row.migration_id}`, row.checksum])
  );

  for (const migration of pluginMigrations) {
    const key = `${migration.pluginId}:${migration.migrationId}`;
    const existingChecksum = ledgerById.get(key);
    if (existingChecksum && existingChecksum !== migration.checksum) {
      throw new Error(
        `Checksum mismatch for already-applied plugin migration ${migration.migrationId}`
      );
    }
  }

  const appliedKnexMigrations = await db('knex_migrations').select('name', 'migration_time');
  const appliedByName = new Map(appliedKnexMigrations.map((row) => [row.name, row.migration_time]));

  let batchOrder = 0;
  for (const migration of pluginMigrations) {
    if (!appliedByName.has(migration.file)) {
      continue;
    }

    const existing = await db('devholm_plugin_migrations')
      .where({
        plugin_id: migration.pluginId,
        migration_id: migration.migrationId,
      })
      .first();

    if (existing) {
      continue;
    }

    batchOrder += 1;
    await db('devholm_plugin_migrations').insert({
      plugin_id: migration.pluginId,
      migration_id: migration.migrationId,
      plugin_version: migration.pluginVersion,
      checksum: migration.checksum,
      applied_at: appliedByName.get(migration.file) || new Date(),
      execution_duration_ms: 0,
      batch_order: batchOrder,
      created_at: new Date(),
    });
  }
}

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
  const rootDir = fs.existsSync(path.join(__dirname, 'migrations'))
    ? __dirname
    : path.join(__dirname, '..');
  const registry = loadPluginRegistry(rootDir);
  const pluginMigrationDirs = resolvePluginMigrationDirs(rootDir, registry.plugins);

  const migrationDirs = fs.existsSync(path.join(__dirname, 'migrations'))
    ? [
        path.join(__dirname, 'migrations'),
        path.join(__dirname, 'migrations/user'),
        ...pluginMigrationDirs.map((item) => item.dir),
      ].filter((dir) => fs.existsSync(dir))
    : [
        path.join(__dirname, '../src/core/db/migrations'),
        path.join(__dirname, '../src/user/extensions/db/migrations'),
        ...pluginMigrationDirs.map((item) => item.dir),
      ].filter((dir) => fs.existsSync(dir));

  console.log('📂 Using migrations from:');
  migrationDirs.forEach((dir) => console.log(`   - ${dir}`));
  if (registry.filePath) {
    console.log(`📦 Plugin registry: ${registry.filePath}`);
  }

  const db = knex({
    client: 'pg',
    connection: databaseUrl,
    migrations: {
      directory: migrationDirs,
      tableName: 'knex_migrations',
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
      pending.forEach((m) => console.log(`   - ${m.name || m.file || m}`));

      console.log('⏳ Applying migrations...');
      const [batchNo, applied] = await db.migrate.latest();

      if (applied.length > 0) {
        console.log(`✅ Batch ${batchNo} applied ${applied.length} migration(s):`);
        applied.forEach((m) => console.log(`   ✓ ${m}`));
      }
    }

    const pluginMigrations = listPluginMigrationFiles(pluginMigrationDirs);
    await reconcilePluginMigrationLedger(db, pluginMigrations);

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
