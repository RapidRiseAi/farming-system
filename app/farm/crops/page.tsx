import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createCropField, createCropLog } from '@/lib/actions/farm';

export default async function FarmCropsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: fields }, { data: logs }] = await Promise.all([
    supabase.from('crop_fields').select('id,name,field_code,hectares,status').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('crop_logs').select('id,field_id,log_type,log_date,crop_name,notes').eq('workshop_account_id', profile.workshop_account_id).order('log_date', { ascending: false }).limit(50)
  ]);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-emerald-950">Crops (fields + logs)</h1>
      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Create field</h2>
        <form action={createCropField} className="mt-2 grid gap-2 sm:grid-cols-4">
          <input name="name" required className="rounded border px-2 py-1.5" placeholder="Field name" />
          <input name="fieldCode" className="rounded border px-2 py-1.5" placeholder="Field code" />
          <input name="hectares" type="number" step="0.01" className="rounded border px-2 py-1.5" placeholder="Hectares" />
          <select name="status" className="rounded border px-2 py-1.5"><option value="active">Active</option><option value="fallow">Fallow</option><option value="retired">Retired</option></select>
          <button className="sm:col-span-4 rounded border px-2 py-1.5">Save field</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Log crop activity</h2>
        <form action={createCropLog} className="mt-2 grid gap-2 sm:grid-cols-4">
          <select name="fieldId" className="rounded border px-2 py-1.5">{fields?.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
          <select name="logType" className="rounded border px-2 py-1.5"><option value="planting">Planting</option><option value="spraying">Spraying</option><option value="fertilizing">Fertilizing</option><option value="irrigation">Irrigation</option><option value="scouting">Scouting</option><option value="harvest">Harvest</option><option value="other">Other</option></select>
          <input name="logDate" type="date" className="rounded border px-2 py-1.5" required />
          <input name="cropName" className="rounded border px-2 py-1.5" placeholder="Crop name" />
          <textarea name="notes" className="sm:col-span-4 rounded border px-2 py-1.5" placeholder="Notes" />
          <button className="sm:col-span-4 rounded border px-2 py-1.5">Save log</button>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Fields</h3>
          {(fields ?? []).map((field) => <p key={field.id} className="text-sm">{field.name} • {field.hectares ?? '—'} ha • {field.status}</p>)}
        </Card>
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Recent logs</h3>
          {(logs ?? []).map((log) => <p key={log.id} className="text-sm">{log.log_date} • {log.log_type} • {log.crop_name || 'n/a'}</p>)}
        </Card>
      </div>
    </section>
  );
}
