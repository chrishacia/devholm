export const migrationPlanV1 = {
  protocolVersion: 'migration-plan-v1',
  pluginId: 'url-shortener',
  migrationId: 'url-shortener:20260701010000_url_shortener_foundation',
  checksum: 'fce8d6f4c6c7414c0b740d410bb2eb7ec43dd46916a8f5ffad5fde1265a89f09',
  artifactIdentity:
    'bundled:url-shortener@0.1.0:58106ccf545a4f47070af8fa14e5ebce3ce2bc2bb8d9876079330f4ff2bf37f2',
  sourceVersion: '0.0.0',
  targetVersion: '0.1.0',
  reversible: true,
  up: [
    {
      type: 'create-table',
      table: 'u_url_shortener_links',
      columns: [
        { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
        { name: 'code', type: 'string', length: 64, nullable: false, unique: true },
        { name: 'destination_url', type: 'text', nullable: false },
        { name: 'title', type: 'string', length: 255, nullable: true },
        { name: 'is_active', type: 'boolean', nullable: false, defaultBoolean: true },
        { name: 'expires_at', type: 'timestamp', nullable: true },
        { name: 'redirect_status_code', type: 'smallint', nullable: false, defaultNumber: 302 },
        { name: 'creator_type', type: 'string', length: 32, nullable: true },
        { name: 'creator_id', type: 'string', length: 255, nullable: true },
        { name: 'creator_label', type: 'string', length: 255, nullable: true },
        { name: 'source_submission_id', type: 'uuid', nullable: true },
        { name: 'cached_click_count', type: 'bigInteger', nullable: false, defaultNumber: 0 },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultNow: true },
        { name: 'updated_at', type: 'timestamp', nullable: false, defaultNow: true },
        { name: 'deleted_at', type: 'timestamp', nullable: true },
      ],
    },
    {
      type: 'create-table',
      table: 'u_url_shortener_click_events',
      columns: [
        { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
        { name: 'link_id', type: 'uuid', nullable: false },
        { name: 'clicked_at', type: 'timestamp', nullable: false, defaultNow: true },
        { name: 'referrer_domain', type: 'string', length: 255, nullable: true },
        { name: 'referrer_category', type: 'string', length: 64, nullable: true },
        { name: 'user_agent_category', type: 'string', length: 64, nullable: true },
        { name: 'device_category', type: 'string', length: 64, nullable: true },
        { name: 'browser_category', type: 'string', length: 64, nullable: true },
        { name: 'country_code', type: 'string', length: 8, nullable: true },
        { name: 'region_code', type: 'string', length: 32, nullable: true },
        { name: 'privacy_hash', type: 'string', length: 128, nullable: true },
        { name: 'request_id', type: 'string', length: 255, nullable: true },
      ],
      foreignKeys: [
        {
          column: 'link_id',
          referencesTable: 'u_url_shortener_links',
          referencesColumn: 'id',
          onDelete: 'CASCADE',
        },
      ],
    },
    {
      type: 'create-index',
      table: 'u_url_shortener_click_events',
      columns: ['link_id', 'clicked_at'],
      name: 'u_url_shortener_click_events_link_id_clicked_at_idx',
    },
    {
      type: 'create-table',
      table: 'u_url_shortener_daily_stats',
      columns: [
        { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
        { name: 'link_id', type: 'uuid', nullable: false },
        { name: 'stat_date', type: 'date', nullable: false },
        { name: 'total_clicks', type: 'integer', nullable: false, defaultNumber: 0 },
        { name: 'unique_clicks_approx', type: 'integer', nullable: false, defaultNumber: 0 },
        { name: 'referrer_category', type: 'string', length: 64, nullable: true },
        { name: 'device_category', type: 'string', length: 64, nullable: true },
        { name: 'browser_category', type: 'string', length: 64, nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultNow: true },
        { name: 'updated_at', type: 'timestamp', nullable: false, defaultNow: true },
      ],
      foreignKeys: [
        {
          column: 'link_id',
          referencesTable: 'u_url_shortener_links',
          referencesColumn: 'id',
          onDelete: 'CASCADE',
        },
      ],
    },
    {
      type: 'create-unique-nulls-not-distinct',
      table: 'u_url_shortener_daily_stats',
      columns: ['link_id', 'stat_date', 'referrer_category', 'device_category', 'browser_category'],
      name: 'u_url_shortener_daily_stats_unique_daily_stat',
    },
    {
      type: 'create-table',
      table: 'u_url_shortener_public_submissions',
      columns: [
        { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
        { name: 'requested_destination', type: 'text', nullable: false },
        { name: 'requested_code', type: 'string', length: 64, nullable: true },
        { name: 'requester_type', type: 'string', length: 32, nullable: true },
        { name: 'requester_id', type: 'string', length: 255, nullable: true },
        { name: 'requester_label', type: 'string', length: 255, nullable: true },
        {
          name: 'status',
          type: 'enum',
          enumName: 'u_url_shortener_submission_status',
          enumValues: ['pending', 'approved', 'rejected'],
          nullable: false,
          defaultString: 'pending',
        },
        { name: 'review_notes', type: 'text', nullable: true },
        { name: 'approved_at', type: 'timestamp', nullable: true },
        { name: 'rejected_at', type: 'timestamp', nullable: true },
        { name: 'result_link_id', type: 'uuid', nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultNow: true },
        { name: 'updated_at', type: 'timestamp', nullable: false, defaultNow: true },
      ],
    },
    {
      type: 'create-foreign-key',
      table: 'u_url_shortener_links',
      key: {
        column: 'source_submission_id',
        referencesTable: 'u_url_shortener_public_submissions',
        referencesColumn: 'id',
        onDelete: 'SET NULL',
      },
      constraintName: 'u_url_shortener_links_source_submission_id_foreign',
    },
    {
      type: 'create-foreign-key',
      table: 'u_url_shortener_public_submissions',
      key: {
        column: 'result_link_id',
        referencesTable: 'u_url_shortener_links',
        referencesColumn: 'id',
        onDelete: 'SET NULL',
      },
      constraintName: 'u_url_shortener_submissions_result_link_id_foreign',
    },
    {
      type: 'create-table',
      table: 'u_url_shortener_audit_records',
      columns: [
        { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
        { name: 'action_type', type: 'string', length: 128, nullable: false },
        { name: 'target_type', type: 'string', length: 128, nullable: false },
        { name: 'target_id', type: 'string', length: 255, nullable: true },
        { name: 'actor_type', type: 'string', length: 32, nullable: true },
        { name: 'actor_id', type: 'string', length: 255, nullable: true },
        { name: 'actor_label', type: 'string', length: 255, nullable: true },
        { name: 'before_state', type: 'jsonb', nullable: true },
        { name: 'after_state', type: 'jsonb', nullable: true },
        { name: 'request_id', type: 'string', length: 255, nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultNow: true },
      ],
    },
    {
      type: 'create-index',
      table: 'u_url_shortener_audit_records',
      columns: ['target_type', 'target_id'],
      name: 'u_url_shortener_audit_records_target_lookup_idx',
    },
    {
      type: 'create-table',
      table: 'u_url_shortener_prefix_aliases',
      columns: [
        { name: 'id', type: 'uuid', primary: true, defaultUuid: true },
        { name: 'prefix', type: 'string', length: 64, nullable: false, unique: true },
        { name: 'is_active', type: 'boolean', nullable: false, defaultBoolean: true },
        { name: 'starts_at', type: 'timestamp', nullable: false, defaultNow: true },
        { name: 'ends_at', type: 'timestamp', nullable: true },
        { name: 'creation_reason', type: 'text', nullable: true },
        { name: 'audit_reference', type: 'string', length: 255, nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultNow: true },
      ],
    },
  ],
  down: [
    {
      type: 'drop-foreign-key',
      table: 'u_url_shortener_public_submissions',
      column: 'result_link_id',
      constraintName: 'u_url_shortener_submissions_result_link_id_foreign',
    },
    {
      type: 'drop-foreign-key',
      table: 'u_url_shortener_links',
      column: 'source_submission_id',
      constraintName: 'u_url_shortener_links_source_submission_id_foreign',
    },
    {
      type: 'drop-unique-constraint',
      table: 'u_url_shortener_daily_stats',
      name: 'u_url_shortener_daily_stats_unique_daily_stat',
    },
    { type: 'drop-table', table: 'u_url_shortener_prefix_aliases' },
    { type: 'drop-table', table: 'u_url_shortener_audit_records' },
    { type: 'drop-table', table: 'u_url_shortener_public_submissions' },
    { type: 'drop-table', table: 'u_url_shortener_daily_stats' },
    { type: 'drop-table', table: 'u_url_shortener_click_events' },
    { type: 'drop-table', table: 'u_url_shortener_links' },
    { type: 'drop-enum', enumName: 'u_url_shortener_submission_status' },
  ],
} as const;

type KnexLike = {
  raw: (sql: string) => unknown;
  schema: {
    createTable: (name: string, callback: (table: unknown) => unknown) => unknown;
    alterTable: (name: string, callback: (table: unknown) => unknown) => unknown;
    dropTableIfExists: (name: string) => unknown;
  };
};

type MigrationColumnBuilder = {
  primary: () => MigrationColumnBuilder;
  unique: () => MigrationColumnBuilder;
  notNullable: () => MigrationColumnBuilder;
  nullable: () => MigrationColumnBuilder;
  defaultTo: (value: unknown) => MigrationColumnBuilder;
};

type MigrationTableBuilder = {
  uuid: (name: string) => MigrationColumnBuilder;
  string: (name: string, length?: number) => MigrationColumnBuilder;
  text: (name: string) => MigrationColumnBuilder;
  boolean: (name: string) => MigrationColumnBuilder;
  timestamp: (name: string) => MigrationColumnBuilder;
  integer: (name: string) => MigrationColumnBuilder;
  bigInteger: (name: string) => MigrationColumnBuilder;
  smallint: (name: string) => MigrationColumnBuilder;
  date: (name: string) => MigrationColumnBuilder;
  jsonb: (name: string) => MigrationColumnBuilder;
  enu: (
    name: string,
    values: readonly string[],
    options: { useNative: true; enumName: string }
  ) => MigrationColumnBuilder;
  foreign: (
    column: string,
    constraintName?: string
  ) => {
    references: (columnName: string) => {
      inTable: (tableName: string) => {
        onDelete: (rule: string) => void;
      };
    };
  };
  unique: (columns: readonly string[], options?: { indexName?: string }) => void;
  index: (columns: readonly string[], indexName?: string) => void;
  dropIndex: (columns: readonly string[], indexName: string) => void;
  dropForeign: (column: string, constraintName?: string) => void;
};

type PlanOperation = (typeof migrationPlanV1.up)[number] | (typeof migrationPlanV1.down)[number];
type PlanColumn = {
  name: string;
  type: string;
  length?: number;
  enumName?: string;
  enumValues?: readonly string[];
  nullable?: boolean;
  primary?: boolean;
  unique?: boolean;
  defaultNow?: boolean;
  defaultUuid?: boolean;
  defaultBoolean?: boolean;
  defaultNumber?: number;
  defaultString?: string;
};

type PlanCreateTableOperation = {
  type: 'create-table';
  table: string;
  columns: readonly PlanColumn[];
  foreignKeys?: readonly {
    column: string;
    referencesColumn: string;
    referencesTable: string;
    onDelete?: string;
  }[];
};

type PlanCreateIndexOperation = {
  type: 'create-index';
  table: string;
  columns: readonly string[];
  name?: string;
  unique?: boolean;
};

function applyColumn(table: MigrationTableBuilder, column: PlanColumn, knex: KnexLike): void {
  let col: MigrationColumnBuilder;

  switch (column.type) {
    case 'uuid':
      col = table.uuid(column.name);
      break;
    case 'string':
      col = table.string(column.name, column.length ?? 255);
      break;
    case 'text':
      col = table.text(column.name);
      break;
    case 'boolean':
      col = table.boolean(column.name);
      break;
    case 'timestamp':
      col = table.timestamp(column.name);
      break;
    case 'integer':
      col = table.integer(column.name);
      break;
    case 'bigInteger':
      col = table.bigInteger(column.name);
      break;
    case 'smallint':
      col = table.smallint(column.name);
      break;
    case 'date':
      col = table.date(column.name);
      break;
    case 'jsonb':
      col = table.jsonb(column.name);
      break;
    case 'enum':
      if (!column.enumValues || !column.enumName) {
        throw new Error(`enum column ${column.name} requires enumName and enumValues`);
      }
      col = table.enu(column.name, column.enumValues, {
        useNative: true,
        enumName: column.enumName,
      });
      break;
    default:
      throw new Error(`unsupported column type: ${String(column.type)}`);
  }

  if (column.primary) col.primary();
  if (column.unique) col.unique();
  if (column.nullable === false) col.notNullable();
  if (column.nullable === true) col.nullable();
  if (column.defaultNow) col.defaultTo(knex.raw('now()'));
  if (column.defaultUuid) col.defaultTo(knex.raw('gen_random_uuid()'));
  if (column.defaultBoolean !== undefined) col.defaultTo(column.defaultBoolean);
  if (column.defaultNumber !== undefined) col.defaultTo(column.defaultNumber);
  if (column.defaultString !== undefined) col.defaultTo(column.defaultString);
}

async function executePlan(knex: KnexLike, direction: 'up' | 'down'): Promise<void> {
  const operations = (direction === 'up'
    ? migrationPlanV1.up
    : migrationPlanV1.down) as unknown as readonly PlanOperation[];

  for (const rawOperation of operations) {
    const operation = rawOperation as PlanOperation;
    switch (operation.type) {
      case 'create-table':
        await knex.schema.createTable(operation.table, (rawTable) => {
          const table = rawTable as MigrationTableBuilder;
          const createTableOperation = operation as PlanCreateTableOperation;
          for (const column of createTableOperation.columns) {
            applyColumn(table, column, knex);
          }
          for (const fk of createTableOperation.foreignKeys ?? []) {
            const foreign = table
              .foreign(fk.column)
              .references(fk.referencesColumn)
              .inTable(fk.referencesTable);
            if (fk.onDelete) {
              foreign.onDelete(fk.onDelete);
            }
          }
        });
        break;
      case 'drop-table':
        await knex.schema.dropTableIfExists(operation.table);
        break;
      case 'create-index':
        await knex.schema.alterTable(operation.table, (rawTable) => {
          const table = rawTable as MigrationTableBuilder;
          const createIndexOperation = operation as PlanCreateIndexOperation;
          if (createIndexOperation.unique) {
            table.unique(createIndexOperation.columns, {
              indexName: createIndexOperation.name,
            });
            return;
          }
          table.index(createIndexOperation.columns, createIndexOperation.name);
        });
        break;
      case 'create-unique-nulls-not-distinct': {
        const columnList = operation.columns.map((column) => `"${column}"`).join(', ');
        await knex.raw(
          `CREATE UNIQUE INDEX "${operation.name}" ON "${operation.table}" (${columnList}) NULLS NOT DISTINCT`
        );
        break;
      }
      case 'drop-unique-constraint':
        await knex.raw(
          `ALTER TABLE "${operation.table}" DROP CONSTRAINT IF EXISTS "${operation.name}"`
        );
        break;
      case 'create-foreign-key':
        await knex.schema.alterTable(operation.table, (rawTable) => {
          const table = rawTable as MigrationTableBuilder;
          const foreign = table
            .foreign(operation.key.column, operation.constraintName)
            .references(operation.key.referencesColumn)
            .inTable(operation.key.referencesTable);
          if (operation.key.onDelete) {
            foreign.onDelete(operation.key.onDelete);
          }
        });
        break;
      case 'drop-foreign-key':
        await knex.schema.alterTable(operation.table, (rawTable) => {
          const table = rawTable as MigrationTableBuilder;
          table.dropForeign(operation.column, operation.constraintName);
        });
        break;
      case 'drop-enum':
        await knex.raw(`DROP TYPE IF EXISTS ${operation.enumName}`);
        break;
    }
  }
}

export async function setupUrlShortenerSchema(knex: KnexLike): Promise<void> {
  await executePlan(knex, 'up');
}

export async function teardownUrlShortenerSchema(knex: KnexLike): Promise<void> {
  await executePlan(knex, 'down');
}

export async function up(knex?: KnexLike): Promise<void> {
  if (!knex) {
    throw new Error('migrationPlanV1 migration must execute via isolated migration broker');
  }

  await executePlan(knex, 'up');
}

export async function down(knex?: KnexLike): Promise<void> {
  if (!knex) {
    throw new Error('migrationPlanV1 rollback must execute via isolated migration broker');
  }

  await executePlan(knex, 'down');
}
