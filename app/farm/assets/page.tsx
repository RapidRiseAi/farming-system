import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createFarmAsset, quickUpdateAssetMeter, updateFarmAsset } from '@/lib/actions/farm';

export default async function FarmAssetsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');
  const { data: staff } = await supabase
    .from('profiles')
    .select('id,full_name')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('full_name', { ascending: true });

  const [{ data: assets }, { data: history }] = await Promise.all([
    supabase
      .from('farm_assets')
      .select('id,name,asset_code,asset_type,status,site_name,current_hours,current_odometer_km,notes,updated_at,assigned_profile_id,service_interval_type,service_interval_value,next_service_due_at,criticality,make,model,serial_number,registration')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase.from('farm_entity_history').select('id,entity_id,action,created_at').eq('workshop_account_id', profile.workshop_account_id).eq('entity_type', 'farm_asset').order('created_at', { ascending: false }).limit(500)
  ]);

  const historyByAsset = new Map<string, Array<{ id: string; action: string; created_at: string }>>();
  for (const event of history ?? []) {
    const bucket = historyByAsset.get(event.entity_id) ?? [];
    bucket.push(event);
    historyByAsset.set(event.entity_id, bucket);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-emerald-950">Asset control</h1>
      <Card className="rounded-2xl border bg-white p-4">
        <form action={createFarmAsset} className="grid gap-2 sm:grid-cols-3">
          <input name="assetCode" required className="rounded-lg border px-3 py-2" placeholder="Asset code" />
          <input name="name" required className="rounded-lg border px-3 py-2" placeholder="Asset name" />
          <input name="qrToken" className="rounded-lg border px-3 py-2" placeholder="QR token (optional)" />
          <select name="assetType" className="rounded-lg border px-3 py-2"><option value="equipment">Equipment</option><option value="vehicle">Vehicle</option><option value="building">Building</option><option value="irrigation">Irrigation</option><option value="storage">Storage</option><option value="other">Other</option></select>
          <select name="status" className="rounded-lg border px-3 py-2"><option value="operational">Operational</option><option value="maintenance_due">Maintenance due</option><option value="down">Down</option></select>
          <input name="make" required className="rounded-lg border px-3 py-2" placeholder="Make" />
          <input name="model" required className="rounded-lg border px-3 py-2" placeholder="Model" />
          <input name="serialNumber" required className="rounded-lg border px-3 py-2" placeholder="Serial number" />
          <input name="registration" required className="rounded-lg border px-3 py-2" placeholder="Registration" />
          <input name="siteName" className="rounded-lg border px-3 py-2" placeholder="Site" />
          <input name="currentHours" type="number" className="rounded-lg border px-3 py-2" placeholder="Hours" />
          <input name="currentOdometerKm" type="number" className="rounded-lg border px-3 py-2" placeholder="Odometer km" />
          <select name="assignedProfileId" className="rounded-lg border px-3 py-2">
            <option value="">Unassigned</option>
            {(staff ?? []).map((person) => <option key={person.id} value={person.id}>{person.full_name ?? person.id}</option>)}
          </select>
          <select name="serviceIntervalType" className="rounded-lg border px-3 py-2"><option value="days">Calendar days</option><option value="hours">Engine hours</option><option value="odometer_km">Odometer km</option></select>
          <input name="serviceIntervalValue" type="number" min={1} defaultValue={30} className="rounded-lg border px-3 py-2" placeholder="Service interval" />
          <input name="lastServiceMeter" type="number" step="0.1" defaultValue={0} className="rounded-lg border px-3 py-2" placeholder="Last service meter" />
          <input name="nextServiceDueAt" type="datetime-local" className="rounded-lg border px-3 py-2" />
          <select name="criticality" className="rounded-lg border px-3 py-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
          <textarea name="notes" className="sm:col-span-3 rounded-lg border px-3 py-2" placeholder="Notes" />
          <button className="sm:col-span-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Create asset</button>
        </form>
      </Card>

      <div className="grid gap-3">
        {(assets ?? []).map((asset) => (
          <Card key={asset.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <form action={updateFarmAsset} className="grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="assetId" value={asset.id} />
              <input defaultValue={asset.asset_code || ''} name="assetCode" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Asset code" />
              <input defaultValue={asset.name} name="name" className="rounded-lg border px-2 py-1.5 text-sm" />
              <input defaultValue={asset.site_name || ''} name="siteName" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Site" />
              <input defaultValue={asset.current_hours ?? ''} name="currentHours" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Hours" />
              <input defaultValue={asset.current_odometer_km ?? ''} name="currentOdometerKm" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Km" />
              <input defaultValue={asset.make || ''} name="make" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Make" />
              <input defaultValue={asset.model || ''} name="model" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Model" />
              <input defaultValue={asset.serial_number || ''} name="serialNumber" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Serial number" />
              <input defaultValue={asset.registration || ''} name="registration" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Registration" />
              <select defaultValue={asset.assigned_profile_id || ''} name="assignedProfileId" className="rounded-lg border px-2 py-1.5 text-sm">
                <option value="">Unassigned</option>
                {(staff ?? []).map((person) => <option key={person.id} value={person.id}>{person.full_name ?? person.id}</option>)}
              </select>
              <select defaultValue={asset.service_interval_type || 'days'} name="serviceIntervalType" className="rounded-lg border px-2 py-1.5 text-sm"><option value="days">Days</option><option value="hours">Hours</option><option value="odometer_km">Odometer km</option></select>
              <input defaultValue={asset.service_interval_value ?? 30} name="serviceIntervalValue" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Interval" />
              <input defaultValue={asset.next_service_due_at ? new Date(asset.next_service_due_at).toISOString().slice(0, 16) : ''} name="nextServiceDueAt" type="datetime-local" className="rounded-lg border px-2 py-1.5 text-sm" />
              <select defaultValue={asset.criticality || 'medium'} name="criticality" className="rounded-lg border px-2 py-1.5 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
              <select defaultValue={asset.status} name="status" className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2"><option value="operational">Operational</option><option value="maintenance_due">Maintenance due</option><option value="down">Down</option><option value="retired">Archived</option></select>
              <textarea defaultValue={asset.notes || ''} name="notes" className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2" placeholder="Notes" />
              <button className="sm:col-span-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900">Save asset</button>
            </form>
            <form action={quickUpdateAssetMeter} className="mt-2 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="assetId" value={asset.id} />
              <select name="meterType" className="rounded-lg border px-2 py-1.5 text-sm"><option value="hours">Engine hours</option><option value="odometer">Odometer km</option></select>
              <input name="reading" type="number" step="0.1" required className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Fast meter update" />
              <button className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-900">Update meter</button>
            </form>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <p>Timeline: {(historyByAsset.get(asset.id) ?? []).slice(0, 4).map((evt) => evt.action).join(' → ') || 'No history yet'}</p>
              <Link href={`/farm/assets/${asset.id}`} className="text-emerald-700 underline">Details</Link>
            </div>
          </Card>
        ))}
      </div>
      {!assets?.length ? <p className="text-sm text-gray-500">No assets created yet. Add your first asset above.</p> : null}
    </section>
  );
}
