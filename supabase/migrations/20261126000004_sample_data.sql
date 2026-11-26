-- =====================================================================
-- AM Infra PropertyOS — clearly labelled SAMPLE data (load / purge)
-- Sample rows are flagged is_sample = true and prefixed "[SAMPLE]".
-- No sample payments are created: record test payments yourself.
-- =====================================================================
create or replace function public.load_sample_data() returns text
language plpgsql security definer set search_path = public as $$
declare p1 uuid; p2 uuid; u uuid[]; t uuid[]; today date := app_today(); s date;
begin
  if not is_admin() then raise exception 'Only an admin can load sample data'; end if;
  if exists (select 1 from properties where is_sample) then return 'Sample data is already loaded'; end if;
  s := (date_trunc('month', today) - interval '5 months')::date;

  insert into properties (name, address, city, property_type, total_floors, description, ownership_details, is_sample, notes)
  values ('[SAMPLE] Sea Breeze Residency', '12 Sample Road, Nepean Sea Road (fictional)', 'Mumbai', 'residential', 6,
          'Fictional residential building for testing.', 'Sample Owner (fictional)', true, 'SAMPLE DATA — safe to remove from Settings')
  returning id into p1;
  insert into properties (name, address, city, property_type, total_floors, description, ownership_details, is_sample, notes)
  values ('[SAMPLE] Harbour Point Commercial', '45 Test Lane, Fort (fictional)', 'Mumbai', 'commercial', 4,
          'Fictional commercial building for testing.', 'Sample Owner (fictional)', true, 'SAMPLE DATA — safe to remove from Settings')
  returning id into p2;

  with ins as (
    insert into units (property_id, unit_number, floor_number, carpet_area_sqft, unit_type, monthly_rent, security_deposit)
    values (p1,'101',1,450,'1 BHK',35000,105000), (p1,'102',1,450,'1 BHK',35000,105000),
           (p1,'201',2,650,'2 BHK',52000,156000), (p1,'301',3,650,'2 BHK',54000,162000),
           (p2,'G-1',0,300,'Shop',60000,360000), (p2,'1-A',1,900,'Office',90000,540000)
    returning id, unit_number)
  select array_agg(id order by unit_number) into u from ins;
  -- order: 1-A, 101, 102, 201, 301, G-1

  with ins as (
    insert into tenants (full_name, phone, email, emergency_contact_name, emergency_contact_phone, is_sample, notes)
    values ('[SAMPLE] Rohan Mehta', '+91 90000 00001', 'rohan.sample@example.com', 'Sample Contact', '+91 90000 00011', true, 'Fictional tenant'),
           ('[SAMPLE] Priya Nair', '+91 90000 00002', 'priya.sample@example.com', 'Sample Contact', '+91 90000 00012', true, 'Fictional tenant'),
           ('[SAMPLE] Kapoor Traders', '+91 90000 00003', 'kapoor.sample@example.com', 'Sample Contact', '+91 90000 00013', true, 'Fictional tenant'),
           ('[SAMPLE] Delta Consulting LLP', '+91 90000 00004', 'delta.sample@example.com', 'Sample Contact', '+91 90000 00014', true, 'Fictional tenant')
    returning id, full_name)
  select array_agg(id order by full_name) into t from ins;
  -- order: Delta, Kapoor, Priya, Rohan

  insert into leases (tenant_id, unit_id, property_id, start_date, end_date, monthly_rent, security_deposit, rent_due_day, escalation_percent, escalation_interval_months, escalation_terms, is_sample)
  values (t[4], u[2], p1, s, (s + interval '11 months - 1 day')::date, 35000, 105000, 5, 0, 12, '11-month leave & licence (sample)', true),
         (t[3], u[4], p1, (s + interval '2 months')::date, (s + interval '13 months - 1 day')::date, 52000, 156000, 7, 5, 12, '5% on renewal (sample)', true),
         (t[2], u[6], p2, (s - interval '7 months')::date, (today + interval '25 days')::date, 60000, 360000, 1, 0, 12, 'Expiring soon (sample)', true),
         (t[1], u[1], p2, (s - interval '12 months')::date, (s + interval '24 months')::date, 90000, 540000, 10, 5, 12, '5% every 12 months (sample)', true);

  insert into maintenance_requests (property_id, unit_id, title, description, assigned_to, estimated_cost, status, priority)
  values (p1, u[3], '[SAMPLE] Leaking bathroom tap', 'Fictional request for testing', 'Sample Plumber', 1500, 'open', 'normal'),
         (p2, u[6], '[SAMPLE] Shutter repair', 'Fictional request for testing', 'Sample Contractor', 8000, 'in_progress', 'high');
  insert into expenses (property_id, category, description, amount, expense_date, paid_to)
  values (p1, 'society_charges', '[SAMPLE] Society maintenance', 6000, date_trunc('month', today)::date, 'Sample Society');

  perform log_activity('sample_loaded', 'system', null, null, 'Sample data loaded', null);
  return 'Sample data loaded';
end $$;

create or replace function public.purge_sample_data() returns text
language plpgsql security definer set search_path = public as $$
declare props uuid[];
begin
  if not is_admin() then raise exception 'Only an admin can remove sample data'; end if;
  select array_agg(id) into props from properties where is_sample;
  if props is null then return 'No sample data found'; end if;
  perform set_config('app.allow_purge', 'on', true);
  delete from receipts where property_id = any(props);
  delete from payment_allocations where payment_id in (select id from payments where property_id = any(props));
  delete from payments where property_id = any(props);
  delete from rent_obligations where property_id = any(props);
  delete from documents where property_id = any(props);
  delete from expenses where property_id = any(props);
  delete from maintenance_requests where property_id = any(props);
  update leases set previous_lease_id = null where property_id = any(props);
  delete from leases where property_id = any(props);
  delete from activity_log where entity_type = 'tenants' and entity_id in (select id from tenants where is_sample);
  delete from tenants where is_sample and not exists (select 1 from leases l where l.tenant_id = tenants.id);
  delete from property_assignments where property_id = any(props);
  delete from redevelopment_projects where property_id = any(props);
  delete from units where property_id = any(props);
  delete from activity_log where property_id = any(props);
  delete from properties where id = any(props);
  perform set_config('app.allow_purge', 'off', true);
  perform log_activity('sample_purged', 'system', null, null, 'Sample data removed', null);
  return 'Sample data removed';
end $$;

revoke execute on function public.load_sample_data() from public, anon;
revoke execute on function public.purge_sample_data() from public, anon;
grant execute on function public.load_sample_data() to authenticated;
grant execute on function public.purge_sample_data() to authenticated;
