import { NextRequest, NextResponse } from 'next/server';
import {
  getMessages,
  getMessageStats,
  markMessagesAsRead,
  deleteMessages,
  hardDeleteMessages,
  archiveMessages,
  markAsSpam,
  updateMessageStatus,
} from '@/db/messages';
import { verifyAdmin } from '@/lib/auth-helpers';

/**
 * GET /api/admin/messages - List all messages (admin)
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const status = searchParams.get('status') || undefined;

  try {
    const result = await getMessages(page, pageSize, status);
    const stats = await getMessageStats();

    return NextResponse.json({
      ...result,
      stats,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/messages - Bulk update messages
 */
export async function PATCH(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids, action } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Message IDs are required' }, { status: 400 });
    }

    let count = 0;

    switch (action) {
      case 'read':
        count = await markMessagesAsRead(ids);
        break;
      case 'unread':
        for (const id of ids) {
          await updateMessageStatus(id, 'unread');
          count++;
        }
        break;
      case 'archive':
        count = await archiveMessages(ids);
        break;
      case 'spam':
        count = await markAsSpam(ids);
        break;
      case 'delete':
        count = await deleteMessages(ids);
        break;
      case 'restore':
        for (const id of ids) {
          await updateMessageStatus(id, 'read');
          count++;
        }
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Error updating messages:', error);
    return NextResponse.json({ error: 'Failed to update messages' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/messages - Permanently delete messages
 */
export async function DELETE(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Message IDs are required' }, { status: 400 });
    }

    const count = await hardDeleteMessages(ids);

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Error permanently deleting messages:', error);
    return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
  }
}
