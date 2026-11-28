import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components', () => ({
  AuthAwareMainLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('devholm.com privacy notice', () => {
  beforeEach(() => {
    // The developer page registry is evaluated on import. Isolate it for each deployment setting.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, '2026-02-30'])('leaves the notice off with setting %s', async (setting) => {
    vi.stubEnv('DEVHOLM_PRIVACY_EFFECTIVE_DATE', setting ?? '');
    if (setting === undefined) delete process.env.DEVHOLM_PRIVACY_EFFECTIVE_DATE;
    const { devPageDefinitions } = await import('./index');
    expect(devPageDefinitions.find((page) => page.path === '/privacy')).toBeUndefined();
  });

  it('registers the notice and its footer setting for the opted-in deployment', async () => {
    vi.stubEnv('DEVHOLM_PRIVACY_EFFECTIVE_DATE', '2026-11-28');
    const { devPageDefinitions } = await import('./index');
    const privacy = devPageDefinitions.find((page) => page.path === '/privacy');

    expect(privacy).toMatchObject({
      title: 'Privacy',
      enabledByDefault: true,
      showInFooterResourcesByDefault: true,
    });
    const loaded = await privacy!.loadPage();
    const Notice = typeof loaded === 'function' ? loaded : loaded.default;
    render(<Notice />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText('28 November 2026')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This notice covers the live site at devholm.com. devholm ("we", "us") decide how this information is used.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'We will delete detailed analytics records after about 180 days. Totals (aggregate counts) are kept.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/We delete these logs after about 15 days/)).toBeInTheDocument();
    expect(screen.queryByText(/we keep contact messages for/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Contact form' })).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: 'Contact form' })) {
      expect(link).toHaveAttribute('href', '/contact');
    }
  });
});
