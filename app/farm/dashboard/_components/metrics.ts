import { createClient } from '@/lib/supabase/server';

export async function getFarmDashboardMetrics(farmId: string) {
  const supabase = await createClient();
  const [
    { count: openTasks },
    { count: openIncidents },
    { count: activeAssets },
    { data: latestExpenses },
    { count: openMaintTasks },
    { count: overdueTasks },
    { count: workerCount },
    { count: remindersOpen },
    { count: overdueIncidents },
    { count: expiringDocuments }
  ] = await Promise.all([
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']),
    supabase.from('farm_incidents').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['reported', 'under_response', 'contained', 'under_investigation']),
    supabase.from('farm_assets').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).neq('status', 'retired'),
    supabase.from('expense_logs').select('id,amount_cents').eq('workshop_account_id', farmId).order('purchased_at', { ascending: false }).limit(30),
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('task_type', 'maintenance').in('status', ['open', 'in_progress', 'blocked']),
    supabase.from('farm_tasks').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['open', 'in_progress', 'blocked']).lt('due_at', new Date().toISOString()),
    supabase.from('workforce_profiles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('active', true),
    supabase.from('farm_reminders').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('status', 'open'),
    supabase.from('farm_incidents').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).in('status', ['reported', 'under_response', 'contained', 'under_investigation']).lt('occurred_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabase.from('farm_documents').select('id', { count: 'exact', head: true }).eq('workshop_account_id', farmId).eq('status', 'active').gte('expiry_date', new Date().toISOString().slice(0, 10)).lte('expiry_date', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10))
  ]);

  return {
    openTasks: openTasks ?? 0,
    openIncidents: openIncidents ?? 0,
    activeAssets: activeAssets ?? 0,
    spend30dCents: (latestExpenses ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0),
    openMaintTasks: openMaintTasks ?? 0,
    overdueTasks: overdueTasks ?? 0,
    overdueIncidents: overdueIncidents ?? 0,
    activeReminders: remindersOpen ?? 0,
    expiringDocuments: expiringDocuments ?? 0,
    workerCount: workerCount ?? 0
  };
}

export function roleToVariant(role?: string | null) {
  if (role === 'owner') return 'owner' as const;
  if (role === 'technician') return 'workshop' as const;
  if (role === 'admin_clerk' || role === 'viewer') return 'compliance' as const;
  if (role === 'farm_manager' || role === 'supervisor' || role === 'admin') return 'farm-manager' as const;
  return 'production' as const;
}
