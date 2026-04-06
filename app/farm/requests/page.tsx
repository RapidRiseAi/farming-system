import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { convertRequestToWorkOrder, createFarmWorkRequest, transitionFarmWorkRequest } from '@/lib/actions/farm';

const REQUEST_STATUSES = ['new', 'triaged', 'waiting_approval', 'approved', 'actioned', 'closed', 'rejected'];

export default async function FarmWorkRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,workshop_account_id,role,full_name').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: requests }, { data: sites }, { data: areas }, { data: team }] = await Promise.all([
    supabase
      .from('farm_work_requests')
      .select('id,request_number,request_type,status,short_description,converted_work_order_id,created_at,site_id,area_id,raised_by_profile_id,profiles:raised_by_profile_id(full_name)')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('farm_sites').select('id,name').eq('workshop_account_id', profile.workshop_account_id).eq('status', 'active').order('name', { ascending: true }),
    supabase.from('farm_areas').select('id,name').eq('workshop_account_id', profile.workshop_account_id).eq('active', true).order('name', { ascending: true }),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
  ]);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Raise farm work request</h1>
        <form action={createFarmWorkRequest} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="requestType" placeholder="Type (maintenance, safety, etc.)" className="rounded-lg border px-3 py-2" required />
          <select name="raisedByProfileId" className="rounded-lg border px-3 py-2" defaultValue={profile.id}>
            {team?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}
          </select>
          <select name="siteId" className="rounded-lg border px-3 py-2"><option value="">Site (optional)</option>{sites?.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
          <select name="areaId" className="rounded-lg border px-3 py-2"><option value="">Area (optional)</option>{areas?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
          <textarea name="shortDescription" placeholder="Short description" className="sm:col-span-2 min-h-20 rounded-lg border px-3 py-2" required />
          <textarea name="attachments" placeholder='Attachments JSON (optional), e.g. {"type":"image","path":"farm/docs/photo.jpg"}' className="sm:col-span-2 min-h-16 rounded-lg border px-3 py-2" />
          <label className="text-sm text-gray-700"><input type="checkbox" name="approvalRequested" value="true" className="mr-2" />Send for approval immediately</label>
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Create request</button>
        </form>
      </Card>

      <div className="space-y-3">
        {(requests ?? []).map((request) => (
          <Card key={request.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-700">{request.request_number}</p>
                <h2 className="text-base font-semibold text-black">{request.short_description}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">{request.status.replaceAll('_', ' ')}</span>
                <Link href={`/farm/requests/${request.id}`} className="text-xs text-emerald-700 underline">Details</Link>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">Type: {request.request_type} • Raised by: {(request as { profiles?: { full_name?: string | null } }).profiles?.full_name || 'Unknown'} • {new Date(request.created_at).toLocaleString()}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {REQUEST_STATUSES.filter((status) => status !== request.status).map((status) => (
                <form key={status} action={transitionFarmWorkRequest}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="nextStatus" value={status} />
                  <button className="rounded-lg border px-2 py-1 text-xs">{status.replaceAll('_', ' ')}</button>
                </form>
              ))}
              {request.status === 'approved' && !request.converted_work_order_id ? (
                <form action={convertRequestToWorkOrder} className="flex flex-wrap gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <input name="childTaskTitle" placeholder="First child task title (optional)" className="rounded-lg border px-2 py-1 text-xs" />
                  <button className="rounded-lg bg-indigo-700 px-2 py-1 text-xs font-semibold text-white">Convert to work order</button>
                </form>
              ) : null}
            </div>
          </Card>
        ))}
        {!(requests ?? []).length ? <p className="text-sm text-gray-500">No requests yet.</p> : null}
      </div>
    </section>
  );
}
