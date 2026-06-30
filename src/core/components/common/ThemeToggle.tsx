'use client';

import { IconButton, Tooltip, useTheme } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import { useTheme as useAppTheme } from '@/theme';

export function ThemeToggle() {
  const theme = useTheme();
  const { mode, toggleTheme } = useAppTheme();

  return (
    <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        onClick={toggleTheme}
        color="inherit"
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        data-testid="theme-toggle"
        sx={{
          width: 40,
          height: 40,
          transition: 'transform 0.3s ease',
          '&:hover': {
            transform: 'rotate(180deg)',
          },
          '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
        }}
      >
        {mode === 'dark' ? (
          <Brightness7 sx={{ color: theme.palette.primary.main }} />
        ) : (
          <Brightness4 sx={{ color: theme.palette.primary.main }} />
        )}
      </IconButton>
    </Tooltip>
  );
}
