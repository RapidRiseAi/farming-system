-- Compatibility layer for farm-native naming while legacy workshop/profile tables remain canonical.
-- Phase 1 (this migration): read aliases via views.
-- Phase 2: clients switch to farm_* names and dual-write if/when farm_account_id columns are introduced.
-- Phase 3: remove workshop_* naming after all consumers are migrated.

CREATE OR REPLACE VIEW public.farm_accounts AS
SELECT
  wa.id AS farm_account_id,
  wa.id,
  wa.name,
  wa.slug,
  wa.plan,
  wa.created_at,
  wa.updated_at
FROM public.workshop_accounts wa;

CREATE OR REPLACE VIEW public.farm_profiles AS
SELECT
  p.id,
  p.role,
  p.display_name,
  p.avatar_url,
  p.phone,
  p.customer_account_id,
  p.created_at,
  p.updated_at,
  p.workshop_account_id AS farm_account_id,
  p.workshop_account_id
FROM public.profiles p;

CREATE OR REPLACE FUNCTION public.current_farm_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT fp.farm_account_id
  FROM public.farm_profiles fp
  WHERE fp.id = auth.uid()
  LIMIT 1;
$$;

GRANT SELECT ON public.farm_accounts TO authenticated;
GRANT SELECT ON public.farm_profiles TO authenticated;
