import { expect, test } from '@playwright/test';
import {
  createSessionToken,
  createTestIdentity,
  ensureInstallCompleted,
} from './fixtures/auth-jwt';

const DESTINATION_URL = 'http://localhost:3000/about';

test.describe('URL Shortener MVP', () => {
  test('supports create, redirect, analytics, and plugin disable/reenable', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);

    test.skip(
      browserName !== 'chromium',
      'Plugin enable/disable mutates shared state and is validated in chromium only.'
    );

    let originalRoutePrefix = '/s';
    let originalPublicCreationMode: 'admin-only' | 'authenticated' | 'public-with-approval' =
      'admin-only';
    let originalLegacyPrefixEnabled = false;

    const setPluginEnabledState = async (enabled: boolean) => {
      const listBeforeResponse = await page.request.get('/api/admin/plugins');
      expect(listBeforeResponse.ok()).toBeTruthy();
      const listBeforePayload = (await listBeforeResponse.json()) as {
        plugins?: Array<{ id: string; isEnabled: boolean; installed: boolean }>;
      };
      const urlShortenerBefore = (listBeforePayload.plugins ?? []).find(
        (plugin) => plugin.id === 'url-shortener'
      );

      if (!urlShortenerBefore?.installed) {
        const installResponse = await page.request.post('/api/admin/plugins', {
          data: {
            pluginId: 'url-shortener',
          },
        });
        const installBody = await installResponse.text();
        expect(
          installResponse.ok(),
          `POST /api/admin/plugins failed with ${installResponse.status()}: ${installBody}`
        ).toBeTruthy();
      }

      const updateResponse = await page.request.patch('/api/admin/plugins', {
        data: {
          pluginId: 'url-shortener',
          isEnabled: enabled,
        },
      });
      const updateBody = await updateResponse.text();
      expect(
        updateResponse.ok(),
        `PATCH /api/admin/plugins failed with ${updateResponse.status()}: ${updateBody}`
      ).toBeTruthy();

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

    await page.goto('/admin');
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

    const uniqueShortCode = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 64);

    await page
      .getByLabel(/Custom code/i)
      .first()
      .fill(uniqueShortCode);
    await page
      .getByLabel(/Destination URL/i)
      .first()
      .fill(DESTINATION_URL);
    await page.getByRole('button', { name: /create link/i }).click();

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
            (link) => link.destinationUrl === DESTINATION_URL && link.code === uniqueShortCode
          );

          return createdLink?.code ?? null;
        },
        { timeout: 20000 }
      )
      .toBe(uniqueShortCode);

    await expect(page.getByText(`/${uniqueShortCode}`)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Short link created successfully.')).toBeVisible({
      timeout: 20000,
    });

    const createdCode = uniqueShortCode;

    const shortUrlPath = `/s/${createdCode}`;

    const redirectResponse = await page.request.get(shortUrlPath, {
      maxRedirects: 0,
    });
    expect(redirectResponse.status()).toBe(302);
    expect(redirectResponse.headers()['location']).toContain('/about');

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

    const disabledResponse = await page.request.get(
      `${shortUrlPath}?disabledCheck=${Date.now().toString(36)}`,
      { maxRedirects: 0 }
    );
    expect(disabledResponse?.status()).toBe(404);

    await setPluginEnabledState(true);

    await page.goto('/admin/url-shortener/links');
    await expect
      .poll(
        async () => {
          const linksResponse = await page.request.get('/api/url-shortener/links');
          if (!linksResponse.ok()) {
            return null;
          }

          const linksPayload = (await linksResponse.json()) as {
            links?: Array<{ code: string }>;
          };

          const createdLink = (linksPayload.links ?? []).find((link) => link.code === createdCode);
          return createdLink?.code ?? null;
        },
        { timeout: 20000 }
      )
      .toBe(createdCode);

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
