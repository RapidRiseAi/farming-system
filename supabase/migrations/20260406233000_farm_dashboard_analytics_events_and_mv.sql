BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('maintenance_logged','breakdown_logged','issue_logged','task_completed','reminder_resolved','document_logged')),
  entity_type text NOT NULL,
  entity_id uuid,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_analytics_events_workshop_type_occurred_idx
  ON public.farm_analytics_events(workshop_account_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS farm_analytics_events_entity_idx
  ON public.farm_analytics_events(entity_type, entity_id);

ALTER TABLE public.farm_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_analytics_events_staff_select ON public.farm_analytics_events FOR SELECT TO authenticated
USING (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_analytics_events_staff_insert ON public.farm_analytics_events FOR INSERT TO authenticated
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE OR REPLACE FUNCTION public.track_farm_analytics_event(
  p_workshop_account_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_actor_profile_id uuid,
  p_occurred_at timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_workshop_account_id IS NULL OR p_event_type IS NULL OR p_entity_type IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.farm_analytics_events (
    workshop_account_id,
    event_type,
    entity_type,
    entity_id,
    actor_profile_id,
    occurred_at,
    metadata
  ) VALUES (
    p_workshop_account_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_actor_profile_id,
    COALESCE(p_occurred_at, now()),
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_farm_analytics_faults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.track_farm_analytics_event(
      NEW.workshop_account_id,
      'breakdown_logged',
      'farm_asset_fault',
      NEW.id,
      NEW.reported_by,
      NEW.created_at,
      jsonb_build_object(
        'severity', NEW.severity,
        'status', NEW.status,
        'asset_id', NEW.asset_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_farm_analytics_maintenance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.event_type = 'service_completed' THEN
    PERFORM public.track_farm_analytics_event(
      NEW.workshop_account_id,
      'maintenance_logged',
      'farm_asset_service_event',
      NEW.id,
      NEW.created_by,
      NEW.performed_at,
      jsonb_build_object(
        'asset_id', NEW.asset_id,
        'meter_type', NEW.meter_type,
        'meter_reading', NEW.meter_reading
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_farm_analytics_issues()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_seconds_to_log numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_seconds_to_log := GREATEST(EXTRACT(EPOCH FROM (NEW.created_at - NEW.occurred_at)), 0);

    PERFORM public.track_farm_analytics_event(
      NEW.workshop_account_id,
      'issue_logged',
      'farm_incident',
      NEW.id,
      NEW.reported_by,
      NEW.created_at,
      jsonb_build_object(
        'incident_number', NEW.incident_number,
        'severity', NEW.severity,
        'status', NEW.status,
        'time_to_log_seconds', v_seconds_to_log
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_farm_analytics_task_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_responsible_profile_id uuid;
BEGIN
  IF NEW.status IN ('done','verified') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT fta.profile_id
    INTO v_responsible_profile_id
    FROM public.farm_task_assignments fta
    WHERE fta.task_id = NEW.id
    ORDER BY fta.assigned_at ASC
    LIMIT 1;

    PERFORM public.track_farm_analytics_event(
      NEW.workshop_account_id,
      'task_completed',
      'farm_task',
      NEW.id,
      COALESCE(NEW.verified_by, v_responsible_profile_id, NEW.created_by),
      COALESCE(NEW.verified_at, NEW.updated_at, now()),
      jsonb_build_object(
        'status', NEW.status,
        'completed_at', COALESCE(NEW.verified_at, NEW.updated_at, now()),
        'responsible_profile_id', COALESCE(NEW.verified_by, v_responsible_profile_id, NEW.created_by),
        'task_type', NEW.task_type,
        'priority', NEW.priority
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_farm_analytics_document_logged()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.track_farm_analytics_event(
      NEW.workshop_account_id,
      'document_logged',
      'farm_document',
      NEW.id,
      NEW.created_by,
      NEW.created_at,
      jsonb_build_object(
        'document_type', NEW.document_type,
        'status', NEW.status,
        'expiry_date', NEW.expiry_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_farm_analytics_reminder_resolution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('resolved','dismissed') THEN
    PERFORM public.track_farm_analytics_event(
      NEW.workshop_account_id,
      'reminder_resolved',
      'farm_reminder',
      NEW.id,
      COALESCE(NEW.assigned_profile_id, auth.uid()),
      COALESCE(NEW.resolved_at, NEW.updated_at, now()),
      jsonb_build_object(
        'source_type', NEW.source_type,
        'severity', NEW.severity,
        'status', NEW.status,
        'due_at', NEW.due_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farm_analytics_faults ON public.farm_asset_faults;
CREATE TRIGGER trg_farm_analytics_faults
AFTER INSERT ON public.farm_asset_faults
FOR EACH ROW EXECUTE FUNCTION public.trg_farm_analytics_faults();

DROP TRIGGER IF EXISTS trg_farm_analytics_maintenance ON public.farm_asset_service_events;
CREATE TRIGGER trg_farm_analytics_maintenance
AFTER INSERT ON public.farm_asset_service_events
FOR EACH ROW EXECUTE FUNCTION public.trg_farm_analytics_maintenance();

DROP TRIGGER IF EXISTS trg_farm_analytics_issues ON public.farm_incidents;
CREATE TRIGGER trg_farm_analytics_issues
AFTER INSERT ON public.farm_incidents
FOR EACH ROW EXECUTE FUNCTION public.trg_farm_analytics_issues();

DROP TRIGGER IF EXISTS trg_farm_analytics_task_completion ON public.farm_tasks;
CREATE TRIGGER trg_farm_analytics_task_completion
AFTER INSERT OR UPDATE OF status, verified_at, verified_by, updated_at ON public.farm_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_farm_analytics_task_completion();

DROP TRIGGER IF EXISTS trg_farm_analytics_document_logged ON public.farm_documents;
CREATE TRIGGER trg_farm_analytics_document_logged
AFTER INSERT ON public.farm_documents
FOR EACH ROW EXECUTE FUNCTION public.trg_farm_analytics_document_logged();

DROP TRIGGER IF EXISTS trg_farm_analytics_reminder_resolution ON public.farm_reminders;
CREATE TRIGGER trg_farm_analytics_reminder_resolution
AFTER UPDATE OF status, resolved_at, updated_at ON public.farm_reminders
FOR EACH ROW EXECUTE FUNCTION public.trg_farm_analytics_reminder_resolution();

DROP MATERIALIZED VIEW IF EXISTS public.farm_dashboard_analytics_mv;
CREATE MATERIALIZED VIEW public.farm_dashboard_analytics_mv AS
WITH required_document_types AS (
  SELECT unnest(ARRAY['license','permit','inspection','policy','compliance','insurance']::text[]) AS document_type
),
workshops AS (
  SELECT wa.id AS workshop_account_id
  FROM public.workshop_accounts wa
),
event_agg AS (
  SELECT
    fae.workshop_account_id,
    COUNT(*) FILTER (
      WHERE fae.event_type IN ('maintenance_logged','breakdown_logged')
        AND fae.occurred_at >= now() - interval '24 hours'
    ) AS maintenance_breakdown_logged_24h,
    COUNT(*) FILTER (
      WHERE fae.event_type = 'task_completed'
        AND fae.occurred_at >= now() - interval '24 hours'
    ) AS task_completion_24h,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY ((fae.metadata ->> 'time_to_log_seconds')::numeric / 60.0)
    ) FILTER (
      WHERE fae.event_type = 'issue_logged'
        AND (fae.metadata ->> 'time_to_log_seconds') IS NOT NULL
        AND fae.occurred_at >= now() - interval '90 days'
    ) AS median_issue_time_to_log_minutes
  FROM public.farm_analytics_events fae
  GROUP BY fae.workshop_account_id
),
critical_docs AS (
  SELECT
    fd.workshop_account_id,
    COUNT(DISTINCT fd.document_type) FILTER (
      WHERE fd.status = 'active'
        AND fd.document_type IN (SELECT document_type FROM required_document_types)
    ) AS active_critical_types_covered,
    COUNT(*) FILTER (
      WHERE fd.status = 'active'
        AND fd.document_type IN (SELECT document_type FROM required_document_types)
    ) AS active_critical_docs,
    COUNT(*) FILTER (
      WHERE fd.status = 'active'
        AND fd.document_type IN (SELECT document_type FROM required_document_types)
        AND fd.expiry_date IS NOT NULL
    ) AS active_critical_docs_with_expiry
  FROM public.farm_documents fd
  GROUP BY fd.workshop_account_id
),
reminder_resolution AS (
  SELECT
    fr.workshop_account_id,
    COUNT(*) FILTER (
      WHERE fr.source_type IN ('task_overdue','incident_overdue')
        AND fr.due_at < now()
    ) AS overdue_total,
    COUNT(*) FILTER (
      WHERE fr.source_type IN ('task_overdue','incident_overdue')
        AND fr.due_at < now()
        AND fr.status IN ('resolved','dismissed')
    ) AS overdue_resolved
  FROM public.farm_reminders fr
  GROUP BY fr.workshop_account_id
)
SELECT
  w.workshop_account_id,
  COALESCE(ea.maintenance_breakdown_logged_24h, 0)::bigint AS maintenance_breakdown_logged_24h,
  COALESCE(ea.task_completion_24h, 0)::bigint AS task_completion_24h,
  ROUND(COALESCE(ea.median_issue_time_to_log_minutes, 0)::numeric, 2) AS median_issue_time_to_log_minutes,
  ROUND(
    COALESCE(cd.active_critical_types_covered, 0)::numeric
    / GREATEST((SELECT COUNT(*) FROM required_document_types), 1)::numeric
    * 100,
    2
  ) AS critical_document_coverage_pct,
  ROUND(
    COALESCE(cd.active_critical_docs_with_expiry, 0)::numeric
    / GREATEST(COALESCE(cd.active_critical_docs, 0), 1)::numeric
    * 100,
    2
  ) AS document_expiry_completeness_pct,
  ROUND(
    COALESCE(rr.overdue_resolved, 0)::numeric
    / GREATEST(COALESCE(rr.overdue_total, 0), 1)::numeric
    * 100,
    2
  ) AS overdue_reminder_resolution_rate_pct,
  now() AS refreshed_at
FROM workshops w
LEFT JOIN event_agg ea ON ea.workshop_account_id = w.workshop_account_id
LEFT JOIN critical_docs cd ON cd.workshop_account_id = w.workshop_account_id
LEFT JOIN reminder_resolution rr ON rr.workshop_account_id = w.workshop_account_id;

CREATE UNIQUE INDEX farm_dashboard_analytics_mv_workshop_idx
  ON public.farm_dashboard_analytics_mv(workshop_account_id);

CREATE OR REPLACE VIEW public.farm_task_completion_analytics_v AS
SELECT
  fae.workshop_account_id,
  fae.entity_id AS task_id,
  (fae.metadata ->> 'status') AS status,
  fae.occurred_at AS completed_at,
  COALESCE((fae.metadata ->> 'responsible_profile_id')::uuid, fae.actor_profile_id) AS responsible_profile_id,
  fae.metadata
FROM public.farm_analytics_events fae
WHERE fae.event_type = 'task_completed';

CREATE OR REPLACE FUNCTION public.refresh_farm_dashboard_analytics_mv(p_workshop_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_farm_staff_for(p_workshop_account_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  REFRESH MATERIALIZED VIEW public.farm_dashboard_analytics_mv;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_farm_dashboard_admin_report(p_workshop_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary jsonb;
  v_completions jsonb;
BEGIN
  IF NOT public.is_farm_staff_for(p_workshop_account_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT to_jsonb(mv.*)
  INTO v_summary
  FROM public.farm_dashboard_analytics_mv mv
  WHERE mv.workshop_account_id = p_workshop_account_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'task_id', v.task_id,
        'status', v.status,
        'completed_at', v.completed_at,
        'responsible_profile_id', v.responsible_profile_id,
        'responsible_name', p.full_name
      )
      ORDER BY v.completed_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_completions
  FROM (
    SELECT task_id, status, completed_at, responsible_profile_id
    FROM public.farm_task_completion_analytics_v
    WHERE workshop_account_id = p_workshop_account_id
    ORDER BY completed_at DESC
    LIMIT 50
  ) v
  LEFT JOIN public.profiles p ON p.id = v.responsible_profile_id;

  RETURN jsonb_build_object(
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'task_completions', v_completions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_farm_dashboard_analytics_mv(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_farm_dashboard_admin_report(uuid) TO authenticated;

COMMIT;
