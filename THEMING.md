# Theming Guide

This document explains how to customize the color scheme and visual appearance of the site. The application uses [Material UI (MUI) v6](https://mui.com/) with a custom theme that supports both **dark** and **light** modes.

## Table of Contents

- [Overview](#overview)
- [File Structure](#file-structure)
- [Quick Start: Changing Colors](#quick-start-changing-colors)
- [Understanding the Palette](#understanding-the-palette)
- [Customizing Dark Mode](#customizing-dark-mode)
- [Customizing Light Mode](#customizing-light-mode)
- [Component Overrides](#component-overrides)
- [Typography](#typography)
- [Adding New Colors](#adding-new-colors)
- [CSS Variables and Global Styles](#css-variables-and-global-styles)
- [Testing Your Changes](#testing-your-changes)

---

## Overview

The theme system follows MUI's standard theming approach using `createTheme()`. The current design is called **"Arcane"** — inspired by the League of Legends animated series, featuring deep blues, glowing cyans, and vibrant magentas that evoke the contrast between Piltover's pristine technology and Zaun's gritty undercity.

**Key features:**

- System-aware dark/light mode detection
- Manual toggle via UI
- Persistent preference (saved to localStorage)
- Comprehensive component overrides for consistent styling

**Color Inspiration:**

- **Dark Mode (Zaun/Undercity):** Deep navy blues with glowing hextech cyan accents
- **Light Mode (Piltover):** Clean, cool grays with deeper teal-cyan accents

---

## File Structure

All theme-related files are located in `src/theme/`:

```
src/theme/
├── index.ts           # Re-exports for clean imports
├── theme.ts           # 🎨 Main theme configuration (edit this!)
└── ThemeProvider.tsx  # React context and MUI provider setup
```

Additionally, some base CSS is in:

```
src/app/globals.css    # Base styles, focus outlines, theme flash prevention
```

---

## Quick Start: Changing Colors

f

### Changing the Primary Color

Open `src/theme/theme.ts` and find the `palette` object near the top (around line 11):

```typescript
const palette = {
  // Primary: Hextech Cyan - the glow of arcane magic and hextech
  arcane: {
    main: '#7DD4EA', // ← Change this for primary color
    light: '#A8E4F4', // ← Lighter variant
    dark: '#4ABCD8', // ← Darker variant
    glow: '#B8F0FF', // ← Used for glow effects
    contrastText: '#0A1628',
  },
  // ...
};
```

**To change the primary color:**

1. Replace `#7DD4EA` with your desired hex color
2. Generate `light` and `dark` variants (typically ±15-20% lightness)
3. Set `contrastText` to white (`#FFFFFF`) or dark (`#0A1628`) based on contrast needs

### Example: Green Primary Theme

```typescript
arcane: {
  main: '#4ADE80',        // Bright green
  light: '#86EFAC',       // Lighter green
  dark: '#22C55E',        // Darker green
  glow: '#BBF7D0',        // Glow effect
  contrastText: '#0A1628',
},
```

---

## Understanding the Palette

The custom palette uses semantic color names that map to MUI's standard palette:

| Custom Name | MUI Mapping       | Purpose                                           |
| ----------- | ----------------- | ------------------------------------------------- |
| `arcane`    | `primary`         | Primary actions, links, highlights (Hextech cyan) |
| `shimmer`   | `secondary`       | Secondary actions, accents (Shimmer magenta-pink) |
| `undercity` | `info`            | Informational elements (Steel blue-gray)          |
| `ember`     | `error`           | Errors, destructive actions (Chemtech red-pink)   |
| `verdant`   | `success`         | Success states, confirmations (Teal-green)        |
| `void`      | Background colors | Dark mode backgrounds (Deep blues)                |
| `ink`       | Text colors       | Dark mode typography (Cool blue-whites)           |

### Color Relationships

Each color group has consistent variants:

```typescript
colorName: {
  main: '#...',         // Primary color (used most often)
  light: '#...',        // Hover states, light accents
  dark: '#...',         // Active states, darker accents
  glow: '#...',         // Special effects (optional)
  contrastText: '#...', // Text color on this background
}
```

---

## Customizing Dark Mode

Dark mode settings start at line 68 in `theme.ts`:

### Background Colors

```typescript
// In the palette object (line 50):
void: {
  deepest: '#060D18',   // Deepest undercity
  deep: '#0A1628',      // Deep shadow blue (app bar)
  mid: '#122438',       // Main background (background.default)
  elevated: '#1A3048',  // Cards, papers (background.paper)
  muted: '#243A54',     // Muted surfaces
  light: '#2E4A68',     // Lighter surfaces
},
```

**To make dark mode lighter or darker:**

1. Adjust the `void` colors (higher hex values = lighter)
2. The `background.default` uses `palette.void.mid`
3. The `background.paper` uses `palette.void.elevated`

### Text Colors

```typescript
ink: {
  primary: '#E8F0F8',   // Cool white with blue tint
  secondary: '#A0B8C8', // Muted blue-gray
  muted: '#708898',     // Faded blue text
  disabled: '#485868',  // Very faded
},
```

---

## Customizing Light Mode

Light mode settings start around line 700 in `theme.ts`:

```typescript
const lightPalette = {
  background: {
    default: '#F0F4F8', // Cool light gray with blue tint (Piltover)
    paper: '#FFFFFF', // Cards, papers
    elevated: '#F8FAFC', // Elevated surfaces
  },
  text: {
    primary: '#0A1628', // Deep blue-black
    secondary: '#3A4A5A', // Secondary text
    muted: '#6A7A8A', // Muted text
    disabled: '#9AAABA', // Disabled text
  },
  // Adjusted colors for light mode - darker for white text contrast
  arcane: {
    main: '#1A7090', // Darker teal-cyan for white text
    light: '#2A8AAA',
    dark: '#0A5070',
    glow: '#4AAACA',
  },
  shimmer: {
    main: '#8A3070', // Darker magenta for white text
    light: '#A04080',
    dark: '#6A2050',
  },
};
```

**Important:** Light mode colors are often darker versions of dark mode colors to maintain contrast and readability.

---

## Component Overrides

MUI components are customized in the `components` section of each theme (starting around line 213 for dark mode). Here are some common customizations:

### Buttons

All button color variants have explicit text colors set for proper contrast:

**Dark Mode:**

- Primary (cyan): Dark text (`#0A1628`) on bright cyan background
- Secondary (pink): White text on magenta background
- Error (red-pink): White text
- Success (teal-green): White text
- Info (steel gray): White text
- Warning (amber): Dark text (`#0A1628`) on bright amber

**Light Mode:**

- Primary (teal): Soft blue-white (`#E8F4F8`) on dark teal
- Secondary (magenta): Soft pink-white (`#F8E8F4`) on dark magenta
- Error: Soft pink-white (`#FFF0F2`)
- Success: Soft green-white (`#E8F8EE`)
- Info: Soft blue-white (`#E8F4F8`)
- Warning: Soft yellow-white (`#FFF8E8`)

```typescript
MuiButton: {
  styleOverrides: {
    root: {
      borderRadius: 6,           // Rounded corners
      padding: '10px 20px',      // Spacing
      fontWeight: 600,           // Bold text
    },
    containedPrimary: {
      background: `linear-gradient(135deg, ${palette.arcane.main} 0%, ${palette.arcane.dark} 100%)`,
      color: '#0A1628 !important', // Dark text for contrast on cyan
    },
    contained: {
      // Filled button styles
      boxShadow: `0 2px 8px ${alpha(palette.arcane.main, 0.3)}`,
    },
    outlined: {
      // Outlined button styles
      borderWidth: 1.5,
    },
  },
},
```

### Cards

```typescript
MuiCard: {
  styleOverrides: {
    root: {
      backgroundColor: palette.void.elevated,
      borderRadius: 8,
      border: `1px solid ${alpha(palette.arcane.main, 0.08)}`,
      // Hover effects
      '&:hover': {
        borderColor: alpha(palette.arcane.main, 0.2),
        boxShadow: `0 8px 32px ${alpha('#000', 0.4)}`,
      },
    },
  },
},
```

### Text Fields

```typescript
MuiTextField: {
  styleOverrides: {
    root: {
      '& .MuiOutlinedInput-root': {
        backgroundColor: alpha(palette.void.deep, 0.5),
        '& fieldset': {
          borderColor: alpha(palette.arcane.main, 0.2),
        },
        '&.Mui-focused fieldset': {
          borderColor: palette.arcane.main,
        },
      },
    },
  },
},
```

---

## Typography

Typography settings are in the `typography` section (around line 117):

```typescript
typography: {
  // Base font for body text
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',

  // Heading font (serif for elegance)
  h1: {
    fontFamily: '"Crimson Pro", Georgia, serif',
    fontWeight: 600,
    fontSize: '3rem',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  // ... h2-h6 follow similar pattern

  body1: {
    fontSize: '1rem',
    lineHeight: 1.75,
  },

  button: {
    fontWeight: 600,
    textTransform: 'none',  // Prevents ALL CAPS buttons
  },
},
```

**To change fonts:**

1. Update the `fontFamily` values
2. If using custom fonts, ensure they're loaded in `src/app/layout.tsx`

---

## Adding New Colors

To add a custom color that can be used throughout the app:

### 1. Add to the palette object

```typescript
const palette = {
  // ... existing colors

  // Your new color
  custom: {
    main: '#FF6B6B',
    light: '#FF8E8E',
    dark: '#E54848',
    contrastText: '#FFFFFF',
  },
};
```

### 2. Add to the theme palette

```typescript
const darkThemeOptions: ThemeOptions = {
  palette: {
    // ... existing palette

    // Add your color (you can use any key, or override existing ones)
    custom: {
      main: palette.custom.main,
      light: palette.custom.light,
      dark: palette.custom.dark,
      contrastText: palette.custom.contrastText,
    },
  },
};
```

### 3. Use in components

```tsx
import { useTheme } from '@mui/material/styles';

function MyComponent() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.custom?.main,
        // or use MUI's color prop where supported
      }}
    >
      Content
    </Box>
  );
}
```

---

## CSS Variables and Global Styles

### globals.css

The `src/app/globals.css` file contains:

1. **Theme flash prevention** - Sets initial background color before React hydrates
2. **Base resets** - Minimal CSS reset that doesn't conflict with MUI
3. **Focus styles** - Accessibility-focused outline styles
4. **Skip links** - For keyboard navigation

```css
/* Theme flash prevention */
html {
  background-color: #122438; /* Dark mode default - Arcane undercity */
  color-scheme: dark;
}

html[data-theme='light'] {
  background-color: #f0f4f8; /* Light mode - Piltover */
  color-scheme: light;
}

/* Focus styles */
:focus-visible {
  outline: 2px solid var(--focus-color, #7dd4ea);
  outline-offset: 2px;
}
```

### CSS Variables in Theme

The theme injects CSS variables via `MuiCssBaseline`:

```typescript
MuiCssBaseline: {
  styleOverrides: `
    :root {
      --glow-arcane: ${palette.arcane.glow};
      --glow-shimmer: ${palette.shimmer.glow};
      --glow-undercity: ${palette.undercity.glow};
    }
  `,
},
```

Use these in custom CSS when needed:

```css
.my-element {
  box-shadow: 0 0 20px var(--glow-arcane);
}
```

---

## Testing Your Changes

### Development Server

```bash
pnpm dev
```

### Toggle Theme

Use the theme toggle in the UI (usually in the header/navbar) to test both modes.

### Browser DevTools

1. Open DevTools (F12)
2. Go to Application → Local Storage
3. Look for `theme-mode` key to see/change saved preference

### Check Color Contrast

Ensure your colors meet WCAG accessibility guidelines:

- **AA standard**: 4.5:1 contrast ratio for normal text
- **AAA standard**: 7:1 contrast ratio for normal text

Tools:

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Coolors Contrast Checker](https://coolors.co/contrast-checker)

### Helpful MUI Resources

- [MUI Theming Guide](https://mui.com/material-ui/customization/theming/)
- [MUI Default Theme](https://mui.com/material-ui/customization/default-theme/)
- [MUI Color Tool](https://mui.com/material-ui/customization/color/)

---

## Color Palette Reference

Here's the complete current palette for reference:

### Dark Mode Primary Colors (Zaun/Undercity)

| Name                | Main      | Light     | Dark      | Purpose              |
| ------------------- | --------- | --------- | --------- | -------------------- |
| Arcane (Primary)    | `#7DD4EA` | `#A8E4F4` | `#4ABCD8` | Hextech cyan glow    |
| Shimmer (Secondary) | `#D466A8` | `#E88BC4` | `#B04088` | Shimmer magenta-pink |
| Undercity (Info)    | `#6B8094` | `#8AA0B4` | `#4A6074` | Steel blue-gray      |
| Ember (Error)       | `#E05070` | `#F07090` | `#C03050` | Chemtech red-pink    |
| Verdant (Success)   | `#4A9A7A` | `#6ABAA0` | `#2A7A5A` | Teal-green           |
| Warning             | `#D9943C` | `#E9A44C` | `#B9741C` | Warning amber        |

### Dark Mode Backgrounds

| Name     | Value     | Usage             |
| -------- | --------- | ----------------- |
| Deepest  | `#060D18` | Deepest undercity |
| Deep     | `#0A1628` | App bar           |
| Mid      | `#122438` | Main background   |
| Elevated | `#1A3048` | Cards, papers     |
| Muted    | `#243A54` | Muted surfaces    |
| Light    | `#2E4A68` | Light surfaces    |

### Light Mode Primary Colors (Piltover)

| Name                | Main      | Light     | Dark      |
| ------------------- | --------- | --------- | --------- |
| Arcane (Primary)    | `#1A7090` | `#2A8AAA` | `#0A5070` |
| Shimmer (Secondary) | `#8A3070` | `#A04080` | `#6A2050` |
| Error               | `#C93545` | `#E95565` | `#A91525` |
| Success             | `#2A7A44` | `#4A9A64` | `#1A5A24` |
| Info                | `#1A6A7A` | `#3A8A9A` | `#0A4A5A` |
| Warning             | `#B97420` | `#D99440` | `#995400` |

### Button Text Colors

For proper contrast, button text colors vary by mode and color:

**Dark Mode (bright backgrounds):**
| Button | Text Color | Reason |
|--------|------------|--------|
| Primary | `#0A1628` (dark) | Bright cyan needs dark text |
| Secondary | `#FFFFFF` (white) | Pink is dark enough |
| Error | `#FFFFFF` (white) | Red-pink is dark enough |
| Success | `#FFFFFF` (white) | Teal-green is dark enough |
| Info | `#FFFFFF` (white) | Steel gray is dark enough |
| Warning | `#0A1628` (dark) | Bright amber needs dark text |

**Light Mode (dark backgrounds):**
| Button | Text Color | Reason |
|--------|------------|--------|
| Primary | `#E8F4F8` (soft blue-white) | Dark teal, softer than pure white |
| Secondary | `#F8E8F4` (soft pink-white) | Dark magenta, tinted for harmony |
| Error | `#FFF0F2` (soft pink-white) | Tinted to match error color |
| Success | `#E8F8EE` (soft green-white) | Tinted to match success color |
| Info | `#E8F4F8` (soft blue-white) | Tinted to match info color |
| Warning | `#FFF8E8` (soft cream) | Tinted to match warning color |

### Light Mode Backgrounds

| Name     | Value     |
| -------- | --------- |
| Default  | `#F0F4F8` |
| Paper    | `#FFFFFF` |
| Elevated | `#F8FAFC` |

---

## Need Help?

- Check the [MUI documentation](https://mui.com/material-ui/customization/theming/)
- Look at the existing theme code for patterns
- Test changes incrementally
- Use browser DevTools to inspect computed styles
