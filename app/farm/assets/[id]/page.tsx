import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { closeFarmAssetDowntime, linkFarmAssetDocument, logFarmAssetServiceEvent, quickUpdateAssetMeter, startFarmAssetDowntime } from '@/lib/actions/farm';

export default async function FarmAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: asset }, { data: history }, { data: faults }, { data: docs }, { data: services }] = await Promise.all([
    supabase.from('farm_assets').select('*').eq('id', id).eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase.from('farm_entity_history').select('id,action,payload,created_at').eq('entity_type', 'farm_asset').eq('entity_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('farm_asset_faults').select('id,summary,status,started_at,closed_at,closure_summary').eq('asset_id', id).eq('workshop_account_id', profile.workshop_account_id).order('started_at', { ascending: false }).limit(10),
    supabase.from('farm_asset_documents').select('id,title,document_type,storage_path,note,created_at').eq('asset_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }).limit(20),
    supabase.from('farm_asset_service_events').select('id,event_type,service_at,meter_reading,next_due_at,override_reason').eq('asset_id', id).eq('workshop_account_id', profile.workshop_account_id).order('service_at', { ascending: false }).limit(20)
  ]);
  if (!asset) notFound();

  const now = Date.now();
  const serviceByDateDue = asset.next_service_due_at ? new Date(asset.next_service_due_at).getTime() <= now : false;
  const serviceByMeterDue = asset.service_interval_type === 'hours'
    ? (Number(asset.current_hours ?? 0) - Number(asset.last_service_meter ?? 0)) >= Number(asset.service_interval_value ?? 0)
    : asset.service_interval_type === 'odometer_km'
      ? (Number(asset.current_odometer_km ?? 0) - Number(asset.last_service_meter ?? 0)) >= Number(asset.service_interval_value ?? 0)
      : false;
  const isServiceDue = serviceByDateDue || serviceByMeterDue;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">{asset.name}</h1>
      <Card className="space-y-2 p-4">
        <p>Status: {asset.status} • Type: {asset.asset_type} • Criticality: {asset.criticality}</p>
        <p className="text-sm text-gray-600">Service due: <span className={isServiceDue ? 'font-semibold text-red-700' : 'text-emerald-700'}>{isServiceDue ? 'Due now' : 'Not yet due'}</span></p>
        <p className="text-sm text-gray-600">Next due at: {asset.next_service_due_at ? new Date(asset.next_service_due_at).toLocaleString() : '—'}</p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Fast meter update</h2>
        <form action={quickUpdateAssetMeter} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="assetId" value={asset.id} />
          <select name="meterType" className="rounded-lg border px-3 py-2"><option value="hours">Engine hours</option><option value="odometer">Odometer km</option></select>
          <input name="reading" required type="number" step="0.1" className="rounded-lg border px-3 py-2" placeholder="Latest reading" />
          <button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Update meter</button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Service log + override</h2>
        <form action={logFarmAssetServiceEvent} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="assetId" value={asset.id} />
          <input name="serviceAt" type="datetime-local" className="rounded-lg border px-3 py-2" />
          <input name="meterReading" type="number" step="0.1" className="rounded-lg border px-3 py-2" placeholder="Meter at service" />
          <input name="manualNextDueAt" type="datetime-local" className="rounded-lg border px-3 py-2" />
          <input name="manualOverrideReason" className="rounded-lg border px-3 py-2" placeholder="Manual override reason (required if set)" />
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Save service event</button>
        </form>
        <div className="mt-3 space-y-1 text-sm">
          {services?.map((event) => (
            <p key={event.id}>{new Date(event.service_at).toLocaleString()} — {event.event_type} → next due {event.next_due_at ? new Date(event.next_due_at).toLocaleString() : '—'} {event.override_reason ? `(${event.override_reason})` : ''}</p>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Downtime tracking</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={startFarmAssetDowntime} className="space-y-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <input name="summary" required className="w-full rounded-lg border px-3 py-2" placeholder="Downtime issue summary" />
            <button className="w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Start downtime</button>
          </form>
          <form action={closeFarmAssetDowntime} className="space-y-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <textarea name="closureSummary" required className="w-full rounded-lg border px-3 py-2" placeholder="Closure summary / fix notes" />
            <button className="w-full rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">Close downtime</button>
          </form>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          {faults?.map((fault) => (
            <p key={fault.id}>{new Date(fault.started_at).toLocaleString()} — {fault.summary} ({fault.status}) {fault.closure_summary ? `• ${fault.closure_summary}` : ''}</p>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Documents</h2>
        <form action={linkFarmAssetDocument} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="assetId" value={asset.id} />
          <input name="title" required className="rounded-lg border px-3 py-2" placeholder="Document title" />
          <select name="documentType" className="rounded-lg border px-3 py-2"><option value="manual">Manual</option><option value="certificate">Certificate</option><option value="invoice">Invoice</option><option value="photo">Photo</option><option value="other">Other</option></select>
          <input name="storagePath" required className="sm:col-span-2 rounded-lg border px-3 py-2" placeholder="Storage path / URL" />
          <input name="note" className="sm:col-span-2 rounded-lg border px-3 py-2" placeholder="Note" />
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Link document</button>
        </form>
        <div className="mt-3 space-y-1 text-sm">
          {docs?.map((doc) => (
            <p key={doc.id}>{new Date(doc.created_at).toLocaleString()} — {doc.title} ({doc.document_type}) • {doc.storage_path}</p>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Timeline</h2>
        {history?.map((e) => <p key={e.id} className="text-sm">{new Date(e.created_at).toLocaleString()} — {e.action}</p>)}
      </Card>
    </section>
  );
}
