import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const runApiExtension = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  runApiExtension,
}));

import { GET as getCalendarRoot, POST as postCalendarRoot } from './route';
import {
  DELETE as deleteCalendarById,
  GET as getCalendarById,
  PUT as putCalendarById,
} from './[id]/route';
import { GET as getCalendarBlocks, POST as postCalendarBlocks } from './[id]/blocks/route';
import {
  DELETE as deleteCalendarBlockById,
  PUT as putCalendarBlockById,
} from './blocks/[blockId]/route';
import { GET as getEventTypes, POST as postEventTypes } from './[id]/event-types/route';
import {
  DELETE as deleteEventTypeById,
  PUT as putEventTypeById,
} from './event-types/[eventTypeId]/route';

describe('calendar phase 6 admin route regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runApiExtension.mockImplementation(async () => Response.json({ ok: true }));
  });

  it('delegates all calendar admin route variants to plugin extension runtime paths', async () => {
    const responses = await Promise.all([
      getCalendarRoot(new NextRequest('http://localhost:3000/api/admin/calendar')),
      postCalendarRoot(
        new NextRequest('http://localhost:3000/api/admin/calendar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Demo Calendar' }),
        })
      ),
      getCalendarById(new NextRequest('http://localhost:3000/api/admin/calendar/cal-1'), {
        params: Promise.resolve({ id: 'cal-1' }),
      }),
      putCalendarById(
        new NextRequest('http://localhost:3000/api/admin/calendar/cal-1', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Updated Calendar' }),
        }),
        { params: Promise.resolve({ id: 'cal-1' }) }
      ),
      deleteCalendarById(
        new NextRequest('http://localhost:3000/api/admin/calendar/cal-1', { method: 'DELETE' }),
        { params: Promise.resolve({ id: 'cal-1' }) }
      ),
      getCalendarBlocks(new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/blocks'), {
        params: Promise.resolve({ id: 'cal-1' }),
      }),
      postCalendarBlocks(
        new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/blocks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'Block' }),
        }),
        { params: Promise.resolve({ id: 'cal-1' }) }
      ),
      putCalendarBlockById(
        new NextRequest('http://localhost:3000/api/admin/calendar/blocks/blk-1', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'Block' }),
        }),
        { params: Promise.resolve({ blockId: 'blk-1' }) }
      ),
      deleteCalendarBlockById(
        new NextRequest('http://localhost:3000/api/admin/calendar/blocks/blk-1', {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ blockId: 'blk-1' }) }
      ),
      getEventTypes(new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/event-types'), {
        params: Promise.resolve({ id: 'cal-1' }),
      }),
      postEventTypes(
        new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/event-types', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Consult', durationMinutes: 30, locationType: 'custom' }),
        }),
        { params: Promise.resolve({ id: 'cal-1' }) }
      ),
      putEventTypeById(
        new NextRequest('http://localhost:3000/api/admin/calendar/event-types/evt-1', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Consult', durationMinutes: 30, locationType: 'custom' }),
        }),
        { params: Promise.resolve({ eventTypeId: 'evt-1' }) }
      ),
      deleteEventTypeById(
        new NextRequest('http://localhost:3000/api/admin/calendar/event-types/evt-1', {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ eventTypeId: 'evt-1' }) }
      ),
    ]);

    expect(runApiExtension).toHaveBeenNthCalledWith(1, 'GET', expect.any(NextRequest), [
      'admin',
      'calendar',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(2, 'POST', expect.any(NextRequest), [
      'admin',
      'calendar',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(3, 'GET', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(4, 'PUT', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(5, 'DELETE', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(6, 'GET', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
      'blocks',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(7, 'POST', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
      'blocks',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(8, 'PUT', expect.any(NextRequest), [
      'admin',
      'calendar',
      'blocks',
      'blk-1',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(9, 'DELETE', expect.any(NextRequest), [
      'admin',
      'calendar',
      'blocks',
      'blk-1',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(10, 'GET', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
      'event-types',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(11, 'POST', expect.any(NextRequest), [
      'admin',
      'calendar',
      'cal-1',
      'event-types',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(12, 'PUT', expect.any(NextRequest), [
      'admin',
      'calendar',
      'event-types',
      'evt-1',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(13, 'DELETE', expect.any(NextRequest), [
      'admin',
      'calendar',
      'event-types',
      'evt-1',
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    }
  });

  it('returns not found when delegated route has no extension match', async () => {
    runApiExtension.mockResolvedValueOnce(null);

    const response = await getCalendarRoot(
      new NextRequest('http://localhost:3000/api/admin/calendar')
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });
});
