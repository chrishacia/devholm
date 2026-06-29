import { parseMarkdown } from './markdown';
import {
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarEventTypes,
} from '@/db/calendar';
import { getGalleryCollectionBySlug, listGalleryItems } from '@/db/gallery';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseShortcodeAttributes(raw: string) {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
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

function renderGalleryExternalItem(url: string, provider: string | null) {
  const safeUrl = escapeHtml(url);
  if (provider === 'youtube') {
    return `<iframe src="${safeUrl}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }

  if (provider === 'tiktok') {
    return `<blockquote class="tiktok-embed"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">TikTok</a></blockquote>`;
  }

  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open external media</a>`;
}

async function renderGalleryEmbed(slug: string) {
  const gallery = await getGalleryCollectionBySlug(slug, false);
  if (!gallery || !gallery.isEnabled || gallery.isPrivate) {
    return `<div class="embed-error">Gallery '${escapeHtml(slug)}' is unavailable.</div>`;
  }

  const items = (await listGalleryItems(gallery.id, true)).slice(0, 100);

  const itemsHtml = items
    .map((item) => {
      if (item.kind === 'media' && item.media?.publicUrl) {
        const isImage = item.media.mimeType.startsWith('image/');
        const isVideo = item.media.mimeType.startsWith('video/');

        if (isImage) {
          return `<figure>
            <img src="${escapeHtml(item.media.publicUrl)}" alt="${escapeHtml(
              item.media.altText || item.title || item.media.filename
            )}" loading="lazy" />
            ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}
          </figure>`;
        }

        if (isVideo) {
          return `<figure>
            <video controls preload="metadata" src="${escapeHtml(item.media.publicUrl)}"></video>
            ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}
          </figure>`;
        }

        return `<figure>
          <a href="${escapeHtml(item.media.publicUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            item.title || item.media.filename
          )}</a>
          ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}
        </figure>`;
      }

      if (item.kind === 'external' && item.externalUrl) {
        return `<figure>
          ${renderGalleryExternalItem(item.externalUrl, item.externalProvider)}
          ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}
        </figure>`;
      }

      return '';
    })
    .filter(Boolean)
    .join('');

  return `<section class="devholm-embed devholm-gallery-embed" data-gallery="${escapeHtml(slug)}" data-layout="${escapeHtml(
    gallery.layout
  )}">
    <header>
      <h3>${escapeHtml(gallery.name)}</h3>
      ${gallery.description ? `<p>${escapeHtml(gallery.description)}</p>` : ''}
    </header>
    <div class="gallery-grid">${itemsHtml || '<p>No media items yet.</p>'}</div>
  </section>`;
}

export async function parseMarkdownWithEmbeds(content: string) {
  const calendarRegex = /\[calendar\s+([^\]]+)\]/g;
  const galleryRegex = /\[gallery\s+([^\]]+)\]/g;

  let transformed = content;

  const calendarMatches = [...content.matchAll(calendarRegex)];
  for (const match of calendarMatches) {
    const attrs = parseShortcodeAttributes(match[1]);
    const slug = attrs.slug;
    const html = slug
      ? await renderCalendarEmbed(slug)
      : '<div class="embed-error">Calendar shortcode missing slug.</div>';
    transformed = transformed.replace(match[0], html);
  }

  const galleryMatches = [...transformed.matchAll(galleryRegex)];
  for (const match of galleryMatches) {
    const attrs = parseShortcodeAttributes(match[1]);
    const slug = attrs.slug;
    const html = slug
      ? await renderGalleryEmbed(slug)
      : '<div class="embed-error">Gallery shortcode missing slug.</div>';
    transformed = transformed.replace(match[0], html);
  }

  return parseMarkdown(transformed);
}
