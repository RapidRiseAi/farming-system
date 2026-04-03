import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function FarmWorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: worker }, { data: entries }] = await Promise.all([
    supabase.from('workforce_profiles').select('*').eq('id', id).eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase.from('workforce_time_entries').select('*').eq('workforce_profile_id', id).eq('workshop_account_id', profile.workshop_account_id).order('clock_in_at', { ascending: false }).limit(50)
  ]);

  if (!worker) notFound();
  const totalHours = (entries ?? []).reduce((sum, entry) => {
    const end = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : Date.now();
    const start = new Date(entry.clock_in_at).getTime();
    return sum + Math.max((end - start) / 3_600_000 - (entry.break_minutes ?? 0) / 60, 0);
  }, 0);

  return <section className="space-y-4"><h1 className="text-xl font-semibold">{worker.full_name}</h1><Card className="p-4">{worker.worker_type} • {worker.active ? 'Active' : 'Inactive'} • {totalHours.toFixed(1)} tracked hours</Card></section>;
}
