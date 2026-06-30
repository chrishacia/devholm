import { test, expect } from '@playwright/test';

test.describe('Blog', () => {
  test('blog page loads', async ({ page }) => {
    await page.goto('/blog');

    // Check page has blog heading
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/blog/i);
  });

  test('blog page is accessible from navigation', async ({ page }) => {
    await page.goto('/');

    // Click on blog link
    await page.getByRole('link', { name: /blog/i }).first().click();

    // Should navigate to blog page
    await expect(page).toHaveURL(/\/blog/);
  });
});

test.describe('About', () => {
  test('about page loads', async ({ page }) => {
    await page.goto('/about');

    // Check page has about heading
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/about/i);
  });
});

test.describe('Contact', () => {
  test('contact page loads', async ({ page }) => {
    await page.goto('/contact');

    // Check page has contact heading or form
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('contact form has required fields', async ({ page }) => {
    await page.goto('/contact');

    // Check form fields exist
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/message/i)).toBeVisible();

    // Check submit button exists
    await expect(page.getByRole('button', { name: /send|submit/i })).toBeVisible();
  });
});

test.describe('Projects', () => {
  test('projects page loads', async ({ page }) => {
    await page.goto('/projects');

    // Check page has projects heading
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/projects/i);
  });
});

test.describe('Resume', () => {
  test('resume page loads', async ({ page }) => {
    await page.goto('/resume');

    // Check page has resume/cv heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Now', () => {
  test('now page loads', async ({ page }) => {
    await page.goto('/now');

    // Check page has heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
