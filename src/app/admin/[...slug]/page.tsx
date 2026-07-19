import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAdminPageComponent,
  getAdminPageMetadata,
  resolveAdminPageExtension,
} from '@core/lib/extensions.server';
import { isPluginEnabled } from '@/db/plugins';

type Props = {
  params: Promise<{ slug: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return (await getAdminPageMetadata(slug)) ?? {};
}

export default async function AdminExtensionPage({ params }: Props) {
  const { slug } = await params;
  const extension = resolveAdminPageExtension(slug);
  const PageComponent = await getAdminPageComponent(slug);

  if (!PageComponent) {
    if (extension?.pluginId) {
      const enabled = await isPluginEnabled(extension.pluginId).catch(() => false);
      if (!enabled) {
        return (
          <main style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
            <h1 style={{ marginBottom: '0.75rem' }}>Plugin Page Disabled</h1>
            <p style={{ marginBottom: '0.5rem' }}>
              This admin page is currently disabled because plugin runtime is disabled.
            </p>
            <p style={{ marginBottom: '0.5rem' }}>
              <strong>Code:</strong> PLUGIN_DISABLED
            </p>
            <p style={{ marginBottom: '1rem' }}>
              Re-enable the plugin from <Link href="/admin/plugins">Plugin Management</Link> to
              access this page.
            </p>
          </main>
        );
      }
    }

    notFound();
  }

  return <PageComponent />;
}
