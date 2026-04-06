import { NextRequest, NextResponse } from 'next/server';
import { getFarmIntegrationContext } from '@/lib/integrations/auth';
import { listGeoEndpoints, OPTIONAL_MAPPING_FIELDS } from '@/lib/integrations/geo';

export async function GET(request: NextRequest) {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entity = (request.nextUrl.searchParams.get('entity') as 'site' | 'area' | 'all' | null) ?? 'all';
  const includeMapping = request.nextUrl.searchParams.get('includeMapping') === 'true';

  const endpoints = await listGeoEndpoints(ctx, { entity, includeMapping });
  return NextResponse.json({
    entity,
    includeMapping,
    mappingFields: OPTIONAL_MAPPING_FIELDS,
    count: endpoints.length,
    endpoints
  });
}
