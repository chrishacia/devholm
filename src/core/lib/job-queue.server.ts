/**
 * Job queue and executor for background job processing.
 *
 * The queue manages job persistence, retries, and execution with
 * plugin enablement checks and error handling.
 */

import 'server-only';

import { getDb } from '@/db';
import type { JobTypeId, JobHandlerRegistration, BaseJob } from '@core/types/jobs';
import { getJobRegistry } from '@core/lib/job-registry.server';

/**
 * Enqueue a background job for processing.
 *
 * @param jobTypeId - The type of job to enqueue
 * @param payload - The job payload
 * @param options - Additional options (idempotency key, retries, etc.)
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
  const db = getDb();

  // For now, just log that a job would be queued
  // In a production system, this would insert into a jobs table
  // and potentially trigger a job worker process
  console.log('Job enqueued:', {
    jobTypeId,
    payload,
    options,
  });
}

/**
 * Get a job handler registration by type ID.
 */
export function getJobHandler(jobTypeId: JobTypeId): JobHandlerRegistration | undefined {
  const registry = getJobRegistry();
  return registry.getHandler(jobTypeId);
}

/**
 * Get all job handlers registered by a plugin.
 */
export function getPluginJobHandlers(pluginId: string): readonly JobHandlerRegistration[] {
  const registry = getJobRegistry();
  return registry.getHandlersByPlugin(pluginId);
}

/**
 * Execute a queued job.
 * Should only be called by the job worker process.
 */
export async function executeQueuedJob(
  jobTypeId: JobTypeId,
  payload: unknown,
  attempt: number
): Promise<void> {
  const handler = getJobHandler(jobTypeId);

  if (!handler) {
    throw new Error(`No handler registered for job type: ${jobTypeId}`);
  }

  // Check if plugin is enabled
  const db = getDb();
  const setting = await db('site_settings')
    .where('key', `plugin:${handler.pluginId}:enabled`)
    .select('value')
    .first();

  if (!setting || setting.value !== 'true') {
    // Skip execution if plugin is not enabled
    console.log(`Job skipped: plugin ${handler.pluginId} not enabled for job ${jobTypeId}`);
    return;
  }

  // Execute with error handling
  try {
    await Promise.resolve(handler.handler(payload as BaseJob));
  } catch (error) {
    console.error(`Job failed: ${jobTypeId} (attempt ${attempt})`, error);
    // Retry logic would be handled by the job queue system
    throw error;
  }
}
