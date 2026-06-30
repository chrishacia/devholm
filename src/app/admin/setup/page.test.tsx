import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import AdminSetupPage from './page';

describe('AdminSetupPage', () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 423,
      json: vi.fn().mockResolvedValue({ code: 'INSTALL_WIZARD_LOCKED' }),
    }) as unknown as typeof fetch;
  });

  it('redirects back to the dashboard when the wizard is already locked', async () => {
    render(<AdminSetupPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/admin');
    });
  });
});
