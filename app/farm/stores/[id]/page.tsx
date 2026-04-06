import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { transitionFarmStockRequest } from '@/lib/actions/farm';
import { createClient } from '@/lib/supabase/server';

export default async function FarmStoreRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: request }, { data: items }, { data: history }] = await Promise.all([
    supabase
      .from('farm_stock_requests')
      .select('id,request_number,request_type,status,requested_for_type,requested_for_label,need_by_at,approval_notes,rejection_reason,issue_notes,requester:requester_profile_id(full_name),approver:approved_by_profile_id(full_name),issuer:issued_by_profile_id(full_name),created_at,approved_at,issued_at')
      .eq('id', id)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase.from('farm_stock_request_items').select('id,item_name,requested_qty,issued_qty,unit,item_status,notes,created_at').eq('stock_request_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: true }),
    supabase.from('farm_entity_history').select('id,action,payload,created_at').eq('entity_type', 'farm_stock_request').eq('entity_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
  ]);

  if (!request) notFound();

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Stock request {request.request_number}</h1>
      <Card className="p-4">Status: {request.status.replaceAll('_', ' ')} • Type: {request.request_type} • Need by: {request.need_by_at ? new Date(request.need_by_at).toLocaleString() : 'N/A'}</Card>
      <Card className="p-4">
        <h2 className="font-semibold">Request chain</h2>
        <p className="text-sm">Requester: {(request as { requester?: { full_name?: string | null } }).requester?.full_name || 'Unknown'} • Approver: {(request as { approver?: { full_name?: string | null } }).approver?.full_name || 'Pending'} • Issuer: {(request as { issuer?: { full_name?: string | null } }).issuer?.full_name || 'Pending'}</p>
        <p className="text-sm text-gray-600">For: {request.requested_for_type} {request.requested_for_label ? `(${request.requested_for_label})` : ''}</p>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Items</h2>
        <div className="mt-2 space-y-2">
          {(items ?? []).map((item) => (
            <div key={item.id} className="rounded border p-2 text-sm">
              {item.item_name} • requested {item.requested_qty} {item.unit} • issued {item.issued_qty} {item.unit} • {item.item_status.replaceAll('_', ' ')}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Issue + approval notes</h2>
        <p className="text-sm">Approval notes: {request.approval_notes || 'N/A'}</p>
        <p className="text-sm">Issue notes: {request.issue_notes || 'N/A'}</p>
        <p className="text-sm">Rejection reason: {request.rejection_reason || 'N/A'}</p>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Quick issue action</h2>
        <form action={transitionFarmStockRequest} className="mt-2 grid gap-2 sm:grid-cols-5">
          <input type="hidden" name="stockRequestId" value={request.id} />
          <input type="hidden" name="nextStatus" value="issued" />
          <select name="itemId" className="rounded border px-2 py-1 text-sm sm:col-span-2">
            <option value="">Select item</option>
            {(items ?? []).map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}
          </select>
          <input name="issuedQty" type="number" min="0.01" step="0.01" placeholder="Issued qty" className="rounded border px-2 py-1 text-sm" />
          <input name="issueNotes" placeholder="Issue notes" className="rounded border px-2 py-1 text-sm" />
          <button className="rounded bg-indigo-700 px-2 py-1 text-sm font-semibold text-white">Mark issued</button>
        </form>
      </Card>

      <Card className="p-4"><h2 className="font-semibold">History timeline</h2>{history?.map((item) => <p key={item.id} className="text-sm">{new Date(item.created_at).toLocaleString()} — {item.action}</p>)}</Card>
    </section>
  );
}
