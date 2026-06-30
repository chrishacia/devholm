/**
 * Media Proxy Route
 * =================
 *
 * Serves media files with:
 * - Graceful handling of missing files (returns placeholder)
 * - Caching headers for performance
 * - Optional future features: resize on-the-fly, watermarks, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Placeholder SVG for missing images
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect fill="#f0f0f0" width="400" height="300"/>
  <g fill="#999" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">
    <text x="200" y="140">Image not available</text>
    <text x="200" y="165" font-size="12" fill="#bbb">The requested file was not found</text>
  </g>
  <g fill="none" stroke="#ccc" stroke-width="2">
    <rect x="160" y="80" width="80" height="60" rx="4"/>
    <circle cx="178" cy="100" r="8"/>
    <path d="M165 135 l20-25 15 15 25-20 15 30"/>
  </g>
</svg>`;

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  // Reconstruct the file path
  const relativePath = pathSegments.join('/');
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const filePath = path.join(uploadDir, relativePath);

  // Security: Prevent directory traversal
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(uploadDir)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Check if file exists
  if (!existsSync(filePath)) {
    // Return placeholder for images
    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext);

    if (isImage) {
      return new NextResponse(PLACEHOLDER_SVG, {
        status: 200, // Return 200 so image renders
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache', // Don't cache placeholder
          'X-Media-Status': 'placeholder', // Custom header to indicate placeholder
        },
      });
    }

    // For non-images, return 404
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    // Read file
    const fileBuffer = readFileSync(filePath);
    const stats = statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Set cache headers (1 year for immutable content)
    const headers: HeadersInit = {
      'Content-Type': contentType,
      'Content-Length': stats.size.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Last-Modified': stats.mtime.toUTCString(),
    };

    return new NextResponse(fileBuffer, { status: 200, headers });
  } catch (error) {
    console.error('Error serving media:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
