import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMessages,
  archiveMessages,
  deleteMessages,
  markAsSpam,
  markMessagesAsRead,
  updateMessageStatus,
} from '@/db/messages';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limiter';
import { verifyAutomationAgentToken } from '@/lib/automation-agent';
import { recordAutomationAgentEvent } from '@/lib/automation-agent-audit';

const actionSchema = z.object({
  action: z.enum(['read', 'unread', 'archive', 'spam', 'delete']),
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const statusFilterSchema = z
  .enum(['all', 'unread', 'read', 'archived', 'spam', 'deleted'])
  .optional();

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  const config = await verifyAutomationAgentToken(request);
  if (!config || !config.messagesReadEnabled) {
    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'GET',
      action: 'read-messages',
      statusCode: 401,
      success: false,
      clientIp,
      details: { reason: 'unauthorized_or_disabled' },
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'agent-messages-read',
    identifier: clientIp,
    maxRequests: 60,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'GET',
      action: 'read-messages',
      statusCode: 429,
      success: false,
      clientIp,
      details: { reason: 'rate_limit' },
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const statusInput = searchParams.get('status') || undefined;
    const parsedStatus = statusFilterSchema.safeParse(statusInput);
    if (!parsedStatus.success) {
      await recordAutomationAgentEvent({
        route: '/api/agent/messages',
        method: 'GET',
        action: 'read-messages',
        statusCode: 400,
        success: false,
        clientIp,
        details: { reason: 'invalid_status_filter', status: statusInput },
      });
      return NextResponse.json(
        { error: 'Invalid status filter' },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }
    const status = parsedStatus.data;

    const data = await getMessages(page, pageSize, status);

    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'GET',
      action: 'read-messages',
      statusCode: 200,
      success: true,
      clientIp,
      details: { page, pageSize, status: status ?? 'default' },
    });

    return NextResponse.json({ data }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Agent messages GET error:', error);
    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'GET',
      action: 'read-messages',
      statusCode: 500,
      success: false,
      clientIp,
      details: { reason: 'exception' },
    });
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const clientIp = getClientIp(request);
  const config = await verifyAutomationAgentToken(request);
  if (!config || !config.messagesWriteEnabled) {
    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'PATCH',
      action: 'moderate-messages',
      statusCode: 401,
      success: false,
      clientIp,
      details: { reason: 'unauthorized_or_disabled' },
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'agent-messages-write',
    identifier: clientIp,
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'PATCH',
      action: 'moderate-messages',
      statusCode: 429,
      success: false,
      clientIp,
      details: { reason: 'rate_limit' },
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);

    if (!parsed.success) {
      await recordAutomationAgentEvent({
        route: '/api/agent/messages',
        method: 'PATCH',
        action: 'moderate-messages',
        statusCode: 400,
        success: false,
        clientIp,
        details: { reason: 'invalid_payload' },
      });
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const { action, ids } = parsed.data;
    let count = 0;

    switch (action) {
      case 'read':
        count = await markMessagesAsRead(ids);
        break;
      case 'unread':
        for (const id of ids) {
          await updateMessageStatus(id, 'unread');
          count += 1;
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
    }

    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'PATCH',
      action: `moderate-messages:${action}`,
      statusCode: 200,
      success: true,
      clientIp,
      details: { count },
    });

    return NextResponse.json(
      { message: `Updated ${count} messages`, count },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Agent messages PATCH error:', error);
    await recordAutomationAgentEvent({
      route: '/api/agent/messages',
      method: 'PATCH',
      action: 'moderate-messages',
      statusCode: 500,
      success: false,
      clientIp,
      details: { reason: 'exception' },
    });
    return NextResponse.json(
      { error: 'Failed to update messages' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
