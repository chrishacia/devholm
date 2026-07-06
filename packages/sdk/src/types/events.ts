/**
 * Event system types for DevHolm plugin extensions.
 *
 * Events provide a versioned contract for plugins to react to framework events
 * without requiring direct edits to framework internals. All event handlers
 * are executed only when their plugin is enabled.
 */

/**
 * Unique identifier for an event type.
 * Format: `framework:category:event-name` for framework events
 * or `plugin:plugin-id:event-name` for plugin-defined events.
 */
export type EventTypeId = string & {
  readonly __brand: 'EventTypeId';
};

/**
 * Unique identifier for an event handler.
 * Scoped by plugin, e.g., `plugin:url-shortener:onUserCreated`.
 */
export type EventHandlerId = string & {
  readonly __brand: 'EventHandlerId';
};

/**
 * Event payload version for contract versioning.
 * Allows safe evolution of event schemas over time.
 */
export type EventPayloadVersion = number & {
  readonly __brand: 'EventPayloadVersion';
};

/**
 * Base event contract.
 * All events include metadata for observability and versioning.
 */
export interface BaseEvent {
  readonly eventTypeId: EventTypeId;
  readonly payloadVersion: EventPayloadVersion;
  readonly occurredAt: Date;
  readonly correlationId?: string;
}

/**
 * User-related events.
 */
export interface UserAuthenticatedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'user:authenticated' };
  readonly userId: string;
  readonly authMethod?: string;
}

export interface UserCreatedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'user:created' };
  readonly userId: string;
  readonly email: string;
}

export interface UserDeletedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'user:deleted' };
  readonly userId: string;
}

/**
 * Content-related events.
 */
export interface ContentCreatedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'content:created' };
  readonly contentType: string;
  readonly contentId: string;
  readonly ownerId: string;
}

export interface ContentUpdatedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'content:updated' };
  readonly contentType: string;
  readonly contentId: string;
  readonly ownerId: string;
}

export interface ContentDeletedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'content:deleted' };
  readonly contentType: string;
  readonly contentId: string;
  readonly ownerId: string;
}

/**
 * Plugin lifecycle events.
 */
export interface PluginEnabledEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'plugin:enabled' };
  readonly pluginId: string;
  readonly version: string;
}

export interface PluginDisabledEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'plugin:disabled' };
  readonly pluginId: string;
}

/**
 * Settings-related events.
 */
export interface SettingsChangedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'settings:changed' };
  readonly key: string;
  readonly previousValue?: string;
  readonly newValue?: string;
}

/**
 * Request completion events.
 */
export interface RequestCompletedEvent extends BaseEvent {
  readonly eventTypeId: EventTypeId & { readonly __discriminator?: 'request:completed' };
  readonly method: string;
  readonly path: string;
  readonly statusCode: number;
  readonly durationMs?: number;
}

/**
 * Union of all supported event types.
 */
export type DomainEvent =
  | UserAuthenticatedEvent
  | UserCreatedEvent
  | UserDeletedEvent
  | ContentCreatedEvent
  | ContentUpdatedEvent
  | ContentDeletedEvent
  | PluginEnabledEvent
  | PluginDisabledEvent
  | SettingsChangedEvent
  | RequestCompletedEvent;

/**
 * Handler function for domain events.
 * Must be async or sync, deterministic, and side-effect controlled.
 * Handlers must not throw; errors are logged and suppressed.
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

/**
 * Event handler registration contract.
 * Each handler is scoped to a plugin and includes capability requirements.
 */
export interface EventHandlerRegistration<T extends DomainEvent = DomainEvent> {
  readonly handlerId: EventHandlerId;
  readonly pluginId: string;
  readonly eventTypeId: EventTypeId;
  readonly handler: EventHandler<T>;
  readonly requiredCapabilities?: readonly string[];
}

/**
 * Event emission context.
 * Used for observability and handler decision-making.
 */
export interface EventEmissionContext {
  readonly causedBy?: {
    readonly actionType: string;
    readonly userId?: string;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Create a strongly-typed EventTypeId.
 */
export function eventTypeId(value: string): EventTypeId {
  return value as EventTypeId;
}

/**
 * Create a strongly-typed EventHandlerId.
 */
export function eventHandlerId(value: string): EventHandlerId {
  return value as EventHandlerId;
}

/**
 * Create a strongly-typed EventPayloadVersion.
 */
export function eventPayloadVersion(value: number): EventPayloadVersion {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Event payload version must be a positive integer');
  }
  return value as EventPayloadVersion;
}

/**
 * Framework-standard event type IDs.
 * Plugins depend on these for predictable event binding.
 */
export const StandardEventTypes = {
  USER_AUTHENTICATED: eventTypeId('framework:user:authenticated'),
  USER_CREATED: eventTypeId('framework:user:created'),
  USER_DELETED: eventTypeId('framework:user:deleted'),
  CONTENT_CREATED: eventTypeId('framework:content:created'),
  CONTENT_UPDATED: eventTypeId('framework:content:updated'),
  CONTENT_DELETED: eventTypeId('framework:content:deleted'),
  PLUGIN_ENABLED: eventTypeId('framework:plugin:enabled'),
  PLUGIN_DISABLED: eventTypeId('framework:plugin:disabled'),
  SETTINGS_CHANGED: eventTypeId('framework:settings:changed'),
  REQUEST_COMPLETED: eventTypeId('framework:request:completed'),
} as const;
