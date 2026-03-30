import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function FarmWorkforcePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: workers }, { data: entries }] = await Promise.all([
    supabase
      .from('workforce_profiles')
      .select('id,full_name,worker_type,active,mobile_number,start_date,end_date')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('full_name', { ascending: true })
      .limit(200),
    supabase
      .from('workforce_time_entries')
      .select('id,workforce_profile_id,clock_in_at,clock_out_at,entry_type,break_minutes')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('clock_in_at', { ascending: false })
      .limit(200)
  ]);

  const byWorker = new Map<string, { hours: number; overtime: number }>();
  for (const entry of entries ?? []) {
    const current = byWorker.get(entry.workforce_profile_id) ?? { hours: 0, overtime: 0 };
    const clockIn = new Date(entry.clock_in_at).getTime();
    const clockOut = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : Date.now();
    const hours = Math.max((clockOut - clockIn) / 3_600_000 - (entry.break_minutes ?? 0) / 60, 0);
    current.hours += hours;
    if (entry.entry_type === 'overtime') current.overtime += hours;
    byWorker.set(entry.workforce_profile_id, current);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-emerald-950">Workforce activity</h1>
      <p className="text-sm text-gray-600">Employee and contractor visibility: who worked, when, and overtime footprint.</p>

      <div className="space-y-3">
        {(workers ?? []).map((worker) => {
          const stats = byWorker.get(worker.id) ?? { hours: 0, overtime: 0 };
          return (
            <Card key={worker.id} className="rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-black">{worker.full_name}</p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{worker.worker_type} • {worker.active ? 'active' : 'inactive'}</p>
                </div>
                <div className="text-right text-sm">
                  <p>Total tracked hours: <span className="font-semibold">{stats.hours.toFixed(1)}</span></p>
                  <p className="text-xs text-gray-500">Overtime: {stats.overtime.toFixed(1)}h</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {!workers?.length ? <p className="text-sm text-gray-500">No workforce profiles found yet.</p> : null}
    </section>
  );
}
