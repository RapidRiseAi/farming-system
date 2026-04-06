BEGIN;

ALTER TABLE public.farm_assets
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

UPDATE public.farm_assets
SET status = 'active'
WHERE status IS NULL
   OR status NOT IN ('active', 'maintenance_due', 'in_repair', 'retired');

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.farm_assets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND conname <> 'farm_assets_status_check'
  LOOP
    EXECUTE format('ALTER TABLE public.farm_assets DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.farm_assets'::regclass
      AND conname = 'farm_assets_status_check'
  ) THEN
    ALTER TABLE public.farm_assets
      ADD CONSTRAINT farm_assets_status_check
      CHECK (status IN ('active', 'maintenance_due', 'in_repair', 'retired'));
  END IF;
END $$;

UPDATE public.farm_assets
SET retired_at = CASE
  WHEN status = 'retired' THEN COALESCE(retired_at, updated_at, created_at, now())
  ELSE NULL
END;

COMMIT;
