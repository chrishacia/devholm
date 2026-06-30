import type { Metadata } from 'next';
import { siteConfig } from '@/config';

export const metadata: Metadata = {
  title: 'About',
  description: `Learn more about ${siteConfig.name} - a full stack developer passionate about building modern web applications with React, Next.js, TypeScript, and Node.js.`,
  openGraph: {
    title: `About | ${siteConfig.name}`,
    description:
      'Learn more about the developer behind this site and their passion for building modern web applications.',
    type: 'profile',
  },
  twitter: {
    card: 'summary_large_image',
    title: `About | ${siteConfig.name}`,
    description: 'Full stack developer passionate about building modern web applications.',
  },
};

export { default } from './page';
