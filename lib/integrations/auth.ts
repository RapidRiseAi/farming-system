import { createClient } from '@/lib/supabase/server';

export type FarmIntegrationContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  farmId: string;
};

export async function getFarmIntegrationContext(): Promise<FarmIntegrationContext | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id) return null;

  return {
    supabase,
    userId: user.id,
    farmId: profile.workshop_account_id
  };
}
