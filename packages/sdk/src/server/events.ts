/**
 * Public SDK for event handler registration.
 *
 * Plugins use these helpers to register event handlers through the public SDK,
 * not through internal framework code.
 */

import 'server-only';

import type {
  // EventTypeId - unused in this module
  EventHandlerId,
  DomainEvent,
  EventHandler,
  EventHandlerRegistration,
} from '../types/events';
import { getEventRegistry } from '@core/lib/event-registry.server';
import { eventHandlerId } from '../types/events';

/**
 * Define and register an event handler for a plugin.
 *
 * Usage:
 * ```ts
 * defineEventHandler({
 *   handlerId: eventHandlerId('onUserCreated'),
 *   pluginId: 'url-shortener',
 *   eventTypeId: StandardEventTypes.USER_CREATED,
 *   handler: async (event) => {
 *     // Handle the user.created event
 *   },
 * });
 * ```
 */
export function defineEventHandler<T extends DomainEvent>(
  registration: Omit<EventHandlerRegistration<T>, 'handler'> & {
    handler: EventHandler<T>;
  }
): EventHandlerRegistration<T> {
  const registry = getEventRegistry();

  // Validate registration
  if (!registration.handlerId) {
    throw new Error('Event handler registration requires a handlerId');
  }
  if (!registration.pluginId) {
    throw new Error('Event handler registration requires a pluginId');
  }
  if (!registration.eventTypeId) {
    throw new Error('Event handler registration requires an eventTypeId');
  }
  if (!registration.handler) {
    throw new Error('Event handler registration requires a handler function');
  }

  // Register with the global registry
  registry.register(registration as EventHandlerRegistration<T>);

  return registration as EventHandlerRegistration<T>;
}

/**
 * Convenience helper to generate a handler ID.
 * Returns a strongly-typed EventHandlerId.
 */
export function defineEventHandlerId(value: string): EventHandlerId {
  return eventHandlerId(value);
}

/**
 * Get all event handlers registered by a plugin (useful for testing/debugging).
 */
export function getPluginEventHandlers(pluginId: string) {
  const registry = getEventRegistry();
  return registry.getHandlersByPlugin(pluginId);
}

/**
 * For testing: get a specific event handler registration.
 */
export function getEventHandler(handlerId: EventHandlerId) {
  const registry = getEventRegistry();
  return registry.getHandler(handlerId);
}
