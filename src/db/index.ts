import knex, { Knex } from 'knex';
import { database, env } from '@/config/env';

let db: Knex | null = null;

/**
 * Get database connection instance (singleton pattern)
 */
export function getDb(): Knex {
  if (!db) {
    // Validate password is set (PostgreSQL SCRAM auth requires a non-empty password)
    if (!database.url && !database.password) {
      console.error(
        '\n⚠️  DATABASE_PASSWORD is not set!\n' +
          '   PostgreSQL requires a password for authentication.\n' +
          '   Please set DATABASE_PASSWORD in your .env file.\n' +
          '   Default for local dev: DATABASE_PASSWORD=postgres\n'
      );
    }

    const connectionConfig =
      database.url ||
      ({
        host: database.host,
        port: database.port,
        database: database.name,
        user: database.user,
        password: database.password || undefined, // undefined instead of empty string
        ...(env.isProduction && {
          ssl: { rejectUnauthorized: false },
        }),
      } as Knex.PgConnectionConfig);

    db = knex({
      client: 'pg',
      connection: connectionConfig,
      pool: {
        min: 2,
        max: 10,
      },
    });
  }
  return db;
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

/**
 * Check database health
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const database = getDb();
    await database.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
