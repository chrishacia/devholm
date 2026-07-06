/**
 * Task system tests.
 * Verify scheduled task registration, handler lookup, and schedule types.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  taskTypeId,
  intervalSchedule,
  cronSchedule,
  StandardSchedules,
  StandardCronExpressions,
} from '@core/types/tasks';
import { getTaskRegistry, resetTaskRegistry, setTaskRegistry, TaskRegistry } from '@core/lib/task-registry.server';

describe('Task System', () => {
  beforeEach(() => {
    resetTaskRegistry();
  });

  afterEach(() => {
    resetTaskRegistry();
  });

  describe('Task Registry', () => {
    it('should register and retrieve task handlers', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const handler = vi.fn();
      const taskTypeIdVal = taskTypeId('cleanup-sessions');
      const registration = {
        taskTypeId: taskTypeIdVal,
        pluginId: 'session-plugin',
        handler,
        schedule: StandardSchedules.EVERY_HOUR,
      };

      registry.register(registration);

      expect(registry.size()).toBe(1);
      expect(registry.getHandler(taskTypeIdVal)).toEqual(registration);
    });

    it('should retrieve handlers for a task type', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const taskTypeIdVal = taskTypeId('cleanup-sessions');

      registry.register({
        taskTypeId: taskTypeIdVal,
        pluginId: 'session-plugin',
        handler: handler1,
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeId('send-digest'),
        pluginId: 'email-plugin',
        handler: handler2,
        schedule: StandardSchedules.EVERY_DAY,
      });

      const handler = registry.getHandler(taskTypeIdVal);
      expect(handler?.handler).toBe(handler1);
    });

    it('should retrieve all handlers for a plugin', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const pluginId = 'maintenance-plugin';
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const taskTypeId1 = taskTypeId('cleanup-sessions');
      const taskTypeId2 = taskTypeId('rebuild-cache');

      registry.register({
        taskTypeId: taskTypeId1,
        pluginId,
        handler: handler1,
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeId2,
        pluginId,
        handler: handler2,
        schedule: StandardSchedules.EVERY_DAY,
      });

      const handlers = registry.getHandlersByPlugin(pluginId);
      expect(handlers).toHaveLength(2);
      expect(handlers.map((r) => r.taskTypeId)).toEqual([taskTypeId1, taskTypeId2]);
    });

    it('should retrieve all handlers across all plugins', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      registry.register({
        taskTypeId: taskTypeId('cleanup-sessions'),
        pluginId: 'session-plugin',
        handler: vi.fn(),
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeId('send-digest'),
        pluginId: 'email-plugin',
        handler: vi.fn(),
        schedule: StandardSchedules.EVERY_DAY,
      });

      registry.register({
        taskTypeId: taskTypeId('rebuild-cache'),
        pluginId: 'cache-plugin',
        handler: vi.fn(),
        schedule: StandardSchedules.EVERY_HOUR,
      });

      const allHandlers = registry.getAllHandlers();
      expect(allHandlers).toHaveLength(3);
    });

    it('should remove all handlers for a plugin', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const pluginId = 'maintenance-plugin';
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        taskTypeId: taskTypeId('cleanup-sessions'),
        pluginId,
        handler: handler1,
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeId('rebuild-cache'),
        pluginId,
        handler: handler2,
        schedule: StandardSchedules.EVERY_DAY,
      });

      expect(registry.size()).toBe(2);

      registry.removeHandlersByPlugin(pluginId);

      expect(registry.size()).toBe(0);
      expect(registry.getHandlersByPlugin(pluginId)).toHaveLength(0);
    });

    it('should support interval schedules', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const schedules = [
        intervalSchedule(60000), // 1 minute
        intervalSchedule(300000, 30000), // 5 minutes, 30 second initial delay
      ];

      schedules.forEach((schedule, i) => {
        registry.register({
          taskTypeId: taskTypeId(`task-${i}`),
          pluginId: 'test-plugin',
          handler: vi.fn(),
          schedule,
        });
      });

      expect(registry.size()).toBe(2);
      expect(registry.getHandler(taskTypeId('task-0'))?.schedule).toEqual(schedules[0]);
      expect(registry.getHandler(taskTypeId('task-1'))?.schedule).toEqual(schedules[1]);
    });

    it('should support cron schedules', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const schedules = [
        cronSchedule(StandardCronExpressions.EVERY_MINUTE),
        cronSchedule(StandardCronExpressions.EVERY_HOUR),
        cronSchedule(StandardCronExpressions.EVERY_DAY_MIDNIGHT),
        cronSchedule(StandardCronExpressions.EVERY_MONDAY_MIDNIGHT),
      ];

      schedules.forEach((schedule, i) => {
        registry.register({
          taskTypeId: taskTypeId(`task-${i}`),
          pluginId: 'test-plugin',
          handler: vi.fn(),
          schedule,
        });
      });

      expect(registry.size()).toBe(4);
      schedules.forEach((schedule, i) => {
        const handler = registry.getHandler(taskTypeId(`task-${i}`));
        expect(handler?.schedule).toEqual(schedule);
      });
    });

    it('should clear all handlers', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      registry.register({
        taskTypeId: taskTypeId('task-1'),
        pluginId: 'plugin-1',
        handler: vi.fn(),
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeId('task-2'),
        pluginId: 'plugin-2',
        handler: vi.fn(),
        schedule: StandardSchedules.EVERY_DAY,
      });

      expect(registry.size()).toBe(2);
      registry.clear();
      expect(registry.size()).toBe(0);
    });

    it('should overwrite existing task handler registration', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const taskTypeIdVal = taskTypeId('cleanup-sessions');
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        taskTypeId: taskTypeIdVal,
        pluginId: 'session-plugin',
        handler: handler1,
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeIdVal,
        pluginId: 'session-plugin',
        handler: handler2,
        schedule: StandardSchedules.EVERY_5_MINUTES,
      });

      const handler = registry.getHandler(taskTypeIdVal);
      expect(handler?.handler).toBe(handler2);
      expect(handler?.schedule).toEqual(StandardSchedules.EVERY_5_MINUTES);
    });

    it('should track handlers by task type ID', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const taskTypeId1 = taskTypeId('cleanup-sessions');
      const taskTypeId2 = taskTypeId('send-digest');

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        taskTypeId: taskTypeId1,
        pluginId: 'plugin-1',
        handler: handler1,
        schedule: StandardSchedules.EVERY_HOUR,
      });

      registry.register({
        taskTypeId: taskTypeId2,
        pluginId: 'plugin-2',
        handler: handler2,
        schedule: StandardSchedules.EVERY_DAY,
      });

      expect(registry.getHandler(taskTypeId1)?.handler).toBe(handler1);
      expect(registry.getHandler(taskTypeId2)?.handler).toBe(handler2);
    });

    it('should support all standard schedules', () => {
      const registry = new TaskRegistry();
      setTaskRegistry(registry);

      const schedulesArray = [
        StandardSchedules.EVERY_MINUTE,
        StandardSchedules.EVERY_5_MINUTES,
        StandardSchedules.EVERY_HOUR,
        StandardSchedules.EVERY_DAY,
        StandardSchedules.EVERY_WEEK,
      ];

      schedulesArray.forEach((schedule, i) => {
        registry.register({
          taskTypeId: taskTypeId(`task-${i}`),
          pluginId: 'test-plugin',
          handler: vi.fn(),
          schedule,
        });
      });

      expect(registry.size()).toBe(5);
    });
  });

  describe('Task Registry Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const registry1 = getTaskRegistry();
      const registry2 = getTaskRegistry();
      expect(registry1).toBe(registry2);
    });

    it('should allow resetting singleton', () => {
      const registry1 = getTaskRegistry();
      registry1.register({
        taskTypeId: taskTypeId('task-1'),
        pluginId: 'plugin-1',
        handler: vi.fn(),
        schedule: StandardSchedules.EVERY_HOUR,
      });

      expect(registry1.size()).toBe(1);

      resetTaskRegistry();

      const registry2 = getTaskRegistry();
      expect(registry2.size()).toBe(0);
    });

    it('should allow setting custom singleton', () => {
      const customRegistry = new TaskRegistry();
      setTaskRegistry(customRegistry);

      const retrieved = getTaskRegistry();
      expect(retrieved).toBe(customRegistry);
    });
  });
});
