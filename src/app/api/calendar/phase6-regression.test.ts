import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const runApiExtension = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  runApiExtension,
}));

import { GET as getCalendar } from './[slug]/route';
import { POST as createBooking } from './[slug]/bookings/route';

describe('calendar phase 6 public route + booking API regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates public calendar GET to plugin extension runtime path', async () => {
    runApiExtension.mockResolvedValue(Response.json({ calendar: { id: 'cal-1' } }));

    const response = await getCalendar(new NextRequest('http://localhost:3000/api/calendar/demo'), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(runApiExtension).toHaveBeenCalledWith('GET', expect.any(NextRequest), [
      'calendar',
      'demo',
    ]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ calendar: { id: 'cal-1' } });
  });

  it('preserves disabled fallback contract when extension runtime declines request', async () => {
    runApiExtension.mockResolvedValue(null);

    const response = await getCalendar(new NextRequest('http://localhost:3000/api/calendar/demo'), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Calendar plugin is disabled' });
  });

  it('delegates booking POST to plugin extension runtime path', async () => {
    runApiExtension.mockResolvedValue(
      Response.json({ booking: { id: 'booking-1' } }, { status: 201 })
    );

    const response = await createBooking(
      new NextRequest('http://localhost:3000/api/calendar/demo/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Taylor User',
          email: 'taylor@example.com',
          title: 'Consultation',
          startsAt: '2026-07-09T11:00:00.000Z',
          endsAt: '2026-07-09T11:30:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      }
    );

    expect(runApiExtension).toHaveBeenCalledWith('POST', expect.any(NextRequest), [
      'calendar',
      'demo',
      'bookings',
    ]);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ booking: { id: 'booking-1' } });
  });
});
