import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);
    await expect(page.locator('header')).toBeVisible();
  });

  test('blog page loads', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.locator('h1')).toContainText(/Blog/);
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('h1')).toContainText(/About/);
  });

  test('404 page shows for invalid routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('body')).toContainText(/not found/i);
  });
});

test.describe('Navigation', () => {
  test('can navigate to main pages', async ({ page }) => {
    await page.goto('/');

    // Navigate to blog
    await page.click('text=Blog');
    await expect(page).toHaveURL(/.*blog/);

    // Navigate to about
    await page.click('text=About');
    await expect(page).toHaveURL(/.*about/);

    // Navigate back home
    await page.click('text=Home');
    await expect(page).toHaveURL('/');
  });
});

test.describe('Theme Toggle', () => {
  test('can toggle dark/light mode', async ({ page }) => {
    await page.goto('/');

    // Find and click theme toggle
    const themeToggle = page.locator('[aria-label*="theme"], [data-testid="theme-toggle"]');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      // Verify theme changed (check for class or attribute change)
      await expect(page.locator('html')).toHaveAttribute('class', /(dark|light)/);
    }
  });
});
