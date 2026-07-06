/**
 * Scheduled task types - re-exported from SDK for @core usage.
 *
 * Scheduled tasks allow plugins to perform work at specific intervals
 * with built-in support for safe ownership and cancellation.
 *
 * @note Types are defined in @devholm/sdk/types and re-exported here to avoid
 * circular dependencies. Framework code imports from @core; plugins import from SDK.
 */

export type {
  TaskTypeId,
  TaskSchedule,
  TaskExecutionContext,
  TaskHandler,
  TaskHandlerRegistration,
  TaskStatusRecord,
} from '@devholm/sdk/types';

export {
  taskTypeId,
  intervalSchedule,
  cronSchedule,
  StandardSchedules,
  StandardCronExpressions,
} from '@devholm/sdk/types';
