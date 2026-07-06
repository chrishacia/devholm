/**
 * Event dispatcher for safely executing event handlers.
 *
 * The dispatcher ensures:
 * - Only enabled plugins' handlers execute
 * - Errors in handlers are caught and logged
 * - Handlers execute in deterministic order
 * - No unhandled rejections
 */

import 'server-only';

import { getDb } from '@/db';
import type { DomainEvent } from '@core/types/events';
import { getEventRegistry } from '@core/lib/event-registry.server';

/**
 * Check if a plugin is currently enabled.
 * Uses site_settings to determine enablement state.
 */
async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const db = getDb();

  const setting = await db('site_settings')
    .where('key', `plugin:${pluginId}:enabled`)
    .select('value')
    .first();

  return setting?.value === 'true';
}

/**
 * Get the observability context for logging event handler results.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getObservabilityContext(
  event: DomainEvent,
  pluginId: string,
  handlerId: string,
  result: 'success' | 'error' | 'skipped',
  error?: Error
) {
  return {
    eventTypeId: event.eventTypeId,
    pluginId,
    handlerId,
    result,
    error: error ? { message: error.message, stack: error.stack } : undefined,
    durationMs: 0,
  };
}

/**
 * Dispatch a domain event to all registered handlers for that event type.
 * Respects plugin enablement state and handles errors gracefully.
 *
 * @param event - The domain event to dispatch
 * @returns Promise that resolves after all handlers complete (successes + failures)
 */
export async function dispatchEvent(event: DomainEvent): Promise<void> {
  const registry = getEventRegistry();
  const handlers = registry.getHandlersForEventType(event.eventTypeId);

  if (handlers.length === 0) {
    // No handlers registered for this event type
    return;
  }

  const results: Array<{
    handlerId: string;
    pluginId: string;
    result: 'success' | 'error' | 'skipped';
    error?: Error;
  }> = [];

  for (const registration of handlers) {
    try {
      // Check if plugin is enabled before executing handler
      const isEnabled = await isPluginEnabled(registration.pluginId);
      if (!isEnabled) {
        results.push({
          handlerId: registration.handlerId,
          pluginId: registration.pluginId,
          result: 'skipped',
        });
        continue;
      }

      // Execute the handler with error boundary
      try {
        await Promise.resolve(registration.handler(event));
        results.push({
          handlerId: registration.handlerId,
          pluginId: registration.pluginId,
          result: 'success',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.push({
          handlerId: registration.handlerId,
          pluginId: registration.pluginId,
          result: 'error',
          error: err,
        });
        // Log but don't throw - other handlers should still execute
        console.error(
          `Event handler error: ${registration.pluginId}/${registration.handlerId}`,
          err
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      results.push({
        handlerId: registration.handlerId,
        pluginId: registration.pluginId,
        result: 'error',
        error: err,
      });
      console.error(
        `Event dispatch error checking plugin enablement: ${registration.pluginId}/${registration.handlerId}`,
        err
      );
    }
  }

  // Return normally even if some handlers failed
  return;
}

/**
 * Dispatch an event and get detailed result information (for testing).
 */
export async function dispatchEventWithResults(event: DomainEvent): Promise<
  Array<{
    handlerId: string;
    pluginId: string;
    result: 'success' | 'error' | 'skipped';
    error?: Error;
  }>
> {
  const registry = getEventRegistry();
  const handlers = registry.getHandlersForEventType(event.eventTypeId);

  const results: Array<{
    handlerId: string;
    pluginId: string;
    result: 'success' | 'error' | 'skipped';
    error?: Error;
  }> = [];

  for (const registration of handlers) {
    try {
      // Check if plugin is enabled before executing handler
      const isEnabled = await isPluginEnabled(registration.pluginId);
      if (!isEnabled) {
        results.push({
          handlerId: registration.handlerId,
          pluginId: registration.pluginId,
          result: 'skipped',
        });
        continue;
      }

      // Execute the handler with error boundary
      try {
        await Promise.resolve(registration.handler(event));
        results.push({
          handlerId: registration.handlerId,
          pluginId: registration.pluginId,
          result: 'success',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.push({
          handlerId: registration.handlerId,
          pluginId: registration.pluginId,
          result: 'error',
          error: err,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      results.push({
        handlerId: registration.handlerId,
        pluginId: registration.pluginId,
        result: 'error',
        error: err,
      });
    }
  }

  return results;
}
