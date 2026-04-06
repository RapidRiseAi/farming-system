BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.farm_incident_number_seq;

ALTER TABLE public.farm_incidents
  ADD COLUMN IF NOT EXISTS incident_number text,
  ADD COLUMN IF NOT EXISTS incident_class text NOT NULL DEFAULT 'safety' CHECK (incident_class IN ('safety','security_theft','animal_health','crop_health','utility_failure','environmental','quality','visitor','vehicle_accident')),
  ADD COLUMN IF NOT EXISTS location_area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS root_cause_category text,
  ADD COLUMN IF NOT EXISTS closure_summary text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'farm_incidents_status_check'
      AND conrelid = 'public.farm_incidents'::regclass
  ) THEN
    ALTER TABLE public.farm_incidents DROP CONSTRAINT farm_incidents_status_check;
  END IF;
END $$;

ALTER TABLE public.farm_incidents
  ADD CONSTRAINT farm_incidents_status_check CHECK (status IN ('reported','under_response','contained','under_investigation','closed'));

ALTER TABLE public.farm_incidents
  ADD CONSTRAINT farm_incidents_closed_requires_summary CHECK (status <> 'closed' OR closure_summary IS NOT NULL);

ALTER TABLE public.farm_incidents
  ALTER COLUMN status SET DEFAULT 'reported';

UPDATE public.farm_incidents
SET status = CASE status
  WHEN 'open' THEN 'reported'
  WHEN 'investigating' THEN 'under_investigation'
  WHEN 'resolved' THEN 'contained'
  ELSE status
END;

UPDATE public.farm_incidents
SET incident_number = CONCAT('INC-', TO_CHAR(created_at, 'YYYY'), '-', LPAD((nextval('public.farm_incident_number_seq'))::text, 6, '0'))
WHERE incident_number IS NULL;

ALTER TABLE public.farm_incidents
  ALTER COLUMN incident_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS farm_incidents_incident_number_idx ON public.farm_incidents(incident_number);
CREATE INDEX IF NOT EXISTS farm_incidents_location_area_idx ON public.farm_incidents(location_area_id);

CREATE OR REPLACE FUNCTION public.assign_farm_incident_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.incident_number IS NULL OR btrim(NEW.incident_number) = '' THEN
    NEW.incident_number := CONCAT('INC-', TO_CHAR(COALESCE(NEW.occurred_at, now()), 'YYYY'), '-', LPAD((nextval('public.farm_incident_number_seq'))::text, 6, '0'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS farm_incidents_assign_number ON public.farm_incidents;
CREATE TRIGGER farm_incidents_assign_number
BEFORE INSERT ON public.farm_incidents
FOR EACH ROW EXECUTE FUNCTION public.assign_farm_incident_number();

CREATE TABLE IF NOT EXISTS public.farm_incident_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.farm_incidents(id) ON DELETE CASCADE,
  impacted_entity_type text NOT NULL CHECK (impacted_entity_type IN ('person','animal','asset')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  livestock_log_id uuid REFERENCES public.livestock_logs(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (impacted_entity_type = 'person' AND profile_id IS NOT NULL AND livestock_log_id IS NULL AND asset_id IS NULL)
    OR (impacted_entity_type = 'animal' AND profile_id IS NULL AND livestock_log_id IS NOT NULL AND asset_id IS NULL)
    OR (impacted_entity_type = 'asset' AND profile_id IS NULL AND livestock_log_id IS NULL AND asset_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_incident_impacts_unique_idx
  ON public.farm_incident_impacts(incident_id, impacted_entity_type, profile_id, livestock_log_id, asset_id);
CREATE INDEX IF NOT EXISTS farm_incident_impacts_workshop_idx
  ON public.farm_incident_impacts(workshop_account_id, incident_id);

ALTER TABLE public.farm_incident_impacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_incident_impacts_staff_all ON public.farm_incident_impacts FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

COMMIT;
