require('dotenv').config();

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
      directory: ['./src/core/db/migrations', './src/user/extensions/db/migrations'],
      tableName: 'knex_migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: [
        './src/core/db/seeds/bootstrap',
        './src/core/db/seeds/demo',
        './src/user/extensions/db/seeds',
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
      directory: ['./src/core/db/migrations', './src/user/extensions/db/migrations'],
      tableName: 'knex_migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: [
        './src/core/db/seeds/bootstrap',
        './src/core/db/seeds/demo',
        './src/user/extensions/db/seeds',
      ],
      extension: 'ts',
      loadExtensions: ['.ts'],
      recursive: true,
      sortDirsSeparately: true,
    },
  },
};

module.exports = config;
