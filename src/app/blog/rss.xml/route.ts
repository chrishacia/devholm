import { NextResponse } from 'next/server';
import { app } from '@/config/env';

// RSS Feed configuration from centralized env
const SITE_URL = app.url;
const SITE_NAME = app.name;
const SITE_DESCRIPTION = app.description;

// Mock posts data - will be replaced with real database query
const mockPosts = [
  {
    slug: 'building-modern-personal-website-nextjs',
    title: 'Building a Modern Personal Website with Next.js',
    excerpt:
      'A deep dive into creating a performant, accessible, and beautiful personal website using Next.js 14 and MUI.',
    publishedAt: new Date('2024-01-15'),
  },
  {
    slug: 'art-of-writing-clean-typescript',
    title: 'The Art of Writing Clean TypeScript',
    excerpt:
      'Best practices for writing maintainable, type-safe code that your future self will thank you for.',
    publishedAt: new Date('2024-01-10'),
  },
  {
    slug: 'devops-for-developers',
    title: 'DevOps for Developers: A Practical Guide',
    excerpt:
      'Understanding CI/CD, containerization, and cloud deployment without becoming a full-time DevOps engineer.',
    publishedAt: new Date('2024-01-05'),
  },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date: Date): string {
  return date.toUTCString();
}

function generateRssFeed(): string {
  const items = mockPosts
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .map(
      (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <description>${escapeXml(post.excerpt)}</description>
      <pubDate>${formatDate(post.publishedAt)}</pubDate>
    </item>`
    )
    .join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${formatDate(new Date())}</lastBuildDate>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <generator>Next.js</generator>
    <image>
      <url>${SITE_URL}/logo.png</url>
      <title>${escapeXml(SITE_NAME)}</title>
      <link>${SITE_URL}</link>
    </image>${items}
  </channel>
</rss>`;

  return rss.trim();
}

export async function GET() {
  const feed = generateRssFeed();

  return new NextResponse(feed, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
