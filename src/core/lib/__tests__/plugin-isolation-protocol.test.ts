import { describe, expect, it } from 'vitest';
import {
  childToParentMessageSchema,
  parentToChildMessageSchema,
} from '@core/lib/plugin-isolation-protocol';

describe('plugin isolation protocol validation', () => {
  it('rejects unknown parent-to-child message types', () => {
    const parsed = parentToChildMessageSchema.safeParse({
      type: 'unknown-op',
      executionId: 'bad',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects malformed child-to-parent result payloads', () => {
    const parsed = childToParentMessageSchema.safeParse({
      type: 'api-result',
      executionId: 'not-a-uuid',
      pid: 'not-a-number',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects migration plan payloads with unknown operation properties', () => {
    const parsed = childToParentMessageSchema.safeParse({
      type: 'migration-plan-result',
      executionId: '11111111-1111-4111-8111-111111111111',
      pid: 12345,
      direction: 'up',
      plan: {
        protocolVersion: 'migration-plan-v1',
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:20260701010000_url_shortener_foundation',
        checksum: 'a'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        sourceVersion: '0.0.0',
        targetVersion: '0.1.0',
        reversible: true,
        up: [
          {
            type: 'create-table',
            table: 'u_url_shortener_links',
            columns: [{ name: 'id', type: 'uuid', primary: true }],
            unsafeRawSql: 'select 1',
          },
        ],
        down: [],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects migration plan payloads with unknown top-level fields', () => {
    const parsed = childToParentMessageSchema.safeParse({
      type: 'migration-plan-result',
      executionId: '22222222-2222-4222-8222-222222222222',
      pid: 12345,
      direction: 'up',
      plan: {
        protocolVersion: 'migration-plan-v1',
        pluginId: 'url-shortener',
        migrationId: 'url-shortener:20260701010000_url_shortener_foundation',
        checksum: 'b'.repeat(64),
        artifactIdentity: 'bundled:url-shortener@0.1.0:test',
        sourceVersion: '0.0.0',
        targetVersion: '0.1.0',
        reversible: true,
        up: [],
        down: [],
        experimentalFeatureFlag: true,
      },
    });

    expect(parsed.success).toBe(false);
  });
});
