/**
 * Event system types - re-exported from SDK for @core usage.
 *
 * Events provide a versioned contract for plugins to react to framework events
 * without requiring direct edits to framework internals. All event handlers
 * are executed only when their plugin is enabled.
 *
 * @note Types are defined in @devholm/sdk/types and re-exported here to avoid
 * circular dependencies. Framework code imports from @core; plugins import from SDK.
 */

export type {
  EventTypeId,
  EventHandlerId,
  EventPayloadVersion,
  BaseEvent,
  UserAuthenticatedEvent,
  UserCreatedEvent,
  UserDeletedEvent,
  ContentCreatedEvent,
  ContentUpdatedEvent,
  ContentDeletedEvent,
  PluginEnabledEvent,
  PluginDisabledEvent,
  SettingsChangedEvent,
  RequestCompletedEvent,
  DomainEvent,
  EventHandler,
  EventHandlerRegistration,
  EventEmissionContext,
} from '@devholm/sdk/types';

export {
  eventTypeId,
  eventHandlerId,
  eventPayloadVersion,
  StandardEventTypes,
} from '@devholm/sdk/types';
