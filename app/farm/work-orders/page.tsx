import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { createFarmWorkOrderTask, transitionFarmWorkOrder } from '@/lib/actions/farm';

const ORDER_STATUSES = ['open', 'triaged', 'approved', 'in_progress', 'waiting_parts', 'resolved', 'closed'];

export default async function FarmWorkOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: orders }, { data: tasks }] = await Promise.all([
    supabase
      .from('farm_work_orders')
      .select('id,work_order_number,work_order_type,status,short_description,created_at,work_request_id')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('farm_tasks')
      .select('id,title,status,farm_work_order_id')
      .eq('workshop_account_id', profile.workshop_account_id)
      .not('farm_work_order_id', 'is', null)
      .order('created_at', { ascending: false })
  ]);

  const tasksByWorkOrder = new Map<string, Array<{ id: string; title: string; status: string }>>();
  for (const task of tasks ?? []) {
    if (!task.farm_work_order_id) continue;
    const bucket = tasksByWorkOrder.get(task.farm_work_order_id) ?? [];
    bucket.push({ id: task.id, title: task.title, status: task.status });
    tasksByWorkOrder.set(task.farm_work_order_id, bucket);
  }

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold text-emerald-950">Farm work orders</h1>
      <div className="space-y-3">
        {(orders ?? []).map((order) => (
          <Card key={order.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-indigo-700">{order.work_order_number}</p>
                <h2 className="text-base font-semibold text-black">{order.short_description}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">{order.status.replaceAll('_', ' ')}</span>
                <Link href={`/farm/work-orders/${order.id}`} className="text-xs text-emerald-700 underline">Details</Link>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">Type: {order.work_order_type} • Created: {new Date(order.created_at).toLocaleString()} • Request: {order.work_request_id || 'Direct'}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {ORDER_STATUSES.filter((status) => status !== order.status).map((status) => (
                <form key={status} action={transitionFarmWorkOrder}>
                  <input type="hidden" name="workOrderId" value={order.id} />
                  <input type="hidden" name="nextStatus" value={status} />
                  <button className="rounded-lg border px-2 py-1 text-xs">{status.replaceAll('_', ' ')}</button>
                </form>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Child tasks</p>
              {(tasksByWorkOrder.get(order.id) ?? []).slice(0, 5).map((task) => (
                <p key={task.id} className="text-sm text-gray-700">• {task.title} ({task.status.replaceAll('_', ' ')})</p>
              ))}
              {!(tasksByWorkOrder.get(order.id) ?? []).length ? <p className="text-sm text-gray-500">No child tasks yet.</p> : null}
            </div>

            <form action={createFarmWorkOrderTask} className="mt-3 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="workOrderId" value={order.id} />
              <input name="title" placeholder="Child task title" className="rounded-lg border px-2 py-2 text-sm" required />
              <select name="priority" className="rounded-lg border px-2 py-2 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select>
              <input name="dueAt" type="datetime-local" className="rounded-lg border px-2 py-2 text-sm" />
              <button className="rounded-lg border border-indigo-300 px-3 py-2 text-sm">Add task</button>
            </form>
          </Card>
        ))}
      </div>
      {!(orders ?? []).length ? <p className="text-sm text-gray-500">No work orders yet. Approve and convert a request first.</p> : null}
    </section>
  );
}
