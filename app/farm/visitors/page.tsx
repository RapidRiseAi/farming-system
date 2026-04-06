import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { createFarmVisit, gateCheckVisit, updateFarmVisitDetails } from '@/lib/actions/farm';

export default async function FarmVisitorsPage({
  searchParams
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter ?? 'open';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: team }, { data: areas }, { data: visits }] = await Promise.all([
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true }),
    supabase.from('farm_areas').select('id,name').eq('workshop_account_id', profile.workshop_account_id).eq('active', true).order('name', { ascending: true }),
    supabase
      .from('farm_visits')
      .select('id,visitor_type,visitor_name,visitor_org,id_registration,purpose,approved_by_profile_id,escort_required,biosecurity_complete,checked_in_at,checked_out_at,notes,exception_notes,created_at,farm_visit_permitted_areas(area_id,farm_areas(id,name))')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(200)
  ]);

  const filteredVisits = (visits ?? []).filter((visit) => {
    if (filter === 'open') return Boolean(visit.checked_in_at) && !visit.checked_out_at;
    if (filter === 'exceptions') return !visit.biosecurity_complete || Boolean(visit.exception_notes);
    return true;
  });

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Visitor gate register</h1>
        <p className="mt-1 text-sm text-gray-600">Create visits, assign permitted areas, and run quick gate check-in/check-out actions.</p>
        <form action={createFarmVisit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select name="visitorType" className="rounded-lg border px-3 py-2">
            <option value="person">Person</option>
            <option value="organization">Organization</option>
            <option value="contractor">Contractor</option>
            <option value="delivery">Delivery</option>
            <option value="regulator">Regulator</option>
            <option value="other">Other</option>
          </select>
          <input name="visitorName" placeholder="Visitor name or entity" className="rounded-lg border px-3 py-2" required />
          <input name="visitorOrg" placeholder="Visitor organization" className="rounded-lg border px-3 py-2" />
          <input name="idRegistration" placeholder="ID/registration" className="rounded-lg border px-3 py-2" />
          <input name="purpose" placeholder="Visit purpose" className="rounded-lg border px-3 py-2" required />
          <select name="approvedByProfileId" className="rounded-lg border px-3 py-2">
            <option value="">Approved by</option>
            {team?.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || 'Unnamed member'}
              </option>
            ))}
          </select>
          <select multiple name="permittedAreaIds" className="sm:col-span-2 rounded-lg border px-3 py-2">
            {areas?.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-700">
              <input type="checkbox" name="escortRequired" />
              Escort required
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-700">
              <input type="checkbox" name="biosecurityComplete" />
              Biosecurity complete
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-700">
              <input type="checkbox" name="checkInNow" />
              Check in now
            </label>
            <input type="datetime-local" name="checkedInAt" className="rounded-lg border px-3 py-2" />
          </div>
          <textarea name="notes" placeholder="Notes" className="rounded-lg border px-3 py-2" />
          <textarea name="exceptionNotes" placeholder="Exceptions" className="rounded-lg border px-3 py-2" />
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Create visit</button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {['open', 'exceptions', 'all'].map((item) => (
          <a
            key={item}
            href={`/farm/visitors?filter=${item}`}
            className={`rounded-full border px-3 py-1 ${filter === item ? 'border-emerald-700 bg-emerald-100 text-emerald-900' : 'border-gray-300 text-gray-700'}`}
          >
            {item}
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {filteredVisits.map((visit) => {
          const permittedAreas = (visit.farm_visit_permitted_areas ?? [])
            .map((row) => {
              const areaRelation = row.farm_areas as { name?: string } | Array<{ name?: string }> | null;
              if (!areaRelation) return null;
              return Array.isArray(areaRelation) ? (areaRelation[0]?.name ?? null) : (areaRelation.name ?? null);
            })
            .filter(Boolean)
            .join(', ');
          return (
            <Card key={visit.id} className="rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-black">{visit.visitor_name}</h2>
                  <p className="text-xs text-gray-500">
                    {visit.visitor_type} • {visit.visitor_org || 'No organization'} • {visit.id_registration || 'No ID/registration'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide">{visit.checked_in_at && !visit.checked_out_at ? 'open' : 'closed'}</span>
                  {!visit.checked_in_at || visit.checked_out_at ? (
                    <form action={gateCheckVisit}>
                      <input type="hidden" name="visitId" value={visit.id} />
                      <input type="hidden" name="mode" value="in" />
                      <button className="rounded-lg border px-2 py-1 text-xs">Gate check-in</button>
                    </form>
                  ) : (
                    <form action={gateCheckVisit}>
                      <input type="hidden" name="visitId" value={visit.id} />
                      <input type="hidden" name="mode" value="out" />
                      <button className="rounded-lg bg-amber-600 px-2 py-1 text-xs font-semibold text-white">Gate check-out</button>
                    </form>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm text-gray-700">
                Purpose: <span className="font-medium">{visit.purpose}</span> • Permitted areas: {permittedAreas || 'None set'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Checked in: {visit.checked_in_at ? new Date(visit.checked_in_at).toLocaleString() : 'Not checked in'} • Checked out:{' '}
                {visit.checked_out_at ? new Date(visit.checked_out_at).toLocaleString() : 'Open'}
              </p>

              <form action={updateFarmVisitDetails} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="visitId" value={visit.id} />
                <select name="approvedByProfileId" defaultValue={visit.approved_by_profile_id || ''} className="rounded-lg border px-2 py-1.5 text-sm">
                  <option value="">Approved by</option>
                  {team?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || 'Unnamed member'}
                    </option>
                  ))}
                </select>
                <select
                  multiple
                  name="permittedAreaIds"
                  defaultValue={visit.farm_visit_permitted_areas?.map((row) => row.area_id) ?? []}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                >
                  {areas?.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm text-gray-700">
                  <input type="checkbox" name="escortRequired" defaultChecked={visit.escort_required} />
                  Escort required
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm text-gray-700">
                  <input type="checkbox" name="biosecurityComplete" defaultChecked={visit.biosecurity_complete} />
                  Biosecurity complete
                </label>
                <textarea name="notes" defaultValue={visit.notes || ''} placeholder="Notes" className="rounded-lg border px-2 py-1.5 text-sm" />
                <textarea name="exceptionNotes" defaultValue={visit.exception_notes || ''} placeholder="Exceptions" className="rounded-lg border px-2 py-1.5 text-sm" />
                <button className="sm:col-span-2 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm">Save details</button>
              </form>
            </Card>
          );
        })}
      </div>
      {!filteredVisits.length ? <p className="text-sm text-gray-500">No visits for selected filter.</p> : null}
    </section>
  );
}
