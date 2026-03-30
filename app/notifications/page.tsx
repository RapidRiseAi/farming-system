import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function NotificationsRedirectPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'customer') redirect('/farm/dashboard');
  redirect('/customer/notifications');
}
