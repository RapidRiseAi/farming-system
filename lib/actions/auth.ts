'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function resolveAppUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;

  return 'http://localhost:3000';
}

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

async function upsertProfileWithFallbackRole(admin: ReturnType<typeof createAdminClient>, userId: string, displayName: string) {
  const ownerResult = await admin.from('profiles').upsert(
    {
      id: userId,
      role: 'owner',
      display_name: displayName
    },
    { onConflict: 'id' }
  );

  if (!ownerResult.error) return { role: 'owner' as const };

  const fallbackResult = await admin.from('profiles').upsert(
    {
      id: userId,
      role: 'admin',
      display_name: displayName
    },
    { onConflict: 'id' }
  );

  if (fallbackResult.error) {
    throw new Error(fallbackResult.error.message);
  }

  return { role: 'admin' as const };
}

export async function signupCustomerAction(formData: FormData) {
  const email = formData.get('email')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  const displayName = formData.get('displayName')?.toString().trim() ?? '';
  const farmName = formData.get('farmName')?.toString().trim() ?? '';
  const plan = formData.get('plan')?.toString() ?? 'basic';

  const tier = plan === 'pro' || plan === 'business' ? plan : 'basic';

  if (!email || !password) {
    redirect('/signup?error=Email%20and%20password%20are%20required');
  }

  const supabase = await createClient();
  const appUrl = await resolveAppUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/login`,
      data: {
        display_name: displayName,
        farm_name: farmName,
        selected_plan: tier,
        requested_role: 'owner'
      }
    }
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user) {
    redirect('/signup?error=Signup%20failed.%20Please%20try%20again.');
  }

  try {
    const admin = createAdminClient();
    const resolvedDisplayName = displayName || email.split('@')[0] || 'Farm Owner';

    const profileRole = await upsertProfileWithFallbackRole(admin, data.user.id, resolvedDisplayName);

    const { data: existingProfile, error: existingProfileError } = await admin
      .from('profiles')
      .select('workshop_account_id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (existingProfileError) {
      throw new Error(existingProfileError.message);
    }

    if (!existingProfile?.workshop_account_id) {
      const farmTitle = farmName || `${resolvedDisplayName}'s Farm`;
      const slug = slugifyFarmName(farmTitle);

      const { data: workshop, error: workshopError } = await admin
        .from('workshop_accounts')
        .insert({ name: farmTitle, slug })
        .select('id')
        .single();

      if (workshopError || !workshop) {
        throw new Error(workshopError?.message ?? 'Unable to create workshop account.');
      }

      const { error: profileUpdateError } = await admin
        .from('profiles')
        .update({ workshop_account_id: workshop.id, role: profileRole.role })
        .eq('id', data.user.id);

      if (profileUpdateError) {
        throw new Error(profileUpdateError.message);
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown signup initialization error';
    const normalized = errorMessage.toLowerCase();

    if (
      normalized.includes("could not find the table 'public.profiles'") ||
      normalized.includes('relation "profiles" does not exist') ||
      normalized.includes("could not find the table 'public.workshop_accounts'") ||
      normalized.includes('relation "workshop_accounts" does not exist')
    ) {
      redirect(
        '/signup?error=Database%20is%20missing%20required%20tables%20(profiles/workshop_accounts).%20Apply%20all%20Supabase%20migrations%20to%20the%20same%20project%20used%20by%20your%20URL%20and%20keys.'
      );
    }

    redirect(`/signup?error=${encodeURIComponent(`Unable to initialize farm workspace: ${errorMessage}`)}`);
  }

  const requiresEmailVerification = !data.session;
  redirect(`/login?created=1${requiresEmailVerification ? '&verify=1' : ''}`);
}
