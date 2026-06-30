import { getDb } from './index';
import { sanitizeUserInput, slugify } from '@/lib';

export interface CalendarCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mode: 'display' | 'booking';
  isPrivate: boolean;
  isEnabled: boolean;
  timezone: string;
  embedTitle: string | null;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarBlock {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  isPublic: boolean;
  allDay: boolean;
  displayColor: string | null;
  externalSource: string | null;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEventType {
  id: string;
  calendarId: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  locationType: string;
  locationValue: string | null;
  isActive: boolean;
  availabilityRules: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarBooking {
  id: string;
  calendarId: string;
  eventTypeId: string | null;
  status: string;
  name: string;
  email: string;
  title: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string | null;
  source: string;
  sourceIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CalendarCollectionInput {
  name: string;
  slug?: string;
  description?: string | null;
  mode: 'display' | 'booking';
  isPrivate: boolean;
  isEnabled: boolean;
  timezone: string;
  embedTitle?: string | null;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  ownerUserId?: string;
}

interface CalendarBlockInput {
  calendarId: string;
  title: string;
  description?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  isPublic: boolean;
  allDay: boolean;
  displayColor?: string | null;
}

interface EventTypeInput {
  calendarId: string;
  name: string;
  slug?: string;
  description?: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  locationType: string;
  locationValue?: string | null;
  isActive: boolean;
  availabilityRules?: unknown;
}

interface BookingInput {
  calendarId: string;
  eventTypeId?: string | null;
  name: string;
  email: string;
  title: string;
  notes?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  source: string;
  sourceIp?: string | null;
}

function mapCollection(row: Record<string, unknown>): CalendarCollection {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    mode: row.mode as 'display' | 'booking',
    isPrivate: Boolean(row.is_private),
    isEnabled: Boolean(row.is_enabled),
    timezone: row.timezone as string,
    embedTitle: (row.embed_title as string | null) ?? null,
    showInMainNav: Boolean(row.show_in_main_nav),
    showInFooterMain: Boolean(row.show_in_footer_main),
    showInFooterResources: Boolean(row.show_in_footer_resources),
    includeInSitemap: Boolean(row.include_in_sitemap),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapBlock(row: Record<string, unknown>): CalendarBlock {
  return {
    id: row.id as string,
    calendarId: row.calendar_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    startsAt: row.starts_at as Date,
    endsAt: row.ends_at as Date,
    isPublic: Boolean(row.is_public),
    allDay: Boolean(row.all_day),
    displayColor: (row.display_color as string | null) ?? null,
    externalSource: (row.external_source as string | null) ?? null,
    externalId: (row.external_id as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapEventType(row: Record<string, unknown>): CalendarEventType {
  return {
    id: row.id as string,
    calendarId: row.calendar_id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    durationMinutes: Number(row.duration_minutes),
    bufferBeforeMinutes: Number(row.buffer_before_minutes),
    bufferAfterMinutes: Number(row.buffer_after_minutes),
    locationType: row.location_type as string,
    locationValue: (row.location_value as string | null) ?? null,
    isActive: Boolean(row.is_active),
    availabilityRules: row.availability_rules,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapBooking(row: Record<string, unknown>): CalendarBooking {
  return {
    id: row.id as string,
    calendarId: row.calendar_id as string,
    eventTypeId: (row.event_type_id as string | null) ?? null,
    status: row.status as string,
    name: row.name as string,
    email: row.email as string,
    title: row.title as string,
    notes: (row.notes as string | null) ?? null,
    startsAt: row.starts_at as Date,
    endsAt: row.ends_at as Date,
    meetingUrl: (row.meeting_url as string | null) ?? null,
    source: row.source as string,
    sourceIp: (row.source_ip as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function normalizeCollectionInput(input: CalendarCollectionInput) {
  const cleanName = sanitizeUserInput(input.name).trim();
  const cleanSlug = slugify(sanitizeUserInput(input.slug || cleanName));

  return {
    name: cleanName,
    slug: cleanSlug,
    description: input.description ? sanitizeUserInput(input.description).trim() : null,
    mode: input.mode,
    is_private: input.isPrivate,
    is_enabled: input.isEnabled,
    timezone: sanitizeUserInput(input.timezone).trim() || 'UTC',
    embed_title: input.embedTitle ? sanitizeUserInput(input.embedTitle).trim() : null,
    show_in_main_nav: input.showInMainNav,
    show_in_footer_main: input.showInFooterMain,
    show_in_footer_resources: input.showInFooterResources,
    include_in_sitemap: input.includeInSitemap,
    owner_user_id: input.ownerUserId || null,
    updated_at: new Date(),
  };
}

export async function listCalendarCollections() {
  const rows = await getDb()('calendar_collections').select('*').orderBy('updated_at', 'desc');
  return rows.map(mapCollection);
}

export async function getCalendarCollectionById(id: string) {
  const row = await getDb()('calendar_collections').where('id', id).first();
  return row ? mapCollection(row) : null;
}

export async function getCalendarCollectionBySlug(slug: string, includePrivate = false) {
  let query = getDb()('calendar_collections').where('slug', slug).where('is_enabled', true);

  if (!includePrivate) {
    query = query.where('is_private', false);
  }

  const row = await query.first();
  return row ? mapCollection(row) : null;
}

export async function createCalendarCollection(input: CalendarCollectionInput) {
  const normalized = normalizeCollectionInput(input);
  const existing = await getDb()('calendar_collections').where('slug', normalized.slug).first();
  if (existing) {
    throw new Error('A calendar with this slug already exists');
  }

  const [created] = await getDb()('calendar_collections').insert(normalized).returning('*');
  return mapCollection(created);
}

export async function updateCalendarCollection(id: string, input: CalendarCollectionInput) {
  const existing = await getDb()('calendar_collections').where('id', id).first();
  if (!existing) return null;

  const normalized = normalizeCollectionInput(input);
  if (normalized.slug !== existing.slug) {
    const slugExists = await getDb()('calendar_collections')
      .where('slug', normalized.slug)
      .whereNot('id', id)
      .first();
    if (slugExists) {
      throw new Error('A calendar with this slug already exists');
    }
  }

  const [updated] = await getDb()('calendar_collections')
    .where('id', id)
    .update(normalized)
    .returning('*');
  return mapCollection(updated);
}

export async function deleteCalendarCollection(id: string) {
  return getDb()('calendar_collections').where('id', id).delete();
}

export async function listCalendarBlocks(
  calendarId: string,
  options?: { includePrivate?: boolean }
) {
  let query = getDb()('calendar_blocks')
    .where('calendar_id', calendarId)
    .orderBy('starts_at', 'asc');

  if (!options?.includePrivate) {
    query = query.where('is_public', true);
  }

  const rows = await query;
  return rows.map(mapBlock);
}

export async function createCalendarBlock(input: CalendarBlockInput) {
  const payload = {
    calendar_id: input.calendarId,
    title: sanitizeUserInput(input.title).trim(),
    description: input.description ? sanitizeUserInput(input.description).trim() : null,
    starts_at: new Date(input.startsAt),
    ends_at: new Date(input.endsAt),
    is_public: input.isPublic,
    all_day: input.allDay,
    display_color: input.displayColor ? sanitizeUserInput(input.displayColor).trim() : null,
    updated_at: new Date(),
  };

  const [created] = await getDb()('calendar_blocks').insert(payload).returning('*');
  return mapBlock(created);
}

export async function updateCalendarBlock(id: string, input: CalendarBlockInput) {
  const exists = await getDb()('calendar_blocks').where('id', id).first();
  if (!exists) return null;

  const [updated] = await getDb()('calendar_blocks')
    .where('id', id)
    .update({
      calendar_id: input.calendarId,
      title: sanitizeUserInput(input.title).trim(),
      description: input.description ? sanitizeUserInput(input.description).trim() : null,
      starts_at: new Date(input.startsAt),
      ends_at: new Date(input.endsAt),
      is_public: input.isPublic,
      all_day: input.allDay,
      display_color: input.displayColor ? sanitizeUserInput(input.displayColor).trim() : null,
      updated_at: new Date(),
    })
    .returning('*');

  return mapBlock(updated);
}

export async function deleteCalendarBlock(id: string) {
  return getDb()('calendar_blocks').where('id', id).delete();
}

export async function listCalendarEventTypes(calendarId: string, onlyActive = false) {
  let query = getDb()('calendar_event_types')
    .where('calendar_id', calendarId)
    .orderBy('name', 'asc');
  if (onlyActive) {
    query = query.where('is_active', true);
  }

  const rows = await query;
  return rows.map(mapEventType);
}

export async function createCalendarEventType(input: EventTypeInput) {
  const cleanName = sanitizeUserInput(input.name).trim();
  const cleanSlug = slugify(sanitizeUserInput(input.slug || cleanName));

  const exists = await getDb()('calendar_event_types')
    .where('calendar_id', input.calendarId)
    .where('slug', cleanSlug)
    .first();
  if (exists) {
    throw new Error('An event type with this slug already exists');
  }

  const [created] = await getDb()('calendar_event_types')
    .insert({
      calendar_id: input.calendarId,
      name: cleanName,
      slug: cleanSlug,
      description: input.description ? sanitizeUserInput(input.description).trim() : null,
      duration_minutes: input.durationMinutes,
      buffer_before_minutes: input.bufferBeforeMinutes,
      buffer_after_minutes: input.bufferAfterMinutes,
      location_type: sanitizeUserInput(input.locationType).trim(),
      location_value: input.locationValue ? sanitizeUserInput(input.locationValue).trim() : null,
      is_active: input.isActive,
      availability_rules: input.availabilityRules ?? [],
      updated_at: new Date(),
    })
    .returning('*');

  return mapEventType(created);
}

export async function updateCalendarEventType(id: string, input: EventTypeInput) {
  const exists = await getDb()('calendar_event_types').where('id', id).first();
  if (!exists) return null;

  const cleanName = sanitizeUserInput(input.name).trim();
  const cleanSlug = slugify(sanitizeUserInput(input.slug || cleanName));

  if (cleanSlug !== exists.slug) {
    const slugExists = await getDb()('calendar_event_types')
      .where('calendar_id', input.calendarId)
      .where('slug', cleanSlug)
      .whereNot('id', id)
      .first();
    if (slugExists) {
      throw new Error('An event type with this slug already exists');
    }
  }

  const [updated] = await getDb()('calendar_event_types')
    .where('id', id)
    .update({
      calendar_id: input.calendarId,
      name: cleanName,
      slug: cleanSlug,
      description: input.description ? sanitizeUserInput(input.description).trim() : null,
      duration_minutes: input.durationMinutes,
      buffer_before_minutes: input.bufferBeforeMinutes,
      buffer_after_minutes: input.bufferAfterMinutes,
      location_type: sanitizeUserInput(input.locationType).trim(),
      location_value: input.locationValue ? sanitizeUserInput(input.locationValue).trim() : null,
      is_active: input.isActive,
      availability_rules: input.availabilityRules ?? [],
      updated_at: new Date(),
    })
    .returning('*');

  return mapEventType(updated);
}

export async function deleteCalendarEventType(id: string) {
  return getDb()('calendar_event_types').where('id', id).delete();
}

export async function listCalendarBookings(calendarId: string, status?: string) {
  let query = getDb()('calendar_bookings')
    .where('calendar_id', calendarId)
    .orderBy('starts_at', 'asc');

  if (status) {
    query = query.where('status', status);
  }

  const rows = await query;
  return rows.map(mapBooking);
}

export async function createCalendarBooking(input: BookingInput) {
  const [created] = await getDb()('calendar_bookings')
    .insert({
      calendar_id: input.calendarId,
      event_type_id: input.eventTypeId || null,
      status: 'pending',
      name: sanitizeUserInput(input.name).trim(),
      email: sanitizeUserInput(input.email).trim().toLowerCase(),
      title: sanitizeUserInput(input.title).trim(),
      notes: input.notes ? sanitizeUserInput(input.notes).trim() : null,
      starts_at: new Date(input.startsAt),
      ends_at: new Date(input.endsAt),
      source: sanitizeUserInput(input.source).trim(),
      source_ip: input.sourceIp || null,
      updated_at: new Date(),
    })
    .returning('*');

  return mapBooking(created);
}

export async function updateCalendarBookingStatus(
  id: string,
  status: string,
  meetingUrl?: string | null
) {
  const [updated] = await getDb()('calendar_bookings')
    .where('id', id)
    .update({
      status: sanitizeUserInput(status).trim(),
      meeting_url: meetingUrl ? sanitizeUserInput(meetingUrl).trim() : null,
      updated_at: new Date(),
    })
    .returning('*');

  return updated ? mapBooking(updated) : null;
}

export async function listCalendarPublicNavigation() {
  const rows = await getDb()('calendar_collections')
    .select(
      'slug',
      'name',
      'embed_title',
      'show_in_main_nav',
      'show_in_footer_main',
      'show_in_footer_resources'
    )
    .where('is_enabled', true)
    .where('is_private', false)
    .orderBy('name', 'asc');

  const main: Array<{ label: string; href: string }> = [];
  const footerMain: Array<{ label: string; href: string }> = [];
  const footerResources: Array<{ label: string; href: string }> = [];

  for (const row of rows) {
    const label = ((row.embed_title as string | null) || (row.name as string)).trim();
    const href = `/calendar/${row.slug as string}`;
    const item = { label, href };

    if (row.show_in_main_nav) main.push(item);
    if (row.show_in_footer_main) footerMain.push(item);
    if (row.show_in_footer_resources) footerResources.push(item);
  }

  return { main, footerMain, footerResources };
}

export async function listCalendarSitemapEntries() {
  const rows = await getDb()('calendar_collections')
    .select('slug', 'updated_at')
    .where('is_enabled', true)
    .where('is_private', false)
    .where('include_in_sitemap', true);

  return rows.map((row) => ({
    path: `/calendar/${row.slug as string}`,
    lastModified: row.updated_at as Date,
  }));
}
