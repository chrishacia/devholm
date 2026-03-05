'use client';

import { ReactNode, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Avatar,
  Menu,
  MenuItem,
  alpha,
  Tooltip,
  useTheme,
  useMediaQuery,
  Skeleton,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Article,
  Inbox,
  Image as ImageIcon,
  Settings,
  Person,
  Logout,
  Home,
  ChevronLeft,
  DarkMode,
  LightMode,
  Analytics,
  Description,
  FolderOpen,
  Build,
} from '@mui/icons-material';
import Link from '@/components/common/Link';
import { useTheme as useAppTheme } from '@/theme/ThemeProvider';

// Type for profile data from API
interface ProfileData {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarUrls: {
    thumbnail?: string;
    small?: string;
    original?: string;
  };
}

const DRAWER_WIDTH = 260;
const DRAWER_WIDTH_COLLAPSED = 72;

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: <Dashboard /> },
  { label: 'Blog Posts', href: '/admin/posts', icon: <Article /> },
  { label: 'Projects', href: '/admin/projects', icon: <FolderOpen /> },
  { label: 'Resume', href: '/admin/resume', icon: <Description /> },
  { label: 'Uses', href: '/admin/uses', icon: <Build /> },
  { label: 'Messages', href: '/admin/inbox', icon: <Inbox /> },
  { label: 'Media', href: '/admin/media', icon: <ImageIcon /> },
  { label: 'Analytics', href: '/admin/analytics', icon: <Analytics /> },
  { label: 'Settings', href: '/admin/settings', icon: <Settings /> },
];

interface AdminLayoutClientProps {
  children: ReactNode;
}

export default function AdminLayoutClient({ children }: AdminLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mode, toggleTheme } = useAppTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Track when initial session check is complete to prevent flash on navigation
  useEffect(() => {
    if (status !== 'loading') {
      setInitialLoadComplete(true);
    }
  }, [status]);

  // Fetch profile data for avatar
  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/profile');
      if (response.ok) {
        const result = await response.json();
        setProfile(result.data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchProfile();
    }
  }, [status, fetchProfile]);

  // Login page doesn't need the admin shell
  const isLoginPage = pathname === '/admin/login';
  if (isLoginPage) {
    return <>{children}</>;
  }

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleMenuClose();
    await signOut({ redirect: false });
    router.push('/admin/login');
  };

  const drawerWidth = collapsed && !isMobile ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      {/* Drawer Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
          px: 2,
          py: 2,
          minHeight: 64,
        }}
      >
        {!collapsed || isMobile ? (
          <Typography
            variant="h6"
            component={Link}
            href="/admin"
            sx={{
              fontWeight: 700,
              textDecoration: 'none',
              color: 'primary.main',
            }}
          >
            Admin Panel
          </Typography>
        ) : null}
        {!isMobile && (
          <IconButton onClick={handleDrawerToggle} size="small">
            <ChevronLeft
              sx={{
                transform: collapsed ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </IconButton>
        )}
      </Box>

      <Divider />

      {/* Navigation */}
      <List sx={{ flex: 1, px: 1, py: 2 }}>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));

          return (
            <ListItem key={item.href} disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={collapsed && !isMobile ? item.label : ''} placement="right">
                <ListItemButton
                  component={Link}
                  href={item.href}
                  onClick={() => isMobile && setMobileOpen(false)}
                  sx={{
                    borderRadius: 2,
                    minHeight: 48,
                    justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                    px: collapsed && !isMobile ? 2 : 2.5,
                    bgcolor: isActive
                      ? (theme) => alpha(theme.palette.primary.main, 0.12)
                      : 'transparent',
                    '&:hover': {
                      bgcolor: isActive
                        ? (theme) => alpha(theme.palette.primary.main, 0.18)
                        : 'action.hover',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed && !isMobile ? 0 : 40,
                      color: isActive ? 'primary.main' : 'text.secondary',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {(!collapsed || isMobile) && (
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'primary.main' : 'text.primary',
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      {/* Footer */}
      <Box sx={{ p: 2 }}>
        <Tooltip title={collapsed && !isMobile ? 'Back to Site' : ''} placement="right">
          <ListItemButton
            component={Link}
            href="/"
            sx={{
              borderRadius: 2,
              justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
              px: collapsed && !isMobile ? 2 : 2.5,
            }}
          >
            <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 0 : 40 }}>
              <Home />
            </ListItemIcon>
            {(!collapsed || isMobile) && <ListItemText primary="Back to Site" />}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );

  // Loading state - only show on initial load, not on navigation
  if (status === 'loading' && !initialLoadComplete) {
    return (
      <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
        <Box sx={{ width: DRAWER_WIDTH, borderRight: 1, borderColor: 'divider' }}>
          <Box sx={{ p: 2 }}>
            <Skeleton variant="text" width={120} height={32} />
          </Box>
          <Divider />
          <Box sx={{ p: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} variant="rounded" height={48} sx={{ mb: 1 }} />
            ))}
          </Box>
        </Box>
        <Box sx={{ flex: 1, p: 3 }}>
          <Skeleton variant="rectangular" height={64} sx={{ mb: 3 }} />
          <Skeleton variant="rectangular" height={200} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          transition: 'width 0.2s, margin-left 0.2s',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' }, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flex: 1 }} />

          {/* Theme Toggle */}
          <Tooltip title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
            <IconButton onClick={toggleTheme} sx={{ mr: 1, color: 'text.secondary' }}>
              {mode === 'dark' ? <LightMode /> : <DarkMode />}
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          <Box
            onClick={handleMenuOpen}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              p: 0.5,
              borderRadius: 2,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Avatar
              src={profile?.avatarUrls?.thumbnail || profile?.avatarUrl || undefined}
              sx={{
                width: 36,
                height: 36,
                bgcolor: 'primary.main',
                fontSize: '0.9rem',
              }}
            >
              {profile?.displayName?.charAt(0).toUpperCase() ||
                session?.user?.name?.charAt(0).toUpperCase() ||
                'A'}
            </Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="body2" fontWeight={600}>
                {profile?.displayName || session?.user?.name || 'Admin'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {session?.user?.role || 'admin'}
              </Typography>
            </Box>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{ mt: 1 }}
          >
            <MenuItem component={Link} href="/admin/profile" onClick={handleMenuClose}>
              <ListItemIcon>
                <Person fontSize="small" />
              </ListItemIcon>
              Profile
            </MenuItem>
            <MenuItem component={Link} href="/admin/settings" onClick={handleMenuClose}>
              <ListItemIcon>
                <Settings fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleSignOut}>
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Sign Out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <Box
        component="nav"
        sx={{
          width: { md: drawerWidth },
          flexShrink: 0,
          transition: 'width 0.2s',
        }}
      >
        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: 1,
              borderColor: 'divider',
              transition: 'width 0.2s',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          maxWidth: '100%',
          bgcolor: 'background.default',
          minHeight: '100vh',
          transition: 'width 0.2s',
          overflowX: 'hidden',
        }}
      >
        <Toolbar /> {/* Spacer for fixed app bar */}
        {children}
      </Box>
    </Box>
  );
}
