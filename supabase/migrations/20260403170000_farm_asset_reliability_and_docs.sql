BEGIN;

ALTER TABLE public.farm_assets
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_code text,
  ADD COLUMN IF NOT EXISTS qr_token text,
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS assigned_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_interval_type text,
  ADD COLUMN IF NOT EXISTS service_interval_value integer,
  ADD COLUMN IF NOT EXISTS last_service_meter numeric(12,2),
  ADD COLUMN IF NOT EXISTS next_service_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS criticality text,
  ADD COLUMN IF NOT EXISTS downtime_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS downtime_ended_at timestamptz;

UPDATE public.farm_assets
SET
  asset_code = COALESCE(NULLIF(asset_code, ''), 'AST-' || substr(replace(id::text, '-', ''), 1, 8)),
  qr_token = COALESCE(NULLIF(qr_token, ''), replace(gen_random_uuid()::text, '-', '')),
  make = COALESCE(NULLIF(make, ''), 'Unknown'),
  model = COALESCE(NULLIF(model, ''), 'Unknown'),
  serial_number = COALESCE(NULLIF(serial_number, ''), 'Unknown'),
  registration = COALESCE(NULLIF(registration, ''), 'N/A'),
  service_interval_type = COALESCE(NULLIF(service_interval_type, ''), 'days'),
  service_interval_value = COALESCE(service_interval_value, 30),
  last_service_meter = COALESCE(last_service_meter, 0),
  next_service_due_at = COALESCE(next_service_due_at, now() + interval '30 days'),
  criticality = COALESCE(NULLIF(criticality, ''), 'medium');

ALTER TABLE public.farm_assets
  ALTER COLUMN asset_code SET NOT NULL,
  ALTER COLUMN qr_token SET NOT NULL,
  ALTER COLUMN make SET NOT NULL,
  ALTER COLUMN model SET NOT NULL,
  ALTER COLUMN serial_number SET NOT NULL,
  ALTER COLUMN registration SET NOT NULL,
  ALTER COLUMN service_interval_type SET NOT NULL,
  ALTER COLUMN service_interval_value SET NOT NULL,
  ALTER COLUMN last_service_meter SET NOT NULL,
  ALTER COLUMN next_service_due_at SET NOT NULL,
  ALTER COLUMN criticality SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'farm_assets_service_interval_type_check'
      AND conrelid = 'public.farm_assets'::regclass
  ) THEN
    ALTER TABLE public.farm_assets
      ADD CONSTRAINT farm_assets_service_interval_type_check
      CHECK (service_interval_type IN ('hours','odometer_km','days'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'farm_assets_criticality_check'
      AND conrelid = 'public.farm_assets'::regclass
  ) THEN
    ALTER TABLE public.farm_assets
      ADD CONSTRAINT farm_assets_criticality_check
      CHECK (criticality IN ('low','medium','high','critical'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS farm_assets_asset_code_workshop_uidx ON public.farm_assets(workshop_account_id, asset_code);
CREATE UNIQUE INDEX IF NOT EXISTS farm_assets_qr_token_uidx ON public.farm_assets(qr_token);
CREATE INDEX IF NOT EXISTS farm_assets_assigned_profile_idx ON public.farm_assets(assigned_profile_id);
CREATE INDEX IF NOT EXISTS farm_assets_next_service_due_idx ON public.farm_assets(workshop_account_id, next_service_due_at);

CREATE TABLE IF NOT EXISTS public.farm_asset_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'completed' CHECK (event_type IN ('completed','inspection','override')),
  service_at timestamptz NOT NULL DEFAULT now(),
  meter_reading numeric(12,2),
  next_due_at timestamptz,
  override_reason text,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'farm_asset_service_events_override_reason_check'
      AND conrelid = 'public.farm_asset_service_events'::regclass
  ) THEN
    ALTER TABLE public.farm_asset_service_events
      ADD CONSTRAINT farm_asset_service_events_override_reason_check
      CHECK (event_type <> 'override' OR override_reason IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.farm_asset_faults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  summary text NOT NULL,
  details text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closure_summary text,
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'farm_asset_faults_closed_after_started_check'
      AND conrelid = 'public.farm_asset_faults'::regclass
  ) THEN
    ALTER TABLE public.farm_asset_faults
      ADD CONSTRAINT farm_asset_faults_closed_after_started_check
      CHECK (closed_at IS NULL OR closed_at >= started_at);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.farm_asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('manual','certificate','invoice','photo','other')),
  storage_path text NOT NULL,
  note text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_asset_service_events_asset_idx ON public.farm_asset_service_events(workshop_account_id, asset_id, service_at DESC);
CREATE INDEX IF NOT EXISTS farm_asset_faults_asset_idx ON public.farm_asset_faults(workshop_account_id, asset_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS farm_asset_documents_asset_idx ON public.farm_asset_documents(workshop_account_id, asset_id, created_at DESC);

ALTER TABLE public.farm_asset_service_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_asset_faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_asset_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_asset_service_events_staff_all ON public.farm_asset_service_events FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_asset_faults_staff_all ON public.farm_asset_faults FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_asset_documents_staff_all ON public.farm_asset_documents FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

DROP TRIGGER IF EXISTS farm_asset_faults_set_updated_at ON public.farm_asset_faults;
CREATE TRIGGER farm_asset_faults_set_updated_at
BEFORE UPDATE ON public.farm_asset_faults
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
