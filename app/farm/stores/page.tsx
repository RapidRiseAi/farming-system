import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { addFarmStockRequestItem, createFarmStockRequest, transitionFarmStockRequest } from '@/lib/actions/farm';
import { createClient } from '@/lib/supabase/server';

const STOCK_REQUEST_STATUSES = ['new', 'pending_approval', 'approved', 'partially_issued', 'issued', 'cancelled', 'rejected'];

export default async function FarmStoresPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,workshop_account_id,full_name').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: requests }, { data: team }] = await Promise.all([
    supabase
      .from('farm_stock_requests')
      .select('id,request_number,request_type,status,requested_for_type,requested_for_label,need_by_at,requester_profile_id,approved_by_profile_id,issued_by_profile_id,created_at,requester:requester_profile_id(full_name)')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
  ]);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Store stock requests</h1>
        <form action={createFarmStockRequest} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select name="requestType" className="rounded-lg border px-3 py-2">
            {['general', 'feed', 'seed', 'fertilizer', 'chemical', 'fuel', 'spares', 'packaging', 'other'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select name="requesterProfileId" className="rounded-lg border px-3 py-2" defaultValue={profile.id}>
            {team?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}
          </select>
          <select name="requestedForType" className="rounded-lg border px-3 py-2">
            {['site', 'area', 'asset', 'work_order', 'task', 'livestock', 'other'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input name="requestedForLabel" placeholder="Requested for label (North Shed / WO-123)" className="rounded-lg border px-3 py-2" />
          <input name="itemName" placeholder="Item" className="rounded-lg border px-3 py-2" required />
          <div className="grid grid-cols-2 gap-2">
            <input name="qty" type="number" min="0.01" step="0.01" placeholder="Qty" className="rounded-lg border px-3 py-2" required />
            <input name="unit" placeholder="Unit (kg, L, box)" className="rounded-lg border px-3 py-2" required />
          </div>
          <input type="datetime-local" name="needByAt" className="rounded-lg border px-3 py-2" />
          <label className="text-sm text-gray-700"><input type="checkbox" name="sendForApproval" value="true" className="mr-2" />Send for approval now</label>
          <textarea name="itemNotes" placeholder="Item/request notes" className="sm:col-span-2 min-h-16 rounded-lg border px-3 py-2" />
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Create stock request</button>
        </form>
      </Card>

      <div className="space-y-3">
        {(requests ?? []).map((request) => (
          <Card key={request.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-700">{request.request_number}</p>
                <h2 className="text-base font-semibold text-black">{request.request_type} request • {(request as { requester?: { full_name?: string | null } }).requester?.full_name || 'Unknown requester'}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">{request.status.replaceAll('_', ' ')}</span>
                <Link href={`/farm/stores/${request.id}`} className="text-xs text-emerald-700 underline">Details</Link>
              </div>
            </div>

            <p className="mt-1 text-xs text-gray-500">For: {request.requested_for_type} {request.requested_for_label ? `(${request.requested_for_label})` : ''} • Need by: {request.need_by_at ? new Date(request.need_by_at).toLocaleString() : 'N/A'}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {STOCK_REQUEST_STATUSES.filter((status) => status !== request.status).map((status) => (
                <form key={status} action={transitionFarmStockRequest}>
                  <input type="hidden" name="stockRequestId" value={request.id} />
                  <input type="hidden" name="nextStatus" value={status} />
                  <button className="rounded-lg border px-2 py-1 text-xs">{status.replaceAll('_', ' ')}</button>
                </form>
              ))}
              <form action={addFarmStockRequestItem} className="flex flex-wrap gap-2">
                <input type="hidden" name="stockRequestId" value={request.id} />
                <input name="itemName" placeholder="Add item" className="rounded-lg border px-2 py-1 text-xs" />
                <input name="qty" type="number" min="0.01" step="0.01" placeholder="Qty" className="w-20 rounded-lg border px-2 py-1 text-xs" />
                <input name="unit" placeholder="Unit" className="w-20 rounded-lg border px-2 py-1 text-xs" />
                <button className="rounded-lg bg-indigo-700 px-2 py-1 text-xs font-semibold text-white">Add item</button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
