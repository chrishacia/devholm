/**
 * Rate Limiter Utility
 * ====================
 *
 * Database-backed rate limiting for API endpoints.
 * Supports different limits for different actions.
 */

import { getDb } from '@/db';
import { rateLimit as rateLimitConfig } from '@/config/env';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Unique identifier for the action being rate limited */
  action: string;
  /** Identifier for the requester (usually IP or user ID) */
  identifier: string;
  /** Maximum number of requests allowed in the window */
  maxRequests?: number;
  /** Window duration in milliseconds */
  windowMs?: number;
}

/**
 * Check and update rate limit for a request
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const {
    action,
    identifier,
    maxRequests = rateLimitConfig.maxRequests,
    windowMs = rateLimitConfig.windowMs,
  } = options;

  const db = getDb();
  const key = `${action}:${identifier}`;
  const now = new Date();
  const windowStart = now;
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    // Get existing rate limit record
    const record = await db('rate_limits').where('key', key).first();

    if (!record || new Date(record.expires_at) < now) {
      // Create or reset rate limit
      await db('rate_limits')
        .insert({
          key,
          count: 1,
          window_start: windowStart,
          expires_at: expiresAt,
        })
        .onConflict('key')
        .merge({
          count: 1,
          window_start: windowStart,
          expires_at: expiresAt,
        });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: expiresAt,
        retryAfterSeconds: 0,
      };
    }

    // Check if limit exceeded
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((new Date(record.expires_at).getTime() - now.getTime()) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(record.expires_at),
        retryAfterSeconds: retryAfter > 0 ? retryAfter : 0,
      };
    }

    // Increment count
    await db('rate_limits').where('key', key).increment('count', 1);

    return {
      allowed: true,
      remaining: maxRequests - record.count - 1,
      resetAt: new Date(record.expires_at),
      retryAfterSeconds: 0,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open - allow the request if rate limiting fails
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: expiresAt,
      retryAfterSeconds: 0,
    };
  }
}

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

/**
 * Create rate limit response headers
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 1 : 0)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.resetAt.toISOString(),
    ...(result.retryAfterSeconds > 0 && {
      'Retry-After': String(result.retryAfterSeconds),
    }),
  };
}

/**
 * Predefined rate limit configurations
 */
export const RateLimits = {
  /** Public API - 100 requests per 15 minutes */
  PUBLIC_API: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000,
  },
  /** Search API - 30 requests per minute */
  SEARCH: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  /** Contact form - 5 per hour */
  CONTACT: {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  },
  /** Admin API - 200 requests per 15 minutes */
  ADMIN_API: {
    maxRequests: 200,
    windowMs: 15 * 60 * 1000,
  },
  /** File upload - 20 per hour */
  UPLOAD: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  },
  /** Login attempts - 5 per 15 minutes */
  LOGIN: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  },
} as const;

/**
 * Clean up expired rate limit records
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const db = getDb();
  const now = new Date();

  try {
    const deleted = await db('rate_limits').where('expires_at', '<', now).delete();

    return deleted;
  } catch (error) {
    console.error('Rate limit cleanup error:', error);
    return 0;
  }
}
