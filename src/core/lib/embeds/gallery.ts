/**
 * Gallery embed extension
 *
 * Renders gallery collections as embedded grids in markdown content.
 * Supports images, videos, and external media (YouTube, TikTok, etc.).
 */

import type { EmbedExtensionConfig } from '@core/types/extensions.server';
import { getGalleryCollectionBySlug, listGalleryItems } from '@/db/gallery';
import { isPluginEnabled } from '@/db/plugins';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  if (!(await isPluginEnabled('gallery').catch(() => false))) {
    return `<div class="embed-error">Gallery '${escapeHtml(slug)}' is unavailable.</div>`;
  }

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

/**
 * Gallery collection embed
 *
 * Pattern: /^\[gallery\s+([^\]]+)\]$/
 * Example: [gallery slug="my-gallery"]
 */
export const galleryEmbeds: EmbedExtensionConfig[] = [
  {
    id: 'gallery-embed',
    pattern: /^\[gallery\s+([^\]]+)\]$/,
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
        return '<div class="embed-error">Gallery shortcode missing slug.</div>';
      }

      return renderGalleryEmbed(slug);
    },
  },
];
