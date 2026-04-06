import { NextRequest, NextResponse } from 'next/server';
import { getFarmIntegrationContext } from '@/lib/integrations/auth';
import { listExportSchemas, SchemaEntity } from '@/lib/integrations/export-schemas';
import { IntegrationTarget } from '@/lib/integrations/types';

export async function GET(request: NextRequest) {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const target = request.nextUrl.searchParams.get('target') as IntegrationTarget | null;
  const entity = request.nextUrl.searchParams.get('entity') as SchemaEntity | null;

  return NextResponse.json({
    schemas: listExportSchemas(target ?? undefined, entity ?? undefined)
  });
}
