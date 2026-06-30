/**
 * Analytics Dashboard API
 * =======================
 *
 * Protected endpoint for admin users to retrieve analytics data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getAnalyticsSummary,
  getReferrerStats,
  getPageTrends,
  getReferrerDetails,
  getAllPages,
  getAll404s,
  getAllReferrers,
  getReferrersForPage,
  getPagesFromReferrer,
} from '@/db/analytics';

// =============================================================================
// Auth Helper
// =============================================================================

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: 'Unauthorized', status: 401 };
  }
  // For now, any authenticated user can view analytics
  // TODO: Add role-based access control
  return { user: session.user };
}

// =============================================================================
// Route Handler
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAdmin();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'summary';
    const days = parseInt(searchParams.get('days') || '30', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    switch (action) {
      case 'summary': {
        const summary = await getAnalyticsSummary(startDate, endDate);
        return NextResponse.json(summary);
      }

      case 'referrers': {
        const referrers = await getReferrerStats(limit);
        return NextResponse.json({ referrers });
      }

      case 'page-trends': {
        const pagePath = searchParams.get('page');
        if (!pagePath) {
          return NextResponse.json({ error: 'Missing page parameter' }, { status: 400 });
        }
        const trends = await getPageTrends(pagePath, days);
        return NextResponse.json({ trends });
      }

      case 'referrer-details': {
        const domain = searchParams.get('domain');
        if (!domain) {
          return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });
        }
        const details = await getReferrerDetails(domain, limit);
        return NextResponse.json({ details });
      }

      case 'all-pages': {
        const result = await getAllPages(startDate, endDate, page, limit);
        return NextResponse.json(result);
      }

      case 'all-404s': {
        const result = await getAll404s(startDate, endDate, page, limit);
        return NextResponse.json(result);
      }

      case 'all-referrers': {
        const result = await getAllReferrers(startDate, endDate, page, limit);
        return NextResponse.json(result);
      }

      case 'page-referrers': {
        // Get referrers for a specific page (drill-down from pages)
        const pagePath = searchParams.get('pagePath');
        if (!pagePath) {
          return NextResponse.json({ error: 'Missing pagePath parameter' }, { status: 400 });
        }
        const result = await getReferrersForPage(pagePath, startDate, endDate, page, limit);
        return NextResponse.json(result);
      }

      case 'referrer-pages': {
        // Get pages visited from a specific referrer (drill-down from referrers)
        const domain = searchParams.get('domain');
        if (!domain) {
          return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });
        }
        const result = await getPagesFromReferrer(domain, startDate, endDate, page, limit);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics API error:', error);
    // Include more details in development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Analytics API error details:', { errorMessage, errorStack });
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { details: errorMessage }),
      },
      { status: 500 }
    );
  }
}
