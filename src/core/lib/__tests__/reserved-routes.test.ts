import { describe, it, expect } from 'vitest';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';

describe('getReservedRoutes', () => {
  it('includes the homepage route', () => {
    const reservedRoutes = getReservedRoutes();

    expect(reservedRoutes.has('/')).toBe(true);
  });
});
