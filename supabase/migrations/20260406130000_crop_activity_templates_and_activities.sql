CREATE TABLE IF NOT EXISTS public.crop_activity_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  activity_type text NOT NULL,
  field_id uuid REFERENCES public.crop_fields(id) ON DELETE SET NULL,
  block_name text,
  crop_name text,
  cultivar text,
  season text,
  planned_date date,
  operator_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_name text,
  equipment_used text,
  input_product text,
  input_rate numeric(12,3),
  input_unit text,
  conditions text,
  observed_issues text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','blocked','cancelled')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crop_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.crop_activity_templates(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  field_id uuid REFERENCES public.crop_fields(id) ON DELETE SET NULL,
  block_name text,
  crop_name text,
  cultivar text,
  season text,
  planned_date date,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  operator_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_name text,
  equipment_used text,
  input_product text,
  input_rate numeric(12,3),
  input_unit text,
  conditions text,
  observed_issues text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','blocked','cancelled')),
  supervisor_signoff_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  supervisor_signoff_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at)
);

CREATE INDEX IF NOT EXISTS crop_activity_templates_workshop_idx
  ON public.crop_activity_templates(workshop_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crop_activities_workshop_idx
  ON public.crop_activities(workshop_account_id, status, planned_date DESC);

ALTER TABLE public.crop_activity_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY crop_activity_templates_staff_all ON public.crop_activity_templates FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY crop_activities_staff_all ON public.crop_activities FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));
