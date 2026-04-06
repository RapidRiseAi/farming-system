export type IntegrationEntity = 'assets' | 'tasks' | 'incidents' | 'stock_requests' | 'documents';

export type IntegrationJobKind = 'import' | 'export';

export type IntegrationTarget = 'pastel' | 'sage' | 'generic';

export type IntegrationJobRequest = {
  kind: IntegrationJobKind;
  entity: IntegrationEntity;
  target?: IntegrationTarget;
  format?: 'json' | 'csv';
  filters?: Record<string, string | number | boolean | null | undefined>;
  mapping?: Record<string, string>;
  includeGeo?: boolean;
};

export type MappingFieldSpec = {
  key: string;
  label: string;
  required: boolean;
  description?: string;
};

export type GeoEndpointRecord = {
  entity: 'site' | 'area';
  id: string;
  name: string;
  code: string | null;
  coordinates: {
    centroid: { lat: number; lng: number } | null;
    boundaryGeoJson: unknown | null;
  };
  mapping?: Record<string, string | null>;
};
