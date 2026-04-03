import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function FarmTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: task }, { data: updates }, { data: assignments }, { data: proofs }, { data: history }] = await Promise.all([
    supabase.from('farm_tasks').select('*').eq('id', id).eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase.from('farm_task_updates').select('*').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('farm_task_assignments').select('id,profiles!inner(full_name)').eq('task_id', id),
    supabase.from('farm_task_proofs').select('*').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('farm_entity_history').select('id,action,created_at').eq('entity_type', 'farm_task').eq('entity_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
  ]);

  if (!task) notFound();
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">{task.title}</h1>
      <Card className="p-4">Status: {task.status} • Priority: {task.priority}</Card>
      <Card className="p-4"><h2 className="font-semibold">Assignments</h2>{assignments?.map((a, i) => <p key={i} className="text-sm">{(a as { profiles?: { full_name?: string | null } }).profiles?.full_name || 'Unassigned'}</p>)}</Card>
      <Card className="p-4"><h2 className="font-semibold">Updates timeline</h2>{updates?.map((u) => <p key={u.id} className="text-sm">{new Date(u.created_at).toLocaleString()} — {u.message}</p>)}</Card>
      <Card className="p-4"><h2 className="font-semibold">Proof attachments</h2>{proofs?.map((p) => <p key={p.id} className="text-sm">{p.proof_type} • {p.note || p.storage_path || 'attachment'}</p>)}</Card>
      <Card className="p-4"><h2 className="font-semibold">History</h2>{history?.map((h) => <p key={h.id} className="text-sm">{h.action} @ {new Date(h.created_at).toLocaleString()}</p>)}</Card>
    </section>
  );
}
