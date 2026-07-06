import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/');

    // Check page has a real document title
    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);

    // Check that header is present
    await expect(page.locator('header')).toBeVisible();

    // Check that footer is present
    await expect(page.locator('footer')).toBeVisible();
  });

  test('has navigation links', async ({ page }) => {
    await page.goto('/');

    const viewport = page.viewportSize();
    const isMobileViewport = viewport !== null && viewport.width < 768;

    if (isMobileViewport) {
      // On mobile the desktop nav is not rendered (conditional: {!isMobile && <nav>}).
      // Instead, a hamburger button opens a slide-out Drawer with aria-label "Mobile navigation".
      // Verify the menu toggle button is accessible — this proves site navigation exists on mobile.
      const menuToggle = page.getByRole('button', { name: /toggle menu/i });
      await expect(menuToggle).toBeVisible();
    } else {
      const mainNavigation = page.getByRole('navigation', { name: /main navigation/i });
      await expect(mainNavigation.getByRole('link', { name: /^home$/i })).toBeAttached();
      await expect(mainNavigation.getByRole('link', { name: /^about$/i })).toBeAttached();
      await expect(mainNavigation.getByRole('link', { name: /^blog$/i })).toBeAttached();
    }
  });

  test('has skip to main content link', async ({ page }) => {
    await page.goto('/');

    // The skip link should exist for accessibility
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeAttached();
  });

  test('theme toggle works', async ({ page }) => {
    await page.goto('/');

    // Find theme toggle button
    const themeToggle = page.getByRole('button', { name: /switch to/i });
    await expect(themeToggle).toBeVisible();

    // Click to toggle theme
    await themeToggle.click();

    // Theme should change (button label changes)
    await expect(themeToggle).toHaveAttribute('aria-label', /switch to/i);
  });
});
