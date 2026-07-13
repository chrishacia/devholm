import type { Knex } from 'knex';
import type {
  MigrationExecutionPlan,
  MigrationOperation,
} from '@core/lib/plugin-isolation-protocol';

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
const PLUGIN_MIGRATION_VERSION = 'migration-plan-v1';
type MigrationColumn = Extract<MigrationOperation, { type: 'create-table' }>['columns'][number];

function assertIdentifier(value: string, fieldName: string): void {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`invalid ${fieldName} identifier: ${value}`);
  }
}

function quoteIdentifier(value: string, fieldName: string): string {
  assertIdentifier(value, fieldName);
  return `"${value}"`;
}

function pluginTablePrefix(pluginId: string): string {
  return `u_${pluginId.replace(/-/g, '_')}_`;
}

function assertTableWithinPluginNamespace(pluginId: string, tableName: string): void {
  assertIdentifier(tableName, 'table');
  const expectedPrefix = pluginTablePrefix(pluginId);
  if (!tableName.startsWith(expectedPrefix)) {
    throw new Error(`table ${tableName} is outside plugin namespace ${expectedPrefix}*`);
  }
}

function assertPlanIdentity(params: {
  plan: MigrationExecutionPlan;
  pluginId: string;
  migrationId: string;
  checksum: string;
  artifactIdentity: string;
  sourceVersion: string;
  targetVersion: string;
}): void {
  if (params.plan.protocolVersion !== PLUGIN_MIGRATION_VERSION) {
    throw new Error('unsupported migration plan protocol version');
  }

  if (params.plan.pluginId !== params.pluginId) {
    throw new Error('migration plan pluginId mismatch');
  }

  if (params.plan.migrationId !== params.migrationId) {
    throw new Error('migration plan migrationId mismatch');
  }

  if (params.plan.checksum !== params.checksum) {
    throw new Error('migration plan checksum mismatch');
  }

  if (params.plan.artifactIdentity !== params.artifactIdentity) {
    throw new Error('migration plan artifact identity mismatch');
  }

  if (params.plan.sourceVersion !== params.sourceVersion) {
    throw new Error('migration plan sourceVersion mismatch');
  }

  if (params.plan.targetVersion !== params.targetVersion) {
    throw new Error('migration plan targetVersion mismatch');
  }
}

function applyColumn(table: Knex.CreateTableBuilder, column: MigrationColumn, trx: Knex): void {
  let col: Knex.ColumnBuilder;

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
    case 'enum': {
      if (!column.enumName || !Array.isArray(column.enumValues) || column.enumValues.length === 0) {
        throw new Error(`enum column ${column.name} requires enumName and enumValues`);
      }
      assertIdentifier(column.enumName, 'enumName');
      col = table.enu(column.name, column.enumValues, {
        useNative: true,
        enumName: column.enumName,
      });
      break;
    }
    default:
      throw new Error(`unsupported column type: ${column.type as string}`);
  }

  if (column.primary) {
    col.primary();
  }
  if (column.unique) {
    col.unique();
  }
  if (column.nullable === false) {
    col.notNullable();
  }
  if (column.nullable === true) {
    col.nullable();
  }
  if (column.defaultNow) {
    col.defaultTo(trx.raw('now()'));
  }
  if (column.defaultUuid) {
    col.defaultTo(trx.raw('gen_random_uuid()'));
  }
  if (column.defaultBoolean !== undefined) {
    col.defaultTo(column.defaultBoolean);
  }
  if (column.defaultNumber !== undefined) {
    col.defaultTo(column.defaultNumber);
  }
  if (column.defaultString !== undefined) {
    col.defaultTo(column.defaultString);
  }
}

async function executeOperation(params: {
  trx: Knex;
  pluginId: string;
  operation: MigrationOperation;
  direction: 'up' | 'down';
}): Promise<void> {
  const { trx, pluginId, operation, direction } = params;

  switch (operation.type) {
    case 'create-table': {
      assertTableWithinPluginNamespace(pluginId, operation.table);
      await trx.schema.createTable(operation.table, (table) => {
        for (const column of operation.columns) {
          assertIdentifier(column.name, 'column');
          applyColumn(table, column, trx);
        }

        for (const fk of operation.foreignKeys ?? []) {
          assertIdentifier(fk.column, 'foreign key column');
          assertTableWithinPluginNamespace(pluginId, fk.referencesTable);
          assertIdentifier(fk.referencesColumn, 'foreign key references column');
          const foreign = table
            .foreign(fk.column)
            .references(fk.referencesColumn)
            .inTable(fk.referencesTable);
          if (fk.onDelete) {
            foreign.onDelete(fk.onDelete);
          }
        }
      });
      return;
    }
    case 'drop-table': {
      if (direction !== 'down') {
        throw new Error('drop-table operation is only allowed during rollback');
      }
      assertTableWithinPluginNamespace(pluginId, operation.table);
      await trx.schema.dropTableIfExists(operation.table);
      return;
    }
    case 'add-column': {
      assertTableWithinPluginNamespace(pluginId, operation.table);
      await trx.schema.alterTable(operation.table, (table) => {
        assertIdentifier(operation.column.name, 'column');
        applyColumn(table, operation.column, trx);
      });
      return;
    }
    case 'drop-column': {
      if (direction !== 'down') {
        throw new Error('drop-column operation is only allowed during rollback');
      }
      assertTableWithinPluginNamespace(pluginId, operation.table);
      assertIdentifier(operation.column, 'column');
      await trx.schema.alterTable(operation.table, (table) => {
        table.dropColumn(operation.column);
      });
      return;
    }
    case 'create-index': {
      assertTableWithinPluginNamespace(pluginId, operation.table);
      for (const col of operation.columns) {
        assertIdentifier(col, 'index column');
      }
      if (operation.name) {
        assertIdentifier(operation.name, 'index name');
      }
      await trx.schema.alterTable(operation.table, (table) => {
        if (operation.unique) {
          table.unique(operation.columns, {
            indexName: operation.name,
          });
          return;
        }

        table.index(operation.columns, operation.name);
      });
      return;
    }
    case 'create-unique-nulls-not-distinct': {
      assertTableWithinPluginNamespace(pluginId, operation.table);
      assertIdentifier(operation.name, 'unique index name');
      const quotedTable = quoteIdentifier(operation.table, 'table');
      const quotedIndex = quoteIdentifier(operation.name, 'unique index name');
      const quotedColumns = operation.columns
        .map((column) => quoteIdentifier(column, 'unique index column'))
        .join(', ');
      await trx.raw(
        `CREATE UNIQUE INDEX ${quotedIndex} ON ${quotedTable} (${quotedColumns}) NULLS NOT DISTINCT`
      );
      return;
    }
    case 'drop-unique-constraint': {
      if (direction !== 'down') {
        throw new Error('drop-unique-constraint operation is only allowed during rollback');
      }
      assertTableWithinPluginNamespace(pluginId, operation.table);
      assertIdentifier(operation.name, 'unique constraint name');
      const quotedTable = quoteIdentifier(operation.table, 'table');
      const quotedName = quoteIdentifier(operation.name, 'unique constraint name');
      await trx.raw(`ALTER TABLE ${quotedTable} DROP CONSTRAINT IF EXISTS ${quotedName}`);
      return;
    }
    case 'drop-index': {
      if (direction !== 'down') {
        throw new Error('drop-index operation is only allowed during rollback');
      }
      assertTableWithinPluginNamespace(pluginId, operation.table);
      assertIdentifier(operation.name, 'index name');
      await trx.schema.alterTable(operation.table, (table) => {
        table.dropIndex([], operation.name);
      });
      return;
    }
    case 'create-foreign-key': {
      assertTableWithinPluginNamespace(pluginId, operation.table);
      assertIdentifier(operation.key.column, 'foreign key column');
      assertTableWithinPluginNamespace(pluginId, operation.key.referencesTable);
      assertIdentifier(operation.key.referencesColumn, 'foreign key references column');
      if (operation.constraintName) {
        assertIdentifier(operation.constraintName, 'foreign key constraintName');
      }
      await trx.schema.alterTable(operation.table, (table) => {
        const foreign = table
          .foreign(operation.key.column, operation.constraintName)
          .references(operation.key.referencesColumn)
          .inTable(operation.key.referencesTable);
        if (operation.key.onDelete) {
          foreign.onDelete(operation.key.onDelete);
        }
      });
      return;
    }
    case 'drop-foreign-key': {
      if (direction !== 'down') {
        throw new Error('drop-foreign-key operation is only allowed during rollback');
      }
      assertTableWithinPluginNamespace(pluginId, operation.table);
      assertIdentifier(operation.column, 'foreign key column');
      if (operation.constraintName) {
        assertIdentifier(operation.constraintName, 'foreign key constraintName');
      }
      await trx.schema.alterTable(operation.table, (table) => {
        table.dropForeign(operation.column, operation.constraintName);
      });
      return;
    }
    case 'drop-enum': {
      if (direction !== 'down') {
        throw new Error('drop-enum operation is only allowed during rollback');
      }
      assertIdentifier(operation.enumName, 'enumName');
      await trx.raw(`DROP TYPE IF EXISTS ${operation.enumName}`);
      return;
    }
    default: {
      throw new Error(
        `unsupported migration operation type: ${(operation as { type?: string }).type ?? 'unknown'}`
      );
    }
  }
}

export async function executeMigrationPlanWithBroker(params: {
  trx: Knex;
  pluginId: string;
  plan: MigrationExecutionPlan;
  migrationId: string;
  checksum: string;
  artifactIdentity: string;
  direction: 'up' | 'down';
  sourceVersion: string;
  targetVersion: string;
}): Promise<{ operationCount: number; assignedSchema: string }> {
  assertPlanIdentity({
    plan: params.plan,
    pluginId: params.pluginId,
    migrationId: params.migrationId,
    checksum: params.checksum,
    artifactIdentity: params.artifactIdentity,
    sourceVersion: params.sourceVersion,
    targetVersion: params.targetVersion,
  });

  const operations = params.direction === 'up' ? params.plan.up : params.plan.down;
  for (const operation of operations) {
    await executeOperation({
      trx: params.trx,
      pluginId: params.pluginId,
      operation,
      direction: params.direction,
    });
  }

  // Current plugin tables are bound to a strict plugin namespace prefix in public schema.
  return {
    operationCount: operations.length,
    assignedSchema: 'public',
  };
}
