'use client';

import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Header } from './Header';
import { SubHeader } from './SubHeader';
import { Footer } from './Footer';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface MainLayoutProps {
  children: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  announcement?: {
    message: string;
    link?: string;
    linkText?: string;
  };
  isLoggedIn?: boolean;
  user?: {
    displayName?: string | null;
    avatarUrl?: string | null;
    email: string;
  } | null;
  unreadCount?: number;
}

export function MainLayout({
  children,
  breadcrumbs,
  announcement,
  isLoggedIn = false,
  user = null,
  unreadCount = 0,
}: MainLayoutProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <Header isLoggedIn={isLoggedIn} user={user} unreadCount={unreadCount} />

      <SubHeader breadcrumbs={breadcrumbs} announcement={announcement} />

      <Box component="div" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>

      <Footer />
    </Box>
  );
}
