import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';
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

export default async function AdminLayout({ children }: AdminLayoutProps) {
  let session = null;
  try {
    session = await auth();
  } catch {
    // auth DB unavailable — force login route instead of rendering broken admin shell
  }

  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const hasAdminAccess =
    session?.user?.isAdmin === true ||
    session?.user?.role === 'admin' ||
    session?.user?.role === 'superadmin' ||
    roles.includes('admin') ||
    roles.includes('superadmin');

  if (!session?.user) {
    redirect('/admin/login');
  }

  if (!hasAdminAccess) {
    redirect('/');
  }

  return (
    <SessionProvider session={session}>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </SessionProvider>
  );
}
