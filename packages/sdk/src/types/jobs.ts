/**
 * Background job types and contracts for DevHolm plugin extensions.
 *
 * Background jobs provide a way for plugins to perform work asynchronously,
 * with built-in support for retries, idempotency, and observability.
 */

/**
 * Unique identifier for a job type.
 * Format: `plugin:plugin-id:job-name`
 */
export type JobTypeId = string & {
  readonly __brand: 'JobTypeId';
};

/**
 * Unique identifier for a job instance.
 * Used for tracking, deduplication, and status queries.
 */
export type JobInstanceId = string & {
  readonly __brand: 'JobInstanceId';
};

/**
 * Job payload version for schema versioning.
 */
export type JobPayloadVersion = number & {
  readonly __brand: 'JobPayloadVersion';
};

/**
 * Job execution status.
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'retrying';

/**
 * Job retry policy configuration.
 */
export interface JobRetryPolicy {
  readonly maxRetries: number;
  readonly backoffMs: number;
  readonly backoffMultiplier?: number;
}

/**
 * Base job contract.
 */
export interface BaseJob {
  readonly jobTypeId: JobTypeId;
  readonly payloadVersion: JobPayloadVersion;
  readonly payload: unknown;
  readonly idempotencyKey?: string;
  readonly retryPolicy?: JobRetryPolicy;
}

/**
 * Job handler function.
 * Receives the job payload and must handle its own error states.
 * Should throw to indicate failure (will be retried per policy).
 */
export type JobHandler<T extends BaseJob = BaseJob> = (job: T) => void | Promise<void>;

/**
 * Job handler registration contract.
 */
export interface JobHandlerRegistration<T extends BaseJob = BaseJob> {
  readonly jobTypeId: JobTypeId;
  readonly pluginId: string;
  readonly handler: JobHandler<T>;
  readonly retryPolicy: JobRetryPolicy;
}

/**
 * Job execution context.
 */
export interface JobExecutionContext {
  readonly jobInstanceId: JobInstanceId;
  readonly jobTypeId: JobTypeId;
  readonly attempt: number;
  readonly enqueuedAt: Date;
  readonly startedAt: Date;
}

/**
 * Job status record.
 */
export interface JobStatusRecord {
  readonly jobInstanceId: JobInstanceId;
  readonly jobTypeId: JobTypeId;
  readonly pluginId: string;
  readonly status: JobStatus;
  readonly attempt: number;
  readonly maxRetries: number;
  readonly error?: string;
  readonly completedAt?: Date;
}

/**
 * Create a strongly-typed JobTypeId.
 */
export function jobTypeId(value: string): JobTypeId {
  return value as JobTypeId;
}

/**
 * Create a strongly-typed JobInstanceId.
 */
export function jobInstanceId(value: string): JobInstanceId {
  return value as JobInstanceId;
}

/**
 * Create a strongly-typed JobPayloadVersion.
 */
export function jobPayloadVersion(value: number): JobPayloadVersion {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Job payload version must be a positive integer');
  }
  return value as JobPayloadVersion;
}

/**
 * Standard retry policy presets.
 */
export const StandardJobRetryPolicies = {
  NO_RETRY: { maxRetries: 0, backoffMs: 0 } as const,
  STANDARD: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 } as const,
  AGGRESSIVE: { maxRetries: 5, backoffMs: 500, backoffMultiplier: 1.5 } as const,
} as const;
