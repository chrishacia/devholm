# SDK Stage 3: API Route Migration Example

## Overview

This document shows how to migrate an existing API route from legacy authorization patterns to Stage 3's canonical subject model and deterministic wrappers.

## Before: Legacy Pattern

```typescript
// src/app/api/admin/users/route.ts (legacy)
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyPermission, hasAdminAccess } from '@/core/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await auth();

  // Inconsistent authorization: mixing session checks
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Helper with potential inconsistency: doesn't check isAdmin but middleware does
  if (!verifyPermission(session, 'users.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Handler logic
  const users = await db.user.findMany();
  return NextResponse.json(users);
}
```

**Issues:**

- Inconsistent authorization checks across codebase
- `verifyPermission()` doesn't uniformly check isAdmin
- Middleware uses isAdmin; helpers sometimes don't
- Policy errors aren't distinguished from ordinary forbidden
- No deterministic result mapping for edge cases

## After: Stage 3 Pattern

```typescript
// src/app/api/admin/users/route.ts (Stage 3)
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth'; // Application-level auth
import {
  evaluateApiAuthorization,
  AuthorizationTransportResult,
  authorizedApiResponse,
} from '@devholm/sdk/server';

export async function GET(request: NextRequest) {
  // Get session from application layer (NextAuth)
  const session = await auth();

  // Single authoritative point: deterministic evaluation
  // (Session is passed in, not implicit - more testable and explicit)
  const authResult = await evaluateApiAuthorization(session, 'admin:users:read');

  // Fail-closed semantics: policy errors never become 403
  if (authResult.result !== AuthorizationTransportResult.ALLOW) {
    return NextResponse.json(
      { error: authResult.errorMessage ?? 'Forbidden' },
      { status: authResult.httpStatus }
    );
  }

  // OR use the wrapper helper for cleaner code:
  // return authorizedApiResponse(authResult, async (subject) => {
  //   const users = await db.user.findMany();
  //   return NextResponse.json(users);
  // });

  // Handler logic with canonical subject
  const users = await db.user.findMany();
  return NextResponse.json(users);
}
```

## What Changed

### 1. Single Authorization Point

- **Before:** Multiple authorization checks (session, helper function)
- **After:** One `evaluateApiAuthorization()` call that handles normalization, policy evaluation, and result mapping

### 2. Canonical Subject

- **Before:** Raw session object, potential for inconsistency
- **After:** `CanonicalAuthorizationSubject` with guaranteed fields and deduplication

### 3. Deterministic Results

- **Before:** No distinction between policy-error and forbidden
- **After:** Distinct `AuthorizationTransportResult` enum with guaranteed HTTP mapping

### 4. Fail-Closed Semantics

- **Before:** Policy errors might leak as 403
- **After:** Policy-error always maps to 500/503, never 403

## Testing the Migration

### Verify Authorization Semantics

```typescript
import { describe, it, expect } from 'vitest';

describe('GET /api/admin/users (Stage 3)', () => {
  it('returns 200 for authorized user with users.read permission', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/users');
    const mockSession = {
      user: {
        id: 'user-123',
        email: 'admin@example.com',
        role: 'admin',
        isAdmin: true,
        permissions: ['users.read'],
      },
    };

    // Mock auth() to return mockSession
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('returns 403 for authenticated but unauthorized user', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/users');
    const mockSession = {
      user: {
        id: 'user-456',
        email: 'member@example.com',
        role: 'member',
        isAdmin: false,
        permissions: [],
      },
    };

    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it('returns 401 for unauthenticated request', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/users');
    // Mock auth() to return null

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 500 if policy evaluation fails', async () => {
    // Mock evaluateApiAuthorization to return policy-error
    const response = await GET(request);
    expect(response.status).toBe(500);
    // NOT 403 - fail-closed semantics
  });
});
```

## Compatibility Adapter

If you need to support legacy authorization during migration:

```typescript
import { adaptLegacyToCanonical } from '@devholm/sdk/server';

// Somewhere in the handler:
const { subject, diagnostics } = adaptLegacyToCanonical(legacyToken, {
  diagnosticsEnabled: process.env.NODE_ENV === 'development',
  adminDeterminationRule: 'legacy', // or 'canonical' or 'union'
});

// Later: diagnostics?.usedCompatibilityPath will tell you which path was used
```

## Migration Checklist

- [ ] Identify all API routes with authorization
- [ ] Create tests documenting pre-migration behavior
- [ ] Replace authorization checks with `evaluateApiAuthorization()`
- [ ] Verify tests pass with new implementation
- [ ] Check that policy errors map to 500/503, not 403
- [ ] Enable diagnostics in development to see compatibility path usage
- [ ] Remove legacy authorization helpers as routes migrate
- [ ] Verify all surfaces have been migrated (not just a subset)

## Key Principles

1. **Single authority:** `evaluateApiAuthorization()` is the only authorization point
2. **Fail closed:** Policy errors never become ordinary forbidden
3. **Deterministic:** Same input always produces same authorization result
4. **Normalized:** All subjects go through canonical normalization
5. **Auditable:** Diagnostics can show which path (legacy/canonical) was used
