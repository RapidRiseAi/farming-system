import Link from 'next/link';
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
    { count: overdueTasks },
    { count: workerCount },
    { data: onboarding }
  ] = await Promise.all([
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']),
    supabase.from('farm_incidents').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'investigating']),
    supabase.from('farm_assets').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).neq('status', 'retired'),
    supabase.from('expense_logs').select('id,amount_cents').eq('workshop_account_id', farmId).order('purchased_at', { ascending: false }).limit(30),
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('task_type', 'maintenance').in('status', ['open', 'in_progress', 'blocked']),
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']).lt('due_at', new Date().toISOString()),
    supabase.from('workforce_profiles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('active', true),
    supabase.from('farm_onboarding_progress').select('completed').eq('workshop_account_id', farmId).maybeSingle()
  ]);

  const hasCoreData = (activeAssets ?? 0) > 0 || (openTasks ?? 0) > 0 || (workerCount ?? 0) > 0 || (openIncidents ?? 0) > 0;
  if (!onboarding?.completed && !hasCoreData) {
    redirect('/farm/onboarding');
  }

  const spend30dCents = (latestExpenses ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-950">Farm dashboard</h1>
          <p className="text-sm text-gray-600">Central command center for tasks, incidents, assets, workforce, crops, livestock, and financial logging.</p>
        </div>
        <Link className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900" href="/farm/onboarding">
          Re-open onboarding checklist
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Open tasks', openTasks ?? 0, 'text-emerald-700'],
          ['Open incidents', openIncidents ?? 0, 'text-amber-700'],
          ['Active assets', activeAssets ?? 0, 'text-sky-700'],
          ['Active workforce', workerCount ?? 0, 'text-violet-700'],
          ['Open maintenance', openMaintTasks ?? 0, 'text-indigo-700'],
          ['Overdue tasks', overdueTasks ?? 0, 'text-rose-700']
        ].map(([label, value, color]) => (
          <Card key={String(label)} className="rounded-2xl border bg-white p-4">
            <p className={`text-xs uppercase tracking-wide ${color}`}>{label}</p>
            <p className="mt-2 text-3xl font-bold text-emerald-950">{value}</p>
          </Card>
        ))}

        <Card className="rounded-2xl border border-emerald-200 bg-white p-4 sm:col-span-2 lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-emerald-700">30-day logged spend</p>
          <p className="mt-2 text-2xl font-bold text-emerald-950">{currency.format(spend30dCents / 100)}</p>
          <p className="text-xs text-gray-500">Operational feed for accounting and procurement reporting.</p>
        </Card>
      </div>
    </section>
  );
}
