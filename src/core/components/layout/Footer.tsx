'use client';

import {
  Box,
  Container,
  Grid2 as Grid,
  Typography,
  IconButton,
  useTheme,
  alpha,
  SvgIcon,
} from '@mui/material';
import { useState, useEffect } from 'react';
import Link from '@/components/common/Link';
import { GitHub, LinkedIn, RssFeed, Facebook, Instagram, YouTube } from '@mui/icons-material';
import { Logo } from '@/components/common';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { footerNavigation } from '@/config';

// Custom icons for platforms not in MUI
function TikTokIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </SvgIcon>
  );
}

function DiscordIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </SvgIcon>
  );
}

function XIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </SvgIcon>
  );
}

// Social platform configuration with icons
const socialPlatforms = {
  twitter: { icon: XIcon, label: 'Twitter/X' },
  github: { icon: GitHub, label: 'GitHub' },
  linkedin: { icon: LinkedIn, label: 'LinkedIn' },
  facebook: { icon: Facebook, label: 'Facebook' },
  instagram: { icon: Instagram, label: 'Instagram' },
  tiktok: { icon: TikTokIcon, label: 'TikTok' },
  youtube: { icon: YouTube, label: 'YouTube' },
  discord: { icon: DiscordIcon, label: 'Discord' },
};

// Type for social link items (including RSS)
type SocialLink = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  href: string;
  label: string;
};

export function Footer() {
  const theme = useTheme();
  const { settings } = useSiteSettings();
  const footerMainNavigation = settings?.navigation.footerMain ?? footerNavigation.main;
  const footerResourcesNavigation =
    settings?.navigation.footerResources ?? footerNavigation.resources;
  // Use fixed year for SSR to prevent hydration mismatch
  const [currentYear, setCurrentYear] = useState(2026);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    setMounted(true);
  }, []);

  // Build social links dynamically from settings - only include ones that have values
  // Only render social links after mounting to prevent hydration mismatch
  const socialLinks: SocialLink[] = mounted
    ? Object.entries(socialPlatforms)
        .filter(([key]) => {
          const value = settings?.social?.[key as keyof typeof settings.social];
          return value && value.trim() !== '';
        })
        .map(([key, config]) => ({
          icon: config.icon,
          href: settings?.social?.[key as keyof typeof settings.social] || '',
          label: config.label,
        }))
    : [];

  // Always add RSS Feed at the end
  socialLinks.push({ icon: RssFeed, href: '/rss.xml', label: 'RSS Feed' });

  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        py: 6,
        backgroundColor: theme.palette.background.paper,
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="xl">
        <Grid container spacing={4}>
          {/* Logo & Description Column */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Logo size="medium" />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 3, maxWidth: 400 }}>
              {mounted ? settings?.site?.description || '' : ''}
            </Typography>

            {/* Social Links */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                maxWidth: 200, // Limits to ~4-5 icons per row
              }}
            >
              {socialLinks.map((social) => (
                <IconButton
                  key={social.label}
                  component="a"
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  size="small"
                  sx={{
                    color: theme.palette.text.secondary,
                    transition: 'all 0.2s',
                    p: 0.75,
                    '&:hover': {
                      color: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <social.icon sx={{ fontSize: 18 }} />
                </IconButton>
              ))}
            </Box>
          </Grid>

          {/* Navigation Column 1 */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Pages
            </Typography>
            <Box component="nav" aria-label="Footer navigation - Pages">
              {footerMainNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'block',
                    color: theme.palette.text.secondary,
                    textDecoration: 'none',
                    marginBottom: 8,
                    fontSize: '0.875rem',
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </Box>
          </Grid>

          {/* Navigation Column 2 */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Resources
            </Typography>
            <Box component="nav" aria-label="Footer navigation - Resources">
              {footerResourcesNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'block',
                    color: theme.palette.text.secondary,
                    textDecoration: 'none',
                    marginBottom: 8,
                    fontSize: '0.875rem',
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </Box>
          </Grid>
        </Grid>

        {/* Copyright */}
        <Box
          sx={{
            mt: 6,
            pt: 3,
            borderTop: `1px solid ${theme.palette.divider}`,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            © {currentYear} {mounted ? settings?.author?.name || 'Author' : 'Author'}. All rights
            reserved.
          </Typography>

          {/* Powered by DevHolm */}
          <Box
            component="a"
            href="https://github.com/chrishacia/devholm"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              textDecoration: 'none',
              color: theme.palette.text.secondary,
              transition: 'all 0.2s ease',
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              '&:hover': {
                color: theme.palette.text.primary,
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: '4px',
                background: 'linear-gradient(135deg, #22C55E 0%, #10B981 50%, #06B6D4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: 'white',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                DH
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              Powered by DevHolm
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
