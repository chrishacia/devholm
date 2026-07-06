/**
 * Job registry for managing plugin job handler registrations.
 */

import type { JobTypeId, JobHandlerRegistration } from '@core/types/jobs';

/**
 * In-memory registry of job handlers.
 */
class JobRegistry {
  private handlers: Map<JobTypeId, JobHandlerRegistration> = new Map();
  private handlersByPlugin: Map<string, Set<JobTypeId>> = new Map();

  /**
   * Register a job handler for a plugin.
   */
  register(registration: JobHandlerRegistration): void {
    const { jobTypeId, pluginId } = registration;

    // Add to handler map
    this.handlers.set(jobTypeId, registration);

    // Add to plugin index
    if (!this.handlersByPlugin.has(pluginId)) {
      this.handlersByPlugin.set(pluginId, new Set());
    }
    this.handlersByPlugin.get(pluginId)!.add(jobTypeId);
  }

  /**
   * Get a job handler registration by job type ID.
   */
  getHandler(jobTypeId: JobTypeId): JobHandlerRegistration | undefined {
    return this.handlers.get(jobTypeId);
  }

  /**
   * Get all job handlers registered by a plugin.
   */
  getHandlersByPlugin(pluginId: string): readonly JobHandlerRegistration[] {
    const jobTypeIds = this.handlersByPlugin.get(pluginId) || new Set();
    return Array.from(jobTypeIds)
      .map((id) => this.handlers.get(id))
      .filter((reg) => reg !== undefined) as JobHandlerRegistration[];
  }

  /**
   * Remove all handlers for a plugin.
   */
  removeHandlersByPlugin(pluginId: string): void {
    const jobTypeIds = this.handlersByPlugin.get(pluginId) || new Set();

    for (const jobTypeId of jobTypeIds) {
      this.handlers.delete(jobTypeId);
    }

    this.handlersByPlugin.delete(pluginId);
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.handlers.clear();
    this.handlersByPlugin.clear();
  }

  /**
   * Get total count of registered handlers.
   */
  size(): number {
    return this.handlers.size;
  }
}

// Singleton instance
let globalRegistry: JobRegistry | null = null;

/**
 * Get the global job registry instance.
 */
export function getJobRegistry(): JobRegistry {
  if (!globalRegistry) {
    globalRegistry = new JobRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global job registry (testing only).
 */
export function resetJobRegistry(): void {
  globalRegistry = null;
}

/**
 * For testing: initialize with a specific registry instance.
 */
export function setJobRegistry(registry: JobRegistry): void {
  globalRegistry = registry;
}

export { JobRegistry };
