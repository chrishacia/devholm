import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const getCalendarCollectionBySlug = vi.hoisted(() => vi.fn());
const listCalendarBlocks = vi.hoisted(() => vi.fn());
const listCalendarEventTypes = vi.hoisted(() => vi.fn());
const createCalendarBooking = vi.hoisted(() => vi.fn());
const listCalendarCollections = vi.hoisted(() => vi.fn());
const getClientIp = vi.hoisted(() => vi.fn());

vi.mock('@/db/calendar', () => ({
  createCalendarBooking,
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarCollections,
  listCalendarEventTypes,
}));

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/lib/rate-limiter', () => ({
  getClientIp,
}));

import {
  handleCalendarAdminApi,
  handleCalendarPublicApi,
} from '@user/extensions/plugins/calendar/api/handlers';

describe('calendar plugin API runtime handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({ id: 'admin-1', roles: ['admin'] });
    getClientIp.mockReturnValue('127.0.0.1');
  });

  it('returns public calendar payload through plugin handler', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'display' });
    listCalendarBlocks.mockResolvedValue([{ id: 'block-1', title: 'Office Hours' }]);
    listCalendarEventTypes.mockResolvedValue([{ id: 'evt-1', name: 'Consulting' }]);

    const response = await handleCalendarPublicApi(
      'GET',
      new NextRequest('http://localhost:3000/api/calendar/demo'),
      ['demo']
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      calendar: { id: 'cal-1', slug: 'demo', mode: 'display' },
      blocks: [{ id: 'block-1', title: 'Office Hours' }],
      eventTypes: [{ id: 'evt-1', name: 'Consulting' }],
    });
  });

  it('keeps booking conflict behavior unchanged', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'booking' });
    listCalendarEventTypes.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }]);
    listCalendarBlocks.mockResolvedValue([
      {
        startsAt: '2026-07-09T10:00:00.000Z',
        endsAt: '2026-07-09T10:30:00.000Z',
      },
    ]);

    const response = await handleCalendarPublicApi(
      'POST',
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
      ['demo', 'bookings']
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Requested slot is unavailable' });
  });

  it('creates booking with request client IP', async () => {
    getCalendarCollectionBySlug.mockResolvedValue({ id: 'cal-1', slug: 'demo', mode: 'booking' });
    listCalendarEventTypes.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }]);
    listCalendarBlocks.mockResolvedValue([]);
    createCalendarBooking.mockResolvedValue({ id: 'booking-1', status: 'pending' });

    const response = await handleCalendarPublicApi(
      'POST',
      new NextRequest('http://localhost:3000/api/calendar/demo/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: '11111111-1111-4111-8111-111111111111',
          name: 'Taylor User',
          email: 'taylor@example.com',
          title: 'Consultation',
          startsAt: '2026-07-09T11:00:00.000Z',
          endsAt: '2026-07-09T11:30:00.000Z',
        }),
      }),
      ['demo', 'bookings']
    );

    expect(response.status).toBe(201);
    expect(createCalendarBooking).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'cal-1', source: 'public', sourceIp: '127.0.0.1' })
    );
  });

  it('enforces admin authorization through plugin admin handler', async () => {
    verifyAdmin.mockResolvedValueOnce(null);

    const response = await handleCalendarAdminApi(
      'GET',
      new NextRequest('http://localhost:3000/api/admin/calendar'),
      []
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('lists calendars from admin root handler', async () => {
    listCalendarCollections.mockResolvedValue([{ id: 'cal-1', slug: 'demo' }]);

    const response = await handleCalendarAdminApi(
      'GET',
      new NextRequest('http://localhost:3000/api/admin/calendar'),
      []
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ calendars: [{ id: 'cal-1', slug: 'demo' }] });
  });

  it('lists event types for a calendar via admin handler', async () => {
    listCalendarEventTypes.mockResolvedValue([{ id: 'evt-1' }]);

    const response = await handleCalendarAdminApi(
      'GET',
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/event-types'),
      ['cal-1', 'event-types']
    );

    expect(response.status).toBe(200);
    expect(listCalendarEventTypes).toHaveBeenCalledWith('cal-1', false);
    await expect(response.json()).resolves.toEqual({ eventTypes: [{ id: 'evt-1' }] });
  });
});
