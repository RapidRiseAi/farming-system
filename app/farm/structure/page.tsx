import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import {
  createFarmArea,
  createFarmProductionUnit,
  createFarmSite,
  updateFarmArea,
  updateFarmProductionUnit,
  updateFarmSite
} from '@/lib/actions/farm';
import { QrEntryCard } from '@/components/farm/qr-entry-card';

const AREA_TYPES = ['field', 'orchard', 'greenhouse', 'camp', 'feedlot', 'dam', 'borehole', 'workshop', 'packhouse', 'store', 'residence', 'gate', 'solar_array'];

export default async function FarmStructurePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: sites }, { data: areas }, { data: units }] = await Promise.all([
    supabase.from('farm_sites').select('id,name,code,province,status,centroid,emergency_contacts').eq('workshop_account_id', profile.workshop_account_id).order('name'),
    supabase.from('farm_areas').select('id,name,code,site_id,parent_area_id,area_type,active').eq('workshop_account_id', profile.workshop_account_id).order('name'),
    supabase.from('farm_production_units').select('id,name,internal_code,external_code,site_id,area_id,status').eq('workshop_account_id', profile.workshop_account_id).order('name')
  ]);

  type AreaRecord = NonNullable<typeof areas>[number];
  const areaChildren = new Map<string, AreaRecord[]>();
  const rootAreas: AreaRecord[] = [];
  for (const area of areas ?? []) {
    if (!area.parent_area_id) {
      rootAreas.push(area);
      continue;
    }
    const current = areaChildren.get(area.parent_area_id) ?? [];
    current.push(area);
    areaChildren.set(area.parent_area_id, current);
  }

  function renderAreaNode(area: NonNullable<typeof areas>[number], depth = 0): ReactNode {
    const children = areaChildren.get(area.id) ?? [];
    return (
      <li key={area.id} className="space-y-1">
        <a href={`#area-${area.id}`} className="text-sm text-emerald-800 underline-offset-2 hover:underline">
          {'—'.repeat(depth)} {area.name} ({area.area_type})
        </a>
        {children.length > 0 ? <ul className="ml-4 space-y-1">{children.map((child) => renderAreaNode(child, depth + 1))}</ul> : null}
      </li>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-emerald-950">Farm structure</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Create site</h2>
          <form action={createFarmSite} className="mt-2 grid gap-2">
            <input name="name" className="rounded border px-2 py-1.5" placeholder="Site name" required />
            <input name="code" className="rounded border px-2 py-1.5" placeholder="Site code" />
            <input name="province" className="rounded border px-2 py-1.5" placeholder="Province" />
            <div className="grid grid-cols-2 gap-2">
              <input name="centroidLat" type="number" step="any" className="rounded border px-2 py-1.5" placeholder="Centroid lat" />
              <input name="centroidLng" type="number" step="any" className="rounded border px-2 py-1.5" placeholder="Centroid lng" />
            </div>
            <textarea name="boundaryGeoJson" className="rounded border px-2 py-1.5" placeholder='Boundary geojson {"type":"Polygon",...}' />
            <textarea name="emergencyContacts" className="rounded border px-2 py-1.5" placeholder="Emergency contacts" />
            <select name="status" className="rounded border px-2 py-1.5"><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
            <button className="rounded border px-2 py-1.5">Save site</button>
          </form>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Create area</h2>
          <form action={createFarmArea} className="mt-2 grid gap-2">
            <input name="name" className="rounded border px-2 py-1.5" placeholder="Area name" required />
            <input name="code" className="rounded border px-2 py-1.5" placeholder="Area code" />
            <select name="siteId" className="rounded border px-2 py-1.5"><option value="">No site</option>{(sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
            <select name="parentAreaId" className="rounded border px-2 py-1.5"><option value="">No parent</option>{(areas ?? []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
            <select name="areaType" className="rounded border px-2 py-1.5">{AREA_TYPES.map((areaType) => <option key={areaType} value={areaType}>{areaType}</option>)}</select>
            <div className="grid grid-cols-2 gap-2">
              <input name="centroidLat" type="number" step="any" className="rounded border px-2 py-1.5" placeholder="Centroid lat" />
              <input name="centroidLng" type="number" step="any" className="rounded border px-2 py-1.5" placeholder="Centroid lng" />
            </div>
            <textarea name="boundaryGeoJson" className="rounded border px-2 py-1.5" placeholder='Boundary geojson {"type":"Polygon",...}' />
            <textarea name="notes" className="rounded border px-2 py-1.5" placeholder="Area notes" />
            <select name="active" className="rounded border px-2 py-1.5"><option value="true">Active</option><option value="false">Inactive</option></select>
            <button className="rounded border px-2 py-1.5">Save area</button>
          </form>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Create production unit</h2>
          <form action={createFarmProductionUnit} className="mt-2 grid gap-2">
            <input name="name" className="rounded border px-2 py-1.5" placeholder="Production unit" required />
            <input name="internalCode" className="rounded border px-2 py-1.5" placeholder="Internal code" />
            <input name="externalCode" className="rounded border px-2 py-1.5" placeholder="External code" />
            <select name="siteId" className="rounded border px-2 py-1.5"><option value="">No site</option>{(sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
            <select name="areaId" className="rounded border px-2 py-1.5"><option value="">No area</option>{(areas ?? []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
            <select name="status" className="rounded border px-2 py-1.5"><option value="active">Active</option><option value="inactive">Inactive</option><option value="retired">Retired</option></select>
            <textarea name="notes" className="rounded border px-2 py-1.5" placeholder="Notes" />
            <button className="rounded border px-2 py-1.5">Save unit</button>
          </form>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Hierarchy navigation</h2>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Sites</h3>
            <ul className="mt-1 space-y-1">
              {(sites ?? []).map((site) => <li key={site.id}><a href={`#site-${site.id}`} className="text-sm text-emerald-800 underline">{site.name}</a></li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Area tree</h3>
            <ul className="mt-1 space-y-1">
              {rootAreas.map((area) => renderAreaNode(area))}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Sites</h2>
          <div className="mt-2 space-y-2">
            {(sites ?? []).map((site) => (
              <form key={site.id} id={`site-${site.id}`} action={updateFarmSite} className="space-y-1 rounded border p-2 text-sm">
                <input type="hidden" name="siteId" value={site.id} />
                <input name="name" defaultValue={site.name} className="w-full rounded border px-2 py-1" />
                <input name="code" defaultValue={site.code ?? ''} className="w-full rounded border px-2 py-1" placeholder="Code" />
                <input name="province" defaultValue={site.province ?? ''} className="w-full rounded border px-2 py-1" placeholder="Province" />
                <textarea name="emergencyContacts" defaultValue={site.emergency_contacts ?? ''} className="w-full rounded border px-2 py-1" placeholder="Emergency contacts" />
                <select name="status" defaultValue={site.status} className="w-full rounded border px-2 py-1"><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
                <button className="rounded border px-2 py-1">Update</button>
              </form>
            ))}
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Areas</h2>
          <div className="mt-2 space-y-2">
            {(areas ?? []).map((area) => (
              <form key={area.id} id={`area-${area.id}`} action={updateFarmArea} className="space-y-1 rounded border p-2 text-sm">
                <input type="hidden" name="areaId" value={area.id} />
                <input name="name" defaultValue={area.name} className="w-full rounded border px-2 py-1" />
                <input name="code" defaultValue={area.code ?? ''} className="w-full rounded border px-2 py-1" placeholder="Code" />
                <select name="siteId" defaultValue={area.site_id ?? ''} className="w-full rounded border px-2 py-1"><option value="">No site</option>{(sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
                <select name="parentAreaId" defaultValue={area.parent_area_id ?? ''} className="w-full rounded border px-2 py-1"><option value="">No parent</option>{(areas ?? []).filter((candidate) => candidate.id !== area.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
                <select name="areaType" defaultValue={area.area_type} className="w-full rounded border px-2 py-1">{AREA_TYPES.map((areaType) => <option key={areaType} value={areaType}>{areaType}</option>)}</select>
                <select name="active" defaultValue={String(area.active)} className="w-full rounded border px-2 py-1"><option value="true">Active</option><option value="false">Inactive</option></select>
                <button className="rounded border px-2 py-1">Update</button>
                <QrEntryCard label={`${area.name} area history`} href={`/farm/structure#area-${area.id}`} />
              </form>
            ))}
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Production units</h2>
          <div className="mt-2 space-y-2">
            {(units ?? []).map((unit) => (
              <form key={unit.id} action={updateFarmProductionUnit} className="space-y-1 rounded border p-2 text-sm">
                <input type="hidden" name="unitId" value={unit.id} />
                <input name="name" defaultValue={unit.name} className="w-full rounded border px-2 py-1" />
                <input name="internalCode" defaultValue={unit.internal_code ?? ''} className="w-full rounded border px-2 py-1" placeholder="Internal code" />
                <input name="externalCode" defaultValue={unit.external_code ?? ''} className="w-full rounded border px-2 py-1" placeholder="External code" />
                <select name="siteId" defaultValue={unit.site_id ?? ''} className="w-full rounded border px-2 py-1"><option value="">No site</option>{(sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
                <select name="areaId" defaultValue={unit.area_id ?? ''} className="w-full rounded border px-2 py-1"><option value="">No area</option>{(areas ?? []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
                <select name="status" defaultValue={unit.status} className="w-full rounded border px-2 py-1"><option value="active">Active</option><option value="inactive">Inactive</option><option value="retired">Retired</option></select>
                <button className="rounded border px-2 py-1">Update</button>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
