/**
 * Security Utilities
 * ==================
 *
 * Bot detection and security-related utilities.
 *
 * For rate limiting, use @/lib/rate-limiter.ts instead.
 */

/**
 * Bot detection heuristics
 */
export interface BotDetectionResult {
  isLikelyBot: boolean;
  reasons: string[];
}

export function detectBot(request: {
  userAgent?: string;
  timestamp?: number;
  honeypot?: string;
}): BotDetectionResult {
  const reasons: string[] = [];

  // Check honeypot field
  if (request.honeypot && request.honeypot.length > 0) {
    reasons.push('Honeypot field filled');
  }

  // Check submission time (too fast = likely bot)
  if (request.timestamp) {
    const submissionTime = Date.now() - request.timestamp;
    if (submissionTime < 3000) {
      // Less than 3 seconds
      reasons.push('Submitted too quickly');
    }
  }

  // Check user agent
  const userAgent = request.userAgent?.toLowerCase() || '';
  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'headless',
    'phantom',
    'selenium',
    'puppeteer',
    'playwright',
  ];

  if (botPatterns.some((pattern) => userAgent.includes(pattern))) {
    reasons.push('Bot-like user agent');
  }

  // Empty user agent
  if (!userAgent || userAgent.length < 10) {
    reasons.push('Missing or suspicious user agent');
  }

  return {
    isLikelyBot: reasons.length > 0,
    reasons,
  };
}

/**
 * Sanitize IP address for logging
 */
export function sanitizeIp(ip: string | null): string {
  if (!ip) return 'unknown';
  // Handle IPv4-mapped IPv6 addresses
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * Get client IP from request headers
 */
export function getClientIp(headers: Headers): string {
  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return sanitizeIp(forwardedFor.split(',')[0].trim());
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return sanitizeIp(realIp);
  }

  return 'unknown';
}
