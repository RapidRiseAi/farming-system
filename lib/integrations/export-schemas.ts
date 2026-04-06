import { IntegrationTarget, MappingFieldSpec } from '@/lib/integrations/types';

type SchemaEntity = 'work_orders' | 'stock_issues' | 'supplier_references' | 'usage_logs' | 'document_links';

type ExportSchemaDefinition = {
  target: IntegrationTarget;
  entity: SchemaEntity;
  version: string;
  fields: Array<{
    source: string;
    target: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'datetime' | 'date' | 'json';
    notes?: string;
  }>;
  mappingFields: MappingFieldSpec[];
};

const BASE_MAPPING_FIELDS: MappingFieldSpec[] = [
  { key: 'external_code', label: 'External code', required: false, description: 'Partner system code override.' },
  { key: 'cost_center', label: 'Cost center', required: false, description: 'Optional accounting dimension.' }
];

const SCHEMA_LIBRARY: ExportSchemaDefinition[] = [
  {
    target: 'pastel',
    entity: 'work_orders',
    version: '2026.04',
    mappingFields: BASE_MAPPING_FIELDS,
    fields: [
      { source: 'work_order_number', target: 'JobNo', required: true, type: 'string' },
      { source: 'work_order_type', target: 'JobType', required: true, type: 'string' },
      { source: 'status', target: 'Status', required: true, type: 'string' },
      { source: 'short_description', target: 'Description', required: true, type: 'string' },
      { source: 'site_id', target: 'SiteRef', required: false, type: 'string' },
      { source: 'area_id', target: 'AreaRef', required: false, type: 'string' },
      { source: 'created_at', target: 'OpenedAt', required: true, type: 'datetime' }
    ]
  },
  {
    target: 'sage',
    entity: 'work_orders',
    version: '2026.04',
    mappingFields: BASE_MAPPING_FIELDS,
    fields: [
      { source: 'work_order_number', target: 'workOrderNo', required: true, type: 'string' },
      { source: 'work_order_type', target: 'category', required: true, type: 'string' },
      { source: 'status', target: 'lifecycleStatus', required: true, type: 'string' },
      { source: 'short_description', target: 'summary', required: true, type: 'string' },
      { source: 'approval_notes', target: 'approvalNotes', required: false, type: 'string' },
      { source: 'updated_at', target: 'lastModifiedAt', required: true, type: 'datetime' }
    ]
  },
  {
    target: 'generic',
    entity: 'stock_issues',
    version: '2026.04',
    mappingFields: BASE_MAPPING_FIELDS,
    fields: [
      { source: 'request_number', target: 'issue_number', required: true, type: 'string' },
      { source: 'request_type', target: 'issue_type', required: true, type: 'string' },
      { source: 'status', target: 'status', required: true, type: 'string' },
      { source: 'need_by_at', target: 'need_by_at', required: false, type: 'datetime' },
      { source: 'issued_at', target: 'issued_at', required: false, type: 'datetime' }
    ]
  },
  {
    target: 'generic',
    entity: 'supplier_references',
    version: '2026.04',
    mappingFields: BASE_MAPPING_FIELDS,
    fields: [
      { source: 'id', target: 'supplier_reference', required: true, type: 'string', notes: 'Map from your supplier master table or metadata.' },
      { source: 'request_number', target: 'related_request_number', required: false, type: 'string' },
      { source: 'created_at', target: 'linked_at', required: true, type: 'datetime' }
    ]
  },
  {
    target: 'generic',
    entity: 'usage_logs',
    version: '2026.04',
    mappingFields: BASE_MAPPING_FIELDS,
    fields: [
      { source: 'id', target: 'usage_log_id', required: true, type: 'string' },
      { source: 'requested_for_type', target: 'usage_context', required: true, type: 'string' },
      { source: 'requested_for_id', target: 'usage_reference', required: false, type: 'string' },
      { source: 'updated_at', target: 'usage_recorded_at', required: true, type: 'datetime' }
    ]
  },
  {
    target: 'generic',
    entity: 'document_links',
    version: '2026.04',
    mappingFields: BASE_MAPPING_FIELDS,
    fields: [
      { source: 'document_number', target: 'document_number', required: true, type: 'string' },
      { source: 'title', target: 'title', required: true, type: 'string' },
      { source: 'linked_object_type', target: 'linked_type', required: true, type: 'string' },
      { source: 'linked_object_id', target: 'linked_id', required: false, type: 'string' },
      { source: 'storage_path', target: 'document_uri', required: true, type: 'string' }
    ]
  }
];

export function listExportSchemas(target?: IntegrationTarget, entity?: SchemaEntity) {
  return SCHEMA_LIBRARY.filter((schema) => (target ? schema.target === target : true) && (entity ? schema.entity === entity : true));
}

export type { SchemaEntity, ExportSchemaDefinition };
