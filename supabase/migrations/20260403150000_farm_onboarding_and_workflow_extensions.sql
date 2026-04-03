BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE UNIQUE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sample_data_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER farm_onboarding_progress_set_updated_at
BEFORE UPDATE ON public.farm_onboarding_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_onboarding_progress_staff_all ON public.farm_onboarding_progress FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

ALTER TABLE public.farm_incidents
  ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS farm_incidents_owner_profile_idx ON public.farm_incidents(owner_profile_id, status);

COMMIT;
