import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export default async function FarmDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id,role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id) redirect('/login');

  const farmId = profile.workshop_account_id;

  const [
    { count: openTasks },
    { count: openIncidents },
    { count: activeAssets },
    { data: latestExpenses },
    { count: openMaintTasks },
    { count: overdueTasks }
  ] = await Promise.all([
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']),
    supabase.from('farm_incidents').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'investigating']),
    supabase.from('farm_assets').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).neq('status', 'retired'),
    supabase.from('expense_logs').select('id,amount_cents').eq('workshop_account_id', farmId).order('purchased_at', { ascending: false }).limit(30),
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('task_type', 'maintenance').in('status', ['open', 'in_progress', 'blocked']),
    supabase
      .from('farm_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', farmId)
      .in('status', ['open', 'in_progress', 'blocked'])
      .lt('due_at', new Date().toISOString())
  ]);

  const spend30dCents = (latestExpenses ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">Farm dashboard</h1>
        <p className="text-sm text-gray-600">Central command center for tasks, incidents, assets, workforce, and financial logging.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Open tasks</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{openTasks ?? 0}</p>
          <p className="text-xs text-gray-500">Includes blocked + in-progress work.</p>
        </Card>

        <Card className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700">Open incidents</p>
          <p className="mt-2 text-3xl font-bold text-amber-950">{openIncidents ?? 0}</p>
          <p className="text-xs text-gray-500">Safety, equipment, and biosecurity reports.</p>
        </Card>

        <Card className="rounded-2xl border border-sky-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-sky-700">Active assets</p>
          <p className="mt-2 text-3xl font-bold text-sky-950">{activeAssets ?? 0}</p>
          <p className="text-xs text-gray-500">Fleet, machinery, buildings, and irrigation.</p>
        </Card>

        <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-700">30-day logged spend</p>
          <p className="mt-2 text-2xl font-bold text-emerald-950">{currency.format(spend30dCents / 100)}</p>
          <p className="text-xs text-gray-500">Operational feed for external accounting.</p>
        </Card>

        <Card className="rounded-2xl border border-violet-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-violet-700">Open maintenance tasks</p>
          <p className="mt-2 text-3xl font-bold text-violet-950">{openMaintTasks ?? 0}</p>
          <p className="text-xs text-gray-500">Preventive + corrective work queue.</p>
        </Card>

        <Card className="rounded-2xl border border-rose-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-rose-700">Overdue tasks</p>
          <p className="mt-2 text-3xl font-bold text-rose-950">{overdueTasks ?? 0}</p>
          <p className="text-xs text-gray-500">Tasks past due date still not complete.</p>
        </Card>
      </div>
    </section>
  );
}
