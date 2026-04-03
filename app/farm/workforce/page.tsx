import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { clockWorker, correctTimeEntry, createWorker, updateWorker } from '@/lib/actions/farm';

export default async function FarmWorkforcePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id,role').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: workers }, { data: entries }] = await Promise.all([
    supabase
      .from('workforce_profiles')
      .select('id,full_name,worker_type,active,mobile_number,start_date,end_date,emergency_contact')
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
      <Card className="rounded-2xl border bg-white p-4">
        <form action={createWorker} className="grid gap-2 sm:grid-cols-4">
          <input name="fullName" required className="rounded-lg border px-3 py-2" placeholder="Worker name" />
          <select name="workerType" className="rounded-lg border px-3 py-2"><option value="employee">Employee</option><option value="contractor">Contractor</option></select>
          <input name="mobileNumber" className="rounded-lg border px-3 py-2" placeholder="Mobile" />
          <input name="startDate" type="date" className="rounded-lg border px-3 py-2" />
          <button className="sm:col-span-4 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Create worker</button>
        </form>
      </Card>

      <div className="space-y-3">
        {(workers ?? []).map((worker) => {
          const stats = byWorker.get(worker.id) ?? { hours: 0, overtime: 0 };
          const latestEntry = (entries ?? []).find((entry) => entry.workforce_profile_id === worker.id);
          return (
            <Card key={worker.id} className="rounded-2xl border border-black/10 bg-white p-4">
              <form action={updateWorker} className="grid gap-2 sm:grid-cols-4">
                <input type="hidden" name="workerId" value={worker.id} />
                <input defaultValue={worker.full_name} name="fullName" className="rounded-lg border px-2 py-1.5 text-sm" />
                <select defaultValue={worker.worker_type} name="workerType" className="rounded-lg border px-2 py-1.5 text-sm"><option value="employee">Employee</option><option value="contractor">Contractor</option></select>
                <input defaultValue={worker.mobile_number || ''} name="mobileNumber" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Mobile" />
                <select defaultValue={String(worker.active)} name="active" className="rounded-lg border px-2 py-1.5 text-sm"><option value="true">Active</option><option value="false">Inactive</option></select>
                <button className="sm:col-span-4 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm">Save worker</button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <form action={clockWorker}><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="mode" value="in" /><button className="rounded border px-2 py-1">Clock in</button></form>
                <form action={clockWorker}><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="mode" value="out" /><button className="rounded border px-2 py-1">Clock out</button></form>
              </div>
              <p className="mt-2 text-sm text-gray-700">Total tracked hours: <span className="font-semibold">{stats.hours.toFixed(1)}</span> • Overtime: {stats.overtime.toFixed(1)}h</p>
              <Link href={`/farm/workforce/${worker.id}`} className="text-xs text-emerald-700 underline">Worker detail</Link>
              {latestEntry ? (
                <form action={correctTimeEntry} className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input type="hidden" name="entryId" value={latestEntry.id} />
                  <input defaultValue={latestEntry.clock_in_at.slice(0, 16)} type="datetime-local" name="clockInAt" className="rounded-lg border px-2 py-1.5 text-sm" />
                  <input defaultValue={latestEntry.clock_out_at ? latestEntry.clock_out_at.slice(0, 16) : ''} type="datetime-local" name="clockOutAt" className="rounded-lg border px-2 py-1.5 text-sm" />
                  <input defaultValue={latestEntry.break_minutes ?? 0} type="number" name="breakMinutes" className="rounded-lg border px-2 py-1.5 text-sm" />
                  <button className="rounded-lg border px-2 py-1.5 text-sm">Correct latest entry</button>
                </form>
              ) : null}
            </Card>
          );
        })}
      </div>
      {!workers?.length ? <p className="text-sm text-gray-500">No workforce profiles found yet.</p> : null}
    </section>
  );
}
