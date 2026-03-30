import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { reportFarmIncident } from '@/lib/actions/farm';

export default async function FarmIncidentsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const { data: incidents } = await supabase
    .from('farm_incidents')
    .select('id,title,incident_type,severity,status,occurred_at,created_at')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('created_at', { ascending: false })
    .limit(40);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-amber-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-amber-950">Incident reporting</h1>
        <p className="text-sm text-gray-600">Capture and track farm incidents with timestamped accountability.</p>
        <form action={reportFarmIncident} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="title" placeholder="Incident title" className="rounded-lg border px-3 py-2" required />
          <input name="occurredAt" type="datetime-local" className="rounded-lg border px-3 py-2" required />
          <select name="incidentType" className="rounded-lg border px-3 py-2">
            <option value="safety">Safety</option>
            <option value="biosecurity">Biosecurity</option>
            <option value="equipment">Equipment</option>
            <option value="environment">Environment</option>
            <option value="security">Security</option>
            <option value="other">Other</option>
          </select>
          <select name="severity" className="rounded-lg border px-3 py-2">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <textarea name="description" className="sm:col-span-2 min-h-24 rounded-lg border px-3 py-2" placeholder="Describe what happened, where, and immediate action taken..." required />
          <button className="sm:col-span-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Submit incident</button>
        </form>
      </Card>

      <div className="space-y-3">
        {(incidents ?? []).map((incident) => (
          <Card key={incident.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-black">{incident.title}</h2>
              <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide">{incident.status}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{incident.incident_type} • {incident.severity} • Occurred {new Date(incident.occurred_at).toLocaleString()}</p>
          </Card>
        ))}
        {!incidents?.length ? <p className="text-sm text-gray-500">No incidents logged yet.</p> : null}
      </div>
    </section>
  );
}
