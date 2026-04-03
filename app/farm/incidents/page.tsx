import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { reportFarmIncident, updateIncidentWorkflow } from '@/lib/actions/farm';

export default async function FarmIncidentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const selectedStatus = params.status ?? 'all';
  const page = Math.max(Number(params.page ?? '1') || 1, 1);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: members }, incidentsRes] = await Promise.all([
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true }),
    supabase
      .from('farm_incidents')
      .select('id,title,incident_type,severity,status,occurred_at,created_at,corrective_action,owner_profile_id', { count: 'exact' })
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('occurred_at', { ascending: false })
      .range((page - 1) * 10, page * 10 - 1)
  ]);

  const incidents = (incidentsRes.data ?? []).filter((incident) => selectedStatus === 'all' || incident.status === selectedStatus);
  const totalPages = Math.max(Math.ceil((incidentsRes.count ?? 0) / 10), 1);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-amber-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-amber-950">Incident workflow</h1>
        <form action={reportFarmIncident} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="title" placeholder="Incident title" className="rounded-lg border px-3 py-2" required />
          <input name="occurredAt" type="datetime-local" className="rounded-lg border px-3 py-2" required />
          <select name="incidentType" className="rounded-lg border px-3 py-2"><option value="safety">Safety</option><option value="biosecurity">Biosecurity</option><option value="equipment">Equipment</option><option value="environment">Environment</option><option value="security">Security</option><option value="other">Other</option></select>
          <select name="severity" className="rounded-lg border px-3 py-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
          <select name="ownerProfileId" className="rounded-lg border px-3 py-2"><option value="">Assign owner</option>{members?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}</select>
          <textarea name="description" className="sm:col-span-2 min-h-24 rounded-lg border px-3 py-2" placeholder="Describe incident context and immediate actions" required />
          <button className="sm:col-span-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Submit incident</button>
        </form>
      </Card>

      <div className="flex gap-2 text-sm">
        {['all', 'open', 'investigating', 'resolved', 'closed'].map((status) => (
          <a key={status} href={`/farm/incidents?status=${status}`} className={`rounded-full border px-3 py-1 ${selectedStatus === status ? 'border-amber-700 bg-amber-100' : 'border-gray-300'}`}>{status}</a>
        ))}
      </div>

      <div className="space-y-3">
        {incidents.map((incident) => (
          <Card key={incident.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-black">{incident.title}</h2>
              <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide">{incident.status}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{incident.incident_type} • {incident.severity} • {new Date(incident.occurred_at).toLocaleString()}</p>
            <form action={updateIncidentWorkflow} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="incidentId" value={incident.id} />
              <select defaultValue={incident.status} name="status" className="rounded-lg border px-2 py-1.5 text-sm"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
              <select defaultValue={incident.owner_profile_id || ''} name="ownerProfileId" className="rounded-lg border px-2 py-1.5 text-sm"><option value="">Assign owner</option>{members?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}</select>
              <button className="rounded-lg border px-2 py-1.5 text-sm">Update</button>
              <textarea defaultValue={incident.corrective_action || ''} name="correctiveAction" className="sm:col-span-3 rounded-lg border px-2 py-1.5 text-sm" placeholder="Corrective action" />
            </form>
          </Card>
        ))}
        {!incidents.length ? <p className="text-sm text-gray-500">No incidents for selected filter.</p> : null}
      </div>
      <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
    </section>
  );
}
