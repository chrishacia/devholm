import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';
import { listPluginStates } from '@/db/plugins';
import AdminLayoutClient from './AdminLayoutClient';

export const metadata = {
  title: 'Admin Dashboard',
  robots: {
    index: false,
    follow: false,
  },
};

interface AdminLayoutProps {
  children: ReactNode;
}

type PluginAdminNavItem = {
  pluginId: string;
  href: string;
  label: string;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  let session = null;
  let pluginEnabledMap: Record<string, boolean> = {};
  let pluginNavItems: PluginAdminNavItem[] = [];
  try {
    session = await auth();
  } catch {
    // auth DB unavailable — force login route instead of rendering broken admin shell
  }

  // Middleware enforces auth/role protection for admin routes and explicitly
  // excludes /admin/login. Avoid redirecting here so login RSC requests don't
  // get trapped in a self-redirect loop.
  if (!session?.user) {
    return <>{children}</>;
  }

  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const hasAdminAccess =
    session?.user?.isAdmin === true ||
    session?.user?.role === 'admin' ||
    session?.user?.role === 'superadmin' ||
    roles.includes('admin') ||
    roles.includes('superadmin');

  if (!hasAdminAccess) {
    redirect('/');
  }

  try {
    const plugins = await listPluginStates();
    pluginEnabledMap = Object.fromEntries(plugins.map((plugin) => [plugin.id, plugin.isEnabled]));
    pluginNavItems = plugins
      .filter((plugin) => plugin.capabilities.navigation && plugin.adminSurface?.href)
      .map((plugin) => ({
        pluginId: plugin.id,
        href: plugin.adminSurface?.href ?? `/admin/${plugin.id}`,
        label: plugin.adminSurface?.label || plugin.name,
      }));
  } catch {
    pluginEnabledMap = {};
    pluginNavItems = [];
  }

  return (
    <SessionProvider session={session}>
      <AdminLayoutClient pluginEnabledMap={pluginEnabledMap} pluginNavItems={pluginNavItems}>
        {children}
      </AdminLayoutClient>
    </SessionProvider>
  );
}
