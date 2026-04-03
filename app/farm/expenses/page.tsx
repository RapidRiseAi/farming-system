import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { logFarmExpense, updateExpenseWorkflow } from '@/lib/actions/farm';

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export default async function FarmExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; page?: string; sort?: string }> }) {
  const params = await searchParams;
  const statusFilter = params.status ?? 'all';
  const categoryFilter = params.category ?? 'all';
  const page = Math.max(Number(params.page ?? '1') || 1, 1);
  const sort = params.sort ?? 'desc';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const query = supabase
    .from('expense_logs')
    .select('id,category,vendor_name,amount_cents,purchased_at,status,card_reference,receipt_storage_path,notes', { count: 'exact' })
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('purchased_at', { ascending: sort === 'asc' })
    .range((page - 1) * 10, page * 10 - 1);

  if (statusFilter !== 'all') query.eq('status', statusFilter);
  if (categoryFilter !== 'all') query.eq('category', categoryFilter);

  const { data: expenses, count } = await query;
  const totalPages = Math.max(Math.ceil((count ?? 0) / 10), 1);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Operational expense workflow</h1>
        <form action={logFarmExpense} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select name="category" className="rounded-lg border px-3 py-2"><option value="diesel">Diesel</option><option value="fuel">Fuel</option><option value="maintenance">Maintenance</option><option value="parts">Parts</option><option value="feed">Feed</option><option value="veterinary">Veterinary</option><option value="utilities">Utilities</option><option value="supplies">Supplies</option><option value="other">Other</option></select>
          <input name="amount" type="number" min="0" step="0.01" className="rounded-lg border px-3 py-2" placeholder="Amount" required />
          <input name="vendorName" className="rounded-lg border px-3 py-2" placeholder="Vendor" />
          <input name="cardReference" className="rounded-lg border px-3 py-2" placeholder="Card reference" />
          <input name="purchasedAt" type="datetime-local" className="rounded-lg border px-3 py-2" required />
          <input name="receiptStoragePath" className="rounded-lg border px-3 py-2" placeholder="Receipt storage path / URL" />
          <textarea name="notes" className="sm:col-span-2 min-h-20 rounded-lg border px-3 py-2" placeholder="Purchase notes" />
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Log expense</button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a className="rounded-full border px-3 py-1" href={`/farm/expenses?status=${statusFilter}&category=${categoryFilter}&sort=${sort === 'asc' ? 'desc' : 'asc'}`}>Sort {sort === 'asc' ? 'newest' : 'oldest'} first</a>
        <a className="rounded-full border px-3 py-1" href="/farm/expenses/export">Export CSV</a>
      </div>

      <div className="space-y-3">
        {(expenses ?? []).map((expense) => (
          <Card key={expense.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold capitalize text-black">{expense.category}</p>
                <p className="text-xs text-gray-500">{expense.vendor_name || 'No vendor'} • {new Date(expense.purchased_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-emerald-900">{money.format((expense.amount_cents ?? 0) / 100)}</p>
                <p className="text-xs uppercase text-gray-500">{expense.status}</p>
              </div>
            </div>
            <form action={updateExpenseWorkflow} className="mt-2 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="expenseId" value={expense.id} />
              <select defaultValue={expense.status} name="status" className="rounded border px-2 py-1 text-sm"><option value="submitted">Submitted</option><option value="reviewed">Reviewed</option><option value="exported">Exported</option></select>
              <input defaultValue={expense.vendor_name || ''} name="vendorName" className="rounded border px-2 py-1 text-sm" placeholder="Vendor" />
              <input defaultValue={expense.receipt_storage_path || ''} name="receiptStoragePath" className="rounded border px-2 py-1 text-sm" placeholder="Receipt path" />
              <textarea defaultValue={expense.notes || ''} name="notes" className="sm:col-span-3 rounded border px-2 py-1 text-sm" placeholder="Notes" />
              <button className="sm:col-span-3 rounded border px-2 py-1 text-sm">Update expense</button>
            </form>
          </Card>
        ))}
      </div>
      <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
    </section>
  );
}
