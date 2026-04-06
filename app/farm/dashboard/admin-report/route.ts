import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id) {
    return NextResponse.json({ error: 'No farm account' }, { status: 403 });
  }

  await supabase.rpc('refresh_farm_dashboard_analytics_mv', {
    p_workshop_account_id: profile.workshop_account_id
  });

  const report = await supabase.rpc('get_farm_dashboard_admin_report', {
    p_workshop_account_id: profile.workshop_account_id
  });

  if (report.error) {
    return NextResponse.json({ error: report.error.message }, { status: 500 });
  }

  return NextResponse.json(report.data ?? {});
}
