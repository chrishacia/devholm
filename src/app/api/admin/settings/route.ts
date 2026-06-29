/**
 * Settings API Routes
 * ===================
 *
 * Manage site-wide settings.
 * All endpoints require admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAllSettings,
  getSettingsByCategory,
  updateSettings,
  getSiteInfo,
  getAuthorInfo,
  getSocialLinks,
  getSeoConfig,
} from '@/db/settings';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';

// =============================================================================
// Validation Schemas
// =============================================================================

const updateSettingsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
);

// =============================================================================
// GET /api/admin/settings - Get all settings
// =============================================================================

export async function GET(request: NextRequest) {
  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-settings-get',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    let data: unknown;

    if (format === 'grouped') {
      // Get settings organized by category
      data = await getSettingsByCategory();
    } else if (format === 'raw') {
      // Get raw settings array with metadata
      data = await getAllSettings();
    } else {
      // Get convenient structured objects
      const [site, author, social, seo] = await Promise.all([
        getSiteInfo(),
        getAuthorInfo(),
        getSocialLinks(),
        getSeoConfig(),
      ]);

      data = { site, author, social, seo };
    }

    return NextResponse.json({ data }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/admin/settings - Update settings
// =============================================================================

export async function PATCH(request: NextRequest) {
  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-settings-update',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    // Parse and validate body
    const body = await request.json();
    const parseResult = updateSettingsSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid settings data', details: parseResult.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const updates = parseResult.data;

    // Update settings
    const updatedCount = await updateSettings(updates);

    // Fetch updated settings
    const [site, author, social, seo] = await Promise.all([
      getSiteInfo(),
      getAuthorInfo(),
      getSocialLinks(),
      getSeoConfig(),
    ]);

    return NextResponse.json(
      {
        message: `Updated ${updatedCount} settings`,
        data: { site, author, social, seo },
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Settings PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
