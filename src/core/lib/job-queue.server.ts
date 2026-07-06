/**
 * Job queue and executor for background job processing.
 *
 * The queue manages job persistence, retries, and execution with
 * plugin enablement checks and error handling.
 */

import 'server-only';

import { getDb } from '@/db';
import type { JobTypeId, JobHandlerRegistration, BaseJob, JobInstanceId } from '@core/types/jobs';
import { jobInstanceId as createJobInstanceId } from '@core/types/jobs';
import { getJobRegistry } from '@core/lib/job-registry.server';

/**
 * In-memory job queue for development/testing.
 * In production, jobs would be persisted to a database.
 */
interface QueuedJob {
  readonly instanceId: JobInstanceId;
  readonly typeId: JobTypeId;
  readonly payload: unknown;
  readonly pluginId: string;
  readonly attempt: number;
  readonly maxRetries: number;
  readonly enqueuedAt: Date;
  readonly idempotencyKey?: string;
}

const jobQueue: Map<JobInstanceId, QueuedJob> = new Map();
let jobIdCounter = 0;

function generateJobInstanceId(): JobInstanceId {
  // Simple ID generation for in-memory queue
  // In production, this would be a UUID or database-generated ID
  jobIdCounter++;
  return createJobInstanceId(`job-${Date.now()}-${jobIdCounter}`);
}

/**
 * Enqueue a background job for processing.
 *
 * Adds the job to an in-memory queue. In production, this would persist to a database
 * and trigger a job worker process.
 *
 * @param jobTypeId - The type of job to enqueue
 * @param payload - The job payload
 * @param options - Additional options (idempotency key, retries, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const registry = getJobRegistry();
  const handler = registry.getHandler(jobTypeId);

  if (!handler) {
    throw new Error(`No handler registered for job type: ${jobTypeId}`);
  }

  // Check if plugin is enabled
  try {
    const siteSettings = await db('site_settings')
      .where('key', `plugin:${handler.pluginId}:enabled`)
      .select('value')
      .first();

    if (!siteSettings || siteSettings.value !== 'true') {
      console.log(`Job skipped: plugin ${handler.pluginId} not enabled for job ${jobTypeId}`);
      return;
    }
  } catch {
    // If DB is not available (e.g., during tests), continue with job
  }

  // Create job instance
  const instanceId = generateJobInstanceId();
  const queuedJob: QueuedJob = {
    instanceId,
    typeId: jobTypeId,
    payload,
    pluginId: handler.pluginId,
    attempt: 0,
    maxRetries: handler.retryPolicy.maxRetries,
    enqueuedAt: new Date(),
    idempotencyKey: options?.idempotencyKey,
  };

  // Add to in-memory queue
  jobQueue.set(instanceId, queuedJob);

  console.log('Job enqueued:', {
    instanceId,
    jobTypeId,
    pluginId: handler.pluginId,
    attempt: 0,
    maxRetries: handler.retryPolicy.maxRetries,
  });
}

/**
 * Execute a queued job immediately (for testing).
 *
 * In production, a job worker daemon would call this asynchronously
 * based on job scheduling and retry logic.
 */
export async function executeQueuedJob(instanceId: JobInstanceId): Promise<void> {
  const queuedJob = jobQueue.get(instanceId);
  if (!queuedJob) {
    throw new Error(`Job not found: ${instanceId}`);
  }

  const registry = getJobRegistry();
  const handler = registry.getHandler(queuedJob.typeId);

  if (!handler) {
    throw new Error(`No handler registered for job type: ${queuedJob.typeId}`);
  }

  try {
    // Build the job envelope as the handler expects
    const jobEnvelope = {
      jobTypeId: queuedJob.typeId,
      payloadVersion: 1, // This should come from the original job
      payload: queuedJob.payload,
      idempotencyKey: queuedJob.idempotencyKey,
      retryPolicy: handler.retryPolicy,
    };

    // Execute the handler with the job envelope
    await handler.handler(jobEnvelope as BaseJob);

    // Remove from queue on success
    jobQueue.delete(instanceId);
    console.log(`Job completed: ${instanceId}`);
  } catch (error) {
    const nextAttempt = queuedJob.attempt + 1;

    if (nextAttempt <= queuedJob.maxRetries) {
      console.log(
        `Job failed (attempt ${nextAttempt}/${queuedJob.maxRetries}): ${instanceId}, will retry`
      );
      // Update queue with new attempt
      const updatedJob: QueuedJob = {
        ...queuedJob,
        attempt: nextAttempt,
      };
      jobQueue.set(instanceId, updatedJob);
    } else {
      jobQueue.delete(instanceId);
      console.log(
        `Job failed permanently after ${queuedJob.maxRetries} retries: ${instanceId}`,
        error
      );
      throw error;
    }
  }
}

/**
 * Clear the job queue (for testing).
 */
export function clearJobQueue(): void {
  jobQueue.clear();
  jobIdCounter = 0;
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
