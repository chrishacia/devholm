'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Container,
  Grid2,
  TextField,
  Button,
  Alert,
  Snackbar,
  Paper,
  alpha,
} from '@mui/material';
import { Send, LinkedIn, GitHub, Twitter } from '@mui/icons-material';
import { AuthAwareMainLayout } from '@/components';
import Link from '@/components/common/Link';
import type { SiteSettings } from '@/hooks/useSiteSettings';

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string; // Honeypot field - should remain empty
}

const initialFormData: FormData = {
  name: '',
  email: '',
  subject: '',
  message: '',
  website: '', // Honeypot
};

interface SocialLinkItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  value: string;
}

function SocialLinkItem({ icon: IconComponent, label, href, value }: SocialLinkItemProps) {
  return (
    <Box
      component={Link}
      href={href}
      target="_blank"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2.5,
        textDecoration: 'none',
        color: 'inherit',
        p: 2.5,
        borderRadius: 2,
        transition: 'background 0.2s',
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          display: 'flex',
        }}
      >
        <IconComponent color="primary" />
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body1" fontWeight={500}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

interface ContactPageClientProps {
  settings: SiteSettings;
}

export default function ContactPage({ settings }: ContactPageClientProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [formLoadTime] = useState<number>(() => Date.now()); // Track when form loaded for bot detection
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          timestamp: formLoadTime, // Include form load time for bot detection
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSnackbar({
          open: true,
          message: "Message sent successfully! I'll get back to you soon.",
          severity: 'success',
        });
        setFormData(initialFormData);
      } else {
        // Show specific error message from server
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to send message. Please try again or email me directly.',
        severity: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Contact
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Have a question, project idea, or just want to say hello? I&apos;d love to hear from
            you.
          </Typography>
        </Box>

        <Grid2 container spacing={4}>
          {/* Contact Form */}
          <Grid2 size={{ xs: 12, md: 7 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
                Send a Message
              </Typography>
              <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
                <Grid2 container spacing={3}>
                  <Grid2 size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      required
                      label="Name"
                      placeholder="Your name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      variant="outlined"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      required
                      type="email"
                      label="Email"
                      placeholder="your@email.com"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      variant="outlined"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid2>
                  <Grid2 size={12}>
                    <TextField
                      fullWidth
                      required
                      label="Subject"
                      placeholder="What's this about?"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      variant="outlined"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid2>
                  <Grid2 size={12}>
                    <TextField
                      fullWidth
                      required
                      multiline
                      rows={6}
                      label="Message"
                      placeholder="Your message..."
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      variant="outlined"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid2>
                  {/* Honeypot field - hidden from real users, bots will fill it */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: '-9999px',
                      opacity: 0,
                      height: 0,
                      overflow: 'hidden',
                      pointerEvents: 'none',
                    }}
                    aria-hidden="true"
                  >
                    <TextField
                      label="Website"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </Box>
                  <Grid2 size={12}>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={isSubmitting}
                      endIcon={<Send />}
                      sx={{ minWidth: 200 }}
                    >
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                    </Button>
                  </Grid2>
                </Grid2>
              </Box>
            </Paper>
          </Grid2>

          {/* Contact Info */}
          <Grid2 size={{ xs: 12, md: 5 }}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                background: (theme) =>
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.primary.dark, 0.1)
                    : alpha(theme.palette.primary.light, 0.1),
              }}
            >
              <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
                Other Ways to Reach Me
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Feel free to connect with me on any of these platforms.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {settings?.social?.linkedin && (
                  <SocialLinkItem
                    icon={LinkedIn}
                    label="LinkedIn"
                    href={`https://linkedin.com/in/${settings.social.linkedin}`}
                    value={settings.social.linkedin}
                  />
                )}
                {settings?.social?.github && (
                  <SocialLinkItem
                    icon={GitHub}
                    label="GitHub"
                    href={`https://github.com/${settings.social.github}`}
                    value={settings.social.github}
                  />
                )}
                {settings?.social?.twitter && (
                  <SocialLinkItem
                    icon={Twitter}
                    label="X (Twitter)"
                    href={`https://twitter.com/${settings.social.twitter}`}
                    value={settings.social.twitter}
                  />
                )}
                {!settings?.social?.linkedin &&
                  !settings?.social?.github &&
                  !settings?.social?.twitter && (
                    <Typography variant="body2" color="text.secondary">
                      Use the contact form to get in touch.
                    </Typography>
                  )}
              </Box>
            </Paper>

            {/* Response Time */}
            <Alert severity="info" sx={{ mt: 3 }}>
              I typically respond within 24-48 hours. For urgent matters, please mention it in your
              subject line.
            </Alert>
          </Grid2>
        </Grid2>
      </Container>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AuthAwareMainLayout>
  );
}
