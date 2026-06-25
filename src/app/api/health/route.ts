import { NextResponse } from 'next/server';
import { checkDbHealth } from '@/db';

/**
 * Health check endpoint for Docker container monitoring
 * Returns 200 OK when the application is healthy
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shouldCheckDb =
      process.env.HEALTHCHECK_DB === 'true' || url.searchParams.get('deep') === '1';
    const dbHealthy = shouldCheckDb ? await checkDbHealth() : null;

    // Basic health check
    const health = {
      status: dbHealthy === false ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || 'unknown',
      buildSha:
        process.env.GITHUB_SHA || process.env.COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA || '',
      checks: {
        database: dbHealthy,
      },
    };

    return NextResponse.json(health, { status: dbHealthy === false ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
