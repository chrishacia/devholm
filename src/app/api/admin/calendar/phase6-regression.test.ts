import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const listCalendarCollections = vi.hoisted(() => vi.fn());
const createCalendarCollection = vi.hoisted(() => vi.fn());
const getCalendarCollectionById = vi.hoisted(() => vi.fn());
const updateCalendarCollection = vi.hoisted(() => vi.fn());
const deleteCalendarCollection = vi.hoisted(() => vi.fn());
const listCalendarBlocks = vi.hoisted(() => vi.fn());
const createCalendarBlock = vi.hoisted(() => vi.fn());
const updateCalendarBlock = vi.hoisted(() => vi.fn());
const deleteCalendarBlock = vi.hoisted(() => vi.fn());
const listCalendarEventTypes = vi.hoisted(() => vi.fn());
const createCalendarEventType = vi.hoisted(() => vi.fn());
const updateCalendarEventType = vi.hoisted(() => vi.fn());
const deleteCalendarEventType = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/calendar', () => ({
  listCalendarCollections,
  createCalendarCollection,
  getCalendarCollectionById,
  updateCalendarCollection,
  deleteCalendarCollection,
  listCalendarBlocks,
  createCalendarBlock,
  updateCalendarBlock,
  deleteCalendarBlock,
  listCalendarEventTypes,
  createCalendarEventType,
  updateCalendarEventType,
  deleteCalendarEventType,
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

const adminToken = {
  id: 'admin-1',
  email: 'admin@example.com',
  roles: ['admin'],
};

describe('calendar phase 6 admin route regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue(adminToken);
    listCalendarCollections.mockResolvedValue([{ id: 'cal-1', slug: 'demo' }]);
    createCalendarCollection.mockResolvedValue({ id: 'cal-1', slug: 'demo' });
    getCalendarCollectionById.mockResolvedValue({ id: 'cal-1', slug: 'demo' });
    updateCalendarCollection.mockResolvedValue({ id: 'cal-1', slug: 'demo-updated' });
    deleteCalendarCollection.mockResolvedValue(1);
    listCalendarBlocks.mockResolvedValue([{ id: 'blk-1' }]);
    createCalendarBlock.mockResolvedValue({ id: 'blk-1' });
    updateCalendarBlock.mockResolvedValue({ id: 'blk-1' });
    deleteCalendarBlock.mockResolvedValue(1);
    listCalendarEventTypes.mockResolvedValue([{ id: 'evt-1' }]);
    createCalendarEventType.mockResolvedValue({ id: 'evt-1' });
    updateCalendarEventType.mockResolvedValue({ id: 'evt-1' });
    deleteCalendarEventType.mockResolvedValue(1);
  });

  it('keeps admin auth guard behavior unchanged across existing calendar admin handlers', async () => {
    verifyAdmin.mockResolvedValue(null);

    const rootGet = await getCalendarRoot(
      new NextRequest('http://localhost:3000/api/admin/calendar')
    );
    const rootPost = await postCalendarRoot(
      new NextRequest('http://localhost:3000/api/admin/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Calendar' }),
      })
    );

    const byIdGet = await getCalendarById(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1'),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );
    const byIdPut = await putCalendarById(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Calendar' }),
      }),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );
    const byIdDelete = await deleteCalendarById(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );

    const blocksGet = await getCalendarBlocks(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/blocks'),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );
    const blocksPost = await postCalendarBlocks(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Block',
          startsAt: '2026-07-10T10:00:00.000Z',
          endsAt: '2026-07-10T11:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );

    const blockPut = await putCalendarBlockById(
      new NextRequest('http://localhost:3000/api/admin/calendar/blocks/blk-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          calendarId: 'cal-1',
          title: 'Block',
          startsAt: '2026-07-10T10:00:00.000Z',
          endsAt: '2026-07-10T11:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ blockId: 'blk-1' }) }
    );
    const blockDelete = await deleteCalendarBlockById(
      new NextRequest('http://localhost:3000/api/admin/calendar/blocks/blk-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ blockId: 'blk-1' }) }
    );

    const eventGet = await getEventTypes(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/event-types'),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );
    const eventPost = await postEventTypes(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/event-types', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Consult', durationMinutes: 30, locationType: 'custom' }),
      }),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );

    const eventPut = await putEventTypeById(
      new NextRequest('http://localhost:3000/api/admin/calendar/event-types/evt-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          calendarId: 'cal-1',
          name: 'Consult',
          durationMinutes: 30,
          locationType: 'custom',
        }),
      }),
      { params: Promise.resolve({ eventTypeId: 'evt-1' }) }
    );
    const eventDelete = await deleteEventTypeById(
      new NextRequest('http://localhost:3000/api/admin/calendar/event-types/evt-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ eventTypeId: 'evt-1' }) }
    );

    const responses = [
      rootGet,
      rootPost,
      byIdGet,
      byIdPut,
      byIdDelete,
      blocksGet,
      blocksPost,
      blockPut,
      blockDelete,
      eventGet,
      eventPost,
      eventPut,
      eventDelete,
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    }
  });

  it('keeps authorized admin list behavior unchanged on root calendar route', async () => {
    const response = await getCalendarRoot(
      new NextRequest('http://localhost:3000/api/admin/calendar')
    );

    expect(response.status).toBe(200);
    expect(listCalendarCollections).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ calendars: [{ id: 'cal-1', slug: 'demo' }] });
  });

  it('keeps authorized event-type listing behavior unchanged', async () => {
    const response = await getEventTypes(
      new NextRequest('http://localhost:3000/api/admin/calendar/cal-1/event-types'),
      { params: Promise.resolve({ id: 'cal-1' }) }
    );

    expect(response.status).toBe(200);
    expect(listCalendarEventTypes).toHaveBeenCalledWith('cal-1', false);
    await expect(response.json()).resolves.toEqual({ eventTypes: [{ id: 'evt-1' }] });
  });
});
