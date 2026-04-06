import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ENTITY_TYPES = new Set(['assets', 'fields', 'herds', 'incidents', 'documents', 'visits']);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const rawTypes = request.nextUrl.searchParams.getAll('type');
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? '8') || 8, 1), 25);

  const types = rawTypes.length ? rawTypes.filter((type) => ENTITY_TYPES.has(type)) : Array.from(ENTITY_TYPES);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) {
    return NextResponse.json({ error: 'No farm account' }, { status: 403 });
  }

  if (!q || q.length < 2) {
    return NextResponse.json({ query: q, results: {}, total: 0 });
  }

  const farmId = profile.workshop_account_id;
  const likePattern = `%${q.replace(/[%_]/g, '')}%`;

  const [
    assetsRes,
    fieldsRes,
    herdsRes,
    incidentsRes,
    documentsRes,
    visitsRes
  ] = await Promise.all([
    types.includes('assets')
      ? supabase
          .from('farm_assets')
          .select('id,name,asset_code,asset_type,status,site_name')
          .eq('workshop_account_id', farmId)
          .or(`name.ilike.${likePattern},asset_code.ilike.${likePattern},site_name.ilike.${likePattern}`)
          .order('updated_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
    types.includes('fields')
      ? supabase
          .from('crop_fields')
          .select('id,name,field_code,status,soil_type')
          .eq('workshop_account_id', farmId)
          .or(`name.ilike.${likePattern},field_code.ilike.${likePattern},soil_type.ilike.${likePattern}`)
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
    types.includes('herds')
      ? supabase
          .from('livestock_herds')
          .select('id,name,herd_code,species,active_count')
          .eq('workshop_account_id', farmId)
          .or(`name.ilike.${likePattern},herd_code.ilike.${likePattern},species.ilike.${likePattern}`)
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
    types.includes('incidents')
      ? supabase
          .from('farm_incidents')
          .select('id,incident_number,title,incident_class,incident_type,severity,status,occurred_at')
          .eq('workshop_account_id', farmId)
          .or(`title.ilike.${likePattern},incident_number.ilike.${likePattern},incident_type.ilike.${likePattern},incident_class.ilike.${likePattern}`)
          .order('occurred_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
    types.includes('documents')
      ? supabase
          .from('farm_documents')
          .select('id,document_number,title,document_type,status,expiry_date')
          .eq('workshop_account_id', farmId)
          .or(`title.ilike.${likePattern},document_number.ilike.${likePattern},document_type.ilike.${likePattern}`)
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
    types.includes('visits')
      ? supabase
          .from('farm_visits')
          .select('id,visitor_name,visitor_type,visitor_org,purpose,checked_in_at,checked_out_at')
          .eq('workshop_account_id', farmId)
          .or(`visitor_name.ilike.${likePattern},visitor_org.ilike.${likePattern},purpose.ilike.${likePattern}`)
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] })
  ]);

  const results = {
    assets: (assetsRes.data ?? []).map((row) => ({ ...row, href: `/farm/assets/${row.id}` })),
    fields: (fieldsRes.data ?? []).map((row) => ({ ...row, href: '/farm/crops' })),
    herds: (herdsRes.data ?? []).map((row) => ({ ...row, href: '/farm/livestock' })),
    incidents: (incidentsRes.data ?? []).map((row) => ({ ...row, href: '/farm/incidents' })),
    documents: (documentsRes.data ?? []).map((row) => ({ ...row, href: `/farm/documents/${row.id}` })),
    visits: (visitsRes.data ?? []).map((row) => ({ ...row, href: '/farm/visitors' }))
  };

  const total = Object.values(results).reduce((sum, bucket) => sum + bucket.length, 0);

  return NextResponse.json({ query: q, total, results });
}
