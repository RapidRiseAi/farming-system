-- Prevent auth signup trigger failures for owner/farm signups and environments without seeded demo workshop.

create or replace function public.ensure_customer_account_for_user(
  p_user_id uuid,
  p_email text,
  p_raw_user_meta_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_display_name text;
  resolved_account_name text;
  v_customer_account_id uuid;
  v_default_workshop_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.workshop_accounts (id, name, slug, plan)
  values (v_default_workshop_id, 'Default Workshop', 'default-workshop', 'free')
  on conflict (id) do nothing;

  resolved_display_name := coalesce(
    nullif(trim(p_raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Customer'
  );

  resolved_account_name := coalesce(
    nullif(resolved_display_name, ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Customer'
  );

  insert into public.profiles (id, role, display_name)
  values (p_user_id, 'customer', resolved_display_name)
  on conflict (id) do nothing;

  select cu.customer_account_id
  into v_customer_account_id
  from public.customer_users cu
  where cu.profile_id = p_user_id
  order by cu.created_at asc
  limit 1;

  if v_customer_account_id is null then
    insert into public.customer_accounts (workshop_account_id, name, tier)
    values (v_default_workshop_id, resolved_account_name, 'free')
    returning id into v_customer_account_id;

    insert into public.customer_users (customer_account_id, profile_id)
    values (v_customer_account_id, p_user_id)
    on conflict (customer_account_id, profile_id) do nothing;

    select cu.customer_account_id
    into v_customer_account_id
    from public.customer_users cu
    where cu.profile_id = p_user_id
    order by cu.created_at asc
    limit 1;
  end if;

  return v_customer_account_id;
end;
$$;

alter function public.ensure_customer_account_for_user(uuid, text, jsonb) owner to postgres;

create or replace function public.bootstrap_customer_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text;
  v_resolved_display_name text;
  v_owner_supported boolean;
begin
  v_requested_role := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', 'customer'));
  v_resolved_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  if v_requested_role in ('owner', 'admin', 'technician', 'farm_manager', 'supervisor', 'operator', 'admin_clerk', 'contractor', 'viewer') then
    select exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'user_role'
        and e.enumlabel = 'owner'
    ) into v_owner_supported;

    insert into public.profiles (id, role, display_name)
    values (
      new.id,
      case when v_owner_supported then 'owner'::public.user_role else 'admin'::public.user_role end,
      v_resolved_display_name
    )
    on conflict (id) do update
      set display_name = coalesce(nullif(trim(public.profiles.display_name), ''), excluded.display_name);

    return new;
  end if;

  perform public.ensure_customer_account_for_user(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

alter function public.bootstrap_customer_profile_from_auth_user() owner to postgres;
