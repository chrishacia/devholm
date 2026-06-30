import type { NextConfig } from 'next';
import { version } from './package.json';

// Derive upload limit from the same env var used in src/config/env.ts
const uploadMaxSizeMb = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '50', 10);
const commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA || '';
const shortSha = commitSha ? commitSha.slice(0, 7) : '';
const baseVersion = process.env.npm_package_version || version;
const frameworkVersion = process.env.DEVHOLM_FRAMEWORK_VERSION || 'unknown';
const repoSlug = process.env.GITHUB_REPOSITORY || process.env.REPO_SLUG || '';
const isDevholmFrameworkRepo = repoSlug === 'chrishacia/devholm';
const displayVersion =
  isDevholmFrameworkRepo && shortSha ? `${baseVersion}+${shortSha}` : baseVersion;

const nextConfig: NextConfig = {
  // Bake the package.json version into the client bundle
  env: {
    NEXT_PUBLIC_APP_VERSION: displayVersion,
    NEXT_PUBLIC_FRAMEWORK_VERSION: frameworkVersion,
    NEXT_PUBLIC_BUILD_SHA: commitSha,
  },

  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Output standalone for Docker deployment
  output: 'standalone',

  // Note: Turbopack is used for dev by default in Next.js 16
  // but we don't configure it here to use webpack for production builds
  // (Turbopack + standalone + middleware has issues with nft.json files)

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Security headers are handled in middleware.ts
  // but we can add some here as well
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
      {
        // Cache static assets aggressively
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      // Add any legacy URL redirects here
      // {
      //   source: '/old-path',
      //   destination: '/new-path',
      //   permanent: true,
      // },
    ];
  },

  // Rewrites - serve uploads through API route
  async rewrites() {
    return [
      {
        // Serve uploaded files via the media API route
        // /uploads/2026/01/19/abc.webp -> /api/media/2026/01/19/abc.webp
        source: '/uploads/:path*',
        destination: '/api/media/:path*',
      },
    ];
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: `${uploadMaxSizeMb}mb`,
    },
  },

  // Server external packages - these won't be bundled
  // Required for Knex and database drivers
  serverExternalPackages: ['knex', 'pg', 'pg-query-stream', 'bcryptjs'],
};

export default nextConfig;
