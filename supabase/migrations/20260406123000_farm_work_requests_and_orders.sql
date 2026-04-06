BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','waiting_approval','approved','actioned','closed','rejected')),
  raised_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  short_description text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  triaged_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  triaged_at timestamptz,
  approval_required boolean NOT NULL DEFAULT true,
  approval_requested_at timestamptz,
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_notes text,
  rejected_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejection_reason text,
  converted_work_order_id uuid,
  conversion_notes text,
  converted_at timestamptz,
  converted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, request_number)
);

CREATE TABLE IF NOT EXISTS public.farm_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  work_order_number text NOT NULL,
  work_request_id uuid REFERENCES public.farm_work_requests(id) ON DELETE SET NULL,
  request_number text,
  work_order_type text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','approved','in_progress','waiting_parts','resolved','closed')),
  raised_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  short_description text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_notes text,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, work_order_number)
);

ALTER TABLE public.farm_work_requests
  ADD CONSTRAINT farm_work_requests_converted_work_order_fk
  FOREIGN KEY (converted_work_order_id)
  REFERENCES public.farm_work_orders(id)
  ON DELETE SET NULL;

ALTER TABLE public.farm_tasks
  ADD COLUMN IF NOT EXISTS farm_work_order_id uuid REFERENCES public.farm_work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS farm_work_requests_workshop_idx ON public.farm_work_requests(workshop_account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_work_requests_site_area_idx ON public.farm_work_requests(site_id, area_id);
CREATE INDEX IF NOT EXISTS farm_work_orders_workshop_idx ON public.farm_work_orders(workshop_account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_work_orders_request_idx ON public.farm_work_orders(work_request_id);
CREATE INDEX IF NOT EXISTS farm_tasks_work_order_idx ON public.farm_tasks(farm_work_order_id);

CREATE TRIGGER farm_work_requests_set_updated_at
BEFORE UPDATE ON public.farm_work_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER farm_work_orders_set_updated_at
BEFORE UPDATE ON public.farm_work_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_work_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_work_requests_staff_all ON public.farm_work_requests FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_work_orders_staff_all ON public.farm_work_orders FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

COMMIT;
