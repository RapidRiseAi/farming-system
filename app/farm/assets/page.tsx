import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function FarmAssetsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const { data: assets } = await supabase
    .from('farm_assets')
    .select('id,name,asset_type,status,site_name,current_hours,current_odometer_km,updated_at')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-emerald-950">Asset control</h1>
      <p className="text-sm text-gray-600">Track fleet, equipment, buildings, and field infrastructure in one place.</p>

      <div className="grid gap-3">
        {(assets ?? []).map((asset) => (
          <Card key={asset.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-black">{asset.name}</p>
                <p className="text-xs text-gray-500">{asset.asset_type} • {asset.site_name || 'No site set'} • Status: {asset.status}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Hours: {asset.current_hours ?? '—'}</p>
                <p>Odometer: {asset.current_odometer_km ?? '—'} km</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!assets?.length ? <p className="text-sm text-gray-500">No assets created yet. Add records via SQL/admin tooling in this first migration.</p> : null}
    </section>
  );
}
