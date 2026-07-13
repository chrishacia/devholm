import { z } from 'zod';

export const MAX_ISOLATED_REQUEST_BODY_BYTES = 256 * 1024;
export const MAX_ISOLATED_RESPONSE_BODY_BYTES = 512 * 1024;
export const DEFAULT_ISOLATED_EXECUTION_TIMEOUT_MS = 5000;

const headerTupleSchema = z.tuple([z.string(), z.string()]);

export const isolatedRequestEnvelopeSchema = z.object({
  url: z.string().url(),
  method: z.string().min(1),
  headers: z.array(headerTupleSchema),
  bodyText: z.string().optional(),
});

const executeApiMessageSchema = z.object({
  type: z.literal('execute-api'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  extensionPath: z.string().min(1),
  method: z.string().min(1),
  pathSegments: z.array(z.string()),
  request: isolatedRequestEnvelopeSchema,
});

const executePublicRouteMatchMessageSchema = z.object({
  type: z.literal('execute-public-route-match'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  extensionId: z.string().min(1),
  pathname: z.string().min(1),
  request: isolatedRequestEnvelopeSchema,
});

const executePublicRouteHandleMessageSchema = z.object({
  type: z.literal('execute-public-route-handle'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  extensionId: z.string().min(1),
  request: isolatedRequestEnvelopeSchema,
  match: z.unknown(),
});

const lifecycleHookNameSchema = z.enum([
  'afterInstall',
  'afterUpgrade',
  'beforeDisable',
  'beforeUninstall',
  'purge',
]);

const migrationIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

const migrationColumnTypeSchema = z.enum([
  'uuid',
  'string',
  'text',
  'boolean',
  'timestamp',
  'integer',
  'bigInteger',
  'smallint',
  'date',
  'jsonb',
  'enum',
]);

const migrationColumnSchema = z
  .object({
    name: migrationIdentifierSchema,
    type: migrationColumnTypeSchema,
    length: z.number().int().positive().max(4096).optional(),
    enumName: migrationIdentifierSchema.optional(),
    enumValues: z.array(z.string().min(1).max(128)).max(64).optional(),
    nullable: z.boolean().optional(),
    primary: z.boolean().optional(),
    unique: z.boolean().optional(),
    defaultNow: z.boolean().optional(),
    defaultUuid: z.boolean().optional(),
    defaultBoolean: z.boolean().optional(),
    defaultNumber: z.number().optional(),
    defaultString: z.string().max(2048).optional(),
  })
  .strict();

const migrationForeignKeySchema = z
  .object({
    column: migrationIdentifierSchema,
    referencesTable: migrationIdentifierSchema,
    referencesColumn: migrationIdentifierSchema,
    onDelete: z.enum(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']).optional(),
  })
  .strict();

const migrationOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('create-table'),
      table: migrationIdentifierSchema,
      columns: z.array(migrationColumnSchema).min(1).max(256),
      foreignKeys: z.array(migrationForeignKeySchema).max(128).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('drop-table'),
      table: migrationIdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('add-column'),
      table: migrationIdentifierSchema,
      column: migrationColumnSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('drop-column'),
      table: migrationIdentifierSchema,
      column: migrationIdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('create-index'),
      table: migrationIdentifierSchema,
      columns: z.array(migrationIdentifierSchema).min(1).max(16),
      name: migrationIdentifierSchema.optional(),
      unique: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('create-unique-nulls-not-distinct'),
      table: migrationIdentifierSchema,
      columns: z.array(migrationIdentifierSchema).min(1).max(16),
      name: migrationIdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('drop-unique-constraint'),
      table: migrationIdentifierSchema,
      name: migrationIdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('drop-index'),
      table: migrationIdentifierSchema,
      name: migrationIdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('create-foreign-key'),
      table: migrationIdentifierSchema,
      key: migrationForeignKeySchema,
      constraintName: migrationIdentifierSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('drop-foreign-key'),
      table: migrationIdentifierSchema,
      column: migrationIdentifierSchema,
      constraintName: migrationIdentifierSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('drop-enum'),
      enumName: migrationIdentifierSchema,
    })
    .strict(),
]);

const migrationExecutionPlanSchema = z
  .object({
    protocolVersion: z.literal('migration-plan-v1'),
    pluginId: z.string().min(1),
    migrationId: z.string().min(1),
    checksum: z.string().length(64),
    artifactIdentity: z.string().min(1),
    sourceVersion: z.string().min(1),
    targetVersion: z.string().min(1),
    reversible: z.boolean(),
    up: z.array(migrationOperationSchema).max(512),
    down: z.array(migrationOperationSchema).max(512),
  })
  .strict();

const executeLifecycleHookMessageSchema = z.object({
  type: z.literal('execute-lifecycle-hook'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  hookName: lifecycleHookNameSchema,
  operationId: z.string().uuid(),
  hookExecutionId: z.string().uuid(),
  artifactIdentity: z.string().min(1),
  context: z.object({
    pluginId: z.string().min(1),
    fromVersion: z.string().optional(),
    toVersion: z.string().optional(),
    initiatedBy: z.string().optional(),
    dryRun: z.boolean().optional(),
  }),
  effectiveCapabilities: z.array(z.string().min(1)).max(64),
  approvedBrokerOperations: z.array(z.string().min(1)).max(64),
});

const testProbeEnvMessageSchema = z.object({
  type: z.literal('test-probe-env'),
  executionId: z.string().uuid(),
  keys: z.array(z.string().min(1)).max(32),
});

const executeMigrationPlanMessageSchema = z.object({
  type: z.literal('execute-migration-plan'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  migrationId: z.string().min(1),
  checksum: z.string().length(64),
  artifactIdentity: z.string().min(1),
  direction: z.enum(['up', 'down']),
  absolutePath: z.string().min(1),
  sourceVersion: z.string().min(1),
  targetVersion: z.string().min(1),
  timeoutMs: z.number().int().positive().max(30000).optional(),
});

export const parentToChildMessageSchema = z.discriminatedUnion('type', [
  executeApiMessageSchema,
  executePublicRouteMatchMessageSchema,
  executePublicRouteHandleMessageSchema,
  executeLifecycleHookMessageSchema,
  testProbeEnvMessageSchema,
  executeMigrationPlanMessageSchema,
]);

export type ParentToChildMessage = z.infer<typeof parentToChildMessageSchema>;

const workerReadyMessageSchema = z.object({
  type: z.literal('worker-ready'),
  pid: z.number().int().positive(),
});

const workerErrorMessageSchema = z.object({
  type: z.literal('worker-error'),
  executionId: z.string().uuid(),
  code: z.string().min(1),
  message: z.string(),
  pid: z.number().int().positive(),
});

const apiResultMessageSchema = z.object({
  type: z.literal('api-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  status: z.number().int(),
  headers: z.array(headerTupleSchema),
  bodyText: z.string(),
  truncated: z.boolean(),
});

const publicRouteMatchResultSchema = z.object({
  type: z.literal('public-route-match-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  matched: z.boolean(),
  match: z.unknown().optional(),
});

const publicRouteHandleResultSchema = z.object({
  type: z.literal('public-route-handle-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  status: z.number().int(),
  headers: z.array(headerTupleSchema),
  bodyText: z.string(),
  truncated: z.boolean(),
});

const lifecycleHookResultSchema = z.object({
  type: z.literal('lifecycle-hook-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  pluginId: z.string().min(1),
  hookName: lifecycleHookNameSchema,
  operationId: z.string().uuid(),
  hookExecutionId: z.string().uuid(),
  artifactIdentity: z.string().min(1),
  status: z.enum(['succeeded', 'failed', 'timed_out', 'blocked', 'cancelled']),
  message: z.string().optional(),
});

const testProbeEnvResultSchema = z.object({
  type: z.literal('test-probe-env-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  values: z.record(z.string(), z.string().nullable()),
});

const migrationPlanResultSchema = z.object({
  type: z.literal('migration-plan-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  direction: z.enum(['up', 'down']),
  plan: migrationExecutionPlanSchema,
});

export const childToParentMessageSchema = z.discriminatedUnion('type', [
  workerReadyMessageSchema,
  workerErrorMessageSchema,
  apiResultMessageSchema,
  publicRouteMatchResultSchema,
  publicRouteHandleResultSchema,
  lifecycleHookResultSchema,
  testProbeEnvResultSchema,
  migrationPlanResultSchema,
]);

export type ChildToParentMessage = z.infer<typeof childToParentMessageSchema>;
export type MigrationExecutionPlan = z.infer<typeof migrationExecutionPlanSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
