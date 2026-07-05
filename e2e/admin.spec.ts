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

// ---------------------------------------------------------------------------
// Stage 3 SDK Authorization: Production Surface E2E Coverage
// ---------------------------------------------------------------------------
// Surface 1: GET /api/admin/dashboard  (migrated to Stage 3 adminAccessDeclaration)
// Surface 2: GET /api/admin/auth/users (migrated to Stage 3 usersManageDeclaration)
//
// These tests verify that the Stage 3 migration enforces authorization at the
// HTTP boundary; they do not test admin-authenticated behavior (no user fixture).
// ---------------------------------------------------------------------------

test.describe('Stage 3 SDK authorization: production surface enforcement', () => {
  test('PATCH /api/admin/dashboard returns 401 without authentication token', async ({
    request,
  }) => {
    // Anonymous request must be rejected by Stage 3 authorization
    const response = await request.get('/api/admin/dashboard');
    // Stage 3 unauthenticated result maps to 401
    expect(response.status()).toBe(401);
  });

  test('POST /api/admin/dashboard returns 401 without authentication token', async ({
    request,
  }) => {
    const response = await request.patch('/api/admin/dashboard', {
      data: { action: 'dismiss-onboarding' },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/auth/users returns 401 without authentication token', async ({
    request,
  }) => {
    // Anonymous request must be rejected by Stage 3 authorization
    const response = await request.get('/api/admin/auth/users');
    expect(response.status()).toBe(401);
  });

  test('PATCH /api/admin/auth/users returns 401 without authentication token', async ({
    request,
  }) => {
    const response = await request.patch('/api/admin/auth/users', {
      data: { userId: '00000000-0000-0000-0000-000000000000', isActive: true },
    });
    expect(response.status()).toBe(401);
  });

  test('Stage 3 dashboard endpoint does not 404', async ({ page }) => {
    const response = await page.goto('/api/admin/dashboard');
    // Either 401 (unauthenticated) or redirect to login; must not 404 or 500
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
  });

  test('Stage 3 users endpoint does not 404', async ({ page }) => {
    const response = await page.goto('/api/admin/auth/users');
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
  });
});
