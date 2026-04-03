-- Farm structure entities: sites, areas, production units, and optional site/area links.

CREATE TABLE IF NOT EXISTS public.farm_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  province text,
  centroid point,
  boundary_geojson jsonb,
  emergency_contacts text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, code)
);

CREATE TABLE IF NOT EXISTS public.farm_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL,
  parent_area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  area_type text NOT NULL CHECK (area_type IN ('field','orchard','greenhouse','camp','feedlot','dam','borehole','workshop','packhouse','store','residence','gate','solar_array')),
  centroid point,
  boundary_geojson jsonb,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, code)
);

CREATE TABLE IF NOT EXISTS public.farm_production_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  internal_code text,
  external_code text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','retired')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, internal_code),
  UNIQUE(workshop_account_id, external_code)
);

CREATE INDEX IF NOT EXISTS farm_sites_workshop_idx ON public.farm_sites(workshop_account_id, status);
CREATE INDEX IF NOT EXISTS farm_areas_workshop_idx ON public.farm_areas(workshop_account_id, area_type, active);
CREATE INDEX IF NOT EXISTS farm_areas_site_idx ON public.farm_areas(site_id);
CREATE INDEX IF NOT EXISTS farm_areas_parent_idx ON public.farm_areas(parent_area_id);
CREATE INDEX IF NOT EXISTS farm_production_units_workshop_idx ON public.farm_production_units(workshop_account_id, status);
CREATE INDEX IF NOT EXISTS farm_production_units_site_area_idx ON public.farm_production_units(site_id, area_id);

CREATE TRIGGER farm_sites_set_updated_at
BEFORE UPDATE ON public.farm_sites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER farm_areas_set_updated_at
BEFORE UPDATE ON public.farm_areas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER farm_production_units_set_updated_at
BEFORE UPDATE ON public.farm_production_units
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_production_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_sites_staff_all ON public.farm_sites FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_areas_staff_all ON public.farm_areas FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_production_units_staff_all ON public.farm_production_units FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

ALTER TABLE public.farm_assets ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.farm_assets ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.farm_tasks ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.farm_tasks ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.farm_incidents ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.farm_incidents ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.expense_logs ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.expense_logs ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.workforce_profiles ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.workforce_profiles ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.workforce_time_entries ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.workforce_time_entries ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.crop_fields ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.crop_fields ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.crop_logs ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.crop_logs ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.livestock_herds ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.livestock_herds ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

ALTER TABLE public.livestock_logs ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL;
ALTER TABLE public.livestock_logs ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS farm_assets_site_area_idx ON public.farm_assets(site_id, area_id);
CREATE INDEX IF NOT EXISTS farm_tasks_site_area_idx ON public.farm_tasks(site_id, area_id);
CREATE INDEX IF NOT EXISTS farm_incidents_site_area_idx ON public.farm_incidents(site_id, area_id);
CREATE INDEX IF NOT EXISTS expense_logs_site_area_idx ON public.expense_logs(site_id, area_id);
CREATE INDEX IF NOT EXISTS workforce_profiles_site_area_idx ON public.workforce_profiles(site_id, area_id);
CREATE INDEX IF NOT EXISTS workforce_time_entries_site_area_idx ON public.workforce_time_entries(site_id, area_id);
CREATE INDEX IF NOT EXISTS crop_fields_site_area_idx ON public.crop_fields(site_id, area_id);
CREATE INDEX IF NOT EXISTS crop_logs_site_area_idx ON public.crop_logs(site_id, area_id);
CREATE INDEX IF NOT EXISTS livestock_herds_site_area_idx ON public.livestock_herds(site_id, area_id);
CREATE INDEX IF NOT EXISTS livestock_logs_site_area_idx ON public.livestock_logs(site_id, area_id);
