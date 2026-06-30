/**
 * Image Processing Service
 * ========================
 *
 * Handles secure file uploads with:
 * - File type validation (magic bytes, not just extension)
 * - Image optimization and variant generation
 * - Secure filename generation
 * - Metadata stripping for privacy
 */

import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface ImageVariant {
  name: string;
  width: number;
  height?: number;
  quality: number;
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface ProcessedImage {
  original: ProcessedFile;
  variants: ProcessedFile[];
}

export interface ProcessedFile {
  filename: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  variantName?: string;
}

export interface UploadResult {
  success: boolean;
  file?: ProcessedFile;
  variants?: ProcessedFile[];
  error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

/** Magic bytes for file type detection */
const FILE_SIGNATURES: Record<string, { bytes: number[]; offset?: number }[]> = {
  // Images
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/gif': [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF
  ],
  'image/svg+xml': [
    { bytes: [0x3c, 0x3f, 0x78, 0x6d, 0x6c] }, // <?xml
    { bytes: [0x3c, 0x73, 0x76, 0x67] }, // <svg
  ],
  'image/bmp': [
    { bytes: [0x42, 0x4d] }, // BM
  ],
  'image/tiff': [
    { bytes: [0x49, 0x49, 0x2a, 0x00] }, // Little-endian
    { bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // Big-endian
  ],
  // Documents
  'application/pdf': [
    { bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],
  'application/msword': [
    { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE compound
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP (OOXML)
  ],
  'application/vnd.ms-excel': [
    { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE compound
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP (OOXML)
  ],
  'application/vnd.ms-powerpoint': [
    { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE compound
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP (OOXML)
  ],
  // Audio
  'audio/mpeg': [
    { bytes: [0xff, 0xfb] }, // MP3 frame sync
    { bytes: [0xff, 0xfa] },
    { bytes: [0xff, 0xf3] },
    { bytes: [0xff, 0xf2] },
    { bytes: [0x49, 0x44, 0x33] }, // ID3 tag
  ],
  'audio/wav': [
    { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  ],
  'audio/ogg': [
    { bytes: [0x4f, 0x67, 0x67, 0x53] }, // OggS
  ],
  'audio/mp4': [
    { bytes: [0x00, 0x00, 0x00], offset: 0 }, // ftyp box (varies)
  ],
  'audio/aac': [
    { bytes: [0xff, 0xf1] }, // ADTS
    { bytes: [0xff, 0xf9] },
  ],
  'audio/flac': [
    { bytes: [0x66, 0x4c, 0x61, 0x43] }, // fLaC
  ],
  'audio/webm': [
    { bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML
  ],
  // Video
  'video/mp4': [
    { bytes: [0x00, 0x00, 0x00], offset: 0 }, // ftyp box (varies)
  ],
  'video/webm': [
    { bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML
  ],
  'video/ogg': [
    { bytes: [0x4f, 0x67, 0x67, 0x53] }, // OggS
  ],
  'video/quicktime': [
    { bytes: [0x00, 0x00, 0x00], offset: 0 }, // ftyp box
  ],
  'video/x-msvideo': [
    { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  ],
  'video/mpeg': [
    { bytes: [0x00, 0x00, 0x01, 0xba] }, // MPEG PS
    { bytes: [0x00, 0x00, 0x01, 0xb3] }, // MPEG sequence
  ],
  // Archives
  'application/zip': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] },
    { bytes: [0x50, 0x4b, 0x05, 0x06] }, // Empty archive
  ],
  'application/x-rar-compressed': [
    { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] }, // Rar!
  ],
  'application/gzip': [{ bytes: [0x1f, 0x8b] }],
  'application/x-7z-compressed': [
    { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] }, // 7z
  ],
  // Data formats
  'application/json': [], // Text-based, validated differently
  'application/xml': [
    { bytes: [0x3c, 0x3f, 0x78, 0x6d, 0x6c] }, // <?xml
  ],
};

/** Allowed MIME types with extensions */
const ALLOWED_TYPES: Record<string, string[]> = {
  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tif', '.tiff'],
  // Documents
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  // Audio
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg', '.oga'],
  'audio/mp4': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/flac': ['.flac'],
  'audio/webm': ['.weba'],
  // Video
  'video/mp4': ['.mp4', '.m4v'],
  'video/webm': ['.webm'],
  'video/ogg': ['.ogv'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/mpeg': ['.mpeg', '.mpg'],
  // Archives
  'application/zip': ['.zip'],
  'application/x-rar-compressed': ['.rar'],
  'application/gzip': ['.gz'],
  'application/x-7z-compressed': ['.7z'],
  // Text/Data
  'text/plain': ['.txt', '.log'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/xml': ['.xml'],
};

/** Image variants to generate for uploaded images */
const IMAGE_VARIANTS: ImageVariant[] = [
  { name: 'thumbnail', width: 150, height: 150, quality: 80, fit: 'cover' },
  { name: 'small', width: 400, quality: 85, fit: 'inside' },
  { name: 'medium', width: 800, quality: 85, fit: 'inside' },
  { name: 'large', width: 1200, quality: 85, fit: 'inside' },
  { name: 'xlarge', width: 1920, quality: 90, fit: 'inside' },
];

/** Maximum dimensions for original image (will be resized if larger) */
const MAX_ORIGINAL_DIMENSION = 4096;

/** Supported image types for processing */
const PROCESSABLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// =============================================================================
// File Validation
// =============================================================================

/**
 * Validate file type using magic bytes
 */
export function validateFileType(buffer: Buffer, declaredMimeType: string): boolean {
  // Check if the MIME type is allowed
  if (!ALLOWED_TYPES[declaredMimeType]) {
    return false;
  }

  // For text-based files, we can't easily validate with magic bytes
  if (declaredMimeType.startsWith('text/') || declaredMimeType === 'application/json') {
    // Basic check: ensure it's valid UTF-8 text
    try {
      const text = buffer.toString('utf-8');
      // Check for null bytes which shouldn't be in text files
      if (text.includes('\0')) return false;

      // For JSON, verify it parses
      if (declaredMimeType === 'application/json') {
        JSON.parse(text);
      }
      return true;
    } catch {
      return false;
    }
  }

  const signatures = FILE_SIGNATURES[declaredMimeType];
  if (!signatures || signatures.length === 0) {
    // If no signature defined, rely on extension check only
    return true;
  }

  // Check if buffer matches any of the valid signatures
  return signatures.some((sig) => {
    const offset = sig.offset || 0;
    if (buffer.length < offset + sig.bytes.length) {
      return false;
    }
    return sig.bytes.every((byte, i) => buffer[offset + i] === byte);
  });
}

/**
 * Validate file extension matches MIME type
 */
export function validateExtension(filename: string, mimeType: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions = ALLOWED_TYPES[mimeType];
  return allowedExtensions ? allowedExtensions.includes(ext) : false;
}

/**
 * Check for potentially dangerous file content
 */
export function checkForMaliciousContent(buffer: Buffer): boolean {
  const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));

  // Check for common script injections in SVG
  const dangerousPatterns = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick, onerror, etc.
    /data:text\/html/i,
    /<!--[\s\S]*-->/i, // HTML comments (can hide malicious content)
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(content));
}

// =============================================================================
// Filename Generation
// =============================================================================

/**
 * Generate a secure, unique filename
 * Uses UUID + hash to prevent enumeration attacks
 */
export function generateSecureFilename(originalFilename: string, mimeType: string): string {
  const uuid = uuidv4();
  const hash = crypto.randomBytes(8).toString('hex');

  // Get appropriate extension from MIME type
  const extensions = ALLOWED_TYPES[mimeType];
  const ext = extensions ? extensions[0] : path.extname(originalFilename).toLowerCase();

  // Create filename: uuid-hash.ext
  return `${uuid.split('-')[0]}-${hash}${ext}`;
}

/**
 * Generate storage path with date-based organization
 */
export function generateStoragePath(): { dir: string; relativeDir: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const relativeDir = path.join('uploads', String(year), month, day);
  const dir = path.join(process.cwd(), 'public', relativeDir);

  return { dir, relativeDir };
}

// =============================================================================
// Image Processing
// =============================================================================

/**
 * Process and optimize an image, generating variants
 * @param buffer - Image buffer data
 * @param mimeType - MIME type of the image
 * @param _originalFilename - Original filename (kept for future metadata use)
 */
export async function processImage(
  buffer: Buffer,
  mimeType: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _originalFilename: string
): Promise<ProcessedImage> {
  const { dir, relativeDir } = generateStoragePath();

  // Ensure upload directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Generate base filename (without extension)
  const uuid = uuidv4();
  const baseHash = crypto.randomBytes(4).toString('hex');
  const baseName = `${uuid.split('-')[0]}-${baseHash}`;

  // Get image metadata
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Determine output format (convert to WebP for better compression, except GIFs)
  const isAnimatedGif = mimeType === 'image/gif';
  // const outputFormat = isAnimatedGif ? 'gif' : 'webp';
  const outputExt = isAnimatedGif ? '.gif' : '.webp';
  const outputMimeType = isAnimatedGif ? 'image/gif' : 'image/webp';

  // Process original - strip metadata and resize if too large
  let originalPipeline = sharp(buffer)
    .rotate() // Auto-rotate based on EXIF
    .withMetadata({ orientation: undefined }); // Strip all metadata except color profile

  // Resize if original is too large
  if (originalWidth > MAX_ORIGINAL_DIMENSION || originalHeight > MAX_ORIGINAL_DIMENSION) {
    originalPipeline = originalPipeline.resize(MAX_ORIGINAL_DIMENSION, MAX_ORIGINAL_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to output format
  if (isAnimatedGif) {
    originalPipeline = originalPipeline.gif();
  } else {
    originalPipeline = originalPipeline.webp({ quality: 90 });
  }

  const originalFilenameNew = `${baseName}-original${outputExt}`;
  const originalPath = path.join(dir, originalFilenameNew);
  const processedOriginal = await originalPipeline.toBuffer();
  await writeFile(originalPath, processedOriginal);

  // Get processed dimensions
  const processedMeta = await sharp(processedOriginal).metadata();

  const original: ProcessedFile = {
    filename: originalFilenameNew,
    storagePath: path.join(relativeDir, originalFilenameNew),
    publicUrl: `/${path.join(relativeDir, originalFilenameNew)}`,
    mimeType: outputMimeType,
    fileSize: processedOriginal.length,
    width: processedMeta.width || null,
    height: processedMeta.height || null,
  };

  // Generate variants (skip for GIFs to preserve animation)
  const variants: ProcessedFile[] = [];

  if (!isAnimatedGif) {
    for (const variant of IMAGE_VARIANTS) {
      // Skip variant if original is smaller
      if (originalWidth <= variant.width && (!variant.height || originalHeight <= variant.height)) {
        continue;
      }

      const variantFilename = `${baseName}-${variant.name}${outputExt}`;
      const variantPath = path.join(dir, variantFilename);

      const variantBuffer = await sharp(buffer)
        .rotate()
        .resize(variant.width, variant.height, {
          fit: variant.fit,
          withoutEnlargement: true,
        })
        .webp({ quality: variant.quality })
        .toBuffer();

      await writeFile(variantPath, variantBuffer);

      const variantMeta = await sharp(variantBuffer).metadata();

      variants.push({
        filename: variantFilename,
        storagePath: path.join(relativeDir, variantFilename),
        publicUrl: `/${path.join(relativeDir, variantFilename)}`,
        mimeType: 'image/webp',
        fileSize: variantBuffer.length,
        width: variantMeta.width || null,
        height: variantMeta.height || null,
        variantName: variant.name,
      });
    }
  }

  return { original, variants };
}

/**
 * Process a non-image file (PDF, text, etc.)
 */
export async function processFile(
  buffer: Buffer,
  mimeType: string,
  originalFilename: string
): Promise<ProcessedFile> {
  const { dir, relativeDir } = generateStoragePath();

  // Ensure upload directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const filename = generateSecureFilename(originalFilename, mimeType);
  const filePath = path.join(dir, filename);

  await writeFile(filePath, buffer);

  return {
    filename,
    storagePath: path.join(relativeDir, filename),
    publicUrl: `/${path.join(relativeDir, filename)}`,
    mimeType,
    fileSize: buffer.length,
    width: null,
    height: null,
  };
}

// =============================================================================
// Main Upload Handler
// =============================================================================

export interface UploadOptions {
  maxSizeBytes: number;
  generateVariants?: boolean;
}

/**
 * Process an uploaded file with full security checks
 */
export async function handleFileUpload(file: File, options: UploadOptions): Promise<UploadResult> {
  try {
    // Check file size
    if (file.size > options.maxSizeBytes) {
      const maxMb = Math.round(options.maxSizeBytes / (1024 * 1024));
      return { success: false, error: `File too large. Maximum size is ${maxMb}MB` };
    }

    // Check MIME type is allowed
    if (!ALLOWED_TYPES[file.type]) {
      return {
        success: false,
        error: `File type not allowed. Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
      };
    }

    // Check extension matches MIME type
    if (!validateExtension(file.name, file.type)) {
      return { success: false, error: 'File extension does not match file type' };
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate magic bytes
    if (!validateFileType(buffer, file.type)) {
      return { success: false, error: 'File content does not match declared type' };
    }

    // Check for malicious content in SVG files
    if (file.type === 'image/svg+xml' && !checkForMaliciousContent(buffer)) {
      return { success: false, error: 'File contains potentially dangerous content' };
    }

    // Process based on file type
    if (PROCESSABLE_IMAGE_TYPES.includes(file.type) && options.generateVariants !== false) {
      const result = await processImage(buffer, file.type, file.name);
      return {
        success: true,
        file: result.original,
        variants: result.variants,
      };
    } else {
      const result = await processFile(buffer, file.type, file.name);
      return {
        success: true,
        file: result,
        variants: [],
      };
    }
  } catch (error) {
    console.error('File upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Delete all files for a media asset (original + variants)
 */
export async function deleteMediaFiles(storagePaths: string[]): Promise<void> {
  for (const storagePath of storagePaths) {
    const fullPath = path.join(process.cwd(), 'public', storagePath);
    if (existsSync(fullPath)) {
      try {
        await unlink(fullPath);
      } catch (error) {
        console.error(`Failed to delete file: ${fullPath}`, error);
      }
    }
  }
}

/**
 * Get the best variant URL for a given size requirement
 */
export function getBestVariantUrl(
  variants: ProcessedFile[],
  original: ProcessedFile,
  maxWidth: number
): string {
  // Sort variants by width
  const sorted = [...variants].sort((a, b) => (a.width || 0) - (b.width || 0));

  // Find the smallest variant that's >= maxWidth
  const suitable = sorted.find((v) => (v.width || 0) >= maxWidth);

  return suitable?.publicUrl || original.publicUrl;
}
