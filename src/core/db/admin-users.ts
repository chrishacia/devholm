/**
 * Admin Users Database Layer
 * ==========================
 *
 * Manages admin user accounts and profiles.
 */

import { getDb } from './index';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUserProfile extends AdminUser {
  bio: string | null;
  title: string | null;
  location: string | null;
  websiteUrl: string | null;
  twitterHandle: string | null;
  githubHandle: string | null;
  linkedinHandle: string | null;
  avatarMediaId: string | null;
}

export interface CreateAdminUserData {
  email: string;
  password: string;
  displayName?: string;
}

export interface UpdateProfileData {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  title?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  twitterHandle?: string | null;
  githubHandle?: string | null;
  linkedinHandle?: string | null;
  avatarMediaId?: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Ensure there is an admin_users row usable by legacy profile + credential flows.
 * Returns the resolved admin_users.id for downstream operations.
 */
export async function ensureAdminShadowUser(input: {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<string | null> {
  const db = getDb();
  const normalizedEmail = normalizeEmail(input.email);

  const byId = await db('admin_users').where('id', input.id).first('id');
  if (byId?.id) {
    await db('admin_users')
      .where('id', byId.id)
      .update({
        email: normalizedEmail,
        display_name: input.displayName ?? db.raw('display_name'),
        avatar_url: input.avatarUrl ?? db.raw('avatar_url'),
        updated_at: new Date(),
      });
    return byId.id as string;
  }

  const byEmail = await db('admin_users')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .first('id');
  if (byEmail?.id) {
    await db('admin_users')
      .where('id', byEmail.id)
      .update({
        display_name: input.displayName ?? db.raw('display_name'),
        avatar_url: input.avatarUrl ?? db.raw('avatar_url'),
        updated_at: new Date(),
      });
    return byEmail.id as string;
  }

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 12);
  const [created] = await db('admin_users')
    .insert({
      id: input.id,
      email: normalizedEmail,
      display_name: input.displayName ?? 'Admin',
      avatar_url: input.avatarUrl ?? null,
      password_hash: passwordHash,
      totp_enabled: false,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('id');

  return (created?.id as string | undefined) ?? null;
}

// =============================================================================
// Transform Functions
// =============================================================================

function transformAdminUser(row: Record<string, unknown>): AdminUser {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: (row.display_name as string) || 'Admin',
    avatarUrl: (row.avatar_url as string) || null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function transformAdminUserProfile(row: Record<string, unknown>): AdminUserProfile {
  return {
    ...transformAdminUser(row),
    bio: (row.bio as string) || null,
    title: (row.title as string) || null,
    location: (row.location as string) || null,
    websiteUrl: (row.website_url as string) || null,
    twitterHandle: (row.twitter_handle as string) || null,
    githubHandle: (row.github_handle as string) || null,
    linkedinHandle: (row.linkedin_handle as string) || null,
    avatarMediaId: (row.avatar_media_id as string) || null,
  };
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Find admin user by ID (basic info)
 */
export async function findAdminUserById(id: string): Promise<AdminUser | null> {
  const db = getDb();
  const row = await db('admin_users')
    .select('id', 'email', 'display_name', 'avatar_url', 'created_at', 'updated_at')
    .where('id', id)
    .first();

  if (!row) return null;
  return transformAdminUser(row);
}

/**
 * Find admin user by email (basic info)
 */
export async function findAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const db = getDb();
  const row = await db('admin_users')
    .select('id', 'email', 'display_name', 'avatar_url', 'created_at', 'updated_at')
    .where('email', email)
    .first();

  if (!row) return null;
  return transformAdminUser(row);
}

/**
 * Get admin user profile (full profile with bio, social links, etc.)
 */
export async function getAdminUserProfile(id: string): Promise<AdminUserProfile | null> {
  const db = getDb();
  const row = await db('admin_users')
    .select(
      'id',
      'email',
      'display_name',
      'avatar_url',
      'bio',
      'title',
      'location',
      'website_url',
      'twitter_handle',
      'github_handle',
      'linkedin_handle',
      'avatar_media_id',
      'created_at',
      'updated_at'
    )
    .where('id', id)
    .first();

  if (!row) return null;
  return transformAdminUserProfile(row);
}

/**
 * Verify admin credentials
 */
export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<AdminUser | null> {
  const db = getDb();
  const user = await db('admin_users')
    .select(
      'id',
      'email',
      'display_name',
      'avatar_url',
      'password_hash',
      'created_at',
      'updated_at'
    )
    .where('email', email)
    .first();

  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return null;

  return transformAdminUser(user);
}

/**
 * Get all admin users
 */
export async function getAllAdminUsers(): Promise<AdminUser[]> {
  const db = getDb();
  const rows = await db('admin_users')
    .select('id', 'email', 'display_name', 'avatar_url', 'created_at', 'updated_at')
    .orderBy('created_at', 'asc');

  return rows.map(transformAdminUser);
}

/**
 * Get first (primary) admin user
 */
export async function getPrimaryAdminUser(): Promise<AdminUserProfile | null> {
  const db = getDb();
  const row = await db('admin_users')
    .select(
      'id',
      'email',
      'display_name',
      'avatar_url',
      'bio',
      'title',
      'location',
      'website_url',
      'twitter_handle',
      'github_handle',
      'linkedin_handle',
      'avatar_media_id',
      'created_at',
      'updated_at'
    )
    .orderBy('created_at', 'asc')
    .first();

  if (!row) return null;
  return transformAdminUserProfile(row);
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Create a new admin user
 */
export async function createAdminUser(data: CreateAdminUserData): Promise<AdminUser> {
  const db = getDb();
  const passwordHash = await bcrypt.hash(data.password, 12);

  const [row] = await db('admin_users')
    .insert({
      email: data.email,
      password_hash: passwordHash,
      display_name: data.displayName || 'Admin',
    })
    .returning(['id', 'email', 'display_name', 'avatar_url', 'created_at', 'updated_at']);

  return transformAdminUser(row);
}

/**
 * Update admin user profile
 */
export async function updateAdminProfile(
  id: string,
  data: UpdateProfileData
): Promise<AdminUserProfile | null> {
  const db = getDb();

  // Build update object with snake_case keys
  const updateData: Record<string, unknown> = { updated_at: new Date() };

  if (data.displayName !== undefined) updateData.display_name = data.displayName;
  if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.websiteUrl !== undefined) updateData.website_url = data.websiteUrl;
  if (data.twitterHandle !== undefined) updateData.twitter_handle = data.twitterHandle;
  if (data.githubHandle !== undefined) updateData.github_handle = data.githubHandle;
  if (data.linkedinHandle !== undefined) updateData.linkedin_handle = data.linkedinHandle;
  if (data.avatarMediaId !== undefined) updateData.avatar_media_id = data.avatarMediaId;

  const [row] = await db('admin_users')
    .where('id', id)
    .update(updateData)
    .returning([
      'id',
      'email',
      'display_name',
      'avatar_url',
      'bio',
      'title',
      'location',
      'website_url',
      'twitter_handle',
      'github_handle',
      'linkedin_handle',
      'avatar_media_id',
      'created_at',
      'updated_at',
    ]);

  if (!row) return null;
  return transformAdminUserProfile(row);
}

/**
 * Update admin email
 */
export async function updateAdminEmail(id: string, email: string): Promise<boolean> {
  const db = getDb();

  // Check if email is already taken
  const existing = await db('admin_users').where('email', email).whereNot('id', id).first();
  if (existing) return false;

  const result = await db('admin_users').where('id', id).update({ email, updated_at: new Date() });

  return result > 0;
}

/**
 * Update admin password
 */
export async function updateAdminPassword(id: string, newPassword: string): Promise<boolean> {
  const db = getDb();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  const result = await db('admin_users').where('id', id).update({
    password_hash: passwordHash,
    updated_at: new Date(),
  });

  return result > 0;
}

/**
 * Verify current password before changing
 */
export async function verifyCurrentPassword(id: string, password: string): Promise<boolean> {
  const db = getDb();
  const user = await db('admin_users').where('id', id).select('password_hash').first();

  if (!user) return false;

  return bcrypt.compare(password, user.password_hash);
}

/**
 * Delete admin user
 */
export async function deleteAdminUser(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db('admin_users').where('id', id).delete();
  return result > 0;
}

/**
 * Clear avatar reference for a specific media ID
 * Used when deleting media from the media library
 */
export async function clearAvatarMediaReference(mediaId: string): Promise<number> {
  const db = getDb();
  const result = await db('admin_users').where('avatar_media_id', mediaId).update({
    avatar_media_id: null,
    avatar_url: null,
    updated_at: new Date(),
  });
  return result;
}

/**
 * Get the current avatar media ID for a user
 */
export async function getAvatarMediaId(userId: string): Promise<string | null> {
  const db = getDb();
  const row = await db('admin_users').select('avatar_media_id').where('id', userId).first();
  return row?.avatar_media_id || null;
}

/**
 * Hash a password (utility function)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
