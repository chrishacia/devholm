/**
 * Profile API Routes
 * ==================
 *
 * Manage the current admin user's profile.
 * All endpoints require admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAdminUserProfile,
  updateAdminProfile,
  updateAdminEmail,
  updateAdminPassword,
  verifyCurrentPassword,
  getAvatarMediaId,
  ensureAdminShadowUser,
} from '@/db/admin-users';
import { getLinkedAccountsForUser } from '@/db/auth';
import { getDb } from '@/db';
import { getMediaAssetWithVariants, getAllStoragePaths, deleteMediaAssets } from '@/db/media';
import { deleteMediaFiles } from '@/lib/image-processor';
import { updateSetting } from '@/db/settings';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get optimal variant URL from a MediaWithVariants object
 */
function getVariantUrl(
  asset: Awaited<ReturnType<typeof getMediaAssetWithVariants>>,
  targetWidth: number
): string | undefined {
  if (!asset || !asset.variants || asset.variants.length === 0) {
    return asset?.publicUrl || undefined;
  }

  // Sort variants by width
  const sorted = [...asset.variants]
    .filter((v) => v.width !== null)
    .sort((a, b) => (a.width || 0) - (b.width || 0));

  // Find smallest variant >= targetWidth
  const suitable = sorted.find((v) => (v.width || 0) >= targetWidth);
  if (suitable) {
    return suitable.publicUrl;
  }

  // Fall back to largest variant
  if (sorted.length > 0) {
    return sorted[sorted.length - 1].publicUrl;
  }

  return asset.publicUrl || undefined;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(2000).nullable().optional(),
  title: z.string().max(100).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  websiteUrl: z.string().url().max(255).nullable().optional(),
  twitterHandle: z.string().max(50).nullable().optional(),
  githubHandle: z.string().max(50).nullable().optional(),
  linkedinHandle: z.string().max(100).nullable().optional(),
  avatarMediaId: z.string().uuid().nullable().optional(),
});

const updateEmailSchema = z.object({
  email: z.string().email().max(255),
  currentPassword: z.string().min(1),
});

const updatePasswordSchema = z
  .object({
    currentPassword: z.string().optional().default(''),
    newPassword: z.string().min(8).max(100),
    confirmPassword: z.string().min(1),
    allowSetInitialPassword: z.boolean().optional().default(false),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

async function resolveAdminIdentity(token: {
  sub?: string | null;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  image?: string | null;
}) {
  const adminId = token.sub as string;
  const profile = await getAdminUserProfile(adminId);
  if (profile) {
    return { adminId, profile };
  }

  if (!token.email) {
    return { adminId, profile: null };
  }

  const resolvedId = await ensureAdminShadowUser({
    id: adminId,
    email: token.email,
    displayName: token.name,
    avatarUrl: token.picture ?? token.image ?? null,
  });

  if (!resolvedId) {
    return { adminId, profile: null };
  }

  const resolvedProfile = await getAdminUserProfile(resolvedId);
  return { adminId: resolvedId, profile: resolvedProfile };
}

// =============================================================================
// GET /api/admin/profile - Get current user's profile
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
    action: 'admin-profile-get',
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
    const { profile } = await resolveAdminIdentity(token);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: rateLimitHeaders(rateLimit) }
      );
    }

    // If user has an avatar media asset, get the optimized URL
    let avatarUrls: { thumbnail?: string; small?: string; original?: string } = {};
    if (profile.avatarMediaId) {
      const avatarAsset = await getMediaAssetWithVariants(profile.avatarMediaId);
      if (avatarAsset) {
        avatarUrls = {
          thumbnail: getVariantUrl(avatarAsset, 150),
          small: getVariantUrl(avatarAsset, 400),
          original: avatarAsset.publicUrl || undefined,
        };
      }
    }

    return NextResponse.json(
      {
        data: {
          ...profile,
          avatarUrls,
        },
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/admin/profile - Update profile
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
    action: 'admin-profile-update',
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
    const body = await request.json();
    const parseResult = updateProfileSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid profile data', details: parseResult.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const { adminId: userId } = await resolveAdminIdentity(token);
    const updateData = parseResult.data;

    // If updating avatar, clean up old avatar media first
    if (updateData.avatarMediaId !== undefined) {
      const oldAvatarMediaId = await getAvatarMediaId(userId);

      // If there's an old avatar and we're replacing it (or removing it)
      if (oldAvatarMediaId && oldAvatarMediaId !== updateData.avatarMediaId) {
        try {
          // Get file paths for cleanup
          const paths = await getAllStoragePaths(oldAvatarMediaId);
          // Delete from database
          await deleteMediaAssets([oldAvatarMediaId]);
          // Delete files from disk
          await deleteMediaFiles(paths);
        } catch (err) {
          console.error('Failed to clean up old avatar:', err);
          // Continue anyway - don't block the update
        }
      }
    }

    // If updating avatar, also update avatarUrl and site settings
    let avatarUrl: string | null = null;
    if (updateData.avatarMediaId) {
      const avatarAsset = await getMediaAssetWithVariants(updateData.avatarMediaId);
      if (avatarAsset) {
        avatarUrl = getVariantUrl(avatarAsset, 400) || null;
        (updateData as Record<string, unknown>).avatarUrl = avatarUrl;
        // Also update the public site settings for author avatar
        await updateSetting('author_avatar_url', avatarUrl);
      }
    } else if (updateData.avatarMediaId === null) {
      (updateData as Record<string, unknown>).avatarUrl = null;
      // Clear the public site setting as well
      await updateSetting('author_avatar_url', null);
    }

    const profile = await updateAdminProfile(userId, updateData);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: rateLimitHeaders(rateLimit) }
      );
    }

    // Get avatar URLs for response
    let avatarUrls: { thumbnail?: string; small?: string; original?: string } = {};
    if (profile.avatarMediaId) {
      const avatarAsset = await getMediaAssetWithVariants(profile.avatarMediaId);
      if (avatarAsset) {
        avatarUrls = {
          thumbnail: getVariantUrl(avatarAsset, 150),
          small: getVariantUrl(avatarAsset, 400),
          original: avatarAsset.publicUrl || undefined,
        };
      }
    }

    return NextResponse.json(
      {
        message: 'Profile updated',
        data: { ...profile, avatarUrls },
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Profile PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

// =============================================================================
// PUT /api/admin/profile/email - Update email
// =============================================================================

export async function PUT(request: NextRequest) {
  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-profile-email',
    identifier: clientIp,
    maxRequests: 5,
    windowMs: 3600000, // 5 per hour
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === 'email') {
      const parseResult = updateEmailSchema.safeParse(body);

      if (!parseResult.success) {
        return NextResponse.json(
          { error: 'Invalid email data', details: parseResult.error.flatten() },
          { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
      }

      const { adminId: userId } = await resolveAdminIdentity(token);
      const { email, currentPassword } = parseResult.data;

      // Verify current password
      const passwordValid = await verifyCurrentPassword(userId, currentPassword);
      if (!passwordValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
      }

      // Update email
      const success = await updateAdminEmail(userId, email);
      if (!success) {
        return NextResponse.json(
          { error: 'Email is already taken or update failed' },
          { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
      }

      return NextResponse.json(
        { message: 'Email updated successfully' },
        { headers: rateLimitHeaders(rateLimit) }
      );
    } else if (action === 'password') {
      const parseResult = updatePasswordSchema.safeParse(body);

      if (!parseResult.success) {
        return NextResponse.json(
          { error: 'Invalid password data', details: parseResult.error.flatten() },
          { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
      }

      const { adminId: userId } = await resolveAdminIdentity(token);
      const { currentPassword, newPassword } = parseResult.data;

      // Never trust client flags for password challenge rules.
      // Determine on the server whether credentials auth already exists.
      const [linkedAccounts, siteUser] = await Promise.all([
        getLinkedAccountsForUser(userId),
        getDb()('site_users').where('id', userId).select('primary_auth_provider').first(),
      ]);
      const hasCredentialsAccount =
        linkedAccounts.some((account) => account.provider === 'credentials') ||
        siteUser?.primary_auth_provider === 'credentials';

      if (hasCredentialsAccount) {
        const passwordValid = await verifyCurrentPassword(userId, currentPassword);
        if (!passwordValid) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
          );
        }
      }

      // Update password
      const success = await updateAdminPassword(userId, newPassword);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update password' },
          { status: 500, headers: rateLimitHeaders(rateLimit) }
        );
      }

      return NextResponse.json(
        { message: 'Password updated successfully' },
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Profile PUT error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
