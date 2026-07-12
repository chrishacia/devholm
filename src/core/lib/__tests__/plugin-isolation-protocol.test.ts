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
});
