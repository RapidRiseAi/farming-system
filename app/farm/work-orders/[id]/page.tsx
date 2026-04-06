import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function FarmWorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: workOrder }, { data: tasks }, { data: history }] = await Promise.all([
    supabase
      .from('farm_work_orders')
      .select('id,work_order_number,request_number,work_order_type,status,short_description,attachments,approval_notes,created_at,work_request_id,site:site_id(name),area:area_id(name),raised_by:raised_by_profile_id(full_name)')
      .eq('id', id)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase.from('farm_tasks').select('id,title,status,priority,due_at').eq('farm_work_order_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase
      .from('farm_entity_history')
      .select('id,action,payload,created_at')
      .eq('entity_type', 'farm_work_order')
      .eq('entity_id', id)
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
  ]);

  if (!workOrder) notFound();

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Work order {workOrder.work_order_number}</h1>
      <Card className="p-4">Status: {workOrder.status} • Type: {workOrder.work_order_type}</Card>
      <Card className="p-4"><h2 className="font-semibold">Description + context</h2><p className="text-sm text-gray-700">{workOrder.short_description}</p><p className="mt-1 text-sm">Request: {workOrder.request_number || 'N/A'} • Raised by: {(workOrder as { raised_by?: { full_name?: string | null } }).raised_by?.full_name || 'Unknown'} • Site: {(workOrder as { site?: { name?: string | null } }).site?.name || 'N/A'} • Area: {(workOrder as { area?: { name?: string | null } }).area?.name || 'N/A'}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Approval fields</h2><p className="text-sm">{workOrder.approval_notes || 'No approval notes captured.'}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Attachments</h2><pre className="overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(workOrder.attachments ?? [], null, 2)}</pre></Card>
      <Card className="p-4"><h2 className="font-semibold">Child tasks</h2>{tasks?.map((task) => <p key={task.id} className="text-sm">{task.title} — {task.status} • priority {task.priority}</p>)}{!tasks?.length ? <p className="text-sm text-gray-500">No tasks linked yet.</p> : null}</Card>
      <Card className="p-4"><h2 className="font-semibold">History timeline</h2>{history?.map((item) => <p key={item.id} className="text-sm">{new Date(item.created_at).toLocaleString()} — {item.action}</p>)}</Card>
    </section>
  );
}
