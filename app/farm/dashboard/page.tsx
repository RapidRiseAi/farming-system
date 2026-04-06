import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FarmDashboardView } from './_components/dashboard-view';
import { getFarmDashboardMetrics, roleToVariant } from './_components/metrics';

export default async function FarmDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id,role').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const metrics = await getFarmDashboardMetrics(profile.workshop_account_id);
  return <FarmDashboardView variant={roleToVariant(profile.role)} metrics={metrics} />;
}
