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

    await admin.from('profiles').upsert(
      {
        id: data.user.id,
        role: 'owner',
        display_name: resolvedDisplayName
      },
      { onConflict: 'id' }
    );

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('workshop_account_id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!existingProfile?.workshop_account_id) {
      const { data: workshop, error: workshopError } = await admin
        .from('workshop_accounts')
        .insert({ name: farmName || `${resolvedDisplayName}'s Farm` })
        .select('id')
        .single();

      if (workshopError || !workshop) {
        redirect('/signup?error=Unable%20to%20create%20farm%20workspace.%20Please%20check%20server%20keys.');
      }

      await admin
        .from('profiles')
        .update({ workshop_account_id: workshop.id, role: 'owner' })
        .eq('id', data.user.id);
    }
  } catch {
    redirect('/signup?error=Unable%20to%20initialize%20farm%20workspace.%20Please%20check%20environment%20variables.');
  }

  const requiresEmailVerification = !data.session;
  redirect(`/login?created=1${requiresEmailVerification ? '&verify=1' : ''}`);
}
