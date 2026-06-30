import { SiteConfig } from '@/types';
import { app, author, social } from './env';

// Note: These are build-time defaults. Runtime values come from the database
// via useSiteSettings hook. Keep personal info in .env (gitignored), not here.
export const siteConfig: SiteConfig = {
  name: app.name,
  description: app.description,
  url: app.url,
  author: {
    name: author.name,
    email: author.email,
    url: author.url,
  },
  social,
};

// Navigation configuration
export const mainNavigation = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Uses', href: '/uses' },
  { label: 'Contact', href: '/contact' },
];

export const footerNavigation = {
  main: [
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: 'About', href: '/about' },
    { label: 'Projects', href: '/projects' },
  ],
  resources: [
    { label: 'Resume', href: '/resume' },
    { label: 'Uses', href: '/uses' },
    { label: 'Now', href: '/now' },
    { label: 'RSS', href: '/rss.xml' },
  ],
};

// SEO defaults - customize these for your site
export const defaultSeoConfig = {
  titleTemplate: '%s | My Site',
  defaultTitle: 'My Site - Personal Website',
  description:
    'A personal website and blog built with Next.js. Customize this description in your site config.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'My Site',
  },
  twitter: {
    handle: '',
    site: '',
    cardType: 'summary_large_image',
  },
};
