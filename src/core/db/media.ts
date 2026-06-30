/**
 * Media Database Layer
 * ====================
 *
 * Handles all media asset and variant database operations.
 * Supports the new variant-based image system.
 */

import { getDb } from './index';
import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface MediaAsset {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  publicUrl: string | null;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  uploadedBy: string | null;
  fileHash: string | null;
  isProcessed: boolean;
  uploadIp: string | null;
  processingError: string | null;
  createdAt: Date;
  variants?: MediaVariant[];
}

export interface MediaVariant {
  id: string;
  mediaAssetId: string;
  variantName: string;
  filename: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export interface MediaAssetInsert {
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  public_url?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  uploaded_by?: string | null;
  file_hash?: string | null;
  is_processed?: boolean;
  upload_ip?: string | null;
  processing_error?: string | null;
}

export interface MediaVariantInsert {
  media_asset_id: string;
  variant_name: string;
  filename: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  file_size: number;
  width?: number | null;
  height?: number | null;
}

export interface MediaAssetUpdate {
  alt_text?: string | null;
  caption?: string | null;
  is_processed?: boolean;
  processing_error?: string | null;
}

export interface PaginatedMedia {
  media: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MediaWithVariants extends MediaAsset {
  variants: MediaVariant[];
}

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Transform database row to MediaAsset
 */
function transformMediaAsset(row: Record<string, unknown>): MediaAsset {
  return {
    id: row.id as string,
    filename: row.filename as string,
    originalFilename: row.original_filename as string,
    mimeType: row.mime_type as string,
    fileSize: Number(row.file_size),
    storagePath: row.storage_path as string,
    publicUrl: row.public_url as string | null,
    altText: row.alt_text as string | null,
    caption: row.caption as string | null,
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null,
    uploadedBy: row.uploaded_by as string | null,
    fileHash: (row.file_hash as string | null) ?? null,
    isProcessed: Boolean(row.is_processed ?? false),
    uploadIp: (row.upload_ip as string | null) ?? null,
    processingError: (row.processing_error as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

/**
 * Transform database row to MediaVariant
 */
function transformMediaVariant(row: Record<string, unknown>): MediaVariant {
  return {
    id: row.id as string,
    mediaAssetId: row.media_asset_id as string,
    variantName: row.variant_name as string,
    filename: row.filename as string,
    storagePath: row.storage_path as string,
    publicUrl: row.public_url as string,
    mimeType: row.mime_type as string,
    fileSize: Number(row.file_size),
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null,
    createdAt: row.created_at as Date,
  };
}

// =============================================================================
// Hash Functions
// =============================================================================

/**
 * Generate SHA-256 hash of file content
 */
export function generateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if a file with the same hash already exists
 */
export async function findByHash(hash: string): Promise<MediaAsset | null> {
  const db = getDb();
  const asset = await db('media_assets').where('file_hash', hash).first();
  return asset ? transformMediaAsset(asset) : null;
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all media assets with pagination
 */
export async function getMediaAssets(
  page = 1,
  pageSize = 20,
  mimeTypeFilter?: string,
  search?: string
): Promise<PaginatedMedia> {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  let query = db('media_assets');
  let countQuery = db('media_assets');

  // Filter by mime type (images, documents, etc.)
  if (mimeTypeFilter) {
    if (mimeTypeFilter === 'images') {
      query = query.where('mime_type', 'like', 'image/%');
      countQuery = countQuery.where('mime_type', 'like', 'image/%');
    } else if (mimeTypeFilter === 'documents') {
      query = query.where(function () {
        this.where('mime_type', 'like', 'application/pdf')
          .orWhere('mime_type', 'like', 'application/%word%')
          .orWhere('mime_type', 'like', 'application/%sheet%')
          .orWhere('mime_type', 'like', 'application/%presentation%')
          .orWhere('mime_type', 'like', 'text/plain')
          .orWhere('mime_type', 'like', 'text/markdown')
          .orWhere('mime_type', 'like', 'text/csv');
      });
      countQuery = countQuery.where(function () {
        this.where('mime_type', 'like', 'application/pdf')
          .orWhere('mime_type', 'like', 'application/%word%')
          .orWhere('mime_type', 'like', 'application/%sheet%')
          .orWhere('mime_type', 'like', 'application/%presentation%')
          .orWhere('mime_type', 'like', 'text/plain')
          .orWhere('mime_type', 'like', 'text/markdown')
          .orWhere('mime_type', 'like', 'text/csv');
      });
    } else if (mimeTypeFilter === 'videos') {
      query = query.where('mime_type', 'like', 'video/%');
      countQuery = countQuery.where('mime_type', 'like', 'video/%');
    } else if (mimeTypeFilter === 'audio') {
      query = query.where('mime_type', 'like', 'audio/%');
      countQuery = countQuery.where('mime_type', 'like', 'audio/%');
    } else if (mimeTypeFilter === 'other') {
      // Everything that's not image, video, audio, or document
      query = query.where(function () {
        this.whereNot('mime_type', 'like', 'image/%')
          .whereNot('mime_type', 'like', 'video/%')
          .whereNot('mime_type', 'like', 'audio/%')
          .whereNot('mime_type', 'like', 'application/pdf')
          .whereNot('mime_type', 'like', 'application/%word%')
          .whereNot('mime_type', 'like', 'application/%sheet%')
          .whereNot('mime_type', 'like', 'application/%presentation%')
          .whereNot('mime_type', 'like', 'text/plain')
          .whereNot('mime_type', 'like', 'text/markdown')
          .whereNot('mime_type', 'like', 'text/csv');
      });
      countQuery = countQuery.where(function () {
        this.whereNot('mime_type', 'like', 'image/%')
          .whereNot('mime_type', 'like', 'video/%')
          .whereNot('mime_type', 'like', 'audio/%')
          .whereNot('mime_type', 'like', 'application/pdf')
          .whereNot('mime_type', 'like', 'application/%word%')
          .whereNot('mime_type', 'like', 'application/%sheet%')
          .whereNot('mime_type', 'like', 'application/%presentation%')
          .whereNot('mime_type', 'like', 'text/plain')
          .whereNot('mime_type', 'like', 'text/markdown')
          .whereNot('mime_type', 'like', 'text/csv');
      });
    }
  }

  // Search by filename or alt text
  if (search) {
    query = query.where(function () {
      this.whereILike('filename', `%${search}%`)
        .orWhereILike('original_filename', `%${search}%`)
        .orWhereILike('alt_text', `%${search}%`);
    });
    countQuery = countQuery.where(function () {
      this.whereILike('filename', `%${search}%`)
        .orWhereILike('original_filename', `%${search}%`)
        .orWhereILike('alt_text', `%${search}%`);
    });
  }

  // Get total count
  const [{ count }] = await countQuery.count('* as count');
  const total = Number(count);

  // Get media assets
  const assets = await query
    .select('*')
    .orderBy('created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  return {
    media: assets.map(transformMediaAsset),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single media asset by ID
 */
export async function getMediaAssetById(id: string): Promise<MediaAsset | null> {
  const db = getDb();
  const asset = await db('media_assets').where('id', id).first();
  return asset ? transformMediaAsset(asset) : null;
}

/**
 * Get a media asset with all its variants
 */
export async function getMediaAssetWithVariants(id: string): Promise<MediaWithVariants | null> {
  const db = getDb();

  const asset = await db('media_assets').where('id', id).first();
  if (!asset) return null;

  const variants = await db('media_variants').where('media_asset_id', id).orderBy('variant_name');

  return {
    ...transformMediaAsset(asset),
    variants: variants.map(transformMediaVariant),
  };
}

/**
 * Create a new media asset
 */
export async function createMediaAsset(data: MediaAssetInsert): Promise<MediaAsset> {
  const db = getDb();
  const [asset] = await db('media_assets').insert(data).returning('*');
  return transformMediaAsset(asset);
}

/**
 * Create multiple variants for a media asset
 */
export async function createMediaVariants(variants: MediaVariantInsert[]): Promise<MediaVariant[]> {
  if (variants.length === 0) return [];

  const db = getDb();
  const created = await db('media_variants').insert(variants).returning('*');
  return created.map(transformMediaVariant);
}

/**
 * Update a media asset
 */
export async function updateMediaAsset(
  id: string,
  data: MediaAssetUpdate
): Promise<MediaAsset | null> {
  const db = getDb();
  const [updated] = await db('media_assets').where('id', id).update(data).returning('*');
  return updated ? transformMediaAsset(updated) : null;
}

/**
 * Delete a media asset (cascade deletes variants)
 */
export async function deleteMediaAsset(id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db('media_assets').where('id', id).delete();
  return deleted > 0;
}

/**
 * Delete multiple media assets
 */
export async function deleteMediaAssets(ids: string[]): Promise<number> {
  const db = getDb();
  return db('media_assets').whereIn('id', ids).delete();
}

/**
 * Get variants for a media asset
 */
export async function getVariantsForAsset(mediaAssetId: string): Promise<MediaVariant[]> {
  const db = getDb();
  const variants = await db('media_variants')
    .where('media_asset_id', mediaAssetId)
    .orderBy('variant_name');
  return variants.map(transformMediaVariant);
}

/**
 * Get a specific variant by name
 */
export async function getVariantByName(
  mediaAssetId: string,
  variantName: string
): Promise<MediaVariant | null> {
  const db = getDb();
  const variant = await db('media_variants')
    .where('media_asset_id', mediaAssetId)
    .where('variant_name', variantName)
    .first();
  return variant ? transformMediaVariant(variant) : null;
}

/**
 * Get all storage paths for a media asset (for deletion)
 */
export async function getAllStoragePaths(id: string): Promise<string[]> {
  const db = getDb();

  const asset = await db('media_assets').select('storage_path').where('id', id).first();
  if (!asset) return [];

  const variants = await db('media_variants').select('storage_path').where('media_asset_id', id);

  return [asset.storage_path, ...variants.map((v: { storage_path: string }) => v.storage_path)];
}

// =============================================================================
// Stats & Utilities
// =============================================================================

/**
 * Get media stats (count by type)
 */
export async function getMediaStats(): Promise<{
  total: number;
  images: number;
  documents: number;
  videos: number;
  audio: number;
  other: number;
  totalSize: number;
}> {
  const db = getDb();

  const [total] = await db('media_assets').count('* as count');
  const [images] = await db('media_assets')
    .where('mime_type', 'like', 'image/%')
    .count('* as count');
  const [documents] = await db('media_assets')
    .where(function () {
      this.where('mime_type', 'like', 'application/pdf')
        .orWhere('mime_type', 'like', 'application/%word%')
        .orWhere('mime_type', 'like', 'application/%sheet%')
        .orWhere('mime_type', 'like', 'application/%presentation%')
        .orWhere('mime_type', 'like', 'text/plain')
        .orWhere('mime_type', 'like', 'text/markdown')
        .orWhere('mime_type', 'like', 'text/csv');
    })
    .count('* as count');
  const [videos] = await db('media_assets')
    .where('mime_type', 'like', 'video/%')
    .count('* as count');
  const [audio] = await db('media_assets')
    .where('mime_type', 'like', 'audio/%')
    .count('* as count');
  const [other] = await db('media_assets')
    .whereNot('mime_type', 'like', 'image/%')
    .whereNot('mime_type', 'like', 'video/%')
    .whereNot('mime_type', 'like', 'audio/%')
    .whereNot('mime_type', 'like', 'application/pdf')
    .whereNot('mime_type', 'like', 'application/%word%')
    .whereNot('mime_type', 'like', 'application/%sheet%')
    .whereNot('mime_type', 'like', 'application/%presentation%')
    .whereNot('mime_type', 'like', 'text/plain')
    .whereNot('mime_type', 'like', 'text/markdown')
    .whereNot('mime_type', 'like', 'text/csv')
    .count('* as count');

  // Sum original file sizes plus variant sizes
  const [assetSize] = await db('media_assets').sum('file_size as total');

  // Try to get variant sizes (table may not exist yet before migration)
  let variantSizeTotal = 0;
  try {
    const hasVariantsTable = await db.schema.hasTable('media_variants');
    if (hasVariantsTable) {
      const [variantSize] = await db('media_variants').sum('file_size as total');
      variantSizeTotal = Number(variantSize?.total) || 0;
    }
  } catch {
    // Ignore - table doesn't exist yet
  }

  return {
    total: Number(total.count),
    images: Number(images.count),
    documents: Number(documents.count),
    videos: Number(videos.count),
    audio: Number(audio.count),
    other: Number(other.count),
    totalSize: (Number(assetSize?.total) || 0) + variantSizeTotal,
  };
}

/**
 * Get recent media assets
 */
export async function getRecentMedia(limit = 10): Promise<MediaAsset[]> {
  const db = getDb();
  const assets = await db('media_assets').select('*').orderBy('created_at', 'desc').limit(limit);
  return assets.map(transformMediaAsset);
}

/**
 * Check if filename exists (to generate unique names)
 */
export async function filenameExists(filename: string): Promise<boolean> {
  const db = getDb();
  const [{ count }] = await db('media_assets').where('filename', filename).count('* as count');
  return Number(count) > 0;
}

/**
 * Get optimal variant URL for display
 * Returns the smallest variant >= the requested width
 */
export async function getOptimalVariantUrl(
  mediaAssetId: string,
  maxWidth: number
): Promise<string | null> {
  const db = getDb();

  // Check if variants table exists
  try {
    const hasVariantsTable = await db.schema.hasTable('media_variants');
    if (!hasVariantsTable) {
      const asset = await db('media_assets').select('public_url').where('id', mediaAssetId).first();
      return asset?.public_url || null;
    }
  } catch {
    const asset = await db('media_assets').select('public_url').where('id', mediaAssetId).first();
    return asset?.public_url || null;
  }

  // Get all variants sorted by width
  const variants = await db('media_variants')
    .select('public_url', 'width')
    .where('media_asset_id', mediaAssetId)
    .whereNotNull('width')
    .orderBy('width', 'asc');

  // Find smallest variant >= maxWidth
  const suitable = variants.find((v: { width: number }) => v.width >= maxWidth);
  if (suitable) {
    return suitable.public_url;
  }

  // Fall back to largest variant if none are large enough
  if (variants.length > 0) {
    return variants[variants.length - 1].public_url;
  }

  // Fall back to original
  const asset = await db('media_assets').select('public_url').where('id', mediaAssetId).first();
  return asset?.public_url || null;
}
