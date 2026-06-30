'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TablePagination,
  Skeleton,
  Checkbox,
  Tooltip,
  alpha,
  Tabs,
  Tab,
  Badge,
  Drawer,
  Divider,
} from '@mui/material';
import {
  Search,
  Delete,
  MoreVert,
  Archive,
  MarkEmailRead,
  MarkEmailUnread,
  ReportProblem,
  Refresh,
  Close,
  Email,
  Person,
  Schedule,
  Reply,
  Restore,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';

// Message interface matching API response
interface Message {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  body: string;
  status: 'unread' | 'read' | 'archived' | 'deleted' | 'spam';
  createdAt: string;
  readAt: string | null;
}

interface MessageStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
  spam: number;
}

const statusColors: Record<string, 'error' | 'success' | 'default' | 'warning' | 'info'> = {
  unread: 'error',
  read: 'success',
  archived: 'default',
  deleted: 'info',
  spam: 'warning',
};

function LoadingSkeleton() {
  return (
    <TableBody>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell padding="checkbox">
            <Skeleton width={20} />
          </TableCell>
          <TableCell>
            <Skeleton width="80%" />
          </TableCell>
          <TableCell>
            <Skeleton width={80} />
          </TableCell>
          <TableCell>
            <Skeleton width={100} />
          </TableCell>
          <TableCell>
            <Skeleton width={40} />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<MessageStats>({
    total: 0,
    unread: 0,
    read: 0,
    archived: 0,
    spam: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalMessages, setTotalMessages] = useState(0);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingMessage, setViewingMessage] = useState<Message | null>(null);

  const tabs = [
    { label: 'All', status: 'all' },
    { label: 'Unread', status: 'unread' },
    { label: 'Read', status: 'read' },
    { label: 'Archived', status: 'archived' },
    { label: 'Spam', status: 'spam' },
    { label: 'Trash', status: 'deleted' },
  ];

  const currentStatus = tabs[selectedTab].status;

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page + 1),
        pageSize: String(rowsPerPage),
        ...(currentStatus !== 'all' && { status: currentStatus }),
      });

      const response = await fetch(`/api/admin/messages?${params}`);
      if (!response.ok) throw new Error('Failed to fetch messages');

      const data = await response.json();
      setMessages(data.messages || []);
      setTotalMessages(data.total || 0);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, currentStatus]);

  // Client-side search filtering
  const filteredMessages = search
    ? messages.filter((message) => {
        const searchLower = search.toLowerCase();
        return (
          message.name?.toLowerCase().includes(searchLower) ||
          message.email?.toLowerCase().includes(searchLower) ||
          message.subject?.toLowerCase().includes(searchLower) ||
          message.body.toLowerCase().includes(searchLower)
        );
      })
    : messages;

  const unreadCount = stats.unread;

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelected(filteredMessages.map((m) => m.id));
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, message: Message) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedMessage(message);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMessage(null);
  };

  const handleBulkAction = async (
    action: 'read' | 'unread' | 'archive' | 'spam' | 'delete' | 'restore'
  ) => {
    if (action === 'delete' && currentStatus !== 'deleted') {
      setDeleteDialogOpen(true);
      return;
    }

    try {
      const response = await fetch('/api/admin/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected, action }),
      });

      if (!response.ok) throw new Error('Failed to update messages');

      // Refresh the list
      await fetchMessages();
      setSelected([]);
    } catch (error) {
      console.error('Error updating messages:', error);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      // If we're in the Trash tab, permanently delete
      if (currentStatus === 'deleted') {
        const response = await fetch('/api/admin/messages', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected }),
        });
        if (!response.ok) throw new Error('Failed to delete messages');
      } else {
        // Soft delete - move to trash
        const response = await fetch('/api/admin/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected, action: 'delete' }),
        });
        if (!response.ok) throw new Error('Failed to move messages to trash');
      }

      await fetchMessages();
      setSelected([]);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting messages:', error);
    }
  };

  const handleRowClick = async (message: Message) => {
    setViewingMessage(message);
    setDrawerOpen(true);

    // Mark as read via API
    if (message.status === 'unread') {
      try {
        await fetch('/api/admin/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [message.id], action: 'read' }),
        });
        // Update local state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, status: 'read' as const, readAt: new Date().toISOString() }
              : m
          )
        );
        // Update stats
        setStats((prev) => ({
          ...prev,
          unread: Math.max(0, prev.unread - 1),
          read: prev.read + 1,
        }));
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setViewingMessage(null);
  };

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: { xs: 2, sm: 4 },
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            fontWeight={700}
            sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' } }}
          >
            Inbox
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            {unreadCount > 0 ? `${unreadCount} unread messages` : 'All messages read'}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Refresh />}
          onClick={() => fetchMessages()}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Tabs */}
      <Card sx={{ mb: 3 }}>
        <Tabs
          value={selectedTab}
          onChange={(_, v) => {
            setSelectedTab(v);
            setSelected([]);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: { xs: 1, sm: 2 } }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.status}
              label={
                tab.status === 'unread' && unreadCount > 0 ? (
                  <Badge badgeContent={unreadCount} color="error">
                    {tab.label}
                  </Badge>
                ) : (
                  tab.label
                )
              }
              value={index}
            />
          ))}
        </Tabs>
      </Card>

      {/* Toolbar */}
      <Card sx={{ mb: 3, p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{
              flexGrow: 1,
              minWidth: { xs: '100%', sm: 200 },
              maxWidth: { xs: '100%', sm: 400 },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {selected.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {selected.length} selected
              </Typography>
              {currentStatus === 'deleted' ? (
                <>
                  <Tooltip title="Restore">
                    <IconButton
                      size="small"
                      color="success"
                      onClick={() => handleBulkAction('restore')}
                    >
                      <Restore />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Permanently delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleBulkAction('delete')}
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Tooltip title="Mark as read">
                    <IconButton size="small" onClick={() => handleBulkAction('read')}>
                      <MarkEmailRead />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Mark as unread">
                    <IconButton size="small" onClick={() => handleBulkAction('unread')}>
                      <MarkEmailUnread />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Archive">
                    <IconButton size="small" onClick={() => handleBulkAction('archive')}>
                      <Archive />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Mark as spam">
                    <IconButton size="small" onClick={() => handleBulkAction('spam')}>
                      <ReportProblem />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleBulkAction('delete')}
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          )}
        </Box>
      </Card>

      {/* Messages Table */}
      <Card sx={{ overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Table sx={{ minWidth: 350 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < filteredMessages.length}
                    checked={
                      filteredMessages.length > 0 && selected.length === filteredMessages.length
                    }
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell>Message</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Source</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Date</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            {loading ? (
              <LoadingSkeleton />
            ) : (
              <TableBody>
                {filteredMessages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Email sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                          No messages found
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMessages
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((message) => (
                      <TableRow
                        key={message.id}
                        hover
                        onClick={() => handleRowClick(message)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor:
                            message.status === 'unread'
                              ? (theme) => alpha(theme.palette.primary.main, 0.05)
                              : 'inherit',
                          '&:hover': {
                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                          },
                        }}
                      >
                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.includes(message.id)}
                            onChange={() => handleSelectOne(message.id)}
                          />
                        </TableCell>
                        <TableCell
                          sx={{ maxWidth: { xs: 150, sm: 250, md: 350 }, overflow: 'hidden' }}
                        >
                          <Box
                            sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {message.status === 'unread' && (
                                <Box
                                  sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: 'primary.main',
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <Typography
                                fontWeight={message.status === 'unread' ? 600 : 400}
                                sx={{
                                  fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {message.name || 'Anonymous'}
                              </Typography>
                              {message.email && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    display: { xs: 'none', sm: 'inline' },
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  &lt;{message.email}&gt;
                                </Typography>
                              )}
                            </Box>
                            <Typography
                              variant="body2"
                              fontWeight={message.status === 'unread' ? 500 : 400}
                              sx={{
                                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {message.subject || '(No subject)'}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                fontSize: { xs: '0.7rem', sm: '0.8rem' },
                                display: { xs: 'none', sm: 'block' },
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {message.body.substring(0, 80)}...
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          <Chip
                            label={message.source}
                            size="small"
                            sx={{ textTransform: 'capitalize' }}
                          />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          <Tooltip title={format(message.createdAt, 'PPP p')}>
                            <Typography variant="body2">
                              {formatDistanceToNow(message.createdAt, { addSuffix: true })}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <IconButton size="small" onClick={(e) => handleMenuOpen(e, message)}>
                            <MoreVert />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            )}
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={totalMessages}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Card>

      {/* Actions Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        {selectedMessage?.status === 'unread' ? (
          <MenuItem
            onClick={async () => {
              if (selectedMessage) {
                try {
                  await fetch('/api/admin/messages', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: [selectedMessage.id], action: 'read' }),
                  });
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === selectedMessage.id
                        ? { ...m, status: 'read' as const, readAt: new Date().toISOString() }
                        : m
                    )
                  );
                  setStats((prev) => ({
                    ...prev,
                    unread: Math.max(0, prev.unread - 1),
                    read: prev.read + 1,
                  }));
                } catch (error) {
                  console.error('Error marking message as read:', error);
                }
              }
              handleMenuClose();
            }}
          >
            <MarkEmailRead sx={{ mr: 1 }} /> Mark as read
          </MenuItem>
        ) : (
          <MenuItem
            onClick={async () => {
              if (selectedMessage) {
                try {
                  await fetch('/api/admin/messages', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: [selectedMessage.id], action: 'unread' }),
                  });
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === selectedMessage.id
                        ? { ...m, status: 'unread' as const, readAt: null }
                        : m
                    )
                  );
                  setStats((prev) => ({
                    ...prev,
                    unread: prev.unread + 1,
                    read: Math.max(0, prev.read - 1),
                  }));
                } catch (error) {
                  console.error('Error marking message as unread:', error);
                }
              }
              handleMenuClose();
            }}
          >
            <MarkEmailUnread sx={{ mr: 1 }} /> Mark as unread
          </MenuItem>
        )}
        {selectedMessage?.status === 'deleted' ? (
          <MenuItem
            onClick={async () => {
              if (selectedMessage) {
                try {
                  await fetch('/api/admin/messages', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: [selectedMessage.id], action: 'restore' }),
                  });
                  await fetchMessages();
                } catch (error) {
                  console.error('Error restoring message:', error);
                }
              }
              handleMenuClose();
            }}
          >
            <Restore sx={{ mr: 1 }} /> Restore
          </MenuItem>
        ) : (
          [
            <MenuItem
              key="archive"
              onClick={async () => {
                if (selectedMessage) {
                  try {
                    await fetch('/api/admin/messages', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids: [selectedMessage.id], action: 'archive' }),
                    });
                    await fetchMessages();
                  } catch (error) {
                    console.error('Error archiving message:', error);
                  }
                }
                handleMenuClose();
              }}
            >
              <Archive sx={{ mr: 1 }} /> Archive
            </MenuItem>,
            <MenuItem
              key="spam"
              onClick={async () => {
                if (selectedMessage) {
                  try {
                    await fetch('/api/admin/messages', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids: [selectedMessage.id], action: 'spam' }),
                    });
                    await fetchMessages();
                  } catch (error) {
                    console.error('Error marking message as spam:', error);
                  }
                }
                handleMenuClose();
              }}
            >
              <ReportProblem sx={{ mr: 1 }} /> Mark as spam
            </MenuItem>,
          ]
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            if (selectedMessage) {
              setSelected([selectedMessage.id]);
              setDeleteDialogOpen(true);
            }
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <Delete sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>
          {currentStatus === 'deleted' ? 'Permanently Delete Messages' : 'Delete Messages'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {currentStatus === 'deleted'
              ? `Are you sure you want to permanently delete ${selected.length} message${selected.length !== 1 ? 's' : ''}? This action cannot be undone.`
              : `Are you sure you want to move ${selected.length} message${selected.length !== 1 ? 's' : ''} to trash? You can restore them later from the Trash tab.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {currentStatus === 'deleted' ? 'Permanently Delete' : 'Move to Trash'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Message Detail Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleCloseDrawer}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 500, md: 600 },
          },
        }}
      >
        {viewingMessage && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer Header */}
            <Box
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="h6">Message Details</Typography>
              <IconButton onClick={handleCloseDrawer}>
                <Close />
              </IconButton>
            </Box>

            {/* Message Content */}
            <Box sx={{ p: 3, flexGrow: 1, overflow: 'auto' }}>
              <Typography variant="h5" gutterBottom fontWeight={600}>
                {viewingMessage.subject || '(No subject)'}
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Chip
                  label={viewingMessage.status}
                  color={statusColors[viewingMessage.status]}
                  size="small"
                  sx={{ textTransform: 'capitalize' }}
                />
                <Chip
                  label={viewingMessage.source}
                  size="small"
                  variant="outlined"
                  sx={{ textTransform: 'capitalize' }}
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body2">
                    <strong>From:</strong> {viewingMessage.name || 'Anonymous'}
                    {viewingMessage.email && ` <${viewingMessage.email}>`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Schedule sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body2">
                    <strong>Date:</strong> {format(viewingMessage.createdAt, 'PPP p')}
                  </Typography>
                </Box>
                {viewingMessage.readAt && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MarkEmailRead sx={{ color: 'text.secondary', fontSize: 20 }} />
                    <Typography variant="body2">
                      <strong>Read:</strong> {format(viewingMessage.readAt, 'PPP p')}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography
                sx={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                }}
              >
                {viewingMessage.body}
              </Typography>
            </Box>

            {/* Drawer Actions */}
            <Box
              sx={{
                p: 2,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                gap: 2,
              }}
            >
              {viewingMessage.email && (
                <Button
                  variant="contained"
                  startIcon={<Reply />}
                  href={`mailto:${viewingMessage.email}?subject=Re: ${viewingMessage.subject || ''}`}
                  fullWidth
                >
                  Reply
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<Archive />}
                onClick={() => {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === viewingMessage.id ? { ...m, status: 'archived' as const } : m
                    )
                  );
                  handleCloseDrawer();
                }}
                fullWidth
              >
                Archive
              </Button>
            </Box>
          </Box>
        )}
      </Drawer>
    </Box>
  );
}
