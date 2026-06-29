import { marked, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { slugify } from './utils';
import { siteConfig } from '@/config';

// Create custom renderer
const renderer = new Renderer();

// Override heading to add IDs for anchor links
renderer.heading = function (text: string, level: number): string {
  const escapedText = slugify(text);
  return `<h${level} id="${escapedText}">
    <a href="#${escapedText}" class="heading-anchor" aria-label="Link to ${text}">#</a>
    ${text}
  </h${level}>`;
};

// Get the domain from siteConfig for external link detection
const siteDomain = new URL(siteConfig.url).hostname;

// Override link to add target="_blank" for external links
renderer.link = function (href: string, title: string | null, text: string): string {
  const isExternal = href?.startsWith('http') && !href.includes(siteDomain);
  const titleAttr = title ? ` title="${title}"` : '';
  const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`;
};

// Override image to wrap in figure
renderer.image = function (href: string, title: string | null, text: string): string {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<figure class="image-figure">
    <img src="${href}" alt="${text || ''}"${titleAttr} loading="lazy" />
    ${title ? `<figcaption>${title}</figcaption>` : ''}
  </figure>`;
};

// Configure marked options
marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
});

// Sanitize HTML options
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'section',
    'header',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'p',
    'a',
    'ul',
    'ol',
    'li',
    'b',
    'i',
    'strong',
    'em',
    'strike',
    'code',
    'hr',
    'br',
    'div',
    'table',
    'thead',
    'caption',
    'tbody',
    'tr',
    'th',
    'td',
    'pre',
    'img',
    'figure',
    'figcaption',
    'span',
    'del',
    'sup',
    'sub',
    'video',
    'source',
    'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    iframe: ['src', 'loading', 'allowfullscreen', 'referrerpolicy', 'title'],
    video: ['controls', 'preload', 'src', 'poster'],
    source: ['src', 'type'],
    img: ['src', 'alt', 'title', 'loading', 'width', 'height'],
    '*': ['class', 'id', 'aria-label', 'data-calendar', 'data-gallery', 'data-layout'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    div: ['class'],
  },
  allowedClasses: {
    code: ['language-*', 'hljs'],
    pre: ['language-*', 'hljs'],
    '*': [
      'heading-anchor',
      'image-figure',
      'devholm-embed',
      'devholm-calendar-embed',
      'devholm-gallery-embed',
      'calendar-booking-list',
      'calendar-display-list',
      'gallery-grid',
      'embed-error',
      'tiktok-embed',
    ],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  selfClosing: ['img', 'br', 'hr'],
};

/**
 * Parse markdown to HTML and sanitize
 */
export function parseMarkdown(markdown: string): string {
  const html = marked.parse(markdown);
  if (typeof html !== 'string') {
    throw new Error('Unexpected non-string result from marked.parse');
  }
  return sanitizeHtml(html, sanitizeOptions);
}

/**
 * Parse markdown without sanitization (for trusted content only)
 */
export function parseMarkdownUnsafe(markdown: string): string {
  const html = marked.parse(markdown);
  if (typeof html !== 'string') {
    throw new Error('Unexpected non-string result from marked.parse');
  }
  return html;
}

/**
 * Sanitize HTML content
 */
export function sanitize(html: string): string {
  return sanitizeHtml(html, sanitizeOptions);
}

/**
 * Sanitize user input (more strict - for inbox messages etc.)
 */
export function sanitizeUserInput(text: string): string {
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/**
 * Extract excerpt from markdown
 */
export function extractExcerpt(markdown: string, maxLength = 160): string {
  // Remove markdown syntax
  const text = markdown
    .replace(/^#+\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\n+/g, ' ') // newlines
    .trim();

  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}
