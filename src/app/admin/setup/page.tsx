'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid2 as Grid,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
  FormControlLabel,
  Paper,
} from '@mui/material';
import { RocketLaunch, Security, SettingsSuggest, VerifiedUser } from '@mui/icons-material';
import { useRouter } from 'next/navigation';

interface WizardProvider {
  provider: string;
  label: string;
  enabled: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  scopes: string[];
  issuer?: string | null;
  clientId?: string;
  clientSecret?: string;
}

interface WizardData {
  site: {
    name: string;
    description: string;
    url: string;
  };
  author: {
    name: string;
    email: string;
    tagline: string;
  };
  auth: {
    registrationEnabled: boolean;
    accountLinkingEnabled: boolean;
    installCompleted: boolean;
  };
  providers: WizardProvider[];
  recoveryOverrideEnabled?: boolean;
}

const steps = ['Site identity', 'Auth controls', 'Provider setup', 'Launch'];

export default function AdminSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<WizardData | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/install-wizard');
        if (response.status === 423) {
          router.replace('/admin');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load install wizard');
        }

        const result = await response.json();
        setFormData({
          ...result.data,
          author: {
            ...result.data.author,
            tagline: result.data.author.tagline ?? '',
          },
          providers: result.data.providers.map((provider: WizardProvider) => ({
            ...provider,
          })),
        });
      } catch (wizardError) {
        console.error('Install wizard error:', wizardError);
        setError(
          wizardError instanceof Error ? wizardError.message : 'Failed to load install wizard'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const enabledProviderCount = useMemo(
    () => formData?.providers.filter((provider) => provider.enabled).length ?? 0,
    [formData]
  );

  const updateSiteField = (field: 'name' | 'description' | 'url', value: string) => {
    if (!formData) return;
    setFormData({ ...formData, site: { ...formData.site, [field]: value } });
  };

  const updateAuthorField = (field: 'name' | 'email' | 'tagline', value: string) => {
    if (!formData) return;
    setFormData({ ...formData, author: { ...formData.author, [field]: value } });
  };

  const updateAuthField = (
    field: 'registrationEnabled' | 'accountLinkingEnabled',
    value: boolean
  ) => {
    if (!formData) return;
    setFormData({ ...formData, auth: { ...formData.auth, [field]: value } });
  };

  const updateProviderField = (
    providerKey: string,
    field: 'enabled' | 'issuer' | 'clientIdConfigured' | 'clientSecretConfigured' | 'scopes',
    value: boolean | string | string[]
  ) => {
    if (!formData) return;
    setFormData({
      ...formData,
      providers: formData.providers.map((provider) =>
        provider.provider === providerKey ? { ...provider, [field]: value } : provider
      ),
    });
  };

  const updateProviderSecret = (
    providerKey: string,
    field: 'clientId' | 'clientSecret' | 'issuer' | 'scopesInput',
    value: string
  ) => {
    if (!formData) return;
    setFormData({
      ...formData,
      providers: formData.providers.map((provider) =>
        provider.provider === providerKey
          ? {
              ...provider,
              ...(field === 'issuer' ? { issuer: value } : {}),
              ...(field === 'scopesInput'
                ? {
                    scopes: value
                      .split(',')
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }
                : {}),
              ...(field === 'clientId'
                ? { clientIdConfigured: provider.clientIdConfigured, clientId: value }
                : {}),
              ...(field === 'clientSecret'
                ? { clientSecretConfigured: provider.clientSecretConfigured, clientSecret: value }
                : {}),
            }
          : provider
      ),
    });
  };

  const handleComplete = async () => {
    if (!formData) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/install-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: formData.site,
          author: formData.author,
          auth: {
            registrationEnabled: formData.auth.registrationEnabled,
            accountLinkingEnabled: formData.auth.accountLinkingEnabled,
          },
          providers: formData.providers.map((provider) => ({
            provider: provider.provider,
            enabled: provider.enabled,
            issuer: provider.issuer ?? null,
            scopes: provider.scopes,
            ...(provider.clientId ? { clientId: provider.clientId } : {}),
            ...(provider.clientSecret ? { clientSecret: provider.clientSecret } : {}),
          })),
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to complete install wizard');
      }

      router.push('/admin');
      router.refresh();
    } catch (wizardError) {
      console.error('Install wizard save error:', wizardError);
      setError(
        wizardError instanceof Error ? wizardError.message : 'Failed to complete install wizard'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !formData) {
    return (
      <Box
        sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 1, sm: 0 } }}>
      <Paper
        sx={{
          p: { xs: 3, md: 4 },
          mb: 3,
          borderRadius: 4,
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 45%, ${theme.palette.secondary.main} 100%)`,
          color: 'common.white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Chip
          icon={<RocketLaunch />}
          label="First install"
          sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.14)', color: 'common.white' }}
        />
        <Typography variant="h3" fontWeight={800} sx={{ mb: 1 }}>
          Shape the admin before the site goes live.
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 720, opacity: 0.92 }}>
          This one-time setup flow configures the site identity, turns registration on only when you
          want it, and locks in which OAuth providers are ready for real users.
        </Typography>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}

      {formData.recoveryOverrideEnabled ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Server recovery override is currently enabled through{' '}
          <strong>AUTH_SETUP_BYPASS=true</strong>. This is a private server-side escape hatch for
          setup recovery. Turn it back off after you have safely finished configuration.
        </Alert>
      ) : null}

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((step) => (
          <Step key={step}>
            <StepLabel>{step}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              {activeStep === 0 ? (
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="h5" fontWeight={700} gutterBottom>
                      Site identity
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Give the install its public voice before you open access.
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Site name"
                      value={formData.site.name}
                      onChange={(e) => updateSiteField('name', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Site URL"
                      value={formData.site.url}
                      onChange={(e) => updateSiteField('url', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Site description"
                      value={formData.site.description}
                      onChange={(e) => updateSiteField('description', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Owner name"
                      value={formData.author.name}
                      onChange={(e) => updateAuthorField('name', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Owner email"
                      value={formData.author.email}
                      onChange={(e) => updateAuthorField('email', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Tagline"
                      value={formData.author.tagline}
                      onChange={(e) => updateAuthorField('tagline', e.target.value)}
                    />
                  </Grid>
                </Grid>
              ) : null}

              {activeStep === 1 ? (
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    Access controls
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Registration stays off unless you deliberately open it.
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.auth.registrationEnabled}
                        onChange={(e) => updateAuthField('registrationEnabled', e.target.checked)}
                      />
                    }
                    label="Allow new OAuth registrations"
                    sx={{ display: 'flex', mb: 2 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.auth.accountLinkingEnabled}
                        onChange={(e) => updateAuthField('accountLinkingEnabled', e.target.checked)}
                      />
                    }
                    label="Allow existing users to connect additional providers"
                    sx={{ display: 'flex' }}
                  />
                </Box>
              ) : null}

              {activeStep === 2 ? (
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    Provider setup
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Credentials are write-only. Once saved, they are only shown here as configured.
                  </Typography>
                  <Grid container spacing={2}>
                    {formData.providers.map((provider) => (
                      <Grid key={provider.provider} size={{ xs: 12 }}>
                        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              mb: 2,
                              gap: 2,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Box>
                              <Typography variant="subtitle1" fontWeight={700}>
                                {provider.label}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Ready for admin and user login when enabled.
                              </Typography>
                            </Box>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={provider.enabled}
                                  onChange={(e) =>
                                    updateProviderField(
                                      provider.provider,
                                      'enabled',
                                      e.target.checked
                                    )
                                  }
                                />
                              }
                              label="Enabled"
                            />
                          </Box>
                          <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                label="Client ID"
                                placeholder={
                                  provider.clientIdConfigured
                                    ? 'Saved and hidden'
                                    : 'Paste a client ID'
                                }
                                onChange={(e) =>
                                  updateProviderSecret(
                                    provider.provider,
                                    'clientId',
                                    e.target.value
                                  )
                                }
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                type="password"
                                label="Client secret"
                                placeholder={
                                  provider.clientSecretConfigured
                                    ? 'Saved and hidden'
                                    : 'Paste a client secret'
                                }
                                onChange={(e) =>
                                  updateProviderSecret(
                                    provider.provider,
                                    'clientSecret',
                                    e.target.value
                                  )
                                }
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                label="Issuer override"
                                value={provider.issuer ?? ''}
                                onChange={(e) =>
                                  updateProviderSecret(provider.provider, 'issuer', e.target.value)
                                }
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                label="Scopes"
                                value={provider.scopes.join(', ')}
                                onChange={(e) =>
                                  updateProviderSecret(
                                    provider.provider,
                                    'scopesInput',
                                    e.target.value
                                  )
                                }
                                helperText="Comma-separated scopes"
                              />
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              ) : null}

              {activeStep === 3 ? (
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    Ready to launch
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Review the foundation before you unlock the full admin.
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Site
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                          {formData.site.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formData.site.url}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Auth posture
                        </Typography>
                        <Typography variant="body1">
                          Registration {formData.auth.registrationEnabled ? 'enabled' : 'disabled'}
                        </Typography>
                        <Typography variant="body1">
                          Linking {formData.auth.accountLinkingEnabled ? 'enabled' : 'disabled'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {enabledProviderCount} provider{enabledProviderCount === 1 ? '' : 's'}{' '}
                          enabled
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>
              ) : null}

              <Divider sx={{ my: 3 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Button
                  disabled={activeStep === 0 || saving}
                  onClick={() => setActiveStep((step) => step - 1)}
                >
                  Back
                </Button>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {activeStep < steps.length - 1 ? (
                    <Button variant="contained" onClick={() => setActiveStep((step) => step + 1)}>
                      Continue
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      onClick={handleComplete}
                      disabled={saving}
                      startIcon={
                        saving ? <CircularProgress size={18} color="inherit" /> : <VerifiedUser />
                      }
                    >
                      {saving ? 'Finishing...' : 'Finish setup'}
                    </Button>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 4, mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="overline" color="text.secondary">
                Superadmin posture
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                This install keeps power centralized.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The first authenticated account remains superadmin. Registration defaults to off,
                and providers stay dormant until their credentials are intentionally saved.
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <SettingsSuggest color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Checklist
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                1. Set the public site identity.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                2. Decide whether OAuth registration should stay closed.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                3. Configure at least one provider before inviting users.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                4. Finish setup to unlock the full admin navigation.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
