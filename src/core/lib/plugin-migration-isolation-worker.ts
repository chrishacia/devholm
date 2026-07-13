import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  childToParentMessageSchema,
  parentToChildMessageSchema,
} from '@core/lib/plugin-isolation-protocol';

const WORKER_PID = process.pid;

const DISALLOWED_MIGRATION_IMPORT_PATTERNS = [
  /from\s+['"]@\/db['"]/,
  /from\s+['"]@core\/db\//,
  /from\s+['"]knex['"]/,
  /from\s+['"]pg['"]/,
  /from\s+['"]@prisma\/client['"]/,
  /from\s+['"]node:child_process['"]/,
  /from\s+['"]child_process['"]/,
  /from\s+['"]node:fs['"]/,
  /from\s+['"]fs['"]/,
];

const DISALLOWED_MIGRATION_ENV_KEYS = [
  'DATABASE_URL',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'PGSSLMODE',
  'PHASE2_TEST_DATABASE_URL',
] as const;

function sendMessage(payload: unknown): void {
  if (typeof process.send !== 'function') {
    return;
  }

  const parsed = childToParentMessageSchema.safeParse(payload);
  if (!parsed.success) {
    process.send({
      type: 'worker-error',
      executionId: '00000000-0000-0000-0000-000000000000',
      code: 'worker-protocol-encode-failure',
      message: 'worker attempted to send a malformed protocol message',
      pid: WORKER_PID,
    });
    return;
  }

  process.send(parsed.data);
}

async function executeMigrationPlan(
  message: Extract<
    ReturnType<typeof parentToChildMessageSchema.parse>,
    { type: 'execute-migration-plan' }
  >
): Promise<void> {
  for (const key of DISALLOWED_MIGRATION_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      throw new Error('migration plan worker received forbidden database credential environment');
    }
  }

  const source = await readFile(message.absolutePath, 'utf8');
  for (const pattern of DISALLOWED_MIGRATION_IMPORT_PATTERNS) {
    if (pattern.test(source)) {
      throw new Error('migration plan imports a disallowed module');
    }
  }

  const mod = await import(/* webpackIgnore: true */ pathToFileURL(message.absolutePath).href);
  const plan = mod.migrationPlanV1;

  if (!plan || typeof plan !== 'object') {
    throw new Error('migration module must export migrationPlanV1 object');
  }

  sendMessage({
    type: 'migration-plan-result',
    executionId: message.executionId,
    pid: WORKER_PID,
    direction: message.direction,
    plan: {
      ...plan,
      protocolVersion: 'migration-plan-v1',
      pluginId: message.pluginId,
      migrationId: message.migrationId,
      checksum: message.checksum,
      artifactIdentity: message.artifactIdentity,
      sourceVersion: message.sourceVersion,
      targetVersion: message.targetVersion,
    },
  });
}

process.on('message', async (rawMessage: unknown) => {
  const parsed = parentToChildMessageSchema.safeParse(rawMessage);
  if (!parsed.success) {
    sendMessage({
      type: 'worker-error',
      executionId: '00000000-0000-0000-0000-000000000000',
      code: 'worker-protocol-parse-failure',
      message: 'worker received malformed parent message',
      pid: WORKER_PID,
    });
    return;
  }

  const message = parsed.data;
  if (message.type !== 'execute-migration-plan') {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'unexpected-message-type',
      message: 'migration isolation worker only accepts execute-migration-plan messages',
      pid: WORKER_PID,
    });
    return;
  }

  try {
    await executeMigrationPlan(message);
  } catch (error) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'migration-plan-failure',
      message: error instanceof Error ? error.message : 'unknown migration plan failure',
      pid: WORKER_PID,
    });
  }
});

sendMessage({
  type: 'worker-ready',
  pid: WORKER_PID,
});
