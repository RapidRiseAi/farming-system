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
  ADD COLUMN IF NOT EXISTS service_interval_type text CHECK (service_interval_type IN ('hours','distance_km','days')),
  ADD COLUMN IF NOT EXISTS service_interval_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS last_service_meter numeric(12,2),
  ADD COLUMN IF NOT EXISTS next_service_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_due_override_reason text,
  ADD COLUMN IF NOT EXISTS criticality text CHECK (criticality IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS downtime_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS downtime_ended_at timestamptz;

UPDATE public.farm_assets
SET
  asset_code = COALESCE(NULLIF(asset_code, ''), code, id::text),
  qr_token = COALESCE(NULLIF(qr_token, ''), encode(gen_random_bytes(12), 'hex')),
  make = COALESCE(make, ''),
  model = COALESCE(model, ''),
  serial_number = COALESCE(serial_number, ''),
  registration = COALESCE(registration, ''),
  service_interval_type = COALESCE(service_interval_type, 'hours'),
  service_interval_value = COALESCE(service_interval_value, 250),
  last_service_meter = COALESCE(last_service_meter, 0),
  criticality = COALESCE(criticality, 'medium');

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
  ALTER COLUMN criticality SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS farm_assets_asset_code_unique_idx ON public.farm_assets(workshop_account_id, asset_code);
CREATE UNIQUE INDEX IF NOT EXISTS farm_assets_qr_token_unique_idx ON public.farm_assets(qr_token);
CREATE INDEX IF NOT EXISTS farm_assets_assigned_profile_idx ON public.farm_assets(assigned_profile_id);
CREATE INDEX IF NOT EXISTS farm_assets_due_idx ON public.farm_assets(workshop_account_id, next_service_due_at);
CREATE INDEX IF NOT EXISTS farm_assets_downtime_idx ON public.farm_assets(workshop_account_id, downtime_started_at);

CREATE TABLE IF NOT EXISTS public.farm_asset_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('service_completed','meter_update','due_override')),
  meter_type text CHECK (meter_type IN ('hours','distance_km')),
  meter_reading numeric(12,2),
  performed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  override_reason text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_asset_faults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  downtime_started_at timestamptz,
  downtime_ended_at timestamptz,
  closure_summary text,
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.farm_assets(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('manual','invoice','warranty','inspection','service_report','photo','other')),
  title text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_service_event_id uuid REFERENCES public.farm_asset_service_events(id) ON DELETE SET NULL,
  linked_fault_id uuid REFERENCES public.farm_asset_faults(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER farm_asset_faults_set_updated_at
BEFORE UPDATE ON public.farm_asset_faults
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS farm_asset_service_events_asset_idx ON public.farm_asset_service_events(asset_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS farm_asset_faults_asset_idx ON public.farm_asset_faults(asset_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_asset_documents_asset_idx ON public.farm_asset_documents(asset_id, created_at DESC);

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

COMMIT;
