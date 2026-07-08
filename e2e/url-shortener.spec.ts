import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = 'admin@localhost.com';
const ADMIN_PASSWORD = 'changeme123';
const SHORT_CODE = `e2e-${Date.now()}`;
const DESTINATION_URL = 'http://localhost:3000/about';

test.describe('URL Shortener MVP', () => {
  test('supports create, redirect, analytics, and plugin disable/reenable', async ({ page }) => {
    let originalRoutePrefix = '/s';
    let originalPublicCreationMode: 'admin-only' | 'authenticated' | 'public-with-approval' =
      'admin-only';
    let originalLegacyPrefixEnabled = false;

    const setPluginEnabledState = async (enabled: boolean) => {
      const updateResponse = await page.request.patch('/api/admin/plugins', {
        data: {
          pluginId: 'url-shortener',
          isEnabled: enabled,
        },
      });
      expect(updateResponse.ok()).toBeTruthy();

      const listResponse = await page.request.get('/api/admin/plugins');
      expect(listResponse.ok()).toBeTruthy();
      const listPayload = (await listResponse.json()) as {
        plugins?: Array<{ id: string; isEnabled: boolean; installed: boolean }>;
      };
      const urlShortener = (listPayload.plugins ?? []).find(
        (plugin) => plugin.id === 'url-shortener'
      );
      expect(urlShortener?.installed).toBe(true);
      expect(urlShortener?.isEnabled).toBe(enabled);

      await page.goto('/admin/plugins');
      const toggle = page.getByLabel(/Toggle URL Shortener/i);
      await expect(toggle).toBeVisible({ timeout: 20000 });
      await expect.poll(async () => toggle.isChecked(), { timeout: 20000 }).toBe(enabled);
    };

    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: /admin login/i })).toBeVisible();

    // Ensure CSRF token is issued before credentials sign-in submission.
    const csrfResponse = await page.request.get('/api/auth/csrf');
    expect(csrfResponse.ok()).toBeTruthy();

    await page.getByRole('textbox', { name: /^email$/i }).fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page).toHaveURL(/\/admin(\/?$|\?)/, { timeout: 15000 });

    await setPluginEnabledState(true);

    await page.goto('/admin/url-shortener/links');
    await expect(page).toHaveURL(/\/admin\/url-shortener\/links/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: /URL Shortener Links/i })).toBeVisible({
      timeout: 20000,
    });

    const settingsResponse = await page.request.get('/api/url-shortener/settings');
    expect(settingsResponse.ok()).toBeTruthy();
    const settingsPayload = (await settingsResponse.json()) as {
      settings?: {
        routePrefix?: string;
        publicCreationMode?: 'admin-only' | 'authenticated' | 'public-with-approval';
        legacyPrefixEnabled?: boolean;
      };
    };
    originalRoutePrefix = settingsPayload.settings?.routePrefix || '/s';
    originalPublicCreationMode = settingsPayload.settings?.publicCreationMode || 'admin-only';
    originalLegacyPrefixEnabled = Boolean(settingsPayload.settings?.legacyPrefixEnabled);

    await page
      .getByLabel(/Custom code/i)
      .first()
      .fill(SHORT_CODE);
    await page
      .getByLabel(/Destination URL/i)
      .first()
      .fill(DESTINATION_URL);
    await page.getByRole('button', { name: /create link/i }).click();

    await expect(page.getByText(`/${SHORT_CODE}`)).toBeVisible();
    await expect(page.getByText('Short link created successfully.')).toBeVisible();

    await expect
      .poll(
        async () => {
          const linksResponse = await page.request.get('/api/url-shortener/links');
          if (!linksResponse.ok()) {
            return null;
          }

          const linksPayload = (await linksResponse.json()) as {
            links?: Array<{ code: string; destinationUrl: string }>;
          };

          const createdLink = (linksPayload.links ?? []).find(
            (link) => link.destinationUrl === DESTINATION_URL && link.code === SHORT_CODE
          );

          return createdLink?.code ?? null;
        },
        { timeout: 20000 }
      )
      .toBe(SHORT_CODE);

    const createdCode = SHORT_CODE;

    const shortUrlPath = `/s/${createdCode}`;

    const redirectResponse = await page.goto(shortUrlPath);
    expect(redirectResponse?.status()).toBe(200);
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { name: /About/i })).toBeVisible();

    await page.goto('/admin/url-shortener/links');
    await expect(page.getByText(`/${createdCode}`)).toBeVisible({ timeout: 20000 });
    await expect
      .poll(
        async () => {
          const linksResponse = await page.request.get('/api/url-shortener/links');
          if (!linksResponse.ok()) {
            return -1;
          }

          const linksPayload = (await linksResponse.json()) as {
            links?: Array<{ code: string; cachedClickCount?: number }>;
          };

          const createdLink = (linksPayload.links ?? []).find((link) => link.code === createdCode);
          return Number(createdLink?.cachedClickCount ?? 0);
        },
        { timeout: 20000 }
      )
      .toBeGreaterThanOrEqual(1);

    await page.goto('/admin/url-shortener/overview');
    await expect
      .poll(
        async () => {
          const overviewResponse = await page.request.get('/api/url-shortener/overview');
          if (!overviewResponse.ok()) {
            return -1;
          }

          const overviewPayload = (await overviewResponse.json()) as {
            overview?: { totalClicks?: number };
          };

          return Number(overviewPayload.overview?.totalClicks ?? 0);
        },
        { timeout: 20000 }
      )
      .toBeGreaterThanOrEqual(1);

    await page.goto('/admin/plugins');
    await setPluginEnabledState(false);

    const disabledResponse = await page.goto(shortUrlPath);
    expect(disabledResponse?.status()).toBe(404);

    await setPluginEnabledState(true);

    await page.goto('/admin/url-shortener/links');
    await expect(page.getByText(`/${createdCode}`)).toBeVisible();

    const restoreSettingsResponse = await page.request.patch('/api/url-shortener/settings', {
      data: {
        routePrefix: originalRoutePrefix,
        publicCreationMode: originalPublicCreationMode,
        legacyPrefixEnabled: originalLegacyPrefixEnabled,
      },
    });
    expect(restoreSettingsResponse.ok()).toBeTruthy();
  });
});
