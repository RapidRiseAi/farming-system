import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FarmDashboardView, type DashboardVariant } from '../_components/dashboard-view';
import { getFarmDashboardMetrics } from '../_components/metrics';

const VARIANTS = new Set<DashboardVariant>(['owner', 'farm-manager', 'production', 'workshop', 'compliance']);

export default async function FarmDashboardVariantPage({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!VARIANTS.has(variant as DashboardVariant)) notFound();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const metrics = await getFarmDashboardMetrics(profile.workshop_account_id);

  return <FarmDashboardView variant={variant as DashboardVariant} metrics={metrics} />;
}
