'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid2 as Grid,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
} from '@mui/material';
import {
  AdminPanelSettings,
  ContentCopy,
  Hub,
  MailOutline,
  ManageAccounts,
  PersonAddAlt1,
  Security,
} from '@mui/icons-material';

interface LinkedAccount {
  id: string;
  provider: string;
  providerEmail: string | null;
  providerUsername: string | null;
  createdAt: string;
}

interface AuthUserRow {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryRole: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  isAdmin: boolean;
  primaryAuthProvider: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedAccounts: LinkedAccount[];
}

interface AuthRoleRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

interface InvitationRow {
  id: string;
  email: string;
  roleSlugs: string[];
  note: string | null;
  invitationLink?: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
  status: 'pending' | 'redeemed' | 'revoked' | 'expired';
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [users, setUsers] = useState<AuthUserRow[]>([]);
  const [roles, setRoles] = useState<AuthRoleRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    roleSlugs: ['member'],
    expiresInDays: 7,
    note: '',
  });
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [usersResponse, invitationsResponse] = await Promise.all([
          fetch('/api/admin/auth/users'),
          fetch('/api/admin/auth/invitations'),
        ]);

        if (!usersResponse.ok || !invitationsResponse.ok) {
          throw new Error('Failed to load users');
        }

        const [usersResult, invitationsResult] = await Promise.all([
          usersResponse.json(),
          invitationsResponse.json(),
        ]);
        setUsers(usersResult.data.users);
        setRoles(usersResult.data.roles);
        setInvitations(invitationsResult.data.invitations);
        setSelectedUserId(usersResult.data.users[0]?.id ?? null);
      } catch (usersError) {
        console.error('Failed to load auth users:', usersError);
        setError(usersError instanceof Error ? usersError.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  const adminCount = users.filter((user) => user.isAdmin && user.isActive).length;
  const linkedAccountsCount = users.reduce((count, user) => count + user.linkedAccounts.length, 0);
  const pendingInvites = invitations.filter((invitation) => invitation.status === 'pending').length;

  const handleToggleRole = async (roleSlug: string) => {
    if (!selectedUser) return;

    const nextRoles = selectedUser.roles.includes(roleSlug)
      ? selectedUser.roles.filter((role) => role !== roleSlug)
      : [...selectedUser.roles, roleSlug];

    await saveUserUpdate(selectedUser.id, { roleSlugs: nextRoles });
  };

  const handleToggleActive = async (checked: boolean) => {
    if (!selectedUser) return;
    await saveUserUpdate(selectedUser.id, { isActive: checked });
  };

  const saveUserUpdate = async (
    userId: string,
    payload: { roleSlugs?: string[]; isActive?: boolean }
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/auth/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...payload }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update user');
      }

      setUsers((current) => current.map((user) => (user.id === userId ? result.data : user)));
      setSuccess('User access updated');
    } catch (updateError) {
      console.error('Failed to update user:', updateError);
      setError(updateError instanceof Error ? updateError.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const resetInviteForm = () => {
    setInviteForm({
      email: '',
      roleSlugs: ['member'],
      expiresInDays: 7,
      note: '',
    });
  };

  const handleCreateInvite = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/auth/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create invitation');
      }

      setInvitations((current) => [result.data, ...current]);
      setGeneratedInviteLink(result.data.invitationLink || null);
      setSuccess('Invitation created');
      resetInviteForm();
    } catch (inviteError) {
      console.error('Failed to create invitation:', inviteError);
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to create invitation');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/auth/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to revoke invitation');
      }

      setInvitations((current) =>
        current.map((invitation) => (invitation.id === invitationId ? result.data : invitation))
      );
      setSuccess('Invitation revoked');
    } catch (inviteError) {
      console.error('Failed to revoke invitation:', inviteError);
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to revoke invitation');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setSuccess('Invite link copied');
    } catch {
      setError('Unable to copy invite link automatically');
    }
  };

  if (loading) {
    return (
      <Box
        sx={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          mb: 3,
          p: { xs: 3, md: 4 },
          borderRadius: 4,
          background: (theme) =>
            `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.95)} 0%, ${alpha(theme.palette.secondary.main, 0.88)} 100%)`,
          color: 'common.white',
        }}
      >
        <Chip
          icon={<ManageAccounts />}
          label="Access orchestration"
          sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.16)', color: 'common.white' }}
        />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
              Users, roles, invites, and linked identities.
            </Typography>
            <Typography variant="body1" sx={{ maxWidth: 760, opacity: 0.92 }}>
              Keep registration closed, create one-time onboarding links manually, and manage access
              from the auth tables.
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="inherit"
            startIcon={<PersonAddAlt1 />}
            onClick={() => {
              setInviteDialogOpen(true);
              setGeneratedInviteLink(null);
            }}
            sx={{
              color: 'primary.main',
              bgcolor: 'common.white',
              '&:hover': { bgcolor: 'grey.100' },
            }}
          >
            New invite link
          </Button>
        </Box>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      ) : null}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <AdminPanelSettings color="primary" />
                <Typography variant="overline">Active admins</Typography>
              </Stack>
              <Typography variant="h3" fontWeight={800}>
                {adminCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Accounts with admin access and active status.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Hub color="primary" />
                <Typography variant="overline">Linked identities</Typography>
              </Stack>
              <Typography variant="h3" fontWeight={800}>
                {linkedAccountsCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Provider identities attached across all local users.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Security color="primary" />
                <Typography variant="overline">Role templates</Typography>
              </Stack>
              <Typography variant="h3" fontWeight={800}>
                {roles.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Reusable roles with their inherited permission sets.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <MailOutline color="primary" />
                <Typography variant="overline">Pending invites</Typography>
              </Stack>
              <Typography variant="h3" fontWeight={800}>
                {pendingInvites}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                One-time invite links that have not been redeemed or revoked.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ p: 3, pb: 2 }}>
                <Typography variant="h6" fontWeight={700}>
                  Account table
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Click a user to edit roles and status.
                </Typography>
              </Box>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>User</TableCell>
                      <TableCell>Roles</TableCell>
                      <TableCell>Linked accounts</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((user) => {
                      const isSelected = selectedUserId === user.id;
                      return (
                        <TableRow
                          key={user.id}
                          hover
                          selected={isSelected}
                          onClick={() => setSelectedUserId(user.id)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar src={user.avatarUrl || undefined}>
                                {(user.displayName || user.email).charAt(0).toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography fontWeight={700}>
                                  {user.displayName || 'Unnamed user'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {user.email}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {user.roles.map((role) => (
                                <Chip
                                  key={role}
                                  size="small"
                                  label={role}
                                  color={role === user.primaryRole ? 'primary' : 'default'}
                                />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {user.linkedAccounts.length === 0 ? (
                                <Chip size="small" variant="outlined" label="None" />
                              ) : (
                                user.linkedAccounts.map((account) => (
                                  <Chip
                                    key={account.id}
                                    size="small"
                                    label={account.provider}
                                    variant="outlined"
                                  />
                                ))
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={user.isActive ? 'Active' : 'Suspended'}
                              color={user.isActive ? 'success' : 'default'}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ borderRadius: 4, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
                Access editor
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Role assignment changes take effect immediately for API and admin authorization
                checks.
              </Typography>

              {selectedUser ? (
                <>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                    <Avatar src={selectedUser.avatarUrl || undefined}>
                      {(selectedUser.displayName || selectedUser.email).charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography fontWeight={700}>
                        {selectedUser.displayName || 'Unnamed user'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedUser.email}
                      </Typography>
                    </Box>
                  </Stack>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={selectedUser.isActive}
                        onChange={(e) => void handleToggleActive(e.target.checked)}
                        disabled={saving}
                      />
                    }
                    label="Account active"
                    sx={{ mb: 2 }}
                  />

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Roles
                  </Typography>
                  <ToggleButtonGroup
                    orientation="vertical"
                    fullWidth
                    exclusive={false}
                    value={selectedUser.roles}
                  >
                    {roles.map((role) => (
                      <ToggleButton
                        key={role.id}
                        value={role.slug}
                        selected={selectedUser.roles.includes(role.slug)}
                        onChange={() => void handleToggleRole(role.slug)}
                        sx={{ justifyContent: 'space-between', textAlign: 'left', py: 1.4 }}
                      >
                        <Box>
                          <Typography fontWeight={700}>{role.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {role.description || role.slug}
                          </Typography>
                        </Box>
                        <Chip size="small" label={`${role.memberCount} users`} />
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>

                  <Divider sx={{ my: 3 }} />
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Linked identities
                  </Typography>
                  <Stack spacing={1}>
                    {selectedUser.linkedAccounts.map((account) => (
                      <Paper key={account.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          spacing={2}
                        >
                          <Box>
                            <Typography fontWeight={700}>{account.provider}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {account.providerEmail ||
                                account.providerUsername ||
                                'No provider email'}
                            </Typography>
                          </Box>
                          <Chip size="small" label={account.provider} variant="outlined" />
                        </Stack>
                      </Paper>
                    ))}
                    {selectedUser.linkedAccounts.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No linked OAuth identities for this user yet.
                      </Typography>
                    ) : null}
                  </Stack>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Select a user to edit their access.
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 4, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
                Invite-only onboarding
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Generate a one-time link, copy it, and send it manually. No server-side email
                delivery required.
              </Typography>

              {generatedInviteLink ? (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2.5 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Latest invite link
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all', mb: 1.5 }}>
                    {generatedInviteLink}
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<ContentCopy />}
                    onClick={() => void handleCopyInviteLink(generatedInviteLink)}
                  >
                    Copy link
                  </Button>
                </Paper>
              ) : null}

              <Stack spacing={1.5}>
                {invitations.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No invitations have been created yet.
                  </Typography>
                ) : (
                  invitations.map((invitation) => (
                    <Paper key={invitation.id} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                      <Stack spacing={1.25}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="flex-start"
                          spacing={2}
                        >
                          <Box>
                            <Typography fontWeight={700}>{invitation.email}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Expires {new Date(invitation.expiresAt).toLocaleString()}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={invitation.status}
                            color={
                              invitation.status === 'pending'
                                ? 'primary'
                                : invitation.status === 'redeemed'
                                  ? 'success'
                                  : 'default'
                            }
                          />
                        </Stack>

                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                          {invitation.roleSlugs.map((role) => (
                            <Chip key={role} size="small" label={role} variant="outlined" />
                          ))}
                        </Stack>

                        {invitation.note ? (
                          <Typography variant="body2" color="text.secondary">
                            {invitation.note}
                          </Typography>
                        ) : null}

                        <Stack direction="row" spacing={1}>
                          {invitation.invitationLink && invitation.status === 'pending' ? (
                            <Button
                              size="small"
                              startIcon={<ContentCopy />}
                              onClick={() => void handleCopyInviteLink(invitation.invitationLink!)}
                            >
                              Copy link
                            </Button>
                          ) : null}
                          {invitation.status === 'pending' ? (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => void handleRevokeInvite(invitation.id)}
                              disabled={saving}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </Stack>
                      </Stack>
                    </Paper>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                Role matrix
              </Typography>
              <Stack spacing={1.5}>
                {roles.map((role) => (
                  <Paper key={role.id} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={2}
                      sx={{ mb: 1 }}
                    >
                      <Box>
                        <Typography fontWeight={700}>{role.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {role.description || role.slug}
                        </Typography>
                      </Box>
                      <Chip size="small" label={`${role.memberCount} members`} />
                    </Stack>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {role.permissions.map((permission) => (
                        <Chip key={permission} size="small" label={permission} variant="outlined" />
                      ))}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create invite-only onboarding link</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Invitee email"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((current) => ({ ...current, email: e.target.value }))}
            />
            <TextField
              fullWidth
              label="Assigned roles"
              helperText="Comma-separated role slugs from the generic framework roles"
              value={inviteForm.roleSlugs.join(', ')}
              onChange={(e) =>
                setInviteForm((current) => ({
                  ...current,
                  roleSlugs: e.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                }))
              }
            />
            <TextField
              fullWidth
              label="Expires in days"
              type="number"
              value={inviteForm.expiresInDays}
              onChange={(e) =>
                setInviteForm((current) => ({
                  ...current,
                  expiresInDays: Number(e.target.value) || 7,
                }))
              }
              inputProps={{ min: 1, max: 30 }}
            />
            <TextField
              fullWidth
              label="Internal note"
              multiline
              rows={3}
              value={inviteForm.note}
              onChange={(e) => setInviteForm((current) => ({ ...current, note: e.target.value }))}
              helperText="Optional note for your own invite tracking"
            />
            <Alert severity="info">
              This creates a one-time link you can copy and manually send. Registration stays closed
              for everyone else.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateInvite()}
            disabled={saving || !inviteForm.email || inviteForm.roleSlugs.length === 0}
          >
            {saving ? 'Creating...' : 'Create invite'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
