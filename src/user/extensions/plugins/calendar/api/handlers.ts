import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createCalendarBlock,
  createCalendarBooking,
  createCalendarCollection,
  createCalendarEventType,
  deleteCalendarBlock,
  deleteCalendarCollection,
  deleteCalendarEventType,
  getCalendarCollectionById,
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarCollections,
  listCalendarEventTypes,
  updateCalendarBlock,
  updateCalendarCollection,
  updateCalendarEventType,
} from '@/db/calendar';
import { getClientIp } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';

const calendarSchema = z.object({
  name: z.string().min(2).max(180),
  slug: z.string().min(1).max(220).optional(),
  description: z.string().max(2000).nullable().optional(),
  mode: z.enum(['display', 'booking']).default('display'),
  isPrivate: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  timezone: z.string().min(2).max(100).default('UTC'),
  embedTitle: z.string().max(220).nullable().optional(),
  showInMainNav: z.boolean().default(false),
  showInFooterMain: z.boolean().default(false),
  showInFooterResources: z.boolean().default(false),
  includeInSitemap: z.boolean().default(false),
});

const blockSchema = z.object({
  title: z.string().min(2).max(220),
  description: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isPublic: z.boolean().default(false),
  allDay: z.boolean().default(false),
  displayColor: z.string().max(20).nullable().optional(),
});

const eventTypeSchema = z.object({
  name: z.string().min(2).max(180),
  slug: z.string().min(1).max(220).optional(),
  description: z.string().max(2000).nullable().optional(),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  bufferBeforeMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  bufferAfterMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  locationType: z.string().min(2).max(80).default('custom'),
  locationValue: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  availabilityRules: z.unknown().optional(),
});

const bookingSchema = z.object({
  eventTypeId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(180),
  email: z.string().email().max(255),
  title: z.string().min(3).max(220),
  notes: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function parseJson(request: Request): Promise<unknown> {
  return request.json();
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

async function requireAdmin(request: NextRequest): Promise<{ id: string } | null> {
  const token = await verifyAdmin(request);
  if (!token) {
    return null;
  }

  return { id: String(token.id) };
}

export async function handleCalendarPublicApi(
  method: string,
  request: NextRequest,
  segments: string[]
): Promise<Response> {
  const [slug, next] = segments;

  if (!slug) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  if (method === 'GET' && segments.length === 1) {
    try {
      const calendar = await getCalendarCollectionBySlug(slug, false);
      if (!calendar) {
        return json({ error: 'Calendar not found' }, { status: 404 });
      }

      const [blocks, eventTypes] = await Promise.all([
        listCalendarBlocks(calendar.id, { includePrivate: false }),
        listCalendarEventTypes(calendar.id, true),
      ]);

      return json({
        calendar,
        blocks,
        eventTypes,
      });
    } catch (error) {
      console.error('Failed to fetch public calendar:', error);
      return json({ error: 'Failed to fetch calendar' }, { status: 500 });
    }
  }

  if (method === 'POST' && next === 'bookings' && segments.length === 2) {
    try {
      const calendar = await getCalendarCollectionBySlug(slug, false);
      if (!calendar || calendar.mode !== 'booking') {
        return json({ error: 'Booking unavailable for this calendar' }, { status: 404 });
      }

      const body = await parseJson(request);
      const parsed = bookingSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
      }

      const start = new Date(parsed.data.startsAt);
      const end = new Date(parsed.data.endsAt);
      if (end.getTime() <= start.getTime()) {
        return json({ error: 'Invalid booking time range' }, { status: 400 });
      }

      const [blocks, eventTypes] = await Promise.all([
        listCalendarBlocks(calendar.id, { includePrivate: true }),
        listCalendarEventTypes(calendar.id, true),
      ]);

      const eventType = parsed.data.eventTypeId
        ? eventTypes.find((item) => item.id === parsed.data.eventTypeId)
        : null;

      if (parsed.data.eventTypeId && !eventType) {
        return json({ error: 'Event type not found' }, { status: 400 });
      }

      const conflict = blocks.some((block) =>
        overlaps(start, end, new Date(block.startsAt), new Date(block.endsAt))
      );
      if (conflict) {
        return json({ error: 'Requested slot is unavailable' }, { status: 409 });
      }

      const created = await createCalendarBooking({
        calendarId: calendar.id,
        eventTypeId: parsed.data.eventTypeId || null,
        name: parsed.data.name,
        email: parsed.data.email,
        title: parsed.data.title,
        notes: parsed.data.notes || null,
        startsAt: start,
        endsAt: end,
        source: 'public',
        sourceIp: getClientIp(request),
      });

      return json({ booking: created }, { status: 201 });
    } catch (error) {
      console.error('Failed to create booking:', error);
      return json({ error: 'Failed to create booking' }, { status: 500 });
    }
  }

  return json({ error: 'Not found' }, { status: 404 });
}

export async function handleCalendarAdminApi(
  method: string,
  request: NextRequest,
  segments: string[]
): Promise<Response> {
  const admin = await requireAdmin(request);
  if (!admin) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [first, second, third] = segments;

  if (segments.length === 0) {
    if (method === 'GET') {
      try {
        const calendars = await listCalendarCollections();
        return json({ calendars });
      } catch (error) {
        console.error('Failed to list calendars:', error);
        return json({ error: 'Failed to fetch calendars' }, { status: 500 });
      }
    }

    if (method === 'POST') {
      try {
        const body = await parseJson(request);
        const parsed = calendarSchema.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: 'Invalid payload', details: parsed.error.flatten() },
            { status: 400 }
          );
        }

        const created = await createCalendarCollection({
          ...parsed.data,
          ownerUserId: admin.id,
        });
        return json(created, { status: 201 });
      } catch (error) {
        console.error('Failed to create calendar:', error);
        const message = error instanceof Error ? error.message : 'Failed to create calendar';
        return json({ error: message }, { status: message.includes('exists') ? 400 : 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (first === 'blocks' && second && !third) {
    if (method === 'PUT') {
      try {
        const body = await parseJson(request);
        const parsed = blockSchema.extend({ calendarId: z.string().uuid() }).safeParse(body);
        if (!parsed.success) {
          return json(
            { error: 'Invalid payload', details: parsed.error.flatten() },
            { status: 400 }
          );
        }

        const updated = await updateCalendarBlock(second, parsed.data);
        if (!updated) {
          return json({ error: 'Calendar block not found' }, { status: 404 });
        }

        return json(updated);
      } catch (error) {
        console.error('Failed to update calendar block:', error);
        return json({ error: 'Failed to update calendar block' }, { status: 500 });
      }
    }

    if (method === 'DELETE') {
      try {
        const deleted = await deleteCalendarBlock(second);
        if (!deleted) {
          return json({ error: 'Calendar block not found' }, { status: 404 });
        }

        return json({ success: true });
      } catch (error) {
        console.error('Failed to delete calendar block:', error);
        return json({ error: 'Failed to delete calendar block' }, { status: 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (first === 'event-types' && second && !third) {
    if (method === 'PUT') {
      try {
        const body = await parseJson(request);
        const parsed = eventTypeSchema.extend({ calendarId: z.string().uuid() }).safeParse(body);
        if (!parsed.success) {
          return json(
            { error: 'Invalid payload', details: parsed.error.flatten() },
            { status: 400 }
          );
        }

        const updated = await updateCalendarEventType(second, parsed.data);
        if (!updated) {
          return json({ error: 'Event type not found' }, { status: 404 });
        }

        return json(updated);
      } catch (error) {
        console.error('Failed to update event type:', error);
        const message = error instanceof Error ? error.message : 'Failed to update event type';
        return json({ error: message }, { status: message.includes('exists') ? 400 : 500 });
      }
    }

    if (method === 'DELETE') {
      try {
        const deleted = await deleteCalendarEventType(second);
        if (!deleted) {
          return json({ error: 'Event type not found' }, { status: 404 });
        }

        return json({ success: true });
      } catch (error) {
        console.error('Failed to delete event type:', error);
        return json({ error: 'Failed to delete event type' }, { status: 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!first) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  if (second === 'blocks' && !third) {
    if (method === 'GET') {
      try {
        const blocks = await listCalendarBlocks(first, { includePrivate: true });
        return json({ blocks });
      } catch (error) {
        console.error('Failed to list calendar blocks:', error);
        return json({ error: 'Failed to fetch calendar blocks' }, { status: 500 });
      }
    }

    if (method === 'POST') {
      try {
        const body = await parseJson(request);
        const parsed = blockSchema.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: 'Invalid payload', details: parsed.error.flatten() },
            { status: 400 }
          );
        }

        const created = await createCalendarBlock({ calendarId: first, ...parsed.data });
        return json(created, { status: 201 });
      } catch (error) {
        console.error('Failed to create calendar block:', error);
        return json({ error: 'Failed to create calendar block' }, { status: 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (second === 'event-types' && !third) {
    if (method === 'GET') {
      try {
        const eventTypes = await listCalendarEventTypes(first, false);
        return json({ eventTypes });
      } catch (error) {
        console.error('Failed to list event types:', error);
        return json({ error: 'Failed to fetch event types' }, { status: 500 });
      }
    }

    if (method === 'POST') {
      try {
        const body = await parseJson(request);
        const parsed = eventTypeSchema.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: 'Invalid payload', details: parsed.error.flatten() },
            { status: 400 }
          );
        }

        const created = await createCalendarEventType({ ...parsed.data, calendarId: first });
        return json(created, { status: 201 });
      } catch (error) {
        console.error('Failed to create event type:', error);
        const message = error instanceof Error ? error.message : 'Failed to create event type';
        return json({ error: message }, { status: message.includes('exists') ? 400 : 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!second) {
    if (method === 'GET') {
      try {
        const calendar = await getCalendarCollectionById(first);
        if (!calendar) {
          return json({ error: 'Calendar not found' }, { status: 404 });
        }

        return json(calendar);
      } catch (error) {
        console.error('Failed to fetch calendar:', error);
        return json({ error: 'Failed to fetch calendar' }, { status: 500 });
      }
    }

    if (method === 'PUT') {
      try {
        const body = await parseJson(request);
        const parsed = calendarSchema.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: 'Invalid payload', details: parsed.error.flatten() },
            { status: 400 }
          );
        }

        const updated = await updateCalendarCollection(first, parsed.data);
        if (!updated) {
          return json({ error: 'Calendar not found' }, { status: 404 });
        }

        return json(updated);
      } catch (error) {
        console.error('Failed to update calendar:', error);
        const message = error instanceof Error ? error.message : 'Failed to update calendar';
        return json({ error: message }, { status: message.includes('exists') ? 400 : 500 });
      }
    }

    if (method === 'DELETE') {
      try {
        const deleted = await deleteCalendarCollection(first);
        if (!deleted) {
          return json({ error: 'Calendar not found' }, { status: 404 });
        }

        return json({ success: true });
      } catch (error) {
        console.error('Failed to delete calendar:', error);
        return json({ error: 'Failed to delete calendar' }, { status: 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  return json({ error: 'Not found' }, { status: 404 });
}
