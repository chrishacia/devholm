'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeContextProvider, useTheme } from '@/theme/ThemeProvider';
import { getTheme } from '@/theme/theme';
import SearchDialog from '@/components/common/SearchDialog';
import ClientErrorMonitor from '@/components/monitoring/ClientErrorMonitor';
import { SiteSettingsProvider } from '@/hooks/useSiteSettings';

interface ProvidersProps {
  children: ReactNode;
}

// Inner component that can use the theme context
function ThemeWrapper({ children }: { children: ReactNode }) {
  const { mode } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const showSearchDialog = !pathname?.startsWith('/admin');

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = getTheme(mode);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {/* Prevent flash by hiding content until mounted */}
      <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        <ClientErrorMonitor />
        {children}
        {showSearchDialog ? <SearchDialog /> : null}
      </div>
    </MuiThemeProvider>
  );
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <AppRouterCacheProvider options={{ enableCssLayer: true }}>
        <ThemeContextProvider defaultMode="dark">
          <SiteSettingsProvider>
            <ThemeWrapper>{children}</ThemeWrapper>
          </SiteSettingsProvider>
        </ThemeContextProvider>
      </AppRouterCacheProvider>
    </SessionProvider>
  );
}
