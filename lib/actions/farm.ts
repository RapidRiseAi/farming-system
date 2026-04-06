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

const FARM_ASSET_STATUSES = ['active', 'maintenance_due', 'in_repair', 'retired'] as const;
const FARM_ASSET_STATUS_SET = new Set<string>(FARM_ASSET_STATUSES);
const ASSET_STATUS_TRANSITIONS: Record<(typeof FARM_ASSET_STATUSES)[number], Set<(typeof FARM_ASSET_STATUSES)[number]>> = {
  active: new Set(['maintenance_due', 'in_repair', 'retired']),
  maintenance_due: new Set(['active', 'in_repair', 'retired']),
  in_repair: new Set(['active', 'maintenance_due', 'retired']),
  retired: new Set()
};

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

function toNullableNumber(value: FormDataEntryValue | null): number | null {
  const input = String(value ?? '').trim();
  if (!input) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPointLiteral(latitude: FormDataEntryValue | null, longitude: FormDataEntryValue | null): string | null {
  const latValue = String(latitude ?? '').trim();
  const lngValue = String(longitude ?? '').trim();
  if (!latValue || !lngValue) return null;

  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `(${lng},${lat})`;
}

function toNullableJsonObject(value: FormDataEntryValue | null): Record<string, unknown> | null {
  const input = String(value ?? '').trim();
  if (!input) return null;
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
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

function computeNextServiceDueAt(baseDate: Date, intervalType: string, intervalValue: number): string {
  if (intervalType === 'days') {
    const dueDate = new Date(baseDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + Math.max(1, Math.round(intervalValue)));
    return dueDate.toISOString();
  }
  // Meter-based due dates are proxied to 30 days from now and can be overridden manually.
  const fallback = new Date(baseDate);
  fallback.setUTCDate(fallback.getUTCDate() + 30);
  return fallback.toISOString();
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
      { workshop_account_id: ctx.profile.workshop_account_id, name: 'North Pivot Irrigation', asset_type: 'irrigation', status: 'active', site_name: 'North Field', created_by: ctx.profile.id },
      { workshop_account_id: ctx.profile.workshop_account_id, name: 'Tractor A1', asset_type: 'equipment', status: 'active', site_name: 'Main Yard', current_hours: 12, created_by: ctx.profile.id }
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
  const serviceIntervalType = String(formData.get('serviceIntervalType') ?? 'hours').trim();
  const serviceIntervalValue = toNullableNumber(formData.get('serviceIntervalValue')) ?? 250;
  const lastServiceMeter = toNullableNumber(formData.get('lastServiceMeter')) ?? 0;
  if (!name) return;
  const status = String(formData.get('status') ?? 'active').trim();
  if (!FARM_ASSET_STATUS_SET.has(status)) return;
  const now = new Date();
  const nextServiceDueAt = computeNextServiceDueAt(now, serviceIntervalType, serviceIntervalValue);

  const { data } = await ctx.supabase.from('farm_assets').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    name,
    asset_code: String(formData.get('assetCode') ?? '').trim() || `ASSET-${now.getTime()}`,
    qr_token: String(formData.get('qrToken') ?? '').trim() || crypto.randomUUID(),
    asset_type: assetType,
    status,
    site_name: toNullable(formData.get('siteName')),
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
    make: String(formData.get('make') ?? '').trim(),
    model: String(formData.get('model') ?? '').trim(),
    serial_number: String(formData.get('serialNumber') ?? '').trim(),
    registration: String(formData.get('registration') ?? '').trim(),
    assigned_profile_id: toNullable(formData.get('assignedProfileId')),
    service_interval_type: serviceIntervalType,
    service_interval_value: serviceIntervalValue,
    last_service_meter: lastServiceMeter,
    next_service_due_at: nextServiceDueAt,
    criticality: String(formData.get('criticality') ?? 'medium'),
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
  const status = String(formData.get('status') ?? 'active').trim();
  if (!FARM_ASSET_STATUS_SET.has(status)) return;

  const { data: existingAsset } = await ctx.supabase
    .from('farm_assets')
    .select('status')
    .eq('id', assetId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();
  if (!existingAsset) return;

  const currentStatus = String(existingAsset.status ?? '').trim() as (typeof FARM_ASSET_STATUSES)[number];
  const allowedTransitions = ASSET_STATUS_TRANSITIONS[currentStatus];
  if (currentStatus !== status && !allowedTransitions?.has(status as (typeof FARM_ASSET_STATUSES)[number])) {
    return;
  }

  const serviceIntervalType = String(formData.get('serviceIntervalType') ?? 'hours').trim();
  const serviceIntervalValue = toNullableNumber(formData.get('serviceIntervalValue'));
  const nextServiceDueAt = toNullable(formData.get('nextServiceDueAt'));
  await ctx.supabase.from('farm_assets').update({
    asset_code: String(formData.get('assetCode') ?? '').trim() || undefined,
    name: String(formData.get('name') ?? '').trim() || undefined,
    status,
    site_name: toNullable(formData.get('siteName')),
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
    make: String(formData.get('make') ?? '').trim(),
    model: String(formData.get('model') ?? '').trim(),
    serial_number: String(formData.get('serialNumber') ?? '').trim(),
    registration: String(formData.get('registration') ?? '').trim(),
    assigned_profile_id: toNullable(formData.get('assignedProfileId')),
    service_interval_type: serviceIntervalType,
    service_interval_value: serviceIntervalValue,
    last_service_meter: toNullableNumber(formData.get('lastServiceMeter')),
    next_service_due_at: nextServiceDueAt,
    service_due_override_reason: toNullable(formData.get('serviceDueOverrideReason')),
    criticality: String(formData.get('criticality') ?? 'medium'),
    notes: toNullable(formData.get('notes')),
    current_hours: Number(String(formData.get('currentHours') ?? '').trim() || '0') || null,
    current_odometer_km: Number(String(formData.get('currentOdometerKm') ?? '').trim() || '0') || null,
    retired_at: status === 'retired' ? new Date().toISOString() : null
  }).eq('id', assetId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, status === 'retired' ? 'archived' : 'updated', { status });
  revalidatePath('/farm/assets');
}

export async function fastUpdateAssetMeter(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const assetId = String(formData.get('assetId') ?? '').trim();
  const meterType = String(formData.get('meterType') ?? 'hours').trim();
  const meterReading = toNullableNumber(formData.get('meterReading'));
  if (!assetId || meterReading === null) return;

  const meterPatch = meterType === 'distance_km' ? { current_odometer_km: Math.round(meterReading) } : { current_hours: meterReading };
  await ctx.supabase.from('farm_assets').update(meterPatch).eq('id', assetId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await ctx.supabase.from('farm_asset_service_events').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    asset_id: assetId,
    event_type: 'meter_update',
    meter_type: meterType,
    meter_reading: meterReading,
    created_by: ctx.profile.id,
    notes: toNullable(formData.get('note'))
  });

  await addHistory(ctx, 'farm_asset', assetId, 'meter_updated', { meter_type: meterType, meter_reading: meterReading });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function overrideAssetServiceDue(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const assetId = String(formData.get('assetId') ?? '').trim();
  const dueAt = toNullable(formData.get('nextServiceDueAt'));
  const reason = toNullable(formData.get('reason'));
  if (!assetId || !dueAt || !reason) return;

  await ctx.supabase.from('farm_assets').update({
    next_service_due_at: dueAt,
    service_due_override_reason: reason
  }).eq('id', assetId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await ctx.supabase.from('farm_asset_service_events').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    asset_id: assetId,
    event_type: 'due_override',
    due_at: dueAt,
    override_reason: reason,
    created_by: ctx.profile.id
  });

  await addHistory(ctx, 'farm_asset', assetId, 'service_due_overridden', { next_service_due_at: dueAt, reason });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function openAssetDowntime(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const assetId = String(formData.get('assetId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!assetId || !title) return;
  const startedAt = new Date().toISOString();

  const { data: fault } = await ctx.supabase.from('farm_asset_faults').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    asset_id: assetId,
    title,
    description: toNullable(formData.get('description')),
    severity: String(formData.get('severity') ?? 'medium'),
    downtime_started_at: startedAt,
    reported_by: ctx.profile.id
  }).select('id').single();

  await ctx.supabase.from('farm_assets').update({
    status: 'in_repair',
    downtime_started_at: startedAt,
    downtime_ended_at: null
  }).eq('id', assetId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, 'downtime_started', { fault_id: fault?.id, started_at: startedAt });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function closeAssetDowntime(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const assetId = String(formData.get('assetId') ?? '').trim();
  const faultId = String(formData.get('faultId') ?? '').trim();
  const closureSummary = String(formData.get('closureSummary') ?? '').trim();
  if (!assetId || !faultId || !closureSummary) return;
  const endedAt = new Date().toISOString();

  await ctx.supabase.from('farm_asset_faults').update({
    status: 'closed',
    downtime_ended_at: endedAt,
    closure_summary: closureSummary,
    closed_by: ctx.profile.id
  }).eq('id', faultId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await ctx.supabase.from('farm_assets').update({
    status: 'active',
    downtime_ended_at: endedAt
  }).eq('id', assetId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_asset', assetId, 'downtime_closed', { fault_id: faultId, closure_summary: closureSummary });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function linkAssetDocument(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;
  const assetId = String(formData.get('assetId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const storagePath = String(formData.get('storagePath') ?? '').trim();
  if (!assetId || !title || !storagePath) return;

  const { data } = await ctx.supabase.from('farm_asset_documents').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    asset_id: assetId,
    document_type: String(formData.get('documentType') ?? 'other'),
    title,
    storage_path: storagePath,
    uploaded_by: ctx.profile.id,
    linked_service_event_id: toNullable(formData.get('linkedServiceEventId')),
    linked_fault_id: toNullable(formData.get('linkedFaultId')),
    notes: toNullable(formData.get('notes'))
  }).select('id').single();

  await addHistory(ctx, 'farm_asset', assetId, 'document_linked', { document_id: data?.id, title });
  revalidatePath('/farm/assets');
  revalidatePath(`/farm/assets/${assetId}`);
}

export async function createFarmSite(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const { data } = await ctx.supabase.from('farm_sites').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    name,
    code: toNullable(formData.get('code')),
    province: toNullable(formData.get('province')),
    centroid: toPointLiteral(formData.get('centroidLat'), formData.get('centroidLng')),
    boundary_geojson: toNullableJsonObject(formData.get('boundaryGeoJson')),
    emergency_contacts: toNullable(formData.get('emergencyContacts')),
    status: String(formData.get('status') ?? 'active')
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'farm_site', data.id, 'created', { name });
  revalidatePath('/farm/structure');
}

export async function createFarmArea(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const { data } = await ctx.supabase.from('farm_areas').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    site_id: toNullable(formData.get('siteId')),
    parent_area_id: toNullable(formData.get('parentAreaId')),
    code: toNullable(formData.get('code')),
    name,
    area_type: String(formData.get('areaType') ?? 'field'),
    centroid: toPointLiteral(formData.get('centroidLat'), formData.get('centroidLng')),
    boundary_geojson: toNullableJsonObject(formData.get('boundaryGeoJson')),
    notes: toNullable(formData.get('notes')),
    active: String(formData.get('active') ?? 'true') === 'true'
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'farm_area', data.id, 'created', { name });
  revalidatePath('/farm/structure');
}

export async function createFarmProductionUnit(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const { data } = await ctx.supabase.from('farm_production_units').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
    internal_code: toNullable(formData.get('internalCode')),
    external_code: toNullable(formData.get('externalCode')),
    name,
    status: String(formData.get('status') ?? 'active'),
    notes: toNullable(formData.get('notes'))
  }).select('id').single();

  if (!data?.id) return;
  await addHistory(ctx, 'farm_production_unit', data.id, 'created', { name });
  revalidatePath('/farm/structure');
}

export async function updateFarmArea(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const areaId = String(formData.get('areaId') ?? '').trim();
  if (!areaId) return;
  const active = String(formData.get('active') ?? 'true') === 'true';

  await ctx.supabase.from('farm_areas').update({
    site_id: toNullable(formData.get('siteId')),
    parent_area_id: toNullable(formData.get('parentAreaId')),
    code: toNullable(formData.get('code')),
    name: String(formData.get('name') ?? '').trim() || undefined,
    area_type: String(formData.get('areaType') ?? 'field'),
    centroid: toPointLiteral(formData.get('centroidLat'), formData.get('centroidLng')),
    boundary_geojson: toNullableJsonObject(formData.get('boundaryGeoJson')),
    notes: toNullable(formData.get('notes')),
    active
  }).eq('id', areaId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_area', areaId, active ? 'activated' : 'deactivated', { active });
  revalidatePath('/farm/structure');
}

export async function updateFarmSite(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const siteId = String(formData.get('siteId') ?? '').trim();
  if (!siteId) return;

  await ctx.supabase.from('farm_sites').update({
    name: String(formData.get('name') ?? '').trim() || undefined,
    code: toNullable(formData.get('code')),
    province: toNullable(formData.get('province')),
    centroid: toPointLiteral(formData.get('centroidLat'), formData.get('centroidLng')),
    boundary_geojson: toNullableJsonObject(formData.get('boundaryGeoJson')),
    emergency_contacts: toNullable(formData.get('emergencyContacts')),
    status: String(formData.get('status') ?? 'active')
  }).eq('id', siteId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_site', siteId, 'updated', { status: String(formData.get('status') ?? 'active') });
  revalidatePath('/farm/structure');
}

export async function updateFarmProductionUnit(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx || !isManager(ctx.profile.role)) return;
  const unitId = String(formData.get('unitId') ?? '').trim();
  if (!unitId) return;

  await ctx.supabase.from('farm_production_units').update({
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
    internal_code: toNullable(formData.get('internalCode')),
    external_code: toNullable(formData.get('externalCode')),
    name: String(formData.get('name') ?? '').trim() || undefined,
    status: String(formData.get('status') ?? 'active'),
    notes: toNullable(formData.get('notes'))
  }).eq('id', unitId).eq('workshop_account_id', ctx.profile.workshop_account_id);

  await addHistory(ctx, 'farm_production_unit', unitId, 'updated', { status: String(formData.get('status') ?? 'active') });
  revalidatePath('/farm/structure');
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
      site_id: toNullable(formData.get('siteId')),
      area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
      site_id: toNullable(formData.get('siteId')),
      area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
      site_id: toNullable(formData.get('siteId')),
      area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
    site_id: toNullable(formData.get('siteId')),
    area_id: toNullable(formData.get('areaId')),
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
