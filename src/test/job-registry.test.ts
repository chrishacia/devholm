/**
 * Job system tests.
 * Verify job registration, handler lookup, and plugin management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  jobTypeId,
  jobInstanceId,
  jobPayloadVersion,
  StandardJobRetryPolicies,
  // type BaseJob - unused in this test
} from '@core/types/jobs';
import {
  getJobRegistry,
  resetJobRegistry,
  setJobRegistry,
  JobRegistry,
} from '@core/lib/job-registry.server';

describe('Job System', () => {
  beforeEach(() => {
    resetJobRegistry();
  });

  afterEach(() => {
    resetJobRegistry();
  });

  describe('Job Registry', () => {
    it('should register and retrieve job handlers', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const handler = vi.fn();
      const jobTypeIdVal = jobTypeId('send-email');
      const registration = {
        jobTypeId: jobTypeIdVal,
        pluginId: 'email-plugin',
        handler,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      };

      registry.register(registration);

      expect(registry.size()).toBe(1);
      expect(registry.getHandler(jobTypeIdVal)).toEqual(registration);
    });

    it('should retrieve handlers for a job type', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const jobTypeIdVal = jobTypeId('send-email');

      registry.register({
        jobTypeId: jobTypeIdVal,
        pluginId: 'email-plugin',
        handler: handler1,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      registry.register({
        jobTypeId: jobTypeId('log-event'),
        pluginId: 'logging-plugin',
        handler: handler2,
        retryPolicy: StandardJobRetryPolicies.NO_RETRY,
      });

      const handler = registry.getHandler(jobTypeIdVal);
      expect(handler?.handler).toBe(handler1);
    });

    it('should retrieve all handlers for a plugin', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const pluginId = 'email-plugin';
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const jobTypeId1 = jobTypeId('send-email');
      const jobTypeId2 = jobTypeId('send-bulk-email');

      registry.register({
        jobTypeId: jobTypeId1,
        pluginId,
        handler: handler1,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      registry.register({
        jobTypeId: jobTypeId2,
        pluginId,
        handler: handler2,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      const handlers = registry.getHandlersByPlugin(pluginId);
      expect(handlers).toHaveLength(2);
      expect(handlers.map((r) => r.jobTypeId)).toEqual([jobTypeId1, jobTypeId2]);
    });

    it('should remove all handlers for a plugin', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const pluginId = 'email-plugin';
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        jobTypeId: jobTypeId('send-email'),
        pluginId,
        handler: handler1,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      registry.register({
        jobTypeId: jobTypeId('send-bulk-email'),
        pluginId,
        handler: handler2,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      expect(registry.size()).toBe(2);

      registry.removeHandlersByPlugin(pluginId);

      expect(registry.size()).toBe(0);
      expect(registry.getHandlersByPlugin(pluginId)).toHaveLength(0);
    });

    it('should support different retry policies', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const policies = [
        StandardJobRetryPolicies.NO_RETRY,
        StandardJobRetryPolicies.STANDARD,
        StandardJobRetryPolicies.AGGRESSIVE,
      ];

      const jobTypeIds = policies.map((_, i) => jobTypeId(`job-${i}`));

      policies.forEach((policy, i) => {
        registry.register({
          jobTypeId: jobTypeIds[i],
          pluginId: 'test-plugin',
          handler: vi.fn(),
          retryPolicy: policy,
        });
      });

      expect(registry.size()).toBe(3);

      jobTypeIds.forEach((typeId, i) => {
        const handler = registry.getHandler(typeId);
        expect(handler?.retryPolicy).toEqual(policies[i]);
      });
    });

    it('should clear all handlers', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      registry.register({
        jobTypeId: jobTypeId('job-1'),
        pluginId: 'plugin-1',
        handler: vi.fn(),
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      registry.register({
        jobTypeId: jobTypeId('job-2'),
        pluginId: 'plugin-2',
        handler: vi.fn(),
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      expect(registry.size()).toBe(2);
      registry.clear();
      expect(registry.size()).toBe(0);
    });

    it('should overwrite existing job handler registration', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const jobTypeIdVal = jobTypeId('send-email');
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        jobTypeId: jobTypeIdVal,
        pluginId: 'email-plugin',
        handler: handler1,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      registry.register({
        jobTypeId: jobTypeIdVal,
        pluginId: 'email-plugin',
        handler: handler2,
        retryPolicy: StandardJobRetryPolicies.AGGRESSIVE,
      });

      const handler = registry.getHandler(jobTypeIdVal);
      expect(handler?.handler).toBe(handler2);
      expect(handler?.retryPolicy).toEqual(StandardJobRetryPolicies.AGGRESSIVE);
    });

    it('should track handlers by job type ID', () => {
      const registry = new JobRegistry();
      setJobRegistry(registry);

      const jobTypeId1 = jobTypeId('send-email');
      const jobTypeId2 = jobTypeId('log-event');

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        jobTypeId: jobTypeId1,
        pluginId: 'plugin-1',
        handler: handler1,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      registry.register({
        jobTypeId: jobTypeId2,
        pluginId: 'plugin-2',
        handler: handler2,
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      expect(registry.getHandler(jobTypeId1)?.handler).toBe(handler1);
      expect(registry.getHandler(jobTypeId2)?.handler).toBe(handler2);
    });

    it('should support job instance IDs', () => {
      const jobInstanceIdVal = jobInstanceId('job-instance-123');
      expect(jobInstanceIdVal).toBeDefined();
      expect(typeof jobInstanceIdVal).toBe('string');
      expect(jobInstanceIdVal).toBe('job-instance-123');
    });

    it('should support job payload versioning', () => {
      const version = jobPayloadVersion(1);
      expect(version).toBe(1);
    });
  });

  describe('Job Registry Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const registry1 = getJobRegistry();
      const registry2 = getJobRegistry();
      expect(registry1).toBe(registry2);
    });

    it('should allow resetting singleton', () => {
      const registry1 = getJobRegistry();
      registry1.register({
        jobTypeId: jobTypeId('job-1'),
        pluginId: 'plugin-1',
        handler: vi.fn(),
        retryPolicy: StandardJobRetryPolicies.STANDARD,
      });

      expect(registry1.size()).toBe(1);

      resetJobRegistry();

      const registry2 = getJobRegistry();
      expect(registry2.size()).toBe(0);
    });

    it('should allow setting custom singleton', () => {
      const customRegistry = new JobRegistry();
      setJobRegistry(customRegistry);

      const retrieved = getJobRegistry();
      expect(retrieved).toBe(customRegistry);
    });
  });
});
