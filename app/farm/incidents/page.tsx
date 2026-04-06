import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { updateIncidentWorkflow } from '@/lib/actions/farm';
import { IncidentReportComposer } from '@/components/farm/incident-report-composer';

export default async function FarmIncidentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; template?: string }> }) {
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

  const [{ data: members }, { data: areas }, { data: animals }, { data: assets }, incidentsRes] = await Promise.all([
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true }),
    supabase.from('farm_areas').select('id,name').eq('workshop_account_id', profile.workshop_account_id).eq('active', true).order('name', { ascending: true }),
    supabase.from('livestock_logs').select('id,animal_id').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }).limit(100),
    supabase.from('farm_assets').select('id,name').eq('workshop_account_id', profile.workshop_account_id).order('name', { ascending: true }),
    supabase
      .from('farm_incidents')
      .select('id,incident_number,title,incident_class,incident_type,severity,status,occurred_at,created_at,corrective_action,owner_profile_id,location_area_id,escalation_required,root_cause_category,closure_summary,farm_incident_impacts(impacted_entity_type,profile_id,livestock_log_id,asset_id)', { count: 'exact' })
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
        <IncidentReportComposer
          initialTemplate={params.template}
          members={(members ?? []).map((member) => ({ id: member.id, label: member.full_name || 'Unnamed member' }))}
          areas={(areas ?? []).map((area) => ({ id: area.id, label: area.name }))}
          animals={(animals ?? []).map((animal) => ({ id: animal.id, label: animal.animal_id }))}
          assets={(assets ?? []).map((asset) => ({ id: asset.id, label: asset.name }))}
        />
      </Card>

      <div className="flex gap-2 text-sm">
        {['all', 'reported', 'under_response', 'contained', 'under_investigation', 'closed'].map((status) => (
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
            <p className="mt-1 text-sm text-gray-600">{incident.incident_number} • {incident.incident_class} • {incident.incident_type} • {incident.severity} • {new Date(incident.occurred_at).toLocaleString()}</p>
            <form action={updateIncidentWorkflow} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="incidentId" value={incident.id} />
              <select defaultValue={incident.status} name="status" className="rounded-lg border px-2 py-1.5 text-sm"><option value="reported">Reported</option><option value="under_response">Under response</option><option value="contained">Contained</option><option value="under_investigation">Under investigation</option><option value="closed">Closed</option></select>
              <select defaultValue={incident.owner_profile_id || ''} name="ownerProfileId" className="rounded-lg border px-2 py-1.5 text-sm"><option value="">Assign owner</option>{members?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}</select>
              <button className="rounded-lg border px-2 py-1.5 text-sm">Update</button>
              <select defaultValue={incident.location_area_id || ''} name="locationAreaId" className="rounded-lg border px-2 py-1.5 text-sm"><option value="">Location area</option>{areas?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
              <input defaultValue={incident.root_cause_category || ''} name="rootCauseCategory" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Root cause category" />
              <label className="inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"><input type="checkbox" name="escalationRequired" defaultChecked={incident.escalation_required || false} />Escalation required</label>
              <textarea defaultValue={incident.corrective_action || ''} name="correctiveAction" className="sm:col-span-3 rounded-lg border px-2 py-1.5 text-sm" placeholder="Corrective action" />
              <textarea defaultValue={incident.closure_summary || ''} name="closureSummary" className="sm:col-span-3 rounded-lg border px-2 py-1.5 text-sm" placeholder="Closure summary (required when closing)" />
              <select
                multiple
                name="impactedProfileIds"
                defaultValue={incident.farm_incident_impacts?.filter((impact) => impact.impacted_entity_type === 'person').map((impact) => impact.profile_id).filter(Boolean) ?? []}
                className="sm:col-span-3 rounded-lg border px-2 py-1.5 text-sm"
              >
                {members?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed member'}</option>)}
              </select>
              <select
                multiple
                name="impactedAnimalIds"
                defaultValue={incident.farm_incident_impacts?.filter((impact) => impact.impacted_entity_type === 'animal').map((impact) => impact.livestock_log_id).filter(Boolean) ?? []}
                className="sm:col-span-3 rounded-lg border px-2 py-1.5 text-sm"
              >
                {animals?.map((animal) => <option key={animal.id} value={animal.id}>{animal.animal_id}</option>)}
              </select>
              <select
                multiple
                name="impactedAssetIds"
                defaultValue={incident.farm_incident_impacts?.filter((impact) => impact.impacted_entity_type === 'asset').map((impact) => impact.asset_id).filter(Boolean) ?? []}
                className="sm:col-span-3 rounded-lg border px-2 py-1.5 text-sm"
              >
                {assets?.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
              </select>
            </form>
          </Card>
        ))}
        {!incidents.length ? <p className="text-sm text-gray-500">No incidents for selected filter.</p> : null}
      </div>
      <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
    </section>
  );
}
