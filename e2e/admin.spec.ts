import { test, expect } from '@playwright/test';

test.describe('Admin Authentication', () => {
  test('admin entry point responds without 404', async ({ page }) => {
    const response = await page.goto('/admin');

    expect(response?.status()).not.toBe(404);
    await expect(page.locator('body')).not.toContainText(/not found/i);
  });

  test('admin login page loads', async ({ page }) => {
    await page.goto('/admin/login');

    // Check login form elements exist
    await expect(page.getByRole('heading', { name: /admin login/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^email$/i })).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('login submit stays disabled until credentials are entered', async ({ page }) => {
    await page.goto('/admin/login');

    const submitButton = page.getByRole('button', { name: /sign in|log in/i });
    const emailInput = page.getByRole('textbox', { name: /^email$/i });
    const passwordInput = page.locator('input[type="password"]').first();

    await expect(submitButton).toBeDisabled();

    await emailInput.fill('invalid@example.com');
    await passwordInput.fill('wrongpassword');

    await expect(submitButton).toBeEnabled();
  });

  test('login form keeps credential fields interactive', async ({ page }) => {
    await page.goto('/admin/login');

    const emailInput = page.getByRole('textbox', { name: /^email$/i });
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('invalid@example.com');
    await passwordInput.fill('wrongpassword');

    await expect(emailInput).toHaveValue('invalid@example.com');
    await expect(passwordInput).toHaveValue('wrongpassword');
  });
});

test.describe('Admin Navigation', () => {
  // Note: These tests would need proper authentication setup
  // For now, we just test that the routes exist

  test('admin routes respond', async ({ page }) => {
    // Test that admin routes don't 404
    const response = await page.goto('/admin/posts');
    expect(response?.status()).not.toBe(404);

    const response2 = await page.goto('/admin/inbox');
    expect(response2?.status()).not.toBe(404);

    const response3 = await page.goto('/admin/media');
    expect(response3?.status()).not.toBe(404);
  });
});
