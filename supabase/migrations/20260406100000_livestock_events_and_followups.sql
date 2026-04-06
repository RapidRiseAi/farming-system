-- Replace livestock_logs with livestock_events and add richer event workflow support.

CREATE TABLE IF NOT EXISTS public.livestock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  herd_id uuid NOT NULL REFERENCES public.livestock_herds(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.farm_tasks(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.farm_sites(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  event_reference text,
  event_type text NOT NULL CHECK (event_type IN ('treatment','vaccination','move','inspection','birth','death','cull','breeding','feed_change','incident')),
  scope text NOT NULL DEFAULT 'herd' CHECK (scope IN ('individual','group','herd','camp')),
  event_date date NOT NULL,
  quantity integer,
  from_area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  to_area_id uuid REFERENCES public.farm_areas(id) ON DELETE SET NULL,
  medicine_input text,
  dose numeric(12,2),
  dose_unit text,
  follow_up_due_date date,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  authorised_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.livestock_events (
  id,
  workshop_account_id,
  herd_id,
  task_id,
  site_id,
  area_id,
  event_reference,
  event_type,
  scope,
  event_date,
  quantity,
  notes,
  created_by,
  created_at
)
SELECT
  l.id,
  l.workshop_account_id,
  l.herd_id,
  l.task_id,
  l.site_id,
  l.area_id,
  CONCAT('LOG-', EXTRACT(EPOCH FROM l.created_at)::bigint::text),
  CASE l.log_type
    WHEN 'movement' THEN 'move'
    WHEN 'mortality' THEN 'death'
    WHEN 'health' THEN 'inspection'
    WHEN 'other' THEN 'incident'
    ELSE l.log_type
  END,
  'herd',
  l.log_date,
  l.quantity,
  l.notes,
  l.created_by,
  l.created_at
FROM public.livestock_logs l
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS livestock_events_workshop_idx ON public.livestock_events(workshop_account_id, event_date DESC);
CREATE INDEX IF NOT EXISTS livestock_events_site_area_idx ON public.livestock_events(site_id, area_id);
CREATE INDEX IF NOT EXISTS livestock_events_follow_up_idx ON public.livestock_events(workshop_account_id, follow_up_due_date);

ALTER TABLE public.livestock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY livestock_events_staff_all ON public.livestock_events FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));
