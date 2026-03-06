import type { Metadata } from 'next';
import ContactPageClient from './ContactPageClient';
import { siteConfig } from '@/config';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    "Get in touch. Whether you have a project idea, job opportunity, or just want to say hello - I'd love to hear from you.",
  openGraph: {
    title: `Contact | ${siteConfig.name}`,
    description: 'Get in touch for projects, opportunities, or just to say hello.',
    url: `${siteConfig.url}/contact`,
  },
  twitter: {
    card: 'summary_large_image',
    title: `Contact | ${siteConfig.name}`,
    description: 'Get in touch for projects, opportunities, or just to say hello.',
  },
  alternates: {
    canonical: `${siteConfig.url}/contact`,
  },
};

export default async function ContactPage() {
  const settings = await fetchSiteSettings();

  return <ContactPageClient settings={settings} />;
}
