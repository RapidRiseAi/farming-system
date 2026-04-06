BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  request_type text NOT NULL DEFAULT 'general' CHECK (request_type IN ('general','feed','seed','fertilizer','chemical','fuel','spares','packaging','other')),
  requester_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_for_type text NOT NULL DEFAULT 'site' CHECK (requested_for_type IN ('site','area','asset','work_order','task','livestock','other')),
  requested_for_id uuid,
  requested_for_label text,
  need_by_at timestamptz,
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  issued_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','pending_approval','approved','partially_issued','issued','cancelled','rejected')),
  approval_notes text,
  rejection_reason text,
  issue_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, request_number)
);

CREATE TABLE IF NOT EXISTS public.farm_stock_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  stock_request_id uuid NOT NULL REFERENCES public.farm_stock_requests(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  requested_qty numeric(12,2) NOT NULL CHECK (requested_qty > 0),
  unit text NOT NULL,
  issued_qty numeric(12,2) NOT NULL DEFAULT 0 CHECK (issued_qty >= 0),
  item_status text NOT NULL DEFAULT 'requested' CHECK (item_status IN ('requested','approved','partially_issued','issued','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_account_id uuid NOT NULL REFERENCES public.workshop_accounts(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('license','permit','inspection','contract','policy','compliance','sop','manual','warranty','insurance','other')),
  linked_object_type text NOT NULL DEFAULT 'other' CHECK (linked_object_type IN ('site','area','asset','worker','work_order','work_request','stock_request','livestock','incident','other')),
  linked_object_id uuid,
  linked_object_label text,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visibility_scope text NOT NULL DEFAULT 'farm' CHECK (visibility_scope IN ('private','team','site','farm','public_link')),
  version text NOT NULL DEFAULT '1.0',
  effective_date date,
  expiry_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','superseded','archived')),
  storage_path text NOT NULL,
  title text NOT NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workshop_account_id, document_number)
);

CREATE INDEX IF NOT EXISTS farm_stock_requests_workshop_status_idx ON public.farm_stock_requests(workshop_account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_stock_requests_need_by_idx ON public.farm_stock_requests(workshop_account_id, need_by_at);
CREATE INDEX IF NOT EXISTS farm_stock_request_items_request_idx ON public.farm_stock_request_items(stock_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS farm_documents_workshop_type_idx ON public.farm_documents(workshop_account_id, document_type, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_documents_expiry_idx ON public.farm_documents(workshop_account_id, expiry_date);

CREATE TRIGGER farm_stock_requests_set_updated_at
BEFORE UPDATE ON public.farm_stock_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER farm_stock_request_items_set_updated_at
BEFORE UPDATE ON public.farm_stock_request_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER farm_documents_set_updated_at
BEFORE UPDATE ON public.farm_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_stock_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_stock_requests_staff_all ON public.farm_stock_requests FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_stock_request_items_staff_all ON public.farm_stock_request_items FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

CREATE POLICY farm_documents_staff_all ON public.farm_documents FOR ALL TO authenticated
USING (public.is_farm_staff_for(workshop_account_id))
WITH CHECK (public.is_farm_staff_for(workshop_account_id));

COMMIT;
