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

async function getFarmContext() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
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

export async function createFarmTask(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const taskType = String(formData.get('taskType') ?? 'general');
  const priority = String(formData.get('priority') ?? 'normal');
  const dueAt = String(formData.get('dueAt') ?? '').trim();

  if (!title) return;

  const { data, error } = await ctx.supabase
    .from('farm_tasks')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      title,
      description: description || null,
      task_type: taskType,
      priority,
      due_at: dueAt || null,
      created_by: ctx.profile.id
    })
    .select('id')
    .single();

  if (error || !data) return;

  await ctx.supabase.from('farm_entity_history').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    entity_type: 'farm_task',
    entity_id: data.id,
    action: 'created',
    actor_profile_id: ctx.profile.id,
    payload: { title, task_type: taskType, priority }
  });

  revalidatePath('/farm/dashboard');
  revalidatePath('/farm/tasks');
}

export async function addFarmTaskUpdate(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const taskId = String(formData.get('taskId') ?? '').trim();
  const message = String(formData.get('message') ?? '').trim();

  if (!taskId || !message) return;

  const { error } = await ctx.supabase.from('farm_task_updates').insert({
    task_id: taskId,
    message,
    created_by: ctx.profile.id
  });

  if (error) return;

  await ctx.supabase.from('farm_entity_history').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    entity_type: 'farm_task',
    entity_id: taskId,
    action: 'update_added',
    actor_profile_id: ctx.profile.id,
    payload: { message }
  });

  revalidatePath('/farm/tasks');
}

export async function reportFarmIncident(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const incidentType = String(formData.get('incidentType') ?? 'other');
  const severity = String(formData.get('severity') ?? 'medium');
  const occurredAt = String(formData.get('occurredAt') ?? '').trim();

  if (!title || !description || !occurredAt) return;

  const { data, error } = await ctx.supabase
    .from('farm_incidents')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      title,
      description,
      incident_type: incidentType,
      severity,
      occurred_at: occurredAt,
      reported_by: ctx.profile.id
    })
    .select('id')
    .single();

  if (error || !data) return;

  await ctx.supabase.from('farm_entity_history').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    entity_type: 'farm_incident',
    entity_id: data.id,
    action: 'created',
    actor_profile_id: ctx.profile.id,
    payload: { title, incident_type: incidentType, severity }
  });

  revalidatePath('/farm/dashboard');
  revalidatePath('/farm/incidents');
}

export async function logFarmExpense(formData: FormData): Promise<void> {
  const ctx = await getFarmContext();
  if (!ctx) return;

  const category = String(formData.get('category') ?? 'other');
  const vendorName = String(formData.get('vendorName') ?? '').trim();
  const amount = String(formData.get('amount') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  const purchasedAt = String(formData.get('purchasedAt') ?? '').trim();
  const cardReference = String(formData.get('cardReference') ?? '').trim();

  if (!amount || !purchasedAt) return;

  const amountCents = parseMoneyToCents(amount);

  const { data, error } = await ctx.supabase
    .from('expense_logs')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      category,
      vendor_name: vendorName || null,
      amount_cents: amountCents,
      notes: notes || null,
      purchased_at: purchasedAt,
      logged_by: ctx.profile.id,
      card_reference: cardReference || null
    })
    .select('id')
    .single();

  if (error || !data) return;

  await ctx.supabase.from('farm_entity_history').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    entity_type: 'expense_log',
    entity_id: data.id,
    action: 'created',
    actor_profile_id: ctx.profile.id,
    payload: { category, amount_cents: amountCents, purchased_at: purchasedAt }
  });

  revalidatePath('/farm/dashboard');
  revalidatePath('/farm/expenses');
}
