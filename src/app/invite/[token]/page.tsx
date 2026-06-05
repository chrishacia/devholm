'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import { Hub, VerifiedUser } from '@mui/icons-material';

interface InvitationData {
  invitation: {
    email: string;
    roleSlugs: string[];
    expiresAt: string;
    status: 'pending' | 'redeemed' | 'revoked' | 'expired';
  };
  providers: Array<{
    provider: string;
    label: string;
  }>;
}

export default function InviteLandingPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvitationData | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/auth/invitations/${token}`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Invitation not found');
        }

        setData(result.data);
      } catch (inviteError) {
        console.error('Invite landing error:', inviteError);
        setError(inviteError instanceof Error ? inviteError.message : 'Invitation not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <Box
        sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const queryError = searchParams.get('error');

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: (theme) =>
          `radial-gradient(circle at top, ${alpha(theme.palette.primary.main, 0.18)} 0%, transparent 45%), linear-gradient(180deg, ${theme.palette.background.default} 0%, ${alpha(theme.palette.secondary.main, 0.08)} 100%)`,
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ borderRadius: 5, overflow: 'hidden' }}>
          <Box sx={{ p: 4, bgcolor: 'primary.main', color: 'common.white' }}>
            <Chip
              icon={<Hub />}
              label="Private invitation"
              sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.16)', color: 'common.white' }}
            />
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Join this site with a one-time invite.
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.92 }}>
              Registration is not open publicly. This invitation unlocks a single onboarding pass
              for the invited address.
            </Typography>
          </Box>
          <CardContent sx={{ p: 4 }}>
            {error ? (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            ) : null}
            {queryError ? (
              <Alert severity="warning" sx={{ mb: 3 }}>
                That invite could not be started. It may be expired, revoked, or the selected
                provider is unavailable.
              </Alert>
            ) : null}

            {data ? (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Invited email
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {data.invitation.email}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Assigned roles
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {data.invitation.roleSlugs.map((role) => (
                      <Chip key={role} label={role} color="primary" variant="outlined" />
                    ))}
                  </Stack>
                </Box>

                <Typography variant="body2" color="text.secondary">
                  This invite expires on {new Date(data.invitation.expiresAt).toLocaleString()} and
                  can only be redeemed once.
                </Typography>

                <Stack spacing={1.5}>
                  {data.providers.map((provider) => (
                    <Button
                      key={provider.provider}
                      variant="contained"
                      size="large"
                      startIcon={<VerifiedUser />}
                      href={`/api/auth/invitations/${token}/start/${provider.provider}`}
                    >
                      Continue with {provider.label}
                    </Button>
                  ))}
                  {data.providers.length === 0 ? (
                    <Alert severity="warning">
                      No OAuth providers are configured yet. Contact the site owner to finish
                      provider setup.
                    </Alert>
                  ) : null}
                </Stack>
              </Stack>
            ) : null}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
