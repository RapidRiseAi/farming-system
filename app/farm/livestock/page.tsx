import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createLivestockHerd, createLivestockLog } from '@/lib/actions/farm';

export default async function FarmLivestockPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: herds }, { data: logs }] = await Promise.all([
    supabase.from('livestock_herds').select('id,name,species,active_count,herd_code').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('livestock_logs').select('id,herd_id,log_type,log_date,quantity,notes').eq('workshop_account_id', profile.workshop_account_id).order('log_date', { ascending: false }).limit(50)
  ]);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-emerald-950">Livestock (herds + logs)</h1>
      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Create herd</h2>
        <form action={createLivestockHerd} className="mt-2 grid gap-2 sm:grid-cols-4">
          <input name="name" required className="rounded border px-2 py-1.5" placeholder="Herd name" />
          <input name="species" required className="rounded border px-2 py-1.5" placeholder="Species" />
          <input name="herdCode" className="rounded border px-2 py-1.5" placeholder="Herd code" />
          <input name="activeCount" type="number" className="rounded border px-2 py-1.5" placeholder="Active count" />
          <button className="sm:col-span-4 rounded border px-2 py-1.5">Save herd</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Log livestock activity</h2>
        <form action={createLivestockLog} className="mt-2 grid gap-2 sm:grid-cols-4">
          <select name="herdId" className="rounded border px-2 py-1.5">{herds?.map((herd) => <option key={herd.id} value={herd.id}>{herd.name}</option>)}</select>
          <select name="logType" className="rounded border px-2 py-1.5"><option value="health">Health</option><option value="treatment">Treatment</option><option value="movement">Movement</option><option value="breeding">Breeding</option><option value="mortality">Mortality</option><option value="weight">Weight</option><option value="other">Other</option></select>
          <input name="logDate" type="date" className="rounded border px-2 py-1.5" required />
          <input name="quantity" type="number" className="rounded border px-2 py-1.5" placeholder="Quantity" />
          <textarea name="notes" className="sm:col-span-4 rounded border px-2 py-1.5" placeholder="Notes" />
          <button className="sm:col-span-4 rounded border px-2 py-1.5">Save log</button>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Herds</h3>
          {(herds ?? []).map((herd) => <p key={herd.id} className="text-sm">{herd.name} • {herd.species} • {herd.active_count}</p>)}
        </Card>
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Recent logs</h3>
          {(logs ?? []).map((log) => <p key={log.id} className="text-sm">{log.log_date} • {log.log_type} • qty {log.quantity ?? '—'}</p>)}
        </Card>
      </div>
    </section>
  );
}
