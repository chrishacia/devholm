'use client';

import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  useTheme,
  useMediaQuery,
  alpha,
  Button,
  Tooltip,
} from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import Link from '@/components/common/Link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Logo, ThemeToggle, NotificationBell, AvatarMenu } from '@/components/common';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { mainNavigation as defaultMainNavigation } from '@/config';

interface HeaderProps {
  isLoggedIn?: boolean;
  user?: {
    displayName?: string | null;
    avatarUrl?: string | null;
    email: string;
  } | null;
  unreadCount?: number;
}

export function Header({ isLoggedIn = false, user = null, unreadCount = 0 }: HeaderProps) {
  const theme = useTheme();
  const pathname = usePathname();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { settings } = useSiteSettings();
  const mainNavigation = settings?.navigation.main ?? defaultMainNavigation;

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: '-9999px',
          zIndex: 9999,
          padding: 2,
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          '&:focus': {
            left: 0,
            top: 0,
          },
        }}
      >
        Skip to main content
      </Box>

      <AppBar position="sticky" elevation={0}>
        <Toolbar
          sx={{
            justifyContent: 'space-between',
            px: { xs: 2, md: 4 },
            minHeight: { xs: 64, md: 72 },
          }}
        >
          {/* Logo */}
          <Logo size={isMobile ? 'small' : 'medium'} />

          {/* Desktop Navigation */}
          {!isMobile && (
            <Box
              component="nav"
              aria-label="Main navigation"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {mainNavigation.map((item) => (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  sx={{
                    color: isActive(item.href)
                      ? theme.palette.primary.main
                      : theme.palette.text.primary,
                    fontWeight: isActive(item.href) ? 600 : 400,
                    position: 'relative',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      bottom: 4,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isActive(item.href) ? '60%' : '0%',
                      height: 2,
                      backgroundColor: theme.palette.primary.main,
                      transition: 'width 0.2s ease',
                      borderRadius: 1,
                    },
                    '&:hover::after': {
                      width: '60%',
                    },
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          )}

          {/* Right Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* Search Button - triggers Cmd+K dialog */}
            <Tooltip title="Search (⌘K)">
              <IconButton
                onClick={() => {
                  // Dispatch a keyboard event to trigger the search dialog
                  window.dispatchEvent(
                    new KeyboardEvent('keydown', {
                      key: 'k',
                      metaKey: true,
                      bubbles: true,
                    })
                  );
                }}
                color="inherit"
                aria-label="Search"
                sx={{
                  width: 40,
                  height: 40,
                  '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                }}
              >
                <SearchIcon />
              </IconButton>
            </Tooltip>
            <ThemeToggle />
            <NotificationBell isLoggedIn={isLoggedIn} unreadCount={unreadCount} />
            <AvatarMenu isLoggedIn={isLoggedIn} user={user} onLogout={handleLogout} />

            {/* Mobile Menu Toggle */}
            {isMobile && (
              <IconButton
                onClick={toggleMobileMenu}
                color="inherit"
                aria-label="Toggle menu"
                sx={{ ml: 1 }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile Navigation Drawer */}
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={toggleMobileMenu}
        PaperProps={{
          sx: {
            width: 280,
            pt: 2,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, mb: 2 }}>
          <IconButton onClick={toggleMobileMenu} aria-label="Close menu">
            <CloseIcon />
          </IconButton>
        </Box>

        <List component="nav" aria-label="Mobile navigation">
          {mainNavigation.map((item) => (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                component={Link}
                href={item.href}
                onClick={toggleMobileMenu}
                selected={isActive(item.href)}
                sx={{
                  py: 1.5,
                  px: 3,
                  '&.Mui-selected': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    borderRight: `3px solid ${theme.palette.primary.main}`,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.15),
                    },
                  },
                }}
              >
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: isActive(item.href) ? 600 : 400,
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
    </>
  );
}
