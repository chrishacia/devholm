'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid2 as Grid,
  TextField,
  Divider,
  Alert,
  Snackbar,
  CircularProgress,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Chip,
  Paper,
  Stack,
} from '@mui/material';
import {
  Save,
  PhotoCamera,
  Visibility,
  VisibilityOff,
  Lock,
  Delete,
  Email,
  Link as LinkIcon,
  LinkOff,
  Hub,
} from '@mui/icons-material';

// =============================================================================
// Types
// =============================================================================

interface ProfileData {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  title: string | null;
  location: string | null;
  websiteUrl: string | null;
  twitterHandle: string | null;
  githubHandle: string | null;
  linkedinHandle: string | null;
  avatarMediaId: string | null;
  avatarUrls: {
    thumbnail?: string;
    small?: string;
    original?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface LinkedAccountData {
  id: string;
  provider: string;
  providerEmail: string | null;
  providerUsername: string | null;
  createdAt: string;
}

interface AvailableProvider {
  provider: string;
  label: string;
}

// =============================================================================
// Profile Page Component
// =============================================================================

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [formData, setFormData] = useState<ProfileData | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccountData[]>([]);
  const [availableProviders, setAvailableProviders] = useState<AvailableProvider[]>([]);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState<string | null>(null);

  const hasCredentialsAccount = linkedAccounts.some(
    (account) => account.provider === 'credentials'
  );

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailData, setEmailData] = useState({
    email: '',
    currentPassword: '',
  });
  const [changingEmail, setChangingEmail] = useState(false);

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/profile');

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const result = await response.json();
      setProfile(result.data);
      setFormData(result.data);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLinkedAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/profile/linked-accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch linked accounts');
      }

      const result = await response.json();
      setLinkedAccounts(result.data.linkedAccounts);
      setAvailableProviders(result.data.availableProviders);
    } catch (err) {
      console.error('Error fetching linked accounts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load linked accounts');
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchLinkedAccounts();
  }, [fetchProfile, fetchLinkedAccounts]);

  useEffect(() => {
    const linkedProvider = searchParams.get('linked');
    if (linkedProvider) {
      setSuccess(`Linked ${linkedProvider} successfully`);
      void fetchLinkedAccounts();
    }

    const linkError = searchParams.get('link_error');
    if (linkError) {
      setError('Unable to start provider linking for that account');
    }
  }, [fetchLinkedAccounts, searchParams]);

  // =============================================================================
  // Form Handlers
  // =============================================================================

  const updateField = (field: keyof ProfileData, value: string | null) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setHasChanges(true);
  };

  // =============================================================================
  // Avatar Upload Handler
  // =============================================================================

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (10MB max for avatars)
    if (file.size > 10 * 1024 * 1024) {
      setError('Avatar image must be less than 10MB');
      return;
    }

    setUploadingAvatar(true);
    setError(null);

    try {
      // Upload the file
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('altText', `Profile avatar`);

      const uploadResponse = await fetch('/api/admin/media', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json();
        throw new Error(data.error || 'Failed to upload avatar');
      }

      const mediaAsset = await uploadResponse.json();

      // Update profile with new avatar
      const profileResponse = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarMediaId: mediaAsset.id,
        }),
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to update profile with new avatar');
      }

      const profileResult = await profileResponse.json();
      setProfile(profileResult.data);
      setFormData(profileResult.data);
      setSuccess('Avatar updated successfully');
    } catch (err) {
      console.error('Error uploading avatar:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!formData) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarMediaId: null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove avatar');
      }

      const result = await response.json();
      setProfile(result.data);
      setFormData(result.data);
      setSuccess('Avatar removed');
    } catch (err) {
      console.error('Error removing avatar:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove avatar');
    } finally {
      setSaving(false);
    }
  };

  // =============================================================================
  // Save Profile Handler
  // =============================================================================

  const handleSave = async () => {
    if (!formData) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: formData.displayName,
          bio: formData.bio,
          title: formData.title,
          location: formData.location,
          websiteUrl: formData.websiteUrl,
          twitterHandle: formData.twitterHandle,
          githubHandle: formData.githubHandle,
          linkedinHandle: formData.linkedinHandle,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save profile');
      }

      const result = await response.json();
      setProfile(result.data);
      setFormData(result.data);
      setHasChanges(false);
      setSuccess('Profile saved successfully');
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setFormData(profile);
      setHasChanges(false);
    }
  };

  const handleLinkProvider = (provider: string) => {
    setLinkingProvider(provider);
    window.location.href = `/api/admin/profile/linked-accounts/link/${provider}`;
  };

  const handleUnlinkProvider = async (accountId: string) => {
    setUnlinkingAccountId(accountId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/profile/linked-accounts/${accountId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to unlink account');
      }

      setLinkedAccounts(result.data.linkedAccounts);
      setAvailableProviders((current) => current);
      await fetchLinkedAccounts();
      setSuccess('Linked account removed');
    } catch (err) {
      console.error('Error unlinking provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to unlink provider');
    } finally {
      setUnlinkingAccountId(null);
    }
  };

  // =============================================================================
  // Password Change Handler
  // =============================================================================

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setChangingPassword(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'password',
          currentPassword: passwordData.currentPassword,
          allowSetInitialPassword: !hasCredentialsAccount,
          newPassword: passwordData.newPassword,
          confirmPassword: passwordData.confirmPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setPasswordDialogOpen(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess(
        hasCredentialsAccount ? 'Password changed successfully' : 'Password set successfully'
      );
    } catch (err) {
      console.error('Error changing password:', err);
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  // =============================================================================
  // Email Change Handler
  // =============================================================================

  const handleChangeEmail = async () => {
    if (!emailData.email) {
      setError('Email is required');
      return;
    }

    setChangingEmail(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'email',
          email: emailData.email,
          currentPassword: emailData.currentPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to change email');
      }

      setEmailDialogOpen(false);
      setEmailData({ email: '', currentPassword: '' });
      setSuccess('Email changed successfully');
      fetchProfile(); // Refresh profile data
    } catch (err) {
      console.error('Error changing email:', err);
      setError(err instanceof Error ? err.message : 'Failed to change email');
    } finally {
      setChangingEmail(false);
    }
  };

  // =============================================================================
  // Render
  // =============================================================================

  if (loading) {
    return (
      <Box
        sx={{
          p: 3,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!formData) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load profile. Please refresh the page.</Alert>
      </Box>
    );
  }

  const avatarUrl = formData.avatarUrls?.small || formData.avatarUrl;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
            Profile
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your account settings and public profile
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {hasChanges && (
            <Button variant="outlined" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <Save />}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Avatar Section */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Box sx={{ position: 'relative', display: 'inline-block', mb: 3 }}>
                <Avatar
                  src={avatarUrl || undefined}
                  sx={{
                    width: 150,
                    height: 150,
                    fontSize: '3rem',
                    bgcolor: 'primary.main',
                  }}
                >
                  {formData.displayName?.charAt(0) || 'A'}
                </Avatar>
                <IconButton
                  onClick={handleAvatarClick}
                  disabled={uploadingAvatar}
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  {uploadingAvatar ? <CircularProgress size={24} /> : <PhotoCamera />}
                </IconButton>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarUpload}
                />
              </Box>

              <Typography variant="h6" gutterBottom>
                {formData.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {formData.email}
              </Typography>
              {formData.title && (
                <Typography variant="body2" color="text.secondary">
                  {formData.title}
                </Typography>
              )}

              {avatarUrl && (
                <Button
                  size="small"
                  color="error"
                  startIcon={<Delete />}
                  onClick={handleRemoveAvatar}
                  sx={{ mt: 2 }}
                >
                  Remove Avatar
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Security
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Button
                fullWidth
                variant="outlined"
                startIcon={<Email />}
                onClick={() => {
                  setEmailData({ email: formData.email, currentPassword: '' });
                  setEmailDialogOpen(true);
                }}
                sx={{ mb: 2 }}
              >
                Change Email
              </Button>

              <Button
                fullWidth
                variant="outlined"
                startIcon={<Lock />}
                onClick={() => setPasswordDialogOpen(true)}
              >
                Change Password
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Hub color="primary" />
                <Typography variant="h6">Linked Accounts</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Connect more providers to this local account so sign-in is intentional instead of
                inferred from matching emails.
              </Typography>

              <Stack spacing={1.5} sx={{ mb: 2.5 }}>
                {linkedAccounts.map((account) => (
                  <Paper key={account.id} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
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
                            'No provider email returned'}
                        </Typography>
                      </Box>
                      <Button
                        color="error"
                        size="small"
                        startIcon={<LinkOff />}
                        disabled={unlinkingAccountId === account.id}
                        onClick={() => void handleUnlinkProvider(account.id)}
                      >
                        {unlinkingAccountId === account.id ? 'Removing...' : 'Unlink'}
                      </Button>
                    </Stack>
                  </Paper>
                ))}
                {linkedAccounts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No OAuth providers are linked yet.
                  </Typography>
                ) : null}
              </Stack>

              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Connect another provider
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {availableProviders.map((provider) => (
                  <Button
                    key={provider.provider}
                    variant="outlined"
                    startIcon={<LinkIcon />}
                    onClick={() => handleLinkProvider(provider.provider)}
                    disabled={linkingProvider === provider.provider}
                  >
                    {linkingProvider === provider.provider ? 'Connecting...' : provider.label}
                  </Button>
                ))}
                {availableProviders.length === 0 ? (
                  <Chip label="No additional configured providers available" variant="outlined" />
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Profile Details */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Profile Information
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Display Name"
                    value={formData.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Title / Role"
                    value={formData.title || ''}
                    onChange={(e) => updateField('title', e.target.value || null)}
                    placeholder="e.g., Full-Stack Developer"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Bio"
                    multiline
                    rows={4}
                    value={formData.bio || ''}
                    onChange={(e) => updateField('bio', e.target.value || null)}
                    placeholder="Tell visitors about yourself..."
                    helperText="This appears on your About page and author cards"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Location"
                    value={formData.location || ''}
                    onChange={(e) => updateField('location', e.target.value || null)}
                    placeholder="e.g., San Francisco, CA"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Website URL"
                    value={formData.websiteUrl || ''}
                    onChange={(e) => updateField('websiteUrl', e.target.value || null)}
                    placeholder="https://yourwebsite.com"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Password Change Dialog */}
      <Dialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!hasCredentialsAccount ? (
              <Alert severity="info">
                This account was created with OAuth. Set a password to enable email/password login.
                If your OAuth provider did not share an email, update your email first.
              </Alert>
            ) : null}
            <TextField
              fullWidth
              label="Current Password"
              type={showPasswords.current ? 'text' : 'password'}
              value={passwordData.currentPassword}
              onChange={(e) =>
                setPasswordData({ ...passwordData, currentPassword: e.target.value })
              }
              required={hasCredentialsAccount}
              helperText={hasCredentialsAccount ? undefined : 'Optional for initial password setup'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, current: !showPasswords.current })
                      }
                    >
                      {showPasswords.current ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              label="New Password"
              type={showPasswords.new ? 'text' : 'password'}
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              helperText="Must be at least 8 characters"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, new: !showPasswords.new })
                      }
                    >
                      {showPasswords.new ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Confirm New Password"
              type={showPasswords.confirm ? 'text' : 'password'}
              value={passwordData.confirmPassword}
              onChange={(e) =>
                setPasswordData({ ...passwordData, confirmPassword: e.target.value })
              }
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })
                      }
                    >
                      {showPasswords.confirm ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleChangePassword}
            variant="contained"
            disabled={
              changingPassword ||
              !passwordData.currentPassword ||
              !passwordData.newPassword ||
              !passwordData.confirmPassword
            }
          >
            {changingPassword ? <CircularProgress size={24} /> : 'Change Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Email Change Dialog */}
      <Dialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change Email</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="New Email"
              type="email"
              value={emailData.email}
              onChange={(e) => setEmailData({ ...emailData, email: e.target.value })}
            />
            <TextField
              fullWidth
              label="Current Password"
              type="password"
              value={emailData.currentPassword}
              onChange={(e) => setEmailData({ ...emailData, currentPassword: e.target.value })}
              helperText="Required to confirm this change"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleChangeEmail}
            variant="contained"
            disabled={changingEmail || !emailData.email || !emailData.currentPassword}
          >
            {changingEmail ? <CircularProgress size={24} /> : 'Change Email'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={!!success}
        autoHideDuration={5000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSuccess(null)} severity="success" sx={{ width: '100%' }}>
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Box sx={{ p: 3 }} />}>
      <ProfilePageInner />
    </Suspense>
  );
}
