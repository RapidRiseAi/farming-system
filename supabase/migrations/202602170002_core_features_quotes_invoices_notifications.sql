-- Core product features: plans, requests, quotes/invoices, media, notifications, timeline automation

create extension if not exists pgcrypto;

-- 1) customer plan fields
alter table public.customer_accounts
  add column if not exists tier text,
  add column if not exists vehicle_limit int,
  add column if not exists plan_price_cents int,
  add column if not exists subscription_status text not null default 'active';

DO $$
DECLARE
  tier_data_type text;
  tier_udt_schema text;
  tier_udt_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'customer_tier'
      AND t.typtype = 'e'
  ) THEN
    EXECUTE 'create type public.customer_tier as enum (''basic'',''pro'',''business'')';
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'customer_tier'
        AND e.enumlabel = 'basic'
    ) THEN
      EXECUTE 'alter type public.customer_tier add value ''basic''';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'customer_tier'
        AND e.enumlabel = 'pro'
    ) THEN
      EXECUTE 'alter type public.customer_tier add value ''pro''';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'customer_tier'
        AND e.enumlabel = 'business'
    ) THEN
      EXECUTE 'alter type public.customer_tier add value ''business''';
    END IF;
  END IF;

  SELECT c.data_type, c.udt_schema, c.udt_name
  INTO tier_data_type, tier_udt_schema, tier_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'customer_accounts'
    AND c.column_name = 'tier';

  IF tier_data_type = 'USER-DEFINED' AND tier_udt_schema = 'public' AND tier_udt_name = 'customer_tier' THEN
    UPDATE public.customer_accounts
    SET tier = (
      CASE lower(coalesce(tier::text, ''))
        WHEN 'pro' THEN 'pro'::public.customer_tier
        WHEN 'business' THEN 'business'::public.customer_tier
        WHEN 'basic' THEN 'basic'::public.customer_tier
        WHEN 'free' THEN 'basic'::public.customer_tier
        WHEN 'trial' THEN 'basic'::public.customer_tier
        WHEN '' THEN 'basic'::public.customer_tier
        ELSE 'basic'::public.customer_tier
      END
    ),
        vehicle_limit = coalesce(
          vehicle_limit,
          CASE lower(coalesce(tier::text, ''))
            WHEN 'business' THEN 20
            WHEN 'pro' THEN 10
            ELSE 1
          END
        ),
        plan_price_cents = coalesce(
          plan_price_cents,
          CASE lower(coalesce(tier::text, ''))
            WHEN 'business' THEN 120000
            WHEN 'pro' THEN 70000
            ELSE 10000
          END
        );
  ELSE
    UPDATE public.customer_accounts
    SET tier = CASE lower(coalesce(tier::text, ''))
        WHEN 'basic' THEN 'basic'
        WHEN 'pro' THEN 'pro'
        WHEN 'business' THEN 'business'
        WHEN 'free' THEN 'basic'
        WHEN 'trial' THEN 'basic'
        WHEN '' THEN 'basic'
        ELSE 'basic'
      END,
        vehicle_limit = coalesce(
          vehicle_limit,
          CASE lower(coalesce(tier::text, ''))
            WHEN 'business' THEN 20
            WHEN 'pro' THEN 10
            ELSE 1
          END
        ),
        plan_price_cents = coalesce(
          plan_price_cents,
          CASE lower(coalesce(tier::text, ''))
            WHEN 'business' THEN 120000
            WHEN 'pro' THEN 70000
            ELSE 10000
          END
        );

    ALTER TABLE public.customer_accounts
      ALTER COLUMN tier TYPE public.customer_tier
      USING (
        CASE lower(coalesce(tier::text, ''))
          WHEN 'pro' THEN 'pro'
          WHEN 'business' THEN 'business'
          WHEN 'basic' THEN 'basic'
          WHEN 'free' THEN 'basic'
          WHEN 'trial' THEN 'basic'
          WHEN '' THEN 'basic'
          ELSE 'basic'
        END
      )::public.customer_tier;
  END IF;
END $$;

alter table public.customer_accounts
  alter column tier set default 'basic'::public.customer_tier,
  alter column vehicle_limit set default 1,
  alter column plan_price_cents set default 10000,
  alter column tier set not null,
  alter column vehicle_limit set not null,
  alter column plan_price_cents set not null;

alter table public.customer_accounts
  drop constraint if exists customer_accounts_tier_check;

alter table public.customer_accounts
  add constraint customer_accounts_tier_check
  check (tier::text in ('basic','pro','business'));

-- 2) vehicle timeline events (align existing table with requested shape)
alter table public.vehicle_timeline_events
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.vehicle_timeline_events
set description = coalesce(description, body),
    metadata = coalesce(metadata, meta, '{}'::jsonb);

alter table public.vehicle_timeline_events
  alter column actor_role set default 'customer';

-- 3) work requests
create table if not exists public.work_requests (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  request_type text not null check (request_type in ('inspection','service')),
  status text not null default 'requested' check (status in ('requested','scheduled','in_progress','completed','cancelled')),
  notes text,
  preferred_date date,
  created_at timestamptz not null default now()
);
create index if not exists work_requests_workshop_idx on public.work_requests(workshop_account_id);
create index if not exists work_requests_customer_idx on public.work_requests(customer_account_id);
create index if not exists work_requests_vehicle_idx on public.work_requests(vehicle_id);
create index if not exists work_requests_status_idx on public.work_requests(status);

-- 4) quotes + quote_items
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  work_request_id uuid references public.work_requests(id) on delete set null,
  status text not null default 'sent' check (status in ('draft','sent','approved','declined','cancelled')),
  subtotal_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  qty int not null default 1,
  unit_price_cents int not null default 0,
  line_total_cents int not null default 0
);

create index if not exists quotes_workshop_idx on public.quotes(workshop_account_id);
create index if not exists quotes_customer_idx on public.quotes(customer_account_id);
create index if not exists quotes_vehicle_idx on public.quotes(vehicle_id);

-- 5) invoices + invoice_items
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  status text not null default 'sent' check (status in ('draft','sent','paid','overdue','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid')),
  total_cents int not null default 0,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  qty int not null default 1,
  unit_price_cents int not null default 0,
  line_total_cents int not null default 0
);

create index if not exists invoices_workshop_idx on public.invoices(workshop_account_id);
create index if not exists invoices_customer_idx on public.invoices(customer_account_id);
create index if not exists invoices_vehicle_idx on public.invoices(vehicle_id);

-- 6) recommendations table alignment
alter table public.recommendations
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete cascade,
  add column if not exists customer_account_id uuid references public.customer_accounts(id) on delete cascade,
  add column if not exists severity text not null default 'medium',
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists status_text text not null default 'open';

update public.recommendations
set title = coalesce(title, 'Recommendation'),
    status_text = coalesce(status_text, case when status::text in ('completed','approved') then 'done' else 'open' end),
    severity = coalesce(severity, 'medium');

alter table public.recommendations
  alter column title set not null;

alter table public.recommendations
  drop constraint if exists recommendations_severity_check;
alter table public.recommendations
  add constraint recommendations_severity_check check (severity in ('low','medium','high'));

alter table public.recommendations
  drop constraint if exists recommendations_status_text_check;
alter table public.recommendations
  add constraint recommendations_status_text_check check (status_text in ('open','acknowledged','done'));

-- 7) problem reports
create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  category text not null check (category in ('vehicle','noise','engine','brakes','electrical','other')),
  description text not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now()
);

-- 8) vehicle media
create table if not exists public.vehicle_media (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  media_type text not null check (media_type in ('vehicle_photo','job_photo','document')),
  storage_bucket text not null,
  storage_path text not null,
  file_name text,
  content_type text,
  size_bytes int,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public) values ('vehicle-uploads', 'vehicle-uploads', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('job-uploads', 'job-uploads', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;

-- 9) notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid references public.workshop_accounts(id) on delete cascade,
  to_profile_id uuid references public.profiles(id) on delete cascade,
  to_customer_account_id uuid references public.customer_accounts(id) on delete cascade,
  kind text not null check (kind in ('quote','invoice','request','report','system')),
  title text not null,
  body text,
  href text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  check (to_profile_id is not null or to_customer_account_id is not null)
);

create index if not exists notifications_to_profile_idx on public.notifications(to_profile_id, is_read, created_at desc);
create index if not exists notifications_to_customer_idx on public.notifications(to_customer_account_id, is_read, created_at desc);

-- 10) helper functions
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text from public.profiles p where p.id = auth.uid() limit 1;
$$;

create or replace function public.current_customer_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ca.id from public.customer_accounts ca where ca.auth_user_id = auth.uid() order by ca.created_at asc limit 1),
    (select cu.customer_account_id from public.customer_users cu where cu.profile_id = auth.uid() order by cu.created_at asc limit 1)
  );
$$;

create or replace function public.current_workshop_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.workshop_account_id from public.profiles p where p.id = auth.uid() limit 1;
$$;

-- totals helpers
create or replace function public.apply_quote_item_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.line_total_cents := greatest(new.qty, 0) * greatest(new.unit_price_cents, 0);
  return new;
end;
$$;

create or replace function public.refresh_quote_totals(p_quote_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_subtotal int;
begin
  select coalesce(sum(line_total_cents),0) into v_subtotal from public.quote_items where quote_id = p_quote_id;
  update public.quotes
  set subtotal_cents = v_subtotal,
      total_cents = v_subtotal + coalesce(tax_cents,0),
      updated_at = now()
  where id = p_quote_id;
end;
$$;

create or replace function public.bump_quote_totals_from_items()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_quote_totals(coalesce(new.quote_id, old.quote_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.apply_invoice_item_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.line_total_cents := greatest(new.qty, 0) * greatest(new.unit_price_cents, 0);
  return new;
end;
$$;

create or replace function public.refresh_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_total int;
begin
  select coalesce(sum(line_total_cents),0) into v_total from public.invoice_items where invoice_id = p_invoice_id;
  update public.invoices set total_cents = v_total, updated_at = now() where id = p_invoice_id;
end;
$$;

create or replace function public.bump_invoice_totals_from_items()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_quote_items_apply_total on public.quote_items;
create trigger trg_quote_items_apply_total before insert or update on public.quote_items for each row execute function public.apply_quote_item_totals();
drop trigger if exists trg_quote_items_refresh_quote on public.quote_items;
create trigger trg_quote_items_refresh_quote after insert or update or delete on public.quote_items for each row execute function public.bump_quote_totals_from_items();

drop trigger if exists trg_invoice_items_apply_total on public.invoice_items;
create trigger trg_invoice_items_apply_total before insert or update on public.invoice_items for each row execute function public.apply_invoice_item_totals();
drop trigger if exists trg_invoice_items_refresh_invoice on public.invoice_items;
create trigger trg_invoice_items_refresh_invoice after insert or update or delete on public.invoice_items for each row execute function public.bump_invoice_totals_from_items();

-- 11) RLS
alter table public.work_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.problem_reports enable row level security;
alter table public.vehicle_media enable row level security;
alter table public.notifications enable row level security;

create policy work_requests_select on public.work_requests for select using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);
create policy work_requests_insert on public.work_requests for insert with check (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);
create policy work_requests_update on public.work_requests for update using (public.same_workshop(workshop_account_id));

create policy quotes_select_v2 on public.quotes for select using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);
create policy quotes_insert_v2 on public.quotes for insert with check (public.same_workshop(workshop_account_id));
create policy quotes_update_v2 on public.quotes for update using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);

create policy quote_items_select_v2 on public.quote_items for select using (
  exists (select 1 from public.quotes q where q.id = quote_id and (public.same_workshop(q.workshop_account_id) or q.customer_account_id = public.current_customer_account_id()))
);
create policy quote_items_insert_v2 on public.quote_items for insert with check (
  exists (select 1 from public.quotes q where q.id = quote_id and public.same_workshop(q.workshop_account_id))
);
create policy quote_items_update_v2 on public.quote_items for update using (
  exists (select 1 from public.quotes q where q.id = quote_id and public.same_workshop(q.workshop_account_id))
);

create policy invoices_select_v2 on public.invoices for select using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);
create policy invoices_insert_v2 on public.invoices for insert with check (public.same_workshop(workshop_account_id));
create policy invoices_update_v2 on public.invoices for update using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);

create policy invoice_items_select_v2 on public.invoice_items for select using (
  exists (select 1 from public.invoices i where i.id = invoice_id and (public.same_workshop(i.workshop_account_id) or i.customer_account_id = public.current_customer_account_id()))
);
create policy invoice_items_insert_v2 on public.invoice_items for insert with check (
  exists (select 1 from public.invoices i where i.id = invoice_id and public.same_workshop(i.workshop_account_id))
);
create policy invoice_items_update_v2 on public.invoice_items for update using (
  exists (select 1 from public.invoices i where i.id = invoice_id and public.same_workshop(i.workshop_account_id))
);

create policy problem_reports_select on public.problem_reports for select using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);
create policy problem_reports_insert on public.problem_reports for insert with check (
  customer_account_id = public.current_customer_account_id() or public.same_workshop(workshop_account_id)
);
create policy problem_reports_update on public.problem_reports for update using (public.same_workshop(workshop_account_id));

create policy vehicle_media_select on public.vehicle_media for select using (
  public.same_workshop(workshop_account_id) or customer_account_id = public.current_customer_account_id()
);
create policy vehicle_media_insert on public.vehicle_media for insert with check (
  (customer_account_id = public.current_customer_account_id() and media_type in ('vehicle_photo','document'))
  or (public.same_workshop(workshop_account_id) and media_type in ('job_photo','document'))
);

create policy notifications_select on public.notifications for select using (
  to_profile_id = public.current_profile_id() or to_customer_account_id = public.current_customer_account_id()
);
create policy notifications_update on public.notifications for update using (
  to_profile_id = public.current_profile_id() or to_customer_account_id = public.current_customer_account_id()
) with check (
  to_profile_id = public.current_profile_id() or to_customer_account_id = public.current_customer_account_id()
);

-- storage policies
create policy "vehicle uploads r/w"
on storage.objects for all to authenticated
using (
  bucket_id in ('vehicle-uploads','job-uploads','documents')
  and split_part(name,'/',1) = 'workshop'
  and split_part(name,'/',2)::uuid = public.current_workshop_account_id()
)
with check (
  bucket_id in ('vehicle-uploads','job-uploads','documents')
  and split_part(name,'/',1) = 'workshop'
  and split_part(name,'/',2)::uuid = public.current_workshop_account_id()
);

-- 12) timeline + notification triggers
create or replace function public.push_notification(
  p_workshop_account_id uuid,
  p_to_customer_account_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(workshop_account_id,to_profile_id,to_customer_account_id,kind,title,body,href)
  values (
    p_workshop_account_id,
    (select cu.profile_id from public.customer_users cu where cu.customer_account_id = p_to_customer_account_id order by cu.created_at asc limit 1),
    p_to_customer_account_id,
    p_kind,
    p_title,
    p_body,
    p_href
  );
end;
$$;

create or replace function public.log_timeline_and_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_event_type text;
  v_title text;
  v_description text;
  v_workshop uuid;
  v_customer uuid;
  v_vehicle uuid;
  v_href text := '/customer/dashboard';
begin
  if tg_table_name = 'work_requests' and tg_op = 'INSERT' then
    v_event_type := 'inspection_requested';
    if (v_new ->> 'request_type') = 'service' then v_event_type := 'service_requested'; end if;
    v_title := initcap(v_new ->> 'request_type') || ' request created';
    v_description := v_new ->> 'notes';
    v_href := '/workshop/dashboard';
  elsif tg_table_name = 'quotes' and tg_op = 'INSERT' then
    v_event_type := 'quote_created';
    v_title := 'Quote sent';
    v_description := v_new ->> 'notes';
    v_href := '/customer/vehicles/' || (v_new ->> 'vehicle_id');
  elsif tg_table_name = 'quotes' and tg_op = 'UPDATE' and (v_old ->> 'status') is distinct from (v_new ->> 'status') then
    v_event_type := 'quote_status_changed';
    v_title := 'Quote status changed to ' || (v_new ->> 'status');
    v_description := null;
    v_href := '/customer/vehicles/' || (v_new ->> 'vehicle_id');
  elsif tg_table_name = 'invoices' and tg_op = 'INSERT' then
    v_event_type := 'invoice_created';
    v_title := 'Invoice issued';
    v_href := '/customer/vehicles/' || (v_new ->> 'vehicle_id');
  elsif tg_table_name = 'invoices' and tg_op = 'UPDATE' and (v_old ->> 'payment_status') is distinct from (v_new ->> 'payment_status') then
    v_event_type := 'payment_status_changed';
    v_title := 'Payment status changed to ' || (v_new ->> 'payment_status');
    v_href := '/customer/vehicles/' || (v_new ->> 'vehicle_id');
  elsif tg_table_name = 'recommendations' and tg_op = 'INSERT' then
    v_event_type := 'recommendation_added';
    v_title := coalesce(v_new ->> 'title', 'Recommendation added');
    v_description := v_new ->> 'description';
    v_href := '/customer/vehicles/' || (v_new ->> 'vehicle_id');
  elsif tg_table_name = 'problem_reports' and tg_op = 'INSERT' then
    v_event_type := 'problem_reported';
    v_title := 'Problem reported';
    v_description := v_new ->> 'description';
    v_href := '/workshop/dashboard';
  else
    return coalesce(new, old);
  end if;

  v_workshop := coalesce(nullif(v_new ->> 'workshop_account_id','')::uuid, nullif(v_old ->> 'workshop_account_id','')::uuid);
  v_customer := coalesce(nullif(v_new ->> 'customer_account_id','')::uuid, nullif(v_old ->> 'customer_account_id','')::uuid);
  v_vehicle := coalesce(nullif(v_new ->> 'vehicle_id','')::uuid, nullif(v_old ->> 'vehicle_id','')::uuid);

  if v_vehicle is not null and v_customer is not null and v_workshop is not null then
    insert into public.vehicle_timeline_events (
      workshop_account_id, customer_account_id, vehicle_id, actor_profile_id, actor_role, event_type, title, description, metadata
    ) values (
      v_workshop, v_customer, v_vehicle, auth.uid(), coalesce(public.current_role(), 'system'), v_event_type, v_title, v_description,
      jsonb_build_object('source_table', tg_table_name, 'op', tg_op)
    );
  end if;

  if v_customer is not null and tg_table_name in ('quotes','invoices','recommendations') then
    perform public.push_notification(v_workshop, v_customer, case when tg_table_name='invoices' then 'invoice' when tg_table_name='quotes' then 'quote' else 'system' end, v_title, v_description, v_href);
  elsif v_customer is not null and tg_table_name = 'work_requests' then
    perform public.push_notification(v_workshop, v_customer, 'request', 'Request received', v_title, '/customer/vehicles/' || (v_new ->> 'vehicle_id'));
  elsif v_customer is not null and tg_table_name = 'problem_reports' then
    perform public.push_notification(v_workshop, v_customer, 'report', 'Problem report submitted', v_description, '/customer/vehicles/' || (v_new ->> 'vehicle_id'));
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_work_requests_timeline_notify on public.work_requests;
create trigger trg_work_requests_timeline_notify after insert on public.work_requests for each row execute function public.log_timeline_and_notify();
drop trigger if exists trg_quotes_timeline_notify on public.quotes;
create trigger trg_quotes_timeline_notify after insert or update on public.quotes for each row execute function public.log_timeline_and_notify();
drop trigger if exists trg_invoices_timeline_notify on public.invoices;
create trigger trg_invoices_timeline_notify after insert or update on public.invoices for each row execute function public.log_timeline_and_notify();
drop trigger if exists trg_recommendations_timeline_notify on public.recommendations;
create trigger trg_recommendations_timeline_notify after insert on public.recommendations for each row execute function public.log_timeline_and_notify();
drop trigger if exists trg_problem_reports_timeline_notify on public.problem_reports;
create trigger trg_problem_reports_timeline_notify after insert on public.problem_reports for each row execute function public.log_timeline_and_notify();
