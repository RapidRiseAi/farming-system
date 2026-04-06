import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function FarmRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: request }, { data: workOrder }, { data: history }] = await Promise.all([
    supabase
      .from('farm_work_requests')
      .select('id,request_number,request_type,status,short_description,attachments,approval_notes,rejection_reason,converted_work_order_id,created_at,site:site_id(name),area:area_id(name),raised_by:raised_by_profile_id(full_name)')
      .eq('id', id)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase.from('farm_work_orders').select('id,work_order_number,status').eq('work_request_id', id).eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase
      .from('farm_entity_history')
      .select('id,action,payload,created_at')
      .eq('entity_type', 'farm_work_request')
      .eq('entity_id', id)
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
  ]);

  if (!request) notFound();
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Request {request.request_number}</h1>
      <Card className="p-4">Status: {request.status} • Type: {request.request_type}</Card>
      <Card className="p-4"><h2 className="font-semibold">Description</h2><p className="text-sm text-gray-700">{request.short_description}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Context</h2><p className="text-sm">Raised by: {(request as { raised_by?: { full_name?: string | null } }).raised_by?.full_name || 'Unknown'} • Site: {(request as { site?: { name?: string | null } }).site?.name || 'N/A'} • Area: {(request as { area?: { name?: string | null } }).area?.name || 'N/A'}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Approval + conversion</h2><p className="text-sm">Approval notes: {request.approval_notes || 'N/A'} • Rejection reason: {request.rejection_reason || 'N/A'}</p><p className="text-sm">Work order: {workOrder ? `${workOrder.work_order_number} (${workOrder.status})` : 'Not converted'}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Attachments</h2><pre className="overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(request.attachments ?? [], null, 2)}</pre></Card>
      <Card className="p-4"><h2 className="font-semibold">History timeline</h2>{history?.map((item) => <p key={item.id} className="text-sm">{new Date(item.created_at).toLocaleString()} — {item.action}</p>)}</Card>
    </section>
  );
}
