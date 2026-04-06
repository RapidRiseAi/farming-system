BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  visitor_type text NOT NULL DEFAULT 'person' CHECK (visitor_type IN ('person','organization','contractor','delivery','regulator','other')),
  visitor_name text NOT NULL,
  visitor_org text,
  id_registration text,
  purpose text NOT NULL,
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  escort_required boolean NOT NULL DEFAULT false,
  biosecurity_complete boolean NOT NULL DEFAULT false,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  notes text,
  exception_notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (checked_out_at IS NULL OR checked_in_at IS NOT NULL),
  CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at)
);

CREATE TABLE IF NOT EXISTS public.farm_visit_permitted_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  farm_visit_id uuid NOT NULL REFERENCES public.farm_visits(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.farm_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_visit_id, area_id)
);

CREATE INDEX IF NOT EXISTS farm_visits_workshop_idx
  ON public.farm_visits(workshop_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_visits_open_idx
  ON public.farm_visits(workshop_account_id, checked_out_at, checked_in_at);
CREATE INDEX IF NOT EXISTS farm_visits_exception_idx
  ON public.farm_visits(workshop_account_id, biosecurity_complete, escort_required)
  WHERE exception_notes IS NOT NULL OR biosecurity_complete = false;
CREATE INDEX IF NOT EXISTS farm_visit_permitted_areas_workshop_idx
  ON public.farm_visit_permitted_areas(workshop_account_id, farm_visit_id);

CREATE TRIGGER farm_visits_set_updated_at
BEFORE UPDATE ON public.farm_visits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_visit_permitted_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_visits_staff_all ON public.farm_visits FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_visit_permitted_areas_staff_all ON public.farm_visit_permitted_areas FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

COMMIT;
