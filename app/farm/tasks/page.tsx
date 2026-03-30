import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { createFarmTask, addFarmTaskUpdate } from '@/lib/actions/farm';

export default async function FarmTasksPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: tasks }, { data: updates }] = await Promise.all([
    supabase
      .from('farm_tasks')
      .select('id,title,task_type,status,priority,due_at,created_at')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('farm_task_updates')
      .select('id,task_id,message,created_at')
      .order('created_at', { ascending: false })
      .limit(200)
  ]);

  const updatesByTask = new Map<string, Array<{ id: string; message: string; created_at: string }>>();
  for (const update of updates ?? []) {
    const bucket = updatesByTask.get(update.task_id) ?? [];
    bucket.push(update);
    updatesByTask.set(update.task_id, bucket);
  }

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Create farm task</h1>
        <p className="text-sm text-gray-600">Assign and track operational work instead of WhatsApp messages.</p>
        <form action={createFarmTask} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="title" placeholder="Task title" className="rounded-lg border px-3 py-2" required />
          <input name="dueAt" type="datetime-local" className="rounded-lg border px-3 py-2" />
          <select name="taskType" className="rounded-lg border px-3 py-2">
            <option value="general">General</option>
            <option value="maintenance">Maintenance</option>
            <option value="inspection">Inspection</option>
            <option value="crop">Crop</option>
            <option value="livestock">Livestock</option>
            <option value="incident_followup">Incident follow-up</option>
          </select>
          <select name="priority" className="rounded-lg border px-3 py-2">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <textarea name="description" placeholder="Details, location, instructions, required proof..." className="sm:col-span-2 min-h-24 rounded-lg border px-3 py-2" />
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Create task</button>
        </form>
      </Card>

      <div className="space-y-3">
        {(tasks ?? []).map((task) => (
          <Card key={task.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-black">{task.title}</h2>
              <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">{task.status.replaceAll('_', ' ')}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Type: {task.task_type} • Priority: {task.priority} • Due: {task.due_at ? new Date(task.due_at).toLocaleString() : 'n/a'}</p>

            <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Updates</p>
              {(updatesByTask.get(task.id) ?? []).slice(0, 3).map((update) => (
                <p key={update.id} className="text-sm text-gray-700">• {update.message}</p>
              ))}
              {!(updatesByTask.get(task.id) ?? []).length ? <p className="text-sm text-gray-500">No updates yet.</p> : null}
            </div>

            <form action={addFarmTaskUpdate} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="taskId" value={task.id} />
              <input name="message" placeholder="Add progress update..." className="flex-1 rounded-lg border px-3 py-2 text-sm" required />
              <button className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Post update</button>
            </form>
          </Card>
        ))}
        {!tasks?.length ? <p className="text-sm text-gray-500">No tasks yet.</p> : null}
      </div>
    </section>
  );
}
