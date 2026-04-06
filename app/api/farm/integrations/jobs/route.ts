import { NextRequest, NextResponse } from 'next/server';
import { getFarmIntegrationContext } from '@/lib/integrations/auth';
import { listIntegrationJobCapabilities, runIntegrationJob } from '@/lib/integrations/import-export';
import { IntegrationJobRequest } from '@/lib/integrations/types';

export async function GET() {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ capabilities: listIntegrationJobCapabilities() });
}

export async function POST(request: NextRequest) {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await request.json()) as IntegrationJobRequest;
  if (!payload?.kind || !payload?.entity) {
    return NextResponse.json({ error: 'kind and entity are required' }, { status: 400 });
  }

  try {
    const result = await runIntegrationJob(ctx, payload);
    return NextResponse.json(result, { status: payload.kind === 'import' ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to run integration job' }, { status: 500 });
  }
}
