import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock the config
vi.mock('@/config', () => ({
  siteConfig: {
    title: 'DevHolm',
    description: 'A modern personal website template',
    social: {
      github: 'devholm',
      twitter: 'devholm',
      linkedin: 'devholm',
    },
  },
  mainNavigation: [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
  ],
  footerNavigation: {
    main: [
      { label: 'Home', href: '/' },
      { label: 'About', href: '/about' },
    ],
    resources: [{ label: 'Blog', href: '/blog' }],
  },
}));

// Mock the ThemeContext
vi.mock('@/context/ThemeContext', () => ({
  useThemeContext: () => ({
    mode: 'dark',
    toggleMode: vi.fn(),
  }),
}));

// Create a wrapper with theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6366f1' },
    secondary: { main: '#f472b6' },
  },
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('Logo', () => {
  it('renders the logo link', async () => {
    const { Logo } = await import('../common/Logo');
    render(<Logo />, { wrapper: Wrapper });

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders with different sizes', async () => {
    const { Logo } = await import('../common/Logo');
    const { rerender } = render(<Logo size="small" />, { wrapper: Wrapper });

    expect(screen.getByRole('link')).toBeInTheDocument();

    rerender(
      <Wrapper>
        <Logo size="large" />
      </Wrapper>
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
