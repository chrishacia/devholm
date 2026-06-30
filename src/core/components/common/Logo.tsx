'use client';

import { Box, useTheme, alpha } from '@mui/material';
import Link from '@/components/common/Link';
import { useSiteSettings } from '@/hooks/useSiteSettings';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
}

const sizes = {
  small: { icon: 32, text: '1rem' },
  medium: { icon: 40, text: '1.25rem' },
  large: { icon: 48, text: '1.5rem' },
};

export function Logo({ size = 'medium' }: LogoProps) {
  const theme = useTheme();
  const { settings } = useSiteSettings();
  const { icon: iconSize, text: textSize } = sizes[size];

  return (
    <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          '&:hover .logo-glyph': {
            boxShadow: `0 0 24px ${alpha(theme.palette.primary.main, 0.6)}, 0 0 48px ${alpha(theme.palette.primary.main, 0.3)}`,
            '&::before': {
              transform: 'rotate(225deg)',
            },
          },
        }}
      >
        {/* Arcane Sigil Mark */}
        <Box
          className="logo-glyph"
          sx={{
            width: iconSize,
            height: iconSize,
            borderRadius: '6px',
            background: `linear-gradient(145deg, ${theme.palette.mode === 'dark' ? '#1A1A2A' : '#F0EDE8'} 0%, ${theme.palette.mode === 'dark' ? '#12121E' : '#E8E4E0'} 100%)`,
            border: `1.5px solid ${alpha(theme.palette.primary.main, 0.4)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden',
            // Inner glow effect
            boxShadow: `inset 0 0 12px ${alpha(theme.palette.primary.main, 0.15)}, 0 0 8px ${alpha(theme.palette.primary.main, 0.2)}`,
            // Outer ring
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '75%',
              height: '75%',
              border: `1.5px solid ${alpha(theme.palette.primary.main, 0.6)}`,
              borderRadius: '3px',
              transform: 'rotate(45deg)',
              transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            },
            // Core element - arcane energy
            '&::after': {
              content: '""',
              position: 'absolute',
              width: '35%',
              height: '35%',
              background: `radial-gradient(circle, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.main, 0.4)} 70%, transparent 100%)`,
              borderRadius: '50%',
              boxShadow: `0 0 8px ${theme.palette.primary.main}, 0 0 16px ${alpha(theme.palette.primary.main, 0.5)}`,
            },
          }}
        />

        {/* Text Mark */}
        <Box
          component="span"
          sx={{
            fontFamily: '"Crimson Pro", Georgia, serif',
            fontSize: textSize,
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: theme.palette.text.primary,
            display: { xs: size === 'small' ? 'none' : 'block', sm: 'block' },
            textShadow:
              theme.palette.mode === 'dark'
                ? `0 0 24px ${alpha(theme.palette.primary.main, 0.3)}`
                : 'none',
          }}
        >
          {settings?.site?.name || 'My Site'}
        </Box>
      </Box>
    </Link>
  );
}
