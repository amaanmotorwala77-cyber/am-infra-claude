-- =====================================================================
-- AM Infra PropertyOS — Row Level Security, grants, storage
-- =====================================================================

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
-- internal helpers stay private
revoke execute on function public._generate_for_lease(uuid, date) from authenticated;
revoke execute on function public._resync_lease(uuid) from authenticated;
revoke execute on function public.log_activity(text,text,uuid,uuid,text,jsonb) from authenticated;

-- Money tables: read-only to the API; all writes go through the functions above.
revoke insert, update, delete on public.payments, public.payment_allocations, public.receipts,
  public.receipt_counters, public.rent_obligations, public.activity_log from authenticated;
-- No hard deletes on tenancy/master records (archive instead).
revoke delete on public.properties, public.units, public.tenants, public.leases, public.profiles,
  public.business_settings, public.property_assignments from authenticated;
grant delete on public.property_assignments to authenticated;  -- admins unassign managers (RLS-checked)

do $$ declare t text; begin
  foreach t in array array['profiles','property_assignments','business_settings','properties','units','tenants','leases',
    'rent_obligations','payments','payment_allocations','receipts','receipt_counters','maintenance_requests','expenses',
    'documents','activity_log','redevelopment_projects'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Prevent an admin from locking everyone out (last active admin).
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from profiles where id <> old.id and role = 'admin' and is_active) then
    raise exception 'At least one active admin is required';
  end if;
  if new.id = old.id and new.email <> old.email then raise exception 'Email is managed by authentication'; end if;
  return new;
end $$;
create trigger profiles_guard_last_admin before update on public.profiles for each row execute function public.guard_last_admin();

-- property assignments
create policy pa_select on public.property_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy pa_admin_write on public.property_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- business settings
create policy bs_select on public.business_settings for select to authenticated using (public.is_active_user());
create policy bs_update on public.business_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- properties & units: managers see assigned; only admins create/edit
create policy properties_select on public.properties for select to authenticated using (public.can_access_property(id));
create policy properties_insert on public.properties for insert to authenticated with check (public.is_admin());
create policy properties_update on public.properties for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy units_select on public.units for select to authenticated using (public.can_access_property(property_id));
create policy units_insert on public.units for insert to authenticated with check (public.is_admin());
create policy units_update on public.units for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- tenants: visible if admin, created by me, or tenant has an agreement in a property I can access
create or replace function public.can_access_tenant(p_tenant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_active_user() and (
    exists (select 1 from tenants t where t.id = p_tenant_id and t.created_by = auth.uid())
    or exists (select 1 from leases l where l.tenant_id = p_tenant_id and public.can_access_property(l.property_id))))
$$;
create policy tenants_select on public.tenants for select to authenticated using (public.can_access_tenant(id));
create policy tenants_insert on public.tenants for insert to authenticated with check (public.is_active_user() and created_by = auth.uid());
create policy tenants_update on public.tenants for update to authenticated using (public.can_access_tenant(id)) with check (public.can_access_tenant(id));

-- leases: read for assigned; admin creates/edits agreements
create policy leases_select on public.leases for select to authenticated using (public.can_access_property(property_id));
create policy leases_insert on public.leases for insert to authenticated with check (public.is_admin());
create policy leases_update on public.leases for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- financial ledgers: read-only via RLS
create policy ro_select on public.rent_obligations for select to authenticated using (public.can_access_property(property_id));
create policy pay_select on public.payments for select to authenticated using (public.can_access_property(property_id));
create policy alloc_select on public.payment_allocations for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and public.can_access_property(p.property_id)));
create policy rcpt_select on public.receipts for select to authenticated using (public.can_access_property(property_id));
-- receipt_counters: no policies => no direct access

-- maintenance: managers manage for their properties
create policy mr_select on public.maintenance_requests for select to authenticated using (public.can_access_property(property_id));
create policy mr_insert on public.maintenance_requests for insert to authenticated with check (public.can_access_property(property_id));
create policy mr_update on public.maintenance_requests for update to authenticated
  using (public.can_access_property(property_id)) with check (public.can_access_property(property_id));

-- expenses
create policy ex_select on public.expenses for select to authenticated using (public.can_access_property(property_id));
create policy ex_insert on public.expenses for insert to authenticated with check (public.can_access_property(property_id));
create policy ex_update on public.expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- documents
create policy doc_select on public.documents for select to authenticated
  using (public.is_admin() or (property_id is not null and public.can_access_property(property_id))
         or (property_id is null and tenant_id is not null and public.can_access_tenant(tenant_id)));
create policy doc_insert on public.documents for insert to authenticated
  with check (public.is_admin() or (property_id is not null and public.can_access_property(property_id)));
create policy doc_update on public.documents for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- activity log
create policy al_select on public.activity_log for select to authenticated
  using (public.is_admin() or (property_id is not null and public.can_access_property(property_id)));

-- redevelopment
create policy rp_select on public.redevelopment_projects for select to authenticated
  using (public.is_admin() or (property_id is not null and public.can_access_property(property_id)));
create policy rp_write on public.redevelopment_projects for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Storage: private bucket. Object paths are "<property_id>/<uuid>-<file>"
-- or "general/<uuid>-<file>" (admin only). Files are only ever served via
-- short-lived signed URLs.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do update set public = false;

create or replace function public.can_access_storage_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_folder text := split_part(p_name, '/', 1);
begin
  if public.is_admin() then return true; end if;
  if v_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.can_access_property(v_folder::uuid);
  end if;
  return false;
end $$;
grant execute on function public.can_access_storage_path(text) to authenticated;

create policy "am docs read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_access_storage_path(name));
create policy "am docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_storage_path(name));
create policy "am docs admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
