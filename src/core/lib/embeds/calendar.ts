/**
 * Calendar embed extension
 *
 * Renders calendar collections as embedded sections in markdown content.
 * Supports both booking mode (event types) and display mode (upcoming blocks).
 */

import type { EmbedExtensionConfig } from '@core/types/extensions.server';
import {
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarEventTypes,
} from '@/db/calendar';
import { isPluginEnabled } from '@/db/plugins';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function renderCalendarEmbed(slug: string) {
  if (!(await isPluginEnabled('calendar').catch(() => false))) {
    return `<div class="embed-error">Calendar '${escapeHtml(slug)}' is unavailable.</div>`;
  }

  const calendar = await getCalendarCollectionBySlug(slug, false);
  if (!calendar || !calendar.isEnabled || calendar.isPrivate) {
    return `<div class="embed-error">Calendar '${escapeHtml(slug)}' is unavailable.</div>`;
  }

  const [blocks, eventTypes] = await Promise.all([
    listCalendarBlocks(calendar.id, { includePrivate: false }),
    listCalendarEventTypes(calendar.id, true),
  ]);

  const upcoming = blocks.filter((block) => new Date(block.endsAt).getTime() >= Date.now());

  if (calendar.mode === 'booking') {
    const eventTypesHtml = eventTypes
      .map(
        (type) =>
          `<li><strong>${escapeHtml(type.name)}</strong> - ${type.durationMinutes} min${
            type.description ? ` <span>${escapeHtml(type.description)}</span>` : ''
          }</li>`
      )
      .join('');

    return `<section class="devholm-embed devholm-calendar-embed" data-calendar="${escapeHtml(slug)}">
      <header>
        <h3>${escapeHtml(calendar.embedTitle || calendar.name)}</h3>
        ${calendar.description ? `<p>${escapeHtml(calendar.description)}</p>` : ''}
      </header>
      <div class="calendar-booking-list">
        <h4>Available session types</h4>
        <ul>${eventTypesHtml || '<li>No active booking types configured yet.</li>'}</ul>
      </div>
    </section>`;
  }

  const blocksHtml = upcoming
    .slice(0, 20)
    .map(
      (block) => `<li>
        <strong>${escapeHtml(block.title)}</strong>
        <span>${escapeHtml(formatDateTime(block.startsAt))} - ${escapeHtml(
          formatDateTime(block.endsAt)
        )}</span>
        ${block.description ? `<p>${escapeHtml(block.description)}</p>` : ''}
      </li>`
    )
    .join('');

  return `<section class="devholm-embed devholm-calendar-embed" data-calendar="${escapeHtml(slug)}">
    <header>
      <h3>${escapeHtml(calendar.embedTitle || calendar.name)}</h3>
      ${calendar.description ? `<p>${escapeHtml(calendar.description)}</p>` : ''}
    </header>
    <ul class="calendar-display-list">${blocksHtml || '<li>No upcoming entries.</li>'}</ul>
  </section>`;
}

/**
 * Calendar collection embed
 *
 * Pattern: /^\[calendar\s+([^\]]+)\]$/
 * Example: [calendar slug="my-calendar"]
 */
export const calendarEmbeds: EmbedExtensionConfig[] = [
  {
    id: 'calendar-embed',
    pattern: /^\[calendar\s+([^\]]+)\]$/,
    render: async (match) => {
      // Parse attributes from shortcode
      const attrs: Record<string, string> = {};
      const regex = /(\w+)="([^"]*)"/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = regex.exec(match[1])) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }

      const slug = attrs.slug;
      if (!slug) {
        return '<div class="embed-error">Calendar shortcode missing slug.</div>';
      }

      return renderCalendarEmbed(slug);
    },
  },
];
