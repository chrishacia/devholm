'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  IconButton,
  Avatar,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Paper,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Person as PersonIcon,
  Dashboard as DashboardIcon,
  Article as ArticleIcon,
  Inbox as InboxIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Logout as LogoutIcon,
  Login as LoginIcon,
} from '@mui/icons-material';
import Link from '@/components/common/Link';

interface AvatarMenuProps {
  isLoggedIn: boolean;
  user?: {
    displayName?: string | null;
    avatarUrl?: string | null;
    email: string;
  } | null;
  onLogout?: () => void;
}

export function AvatarMenu({ isLoggedIn, user, onLogout }: AvatarMenuProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl((current) => (current ? null : event.currentTarget));
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        handleClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleLogout = () => {
    handleClose();
    onLogout?.();
  };

  const getInitials = () => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  const adminMenuItems = [
    { label: 'Dashboard', href: '/admin', icon: DashboardIcon },
    { label: 'Posts', href: '/admin/posts', icon: ArticleIcon },
    { label: 'Inbox', href: '/admin/inbox', icon: InboxIcon },
    { label: 'Media', href: '/admin/media', icon: PhotoLibraryIcon },
  ];

  return (
    <Box ref={containerRef} sx={{ position: 'relative' }}>
      <IconButton
        onClick={handleClick}
        aria-label={isLoggedIn ? 'Account menu' : 'Login'}
        aria-controls={open ? 'avatar-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        sx={{
          p: 0.25,
          width: 40,
          height: 40,
          border: `2px solid transparent`,
          transition: 'border-color 0.2s',
          '&:hover': {
            borderColor: alpha(theme.palette.primary.main, 0.5),
          },
        }}
      >
        <Avatar
          src={user?.avatarUrl || undefined}
          alt={user?.displayName || 'User avatar'}
          sx={{
            width: 32,
            height: 32,
            bgcolor: isLoggedIn ? theme.palette.primary.main : theme.palette.grey[500],
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          {isLoggedIn ? getInitials() : <PersonIcon />}
        </Avatar>
      </IconButton>

      {open ? (
        <Paper
          id="avatar-menu"
          elevation={3}
          role="menu"
          sx={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 200,
            overflow: 'hidden',
            zIndex: theme.zIndex.appBar + 1,
            '& .MuiMenuItem-root': {
              py: 1.5,
              px: 2,
            },
          }}
        >
          {isLoggedIn
            ? [
                <MenuItem key="user-info" disabled sx={{ opacity: '1 !important' }}>
                  <ListItemText
                    primary={user?.displayName || 'Admin'}
                    secondary={user?.email}
                    primaryTypographyProps={{ fontWeight: 600 }}
                  />
                </MenuItem>,
                <Divider key="divider-1" sx={{ my: 1 }} />,
                ...adminMenuItems.map((item) => (
                  <MenuItem key={item.href} component={Link} href={item.href} onClick={handleClose}>
                    <ListItemIcon>
                      <item.icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{item.label}</ListItemText>
                  </MenuItem>
                )),
                <Divider key="divider-2" sx={{ my: 1 }} />,
                <MenuItem key="logout" onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" color="error" />
                  </ListItemIcon>
                  <ListItemText primaryTypographyProps={{ color: 'error' }}>Logout</ListItemText>
                </MenuItem>,
              ]
            : [
                <MenuItem key="login" component={Link} href="/admin/login" onClick={handleClose}>
                  <ListItemIcon>
                    <LoginIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Login</ListItemText>
                </MenuItem>,
              ]}
        </Paper>
      ) : null}
    </Box>
  );
}
