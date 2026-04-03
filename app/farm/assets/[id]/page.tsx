import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function FarmAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: asset }, { data: history }] = await Promise.all([
    supabase.from('farm_assets').select('*').eq('id', id).eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase.from('farm_entity_history').select('id,action,payload,created_at').eq('entity_type', 'farm_asset').eq('entity_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
  ]);
  if (!asset) notFound();

  return <section className="space-y-4"><h1 className="text-xl font-semibold">{asset.name}</h1><Card className="p-4">Status: {asset.status} • Type: {asset.asset_type}</Card><Card className="p-4"><h2 className="font-semibold">History</h2>{history?.map((e) => <p key={e.id} className="text-sm">{new Date(e.created_at).toLocaleString()} — {e.action}</p>)}</Card></section>;
}
