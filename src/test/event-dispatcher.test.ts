/**
 * Event dispatcher tests.
 * Verify event dispatch, plugin enablement checks, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  eventHandlerId,
  eventPayloadVersion,
  StandardEventTypes,
  type UserCreatedEvent,
  type UserAuthenticatedEvent,
} from '@core/types/events';
import {
  resetEventRegistry,
  setEventRegistry,
  EventRegistry,
} from '@core/lib/event-registry.server';
import { dispatchEvent, dispatchEventWithResults } from '@core/lib/event-dispatcher.server';

const isPluginEnabledForRequest = vi.hoisted(() => vi.fn());

vi.mock('@core/db/plugins-enabled', () => ({
  isPluginEnabledForRequest,
}));

describe('Event Dispatcher', () => {
  const enabledPlugins = new Set<string>();

  beforeEach(async () => {
    resetEventRegistry();
    enabledPlugins.clear();
    isPluginEnabledForRequest.mockImplementation(async (pluginId?: string) => {
      if (!pluginId) {
        return true;
      }
      return enabledPlugins.has(pluginId);
    });
  });

  afterEach(() => {
    resetEventRegistry();
  });

  it('should dispatch events to all registered handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const registry = new EventRegistry();
    setEventRegistry(registry);

    registry.register({
      handlerId: eventHandlerId('handler1'),
      pluginId: 'plugin-1',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler1,
    });

    registry.register({
      handlerId: eventHandlerId('handler2'),
      pluginId: 'plugin-2',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler2,
    });

    enabledPlugins.add('plugin-1');
    enabledPlugins.add('plugin-2');

    const event: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    await dispatchEvent(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it('should skip handlers for disabled plugins', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const registry = new EventRegistry();
    setEventRegistry(registry);

    registry.register({
      handlerId: eventHandlerId('handler1'),
      pluginId: 'plugin-1',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler1,
    });

    registry.register({
      handlerId: eventHandlerId('handler2'),
      pluginId: 'plugin-2',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler2,
    });

    enabledPlugins.add('plugin-1');

    const event: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    await dispatchEvent(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should handle handler errors without stopping other handlers', async () => {
    const handler1 = vi.fn().mockRejectedValue(new Error('handler1 error'));
    const handler2 = vi.fn();
    const handler3 = vi.fn().mockImplementation(() => {
      throw new Error('handler3 error');
    });

    const registry = new EventRegistry();
    setEventRegistry(registry);

    registry.register({
      handlerId: eventHandlerId('handler1'),
      pluginId: 'plugin-1',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler1,
    });

    registry.register({
      handlerId: eventHandlerId('handler2'),
      pluginId: 'plugin-2',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler2,
    });

    registry.register({
      handlerId: eventHandlerId('handler3'),
      pluginId: 'plugin-3',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler3,
    });

    enabledPlugins.add('plugin-1');
    enabledPlugins.add('plugin-2');
    enabledPlugins.add('plugin-3');

    const event: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    // Should not throw even though two handlers fail
    await expect(dispatchEvent(event)).resolves.toBeUndefined();

    // Handler1 and handler3 were called and failed
    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler3).toHaveBeenCalledWith(event);
    // Handler2 still executed despite earlier errors
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it('should return detailed results with dispatchEventWithResults', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn().mockRejectedValue(new Error('handler2 error'));

    const registry = new EventRegistry();
    setEventRegistry(registry);

    registry.register({
      handlerId: eventHandlerId('handler1'),
      pluginId: 'plugin-1',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler1,
    });

    registry.register({
      handlerId: eventHandlerId('handler2'),
      pluginId: 'plugin-2',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: handler2,
    });

    registry.register({
      handlerId: eventHandlerId('handler3'),
      pluginId: 'plugin-3',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: vi.fn(),
    });

    enabledPlugins.add('plugin-1');
    enabledPlugins.add('plugin-2');

    const event: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    const results = await dispatchEventWithResults(event);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      handlerId: eventHandlerId('handler1'),
      pluginId: 'plugin-1',
      result: 'success',
    });
    expect(results[1]).toMatchObject({
      handlerId: eventHandlerId('handler2'),
      pluginId: 'plugin-2',
      result: 'error',
    });
    expect(results[1].error?.message).toContain('handler2 error');
    expect(results[2]).toMatchObject({
      handlerId: eventHandlerId('handler3'),
      pluginId: 'plugin-3',
      result: 'skipped',
    });
  });

  it('should dispatch no-op when no handlers registered', async () => {
    const event: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    // Should resolve without error
    await expect(dispatchEvent(event)).resolves.toBeUndefined();
    await expect(dispatchEventWithResults(event)).resolves.toEqual([]);
  });

  it('should support multiple event types', async () => {
    const userCreatedHandler = vi.fn();
    const userAuthenticatedHandler = vi.fn();

    const registry = new EventRegistry();
    setEventRegistry(registry);

    registry.register({
      handlerId: eventHandlerId('onUserCreated'),
      pluginId: 'plugin-1',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler: userCreatedHandler,
    });

    registry.register({
      handlerId: eventHandlerId('onUserAuthenticated'),
      pluginId: 'plugin-1',
      eventTypeId: StandardEventTypes.USER_AUTHENTICATED,
      handler: userAuthenticatedHandler,
    });

    enabledPlugins.add('plugin-1');

    const userCreatedEvent: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    const userAuthenticatedEvent: UserAuthenticatedEvent = {
      eventTypeId: StandardEventTypes.USER_AUTHENTICATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      authMethod: 'password',
    };

    await dispatchEvent(userCreatedEvent);
    expect(userCreatedHandler).toHaveBeenCalledWith(userCreatedEvent);
    expect(userAuthenticatedHandler).not.toHaveBeenCalled();

    await dispatchEvent(userAuthenticatedEvent);
    expect(userAuthenticatedHandler).toHaveBeenCalledWith(userAuthenticatedEvent);
  });

  it('fails closed when canonical plugin state is unresolved', async () => {
    const handler = vi.fn();
    const registry = new EventRegistry();
    setEventRegistry(registry);

    registry.register({
      handlerId: eventHandlerId('unresolved-plugin-handler'),
      pluginId: 'unresolved-plugin',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler,
    });

    const event: UserCreatedEvent = {
      eventTypeId: StandardEventTypes.USER_CREATED,
      payloadVersion: eventPayloadVersion(1),
      occurredAt: new Date(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    await dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });
});
