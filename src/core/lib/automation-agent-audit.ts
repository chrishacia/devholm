import { getDb } from '@/db';

export interface AutomationAgentAuditEvent {
  route: string;
  method: string;
  action: string;
  statusCode: number;
  success: boolean;
  clientIp: string | null;
  details?: Record<string, unknown> | null;
}

export async function recordAutomationAgentEvent(event: AutomationAgentAuditEvent): Promise<void> {
  try {
    await getDb()('automation_agent_audit_events').insert({
      route: event.route,
      method: event.method,
      action: event.action,
      status_code: event.statusCode,
      success: event.success,
      client_ip: event.clientIp,
      details: event.details ? JSON.stringify(event.details) : null,
      created_at: new Date(),
    });
  } catch {
    // Best effort only; do not block request handling when audit table is unavailable.
  }
}
