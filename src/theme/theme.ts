import { createTheme, ThemeOptions, alpha, Theme } from '@mui/material/styles';

// =============================================================================
// Color Palette: GitHub - Clean Developer Aesthetic
// =============================================================================
// Inspired by GitHub's design system - professional, accessible, and familiar
// to developers worldwide. Clean whites, soft grays, and the iconic blue accent.

const palette = {
  // Primary: GitHub Blue - links, buttons, interactive elements
  blue: {
    main: '#0969DA',      // GitHub blue
    light: '#218BFF',
    dark: '#0550AE',
    muted: '#54AEFF',
    subtle: '#DDF4FF',
    contrastText: '#FFFFFF',
  },
  // Secondary: GitHub Green - success, merge, positive actions
  green: {
    main: '#1A7F37',
    light: '#2DA44E',
    dark: '#116329',
    muted: '#4AC26B',
    subtle: '#DAFBE1',
    contrastText: '#FFFFFF',
  },
  // Accent: GitHub Purple - special highlights, visited links
  purple: {
    main: '#8250DF',
    light: '#A475F9',
    dark: '#6639BA',
    muted: '#C297FF',
    subtle: '#FBEFFF',
    contrastText: '#FFFFFF',
  },
  // Danger: GitHub Red - errors, destructive actions
  red: {
    main: '#CF222E',
    light: '#FA4549',
    dark: '#A40E26',
    muted: '#FF8182',
    subtle: '#FFEBE9',
    contrastText: '#FFFFFF',
  },
  // Warning: GitHub Orange/Yellow - caution, pending
  orange: {
    main: '#BF8700',
    light: '#D4A72C',
    dark: '#9A6700',
    muted: '#D4A72C',
    subtle: '#FFF8C5',
    contrastText: '#1F2328',
  },
  // Coral: GitHub accent for highlights
  coral: {
    main: '#F78166',
    light: '#FFA28B',
    dark: '#DA6D56',
    contrastText: '#FFFFFF',
  },
};

// GitHub Dark Mode Colors
const darkColors = {
  canvas: {
    default: '#0D1117',     // Main background
    overlay: '#161B22',     // Overlays, dropdowns
    inset: '#010409',       // Inset backgrounds
    subtle: '#161B22',      // Subtle backgrounds
  },
  fg: {
    default: '#E6EDF3',     // Primary text
    muted: '#8D96A0',       // Secondary text
    subtle: '#6E7681',      // Tertiary text
    onEmphasis: '#FFFFFF',  // Text on colored backgrounds
  },
  border: {
    default: '#30363D',
    muted: '#21262D',
    subtle: 'rgba(240,246,252,0.1)',
  },
  neutral: {
    emphasisPlus: '#6E7681',
    emphasis: '#6E7681',
    muted: 'rgba(110,118,129,0.4)',
    subtle: 'rgba(110,118,129,0.1)',
  },
};

// GitHub Light Mode Colors
const lightColors = {
  canvas: {
    default: '#FFFFFF',     // Main background
    overlay: '#FFFFFF',     // Overlays, dropdowns
    inset: '#F6F8FA',       // Inset backgrounds
    subtle: '#F6F8FA',      // Subtle backgrounds
  },
  fg: {
    default: '#1F2328',     // Primary text
    muted: '#636C76',       // Secondary text
    subtle: '#6E7681',      // Tertiary text
    onEmphasis: '#FFFFFF',  // Text on colored backgrounds
  },
  border: {
    default: '#D0D7DE',
    muted: '#D8DEE4',
    subtle: 'rgba(27,31,36,0.15)',
  },
  neutral: {
    emphasisPlus: '#24292F',
    emphasis: '#6E7681',
    muted: 'rgba(175,184,193,0.2)',
    subtle: 'rgba(234,238,242,0.5)',
  },
};

// =============================================================================
// Dark Theme - GitHub Dark
// =============================================================================

const darkThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: palette.blue.main,
      light: palette.blue.light,
      dark: palette.blue.dark,
      contrastText: palette.blue.contrastText,
    },
    secondary: {
      main: palette.purple.main,
      light: palette.purple.light,
      dark: palette.purple.dark,
      contrastText: palette.purple.contrastText,
    },
    error: {
      main: palette.red.main,
      light: palette.red.light,
      dark: palette.red.dark,
    },
    success: {
      main: palette.green.main,
      light: palette.green.light,
      dark: palette.green.dark,
    },
    info: {
      main: palette.blue.main,
      light: palette.blue.light,
      dark: palette.blue.dark,
    },
    warning: {
      main: palette.orange.main,
      light: palette.orange.light,
      dark: palette.orange.dark,
    },
    background: {
      default: darkColors.canvas.default,
      paper: darkColors.canvas.overlay,
    },
    text: {
      primary: darkColors.fg.default,
      secondary: darkColors.fg.muted,
      disabled: darkColors.fg.subtle,
    },
    divider: darkColors.border.default,
    action: {
      hover: alpha(palette.blue.main, 0.1),
      selected: alpha(palette.blue.main, 0.15),
      focus: alpha(palette.blue.main, 0.12),
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    h1: {
      fontWeight: 600,
      fontSize: '2.5rem',
      lineHeight: 1.25,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.25,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.25,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1rem',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      fontWeight: 500,
      textTransform: 'none',
      fontSize: '0.875rem',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
  },
  shape: {
    borderRadius: 6,
  },
  shadows: [
    'none',
    `0 1px 0 ${darkColors.border.default}`,
    `0 1px 0 ${darkColors.border.default}, 0 1px 3px ${alpha('#000', 0.12)}`,
    `0 8px 24px ${alpha('#000', 0.2)}`,
    `0 8px 24px ${alpha('#000', 0.25)}`,
    `0 12px 28px ${alpha('#000', 0.3)}`,
    `0 12px 28px ${alpha('#000', 0.35)}`,
    `0 16px 32px ${alpha('#000', 0.4)}`,
    `0 16px 32px ${alpha('#000', 0.45)}`,
    `0 20px 36px ${alpha('#000', 0.5)}`,
    `0 20px 36px ${alpha('#000', 0.55)}`,
    `0 24px 40px ${alpha('#000', 0.6)}`,
    `0 24px 40px ${alpha('#000', 0.65)}`,
    `0 28px 44px ${alpha('#000', 0.7)}`,
    `0 28px 44px ${alpha('#000', 0.75)}`,
    `0 32px 48px ${alpha('#000', 0.8)}`,
    `0 32px 48px ${alpha('#000', 0.85)}`,
    `0 36px 52px ${alpha('#000', 0.9)}`,
    `0 36px 52px ${alpha('#000', 0.95)}`,
    `0 40px 56px ${alpha('#000', 1)}`,
    `0 40px 56px ${alpha('#000', 1)}`,
    `0 44px 60px ${alpha('#000', 1)}`,
    `0 44px 60px ${alpha('#000', 1)}`,
    `0 48px 64px ${alpha('#000', 1)}`,
    `0 48px 64px ${alpha('#000', 1)}`,
  ] as Theme['shadows'],
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        ::selection {
          background: ${alpha(palette.blue.main, 0.4)};
          color: ${darkColors.fg.default};
        }
        
        html {
          scroll-behavior: smooth;
        }
        
        body {
          scrollbar-width: thin;
          scrollbar-color: ${darkColors.border.default} ${darkColors.canvas.default};
        }
        
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        
        ::-webkit-scrollbar-track {
          background: ${darkColors.canvas.default};
        }
        
        ::-webkit-scrollbar-thumb {
          background: ${darkColors.border.default};
          border-radius: 5px;
          border: 2px solid ${darkColors.canvas.default};
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: ${darkColors.fg.subtle};
        }
        
        /* GitHub-style code blocks */
        code {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 85%;
          background: ${alpha(darkColors.neutral.emphasis, 0.4)};
          border-radius: 6px;
          padding: 0.2em 0.4em;
        }
        
        pre code {
          background: transparent;
          padding: 0;
        }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: '5px 16px',
          fontWeight: 500,
          fontSize: '14px',
          lineHeight: '20px',
          transition: 'all 0.12s ease-out',
          '&:focus-visible': {
            outline: `2px solid ${palette.blue.main}`,
            outlineOffset: 2,
          },
        },
        contained: {
          boxShadow: `0 1px 0 ${alpha('#000', 0.1)}`,
          '&:hover': {
            boxShadow: `0 1px 0 ${alpha('#000', 0.1)}`,
          },
        },
        containedPrimary: {
          backgroundColor: palette.green.light,
          color: '#FFFFFF',
          border: `1px solid ${alpha('#000', 0.1)}`,
          '&:hover': {
            backgroundColor: palette.green.main,
          },
        },
        containedSecondary: {
          backgroundColor: darkColors.canvas.subtle,
          color: darkColors.fg.default,
          border: `1px solid ${darkColors.border.default}`,
          '&:hover': {
            backgroundColor: darkColors.border.muted,
            borderColor: darkColors.fg.subtle,
          },
        },
        containedError: {
          backgroundColor: palette.red.main,
          '&:hover': {
            backgroundColor: palette.red.dark,
          },
        },
        outlined: {
          borderColor: darkColors.border.default,
          color: darkColors.fg.default,
          backgroundColor: darkColors.canvas.subtle,
          '&:hover': {
            backgroundColor: darkColors.border.muted,
            borderColor: darkColors.fg.subtle,
          },
        },
        outlinedPrimary: {
          borderColor: darkColors.border.default,
          color: darkColors.fg.default,
          '&:hover': {
            backgroundColor: darkColors.border.muted,
            borderColor: darkColors.fg.subtle,
          },
        },
        text: {
          color: palette.blue.main,
          '&:hover': {
            backgroundColor: alpha(palette.blue.main, 0.1),
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: darkColors.canvas.overlay,
          borderBottom: `1px solid ${darkColors.border.default}`,
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: darkColors.canvas.overlay,
          borderRadius: 6,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: 'none',
          '&:hover': {
            borderColor: darkColors.border.default,
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: darkColors.canvas.overlay,
          borderRadius: 6,
          border: `1px solid ${darkColors.border.default}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '2em',
          fontWeight: 500,
          fontSize: '12px',
          height: 24,
        },
        filled: {
          backgroundColor: alpha(palette.blue.main, 0.15),
          color: palette.blue.light,
          '&:hover': {
            backgroundColor: alpha(palette.blue.main, 0.25),
          },
        },
        outlined: {
          borderColor: darkColors.border.default,
          '&:hover': {
            backgroundColor: darkColors.neutral.subtle,
          },
        },
        colorSuccess: {
          backgroundColor: alpha(palette.green.main, 0.15),
          color: palette.green.muted,
        },
        colorError: {
          backgroundColor: alpha(palette.red.main, 0.15),
          color: palette.red.muted,
        },
        colorWarning: {
          backgroundColor: alpha(palette.orange.main, 0.15),
          color: palette.orange.light,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: palette.blue.main,
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: darkColors.canvas.default,
            '& fieldset': {
              borderColor: darkColors.border.default,
            },
            '&:hover fieldset': {
              borderColor: darkColors.fg.subtle,
            },
            '&.Mui-focused fieldset': {
              borderColor: palette.blue.main,
              borderWidth: 2,
              boxShadow: `0 0 0 3px ${alpha(palette.blue.main, 0.3)}`,
            },
          },
          '& .MuiInputLabel-root': {
            color: darkColors.fg.muted,
            '&.Mui-focused': {
              color: palette.blue.main,
            },
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: darkColors.canvas.overlay,
          borderRight: `1px solid ${darkColors.border.default}`,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          border: '1px solid',
        },
        standardError: {
          backgroundColor: alpha(palette.red.main, 0.1),
          borderColor: alpha(palette.red.main, 0.3),
          color: palette.red.muted,
          '& .MuiAlert-icon': {
            color: palette.red.main,
          },
        },
        standardSuccess: {
          backgroundColor: alpha(palette.green.main, 0.1),
          borderColor: alpha(palette.green.main, 0.3),
          color: palette.green.muted,
          '& .MuiAlert-icon': {
            color: palette.green.main,
          },
        },
        standardInfo: {
          backgroundColor: alpha(palette.blue.main, 0.1),
          borderColor: alpha(palette.blue.main, 0.3),
          color: palette.blue.muted,
          '& .MuiAlert-icon': {
            color: palette.blue.main,
          },
        },
        standardWarning: {
          backgroundColor: alpha(palette.orange.main, 0.1),
          borderColor: alpha(palette.orange.main, 0.3),
          color: palette.orange.light,
          '& .MuiAlert-icon': {
            color: palette.orange.main,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: darkColors.fg.default,
          color: darkColors.canvas.default,
          fontSize: '12px',
          padding: '6px 10px',
          borderRadius: 6,
        },
        arrow: {
          color: darkColors.fg.default,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: `2px solid ${darkColors.border.default}`,
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 6,
            border: `1px solid ${darkColors.border.default}`,
            '&.Mui-selected': {
              backgroundColor: palette.blue.main,
              color: '#FFFFFF',
              borderColor: palette.blue.main,
            },
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: palette.coral.main,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 400,
          minHeight: 48,
          color: darkColors.fg.muted,
          '&.Mui-selected': {
            color: darkColors.fg.default,
            fontWeight: 600,
          },
          '&:hover': {
            color: darkColors.fg.default,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          '&.Mui-selected': {
            backgroundColor: alpha(palette.blue.main, 0.15),
            '&:hover': {
              backgroundColor: alpha(palette.blue.main, 0.2),
            },
          },
          '&:hover': {
            backgroundColor: darkColors.neutral.subtle,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: darkColors.canvas.overlay,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: `0 8px 24px ${alpha('#000', 0.5)}`,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: darkColors.canvas.overlay,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: `0 8px 24px ${alpha('#000', 0.25)}`,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: '2px 6px',
          fontSize: '14px',
          '&:hover': {
            backgroundColor: darkColors.neutral.subtle,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(palette.blue.main, 0.15),
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: darkColors.border.default,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: darkColors.neutral.muted,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${darkColors.border.default}`,
        },
        head: {
          fontWeight: 600,
          backgroundColor: darkColors.canvas.subtle,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: darkColors.neutral.subtle,
          },
        },
      },
    },
  },
};

// =============================================================================
// Light Theme - GitHub Light
// =============================================================================

const lightThemeOptions: ThemeOptions = {
  ...darkThemeOptions,
  palette: {
    mode: 'light',
    primary: {
      main: palette.blue.main,
      light: palette.blue.light,
      dark: palette.blue.dark,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: palette.purple.main,
      light: palette.purple.light,
      dark: palette.purple.dark,
      contrastText: '#FFFFFF',
    },
    error: {
      main: palette.red.main,
      light: palette.red.light,
      dark: palette.red.dark,
    },
    success: {
      main: palette.green.light,
      light: palette.green.muted,
      dark: palette.green.dark,
    },
    info: {
      main: palette.blue.main,
      light: palette.blue.light,
      dark: palette.blue.dark,
    },
    warning: {
      main: palette.orange.main,
      light: palette.orange.light,
      dark: palette.orange.dark,
    },
    background: {
      default: lightColors.canvas.default,
      paper: lightColors.canvas.default,
    },
    text: {
      primary: lightColors.fg.default,
      secondary: lightColors.fg.muted,
      disabled: lightColors.fg.subtle,
    },
    divider: lightColors.border.default,
    action: {
      hover: alpha(palette.blue.main, 0.06),
      selected: alpha(palette.blue.main, 0.1),
      focus: alpha(palette.blue.main, 0.08),
    },
  },
  components: {
    ...darkThemeOptions.components,
    MuiCssBaseline: {
      styleOverrides: `
        ::selection {
          background: ${alpha(palette.blue.main, 0.3)};
          color: ${lightColors.fg.default};
        }
        
        html {
          scroll-behavior: smooth;
        }
        
        body {
          scrollbar-width: thin;
          scrollbar-color: ${lightColors.border.default} ${lightColors.canvas.inset};
        }
        
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        
        ::-webkit-scrollbar-track {
          background: ${lightColors.canvas.inset};
        }
        
        ::-webkit-scrollbar-thumb {
          background: ${lightColors.border.default};
          border-radius: 5px;
          border: 2px solid ${lightColors.canvas.inset};
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: ${lightColors.fg.subtle};
        }
        
        /* GitHub-style code blocks */
        code {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 85%;
          background: ${lightColors.canvas.inset};
          border-radius: 6px;
          padding: 0.2em 0.4em;
        }
        
        pre code {
          background: transparent;
          padding: 0;
        }
      `,
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: lightColors.canvas.default,
          borderBottom: `1px solid ${lightColors.border.default}`,
          boxShadow: 'none',
          color: lightColors.fg.default,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: lightColors.canvas.default,
          borderRadius: 6,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: `0 1px 0 ${alpha('#000', 0.04)}`,
          '&:hover': {
            boxShadow: `0 1px 3px ${alpha('#000', 0.08)}`,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: lightColors.canvas.default,
          borderRadius: 6,
          border: `1px solid ${lightColors.border.default}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          backgroundColor: palette.green.light,
          color: '#FFFFFF',
          border: `1px solid ${alpha('#000', 0.1)}`,
          '&:hover': {
            backgroundColor: palette.green.main,
          },
        },
        containedSecondary: {
          backgroundColor: lightColors.canvas.inset,
          color: lightColors.fg.default,
          border: `1px solid ${lightColors.border.default}`,
          '&:hover': {
            backgroundColor: lightColors.border.muted,
            borderColor: lightColors.fg.subtle,
          },
        },
        outlined: {
          borderColor: lightColors.border.default,
          color: lightColors.fg.default,
          backgroundColor: lightColors.canvas.default,
          '&:hover': {
            backgroundColor: lightColors.canvas.inset,
            borderColor: lightColors.fg.subtle,
          },
        },
        outlinedPrimary: {
          borderColor: lightColors.border.default,
          color: lightColors.fg.default,
          '&:hover': {
            backgroundColor: lightColors.canvas.inset,
            borderColor: lightColors.fg.subtle,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        filled: {
          backgroundColor: palette.blue.subtle,
          color: palette.blue.dark,
          '&:hover': {
            backgroundColor: alpha(palette.blue.main, 0.2),
          },
        },
        outlined: {
          borderColor: lightColors.border.default,
          '&:hover': {
            backgroundColor: lightColors.canvas.inset,
          },
        },
        colorSuccess: {
          backgroundColor: palette.green.subtle,
          color: palette.green.dark,
        },
        colorError: {
          backgroundColor: palette.red.subtle,
          color: palette.red.dark,
        },
        colorWarning: {
          backgroundColor: palette.orange.subtle,
          color: palette.orange.dark,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: lightColors.canvas.default,
            '& fieldset': {
              borderColor: lightColors.border.default,
            },
            '&:hover fieldset': {
              borderColor: lightColors.fg.subtle,
            },
            '&.Mui-focused fieldset': {
              borderColor: palette.blue.main,
              borderWidth: 2,
              boxShadow: `0 0 0 3px ${alpha(palette.blue.main, 0.15)}`,
            },
          },
          '& .MuiInputLabel-root': {
            color: lightColors.fg.muted,
            '&.Mui-focused': {
              color: palette.blue.main,
            },
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: lightColors.canvas.default,
          borderRight: `1px solid ${lightColors.border.default}`,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardError: {
          backgroundColor: palette.red.subtle,
          borderColor: alpha(palette.red.main, 0.3),
          color: palette.red.dark,
          '& .MuiAlert-icon': {
            color: palette.red.main,
          },
        },
        standardSuccess: {
          backgroundColor: palette.green.subtle,
          borderColor: alpha(palette.green.main, 0.3),
          color: palette.green.dark,
          '& .MuiAlert-icon': {
            color: palette.green.main,
          },
        },
        standardInfo: {
          backgroundColor: palette.blue.subtle,
          borderColor: alpha(palette.blue.main, 0.3),
          color: palette.blue.dark,
          '& .MuiAlert-icon': {
            color: palette.blue.main,
          },
        },
        standardWarning: {
          backgroundColor: palette.orange.subtle,
          borderColor: alpha(palette.orange.main, 0.3),
          color: palette.orange.dark,
          '& .MuiAlert-icon': {
            color: palette.orange.main,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: lightColors.fg.default,
          color: lightColors.canvas.default,
        },
        arrow: {
          color: lightColors.fg.default,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: `2px solid ${lightColors.border.default}`,
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 6,
            border: `1px solid ${lightColors.border.default}`,
            '&.Mui-selected': {
              backgroundColor: palette.blue.main,
              color: '#FFFFFF',
              borderColor: palette.blue.main,
            },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: lightColors.fg.muted,
          '&.Mui-selected': {
            color: lightColors.fg.default,
          },
          '&:hover': {
            color: lightColors.fg.default,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          '&.Mui-selected': {
            backgroundColor: alpha(palette.blue.main, 0.1),
            '&:hover': {
              backgroundColor: alpha(palette.blue.main, 0.15),
            },
          },
          '&:hover': {
            backgroundColor: lightColors.neutral.subtle,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: lightColors.canvas.default,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: `0 8px 24px ${alpha('#000', 0.15)}`,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: lightColors.canvas.default,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: `0 8px 24px ${alpha('#000', 0.12)}`,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: lightColors.canvas.inset,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(palette.blue.main, 0.1),
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: lightColors.border.default,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: lightColors.neutral.muted,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${lightColors.border.default}`,
        },
        head: {
          fontWeight: 600,
          backgroundColor: lightColors.canvas.inset,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: lightColors.canvas.inset,
          },
        },
      },
    },
  },
};

// =============================================================================
// Theme Exports
// =============================================================================

export const darkTheme = createTheme(darkThemeOptions);
export const lightTheme = createTheme(lightThemeOptions);

export function getTheme(mode: 'light' | 'dark') {
  return mode === 'dark' ? darkTheme : lightTheme;
}

// Export palette for use in components
export { palette, darkColors, lightColors };
