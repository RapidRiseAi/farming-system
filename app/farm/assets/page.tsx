import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createFarmAsset, fastUpdateAssetMeter, overrideAssetServiceDue, updateFarmAsset } from '@/lib/actions/farm';

export default async function FarmAssetsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: assets }, { data: history }] = await Promise.all([
    supabase
      .from('farm_assets')
      .select('id,name,asset_code,asset_type,status,site_name,current_hours,current_odometer_km,service_interval_type,service_interval_value,last_service_meter,next_service_due_at,criticality,notes,updated_at')
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
          <select name="assetType" className="rounded-lg border px-3 py-2"><option value="equipment">Equipment</option><option value="vehicle">Vehicle</option><option value="building">Building</option><option value="irrigation">Irrigation</option><option value="storage">Storage</option><option value="other">Other</option></select>
          <select name="status" className="rounded-lg border px-3 py-2"><option value="active">Active</option><option value="maintenance_due">Maintenance due</option><option value="in_repair">In repair</option></select>
          <input name="make" required className="rounded-lg border px-3 py-2" placeholder="Make" />
          <input name="model" required className="rounded-lg border px-3 py-2" placeholder="Model" />
          <input name="serialNumber" required className="rounded-lg border px-3 py-2" placeholder="Serial number" />
          <input name="registration" required className="rounded-lg border px-3 py-2" placeholder="Registration" />
          <input name="siteName" className="rounded-lg border px-3 py-2" placeholder="Site" />
          <input name="currentHours" type="number" className="rounded-lg border px-3 py-2" placeholder="Hours" />
          <input name="currentOdometerKm" type="number" className="rounded-lg border px-3 py-2" placeholder="Odometer km" />
          <select name="serviceIntervalType" className="rounded-lg border px-3 py-2"><option value="hours">Hours</option><option value="distance_km">Distance km</option><option value="days">Days</option></select>
          <input name="serviceIntervalValue" type="number" required className="rounded-lg border px-3 py-2" placeholder="Service interval value" />
          <input name="lastServiceMeter" type="number" required className="rounded-lg border px-3 py-2" placeholder="Last service meter" />
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
              <input defaultValue={asset.asset_code} name="assetCode" className="rounded-lg border px-2 py-1.5 text-sm" />
              <input defaultValue={asset.name} name="name" className="rounded-lg border px-2 py-1.5 text-sm" />
              <input defaultValue={asset.criticality} name="criticality" className="rounded-lg border px-2 py-1.5 text-sm" />
              <input defaultValue={asset.site_name || ''} name="siteName" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Site" />
              <input defaultValue={asset.current_hours ?? ''} name="currentHours" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Hours" />
              <input defaultValue={asset.current_odometer_km ?? ''} name="currentOdometerKm" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Km" />
              <select defaultValue={asset.status} name="status" className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2"><option value="active">Active</option><option value="maintenance_due">Maintenance due</option><option value="in_repair">In repair</option><option value="retired">Archived</option></select>
              <select defaultValue={asset.service_interval_type} name="serviceIntervalType" className="rounded-lg border px-2 py-1.5 text-sm"><option value="hours">Hours</option><option value="distance_km">Distance km</option><option value="days">Days</option></select>
              <input defaultValue={asset.service_interval_value ?? ''} name="serviceIntervalValue" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Interval" />
              <input defaultValue={asset.last_service_meter ?? ''} name="lastServiceMeter" type="number" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Last service meter" />
              <input defaultValue={asset.next_service_due_at ? asset.next_service_due_at.slice(0, 16) : ''} name="nextServiceDueAt" type="datetime-local" className="rounded-lg border px-2 py-1.5 text-sm" />
              <input name="serviceDueOverrideReason" className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2" placeholder="Override reason (if changing due date)" />
              <textarea defaultValue={asset.notes || ''} name="notes" className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2" placeholder="Notes" />
              <button className="sm:col-span-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900">Save asset</button>
            </form>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <form action={fastUpdateAssetMeter} className="grid gap-2 rounded-lg border border-dashed p-2">
                <input type="hidden" name="assetId" value={asset.id} />
                <p className="text-xs font-semibold uppercase text-gray-500">Fast meter update</p>
                <select name="meterType" className="rounded-lg border px-2 py-1.5 text-sm"><option value="hours">Hours</option><option value="distance_km">Distance km</option></select>
                <input required type="number" name="meterReading" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Reading" />
                <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">Post meter</button>
              </form>
              <form action={overrideAssetServiceDue} className="grid gap-2 rounded-lg border border-dashed p-2">
                <input type="hidden" name="assetId" value={asset.id} />
                <p className="text-xs font-semibold uppercase text-gray-500">Manual service override</p>
                <input required type="datetime-local" name="nextServiceDueAt" className="rounded-lg border px-2 py-1.5 text-sm" />
                <input required name="reason" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Reason for override" />
                <button className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white">Override due date</button>
              </form>
            </div>
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
