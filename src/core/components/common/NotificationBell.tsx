'use client';

import { useState } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Mail as MailIcon,
  Circle as CircleIcon,
} from '@mui/icons-material';
import Link from '@/components/common/Link';

interface Notification {
  id: string;
  type: 'inbox' | 'system';
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationBellProps {
  isLoggedIn: boolean;
  notifications?: Notification[];
  unreadCount?: number;
}

export function NotificationBell({
  isLoggedIn,
  notifications = [],
  unreadCount = 0,
}: NotificationBellProps) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoggedIn) {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const hasNotifications = unreadCount > 0;

  // If logged out and no notifications, don't render
  if (!isLoggedIn && !hasNotifications) {
    return null;
  }

  return (
    <>
      <IconButton
        onClick={handleClick}
        color="inherit"
        aria-label={
          isLoggedIn
            ? `Notifications${hasNotifications ? ` (${unreadCount} unread)` : ''}`
            : 'Notifications available'
        }
        sx={{
          position: 'relative',
          width: 40,
          height: 40,
          '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
        }}
      >
        <Badge
          variant={isLoggedIn ? 'standard' : 'dot'}
          badgeContent={isLoggedIn ? unreadCount : undefined}
          invisible={!hasNotifications}
          color="error"
          sx={{
            '& .MuiBadge-badge': {
              backgroundColor: theme.palette.error.main,
              color: theme.palette.error.contrastText,
            },
          }}
        >
          <NotificationsIcon />
        </Badge>
      </IconButton>

      {isLoggedIn && (
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          PaperProps={{
            sx: {
              width: 360,
              maxHeight: 400,
              overflow: 'hidden',
            },
          }}
        >
          <Box
            sx={{
              p: 2,
              borderBottom: `1px solid ${theme.palette.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="h6" component="h2">
              Notifications
            </Typography>
            {hasNotifications && (
              <Typography variant="caption" color="text.secondary">
                {unreadCount} unread
              </Typography>
            )}
          </Box>

          {notifications.length > 0 ? (
            <>
              <List sx={{ maxHeight: 280, overflow: 'auto' }}>
                {notifications.map((notification) => (
                  <ListItem
                    key={notification.id}
                    sx={{
                      backgroundColor: notification.read
                        ? 'transparent'
                        : alpha(theme.palette.primary.main, 0.05),
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {notification.type === 'inbox' ? (
                        <MailIcon color="primary" />
                      ) : (
                        <CircleIcon sx={{ fontSize: 12 }} color="primary" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={notification.title}
                      secondary={notification.message}
                      primaryTypographyProps={{
                        fontWeight: notification.read ? 400 : 600,
                      }}
                    />
                  </ListItem>
                ))}
              </List>
              <Divider />
              <Box sx={{ p: 1 }}>
                <Button
                  component={Link}
                  href="/admin/inbox"
                  fullWidth
                  size="small"
                  onClick={handleClose}
                >
                  View All Messages
                </Button>
              </Box>
            </>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <NotificationsIcon
                sx={{
                  fontSize: 48,
                  color: theme.palette.text.disabled,
                  mb: 1,
                  mx: 'auto',
                  display: 'block',
                }}
              />
              <Typography color="text.secondary">No notifications</Typography>
            </Box>
          )}
        </Popover>
      )}
    </>
  );
}
