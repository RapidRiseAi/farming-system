import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { logFarmExpense } from '@/lib/actions/farm';

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export default async function FarmExpensesPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const { data: expenses } = await supabase
    .from('expense_logs')
    .select('id,category,vendor_name,amount_cents,purchased_at,status,card_reference')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('purchased_at', { ascending: false })
    .limit(60);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Operational expense logging</h1>
        <p className="text-sm text-gray-600">Log purchases (diesel, parts, feed) for admin review and export to accounting tools.</p>
        <form action={logFarmExpense} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select name="category" className="rounded-lg border px-3 py-2">
            <option value="diesel">Diesel</option>
            <option value="fuel">Fuel</option>
            <option value="maintenance">Maintenance</option>
            <option value="parts">Parts</option>
            <option value="feed">Feed</option>
            <option value="veterinary">Veterinary</option>
            <option value="utilities">Utilities</option>
            <option value="supplies">Supplies</option>
            <option value="other">Other</option>
          </select>
          <input name="amount" type="number" min="0" step="0.01" className="rounded-lg border px-3 py-2" placeholder="Amount" required />
          <input name="vendorName" className="rounded-lg border px-3 py-2" placeholder="Vendor" />
          <input name="cardReference" className="rounded-lg border px-3 py-2" placeholder="Card reference (last 4 / auth code)" />
          <input name="purchasedAt" type="datetime-local" className="rounded-lg border px-3 py-2" required />
          <textarea name="notes" className="sm:col-span-2 min-h-20 rounded-lg border px-3 py-2" placeholder="What was purchased and why?" />
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Log expense</button>
        </form>
      </Card>

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
          </Card>
        ))}
        {!expenses?.length ? <p className="text-sm text-gray-500">No expenses logged yet.</p> : null}
      </div>
    </section>
  );
}
