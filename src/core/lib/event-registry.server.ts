/**
 * Event registry for managing plugin event handler registrations.
 *
 * The registry maintains handlers by event type and plugin,
 * supporting safe plugin enablement/disablement and handler discovery.
 */

import type {
  EventTypeId,
  EventHandlerId,
  EventHandlerRegistration,
  DomainEvent,
} from '@core/types/events';

/**
 * In-memory registry of event handlers.
 * Thread-safe for read operations; mutations must be coordinated.
 */
class EventRegistry {
  private handlers: Map<EventTypeId, Map<EventHandlerId, EventHandlerRegistration>> = new Map();
  private handlersByPlugin: Map<string, Set<EventHandlerId>> = new Map();
  private handlerMap: Map<EventHandlerId, EventHandlerRegistration> = new Map();

  /**
   * Register an event handler for a plugin.
   *
   * If a handler with the same handlerId already exists:
   * - Same pluginId: overwrites (update use case). Stale per-eventType entries are
   *   cleaned up so no ghost entries remain.
   * - Different pluginId: throws to prevent accidental cross-plugin handlerId collisions.
   */
  register<T extends DomainEvent = DomainEvent>(registration: EventHandlerRegistration<T>): void {
    const { eventTypeId, handlerId, pluginId } = registration;

    // Guard against cross-plugin handlerId collisions
    const existing = this.handlerMap.get(handlerId);
    if (existing && existing.pluginId !== pluginId) {
      throw new Error(
        `Handler ID collision: "${handlerId}" is already registered by plugin "${existing.pluginId}". ` +
          `Plugin "${pluginId}" cannot re-use an existing handler ID from another plugin.`
      );
    }

    // If re-registering the same handlerId (same plugin, different eventTypeId),
    // remove the stale entry from the old event type's map first.
    if (existing && existing.eventTypeId !== eventTypeId) {
      const oldEventHandlers = this.handlers.get(existing.eventTypeId);
      if (oldEventHandlers) {
        oldEventHandlers.delete(handlerId);
        if (oldEventHandlers.size === 0) {
          this.handlers.delete(existing.eventTypeId);
        }
      }
    }

    // Add to event type map
    if (!this.handlers.has(eventTypeId)) {
      this.handlers.set(eventTypeId, new Map());
    }
    this.handlers.get(eventTypeId)!.set(handlerId, registration as EventHandlerRegistration);

    // Add to plugin index (idempotent; Set handles duplicates)
    if (!this.handlersByPlugin.has(pluginId)) {
      this.handlersByPlugin.set(pluginId, new Set());
    }
    this.handlersByPlugin.get(pluginId)!.add(handlerId);

    // Add to handler map (overwrites any previous registration for this handlerId)
    this.handlerMap.set(handlerId, registration as EventHandlerRegistration);
  }

  /**
   * Get all handlers for a specific event type, including enabled/disabled state.
   */
  getHandlersForEventType(eventTypeId: EventTypeId): readonly EventHandlerRegistration[] {
    return Array.from(this.handlers.get(eventTypeId)?.values() || []);
  }

  /**
   * Get all handlers registered by a plugin.
   */
  getHandlersByPlugin(pluginId: string): readonly EventHandlerRegistration[] {
    const handlerIds = this.handlersByPlugin.get(pluginId) || new Set();
    return Array.from(handlerIds)
      .map((id) => this.handlerMap.get(id))
      .filter((reg) => reg !== undefined) as EventHandlerRegistration[];
  }

  /**
   * Get a specific handler registration by ID.
   */
  getHandler(handlerId: EventHandlerId): EventHandlerRegistration | undefined {
    return this.handlerMap.get(handlerId);
  }

  /**
   * Remove all handlers for a plugin (e.g., when disabled or uninstalled).
   */
  removeHandlersByPlugin(pluginId: string): void {
    const handlerIds = this.handlersByPlugin.get(pluginId) || new Set();

    for (const handlerId of handlerIds) {
      const registration = this.handlerMap.get(handlerId);
      if (registration) {
        const eventHandlers = this.handlers.get(registration.eventTypeId);
        if (eventHandlers) {
          eventHandlers.delete(handlerId);
        }
      }
      this.handlerMap.delete(handlerId);
    }

    this.handlersByPlugin.delete(pluginId);
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.handlers.clear();
    this.handlersByPlugin.clear();
    this.handlerMap.clear();
  }

  /**
   * Get total count of registered handlers.
   */
  size(): number {
    return this.handlerMap.size;
  }
}

// Singleton instance
let globalRegistry: EventRegistry | null = null;

/**
 * Get the global event registry instance.
 * Creates a new instance if one does not exist.
 */
export function getEventRegistry(): EventRegistry {
  if (!globalRegistry) {
    globalRegistry = new EventRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global event registry (testing only).
 */
export function resetEventRegistry(): void {
  globalRegistry = null;
}

/**
 * For testing: initialize with a specific registry instance.
 */
export function setEventRegistry(registry: EventRegistry): void {
  globalRegistry = registry;
}

export { EventRegistry };
