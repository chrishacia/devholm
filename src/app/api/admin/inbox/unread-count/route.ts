/**
 * Unread Message Count API
 * ========================
 *
 * Returns the count of unread messages for the authenticated admin user.
 * Used to show notification badges in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUnreadCount } from '@/db/messages';
import { verifyAdmin } from '@/lib/auth-helpers';

/**
 * GET /api/admin/inbox/unread-count - Get unread message count
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const count = await getUnreadCount();

    return NextResponse.json({
      count,
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 });
  }
}
