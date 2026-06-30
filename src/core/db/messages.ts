import { getDb } from './index';

export interface InboxMessage {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  body: string;
  status: 'unread' | 'read' | 'archived' | 'deleted' | 'spam';
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface PaginatedMessages {
  messages: InboxMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateMessageInput {
  source?: string;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  body: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Get all messages with pagination and filtering
 */
export async function getMessages(
  page = 1,
  pageSize = 20,
  status?: string
): Promise<PaginatedMessages> {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  // Build count query
  let countQuery = db('inbox_messages').count('* as count');
  if (status && status !== 'all') {
    countQuery = countQuery.where('status', status);
  } else {
    // Exclude deleted by default
    countQuery = countQuery.whereNot('status', 'deleted');
  }
  const [{ count }] = await countQuery;
  const total = Number(count);

  // Build messages query
  let messagesQuery = db('inbox_messages')
    .select(
      'id',
      'source',
      'name',
      'email',
      'subject',
      'body',
      'status',
      'ip_address as ipAddress',
      'user_agent as userAgent',
      'metadata',
      'created_at as createdAt',
      'read_at as readAt'
    )
    .orderBy('created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  if (status && status !== 'all') {
    messagesQuery = messagesQuery.where('status', status);
  } else {
    messagesQuery = messagesQuery.whereNot('status', 'deleted');
  }

  const messages = await messagesQuery;

  return {
    messages,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single message by ID
 */
export async function getMessageById(id: string): Promise<InboxMessage | null> {
  const db = getDb();
  const message = await db('inbox_messages')
    .select(
      'id',
      'source',
      'name',
      'email',
      'subject',
      'body',
      'status',
      'ip_address as ipAddress',
      'user_agent as userAgent',
      'metadata',
      'created_at as createdAt',
      'read_at as readAt'
    )
    .where('id', id)
    .first();

  return message || null;
}

/**
 * Create a new message
 */
export async function createMessage(input: CreateMessageInput): Promise<InboxMessage> {
  const db = getDb();

  const [message] = await db('inbox_messages')
    .insert({
      source: input.source || 'contact',
      name: input.name || null,
      email: input.email || null,
      subject: input.subject || null,
      body: input.body,
      ip_address: input.ipAddress || null,
      user_agent: input.userAgent || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      status: 'unread',
    })
    .returning([
      'id',
      'source',
      'name',
      'email',
      'subject',
      'body',
      'status',
      'ip_address as ipAddress',
      'user_agent as userAgent',
      'metadata',
      'created_at as createdAt',
      'read_at as readAt',
    ]);

  return message;
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  id: string,
  status: InboxMessage['status']
): Promise<InboxMessage | null> {
  const db = getDb();

  const updateData: Record<string, unknown> = { status };

  // Set read_at when marking as read
  if (status === 'read') {
    updateData.read_at = new Date();
  }

  await db('inbox_messages').where('id', id).update(updateData);

  return getMessageById(id);
}

/**
 * Mark multiple messages as read
 */
export async function markMessagesAsRead(ids: string[]): Promise<number> {
  const db = getDb();
  return db('inbox_messages').whereIn('id', ids).where('status', 'unread').update({
    status: 'read',
    read_at: new Date(),
  });
}

/**
 * Delete multiple messages (soft delete - marks as deleted)
 */
export async function deleteMessages(ids: string[]): Promise<number> {
  const db = getDb();
  return db('inbox_messages').whereIn('id', ids).update({ status: 'deleted' });
}

/**
 * Permanently delete multiple messages (hard delete)
 */
export async function hardDeleteMessages(ids: string[]): Promise<number> {
  const db = getDb();
  return db('inbox_messages').whereIn('id', ids).del();
}

/**
 * Archive multiple messages
 */
export async function archiveMessages(ids: string[]): Promise<number> {
  const db = getDb();
  return db('inbox_messages').whereIn('id', ids).update({ status: 'archived' });
}

/**
 * Mark multiple messages as spam
 */
export async function markAsSpam(ids: string[]): Promise<number> {
  const db = getDb();
  return db('inbox_messages').whereIn('id', ids).update({ status: 'spam' });
}

/**
 * Get unread message count
 */
export async function getUnreadCount(): Promise<number> {
  const db = getDb();
  const [{ count }] = await db('inbox_messages').where('status', 'unread').count('* as count');
  return Number(count);
}

/**
 * Get message stats
 */
export async function getMessageStats(): Promise<{
  total: number;
  unread: number;
  read: number;
  archived: number;
  spam: number;
}> {
  const db = getDb();

  const stats = await db('inbox_messages')
    .select('status')
    .count('* as count')
    .whereNot('status', 'deleted')
    .groupBy('status');

  const result = {
    total: 0,
    unread: 0,
    read: 0,
    archived: 0,
    spam: 0,
  };

  for (const stat of stats) {
    const count = Number(stat.count);
    result.total += count;
    if (stat.status in result) {
      result[stat.status as keyof typeof result] = count;
    }
  }

  return result;
}
