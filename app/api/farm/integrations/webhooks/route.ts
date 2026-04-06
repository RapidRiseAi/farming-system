import { NextRequest, NextResponse } from 'next/server';
import { getFarmIntegrationContext } from '@/lib/integrations/auth';

export async function GET() {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    webhook: {
      acceptedEvents: ['notification.*', 'task.*', 'incident.*', 'stock_request.*', 'document.*'],
      delivery: 'at_least_once',
      signatureHeader: 'x-farm-signature',
      retryPolicy: { maxAttempts: 8, initialDelaySeconds: 3, backoff: 'exponential' }
    }
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getFarmIntegrationContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const signature = request.headers.get('x-farm-signature');
  const payload = await request.json();

  return NextResponse.json({
    received: true,
    signaturePresent: Boolean(signature),
    receivedAt: new Date().toISOString(),
    payload
  });
}
