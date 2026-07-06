/**
 * Background job types - re-exported from SDK for @core usage.
 *
 * Background jobs provide a way for plugins to perform work asynchronously,
 * with built-in support for retries, idempotency, and observability.
 *
 * @note Types are defined in @devholm/sdk/types and re-exported here to avoid
 * circular dependencies. Framework code imports from @core; plugins import from SDK.
 */

export type {
  JobTypeId,
  JobInstanceId,
  JobPayloadVersion,
  JobStatus,
  JobRetryPolicy,
  BaseJob,
  JobHandler,
  JobHandlerRegistration,
  JobExecutionContext,
  JobStatusRecord,
} from '@devholm/sdk/types';

export {
  jobTypeId,
  jobInstanceId,
  jobPayloadVersion,
  StandardJobRetryPolicies,
} from '@devholm/sdk/types';
