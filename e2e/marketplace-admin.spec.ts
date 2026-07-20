import { expect, test } from '@playwright/test';
import {
  createSessionToken,
  createTestIdentity,
  ensureInstallCompleted,
} from './fixtures/auth-jwt';

test.describe('Marketplace admin discovery UX', () => {
  test('renders authoritative marketplace catalog and detail state', async ({ page }) => {
    test.setTimeout(120000);

    const adminIdentity = createTestIdentity('admin');
    await ensureInstallCompleted(page.request, adminIdentity);

    const sessionToken = await createSessionToken(adminIdentity);
    await page.context().addCookies([
      {
        name: 'authjs.session-token',
        value: sessionToken,
        url: 'http://localhost:3000',
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
      },
    ]);

    const catalogResponse = await page.request.get('/api/admin/plugins/marketplace/catalog');
    expect(catalogResponse.ok()).toBeTruthy();

    const catalogPayload = (await catalogResponse.json()) as {
      plugins?: Array<{
        plugin: { id: string; name: string };
        signature: { status: string; decision: string };
        trustPolicy: { reasonCode: string; outcome: string };
        catalogEntry: { publisher: { publisherId: string; classification: string } };
      }>;
    };

    const calendar = (catalogPayload.plugins ?? []).find((entry) => entry.plugin.id === 'calendar');
    expect(calendar).toBeTruthy();
    expect(calendar?.catalogEntry.publisher.publisherId).toBe('devholm-first-party');
    expect(calendar?.signature.status).toBeTruthy();
    expect(calendar?.trustPolicy.reasonCode).toBeTruthy();

    await page.goto('/admin/plugins');
    await expect(page.getByRole('heading', { name: 'Marketplace Plugin Management' })).toBeVisible({
      timeout: 20000,
    });

    await expect(page.getByText(/Source:/, { exact: false }).first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/Version:/, { exact: false }).first()).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole('button', { name: /Inspect Calendar/i }).click();

    await expect
      .poll(async () => page.locator('body').textContent(), { timeout: 60000 })
      .toContain('Overview');
    await expect(page.getByText('Actions and remediation')).toBeVisible({ timeout: 60000 });
    await expect(page.getByText('Lifecycle and deployment')).toBeVisible({ timeout: 60000 });
    await expect(page.getByText('Technical details')).toBeVisible({ timeout: 60000 });
  });
});
