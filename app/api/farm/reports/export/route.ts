import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function toCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  const escape = (value: string | number | null) => {
    if (value === null || value === undefined) return '';
    const serialized = String(value);
    if (serialized.includes(',') || serialized.includes('"') || serialized.includes('\n')) {
      return `"${serialized.replace(/"/g, '""')}"`;
    }
    return serialized;
  };

  return [headers.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind') ?? 'incident-recurrence';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) return NextResponse.json({ error: 'No farm account' }, { status: 403 });

  const farmId = profile.workshop_account_id;

  if (kind === 'incident-recurrence') {
    const { data } = await supabase
      .from('farm_incidents')
      .select('incident_class,incident_type,severity,status,occurred_at')
      .eq('workshop_account_id', farmId)
      .order('occurred_at', { ascending: false })
      .limit(1000);

    const counters = new Map<string, { count: number; open: number; last: string }>();
    for (const row of data ?? []) {
      const key = `${row.incident_class}|${row.incident_type}`;
      const existing = counters.get(key) ?? { count: 0, open: 0, last: row.occurred_at };
      existing.count += 1;
      if (row.status !== 'closed') existing.open += 1;
      if (new Date(row.occurred_at).getTime() > new Date(existing.last).getTime()) existing.last = row.occurred_at;
      counters.set(key, existing);
    }

    const rows = Array.from(counters.entries()).map(([key, value]) => {
      const [incidentClass, incidentType] = key.split('|');
      return [incidentClass, incidentType, value.count, value.open, value.last];
    });

    const csv = toCsv(['incident_class', 'incident_type', 'recurrence_count', 'open_count', 'last_occurred_at'], rows);
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="farm-incident-recurrence-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  }

  if (kind === 'downtime') {
    const { data } = await supabase
      .from('farm_asset_faults')
      .select('id,asset_id,title,severity,status,downtime_started_at,downtime_ended_at,farm_assets(name,asset_code)')
      .eq('workshop_account_id', farmId)
      .order('created_at', { ascending: false })
      .limit(1000);

    const rows = (data ?? []).map((fault) => {
      const started = fault.downtime_started_at ? new Date(fault.downtime_started_at).getTime() : null;
      const ended = fault.downtime_ended_at ? new Date(fault.downtime_ended_at).getTime() : Date.now();
      const minutes = started ? Math.max(Math.round((ended - started) / 60000), 0) : null;
      return [
        fault.id,
        (fault.farm_assets as { name?: string; asset_code?: string } | null)?.asset_code ?? '',
        (fault.farm_assets as { name?: string; asset_code?: string } | null)?.name ?? '',
        fault.title,
        fault.severity,
        fault.status,
        fault.downtime_started_at,
        fault.downtime_ended_at,
        minutes
      ];
    });

    const csv = toCsv(['fault_id', 'asset_code', 'asset_name', 'fault_title', 'severity', 'status', 'downtime_started_at', 'downtime_ended_at', 'downtime_minutes'], rows);
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="farm-downtime-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  }

  const [tasksRes, incidentsRes, docsRes, remindersRes] = await Promise.all([
    supabase.from('farm_tasks').select('id,title,priority,due_at,status').eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']).lt('due_at', new Date().toISOString()).limit(2000),
    supabase.from('farm_incidents').select('id,incident_number,title,severity,status,occurred_at').eq('workshop_account_id', farmId).in('status', ['reported', 'under_response', 'contained', 'under_investigation']).lt('occurred_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).limit(2000),
    supabase.from('farm_documents').select('id,document_number,title,expiry_date,status').eq('workshop_account_id', farmId).eq('status', 'active').lt('expiry_date', new Date().toISOString().slice(0, 10)).limit(2000),
    supabase.from('farm_reminders').select('source_type,title,due_at,severity,status').eq('workshop_account_id', farmId).eq('status', 'open').order('due_at', { ascending: true }).limit(2000)
  ]);

  const rows: Array<Array<string | number | null>> = [];
  for (const task of tasksRes.data ?? []) rows.push(['task', task.id, task.title, task.priority, task.status, task.due_at]);
  for (const incident of incidentsRes.data ?? []) rows.push(['incident', incident.id, `${incident.incident_number} ${incident.title}`, incident.severity, incident.status, incident.occurred_at]);
  for (const doc of docsRes.data ?? []) rows.push(['document', doc.id, `${doc.document_number} ${doc.title}`, 'high', doc.status, doc.expiry_date]);
  for (const reminder of remindersRes.data ?? []) rows.push(['reminder', reminder.source_type, reminder.title, reminder.severity, reminder.status, reminder.due_at]);

  const csv = toCsv(['queue_type', 'reference', 'title', 'severity_or_priority', 'status', 'due_or_occurred_at'], rows);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="farm-overdue-queues-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
