'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const FARM_STAFF_ROLES = new Set([
  'admin',
  'technician',
  'owner',
  'farm_manager',
  'supervisor',
  'operator',
  'admin_clerk',
  'contractor',
  'viewer'
]);

const MANAGER_ROLES = new Set(['owner', 'farm_manager', 'supervisor', 'admin']);

const TASK_TRANSITIONS: Record<string, Set<string>> = {
  open: new Set(['in_progress', 'blocked', 'cancelled']),
  in_progress: new Set(['blocked', 'done', 'cancelled']),
  blocked: new Set(['in_progress', 'cancelled']),
  done: new Set(['verified']),
  verified: new Set(),
  cancelled: new Set()
};

async function getFarmContext() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id,full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || !FARM_STAFF_ROLES.has(profile.role)) {
    return null;
  }

  return { supabase, profile };
}

function parseMoneyToCents(value: string): number {
  const normalized = Number(value.replace(/,/g, '.'));
  if (!Number.isFinite(normalized) || normalized < 0) return 0;
  return Math.round(normalized * 100);
}

function toNullable(value: FormDataEntryValue | null): string | null {
  const input = String(value ?? '').trim();
  return input ? input : null;
}

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  const input = String(value ?? '').trim();
  if (!input) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeNextServiceDueAt(baseDateIso: string, intervalType: string, intervalValue: number): string {
  const baseDate = new Date(baseDateIso);
  if (!Number.isFinite(baseDate.getTime())) {
    return new Date().toISOString();
  }

  if (intervalType === 'days') {
    baseDate.setDate(baseDate.getDate() + Math.max(intervalValue, 1));
    return baseDate.toISOString();
  }

  // For meter-based intervals we still keep a calendar reminder fallback.
  baseDate.setDate(baseDate.getDate() + 30);
  return baseDate.toISOString();
}

function deriveServiceDue(args: {
  intervalType: string;
  intervalValue: number;
  nextServiceDueAt: string | null;
  currentHours: number | null;
  currentOdometerKm: number | null;
  lastServiceMeter: number | null;
}) {
  const { intervalType, intervalValue, nextServiceDueAt, currentHours, currentOdometerKm, lastServiceMeter } = args;
  if (intervalType === 'days') {
    if (!nextServiceDueAt) return false;
    return new Date(nextServiceDueAt).getTime() <= Date.now();
  }

  const baseMeter = Number(lastServiceMeter ?? 0);
  const threshold = Math.max(Number(intervalValue || 0), 1);
  if (intervalType === 'hours') {
    return (Number(currentHours ?? 0) - baseMeter) >= threshold;
  }
  if (intervalType === 'odometer_km') {
    return (Number(currentOdometerKm ?? 0) - baseMeter) >= threshold;
  }
  return false;
}

async function validateAssignedProfile(ctx: NonNullable<Awaited<ReturnType<typeof getFarmContext>>>, assignedProfileId: string | null) {
  if (!assignedProfileId) return null;
  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('id', assignedProfileId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();
  return profile?.id ?? null;
}

async function addHistory(ctx: NonNullable<Awaited<ReturnType<typeof getFarmContext>>>, entityType: string, entityId: string, action: string, payload: Record<string, unknown>) {
  await ctx.supabase.from('farm_entity_history').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    entity_type: entityType,
    entity_id: entityId,
    action,
    actor_profile_id: ctx.profile.id,
    payload
  });
}

function isManager(role: string) {
  return MANAGER_ROLES.has(role);
}

export async function completeFarmOnboarding(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;

  const farmName = toNullable(formData.get('farmName'));
  const sampleData = String(formData.get('sampleData') ?? '') === 'on';

  if (farmName) {
    await ctx.supabase.from('workshop_accounts').update({ name: farmName }).eq('id', ctx.profile.workshop_account_id);
  }

  if (sampleData) {
    await ctx.supabase.from('farm_assets').insert([
      { workshop_account_id: ctx.profile.workshop_account_id, name: 'North Pivot Irrigation', asset_type: 'irrigation', status: 'operational', site_name: 'North Field', created_by: ctx.profile.id },
      { workshop_account_id: ctx.profile.workshop_account_id, name: 'Tractor A1', asset_type: 'equipment', status: 'operational', site_name: 'Main Yard', current_hours: 12, created_by: ctx.profile.id }
    ]);

    const { data: sampleTask } = await ctx.supabase
      .from('farm_tasks')
      .insert({
        workshop_account_id: ctx.profile.workshop_account_id,
        title: 'Complete first-week safety walkthrough',
        description: 'Walk every active area and confirm PPE, signage, and emergency contacts are available.',
        task_type: 'inspection',
        priority: 'normal',
        status: 'open',
        created_by: ctx.profile.id
      })
      .select('id')
      .single();

    if (sampleTask?.id) {
      await addHistory(ctx, 'farm_task', sampleTask.id, 'created', { seeded: true });
    }
  }

  await ctx.supabase
    .from('farm_onboarding_progress')
    .upsert({
      workshop_account_id: ctx.profile.workshop_account_id,
      completed: true,
      completed_at: new Date().toISOString(),
      completed_by: ctx.profile.id,
      sample_data_generated: sampleData
    }, { onConflict: 'workshop_account_id' });

  revalidatePath('/farm/dashboard');
  revalidatePath('/farm/onboarding');
}

export async function createFarmAsset(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;

  const name = String(formData.get('name') ?? '').trim();
  const assetType = String(formData.get('assetType') ?? 'equipment').trim();
  if (!name) return;

  const assignedProfileId = await validateAssignedProfile(ctx, toNullable(formData.get('assignedProfileId')));
  const serviceIntervalType = String(formData.get('serviceIntervalType') ?? 'days');
  const serviceIntervalValue = Math.max(1, Number(String(formData.get('serviceIntervalValue') ?? '').trim() || '30'));
  const nextDueAt = toNullable(formData.get('nextServiceDueAt')) ?? computeNextServiceDueAt(new Date().toISOString(), serviceIntervalType, serviceIntervalValue);

  const { data } = await ctx.supabase.from('farm_assets').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    name,
    asset_code: String(formData.get('assetCode') ?? '').trim() || `AST-${Date.now().toString().slice(-6)}`,
    qr_token: String(formData.get('qrToken') ?? '').trim() || crypto.randomUUID().replace(/-/g, ''),
    asset_type: assetType,
    status: String(formData.get('status') ?? 'operational'),
    make: String(formData.get('make') ?? '').trim() || 'Unknown',
    model: String(formData.get('model') ?? '').trim() || 'Unknown',
    serial_number: String(formData.get('serialNumber') ?? '').trim() || 'Unknown',
    registration: String(formData.get('registration') ?? '').trim() || 'N/A',
    assigned_profile_id: assignedProfileId,
    service_interval_type: serviceIntervalType,
    service_interval_value: serviceIntervalValue,
    last_service_meter: Number(String(formData.get('lastServiceMeter') ?? '').trim() || '0'),
    next_service_due_at: nextDueAt,
    criticality: String(formData.get('criticality') ?? 'medium'),
    site_name: toNullable(formData.get('siteName')),
    current_hours: Number(String(formData.get('currentHours') ?? '').trim() || '0') || null,
    current_odometer_km: Number(String(formData.get('currentOdometerKm') ?? '').trim() || '0') || null,
    notes: toNullable(formData.get('notes')),
    created_by: ctx.profile.id
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'farm_asset', data.id, 'created', { name, asset_type: assetType });
  revalidatePath('/farm/assets');
  revalidatePath('/farm/dashboard');
}

export async function updateFarmAsset(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;

  const assetId = String(formData.get('assetId') ?? '').trim();
  if (!assetId) return;
  const status = String(formData.get('status') ?? 'operational');
  const assignedProfileId = await validateAssignedProfile(ctx, toNullable(formData.get('assignedProfileId')));
  await ctx.supabase.from('farm_assets').update({
    name: String(formData.get('name') ?? '').trim() || undefined,
    asset_code: String(formData.get('assetCode') ?? '').trim() || undefined,
    status,
    make: String(formData.get('make') ?? '').trim() || undefined,
    model: String(formData.get('model') ?? '').trim() || undefined,
    serial_number: String(formData.get('serialNumber') ?? '').trim() || undefined,
    registration: String(formData.get('registration') ?? '').trim() || undefined,
    assigned_profile_id: assignedProfileId,
    service_interval_type: String(formData.get('serviceIntervalType') ?? '').trim() || undefined,
    service_interval_value: toNumberOrNull(formData.get('serviceIntervalValue')) ?? undefined,
    last_service_meter: toNumberOrNull(formData.get('lastServiceMeter')) ?? undefined,
    next_service_due_at: toNullable(formData.get('nextServiceDueAt')) ?? undefined,
    criticality: String(formData.get('criticality') ?? '').trim() || undefined,
    site_name: toNullable(formData.get('siteName')),
    notes: toNullable(formData.get('notes')),
    current_hours: Number(String(formData.get('currentHours') ?? '').trim() || '0') || null,
    current_odometer_km: Number(String(formData.get('currentOdometerKm') ?? '').trim() || '0') || null,
    retired_at: status === 'retired' ? new Date().toISOString() : null
  }).eq('id', assetId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, status === 'retired' ? 'archived' : 'updated', { status });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function quickUpdateAssetMeter(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const assetId = String(formData.get('assetId') ?? '').trim();
  const meterType = String(formData.get('meterType') ?? 'hours').trim();
  const reading = toNumberOrNull(formData.get('reading'));
  if (!assetId || reading === null) return;

  const patch = meterType === 'odometer'
    ? { current_odometer_km: Math.max(0, Math.round(reading)) }
    : { current_hours: Math.max(0, reading) };

  const { data: asset } = await ctx.supabase
    .from('farm_assets')
    .select('service_interval_type,service_interval_value,next_service_due_at,current_hours,current_odometer_km,last_service_meter')
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!asset) return;
  const projectedHours = meterType === 'hours' ? Math.max(0, reading) : Number(asset.current_hours ?? 0);
  const projectedOdometer = meterType === 'odometer' ? Math.max(0, Math.round(reading)) : Number(asset.current_odometer_km ?? 0);
  const isDue = deriveServiceDue({
    intervalType: asset.service_interval_type,
    intervalValue: Number(asset.service_interval_value ?? 0),
    nextServiceDueAt: asset.next_service_due_at,
    currentHours: projectedHours,
    currentOdometerKm: projectedOdometer,
    lastServiceMeter: Number(asset.last_service_meter ?? 0)
  });

  await ctx.supabase
    .from('farm_assets')
    .update({
      ...patch,
      status: isDue ? 'maintenance_due' : undefined
    })
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, 'meter_updated', { meter_type: meterType, reading });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function logFarmAssetServiceEvent(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const assetId = String(formData.get('assetId') ?? '').trim();
  if (!assetId) return;

  const serviceAt = toNullable(formData.get('serviceAt')) ?? new Date().toISOString();
  const meterReading = toNumberOrNull(formData.get('meterReading'));
  const manualDueAt = toNullable(formData.get('manualNextDueAt'));
  const manualReason = toNullable(formData.get('manualOverrideReason'));
  if (manualDueAt && !manualReason) return;

  const { data: asset } = await ctx.supabase
    .from('farm_assets')
    .select('service_interval_type,service_interval_value')
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!asset) return;

  const nextDueAt = manualDueAt ?? computeNextServiceDueAt(serviceAt, asset.service_interval_type, asset.service_interval_value ?? 30);
  const eventType = manualDueAt ? 'override' : 'completed';

  await ctx.supabase.from('farm_asset_service_events').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    asset_id: assetId,
    event_type: eventType,
    service_at: serviceAt,
    meter_reading: meterReading,
    next_due_at: nextDueAt,
    override_reason: manualDueAt ? manualReason : null,
    created_by: ctx.profile.id
  });

  await ctx.supabase
    .from('farm_assets')
    .update({
      last_service_meter: meterReading ?? 0,
      next_service_due_at: nextDueAt,
      status: 'operational',
      downtime_started_at: null,
      downtime_ended_at: null
    })
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, 'service_logged', {
    event_type: eventType,
    next_due_at: nextDueAt,
    override_reason: manualDueAt ? manualReason : null
  });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function startFarmAssetDowntime(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const assetId = String(formData.get('assetId') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  if (!assetId || !summary) return;

  const startedAt = new Date().toISOString();
  const { data: fault } = await ctx.supabase
    .from('farm_asset_faults')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      asset_id: assetId,
      summary,
      status: 'open',
      started_at: startedAt,
      reported_by: ctx.profile.id
    })
    .select('id')
    .single();

  await ctx.supabase
    .from('farm_assets')
    .update({
      status: 'down',
      downtime_started_at: startedAt,
      downtime_ended_at: null
    })
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, 'downtime_started', { summary, fault_id: fault?.id ?? null });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function closeFarmAssetDowntime(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const assetId = String(formData.get('assetId') ?? '').trim();
  const closureSummary = String(formData.get('closureSummary') ?? '').trim();
  if (!assetId || !closureSummary) return;

  const closedAt = new Date().toISOString();
  const { data: openFault } = await ctx.supabase
    .from('farm_asset_faults')
    .select('id')
    .eq('asset_id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .eq('status', 'open')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openFault?.id) {
    await ctx.supabase
      .from('farm_asset_faults')
      .update({
        status: 'closed',
        closed_at: closedAt,
        closure_summary: closureSummary,
        closed_by: ctx.profile.id
      })
      .eq('id', openFault.id);
  }

  await ctx.supabase
    .from('farm_assets')
    .update({
      status: 'operational',
      downtime_ended_at: closedAt
    })
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, 'downtime_closed', { closure_summary: closureSummary, fault_id: openFault?.id ?? null });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function linkFarmAssetDocument(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const assetId = String(formData.get('assetId') ?? '').trim();
  const storagePath = String(formData.get('storagePath') ?? '').trim();
  if (!assetId || !storagePath) return;

  const title = toNullable(formData.get('title')) ?? 'Document';
  const documentType = String(formData.get('documentType') ?? 'other');

  const { data } = await ctx.supabase
    .from('farm_asset_documents')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      asset_id: assetId,
      title,
      document_type: documentType,
      storage_path: storagePath,
      note: toNullable(formData.get('note')),
      uploaded_by: ctx.profile.id
    })
    .select('id')
    .single();

  await addHistory(ctx, 'farm_asset', assetId, 'document_linked', { document_id: data?.id ?? null, title, document_type: documentType });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function createWorker(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;

  const fullName = String(formData.get('fullName') ?? '').trim();
  if (!fullName) return;

  const { data } = await ctx.supabase.from('workforce_profiles').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    full_name: fullName,
    worker_type: String(formData.get('workerType') ?? 'employee'),
    mobile_number: toNullable(formData.get('mobileNumber')),
    emergency_contact: toNullable(formData.get('emergencyContact')),
    start_date: toNullable(formData.get('startDate')),
    active: true
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'workforce_profile', data.id, 'created', { full_name: fullName });
  revalidatePath('/farm/workforce');
}

export async function updateWorker(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;

  const workerId = String(formData.get('workerId') ?? '').trim();
  if (!workerId) return;

  const active = String(formData.get('active') ?? 'true') === 'true';
  await ctx.supabase.from('workforce_profiles').update({
    full_name: String(formData.get('fullName') ?? '').trim() || undefined,
    worker_type: String(formData.get('workerType') ?? 'employee'),
    mobile_number: toNullable(formData.get('mobileNumber')),
    emergency_contact: toNullable(formData.get('emergencyContact')),
    active,
    end_date: active ? null : new Date().toISOString().slice(0, 10)
  }).eq('id', workerId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'workforce_profile', workerId, active ? 'activated' : 'deactivated', { active });
  revalidatePath('/farm/workforce');
}

export async function clockWorker(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const workerId = String(formData.get('workerId') ?? '').trim();
  const mode = String(formData.get('mode') ?? 'in');
  if (!workerId) return;

  if (mode === 'in') {
    const { data } = await ctx.supabase.from('workforce_time_entries').insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      workforce_profile_id: workerId,
      clock_in_at: new Date().toISOString(),
      entry_type: 'work',
      created_by: ctx.profile.id
    }).select('id').single();
    if (data?.id) await addHistory(ctx, 'workforce_time_entry', data.id, 'clock_in', { workforce_profile_id: workerId });
  } else {
    const { data: openEntry } = await ctx.supabase
      .from('workforce_time_entries')
      .select('id')
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .eq('workforce_profile_id', workerId)
      .is('clock_out_at', null)
      .order('clock_in_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openEntry?.id) return;
    await ctx.supabase.from('workforce_time_entries').update({ clock_out_at: new Date().toISOString() }).eq('id', openEntry.id);
    await addHistory(ctx, 'workforce_time_entry', openEntry.id, 'clock_out', { workforce_profile_id: workerId });
  }

  revalidatePath('/farm/workforce');
}

export async function correctTimeEntry(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;

  const entryId = String(formData.get('entryId') ?? '').trim();
  if (!entryId) return;
  await ctx.supabase.from('workforce_time_entries').update({
    clock_in_at: String(formData.get('clockInAt') ?? '').trim() || undefined,
    clock_out_at: toNullable(formData.get('clockOutAt')),
    break_minutes: Number(String(formData.get('breakMinutes') ?? '').trim() || '0')
  }).eq('id', entryId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'workforce_time_entry', entryId, 'corrected', {});
  revalidatePath('/farm/workforce');
}

export async function createFarmTask(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  const { data } = await ctx.supabase.from('farm_tasks').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    title,
    description: toNullable(formData.get('description')),
    task_type: String(formData.get('taskType') ?? 'general'),
    priority: String(formData.get('priority') ?? 'normal'),
    due_at: toNullable(formData.get('dueAt')),
    created_by: ctx.profile.id
  }).select('id').single();

  if (!data?.id) return;

  const profileIds = formData.getAll('assigneeIds').map((value) => String(value)).filter(Boolean);
  if (profileIds.length) {
    await ctx.supabase.from('farm_task_assignments').insert(profileIds.map((profileId) => ({ task_id: data.id, profile_id: profileId, assigned_by: ctx.profile.id })));
  }

  await addHistory(ctx, 'farm_task', data.id, 'created', { title, assignees: profileIds.length });
  revalidatePath('/farm/tasks');
  revalidatePath('/farm/dashboard');
}

export async function transitionFarmTask(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const taskId = String(formData.get('taskId') ?? '').trim();
  const nextStatus = String(formData.get('nextStatus') ?? '').trim();
  if (!taskId || !nextStatus) return;

  const { data: task } = await ctx.supabase
    .from('farm_tasks')
    .select('status')
    .eq('id', taskId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!task?.status) return;
  if (nextStatus === 'verified' && !isManager(ctx.profile.role)) return;
  if (!TASK_TRANSITIONS[task.status]?.has(nextStatus)) return;

  await ctx.supabase.from('farm_tasks').update({ status: nextStatus, verified_by: nextStatus === 'verified' ? ctx.profile.id : null, verified_at: nextStatus === 'verified' ? new Date().toISOString() : null }).eq('id', taskId);

  await addHistory(ctx, 'farm_task', taskId, 'status_changed', { from: task.status, to: nextStatus });
  revalidatePath('/farm/tasks');
}

export async function addFarmTaskUpdate(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const taskId = String(formData.get('taskId') ?? '').trim();
  const message = String(formData.get('message') ?? '').trim();
  if (!taskId || !message) return;

  await ctx.supabase.from('farm_task_updates').insert({ task_id: taskId, message, created_by: ctx.profile.id });
  await addHistory(ctx, 'farm_task', taskId, 'update_added', { message });
  revalidatePath('/farm/tasks');
}

export async function addTaskProof(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const taskId = String(formData.get('taskId') ?? '').trim();
  if (!taskId) return;

  await ctx.supabase.from('farm_task_proofs').insert({
    task_id: taskId,
    proof_type: String(formData.get('proofType') ?? 'text'),
    quality: String(formData.get('quality') ?? 'medium'),
    storage_path: toNullable(formData.get('storagePath')),
    note: toNullable(formData.get('note')),
    created_by: ctx.profile.id
  });

  await addHistory(ctx, 'farm_task', taskId, 'proof_added', { proof_type: String(formData.get('proofType') ?? 'text') });
  revalidatePath('/farm/tasks');
}

export async function reportFarmIncident(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const occurredAt = String(formData.get('occurredAt') ?? '').trim();
  if (!title || !description || !occurredAt) return;

  const { data } = await ctx.supabase
    .from('farm_incidents')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      title,
      description,
      incident_type: String(formData.get('incidentType') ?? 'other'),
      severity: String(formData.get('severity') ?? 'medium'),
      occurred_at: occurredAt,
      owner_profile_id: toNullable(formData.get('ownerProfileId')),
      reported_by: ctx.profile.id
    })
    .select('id')
    .single();

  if (!data?.id) return;
  await addHistory(ctx, 'farm_incident', data.id, 'created', { title });
  revalidatePath('/farm/incidents');
}

export async function updateIncidentWorkflow(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const incidentId = String(formData.get('incidentId') ?? '').trim();
  if (!incidentId) return;

  await ctx.supabase.from('farm_incidents').update({
    status: String(formData.get('status') ?? 'open'),
    corrective_action: toNullable(formData.get('correctiveAction')),
    owner_profile_id: toNullable(formData.get('ownerProfileId'))
  }).eq('id', incidentId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_incident', incidentId, 'updated', { status: String(formData.get('status') ?? 'open') });
  revalidatePath('/farm/incidents');
}

export async function logFarmExpense(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const amount = String(formData.get('amount') ?? '').trim();
  const purchasedAt = String(formData.get('purchasedAt') ?? '').trim();
  if (!amount || !purchasedAt) return;

  const amountCents = parseMoneyToCents(amount);
  const { data } = await ctx.supabase
    .from('expense_logs')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      category: String(formData.get('category') ?? 'other'),
      vendor_name: toNullable(formData.get('vendorName')),
      amount_cents: amountCents,
      notes: toNullable(formData.get('notes')),
      purchased_at: purchasedAt,
      logged_by: ctx.profile.id,
      card_reference: toNullable(formData.get('cardReference')),
      receipt_storage_path: toNullable(formData.get('receiptStoragePath'))
    })
    .select('id')
    .single();

  if (!data?.id) return;
  await addHistory(ctx, 'expense_log', data.id, 'created', { amount_cents: amountCents });
  revalidatePath('/farm/expenses');
}

export async function updateExpenseWorkflow(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const expenseId = String(formData.get('expenseId') ?? '').trim();
  if (!expenseId) return;

  await ctx.supabase.from('expense_logs').update({
    status: String(formData.get('status') ?? 'submitted'),
    vendor_name: toNullable(formData.get('vendorName')),
    notes: toNullable(formData.get('notes')),
    receipt_storage_path: toNullable(formData.get('receiptStoragePath'))
  }).eq('id', expenseId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'expense_log', expenseId, 'updated', { status: String(formData.get('status') ?? 'submitted') });
  revalidatePath('/farm/expenses');
}

export async function createCropField(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const { data } = await ctx.supabase.from('crop_fields').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    name,
    field_code: toNullable(formData.get('fieldCode')),
    hectares: Number(String(formData.get('hectares') ?? '').trim() || '0') || null,
    soil_type: toNullable(formData.get('soilType')),
    irrigation_type: toNullable(formData.get('irrigationType')),
    status: String(formData.get('status') ?? 'active')
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'crop_field', data.id, 'created', { name });
  revalidatePath('/farm/crops');
}

export async function createCropLog(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const fieldId = String(formData.get('fieldId') ?? '').trim();
  const logDate = String(formData.get('logDate') ?? '').trim();
  if (!fieldId || !logDate) return;

  const { data } = await ctx.supabase.from('crop_logs').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    field_id: fieldId,
    log_type: String(formData.get('logType') ?? 'other'),
    log_date: logDate,
    crop_name: toNullable(formData.get('cropName')),
    notes: toNullable(formData.get('notes')),
    created_by: ctx.profile.id
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'crop_log', data.id, 'created', { field_id: fieldId });
  revalidatePath('/farm/crops');
}

export async function createLivestockHerd(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const name = String(formData.get('name') ?? '').trim();
  const species = String(formData.get('species') ?? '').trim();
  if (!name || !species) return;

  const { data } = await ctx.supabase.from('livestock_herds').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    name,
    species,
    herd_code: toNullable(formData.get('herdCode')),
    active_count: Number(String(formData.get('activeCount') ?? '').trim() || '0')
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'livestock_herd', data.id, 'created', { name, species });
  revalidatePath('/farm/livestock');
}

export async function createLivestockLog(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const herdId = String(formData.get('herdId') ?? '').trim();
  const logDate = String(formData.get('logDate') ?? '').trim();
  if (!herdId || !logDate) return;

  const { data } = await ctx.supabase.from('livestock_logs').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    herd_id: herdId,
    log_type: String(formData.get('logType') ?? 'other'),
    log_date: logDate,
    quantity: Number(String(formData.get('quantity') ?? '').trim() || '0') || null,
    notes: toNullable(formData.get('notes')),
    created_by: ctx.profile.id
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'livestock_log', data.id, 'created', { herd_id: herdId });
  revalidatePath('/farm/livestock');
}
