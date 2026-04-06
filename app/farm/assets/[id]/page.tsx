import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { closeAssetDowntime, linkAssetDocument, openAssetDowntime } from '@/lib/actions/farm';
import { QrEntryCard } from '@/components/farm/qr-entry-card';

export default async function FarmAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: asset }, { data: history }, { data: faults }, { data: documents }, { data: serviceEvents }] = await Promise.all([
    supabase.from('farm_assets').select('*').eq('id', id).eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase.from('farm_entity_history').select('id,action,payload,created_at').eq('entity_type', 'farm_asset').eq('entity_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
    , supabase.from('farm_asset_faults').select('id,title,status,severity,downtime_started_at,downtime_ended_at,closure_summary,created_at').eq('asset_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
    , supabase.from('farm_asset_documents').select('id,title,document_type,storage_path,created_at').eq('asset_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
    , supabase.from('farm_asset_service_events').select('id,event_type,meter_type,meter_reading,due_at,override_reason,performed_at').eq('asset_id', id).eq('workshop_account_id', profile.workshop_account_id).order('performed_at', { ascending: false })
  ]);
  if (!asset) notFound();

  const openFault = (faults ?? []).find((fault) => !fault.downtime_ended_at && fault.status !== 'closed');

  return <section className="space-y-4">
    <h1 className="text-xl font-semibold">{asset.name}</h1>
    <Card className="p-4">
      <p>Status: {asset.status} • Type: {asset.asset_type} • Criticality: {asset.criticality}</p>
      <p className="text-sm text-gray-600">Service due: {asset.next_service_due_at ? new Date(asset.next_service_due_at).toLocaleString() : 'Not set'} {asset.service_due_override_reason ? `• Override: ${asset.service_due_override_reason}` : ''}</p>
      <p className="text-sm text-gray-600">Downtime window: {asset.downtime_started_at ? new Date(asset.downtime_started_at).toLocaleString() : '—'} → {asset.downtime_ended_at ? new Date(asset.downtime_ended_at).toLocaleString() : 'Open'}</p>
      <div className="mt-3 max-w-xs">
        <QrEntryCard label={`${asset.name} history screen`} href={`/farm/assets/${asset.id}`} />
      </div>
    </Card>

    <Card className="grid gap-3 p-4 sm:grid-cols-2">
      <form action={openAssetDowntime} className="grid gap-2 rounded-lg border p-3">
        <input type="hidden" name="assetId" value={asset.id} />
        <h2 className="font-semibold">Start downtime</h2>
        <input required name="title" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Fault title" />
        <textarea name="description" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Fault details" />
        <select name="severity" className="rounded-lg border px-2 py-1.5 text-sm"><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option><option value="low">Low</option></select>
        <button className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">Mark down</button>
      </form>
      <form action={closeAssetDowntime} className="grid gap-2 rounded-lg border p-3">
        <input type="hidden" name="assetId" value={asset.id} />
        <h2 className="font-semibold">Close downtime</h2>
        <input name="faultId" defaultValue={openFault?.id ?? ''} required className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Fault ID" />
        <textarea required name="closureSummary" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Closure summary" />
        <button className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">Close outage</button>
      </form>
    </Card>

    <Card className="p-4">
      <h2 className="font-semibold">Link document to timeline</h2>
      <form action={linkAssetDocument} className="mt-2 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="assetId" value={asset.id} />
        <input required name="title" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Document title" />
        <select name="documentType" className="rounded-lg border px-2 py-1.5 text-sm"><option value="manual">Manual</option><option value="service_report">Service report</option><option value="inspection">Inspection</option><option value="other">Other</option></select>
        <input required name="storagePath" className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2" placeholder="Storage path (bucket/key)" />
        <input name="linkedServiceEventId" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Service event ID (optional)" />
        <input name="linkedFaultId" className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Fault ID (optional)" />
        <button className="sm:col-span-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Link document</button>
      </form>
      <div className="mt-3 space-y-1 text-sm">
        {(documents ?? []).slice(0, 10).map((doc) => <p key={doc.id}>{doc.document_type}: {doc.title} ({doc.storage_path})</p>)}
      </div>
    </Card>

    <Card className="p-4"><h2 className="font-semibold">Service events</h2>{serviceEvents?.map((e) => <p key={e.id} className="text-sm">{new Date(e.performed_at).toLocaleString()} — {e.event_type}{e.meter_reading ? ` (${e.meter_type}: ${e.meter_reading})` : ''}{e.override_reason ? ` — ${e.override_reason}` : ''}</p>)}</Card>
    <Card className="p-4"><h2 className="font-semibold">History</h2>{history?.map((e) => <p key={e.id} className="text-sm">{new Date(e.created_at).toLocaleString()} — {e.action}</p>)}</Card>
    <Card className="p-4"><h2 className="font-semibold">Fault timeline</h2>{faults?.map((fault) => <p key={fault.id} className="text-sm">{fault.title} • {fault.status} • {fault.closure_summary ?? 'Open'}</p>)}</Card>
  </section>;
}
