-- Farm operations foundation: RBAC expansion + farm-native modules

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND t.typtype = 'e'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'owner';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'farm_manager';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'supervisor';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'operator';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin_clerk';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contractor';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'viewer';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_farm_staff_for(p_workshop_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.workshop_account_id = p_workshop_account_id
      AND p.role::text IN ('admin','technician','owner','farm_manager','supervisor','operator','admin_clerk','contractor','viewer')
  );
$$;

CREATE TABLE IF NOT EXISTS public.farm_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('vehicle','equipment','building','irrigation','field','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance_due','in_repair','retired')),
  site_name text,
  purchase_date date,
  commission_date date,
  current_hours numeric(12,2),
  current_odometer_km integer,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.farm_assets(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'general' CHECK (task_type IN ('general','maintenance','inspection','crop','livestock','incident_followup','logistics')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','done','verified','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  due_at timestamptz,
  requires_image_proof boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.farm_tasks(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.farm_task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.farm_tasks(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_task_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.farm_tasks(id) ON DELETE CASCADE,
  proof_type text NOT NULL CHECK (proof_type IN ('image','video','text','document')),
  quality text NOT NULL CHECK (quality IN ('high','medium','low')),
  storage_path text,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((storage_path IS NOT NULL) OR (note IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.farm_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.farm_assets(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.farm_tasks(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  incident_type text NOT NULL CHECK (incident_type IN ('safety','biosecurity','equipment','environment','security','other')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text NOT NULL,
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  corrective_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.farm_assets(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.farm_tasks(id) ON DELETE SET NULL,
  logged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('diesel','fuel','maintenance','parts','feed','veterinary','utilities','supplies','other')),
  vendor_name text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  payment_method text,
  card_reference text,
  receipt_storage_path text,
  notes text,
  purchased_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','exported')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workforce_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  worker_type text NOT NULL CHECK (worker_type IN ('employee','contractor')),
  active boolean NOT NULL DEFAULT true,
  mobile_number text,
  emergency_contact text,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workforce_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  workforce_profile_id uuid NOT NULL REFERENCES public.workforce_profiles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.farm_tasks(id) ON DELETE SET NULL,
  clock_in_at timestamptz NOT NULL,
  clock_out_at timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  entry_type text NOT NULL DEFAULT 'work' CHECK (entry_type IN ('work','overtime','sick_leave','annual_leave','unpaid_leave')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crop_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  field_code text,
  name text NOT NULL,
  hectares numeric(10,2),
  soil_type text,
  irrigation_type text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','fallow','retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crop_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.crop_fields(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.farm_tasks(id) ON DELETE SET NULL,
  log_type text NOT NULL CHECK (log_type IN ('planting','spraying','fertilizing','irrigation','scouting','harvest','other')),
  log_date date NOT NULL,
  crop_name text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.livestock_herds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  herd_code text,
  species text NOT NULL,
  name text NOT NULL,
  active_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.livestock_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  herd_id uuid NOT NULL REFERENCES public.livestock_herds(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.farm_tasks(id) ON DELETE SET NULL,
  log_type text NOT NULL CHECK (log_type IN ('health','treatment','movement','breeding','mortality','weight','other')),
  log_date date NOT NULL,
  quantity integer,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_entity_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_assets_workshop_idx ON public.farm_assets(workshop_account_id, status);
CREATE INDEX IF NOT EXISTS farm_tasks_workshop_idx ON public.farm_tasks(workshop_account_id, status, due_at);
CREATE INDEX IF NOT EXISTS farm_task_assignments_profile_idx ON public.farm_task_assignments(profile_id);
CREATE INDEX IF NOT EXISTS farm_incidents_workshop_idx ON public.farm_incidents(workshop_account_id, status, severity);
CREATE INDEX IF NOT EXISTS expense_logs_workshop_idx ON public.expense_logs(workshop_account_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS workforce_time_entries_workshop_idx ON public.workforce_time_entries(workshop_account_id, clock_in_at DESC);
CREATE INDEX IF NOT EXISTS crop_logs_workshop_idx ON public.crop_logs(workshop_account_id, log_date DESC);
CREATE INDEX IF NOT EXISTS livestock_logs_workshop_idx ON public.livestock_logs(workshop_account_id, log_date DESC);
CREATE INDEX IF NOT EXISTS farm_entity_history_workshop_idx ON public.farm_entity_history(workshop_account_id, created_at DESC);

ALTER TABLE public.farm_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_task_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestock_herds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestock_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_entity_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_assets_staff_all ON public.farm_assets FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_tasks_staff_select ON public.farm_tasks FOR SELECT TO authenticated
USING (
  public.is_farm_staff_for(workshop_account_id)
  OR EXISTS (
    SELECT 1 FROM public.farm_task_assignments a
    WHERE a.task_id = farm_tasks.id
      AND a.profile_id = auth.uid()
  )
);

CREATE POLICY farm_tasks_staff_mutate ON public.farm_tasks FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_task_assignments_select ON public.farm_task_assignments FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_assignments.task_id
      AND public.is_farm_staff_for(t.workshop_account_id)
  )
);

CREATE POLICY farm_task_assignments_mutate ON public.farm_task_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_assignments.task_id
      AND public.is_farm_staff_for(t.workshop_account_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_assignments.task_id
      AND public.is_farm_staff_for(t.workshop_account_id)
  )
);

CREATE POLICY farm_task_updates_all ON public.farm_task_updates FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_updates.task_id
      AND (
        public.is_farm_staff_for(t.workshop_account_id)
        OR EXISTS (
          SELECT 1 FROM public.farm_task_assignments a
          WHERE a.task_id = t.id
            AND a.profile_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_updates.task_id
      AND (
        public.is_farm_staff_for(t.workshop_account_id)
        OR EXISTS (
          SELECT 1 FROM public.farm_task_assignments a
          WHERE a.task_id = t.id
            AND a.profile_id = auth.uid()
        )
      )
  )
);

CREATE POLICY farm_task_proofs_all ON public.farm_task_proofs FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_proofs.task_id
      AND (
        public.is_farm_staff_for(t.workshop_account_id)
        OR EXISTS (
          SELECT 1 FROM public.farm_task_assignments a
          WHERE a.task_id = t.id
            AND a.profile_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.farm_tasks t
    WHERE t.id = farm_task_proofs.task_id
      AND (
        public.is_farm_staff_for(t.workshop_account_id)
        OR EXISTS (
          SELECT 1 FROM public.farm_task_assignments a
          WHERE a.task_id = t.id
            AND a.profile_id = auth.uid()
        )
      )
  )
);

CREATE POLICY farm_incidents_staff_all ON public.farm_incidents FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY expense_logs_staff_all ON public.expense_logs FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY workforce_profiles_staff_all ON public.workforce_profiles FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY workforce_time_entries_staff_all ON public.workforce_time_entries FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY crop_fields_staff_all ON public.crop_fields FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY crop_logs_staff_all ON public.crop_logs FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY livestock_herds_staff_all ON public.livestock_herds FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY livestock_logs_staff_all ON public.livestock_logs FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_entity_history_staff_all ON public.farm_entity_history FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));
