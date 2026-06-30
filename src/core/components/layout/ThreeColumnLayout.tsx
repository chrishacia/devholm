'use client';

import { ReactNode } from 'react';
import { Box, Container, useTheme, useMediaQuery, alpha } from '@mui/material';

interface ThreeColumnLayoutProps {
  leftSidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  showSidebars?: boolean;
}

export function ThreeColumnLayout({
  leftSidebar,
  rightSidebar,
  children,
  maxWidth = 'xl',
  showSidebars = true,
}: ThreeColumnLayoutProps) {
  const theme = useTheme();
  const isLargeScreen = useMediaQuery(theme.breakpoints.up('lg'));
  const isMediumScreen = useMediaQuery(theme.breakpoints.up('md'));

  // On mobile: full width content
  // On tablet: content only
  // On desktop: 3-column layout
  const showLeft = showSidebars && leftSidebar && isLargeScreen;
  const showRight = showSidebars && rightSidebar && isMediumScreen;

  return (
    <Container maxWidth={maxWidth} sx={{ py: { xs: 3, md: 4 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: showRight ? '1fr 280px' : '1fr',
            lg: showLeft && showRight ? '220px 1fr 280px' : showRight ? '1fr 280px' : '1fr',
          },
          gap: { xs: 3, md: 4 },
          alignItems: 'start',
        }}
      >
        {/* Left Sidebar */}
        {showLeft && (
          <Box
            component="aside"
            aria-label="Secondary navigation"
            sx={{
              position: 'sticky',
              top: 88, // Header height + padding
              maxHeight: 'calc(100vh - 104px)',
              overflowY: 'auto',
            }}
          >
            {leftSidebar}
          </Box>
        )}

        {/* Main Content */}
        <Box component="main" id="main-content" sx={{ minWidth: 0 }}>
          {children}
        </Box>

        {/* Right Sidebar */}
        {showRight && (
          <Box
            component="aside"
            aria-label="Complementary content"
            sx={{
              position: 'sticky',
              top: 88,
              maxHeight: 'calc(100vh - 104px)',
              overflowY: 'auto',
            }}
          >
            {rightSidebar}
          </Box>
        )}
      </Box>
    </Container>
  );
}

/**
 * Sidebar widget wrapper component
 */
interface SidebarWidgetProps {
  title?: string;
  children: ReactNode;
}

export function SidebarWidget({ title, children }: SidebarWidgetProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        mb: 4,
        p: 2.5,
        backgroundColor: theme.palette.background.paper,
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
      }}
    >
      {title && (
        <Box
          component="h3"
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: theme.palette.text.secondary,
            mb: 2,
            pb: 1.5,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          {title}
        </Box>
      )}
      {children}
    </Box>
  );
}
