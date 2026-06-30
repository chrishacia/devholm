import type { Metadata } from 'next';
import ContactView from '@core/views/contact/ContactView';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'Contact',
    description:
      "Get in touch. Whether you have a project idea, job opportunity, or just want to say hello - I'd love to hear from you.",
    path: '/contact',
  });
}

export default async function ContactPage() {
  const settings = await fetchSiteSettings();

  return (
    <>
      <SeoExtensionJsonLd path="/contact" />
      <ContactView settings={settings} />
    </>
  );
}
