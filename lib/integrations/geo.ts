import { FarmIntegrationContext } from '@/lib/integrations/auth';
import { GeoEndpointRecord } from '@/lib/integrations/types';

function parsePoint(point: unknown): { lat: number; lng: number } | null {
  if (typeof point !== 'string') return null;
  const matched = point.match(/^\(([-0-9.]+),([-0-9.]+)\)$/);
  if (!matched) return null;

  const lng = Number(matched[1]);
  const lat = Number(matched[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

export const OPTIONAL_MAPPING_FIELDS = [
  { key: 'external_code', label: 'External code', required: false, description: 'Client-side integration alias.' },
  { key: 'erp_reference', label: 'ERP reference', required: false, description: 'Pastel/Sage object reference key.' },
  { key: 'region', label: 'Region', required: false, description: 'Geographic grouping used by downstream tools.' },
  { key: 'cost_center', label: 'Cost center', required: false, description: 'Financial mapping for exports.' }
] as const;

export async function listGeoEndpoints(
  ctx: FarmIntegrationContext,
  options?: {
    entity?: 'site' | 'area' | 'all';
    includeMapping?: boolean;
  }
): Promise<GeoEndpointRecord[]> {
  const entity = options?.entity ?? 'all';
  const includeMapping = options?.includeMapping ?? false;

  const [sitesRes, areasRes] = await Promise.all([
    entity === 'area'
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
      : ctx.supabase
          .from('farm_sites')
          .select('id,name,code,centroid,boundary_geojson')
          .eq('workshop_account_id', ctx.farmId)
          .order('name', { ascending: true }),
    entity === 'site'
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
      : ctx.supabase
          .from('farm_areas')
          .select('id,name,code,centroid,boundary_geojson')
          .eq('workshop_account_id', ctx.farmId)
          .eq('active', true)
          .order('name', { ascending: true })
  ]);

  const siteRows = (sitesRes.data ?? []).map((row) => ({
    entity: 'site' as const,
    id: String(row.id),
    name: String(row.name),
    code: row.code ? String(row.code) : null,
    coordinates: {
      centroid: parsePoint(row.centroid),
      boundaryGeoJson: row.boundary_geojson ?? null
    }
  }));

  const areaRows = (areasRes.data ?? []).map((row) => ({
    entity: 'area' as const,
    id: String(row.id),
    name: String(row.name),
    code: row.code ? String(row.code) : null,
    coordinates: {
      centroid: parsePoint(row.centroid),
      boundaryGeoJson: row.boundary_geojson ?? null
    }
  }));

  const records = [...siteRows, ...areaRows];

  if (!includeMapping) return records;

  return records.map((record) => ({
    ...record,
    mapping: {
      external_code: record.code,
      erp_reference: null,
      region: null,
      cost_center: null
    }
  }));
}
