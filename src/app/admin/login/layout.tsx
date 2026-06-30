import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

interface LoginLayoutProps {
  children: ReactNode;
}

export default async function LoginLayout({ children }: LoginLayoutProps) {
  try {
    const session = await auth();
    if (session?.user?.isAdmin) {
      redirect('/admin');
    }
  } catch {
    // auth DB unavailable — still render the login page
  }

  return <>{children}</>;
}
