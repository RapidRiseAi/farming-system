import { NextRequest, NextResponse } from 'next/server';
import { getFarmIntegrationContext } from '@/lib/integrations/auth';
import { fetchIntegrationEvents } from '@/lib/integrations/events';

export async function GET(request: NextRequest) {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = request.nextUrl.searchParams.get('since') ?? undefined;
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '100') || 100;
  const mode = request.nextUrl.searchParams.get('mode') ?? 'poll';

  const events = await fetchIntegrationEvents(ctx, { since, limit });
  return NextResponse.json({
    mode,
    streamCursor: events[0]?.occurredAt ?? since ?? null,
    count: events.length,
    events
  });
}
