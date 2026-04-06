import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/role-redirect';

export type FarmAccountId = string;
export type FarmProfileId = string;

export const FARM_PROFILES_TABLE = 'profiles';
export const FARM_ACCOUNTS_TABLE = 'workshop_accounts';
export const FARM_ACCOUNT_COLUMN = 'workshop_account_id';

export type ProfileAccountLookup = {
  farm_account_id?: string | null;
  workshop_account_id?: string | null;
};

export function getFarmAccountId(
  profile?: ProfileAccountLookup | null
): FarmAccountId | null {
  const id = profile?.farm_account_id ?? profile?.workshop_account_id ?? null;
  return id ? id : null;
}

export type AccountContext = {
  userId: string;
  role: UserRole;
  farmAccountId: FarmAccountId;
  workshopAccountId: FarmAccountId;
  customerAccountId: string | null;
};

export async function getAccountContext(): Promise<AccountContext | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from(FARM_PROFILES_TABLE)
    .select(
      `role,farm_account_id:${FARM_ACCOUNT_COLUMN},${FARM_ACCOUNT_COLUMN}`
    )
    .eq('id', user.id)
    .single();

  const farmAccountId = getFarmAccountId(profile);
  if (!farmAccountId || !profile?.role) return null;

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: profile.role as UserRole,
    farmAccountId,
    workshopAccountId: farmAccountId,
    customerAccountId: customerAccount?.id ?? null
  };
}
