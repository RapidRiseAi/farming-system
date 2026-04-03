import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function escapeCsv(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) return new NextResponse('Unauthorized', { status: 401 });

  const { data: expenses } = await supabase
    .from('expense_logs')
    .select('id,category,vendor_name,amount_cents,purchased_at,status')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('purchased_at', { ascending: false });

  const rows = [['id', 'category', 'vendor', 'amount_cents', 'purchased_at', 'status']];
  for (const expense of expenses ?? []) {
    rows.push([
      escapeCsv(expense.id),
      escapeCsv(expense.category),
      escapeCsv(expense.vendor_name || ''),
      String(expense.amount_cents ?? 0),
      escapeCsv(expense.purchased_at),
      escapeCsv(expense.status)
    ]);
  }

  return new NextResponse(rows.map((row) => row.join(',')).join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="farm-expenses.csv"'
    }
  });
}
