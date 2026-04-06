BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('asset_service','livestock_followup','document_expiry','task_overdue','incident_overdue')),
  source_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  detail text,
  target_href text,
  assigned_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS farm_reminders_due_idx ON public.farm_reminders(workshop_account_id, status, due_at);
CREATE INDEX IF NOT EXISTS farm_reminders_source_idx ON public.farm_reminders(source_type, source_id);

CREATE TRIGGER farm_reminders_set_updated_at
BEFORE UPDATE ON public.farm_reminders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_reminders_staff_all ON public.farm_reminders FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE OR REPLACE FUNCTION public.upsert_farm_reminder(
  p_workshop_account_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_due_at timestamptz,
  p_severity text,
  p_title text,
  p_detail text,
  p_target_href text,
  p_assigned_profile_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.farm_reminders (
    workshop_account_id, source_type, source_id, due_at, severity, title, detail, target_href, assigned_profile_id, metadata, status, resolved_at
  ) VALUES (
    p_workshop_account_id,
    p_source_type,
    p_source_id,
    p_due_at,
    COALESCE(NULLIF(p_severity, ''), 'medium'),
    p_title,
    p_detail,
    p_target_href,
    p_assigned_profile_id,
    COALESCE(p_metadata, '{}'::jsonb),
    'open',
    NULL
  )
  ON CONFLICT (workshop_account_id, source_type, source_id)
  DO UPDATE SET
    due_at = EXCLUDED.due_at,
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    detail = EXCLUDED.detail,
    target_href = EXCLUDED.target_href,
    assigned_profile_id = EXCLUDED.assigned_profile_id,
    metadata = EXCLUDED.metadata,
    status = CASE
      WHEN public.farm_reminders.status IN ('resolved','dismissed') THEN 'open'
      ELSE public.farm_reminders.status
    END,
    resolved_at = NULL,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_farm_reminder(
  p_workshop_account_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_status text DEFAULT 'resolved'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.farm_reminders
  SET
    status = COALESCE(NULLIF(p_status, ''), 'resolved'),
    resolved_at = now(),
    updated_at = now()
  WHERE workshop_account_id = p_workshop_account_id
    AND source_type = p_source_type
    AND source_id = p_source_id
    AND status <> COALESCE(NULLIF(p_status, ''), 'resolved');
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_farm_reminder_from_asset_service()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.resolve_farm_reminder(OLD.workshop_account_id, 'asset_service', OLD.id, 'resolved');
    RETURN OLD;
  END IF;

  v_due := NEW.next_service_due_at;

  IF v_due IS NOT NULL AND NEW.status <> 'retired' AND v_due <= now() + interval '21 days' THEN
    PERFORM public.upsert_farm_reminder(
      NEW.workshop_account_id,
      'asset_service',
      NEW.id,
      v_due,
      CASE WHEN v_due < now() THEN 'high' ELSE 'medium' END,
      CONCAT('Service due: ', NEW.name),
      CONCAT('Asset ', NEW.asset_code, ' is due for service on ', to_char(v_due AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')),
      CONCAT('/farm/assets/', NEW.id::text),
      NEW.assigned_profile_id,
      jsonb_build_object('asset_code', NEW.asset_code, 'asset_type', NEW.asset_type)
    );
  ELSE
    PERFORM public.resolve_farm_reminder(NEW.workshop_account_id, 'asset_service', NEW.id, 'resolved');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_farm_reminder_from_livestock_followup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.resolve_farm_reminder(OLD.workshop_account_id, 'livestock_followup', OLD.id, 'resolved');
    RETURN OLD;
  END IF;

  v_due := CASE WHEN NEW.follow_up_due_date IS NULL THEN NULL ELSE NEW.follow_up_due_date::timestamptz END;

  IF v_due IS NOT NULL AND v_due <= now() + interval '14 days' THEN
    PERFORM public.upsert_farm_reminder(
      NEW.workshop_account_id,
      'livestock_followup',
      NEW.id,
      v_due,
      CASE WHEN v_due < now() THEN 'high' ELSE 'medium' END,
      CONCAT('Livestock follow-up due: ', COALESCE(NEW.event_reference, NEW.event_type)),
      CONCAT('Follow-up due for ', NEW.event_type, ' event'),
      '/farm/livestock',
      NEW.performed_by,
      jsonb_build_object('event_type', NEW.event_type, 'scope', NEW.scope)
    );
  ELSE
    PERFORM public.resolve_farm_reminder(NEW.workshop_account_id, 'livestock_followup', NEW.id, 'resolved');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_farm_reminder_from_document_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.resolve_farm_reminder(OLD.workshop_account_id, 'document_expiry', OLD.id, 'resolved');
    RETURN OLD;
  END IF;

  v_due := CASE WHEN NEW.expiry_date IS NULL THEN NULL ELSE NEW.expiry_date::timestamptz END;

  IF v_due IS NOT NULL AND NEW.status = 'active' AND v_due <= now() + interval '30 days' THEN
    PERFORM public.upsert_farm_reminder(
      NEW.workshop_account_id,
      'document_expiry',
      NEW.id,
      v_due,
      CASE WHEN v_due < now() THEN 'critical' ELSE 'high' END,
      CONCAT('Document expiry: ', NEW.title),
      CONCAT('Document ', NEW.document_number, ' expires on ', NEW.expiry_date::text),
      CONCAT('/farm/documents/', NEW.id::text),
      NEW.owner_profile_id,
      jsonb_build_object('document_type', NEW.document_type, 'document_number', NEW.document_number)
    );
  ELSE
    PERFORM public.resolve_farm_reminder(NEW.workshop_account_id, 'document_expiry', NEW.id, 'resolved');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_farm_reminder_from_task_overdue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.resolve_farm_reminder(OLD.workshop_account_id, 'task_overdue', OLD.id, 'resolved');
    RETURN OLD;
  END IF;

  v_due := NEW.due_at;

  IF v_due IS NOT NULL AND NEW.status IN ('open','in_progress','blocked') AND v_due < now() THEN
    PERFORM public.upsert_farm_reminder(
      NEW.workshop_account_id,
      'task_overdue',
      NEW.id,
      v_due,
      CASE NEW.priority WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
      CONCAT('Task overdue: ', NEW.title),
      CONCAT('Task is overdue since ', to_char(v_due AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')),
      CONCAT('/farm/tasks/', NEW.id::text),
      NEW.created_by,
      jsonb_build_object('priority', NEW.priority, 'task_type', NEW.task_type)
    );
  ELSE
    PERFORM public.resolve_farm_reminder(NEW.workshop_account_id, 'task_overdue', NEW.id, 'resolved');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_farm_reminder_from_incident_overdue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.resolve_farm_reminder(OLD.workshop_account_id, 'incident_overdue', OLD.id, 'resolved');
    RETURN OLD;
  END IF;

  v_due := NEW.occurred_at + interval '24 hours';

  IF NEW.status IN ('reported','under_response','contained','under_investigation') AND v_due < now() THEN
    PERFORM public.upsert_farm_reminder(
      NEW.workshop_account_id,
      'incident_overdue',
      NEW.id,
      v_due,
      CASE NEW.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
      CONCAT('Incident overdue: ', NEW.title),
      CONCAT('Incident ', NEW.incident_number, ' still open after SLA window'),
      '/farm/incidents',
      NEW.owner_profile_id,
      jsonb_build_object('incident_class', NEW.incident_class, 'incident_type', NEW.incident_type, 'severity', NEW.severity)
    );
  ELSE
    PERFORM public.resolve_farm_reminder(NEW.workshop_account_id, 'incident_overdue', NEW.id, 'resolved');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farm_asset_service_reminders ON public.farm_assets;
CREATE TRIGGER trg_farm_asset_service_reminders
AFTER INSERT OR UPDATE OR DELETE ON public.farm_assets
FOR EACH ROW EXECUTE FUNCTION public.sync_farm_reminder_from_asset_service();

DROP TRIGGER IF EXISTS trg_livestock_followup_reminders ON public.livestock_events;
CREATE TRIGGER trg_livestock_followup_reminders
AFTER INSERT OR UPDATE OR DELETE ON public.livestock_events
FOR EACH ROW EXECUTE FUNCTION public.sync_farm_reminder_from_livestock_followup();

DROP TRIGGER IF EXISTS trg_document_expiry_reminders ON public.farm_documents;
CREATE TRIGGER trg_document_expiry_reminders
AFTER INSERT OR UPDATE OR DELETE ON public.farm_documents
FOR EACH ROW EXECUTE FUNCTION public.sync_farm_reminder_from_document_expiry();

DROP TRIGGER IF EXISTS trg_task_overdue_reminders ON public.farm_tasks;
CREATE TRIGGER trg_task_overdue_reminders
AFTER INSERT OR UPDATE OR DELETE ON public.farm_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_farm_reminder_from_task_overdue();

DROP TRIGGER IF EXISTS trg_incident_overdue_reminders ON public.farm_incidents;
CREATE TRIGGER trg_incident_overdue_reminders
AFTER INSERT OR UPDATE OR DELETE ON public.farm_incidents
FOR EACH ROW EXECUTE FUNCTION public.sync_farm_reminder_from_incident_overdue();

CREATE OR REPLACE FUNCTION public.refresh_farm_reminders_for_workshop(p_workshop_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.farm_reminders (workshop_account_id, source_type, source_id, due_at, severity, title, detail, target_href, assigned_profile_id, metadata, status)
  SELECT
    fa.workshop_account_id,
    'asset_service',
    fa.id,
    fa.next_service_due_at,
    CASE WHEN fa.next_service_due_at < now() THEN 'high' ELSE 'medium' END,
    CONCAT('Service due: ', fa.name),
    CONCAT('Asset ', fa.asset_code, ' is due for service'),
    CONCAT('/farm/assets/', fa.id::text),
    fa.assigned_profile_id,
    jsonb_build_object('asset_code', fa.asset_code),
    'open'
  FROM public.farm_assets fa
  WHERE fa.workshop_account_id = p_workshop_account_id
    AND fa.status <> 'retired'
    AND fa.next_service_due_at IS NOT NULL
    AND fa.next_service_due_at <= now() + interval '21 days'
  ON CONFLICT (workshop_account_id, source_type, source_id) DO UPDATE
  SET due_at = EXCLUDED.due_at, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail, target_href = EXCLUDED.target_href, assigned_profile_id = EXCLUDED.assigned_profile_id, metadata = EXCLUDED.metadata,
      status = CASE WHEN farm_reminders.status IN ('resolved','dismissed') THEN 'open' ELSE farm_reminders.status END,
      resolved_at = NULL,
      updated_at = now();

  INSERT INTO public.farm_reminders (workshop_account_id, source_type, source_id, due_at, severity, title, detail, target_href, assigned_profile_id, metadata, status)
  SELECT
    le.workshop_account_id,
    'livestock_followup',
    le.id,
    le.follow_up_due_date::timestamptz,
    CASE WHEN le.follow_up_due_date::timestamptz < now() THEN 'high' ELSE 'medium' END,
    CONCAT('Livestock follow-up due: ', COALESCE(le.event_reference, le.event_type)),
    CONCAT('Follow-up due for ', le.event_type),
    '/farm/livestock',
    le.performed_by,
    jsonb_build_object('event_type', le.event_type),
    'open'
  FROM public.livestock_events le
  WHERE le.workshop_account_id = p_workshop_account_id
    AND le.follow_up_due_date IS NOT NULL
    AND le.follow_up_due_date::timestamptz <= now() + interval '14 days'
  ON CONFLICT (workshop_account_id, source_type, source_id) DO UPDATE
  SET due_at = EXCLUDED.due_at, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail, target_href = EXCLUDED.target_href, assigned_profile_id = EXCLUDED.assigned_profile_id, metadata = EXCLUDED.metadata,
      status = CASE WHEN farm_reminders.status IN ('resolved','dismissed') THEN 'open' ELSE farm_reminders.status END,
      resolved_at = NULL,
      updated_at = now();

  INSERT INTO public.farm_reminders (workshop_account_id, source_type, source_id, due_at, severity, title, detail, target_href, assigned_profile_id, metadata, status)
  SELECT
    fd.workshop_account_id,
    'document_expiry',
    fd.id,
    fd.expiry_date::timestamptz,
    CASE WHEN fd.expiry_date::timestamptz < now() THEN 'critical' ELSE 'high' END,
    CONCAT('Document expiry: ', fd.title),
    CONCAT('Document ', fd.document_number, ' expiry approaching'),
    CONCAT('/farm/documents/', fd.id::text),
    fd.owner_profile_id,
    jsonb_build_object('document_type', fd.document_type),
    'open'
  FROM public.farm_documents fd
  WHERE fd.workshop_account_id = p_workshop_account_id
    AND fd.status = 'active'
    AND fd.expiry_date IS NOT NULL
    AND fd.expiry_date::timestamptz <= now() + interval '30 days'
  ON CONFLICT (workshop_account_id, source_type, source_id) DO UPDATE
  SET due_at = EXCLUDED.due_at, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail, target_href = EXCLUDED.target_href, assigned_profile_id = EXCLUDED.assigned_profile_id, metadata = EXCLUDED.metadata,
      status = CASE WHEN farm_reminders.status IN ('resolved','dismissed') THEN 'open' ELSE farm_reminders.status END,
      resolved_at = NULL,
      updated_at = now();

  INSERT INTO public.farm_reminders (workshop_account_id, source_type, source_id, due_at, severity, title, detail, target_href, assigned_profile_id, metadata, status)
  SELECT
    ft.workshop_account_id,
    'task_overdue',
    ft.id,
    ft.due_at,
    CASE ft.priority WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
    CONCAT('Task overdue: ', ft.title),
    'Task overdue queue item',
    CONCAT('/farm/tasks/', ft.id::text),
    ft.created_by,
    jsonb_build_object('priority', ft.priority),
    'open'
  FROM public.farm_tasks ft
  WHERE ft.workshop_account_id = p_workshop_account_id
    AND ft.due_at IS NOT NULL
    AND ft.due_at < now()
    AND ft.status IN ('open','in_progress','blocked')
  ON CONFLICT (workshop_account_id, source_type, source_id) DO UPDATE
  SET due_at = EXCLUDED.due_at, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail, target_href = EXCLUDED.target_href, assigned_profile_id = EXCLUDED.assigned_profile_id, metadata = EXCLUDED.metadata,
      status = CASE WHEN farm_reminders.status IN ('resolved','dismissed') THEN 'open' ELSE farm_reminders.status END,
      resolved_at = NULL,
      updated_at = now();

  INSERT INTO public.farm_reminders (workshop_account_id, source_type, source_id, due_at, severity, title, detail, target_href, assigned_profile_id, metadata, status)
  SELECT
    fi.workshop_account_id,
    'incident_overdue',
    fi.id,
    fi.occurred_at + interval '24 hours',
    CASE fi.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
    CONCAT('Incident overdue: ', fi.title),
    CONCAT('Incident ', fi.incident_number, ' exceeded response SLA'),
    '/farm/incidents',
    fi.owner_profile_id,
    jsonb_build_object('incident_type', fi.incident_type),
    'open'
  FROM public.farm_incidents fi
  WHERE fi.workshop_account_id = p_workshop_account_id
    AND fi.status IN ('reported','under_response','contained','under_investigation')
    AND fi.occurred_at + interval '24 hours' < now()
  ON CONFLICT (workshop_account_id, source_type, source_id) DO UPDATE
  SET due_at = EXCLUDED.due_at, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail, target_href = EXCLUDED.target_href, assigned_profile_id = EXCLUDED.assigned_profile_id, metadata = EXCLUDED.metadata,
      status = CASE WHEN farm_reminders.status IN ('resolved','dismissed') THEN 'open' ELSE farm_reminders.status END,
      resolved_at = NULL,
      updated_at = now();

  UPDATE public.farm_reminders fr
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE fr.workshop_account_id = p_workshop_account_id
    AND fr.source_type = 'asset_service'
    AND fr.status IN ('open','acknowledged')
    AND NOT EXISTS (
      SELECT 1 FROM public.farm_assets fa
      WHERE fa.id = fr.source_id
        AND fa.workshop_account_id = p_workshop_account_id
        AND fa.status <> 'retired'
        AND fa.next_service_due_at IS NOT NULL
        AND fa.next_service_due_at <= now() + interval '21 days'
    );

  UPDATE public.farm_reminders fr
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE fr.workshop_account_id = p_workshop_account_id
    AND fr.source_type = 'livestock_followup'
    AND fr.status IN ('open','acknowledged')
    AND NOT EXISTS (
      SELECT 1 FROM public.livestock_events le
      WHERE le.id = fr.source_id
        AND le.workshop_account_id = p_workshop_account_id
        AND le.follow_up_due_date IS NOT NULL
        AND le.follow_up_due_date::timestamptz <= now() + interval '14 days'
    );

  UPDATE public.farm_reminders fr
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE fr.workshop_account_id = p_workshop_account_id
    AND fr.source_type = 'document_expiry'
    AND fr.status IN ('open','acknowledged')
    AND NOT EXISTS (
      SELECT 1 FROM public.farm_documents fd
      WHERE fd.id = fr.source_id
        AND fd.workshop_account_id = p_workshop_account_id
        AND fd.status = 'active'
        AND fd.expiry_date IS NOT NULL
        AND fd.expiry_date::timestamptz <= now() + interval '30 days'
    );

  UPDATE public.farm_reminders fr
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE fr.workshop_account_id = p_workshop_account_id
    AND fr.source_type = 'task_overdue'
    AND fr.status IN ('open','acknowledged')
    AND NOT EXISTS (
      SELECT 1 FROM public.farm_tasks ft
      WHERE ft.id = fr.source_id
        AND ft.workshop_account_id = p_workshop_account_id
        AND ft.due_at IS NOT NULL
        AND ft.due_at < now()
        AND ft.status IN ('open','in_progress','blocked')
    );

  UPDATE public.farm_reminders fr
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE fr.workshop_account_id = p_workshop_account_id
    AND fr.source_type = 'incident_overdue'
    AND fr.status IN ('open','acknowledged')
    AND NOT EXISTS (
      SELECT 1 FROM public.farm_incidents fi
      WHERE fi.id = fr.source_id
        AND fi.workshop_account_id = p_workshop_account_id
        AND fi.status IN ('reported','under_response','contained','under_investigation')
        AND fi.occurred_at + interval '24 hours' < now()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_farm_reminders_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.workshop_accounts LOOP
    PERFORM public.refresh_farm_reminders_for_workshop(r.id);
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh_farm_reminders_every_30min');
    PERFORM cron.schedule('refresh_farm_reminders_every_30min', '*/30 * * * *', $$SELECT public.refresh_farm_reminders_all();$$);
  END IF;
END $$;

COMMIT;
