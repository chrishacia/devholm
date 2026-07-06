/**
 * Event system tests.
 * Verify event registration, dispatch, and plugin enablement checks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  eventTypeId,
  eventHandlerId,
  eventPayloadVersion,
  StandardEventTypes,
} from '@core/types/events';
import {
  resetEventRegistry,
  setEventRegistry,
  EventRegistry,
} from '@core/lib/event-registry.server';

describe('Event System', () => {
  beforeEach(() => {
    resetEventRegistry();
  });

  afterEach(() => {
    resetEventRegistry();
  });

  describe('Event Registry', () => {
    it('should register and retrieve event handlers', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      const handler = vi.fn();
      const registration = {
        handlerId: eventHandlerId('test-handler-1'),
        pluginId: 'test-plugin',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler,
      };

      registry.register(registration);

      expect(registry.size()).toBe(1);
      expect(registry.getHandler(registration.handlerId)).toEqual(registration);
    });

    it('should retrieve all handlers for an event type', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        handlerId: eventHandlerId('handler-1'),
        pluginId: 'plugin-1',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: handler1,
      });

      registry.register({
        handlerId: eventHandlerId('handler-2'),
        pluginId: 'plugin-2',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: handler2,
      });

      const handlers = registry.getHandlersForEventType(StandardEventTypes.USER_CREATED);
      expect(handlers).toHaveLength(2);
    });

    it('should retrieve handlers by plugin', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      registry.register({
        handlerId: eventHandlerId('handler-1'),
        pluginId: 'plugin-1',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: vi.fn(),
      });

      registry.register({
        handlerId: eventHandlerId('handler-2'),
        pluginId: 'plugin-1',
        eventTypeId: StandardEventTypes.USER_AUTHENTICATED,
        handler: vi.fn(),
      });

      registry.register({
        handlerId: eventHandlerId('handler-3'),
        pluginId: 'plugin-2',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: vi.fn(),
      });

      const plugin1Handlers = registry.getHandlersByPlugin('plugin-1');
      expect(plugin1Handlers).toHaveLength(2);

      const plugin2Handlers = registry.getHandlersByPlugin('plugin-2');
      expect(plugin2Handlers).toHaveLength(1);
    });

    it('should remove handlers by plugin', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      registry.register({
        handlerId: eventHandlerId('handler-1'),
        pluginId: 'plugin-1',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: vi.fn(),
      });

      registry.register({
        handlerId: eventHandlerId('handler-2'),
        pluginId: 'plugin-2',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: vi.fn(),
      });

      registry.removeHandlersByPlugin('plugin-1');

      expect(registry.getHandlersByPlugin('plugin-1')).toHaveLength(0);
      expect(registry.getHandlersForEventType(StandardEventTypes.USER_CREATED)).toHaveLength(1);
    });

    it('should allow duplicate handler IDs to overwrite within same plugin', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        handlerId: eventHandlerId('handler-1'),
        pluginId: 'plugin-1',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: handler1,
      });

      registry.register({
        handlerId: eventHandlerId('handler-1'),
        pluginId: 'plugin-1',
        eventTypeId: StandardEventTypes.USER_AUTHENTICATED,
        handler: handler2,
      });

      expect(registry.getHandlersByPlugin('plugin-1')).toHaveLength(1);
      const handler = registry.getHandler(eventHandlerId('handler-1'));
      expect(handler?.handler).toBe(handler2);
    });
  });

  describe('SDK defineEventHandler', () => {
    it('should register handlers through SDK (tested via core library)', () => {
      const handler = vi.fn();
      const registry = new EventRegistry();
      setEventRegistry(registry);

      registry.register({
        handlerId: eventHandlerId('onUserCreated'),
        pluginId: 'test-plugin',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler,
      });

      const handlers = registry.getHandlersForEventType(StandardEventTypes.USER_CREATED);
      expect(handlers).toHaveLength(1);
      expect(handlers[0].handler).toBe(handler);
    });
  });

  describe('Event Payload Version', () => {
    it('should enforce positive integer versions', () => {
      expect(() => eventPayloadVersion(0)).toThrow();
      expect(() => eventPayloadVersion(-1)).toThrow();
      expect(() => eventPayloadVersion(1.5)).toThrow();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(eventPayloadVersion(1)).toEqual(1 as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(eventPayloadVersion(100)).toEqual(100 as any);
    });
  });

  describe('Event Type IDs and Handlers', () => {
    it('should support framework standard event types', () => {
      expect(StandardEventTypes.USER_CREATED).toBeDefined();
      expect(StandardEventTypes.USER_AUTHENTICATED).toBeDefined();
      expect(StandardEventTypes.PLUGIN_ENABLED).toBeDefined();
      expect(StandardEventTypes.PLUGIN_DISABLED).toBeDefined();
      expect(StandardEventTypes.CONTENT_CREATED).toBeDefined();
      expect(StandardEventTypes.SETTINGS_CHANGED).toBeDefined();
    });

    it('should create custom event type IDs', () => {
      const customEventId = eventTypeId('plugin:custom:event');
      expect(customEventId).toBeDefined();
    });

    it('should create custom handler IDs', () => {
      const customHandlerId = eventHandlerId('myHandler');
      expect(customHandlerId).toBeDefined();
    });
  });

  describe('Handler re-registration and collision determinism', () => {
    it('should clean up stale per-eventType entries when handlerId is re-registered for a different eventType', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      const hId = eventHandlerId('movingHandler');
      const pluginId = 'plugin-a';

      // Register for USER_CREATED
      registry.register({
        handlerId: hId,
        pluginId,
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: vi.fn(),
      });
      expect(registry.getHandlersForEventType(StandardEventTypes.USER_CREATED)).toHaveLength(1);
      expect(registry.getHandlersForEventType(StandardEventTypes.USER_AUTHENTICATED)).toHaveLength(
        0
      );

      // Re-register for USER_AUTHENTICATED (different eventType, same pluginId)
      registry.register({
        handlerId: hId,
        pluginId,
        eventTypeId: StandardEventTypes.USER_AUTHENTICATED,
        handler: vi.fn(),
      });

      // Stale USER_CREATED entry must be gone
      expect(registry.getHandlersForEventType(StandardEventTypes.USER_CREATED)).toHaveLength(0);
      // New USER_AUTHENTICATED entry must be present
      expect(registry.getHandlersForEventType(StandardEventTypes.USER_AUTHENTICATED)).toHaveLength(
        1
      );
      // Overall size stays at 1
      expect(registry.size()).toBe(1);
    });

    it('should throw when two different plugins try to register with the same handlerId', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      registry.register({
        handlerId: eventHandlerId('sharedId'),
        pluginId: 'plugin-a',
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: vi.fn(),
      });

      // Second plugin claiming the same handlerId must throw
      expect(() => {
        registry.register({
          handlerId: eventHandlerId('sharedId'),
          pluginId: 'plugin-b',
          eventTypeId: StandardEventTypes.USER_CREATED,
          handler: vi.fn(),
        });
      }).toThrow(/collision/i);
    });

    it('should allow same plugin to overwrite its own handler registration deterministically', () => {
      const registry = new EventRegistry();
      setEventRegistry(registry);

      const hId = eventHandlerId('updatableHandler');
      const pluginId = 'plugin-a';
      const handlerV1 = vi.fn();
      const handlerV2 = vi.fn();

      registry.register({
        handlerId: hId,
        pluginId,
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: handlerV1,
      });

      // Overwrite with new handler (same pluginId, same eventTypeId)
      registry.register({
        handlerId: hId,
        pluginId,
        eventTypeId: StandardEventTypes.USER_CREATED,
        handler: handlerV2,
      });

      const handlers = registry.getHandlersForEventType(StandardEventTypes.USER_CREATED);
      expect(handlers).toHaveLength(1);
      expect(handlers[0].handler).toBe(handlerV2);
      expect(registry.size()).toBe(1);
    });
  });
});
