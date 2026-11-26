-- =====================================================================
-- AM Infra PropertyOS — core schema
-- Run in Supabase SQL editor (or `supabase db push`). Requires PG15+.
-- =====================================================================
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.user_role         as enum ('admin', 'manager');
create type public.property_type     as enum ('residential', 'commercial', 'mixed_use');
create type public.unit_availability as enum ('available', 'under_maintenance', 'not_for_rent');
create type public.lease_status      as enum ('draft', 'active', 'renewed', 'terminated', 'expired');
create type public.payment_method    as enum ('bank_transfer', 'upi', 'cheque', 'cash', 'other');
create type public.maintenance_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.expense_pay_status as enum ('unpaid', 'partially_paid', 'paid');
create type public.document_category as enum ('rental_agreement', 'rent_receipt', 'property_document',
  'tenant_document', 'maintenance_invoice', 'property_photo', 'other');
create type public.project_status    as enum ('planning', 'approvals', 'construction', 'completed', 'on_hold');

-- ---------- Helpers ----------
create or replace function public.app_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- Users / roles ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.user_role not null default 'manager',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active and role = 'admin')
$$;

-- First user to sign up becomes the active admin; everyone else waits for approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('am_infra_first_admin'));
  select not exists (select 1 from profiles where role = 'admin') into v_first;
  insert into profiles (id, email, full_name, role, is_active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when v_first then 'admin'::user_role else 'manager'::user_role end, v_first);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Business settings (single row) ----------
create table public.business_settings (
  id                 int primary key default 1 check (id = 1),
  legal_name         text not null default '[Owner Legal Name — set in Settings]',
  trade_name         text not null default 'AM Infra',
  address            text not null default '[Registered address — set in Settings]',
  phone              text default '[Phone]',
  email              text default '[Email]',
  pan                text default '[PAN]',
  gstin              text,
  receipt_prefix     text not null default 'AMI' check (receipt_prefix ~ '^[A-Z0-9-]{1,10}$'),
  receipt_footer     text default 'This is a computer-generated receipt for rent actually received.',
  signatory_name     text default '[Authorised Signatory]',
  updated_at         timestamptz not null default now()
);
insert into public.business_settings (id) values (1);

-- ---------- Properties & units ----------
create table public.properties (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  address          text not null,
  city             text default 'Mumbai',
  property_type    public.property_type not null default 'residential',
  total_floors     int check (total_floors is null or total_floors between 0 and 200),
  description      text,
  ownership_details text,
  acquisition_date date,
  notes            text,
  cover_image_path text,
  is_sample        boolean not null default false,
  archived_at      timestamptz,
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.properties (archived_at);

create table public.property_assignments (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);

create or replace function public.can_access_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.is_active
      and (p.role = 'admin' or exists (
        select 1 from property_assignments a where a.user_id = p.id and a.property_id = p_property_id))
  )
$$;

create table public.units (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id),
  unit_number     text not null check (length(trim(unit_number)) > 0),
  floor_number    int,
  carpet_area_sqft numeric(10,2) check (carpet_area_sqft is null or carpet_area_sqft > 0),
  unit_type       text default '1 BHK',
  availability    public.unit_availability not null default 'available',
  monthly_rent    numeric(12,2) not null default 0 check (monthly_rent >= 0),
  security_deposit numeric(12,2) not null default 0 check (security_deposit >= 0),
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index units_property_number_uniq on public.units (property_id, lower(unit_number)) where archived_at is null;
create index on public.units (property_id);

-- ---------- Tenants ----------
create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null check (length(trim(full_name)) > 0),
  phone               text check (phone is null or phone ~ '^[0-9+ -]{7,20}$'),
  email               text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  emergency_contact_name  text,
  emergency_contact_phone text,
  id_proof_note       text,
  notes               text,
  is_sample           boolean not null default false,
  archived_at         timestamptz,
  created_by          uuid references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.tenants (lower(full_name));

-- ---------- Leases / rental agreements ----------
create sequence public.lease_number_seq;
create table public.leases (
  id                  uuid primary key default gen_random_uuid(),
  agreement_number    text not null unique default ('AGR-' || to_char(now() at time zone 'Asia/Kolkata','YYYY') || '-' || lpad(nextval('public.lease_number_seq')::text, 4, '0')),
  tenant_id           uuid not null references public.tenants(id),
  unit_id             uuid not null references public.units(id),
  property_id         uuid not null references public.properties(id),
  start_date          date not null,
  end_date            date not null,
  monthly_rent        numeric(12,2) not null check (monthly_rent > 0),
  security_deposit    numeric(12,2) not null default 0 check (security_deposit >= 0),
  rent_due_day        int not null default 5 check (rent_due_day between 1 and 31),
  escalation_percent  numeric(5,2) not null default 0 check (escalation_percent between 0 and 100),
  escalation_interval_months int not null default 12 check (escalation_interval_months between 1 and 120),
  escalation_terms    text,
  prorate_partial_months boolean not null default true,
  status              public.lease_status not null default 'active',
  allow_overlap       boolean not null default false,
  previous_lease_id   uuid references public.leases(id),
  terminated_on       date,
  notes               text,
  is_sample           boolean not null default false,
  created_by          uuid references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_date >= start_date),
  -- One active lease per unit for overlapping dates, unless explicitly allowed.
  constraint leases_no_overlap exclude using gist (
    unit_id with =, daterange(start_date, end_date, '[]') with &&
  ) where (status = 'active' and not allow_overlap)
);
create index on public.leases (tenant_id);
create index on public.leases (unit_id);
create index on public.leases (property_id, status);
create index on public.leases (end_date);

-- property_id is always derived from the unit
create or replace function public.leases_set_property() returns trigger
language plpgsql as $$
declare v_prop uuid; v_arch timestamptz;
begin
  select property_id, archived_at into v_prop, v_arch from units where id = new.unit_id;
  if v_prop is null then raise exception 'Unit not found'; end if;
  if tg_op = 'INSERT' and v_arch is not null then raise exception 'Cannot create a lease on an archived unit'; end if;
  new.property_id := v_prop;
  return new;
end $$;
create trigger leases_set_property before insert or update of unit_id on public.leases
  for each row execute function public.leases_set_property();

-- ---------- Rent obligations ----------
create table public.rent_obligations (
  id              uuid primary key default gen_random_uuid(),
  lease_id        uuid not null references public.leases(id),
  property_id     uuid not null references public.properties(id),
  unit_id         uuid not null references public.units(id),
  tenant_id       uuid not null references public.tenants(id),
  period_month    date not null check (extract(day from period_month) = 1),
  period_start    date not null,
  period_end      date not null,
  due_date        date not null,
  base_amount     numeric(12,2) not null check (base_amount >= 0),
  adjustment      numeric(12,2) not null default 0,
  adjustment_reason text,
  not_applicable  boolean not null default false,
  na_reason       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint rent_obligations_unique_period unique (lease_id, period_month),
  check (base_amount + adjustment >= 0)
);
create index on public.rent_obligations (property_id, period_month);
create index on public.rent_obligations (tenant_id);
create index on public.rent_obligations (due_date);

-- ---------- Payments ----------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  lease_id        uuid not null references public.leases(id),
  tenant_id       uuid not null references public.tenants(id),
  property_id     uuid not null references public.properties(id),
  unit_id         uuid not null references public.units(id),
  payment_date    date not null,
  amount          numeric(12,2) not null check (amount > 0),
  method          public.payment_method not null,
  reference       text,
  notes           text,
  period_from     date,
  period_to       date,
  idempotency_key uuid not null unique,
  recorded_by     uuid references auth.users(id),
  voided_at       timestamptz,
  voided_by       uuid references auth.users(id),
  void_reason     text,
  created_at      timestamptz not null default now()
);
create unique index payments_reference_uniq on public.payments (method, lower(trim(reference)))
  where reference is not null and trim(reference) <> '' and voided_at is null;
create index on public.payments (property_id, payment_date);
create index on public.payments (tenant_id);
create index on public.payments (lease_id);

create table public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments(id),
  obligation_id uuid not null references public.rent_obligations(id),
  amount        numeric(12,2) not null check (amount > 0),
  created_at    timestamptz not null default now(),
  unique (payment_id, obligation_id)
);
create index on public.payment_allocations (obligation_id);

-- ---------- Receipts ----------
create table public.receipt_counters (
  financial_year text primary key,
  last_number    int not null default 0
);

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  receipt_number  text not null unique,
  payment_id      uuid not null references public.payments(id),
  property_id     uuid not null references public.properties(id),
  tenant_id       uuid not null references public.tenants(id),
  amount          numeric(12,2) not null check (amount > 0),
  issued_on       date not null default public.app_today(),
  snapshot        jsonb not null,
  issued_by       uuid references auth.users(id),
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz not null default now()
);
create index on public.receipts (payment_id);
create index on public.receipts (tenant_id);

-- ---------- Maintenance & expenses ----------
create table public.maintenance_requests (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id),
  unit_id         uuid references public.units(id),
  tenant_id       uuid references public.tenants(id),
  title           text not null check (length(trim(title)) > 0),
  description     text,
  reported_on     date not null default public.app_today(),
  assigned_to     text,
  estimated_cost  numeric(12,2) check (estimated_cost is null or estimated_cost >= 0),
  actual_cost     numeric(12,2) check (actual_cost is null or actual_cost >= 0),
  payment_status  public.expense_pay_status not null default 'unpaid',
  status          public.maintenance_status not null default 'open',
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  completed_on    date,
  notes           text,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.maintenance_requests (property_id, status);

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id),
  unit_id         uuid references public.units(id),
  maintenance_request_id uuid references public.maintenance_requests(id),
  category        text not null default 'maintenance'
                  check (category in ('maintenance','repairs','property_tax','society_charges','utilities','insurance','staff','legal','other')),
  description     text not null,
  amount          numeric(12,2) not null check (amount > 0),
  expense_date    date not null default public.app_today(),
  paid_to         text,
  payment_method  public.payment_method,
  reference       text,
  archived_at     timestamptz,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.expenses (property_id, expense_date);

-- ---------- Future: redevelopment (foundation only) ----------
create table public.redevelopment_projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  property_id     uuid references public.properties(id),
  location        text,
  description     text,
  status          public.project_status not null default 'planning',
  start_date      date,
  expected_completion date,
  project_manager text,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- Documents ----------
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        public.document_category not null default 'other',
  storage_path    text not null unique,
  mime_type       text,
  size_bytes      bigint,
  property_id     uuid references public.properties(id),
  unit_id         uuid references public.units(id),
  tenant_id       uuid references public.tenants(id),
  lease_id        uuid references public.leases(id),
  payment_id      uuid references public.payments(id),
  maintenance_request_id uuid references public.maintenance_requests(id),
  project_id      uuid references public.redevelopment_projects(id),
  notes           text,
  archived_at     timestamptz,
  uploaded_by     uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index on public.documents (property_id);
create index on public.documents (tenant_id);
create index on public.documents (lease_id);

-- ---------- Activity / audit log ----------
create table public.activity_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid default auth.uid(),
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  property_id  uuid,
  summary      text,
  details      jsonb
);
create index on public.activity_log (occurred_at desc);
create index on public.activity_log (property_id);

create or replace function public.log_activity(p_action text, p_entity_type text, p_entity_id uuid,
  p_property_id uuid, p_summary text, p_details jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into activity_log (action, entity_type, entity_id, property_id, summary, details)
  values (p_action, p_entity_type, p_entity_id, p_property_id, p_summary, p_details);
$$;
revoke execute on function public.log_activity(text,text,uuid,uuid,text,jsonb) from public, anon, authenticated;

-- Generic audit trigger for master data
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prop uuid; v_label text; v_action text; v_id uuid; j jsonb := to_jsonb(new);
begin
  v_id := case when (j->>'id') ~ '^[0-9a-f-]{36}$' then (j->>'id')::uuid end;
  v_action := case
    when tg_op = 'INSERT' then 'created'
    when to_jsonb(new) ? 'archived_at' and (to_jsonb(old)->>'archived_at') is null and (to_jsonb(new)->>'archived_at') is not null then 'archived'
    else 'updated' end;
  v_prop := case tg_table_name when 'properties' then v_id
            else nullif(j->>'property_id','')::uuid end;
  v_label := coalesce(j->>'name', nullif(j->>'full_name',''), j->>'email', to_jsonb(new)->>'title',
                      to_jsonb(new)->>'agreement_number', to_jsonb(new)->>'unit_number', to_jsonb(new)->>'description');
  insert into activity_log (action, entity_type, entity_id, property_id, summary, details)
  values (v_action, tg_table_name, v_id, v_prop,
          (case tg_table_name when 'properties' then 'Property' when 'units' then 'Unit' when 'tenants' then 'Tenant'
             when 'leases' then 'Agreement' when 'maintenance_requests' then 'Maintenance request' when 'expenses' then 'Expense'
             when 'documents' then 'Document' when 'redevelopment_projects' then 'Project' when 'business_settings' then 'Business settings'
             when 'profiles' then 'User' else tg_table_name end) || ' ' || v_action || coalesce(': ' || v_label, ''),
          case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else null end);
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['properties','units','tenants','leases','maintenance_requests','expenses','documents','redevelopment_projects','business_settings','profiles'] loop
    execute format('create trigger %I_audit after insert or update on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
  foreach t in array array['profiles','properties','units','tenants','leases','rent_obligations','maintenance_requests','expenses','redevelopment_projects','business_settings'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Financial rows are never hard-deleted (except purge of sample data).
create or replace function public.block_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_purge', true), '') = 'on' then return old; end if;
  raise exception '% records cannot be deleted. Void or archive them instead.', tg_table_name;
end $$;
do $$ declare t text; begin
  foreach t in array array['payments','payment_allocations','receipts','rent_obligations','leases','tenants','properties','units','activity_log'] loop
    execute format('create trigger %I_no_delete before delete on public.%I for each row execute function public.block_delete()', t, t);
  end loop;
end $$;

-- Payments/receipts amounts and links are immutable once recorded.
create or replace function public.guard_payment_update() returns trigger
language plpgsql as $$
begin
  if new.amount <> old.amount or new.lease_id <> old.lease_id or new.payment_date <> old.payment_date
     or new.method <> old.method or new.idempotency_key <> old.idempotency_key then
    raise exception 'Recorded payments cannot be altered. Void and re-record instead.';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Voided payments cannot be restored.';
  end if;
  return new;
end $$;
create trigger payments_guard before update on public.payments for each row execute function public.guard_payment_update();

create or replace function public.guard_receipt_update() returns trigger
language plpgsql as $$
begin
  if new.receipt_number <> old.receipt_number or new.amount <> old.amount or new.payment_id <> old.payment_id
     or new.snapshot <> old.snapshot then
    raise exception 'Issued receipts cannot be altered.';
  end if;
  return new;
end $$;
create trigger receipts_guard before update on public.receipts for each row execute function public.guard_receipt_update();
