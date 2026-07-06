/**
 * Scheduled task types for DevHolm plugin extensions.
 *
 * Scheduled tasks allow plugins to perform work at specific intervals
 * with built-in support for safe ownership and cancellation.
 */

/**
 * Unique identifier for a task type.
 * Format: `plugin:plugin-id:task-name`
 */
export type TaskTypeId = string & {
  readonly __brand: 'TaskTypeId';
};

/**
 * Task execution schedule.
 * Supports cron expressions or fixed intervals.
 */
export type TaskSchedule =
  | {
      kind: 'interval';
      intervalMs: number;
      initialDelayMs?: number;
    }
  | {
      kind: 'cron';
      expression: string;
    };

/**
 * Task execution context.
 */
export interface TaskExecutionContext {
  readonly taskTypeId: TaskTypeId;
  readonly pluginId: string;
  readonly lastExecutedAt?: Date;
  readonly nextExecutionAt: Date;
}

/**
 * Task handler function.
 */
export type TaskHandler = (context: TaskExecutionContext) => void | Promise<void>;

/**
 * Task handler registration contract.
 */
export interface TaskHandlerRegistration {
  readonly taskTypeId: TaskTypeId;
  readonly pluginId: string;
  readonly handler: TaskHandler;
  readonly schedule: TaskSchedule;
  readonly description?: string;
}

/**
 * Task status record.
 */
export interface TaskStatusRecord {
  readonly taskTypeId: TaskTypeId;
  readonly pluginId: string;
  readonly isActive: boolean;
  readonly lastExecutedAt?: Date;
  readonly nextExecutionAt?: Date;
  readonly lastError?: string;
  readonly consecutiveFailures: number;
}

/**
 * Create a strongly-typed TaskTypeId.
 */
export function taskTypeId(value: string): TaskTypeId {
  return value as TaskTypeId;
}

/**
 * Create an interval-based schedule.
 */
export function intervalSchedule(intervalMs: number, initialDelayMs?: number): TaskSchedule {
  if (intervalMs <= 0) {
    throw new Error('Interval must be positive');
  }
  return {
    kind: 'interval',
    intervalMs,
    initialDelayMs,
  };
}

/**
 * Create a cron-based schedule.
 */
export function cronSchedule(expression: string): TaskSchedule {
  if (!expression || typeof expression !== 'string') {
    throw new Error('Cron expression must be a non-empty string');
  }
  return {
    kind: 'cron',
    expression,
  };
}

/**
 * Standard schedule presets.
 */
export const StandardSchedules = {
  EVERY_MINUTE: intervalSchedule(60 * 1000),
  EVERY_5_MINUTES: intervalSchedule(5 * 60 * 1000),
  EVERY_HOUR: intervalSchedule(60 * 60 * 1000),
  EVERY_DAY: intervalSchedule(24 * 60 * 60 * 1000),
  EVERY_WEEK: intervalSchedule(7 * 24 * 60 * 60 * 1000),
} as const;

/**
 * Common cron expression presets.
 */
export const StandardCronExpressions = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_DAY_MIDNIGHT: '0 0 * * *',
  EVERY_DAY_NOON: '0 12 * * *',
  EVERY_MONDAY_MIDNIGHT: '0 0 * * 1',
} as const;
