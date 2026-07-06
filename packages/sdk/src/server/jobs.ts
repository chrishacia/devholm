/**
 * Public SDK for background job registration and enqueueing.
 *
 * Plugins use these helpers to register background jobs and enqueue work
 * through the public SDK, not through internal framework code.
 */

import 'server-only';

import type { JobTypeId, JobHandlerRegistration, BaseJob } from '../types/jobs';
import { jobTypeId as createJobTypeId } from '../types/jobs';
import { getJobRegistry } from '@core/lib/job-registry.server';
import { enqueueJob as enqueueJobImpl } from '@core/lib/job-queue.server';

/**
 * Define and register a background job handler for a plugin.
 *
 * Usage:
 * ```ts
 * defineJobHandler({
 *   jobTypeId: jobTypeId('sendNotificationEmail'),
 *   pluginId: 'plugin-id',
 *   handler: async (job) => {
 *     // Process the job
 *   },
 *   retryPolicy: StandardJobRetryPolicies.STANDARD,
 * });
 * ```
 */
// T is used in generic parameter for proper typing

export function defineJobHandler<T extends BaseJob = BaseJob>(
  registration: JobHandlerRegistration<T>
): JobHandlerRegistration<T> {
  const registry = getJobRegistry();

  // Validate registration
  if (!registration.jobTypeId) {
    throw new Error('Job handler registration requires a jobTypeId');
  }
  if (!registration.pluginId) {
    throw new Error('Job handler registration requires a pluginId');
  }
  if (!registration.handler) {
    throw new Error('Job handler registration requires a handler function');
  }
  if (!registration.retryPolicy) {
    throw new Error('Job handler registration requires a retryPolicy');
  }
  if (
    typeof registration.retryPolicy.maxRetries !== 'number' ||
    registration.retryPolicy.maxRetries < 0
  ) {
    throw new Error('Retry policy requires a non-negative maxRetries value');
  }
  if (
    typeof registration.retryPolicy.backoffMs !== 'number' ||
    registration.retryPolicy.backoffMs < 0
  ) {
    throw new Error('Retry policy requires a non-negative backoffMs value');
  }

  registry.register(registration as JobHandlerRegistration);
  return registration;
}

/**
 * Convenience helper to create a job type ID.
 */
export function defineJobTypeId(value: string): JobTypeId {
  return createJobTypeId(value);
}

/**
 * Enqueue a background job for processing.
 *
 * Usage:
 * ```ts
 * await enqueueJob(jobTypeId('sendNotificationEmail'), {
 *   userId: 'user-123',
 *   email: 'user@example.com',
 * }, {
 *   idempotencyKey: `email-${userId}-${timestamp}`,
 * });
 * ```
 */
export async function enqueueJob<T extends BaseJob>(
  jobTypeId: JobTypeId,
  payload: unknown,
  options?: {
    idempotencyKey?: string;
    retries?: number;
    delayMs?: number;
  }
): Promise<void> {
  return enqueueJobImpl(jobTypeId, payload, options);
}

/**
 * Get all job handlers registered by a plugin (for testing).
 */
export function getPluginJobHandlers(pluginId: string) {
  const registry = getJobRegistry();
  return registry.getHandlersByPlugin(pluginId);
}

/**
 * Get a specific job handler (for testing).
 */
export function getJobHandler(jobTypeId: JobTypeId) {
  const registry = getJobRegistry();
  return registry.getHandler(jobTypeId);
}
