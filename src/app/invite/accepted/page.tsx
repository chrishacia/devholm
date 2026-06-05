import { auth } from '@/auth';
import Link from '@/components/common/Link';
import { Alert, Box, Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import { AdminPanelSettings, Home, VerifiedUser } from '@mui/icons-material';

export default async function InviteAcceptedPage() {
  const session = await auth();
  const isAdmin = Boolean(session?.user?.isAdmin);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Card sx={{ borderRadius: 5 }}>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={2.5}>
              <Typography variant="h4" fontWeight={800}>
                Invitation accepted.
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Your local site account is now connected to the OAuth provider you used for this
                one-time invite.
              </Typography>
              {!session ? (
                <Alert severity="warning">
                  No active session was detected after invite redemption. Try signing in again from
                  the invitation link.
                </Alert>
              ) : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                {isAdmin ? (
                  <Button
                    component={Link}
                    href="/admin"
                    variant="contained"
                    startIcon={<AdminPanelSettings />}
                  >
                    Go to admin
                  </Button>
                ) : null}
                <Button
                  component={Link}
                  href="/"
                  variant={isAdmin ? 'outlined' : 'contained'}
                  startIcon={<Home />}
                >
                  Go to site
                </Button>
                <Button
                  component={Link}
                  href="/admin/profile"
                  variant="outlined"
                  startIcon={<VerifiedUser />}
                >
                  View account
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
