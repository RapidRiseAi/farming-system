import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createCropActivityTemplate, createCropField, instantiateCropActivityTemplate, transitionCropActivity } from '@/lib/actions/farm';
import { CropLogComposer } from '@/components/farm/crop-log-composer';

const ACTIVITY_STATUSES = ['planned', 'in_progress', 'completed', 'blocked', 'cancelled'];

export default async function FarmCropsPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,workshop_account_id,full_name').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: fields }, { data: logs }, { data: templates }, { data: activities }, { data: teamProfiles }] = await Promise.all([
    supabase.from('crop_fields').select('id,name,field_code,hectares,status').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('crop_logs').select('id,field_id,log_type,log_date,crop_name,notes').eq('workshop_account_id', profile.workshop_account_id).order('log_date', { ascending: false }).limit(50),
    supabase.from('crop_activity_templates').select('id,template_name,activity_type,field_id,crop_name,cultivar,season,planned_date,status').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }).limit(50),
    supabase
      .from('crop_activities')
      .select('id,template_id,activity_type,field_id,block_name,crop_name,cultivar,season,planned_date,actual_start_at,actual_end_at,team_name,equipment_used,input_product,input_rate,input_unit,conditions,observed_issues,status,supervisor_signoff_at')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
  ]);

  const fieldNameById = new Map((fields ?? []).map((field) => [field.id, field.name]));

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-emerald-950">Crops (fields + logs + activities)</h1>
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
        <h2 className="font-semibold">Create crop activity template</h2>
        <form action={createCropActivityTemplate} className="mt-2 grid gap-2 sm:grid-cols-4">
          <input name="templateName" required className="rounded border px-2 py-1.5" placeholder="Template name" />
          <input name="activityType" required className="rounded border px-2 py-1.5" placeholder="Activity type" />
          <select name="fieldId" className="rounded border px-2 py-1.5">
            <option value="">Any field</option>
            {fields?.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
          </select>
          <input name="blockName" className="rounded border px-2 py-1.5" placeholder="Block" />
          <input name="cropName" className="rounded border px-2 py-1.5" placeholder="Crop" />
          <input name="cultivar" className="rounded border px-2 py-1.5" placeholder="Cultivar" />
          <input name="season" className="rounded border px-2 py-1.5" placeholder="Season" />
          <input name="plannedDate" type="date" className="rounded border px-2 py-1.5" />
          <select name="operatorProfileId" className="rounded border px-2 py-1.5">
            <option value="">Operator</option>
            {teamProfiles?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}
          </select>
          <input name="teamName" className="rounded border px-2 py-1.5" placeholder="Team" />
          <input name="equipmentUsed" className="rounded border px-2 py-1.5" placeholder="Equipment used" />
          <input name="inputProduct" className="rounded border px-2 py-1.5" placeholder="Input/product" />
          <input name="inputRate" type="number" step="0.01" className="rounded border px-2 py-1.5" placeholder="Rate" />
          <input name="inputUnit" className="rounded border px-2 py-1.5" placeholder="Unit" />
          <input name="conditions" className="rounded border px-2 py-1.5" placeholder="Conditions" />
          <input name="observedIssues" className="rounded border px-2 py-1.5" placeholder="Observed issues" />
          <select name="status" className="rounded border px-2 py-1.5">{ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
          <button className="sm:col-span-4 rounded border px-2 py-1.5">Save template</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Instantiate activity from template</h2>
        <form action={instantiateCropActivityTemplate} className="mt-2 grid gap-2 sm:grid-cols-4">
          <select name="templateId" className="rounded border px-2 py-1.5" required>
            <option value="">Select template</option>
            {templates?.map((template) => (
              <option key={template.id} value={template.id}>{template.template_name} • {template.activity_type}</option>
            ))}
          </select>
          <input name="plannedDate" type="date" className="rounded border px-2 py-1.5" />
          <select name="status" className="rounded border px-2 py-1.5">{ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
          <button className="rounded border px-2 py-1.5">Create activity</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Log crop activity</h2>
        <CropLogComposer fields={(fields ?? []).map((field) => ({ id: field.id, name: field.name }))} initialTemplate={params.template} />
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

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Activity templates</h3>
          {(templates ?? []).map((template) => (
            <p key={template.id} className="text-sm">{template.template_name} • {template.activity_type} • {fieldNameById.get(template.field_id || '') || 'Any field'} • {template.crop_name || 'n/a'} • {template.status}</p>
          ))}
        </Card>
        <Card className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Crop activities</h3>
          <div className="space-y-3">
            {(activities ?? []).map((activity) => (
              <div key={activity.id} className="rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-medium">{activity.activity_type} • {fieldNameById.get(activity.field_id || '') || activity.block_name || 'No field/block'}</p>
                <p className="text-xs text-gray-600">Crop: {activity.crop_name || 'n/a'} / {activity.cultivar || 'n/a'} / {activity.season || 'n/a'}</p>
                <p className="text-xs text-gray-600">Plan: {activity.planned_date || 'n/a'} • Start: {activity.actual_start_at ? new Date(activity.actual_start_at).toLocaleString() : 'n/a'} • End: {activity.actual_end_at ? new Date(activity.actual_end_at).toLocaleString() : 'n/a'}</p>
                <p className="text-xs text-gray-600">Team/operator: {activity.team_name || 'n/a'} • Equipment: {activity.equipment_used || 'n/a'}</p>
                <p className="text-xs text-gray-600">Input: {activity.input_product || 'n/a'} {activity.input_rate ? `@ ${activity.input_rate}` : ''} {activity.input_unit || ''}</p>
                <p className="text-xs text-gray-600">Conditions: {activity.conditions || 'n/a'} • Issues: {activity.observed_issues || 'n/a'}</p>
                <p className="text-xs text-gray-600">Status: {activity.status} {activity.supervisor_signoff_at ? `• signed off ${new Date(activity.supervisor_signoff_at).toLocaleString()}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ACTIVITY_STATUSES.map((status) => (
                    <form key={status} action={transitionCropActivity}>
                      <input type="hidden" name="activityId" value={activity.id} />
                      <input type="hidden" name="nextStatus" value={status} />
                      <button className="rounded border px-2 py-1 text-xs">{status.replaceAll('_', ' ')}</button>
                    </form>
                  ))}
                  <form action={transitionCropActivity}>
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="nextStatus" value={activity.status} />
                    <label className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                      <input type="checkbox" name="signOff" /> Sign-off
                    </label>
                    <button className="ml-1 rounded border px-2 py-1 text-xs">Save</button>
                  </form>
                </div>
              </div>
            ))}
            {!activities?.length ? <p className="text-sm text-gray-500">No activities yet.</p> : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
