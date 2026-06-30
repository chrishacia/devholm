import type { Metadata } from 'next';
import config from '@config';
import { DEFAULT_NOW_CONTENT } from '@core/views/now/defaults';
import NowView from '@core/views/now/NowView';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'Now',
    description:
      "What I'm currently working on, learning, and focusing on. A now page inspired by Derek Sivers.",
    path: '/now',
  });
}

export default function NowPage() {
  const content = config.content?.now ?? DEFAULT_NOW_CONTENT;
  return (
    <>
      <SeoExtensionJsonLd path="/now" />
      <NowView content={content} />
    </>
  );
}
