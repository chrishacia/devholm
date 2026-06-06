'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Paper,
  alpha,
  Divider,
} from '@mui/material';
import {
  Email,
  Lock,
  Visibility,
  VisibilityOff,
  AdminPanelSettings,
  Home,
  GitHub,
} from '@mui/icons-material';

interface PublicAuthProvider {
  provider: string;
  label: string;
}

interface PublicAuthConfig {
  settings: {
    credentialsEnabled: boolean;
    registrationEnabled: boolean;
  };
  providers: PublicAuthProvider[];
}

function AdminLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerLoading, setProviderLoading] = useState(true);
  const [oauthConfig, setOauthConfig] = useState<PublicAuthConfig | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/auth/config');
        if (!response.ok) {
          throw new Error('Failed to load auth providers');
        }

        const result = await response.json();
        setOauthConfig(result.data);
      } catch (fetchError) {
        console.error('Failed to load auth config:', fetchError);
      } finally {
        setProviderLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const loginError = searchParams.get('error');
    const provider = searchParams.get('provider');

    if (loginError === 'oauth-email-required') {
      setError(
        `Your ${provider || 'OAuth'} account did not provide an email. Add an email to that provider account, then sign in again. After sign-in, you can also set a local password in Profile.`
      );
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (oauthConfig && !oauthConfig.settings.credentialsEnabled) {
      setError('Password login is disabled. Use an enabled OAuth provider.');
      setLoading(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      // Redirect to admin dashboard on success
      router.push('/admin');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: string) => {
    setError('');
    setLoading(true);

    try {
      await signIn(provider, { callbackUrl: '/admin' });
    } catch {
      setError('Unable to start OAuth login');
      setLoading(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    if (provider === 'github') {
      return <GitHub />;
    }

    return <AdminPanelSettings />;
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        backgroundImage: (theme) =>
          `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 50%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          sx={{
            p: { xs: 3, sm: 4 },
            maxWidth: 440,
            mx: 'auto',
          }}
        >
          {/* Logo/Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <AdminPanelSettings sx={{ fontSize: 28, color: 'primary.main' }} />
            </Box>
            <Typography variant="h4" component="h1" fontWeight={700} sx={{ mb: 1 }}>
              Admin Login
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Enter your credentials to access the dashboard
            </Typography>
          </Box>

          {/* Login Form */}
          <Box component="form" onSubmit={handleSubmit}>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {!providerLoading && oauthConfig?.providers.length ? (
              <Box sx={{ mb: 3 }}>
                {oauthConfig.providers.map((provider) => (
                  <Button
                    key={provider.provider}
                    fullWidth
                    variant="outlined"
                    size="large"
                    startIcon={getProviderIcon(provider.provider)}
                    onClick={() => handleOAuthSignIn(provider.provider)}
                    disabled={loading}
                    sx={{ mb: 1.5, py: 1.25 }}
                  >
                    Continue with {provider.label}
                  </Button>
                ))}

                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {oauthConfig.settings.registrationEnabled
                    ? 'OAuth registration is enabled for configured providers.'
                    : 'OAuth registration is disabled. Only previously linked accounts can sign in.'}
                </Typography>

                <Divider sx={{ my: 3 }}>or</Divider>
              </Box>
            ) : null}

            {oauthConfig?.settings.credentialsEnabled !== false ? (
              <>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Email sx={{ color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ mb: 3 }}
                />

                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock sx={{ color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ mb: 3 }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={loading || !email || !password}
                  sx={{
                    py: 1.5,
                    fontWeight: 600,
                  }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                </Button>
              </>
            ) : (
              <Alert severity="info" sx={{ mb: 1 }}>
                Password login is disabled for this site. Use an enabled OAuth provider.
              </Alert>
            )}
          </Box>

          {/* Footer */}
          <Typography
            variant="body2"
            color="text.secondary"
            display="block"
            textAlign="center"
            sx={{ mt: 4 }}
          >
            Protected area. Unauthorized access is prohibited.
          </Typography>

          {/* Back to Site */}
          <Button href="/" startIcon={<Home />} sx={{ mt: 2, mx: 'auto', display: 'flex' }}>
            Back to Site
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageContent />
    </Suspense>
  );
}
