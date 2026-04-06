import { randomUUID } from 'crypto';
import { FarmIntegrationContext } from '@/lib/integrations/auth';
import { IntegrationEntity, IntegrationJobRequest } from '@/lib/integrations/types';

const ENTITY_SELECT: Record<IntegrationEntity, { table: string; columns: string }> = {
  assets: { table: 'farm_assets', columns: 'id,name,asset_type,status,site_id,area_id,created_at,updated_at' },
  tasks: { table: 'farm_tasks', columns: 'id,title,task_type,status,priority,asset_id,site_id,area_id,due_at,created_at,updated_at' },
  incidents: { table: 'farm_incidents', columns: 'id,incident_number,title,incident_type,incident_class,severity,status,occurred_at,site_id,location_area_id,created_at,updated_at' },
  stock_requests: { table: 'farm_stock_requests', columns: 'id,request_number,request_type,status,requested_for_type,requested_for_id,requested_for_label,need_by_at,approved_at,issued_at,created_at,updated_at' },
  documents: { table: 'farm_documents', columns: 'id,document_number,title,document_type,linked_object_type,linked_object_id,status,effective_date,expiry_date,storage_path,created_at,updated_at' }
};

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (serialized.includes(',') || serialized.includes('"') || serialized.includes('\n')) {
      return `"${serialized.replace(/"/g, '""')}"`;
    }
    return serialized;
  };

  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

function applyMapping(rows: Array<Record<string, unknown>>, mapping?: Record<string, string>) {
  if (!mapping || Object.keys(mapping).length === 0) return rows;
  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [source, target] of Object.entries(mapping)) {
      mapped[target] = row[source];
    }
    return { ...row, _mapped: mapped };
  });
}

export async function runIntegrationJob(ctx: FarmIntegrationContext, payload: IntegrationJobRequest) {
  const entitySpec = ENTITY_SELECT[payload.entity];
  const startedAt = new Date().toISOString();
  const jobId = randomUUID();

  if (payload.kind === 'import') {
    return {
      id: jobId,
      kind: 'import' as const,
      entity: payload.entity,
      status: 'queued' as const,
      startedAt,
      message: 'Import jobs are accepted and queued; worker integration can consume this payload asynchronously.',
      receivedMapping: payload.mapping ?? {},
      target: payload.target ?? 'generic'
    };
  }

  const query = ctx.supabase
    .from(entitySpec.table)
    .select(entitySpec.columns)
    .eq('workshop_account_id', ctx.farmId)
    .order('updated_at', { ascending: false })
    .limit(5000);

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown[]).map((row) => row as Record<string, unknown>);
  const mappedRows = applyMapping(rows, payload.mapping);

  return {
    id: jobId,
    kind: 'export' as const,
    entity: payload.entity,
    status: 'completed' as const,
    startedAt,
    completedAt: new Date().toISOString(),
    target: payload.target ?? 'generic',
    format: payload.format ?? 'json',
    rowCount: mappedRows.length,
    data: payload.format === 'csv' ? toCsv(mappedRows) : mappedRows
  };
}

export function listIntegrationJobCapabilities() {
  return {
    entities: Object.keys(ENTITY_SELECT),
    kinds: ['import', 'export'],
    formats: ['json', 'csv'],
    targets: ['pastel', 'sage', 'generic']
  };
}
