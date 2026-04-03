import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const FARM_ROLES = new Set([
  'admin',
  'technician',
  'owner',
  'farm_manager',
  'supervisor',
  'operator',
  'admin_clerk',
  'contractor',
  'viewer'
]);

function slugifyFarmName(input: string) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  const fallback = base || 'farm';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${fallback}-${suffix}`;
}

async function upsertProfileWithRoleFallback(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  displayName: string,
  requestedRole: string
) {
  const roleCandidates =
    requestedRole === 'customer'
      ? ['customer']
      : requestedRole === 'owner'
        ? ['owner', 'admin']
        : [requestedRole, 'owner', 'admin'];

  let lastErrorMessage = 'Unable to upsert profile.';

  for (const role of roleCandidates) {
    const { error } = await admin.from('profiles').upsert(
      {
        id: userId,
        role,
        display_name: displayName
      },
      { onConflict: 'id' }
    );

    if (!error) {
      return { role };
    }

    lastErrorMessage = error.message;
    const normalized = error.message.toLowerCase();
    const isEnumMismatch =
      normalized.includes('invalid input value for enum') && normalized.includes('user_role');

    if (!isEnumMismatch) {
      break;
    }
  }

  throw new Error(lastErrorMessage);
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const displayName =
    (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
    user.email?.split('@')[0] ||
    'User';

  const explicitRequestedRole =
    typeof user.user_metadata?.requested_role === 'string' ? user.user_metadata.requested_role.toLowerCase() : null;
  const looksLikeFarmSignup =
    typeof user.user_metadata?.farm_name === 'string' ||
    typeof user.user_metadata?.selected_plan === 'string';
  const requestedRoleRaw = explicitRequestedRole ?? (looksLikeFarmSignup ? 'owner' : 'customer');
  const requestedRole = FARM_ROLES.has(requestedRoleRaw) ? requestedRoleRaw : 'customer';

  let profileRole = requestedRole;
  try {
    const result = await upsertProfileWithRoleFallback(admin, user.id, displayName, requestedRole);
    profileRole = result.role;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to upsert profile.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (profileRole !== 'customer') {
    const { data: profile, error: profileReadError } = await admin
      .from('profiles')
      .select('workshop_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileReadError) {
      return NextResponse.json({ error: profileReadError.message }, { status: 500 });
    }

    if (!profile?.workshop_account_id) {
      const farmName =
        (typeof user.user_metadata?.farm_name === 'string' && user.user_metadata.farm_name.trim()) || `${displayName}'s Farm`;
      const slug = slugifyFarmName(farmName);

      const { data: workshop, error: workshopError } = await admin
        .from('workshop_accounts')
        .insert({ name: farmName, slug })
        .select('id')
        .single();

      if (workshopError || !workshop) {
        return NextResponse.json({ error: workshopError?.message ?? 'Unable to create farm workspace' }, { status: 500 });
      }

      const { error: updateError } = await admin
        .from('profiles')
        .update({ workshop_account_id: workshop.id })
        .eq('id', user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
