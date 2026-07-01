require('dotenv').config();
const fs = require('fs');
const path = require('path');

function loadPluginRegistry() {
  const registryPath = path.join(__dirname, 'src/user/extensions/plugins/migration-registry.json');
  if (!fs.existsSync(registryPath)) {
    return { plugins: [] };
  }

  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { plugins: [] };
  }
}

function getPluginMigrationDirectories() {
  const registry = loadPluginRegistry();
  return (registry.plugins || [])
    .map((plugin) => plugin.migrationDir)
    .filter((dir) => typeof dir === 'string' && fs.existsSync(path.join(__dirname, dir)));
}

function getPluginSeedDirectories() {
  const registry = loadPluginRegistry();
  return (registry.plugins || [])
    .map((plugin) => plugin.seedDir)
    .filter((dir) => typeof dir === 'string' && fs.existsSync(path.join(__dirname, dir)));
}

const pluginMigrationDirectories = getPluginMigrationDirectories();
const pluginSeedDirectories = getPluginSeedDirectories();

/**
 * Knex Configuration
 *
 * Uses environment variables from:
 * - Local: .env file
 * - Production: docker-compose.override.yml environment
 *
 * @type {import('knex').Knex.Config}
 */
const config = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || 'mysite',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: [
        './src/core/db/migrations',
        './src/user/extensions/db/migrations',
        ...pluginMigrationDirectories,
      ],
      tableName: 'knex_migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: [
        './src/core/db/seeds/bootstrap',
        './src/core/db/seeds/demo',
        './src/user/extensions/db/seeds',
        ...pluginSeedDirectories,
      ],
      extension: 'ts',
      loadExtensions: ['.ts'],
      recursive: true,
      sortDirsSeparately: true,
    },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: [
        './src/core/db/migrations',
        './src/user/extensions/db/migrations',
        ...pluginMigrationDirectories,
      ],
      tableName: 'knex_migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: [
        './src/core/db/seeds/bootstrap',
        './src/core/db/seeds/demo',
        './src/user/extensions/db/seeds',
        ...pluginSeedDirectories,
      ],
      extension: 'ts',
      loadExtensions: ['.ts'],
      recursive: true,
      sortDirsSeparately: true,
    },
  },
};

module.exports = config;
