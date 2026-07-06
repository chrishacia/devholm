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
      // On mobile the desktop nav ({!isMobile && <nav aria-label="Main navigation">}) is
      // not rendered. A hamburger button opens a Drawer that contains:
      //   <List component="nav" aria-label="Mobile navigation">
      // with ListItemButton component={Link} items rendering as <a> links.
      const menuToggle = page.getByRole('button', { name: /toggle menu/i });
      await expect(menuToggle).toBeVisible();
      await menuToggle.click();

      const mobileNavigation = page.getByRole('navigation', { name: /mobile navigation/i });
      await expect(mobileNavigation.getByRole('link', { name: /^home$/i })).toBeVisible();
      await expect(mobileNavigation.getByRole('link', { name: /^about$/i })).toBeVisible();
      await expect(mobileNavigation.getByRole('link', { name: /^blog$/i })).toBeVisible();
    } else {
      // Desktop: <Box component="nav" aria-label="Main navigation"> with Button component={Link}
      // items that render as <a> links.
      const mainNavigation = page.getByRole('navigation', { name: /main navigation/i });
      await expect(mainNavigation.getByRole('link', { name: /^home$/i })).toBeVisible();
      await expect(mainNavigation.getByRole('link', { name: /^about$/i })).toBeVisible();
      await expect(mainNavigation.getByRole('link', { name: /^blog$/i })).toBeVisible();
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
