import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/db';
import { ensureSiteUserForAdmin, getAuthSettings } from '@/db/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { rateLimit as rateLimitConfig } from '@/config/env';

/**
 * POST /api/auth/verify
 * Verify user credentials (used by NextAuth Credentials provider)
 */
export async function POST(request: NextRequest) {
  try {
    const authSettings = await getAuthSettings();
    if (!authSettings.credentialsEnabled) {
      return NextResponse.json(
        { error: 'Password login is disabled for this site' },
        { status: 403 }
      );
    }

    // Rate limit login attempts
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await checkRateLimit({
      action: 'auth:login',
      identifier: ip,
      maxRequests: rateLimitConfig.loginMaxAttempts,
      windowMs: rateLimitConfig.windowMs,
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfterSeconds),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
          },
        }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const db = getDb();
    const user = await db('admin_users')
      .select('id', 'email', 'display_name', 'password_hash')
      .whereRaw('LOWER(email) = ?', [String(email).trim().toLowerCase()])
      .first();

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const authSubject = await ensureSiteUserForAdmin(user);

    // Return user without password hash
    return NextResponse.json({
      id: authSubject.id,
      email: authSubject.email,
      name: authSubject.displayName || user.display_name || 'Admin',
      role: authSubject.primaryRole,
      roles: authSubject.roles,
      permissions: authSubject.permissions,
      isAdmin: authSubject.isAdmin,
    });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
