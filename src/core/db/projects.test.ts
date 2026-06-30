import { describe, expect, it } from 'vitest';
import { normalizeProjectOrderIds } from './projects';

describe('normalizeProjectOrderIds', () => {
  it('keeps requested ids first and preserves missing ids afterward', () => {
    expect(normalizeProjectOrderIds(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });

  it('drops duplicates and ignores ids that are not present', () => {
    expect(normalizeProjectOrderIds(['a', 'b', 'c'], ['c', 'c', 'x', 'a'])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});
