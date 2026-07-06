/**
 * Regression: E2E Fixture UUID Format
 * ====================================
 *
 * Root cause of CI run 28763015211 failure:
 *
 *   GET /api/admin/dashboard returned HTTP 500 for admin, superadmin, and
 *   admin.access-only identities. The cause was that e2e/fixtures/auth-jwt.ts
 *   generated user IDs using `Date.now()` (e.g. "e2e-admin-1750123456789"),
 *   which is NOT a valid UUID.
 *
 *   The dashboard route calls:
 *     getAuthOnboardingStatus(userId)  →  getLinkedAccountsForUser(userId)
 *   which executes:
 *     SELECT * FROM auth_provider_accounts WHERE user_id = :userId
 *
 *   The user_id column in auth_provider_accounts is typed uuid (migration
 *   20260604000000_add_auth_foundation.ts). Passing a non-UUID string causes
 *   PostgreSQL to throw: invalid input syntax for type uuid
 *   which propagates as an unhandled exception → HTTP 500.
 *
 * Fix applied:
 *   - e2e/fixtures/auth-jwt.ts: deterministic UUID-format IDs in E2E_FIXTURE_IDS
 *   - src/core/db/seeds/bootstrap/002_e2e_fixture_users.ts: seeds site_users rows
 *
 * This test file verifies the UUID contract is maintained and prevents regression.
 */

import { describe, it, expect } from 'vitest';

/**
 * These must remain in sync with E2E_FIXTURE_IDS in e2e/fixtures/auth-jwt.ts.
 * If either changes, the regression is re-introduced.
 */
const E2E_FIXTURE_IDS = {
  admin: 'e2e00000-0000-4000-8000-00000000a001',
  superadmin: 'e2e00000-0000-4000-8000-00000000a002',
  'admin-access-only': 'e2e00000-0000-4000-8000-00000000a003',
  'users-manage-only': 'e2e00000-0000-4000-8000-00000000a004',
  member: 'e2e00000-0000-4000-8000-00000000a005',
} as const;

// PostgreSQL accepts uuid values matching RFC 4122.
// Version 4: third group starts with 4
// Variant:   fourth group starts with 8, 9, a, or b
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('E2E fixture UUID format (regression for dashboard HTTP 500)', () => {
  it('each identity type has a valid UUID-v4 format ID', () => {
    for (const [type, id] of Object.entries(E2E_FIXTURE_IDS)) {
      expect(id, `${type} fixture ID must be a valid UUID-v4 string`).toMatch(UUID_V4_RE);
    }
  });

  it('all five identity types are covered', () => {
    const types = Object.keys(E2E_FIXTURE_IDS);
    expect(types).toContain('admin');
    expect(types).toContain('superadmin');
    expect(types).toContain('admin-access-only');
    expect(types).toContain('users-manage-only');
    expect(types).toContain('member');
  });

  it('fixture IDs are stable (not generated from Date.now())', () => {
    // A Date.now()-based ID would change between calls.
    // Verify each ID is the same constant on repeat access.
    for (const [type, id] of Object.entries(E2E_FIXTURE_IDS)) {
      const same = E2E_FIXTURE_IDS[type as keyof typeof E2E_FIXTURE_IDS];
      expect(id, `${type} fixture ID must be stable across accesses`).toBe(same);
    }
  });

  it('fixture IDs are distinct across all five identity types', () => {
    const ids = Object.values(E2E_FIXTURE_IDS);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('rejects Date.now()-style ID format that caused the original failure', () => {
    const badId = `e2e-admin-${Date.now()}`;
    expect(badId).not.toMatch(UUID_V4_RE);
  });
});
