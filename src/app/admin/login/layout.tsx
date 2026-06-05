import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

interface LoginLayoutProps {
  children: ReactNode;
}

export default async function LoginLayout({ children }: LoginLayoutProps) {
  // Check if already logged in
  const session = await auth();

  if (session?.user?.isAdmin) {
    redirect('/admin');
  }

  // Login page renders without the admin shell
  return <>{children}</>;
}
