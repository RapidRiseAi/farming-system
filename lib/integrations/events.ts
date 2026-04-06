import { FarmIntegrationContext } from '@/lib/integrations/auth';

export type IntegrationEvent = {
  id: string;
  source: 'notification' | 'task' | 'incident' | 'stock_request' | 'document';
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export async function fetchIntegrationEvents(
  ctx: FarmIntegrationContext,
  options?: {
    since?: string;
    limit?: number;
  }
): Promise<IntegrationEvent[]> {
  const since = options?.since;
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);

  const notificationsQuery = ctx.supabase
    .from('notifications')
    .select('id,kind,title,body,href,created_at,is_read')
    .eq('workshop_account_id', ctx.farmId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const tasksQuery = ctx.supabase
    .from('farm_tasks')
    .select('id,title,status,priority,updated_at')
    .eq('workshop_account_id', ctx.farmId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  const incidentsQuery = ctx.supabase
    .from('farm_incidents')
    .select('id,incident_number,title,status,severity,updated_at')
    .eq('workshop_account_id', ctx.farmId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  const [notificationsRes, tasksRes, incidentsRes] = await Promise.all([notificationsQuery, tasksQuery, incidentsQuery]);

  const notificationEvents: IntegrationEvent[] = (notificationsRes.data ?? []).map((row) => ({
    id: String(row.id),
    source: 'notification',
    eventType: `notification.${row.kind}`,
    occurredAt: String(row.created_at),
    payload: {
      title: row.title,
      body: row.body,
      href: row.href,
      isRead: row.is_read
    }
  }));

  const taskEvents: IntegrationEvent[] = (tasksRes.data ?? []).map((row) => ({
    id: String(row.id),
    source: 'task',
    eventType: `task.${row.status}`,
    occurredAt: String(row.updated_at),
    payload: {
      title: row.title,
      priority: row.priority,
      status: row.status
    }
  }));

  const incidentEvents: IntegrationEvent[] = (incidentsRes.data ?? []).map((row) => ({
    id: String(row.id),
    source: 'incident',
    eventType: `incident.${row.status}`,
    occurredAt: String(row.updated_at),
    payload: {
      incidentNumber: row.incident_number,
      title: row.title,
      severity: row.severity,
      status: row.status
    }
  }));

  const merged = [...notificationEvents, ...taskEvents, ...incidentEvents]
    .filter((event) => (since ? new Date(event.occurredAt).getTime() >= new Date(since).getTime() : true))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);

  return merged;
}
