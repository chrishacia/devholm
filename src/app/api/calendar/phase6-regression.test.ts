import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isPluginEnabled = vi.hoisted(() => vi.fn());
const getCalendarCollectionBySlug = vi.hoisted(() => vi.fn());
const listCalendarBlocks = vi.hoisted(() => vi.fn());
const listCalendarEventTypes = vi.hoisted(() => vi.fn());
const createCalendarBooking = vi.hoisted(() => vi.fn());
const getClientIp = vi.hoisted(() => vi.fn());

vi.mock('@/db/plugins', () => ({
  isPluginEnabled,
}));

vi.mock('@/db/calendar', () => ({
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarEventTypes,
  createCalendarBooking,
}));

vi.mock('@/lib/rate-limiter', () => ({
  getClientIp,
}));

import { GET as getCalendar } from './[slug]/route';
import { POST as createBooking } from './[slug]/bookings/route';

describe('calendar phase 6 public route + booking API regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPluginEnabled.mockResolvedValue(true);
    getClientIp.mockReturnValue('127.0.0.1');
  });

  it('returns 404 when calendar plugin is disabled for public GET route', async () => {
    isPluginEnabled.mockResolvedValue(false);

    const response = await getCalendar(new NextRequest('http://localhost:3000/api/calendar/demo'), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Calendar plugin is disabled' });
  });

  it('returns public calendar payload unchanged when plugin is enabled', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'display' });
    listCalendarBlocks.mockResolvedValue([{ id: 'block-1', title: 'Office Hours' }]);
    listCalendarEventTypes.mockResolvedValue([
      { id: 'evt-1', name: 'Consulting', durationMinutes: 30 },
    ]);

    const response = await getCalendar(new NextRequest('http://localhost:3000/api/calendar/demo'), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      calendar: { id: 'cal-1', slug: 'demo', mode: 'display' },
      blocks: [{ id: 'block-1', title: 'Office Hours' }],
      eventTypes: [{ id: 'evt-1', name: 'Consulting', durationMinutes: 30 }],
    });
  });

  it('keeps booking API validation behavior unchanged for bad payloads', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'booking' });

    const response = await createBooking(
      new NextRequest('http://localhost:3000/api/calendar/demo/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'A' }),
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid payload');
  });

  it('keeps booking conflict behavior unchanged', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'booking' });
    listCalendarEventTypes.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111', name: 'Consulting' },
    ]);
    listCalendarBlocks.mockResolvedValue([
      {
        id: 'blk-1',
        startsAt: '2026-07-09T10:00:00.000Z',
        endsAt: '2026-07-09T10:30:00.000Z',
      },
    ]);

    const response = await createBooking(
      new NextRequest('http://localhost:3000/api/calendar/demo/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: '11111111-1111-4111-8111-111111111111',
          name: 'Taylor User',
          email: 'taylor@example.com',
          title: 'Consultation',
          startsAt: '2026-07-09T10:15:00.000Z',
          endsAt: '2026-07-09T10:45:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Requested slot is unavailable' });
  });

  it('keeps booking creation behavior unchanged when slot is available', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'booking' });
    listCalendarEventTypes.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111', name: 'Consulting' },
    ]);
    listCalendarBlocks.mockResolvedValue([]);
    createCalendarBooking.mockResolvedValue({ id: 'booking-1', status: 'pending' });

    const response = await createBooking(
      new NextRequest('http://localhost:3000/api/calendar/demo/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: '11111111-1111-4111-8111-111111111111',
          name: 'Taylor User',
          email: 'taylor@example.com',
          title: 'Consultation',
          notes: 'Looking forward to speaking.',
          startsAt: '2026-07-09T11:00:00.000Z',
          endsAt: '2026-07-09T11:30:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      }
    );

    expect(response.status).toBe(201);
    expect(createCalendarBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'cal-1',
        source: 'public',
        sourceIp: '127.0.0.1',
      })
    );
    expect(await response.json()).toEqual({ booking: { id: 'booking-1', status: 'pending' } });
  });
});
