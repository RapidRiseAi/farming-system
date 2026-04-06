import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function FarmReportsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const farmId = profile.workshop_account_id;

  const [incidentsRes, faultsRes, remindersRes, overdueTasksRes, overdueIncidentsRes] = await Promise.all([
    supabase.from('farm_incidents').select('incident_class,incident_type,status,occurred_at').eq('workshop_account_id', farmId).order('occurred_at', { ascending: false }).limit(400),
    supabase.from('farm_asset_faults').select('id,title,status,downtime_started_at,downtime_ended_at,farm_assets(name)').eq('workshop_account_id', farmId).order('created_at', { ascending: false }).limit(400),
    supabase.from('farm_reminders').select('id,source_type,title,due_at,severity,status').eq('workshop_account_id', farmId).order('due_at', { ascending: true }).limit(400),
    supabase.from('farm_tasks').select('id,title,priority,due_at,status').eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']).lt('due_at', new Date().toISOString()).limit(200),
    supabase.from('farm_incidents').select('id,incident_number,title,severity,status,occurred_at').eq('workshop_account_id', farmId).in('status', ['reported', 'under_response', 'contained', 'under_investigation']).lt('occurred_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).limit(200)
  ]);

  const incidentBuckets = new Map<string, { count: number; open: number; last: string }>();
  for (const incident of incidentsRes.data ?? []) {
    const key = `${incident.incident_class} / ${incident.incident_type}`;
    const bucket = incidentBuckets.get(key) ?? { count: 0, open: 0, last: incident.occurred_at };
    bucket.count += 1;
    if (incident.status !== 'closed') bucket.open += 1;
    if (new Date(incident.occurred_at).getTime() > new Date(bucket.last).getTime()) bucket.last = incident.occurred_at;
    incidentBuckets.set(key, bucket);
  }

  const downtimeRows = (faultsRes.data ?? []).map((fault) => {
    const started = fault.downtime_started_at ? new Date(fault.downtime_started_at).getTime() : null;
    const ended = fault.downtime_ended_at ? new Date(fault.downtime_ended_at).getTime() : Date.now();
    const downtimeHours = started ? Math.round(((ended - started) / (1000 * 60 * 60)) * 10) / 10 : 0;
    return {
      id: fault.id,
      title: fault.title,
      assetName: (fault.farm_assets as { name?: string } | null)?.name ?? 'Unknown asset',
      status: fault.status,
      startedAt: fault.downtime_started_at,
      endedAt: fault.downtime_ended_at,
      downtimeHours
    };
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-emerald-950">Farm reports</h1>
          <p className="text-sm text-gray-600">Incident recurrence, downtime exposure, and overdue queues with CSV exports.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/api/farm/reports/export?kind=incident-recurrence" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-emerald-900">Export incident recurrence CSV</Link>
          <Link href="/api/farm/reports/export?kind=downtime" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-emerald-900">Export downtime CSV</Link>
          <Link href="/api/farm/reports/export?kind=overdue-queues" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-emerald-900">Export overdue queues CSV</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border bg-white p-4 lg:col-span-2">
          <h2 className="font-semibold text-emerald-950">Incident recurrence</h2>
          <div className="mt-3 space-y-2 text-sm">
            {Array.from(incidentBuckets.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 12).map(([key, bucket]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-emerald-100 px-3 py-2">
                <p className="font-medium text-emerald-900">{key}</p>
                <p className="text-xs text-gray-600">{bucket.count} total · {bucket.open} open · last {new Date(bucket.last).toLocaleDateString()}</p>
              </div>
            ))}
            {!incidentBuckets.size ? <p className="text-gray-500">No incidents logged yet.</p> : null}
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold text-emerald-950">Overdue queues snapshot</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p>Overdue tasks: <span className="font-semibold">{overdueTasksRes.data?.length ?? 0}</span></p>
            <p>Overdue incidents (SLA): <span className="font-semibold">{overdueIncidentsRes.data?.length ?? 0}</span></p>
            <p>Open reminders: <span className="font-semibold">{(remindersRes.data ?? []).filter((item) => item.status === 'open').length}</span></p>
          </div>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold text-emerald-950">Asset downtime</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {downtimeRows.slice(0, 16).map((row) => (
            <div key={row.id} className="rounded-lg border border-emerald-100 px-3 py-2 text-sm">
              <p className="font-medium text-emerald-900">{row.assetName}: {row.title}</p>
              <p className="text-xs text-gray-600">{row.status} · downtime {row.downtimeHours}h · {row.startedAt ? new Date(row.startedAt).toLocaleString() : 'No start logged'}</p>
            </div>
          ))}
          {!downtimeRows.length ? <p className="text-sm text-gray-500">No fault downtime records yet.</p> : null}
        </div>
      </Card>
    </section>
  );
}
