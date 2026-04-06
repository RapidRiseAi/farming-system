import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createLivestockEvent, createLivestockHerd } from '@/lib/actions/farm';

export default async function FarmLivestockPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: herds }, { data: events }, { data: areas }, { data: team }] = await Promise.all([
    supabase.from('livestock_herds').select('id,name,species,active_count,herd_code').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('livestock_events').select('id,event_reference,event_type,event_date,scope,quantity,follow_up_due_date').eq('workshop_account_id', profile.workshop_account_id).order('event_date', { ascending: false }).limit(50),
    supabase.from('farm_areas').select('id,name,area_type').eq('workshop_account_id', profile.workshop_account_id).order('name', { ascending: true }),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
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
        <h2 className="font-semibold">Record livestock event</h2>
        <form action={createLivestockEvent} className="mt-2 grid gap-2 sm:grid-cols-4">
          <select name="herdId" className="rounded border px-2 py-1.5">{herds?.map((herd) => <option key={herd.id} value={herd.id}>{herd.name}</option>)}</select>
          <select name="eventType" className="rounded border px-2 py-1.5">
            <option value="treatment">Treatment</option><option value="vaccination">Vaccination</option><option value="move">Move</option><option value="inspection">Inspection</option><option value="birth">Birth</option><option value="death">Death</option><option value="cull">Cull</option><option value="breeding">Breeding</option><option value="feed_change">Feed change</option><option value="incident">Incident</option>
          </select>
          <select name="scope" className="rounded border px-2 py-1.5"><option value="individual">Individual</option><option value="group">Group</option><option value="herd">Herd</option><option value="camp">Camp</option></select>
          <input name="eventDate" type="date" className="rounded border px-2 py-1.5" required />
          <input name="quantity" type="number" className="rounded border px-2 py-1.5" placeholder="Quantity" />
          <input name="eventReference" className="rounded border px-2 py-1.5" placeholder="Event reference (optional)" />
          <select name="fromAreaId" className="rounded border px-2 py-1.5"><option value="">From area (move)</option>{areas?.map((area) => <option key={area.id} value={area.id}>{area.name} ({area.area_type})</option>)}</select>
          <select name="toAreaId" className="rounded border px-2 py-1.5"><option value="">To area (move)</option>{areas?.map((area) => <option key={area.id} value={area.id}>{area.name} ({area.area_type})</option>)}</select>
          <input name="medicineInput" className="rounded border px-2 py-1.5" placeholder="Medicine / input" />
          <input name="dose" type="number" step="0.01" className="rounded border px-2 py-1.5" placeholder="Dose" />
          <input name="doseUnit" className="rounded border px-2 py-1.5" placeholder="Dose unit (ml, kg, etc)" />
          <input name="followUpDueDate" type="date" className="rounded border px-2 py-1.5" placeholder="Follow-up due date" />
          <select name="performedBy" className="rounded border px-2 py-1.5"><option value="">Performed by (default: me)</option>{team?.map((person) => <option key={person.id} value={person.id}>{person.full_name ?? person.id}</option>)}</select>
          <select name="authorisedBy" className="rounded border px-2 py-1.5"><option value="">Authorised by</option>{team?.map((person) => <option key={person.id} value={person.id}>{person.full_name ?? person.id}</option>)}</select>
          <input name="attachments" className="sm:col-span-4 rounded border px-2 py-1.5" placeholder='Attachments JSON e.g. {"name":"invoice.pdf","path":"..."}' />
          <textarea name="notes" className="sm:col-span-4 rounded border px-2 py-1.5" placeholder="Notes" />
          <button className="sm:col-span-4 rounded border px-2 py-1.5">Save event</button>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Herds</h3>
          {(herds ?? []).map((herd) => <p key={herd.id} className="text-sm">{herd.name} • {herd.species} • {herd.active_count}</p>)}
        </Card>
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Recent events</h3>
          {(events ?? []).map((event) => <p key={event.id} className="text-sm">{event.event_date} • {event.event_type} • {event.scope} • qty {event.quantity ?? '—'}{event.follow_up_due_date ? ` • follow-up ${event.follow_up_due_date}` : ''}</p>)}
        </Card>
      </div>
    </section>
  );
}
