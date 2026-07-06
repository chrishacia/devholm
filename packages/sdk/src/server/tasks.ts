/**
 * Public SDK for scheduled task registration.
 *
 * Plugins use these helpers to register scheduled tasks through the public SDK,
 * not through internal framework code.
 */

import 'server-only';

import type { TaskTypeId, TaskHandlerRegistration, TaskSchedule } from '@core/types/tasks';
import { taskTypeId as createTaskTypeId } from '@core/types/tasks';
import { getTaskRegistry } from '@core/lib/task-registry.server';

/**
 * Define and register a scheduled task for a plugin.
 *
 * Usage:
 * ```ts
 * defineScheduledTask({
 *   taskTypeId: taskTypeId('cleanupExpiredLinks'),
 *   pluginId: 'url-shortener',
 *   handler: async (context) => {
 *     // Perform cleanup work
 *   },
 *   schedule: intervalSchedule(24 * 60 * 60 * 1000), // Every 24 hours
 *   description: 'Clean up expired short links',
 * });
 * ```
 */
export function defineScheduledTask(
  registration: TaskHandlerRegistration
): TaskHandlerRegistration {
  const registry = getTaskRegistry();

  // Validate registration
  if (!registration.taskTypeId) {
    throw new Error('Task registration requires a taskTypeId');
  }
  if (!registration.pluginId) {
    throw new Error('Task registration requires a pluginId');
  }
  if (!registration.handler) {
    throw new Error('Task registration requires a handler function');
  }
  if (!registration.schedule) {
    throw new Error('Task registration requires a schedule');
  }

  registry.register(registration);
  return registration;
}

/**
 * Convenience helper to create a task type ID.
 */
export function defineTaskTypeId(value: string): TaskTypeId {
  return createTaskTypeId(value);
}

/**
 * Get all task handlers registered by a plugin (for testing).
 */
export function getPluginScheduledTasks(pluginId: string) {
  const registry = getTaskRegistry();
  return registry.getHandlersByPlugin(pluginId);
}

/**
 * Get a specific task handler (for testing).
 */
export function getScheduledTask(taskTypeId: TaskTypeId) {
  const registry = getTaskRegistry();
  return registry.getHandler(taskTypeId);
}

/**
 * Get all registered scheduled tasks (for scheduler).
 */
export function getAllScheduledTasks() {
  const registry = getTaskRegistry();
  return registry.getAllHandlers();
}
