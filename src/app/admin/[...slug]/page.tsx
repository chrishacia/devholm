import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminPageComponent, getAdminPageMetadata } from '@core/lib/extensions.server';

type Props = {
  params: Promise<{ slug: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return (await getAdminPageMetadata(slug)) ?? {};
}

export default async function AdminExtensionPage({ params }: Props) {
  const { slug } = await params;
  const PageComponent = await getAdminPageComponent(slug);

  if (!PageComponent) {
    notFound();
  }

  return <PageComponent />;
}
