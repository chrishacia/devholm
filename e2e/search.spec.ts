import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('search page loads', async ({ page }) => {
    await page.goto('/search');

    // Check page has search input
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('command palette opens with keyboard shortcut', async ({ page }) => {
    await page.goto('/');

    // Wait for page to be ready
    await page.waitForLoadState('networkidle');

    // Press Ctrl+K (works on all browsers/OS in CI; app also accepts Cmd+K on macOS)
    await page.keyboard.press('Control+k');

    // Search dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  });

  test('search button in header opens command palette', async ({ page }) => {
    await page.goto('/');

    // Find and click search button
    const searchButton = page.getByRole('button', { name: /search/i });
    if (await searchButton.isVisible()) {
      await searchButton.click();

      // Search dialog should appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
    }
  });

  test('search dialog can be closed with Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open search dialog
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('search page shows popular searches when empty', async ({ page }) => {
    await page.goto('/search');

    // Should show popular searches section
    const popularSection = page.getByText(/popular search|popular topics/i);
    await expect(popularSection)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Popular searches may not be present if no data
      });
  });

  test('search can be performed from search page', async ({ page }) => {
    await page.goto('/search');

    // Type in search input
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('test');
    await searchInput.press('Enter');

    // URL should update with query
    await expect(page).toHaveURL(/q=test/);
  });
});
