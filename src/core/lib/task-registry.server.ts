/**
 * Task registry for managing plugin scheduled task registrations.
 */

import type { TaskTypeId, TaskHandlerRegistration } from '@core/types/tasks';

/**
 * In-memory registry of task handlers.
 */
class TaskRegistry {
  private handlers: Map<TaskTypeId, TaskHandlerRegistration> = new Map();
  private handlersByPlugin: Map<string, Set<TaskTypeId>> = new Map();

  /**
   * Register a task handler for a plugin.
   */
  register(registration: TaskHandlerRegistration): void {
    const { taskTypeId, pluginId } = registration;

    // Add to handler map
    this.handlers.set(taskTypeId, registration);

    // Add to plugin index
    if (!this.handlersByPlugin.has(pluginId)) {
      this.handlersByPlugin.set(pluginId, new Set());
    }
    this.handlersByPlugin.get(pluginId)!.add(taskTypeId);
  }

  /**
   * Get a task handler registration by task type ID.
   */
  getHandler(taskTypeId: TaskTypeId): TaskHandlerRegistration | undefined {
    return this.handlers.get(taskTypeId);
  }

  /**
   * Get all task handlers registered by a plugin.
   */
  getHandlersByPlugin(pluginId: string): readonly TaskHandlerRegistration[] {
    const taskTypeIds = this.handlersByPlugin.get(pluginId) || new Set();
    return Array.from(taskTypeIds)
      .map((id) => this.handlers.get(id))
      .filter((reg) => reg !== undefined) as TaskHandlerRegistration[];
  }

  /**
   * Get all registered tasks.
   */
  getAllHandlers(): readonly TaskHandlerRegistration[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Remove all handlers for a plugin.
   */
  removeHandlersByPlugin(pluginId: string): void {
    const taskTypeIds = this.handlersByPlugin.get(pluginId) || new Set();

    for (const taskTypeId of taskTypeIds) {
      this.handlers.delete(taskTypeId);
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
let globalRegistry: TaskRegistry | null = null;

/**
 * Get the global task registry instance.
 */
export function getTaskRegistry(): TaskRegistry {
  if (!globalRegistry) {
    globalRegistry = new TaskRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global task registry (testing only).
 */
export function resetTaskRegistry(): void {
  globalRegistry = null;
}

/**
 * For testing: initialize with a specific registry instance.
 */
export function setTaskRegistry(registry: TaskRegistry): void {
  globalRegistry = registry;
}

export { TaskRegistry };
