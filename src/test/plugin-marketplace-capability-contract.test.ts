import { describe, expect, it } from 'vitest';
import { evaluateMarketplaceCapabilityContract } from '@core/lib/plugin-marketplace-capability-contract.server';

describe('plugin-marketplace-capability-contract', () => {
  it('treats first install as baseline with no escalation', () => {
    const result = evaluateMarketplaceCapabilityContract(null, {
      permissionKeys: ['calendar.read'],
      capabilities: ['calendar'],
      scopes: ['public'],
      publicRouteExtensionIds: ['calendar-routes'],
      adminPageHrefs: ['/admin/calendar'],
      apiPaths: ['/api/calendar'],
      settingKeys: ['calendar.enabled'],
    });

    expect(result.hasEscalation).toBe(false);
    expect(result.blockers).toHaveLength(0);
    expect(result.approvals).toHaveLength(0);
  });

  it('marks new permissions and routes as approval-required escalation', () => {
    const result = evaluateMarketplaceCapabilityContract(
      {
        permissionKeys: ['calendar.read'],
        capabilities: ['calendar'],
        scopes: ['public'],
        publicRouteExtensionIds: [],
        adminPageHrefs: [],
        apiPaths: [],
        settingKeys: [],
      },
      {
        permissionKeys: ['calendar.read', 'calendar.write'],
        capabilities: ['calendar', 'calendar-admin'],
        scopes: ['public', 'admin'],
        publicRouteExtensionIds: ['calendar-routes'],
        adminPageHrefs: ['/admin/calendar'],
        apiPaths: ['/api/calendar'],
        settingKeys: ['calendar.enabled'],
      }
    );

    expect(result.hasEscalation).toBe(true);
    expect(result.approvals.length).toBeGreaterThan(0);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks policy-scoped scope expansion in this phase', () => {
    const result = evaluateMarketplaceCapabilityContract(
      {
        permissionKeys: ['calendar.read'],
        capabilities: ['calendar'],
        scopes: ['public'],
        publicRouteExtensionIds: [],
        adminPageHrefs: [],
        apiPaths: [],
        settingKeys: [],
      },
      {
        permissionKeys: ['calendar.read', 'calendar.policy'],
        capabilities: ['calendar'],
        scopes: ['public', 'policy-scoped'],
        publicRouteExtensionIds: [],
        adminPageHrefs: [],
        apiPaths: [],
        settingKeys: [],
      }
    );

    expect(result.hasEscalation).toBe(true);
    expect(result.blockers.some((item) => item.includes('policy rollout'))).toBe(true);
  });

  it('blocks prohibited capability classes even on first install', () => {
    const result = evaluateMarketplaceCapabilityContract(null, {
      permissionKeys: ['calendar.exec'],
      capabilities: ['process-exec'],
      scopes: ['admin'],
      publicRouteExtensionIds: [],
      adminPageHrefs: [],
      apiPaths: [],
      settingKeys: [],
    });

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers.some((item) => item.includes('prohibited tokens'))).toBe(true);
  });

  it('flags privileged declarations for review', () => {
    const result = evaluateMarketplaceCapabilityContract(null, {
      permissionKeys: ['calendar.manage'],
      capabilities: ['calendar-admin'],
      scopes: ['admin'],
      publicRouteExtensionIds: [],
      adminPageHrefs: ['/admin/calendar'],
      apiPaths: ['/api/admin/calendar'],
      settingKeys: [],
    });

    expect(result.approvals.some((item) => item.includes('require review'))).toBe(true);
  });
});
