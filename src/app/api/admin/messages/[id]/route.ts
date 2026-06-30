import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMessageById, updateMessageStatus, deleteMessages } from '@/db/messages';
import { verifyAdmin } from '@/lib/auth-helpers';

// Validation schemas
const idSchema = z.string().uuid();
const statusSchema = z.object({
  status: z.enum(['unread', 'read', 'archived', 'spam', 'deleted']),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/messages/[id] - Get a single message
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate ID
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
  }

  try {
    const message = await getMessageById(id);

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Mark as read when viewing
    if (message.status === 'unread') {
      await updateMessageStatus(id, 'read');
      message.status = 'read';
      message.readAt = new Date();
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    return NextResponse.json({ error: 'Failed to fetch message' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/messages/[id] - Update message status
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate ID
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const bodyResult = statusSchema.safeParse(body);

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: 'Invalid status', details: bodyResult.error.flatten() },
        { status: 400 }
      );
    }

    const { status } = bodyResult.data;

    const message = await updateMessageStatus(id, status);

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/messages/[id] - Delete a message
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate ID
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
  }

  try {
    const count = await deleteMessages([id]);

    if (count === 0) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}
