import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { completeFarmOnboarding, createFarmAsset, createFarmTask, createWorker } from '@/lib/actions/farm';

const FARM_ASSET_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'maintenance_due', label: 'Maintenance due' },
  { value: 'in_repair', label: 'In repair' },
  { value: 'retired', label: 'Retired' }
] as const;

export default async function FarmOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,workshop_account_id,full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: onboarding }, { data: teamProfiles }] = await Promise.all([
    supabase.from('farm_onboarding_progress').select('completed,sample_data_generated').eq('workshop_account_id', profile.workshop_account_id).maybeSingle(),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">Farm onboarding wizard</h1>
        <p className="text-sm text-gray-600">Complete these steps once so your dashboard is immediately usable by your team.</p>
      </div>

      {onboarding?.completed ? (
        <Card className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">Onboarding is already marked complete. You can still add more starter records below.</Card>
      ) : null}

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Step 1 — Farm profile basics</h2>
        <form action={completeFarmOnboarding} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="farmName" className="rounded-lg border px-3 py-2" placeholder="Farm account display name" required />
          <label className="flex items-center gap-2 text-sm">
            <input name="sampleData" type="checkbox" /> Generate quick sample data
          </label>
          <button className="sm:col-span-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Save basics + mark onboarding complete</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Step 2 — Add your first assets</h2>
        <form action={createFarmAsset} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input name="name" required className="rounded-lg border px-3 py-2" placeholder="Asset name" />
          <select name="assetType" className="rounded-lg border px-3 py-2">
            <option value="equipment">Equipment</option>
            <option value="vehicle">Vehicle</option>
            <option value="building">Building</option>
            <option value="irrigation">Irrigation</option>
            <option value="storage">Storage</option>
            <option value="other">Other</option>
          </select>
          <input name="siteName" className="rounded-lg border px-3 py-2" placeholder="Site" />
          <select name="status" className="rounded-lg border px-3 py-2">
            {FARM_ASSET_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <button className="sm:col-span-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-900">Add asset</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Step 3 — Add workforce members</h2>
        <form action={createWorker} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input name="fullName" required className="rounded-lg border px-3 py-2" placeholder="Full name" />
          <select name="workerType" className="rounded-lg border px-3 py-2">
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
          </select>
          <input type="date" name="startDate" className="rounded-lg border px-3 py-2" />
          <button className="sm:col-span-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-900">Add worker</button>
        </form>
      </Card>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Step 4 — Create first task</h2>
        <form action={createFarmTask} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="title" required className="rounded-lg border px-3 py-2" placeholder="Task title" />
          <input name="dueAt" type="datetime-local" className="rounded-lg border px-3 py-2" />
          <textarea name="description" className="sm:col-span-2 rounded-lg border px-3 py-2" placeholder="What should happen and how will it be verified?" />
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
            <select name="taskType" className="rounded-lg border px-3 py-2">
              <option value="general">General</option>
              <option value="maintenance">Maintenance</option>
              <option value="inspection">Inspection</option>
            </select>
            <select name="priority" className="rounded-lg border px-3 py-2">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="sm:col-span-2 grid gap-2">
            {teamProfiles?.map((team) => (
              <label key={team.id} className="text-sm text-gray-700">
                <input type="checkbox" name="assigneeIds" value={team.id} className="mr-2" />
                {team.full_name || 'Unnamed profile'}
              </label>
            ))}
          </div>
          <button className="sm:col-span-2 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-900">Create task</button>
        </form>
      </Card>
    </section>
  );
}
