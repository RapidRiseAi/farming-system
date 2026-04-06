import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { addTaskProof, createFarmTask, transitionFarmTask } from '@/lib/actions/farm';
import { TaskUpdateComposer } from '@/components/farm/task-update-composer';

const TASK_TEMPLATES: Record<string, { title: string; taskType: string; priority: string; description: string }> = {
  inspection: {
    title: 'Daily safety inspection',
    taskType: 'inspection',
    priority: 'high',
    description: 'Inspect PPE, emergency stations, and hazard controls.'
  },
  service: {
    title: 'Scheduled asset service',
    taskType: 'maintenance',
    priority: 'normal',
    description: 'Complete service checklist and attach proof.'
  }
};

function isOverdue(task: { due_at: string | null; status: string }) {
  return Boolean(task.due_at && ['open', 'in_progress', 'blocked'].includes(task.status) && new Date(task.due_at).getTime() < Date.now());
}

export default async function FarmTasksPage({ searchParams }: { searchParams: Promise<{ filter?: string; template?: string }> }) {
  const params = await searchParams;
  const filter = params.filter ?? 'all';
  const template = TASK_TEMPLATES[params.template ?? ''] ?? TASK_TEMPLATES.inspection;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,workshop_account_id,role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: tasks }, { data: updates }, { data: assignments }, { data: taskProofs }, { data: teamProfiles }] = await Promise.all([
    supabase
      .from('farm_tasks')
      .select('id,title,description,task_type,status,priority,due_at,created_at')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.from('farm_task_updates').select('id,task_id,message,created_at').order('created_at', { ascending: false }).limit(300),
    supabase
      .from('farm_task_assignments')
      .select('id,task_id,profile_id,profiles!inner(full_name)')
      .order('created_at', { ascending: false }),
    supabase.from('farm_task_proofs').select('id,task_id,proof_type,note,storage_path,created_at').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
  ]);

  const assignmentByTask = new Map<string, string[]>();
  for (const row of assignments ?? []) {
    const bucket = assignmentByTask.get(row.task_id) ?? [];
    const name = (row as { profiles?: { full_name?: string | null } }).profiles?.full_name ?? 'Unassigned';
    bucket.push(name);
    assignmentByTask.set(row.task_id, bucket);
  }

  const updatesByTask = new Map<string, Array<{ id: string; message: string; created_at: string }>>();
  for (const update of updates ?? []) {
    const bucket = updatesByTask.get(update.task_id) ?? [];
    bucket.push(update);
    updatesByTask.set(update.task_id, bucket);
  }

  const proofsByTask = new Map<string, Array<{ id: string; proof_type: string; note: string | null; storage_path: string | null }>>();
  for (const proof of taskProofs ?? []) {
    const bucket = proofsByTask.get(proof.task_id) ?? [];
    bucket.push(proof);
    proofsByTask.set(proof.task_id, bucket);
  }

  const filteredTasks = (tasks ?? []).filter((task) => {
    if (filter === 'overdue') return isOverdue(task);
    if (filter === 'open') return ['open', 'in_progress', 'blocked'].includes(task.status);
    if (filter === 'done') return ['done', 'verified'].includes(task.status);
    return true;
  });

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Create farm task</h1>
        <form action={createFarmTask} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="title" defaultValue={template.title} placeholder="Task title" className="rounded-lg border px-3 py-2" required />
          <input name="dueAt" type="datetime-local" className="rounded-lg border px-3 py-2" />
          <select name="taskType" defaultValue={template.taskType} className="rounded-lg border px-3 py-2">
            <option value="general">General</option>
            <option value="maintenance">Maintenance</option>
            <option value="inspection">Inspection</option>
            <option value="crop">Crop</option>
            <option value="livestock">Livestock</option>
          </select>
          <select name="priority" defaultValue={template.priority} className="rounded-lg border px-3 py-2">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <textarea name="description" defaultValue={template.description} placeholder="Instructions + completion definition..." className="sm:col-span-2 min-h-24 rounded-lg border px-3 py-2" />
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
            {teamProfiles?.map((member) => (
              <label key={member.id} className="text-sm text-gray-700">
                <input type="checkbox" name="assigneeIds" value={member.id} className="mr-2" />
                {member.full_name || 'Unnamed'}
              </label>
            ))}
          </div>
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Create task</button>
        </form>
      </Card>

      <div className="flex gap-2 text-sm">
        {['all', 'open', 'overdue', 'done'].map((item) => (
          <Link key={item} href={`/farm/tasks?filter=${item}`} className={`rounded-full border px-3 py-1 ${filter === item ? 'border-emerald-700 bg-emerald-100 text-emerald-900' : 'border-gray-300 text-gray-700'}`}>
            {item}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {filteredTasks.map((task) => (
          <Card key={task.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-black">{task.title}</h2>
              <div className="flex items-center gap-2">
                {isOverdue(task) ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">Overdue</span> : null}
                <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">{task.status.replaceAll('_', ' ')}</span>
                <Link href={`/farm/tasks/${task.id}`} className="text-xs text-emerald-700 underline">Details</Link>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">Type: {task.task_type} • Priority: {task.priority} • Due: {task.due_at ? new Date(task.due_at).toLocaleString() : 'n/a'}</p>
            <p className="mt-2 text-sm text-gray-700">{task.description || 'No detail provided.'}</p>

            <p className="mt-2 text-xs text-gray-600">Assigned: {(assignmentByTask.get(task.id) ?? []).join(', ') || 'No assignments'}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {['in_progress', 'blocked', 'done', 'verified', 'cancelled'].map((status) => (
                <form key={status} action={transitionFarmTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="nextStatus" value={status} />
                  <button className="rounded-lg border px-2 py-1 text-xs">{status.replaceAll('_', ' ')}</button>
                </form>
              ))}
            </div>

            <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</p>
              {(updatesByTask.get(task.id) ?? []).slice(0, 4).map((update) => (
                <p key={update.id} className="text-sm text-gray-700">• {update.message}</p>
              ))}
              {!(updatesByTask.get(task.id) ?? []).length ? <p className="text-sm text-gray-500">No updates yet.</p> : null}
            </div>

            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Proof attachments</p>
              {(proofsByTask.get(task.id) ?? []).slice(0, 3).map((proof) => (
                <p className="text-xs text-gray-600" key={proof.id}>{proof.proof_type} • {proof.note || proof.storage_path || 'attachment'}</p>
              ))}
            </div>

            <TaskUpdateComposer taskId={task.id} />

            <form action={addTaskProof} className="mt-2 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="taskId" value={task.id} />
              <select name="proofType" className="rounded-lg border px-2 py-2 text-sm"><option value="image">Image</option><option value="video">Video</option><option value="document">Document</option><option value="text">Text</option></select>
              <select name="quality" className="rounded-lg border px-2 py-2 text-sm"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
              <input name="storagePath" placeholder="Storage path / URL" className="rounded-lg border px-2 py-2 text-sm" />
              <input name="note" placeholder="Proof note" className="rounded-lg border px-2 py-2 text-sm" />
              <button className="sm:col-span-4 rounded-lg border border-indigo-300 px-3 py-2 text-sm">Add proof</button>
            </form>
          </Card>
        ))}
        {!filteredTasks.length ? <p className="text-sm text-gray-500">No tasks for selected filter.</p> : null}
      </div>
    </section>
  );
}
