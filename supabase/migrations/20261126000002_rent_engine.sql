-- =====================================================================
-- AM Infra PropertyOS — rent engine: obligations, payments, receipts
-- All money-moving logic lives here (SECURITY DEFINER + explicit checks).
-- =====================================================================

create or replace function public.month_end(d date) returns date
language sql immutable as $$ select (date_trunc('month', d) + interval '1 month - 1 day')::date $$;

create or replace function public.financial_year(d date) returns text
language sql immutable as $$
  select case when extract(month from d) >= 4
    then extract(year from d)::int || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else (extract(year from d)::int - 1) || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0') end
$$;

-- Rent for a given calendar month under a lease (escalation + proration)
create or replace function public.lease_rent_for_month(p_lease public.leases, p_month date) returns numeric
language plpgsql immutable as $$
declare
  m date := date_trunc('month', p_month)::date;
  k int;
  full_rent numeric;
  covered int;
  days_in_month int := extract(day from public.month_end(m));
begin
  k := ((extract(year from m) - extract(year from p_lease.start_date)) * 12
        + (extract(month from m) - extract(month from p_lease.start_date)))::int / p_lease.escalation_interval_months;
  full_rent := round(p_lease.monthly_rent * power(1 + p_lease.escalation_percent / 100.0, greatest(k, 0)), 0);
  covered := least(public.month_end(m), p_lease.end_date) - greatest(m, p_lease.start_date) + 1;
  if p_lease.prorate_partial_months and covered < days_in_month then
    return round(full_rent * covered / days_in_month, 0);
  end if;
  return full_rent;
end $$;

-- Internal: insert any missing monthly obligations for one lease through a date. Idempotent.
create or replace function public._generate_for_lease(p_lease_id uuid, p_through date) returns int
language plpgsql security definer set search_path = public as $$
declare l leases; n int;
begin
  select * into l from leases where id = p_lease_id;
  if l.id is null or l.status = 'draft' then return 0; end if;
  insert into rent_obligations (lease_id, property_id, unit_id, tenant_id, period_month, period_start, period_end, due_date, base_amount)
  select l.id, l.property_id, l.unit_id, l.tenant_id, m::date,
         greatest(m::date, l.start_date),
         least(public.month_end(m::date), l.end_date),
         greatest(make_date(extract(year from m)::int, extract(month from m)::int,
                            least(l.rent_due_day, extract(day from public.month_end(m::date))::int)), l.start_date),
         public.lease_rent_for_month(l, m::date)
  from generate_series(date_trunc('month', l.start_date), date_trunc('month', least(l.end_date, p_through)), interval '1 month') m
  on conflict (lease_id, period_month) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public._generate_for_lease(uuid, date) from public, anon, authenticated;

-- Public: generate obligations for all accessible leases (safe to call on every page load).
create or replace function public.generate_rent_obligations(p_lease_id uuid default null, p_through date default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; total int := 0; v_through date := coalesce(p_through, public.month_end(public.app_today()));
begin
  if not is_active_user() then raise exception 'Not authorised'; end if;
  -- mark lapsed agreements as expired
  update leases set status = 'expired'
   where status = 'active' and end_date < app_today()
     and (p_lease_id is null or id = p_lease_id) and can_access_property(property_id);
  for r in select id from leases
           where status <> 'draft' and (p_lease_id is null or id = p_lease_id) and can_access_property(property_id)
  loop
    total := total + _generate_for_lease(r.id, v_through);
  end loop;
  return total;
end $$;

-- Re-sync unpaid obligations after lease terms change (paid months are never touched).
create or replace function public._resync_lease(p_lease_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l leases;
begin
  select * into l from leases where id = p_lease_id;
  perform set_config('app.allow_purge', 'on', true);
  delete from rent_obligations o
   where o.lease_id = l.id
     and (o.period_month < date_trunc('month', l.start_date) or o.period_month > date_trunc('month', l.end_date) or l.status = 'draft')
     and not exists (select 1 from payment_allocations a where a.obligation_id = o.id);
  perform set_config('app.allow_purge', 'off', true);
  update rent_obligations o
     set base_amount = lease_rent_for_month(l, o.period_month),
         period_start = greatest(o.period_month, l.start_date),
         period_end = least(month_end(o.period_month), l.end_date),
         due_date = greatest(make_date(extract(year from o.period_month)::int, extract(month from o.period_month)::int,
                             least(l.rent_due_day, extract(day from month_end(o.period_month))::int)), l.start_date)
   where o.lease_id = l.id
     and not exists (select 1 from payment_allocations a where a.obligation_id = o.id);
  perform _generate_for_lease(l.id, month_end(app_today()));
end $$;
revoke execute on function public._resync_lease(uuid) from public, anon, authenticated;

create or replace function public.leases_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform _generate_for_lease(new.id, month_end(app_today()));
  elsif (new.monthly_rent, new.start_date, new.end_date, new.rent_due_day, new.escalation_percent,
         new.escalation_interval_months, new.prorate_partial_months, new.status)
     is distinct from (old.monthly_rent, old.start_date, old.end_date, old.rent_due_day, old.escalation_percent,
         old.escalation_interval_months, old.prorate_partial_months, old.status) then
    perform _resync_lease(new.id);
  end if;
  return null;
end $$;
create trigger leases_after_write after insert or update on public.leases
  for each row execute function public.leases_after_write();

-- ---------- Ledger views (RLS applies through security_invoker) ----------
create or replace view public.v_obligations with (security_invoker = true) as
select o.*,
       (o.base_amount + o.adjustment) as amount_due,
       coalesce(pa.paid, 0) as amount_paid,
       case when o.not_applicable then 0 else greatest(o.base_amount + o.adjustment - coalesce(pa.paid, 0), 0) end as outstanding,
       case
         when o.not_applicable then 'not_applicable'
         when coalesce(pa.paid, 0) >= o.base_amount + o.adjustment then 'paid'
         when coalesce(pa.paid, 0) > 0 and o.due_date < public.app_today() then 'overdue'
         when coalesce(pa.paid, 0) > 0 then 'partially_paid'
         when o.due_date < public.app_today() then 'overdue'
         else 'pending' end as status,
       (coalesce(pa.paid, 0) > 0 and coalesce(pa.paid, 0) < o.base_amount + o.adjustment) as is_partial,
       t.full_name as tenant_name, p.name as property_name, u.unit_number, l.agreement_number
from public.rent_obligations o
join public.tenants t on t.id = o.tenant_id
join public.properties p on p.id = o.property_id
join public.units u on u.id = o.unit_id
join public.leases l on l.id = o.lease_id
left join lateral (
  select sum(a.amount) as paid from public.payment_allocations a
  join public.payments pm on pm.id = a.payment_id and pm.voided_at is null
  where a.obligation_id = o.id) pa on true;

create or replace view public.v_payments with (security_invoker = true) as
select pm.*,
       t.full_name as tenant_name, p.name as property_name, p.address as property_address, u.unit_number, l.agreement_number,
       coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = pm.id), 0) as allocated_amount,
       pm.amount - coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = pm.id), 0) as unallocated_amount,
       coalesce((select sum(r.amount) from public.receipts r where r.payment_id = pm.id and r.cancelled_at is null), 0) as receipted_amount,
       (select r.id from public.receipts r where r.payment_id = pm.id and r.cancelled_at is null order by r.created_at limit 1) as first_receipt_id
from public.payments pm
join public.tenants t on t.id = pm.tenant_id
join public.properties p on p.id = pm.property_id
join public.units u on u.id = pm.unit_id
join public.leases l on l.id = pm.lease_id;

create or replace view public.v_leases with (security_invoker = true) as
select l.*,
       t.full_name as tenant_name, t.phone as tenant_phone, p.name as property_name, u.unit_number,
       case when l.status = 'active' and l.end_date < public.app_today() then 'expired' else l.status::text end as display_status,
       (l.end_date - public.app_today()) as days_to_expiry,
       case when l.status not in ('active','expired') then null
            when l.end_date < public.app_today() then 'expired'
            when l.end_date - public.app_today() <= 30 then 'within_30'
            when l.end_date - public.app_today() <= 60 then 'within_60' end as expiry_alert,
       exists (select 1 from public.leases n where n.previous_lease_id = l.id) as has_renewal
from public.leases l
join public.tenants t on t.id = l.tenant_id
join public.properties p on p.id = l.property_id
join public.units u on u.id = l.unit_id;

create or replace view public.v_units with (security_invoker = true) as
select u.*, p.name as property_name, p.archived_at as property_archived_at,
       cl.id as current_lease_id, cl.agreement_number as current_agreement_number,
       cl.tenant_id as current_tenant_id, t.full_name as current_tenant_name, cl.end_date as current_lease_end,
       case when u.archived_at is not null then 'archived'
            when cl.id is not null then 'occupied'
            when u.availability = 'under_maintenance' then 'under_maintenance'
            when u.availability = 'not_for_rent' then 'not_for_rent'
            else 'vacant' end as occupancy
from public.units u
join public.properties p on p.id = u.property_id
left join lateral (
  select l.* from public.leases l
  where l.unit_id = u.id and l.status = 'active'
    and public.app_today() between l.start_date and l.end_date
  order by l.start_date desc limit 1) cl on true
left join public.tenants t on t.id = cl.tenant_id;

create or replace view public.v_tenants with (security_invoker = true) as
select t.*,
       cl.id as current_lease_id, cl.agreement_number, cl.start_date as lease_start, cl.end_date as lease_end,
       cl.monthly_rent, cl.security_deposit, cl.rent_due_day, cl.status as lease_status,
       cl.property_id, p.name as property_name, u.unit_number,
       coalesce((select sum(o.outstanding) from public.v_obligations o where o.tenant_id = t.id and o.due_date <= public.app_today()), 0) as outstanding_due
from public.tenants t
left join lateral (
  select l.* from public.leases l where l.tenant_id = t.id and l.status in ('active','expired')
  order by (l.status = 'active') desc, l.start_date desc limit 1) cl on true
left join public.properties p on p.id = cl.property_id
left join public.units u on u.id = cl.unit_id;

-- ---------- Record a payment ----------
create or replace function public.record_payment(
  p_lease_id uuid, p_payment_date date, p_amount numeric, p_method public.payment_method,
  p_reference text, p_notes text, p_idempotency_key uuid,
  p_start_period date default null, p_allow_duplicate boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l leases; v_pid uuid; v_remaining numeric := round(p_amount, 2); v_alloc numeric; r record;
  v_next date; v_ob record; v_ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if not is_active_user() then raise exception 'Not authorised'; end if;
  select id into v_pid from payments where idempotency_key = p_idempotency_key;
  if v_pid is not null then return v_pid; end if;   -- same submission retried

  select * into l from leases where id = p_lease_id for update;
  if l.id is null then raise exception 'Agreement not found'; end if;
  if not can_access_property(l.property_id) then raise exception 'Not authorised for this property'; end if;
  if l.status = 'draft' then raise exception 'Cannot record payments against a draft agreement'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_amount > 100000000 then raise exception 'Amount looks too large — please check'; end if;
  if p_payment_date is null or p_payment_date > app_today() then raise exception 'Payment date cannot be in the future'; end if;
  if p_method in ('upi', 'cheque') and v_ref is null then
    raise exception 'A transaction reference / cheque number is required for % payments', p_method;
  end if;
  if not p_allow_duplicate and exists (
     select 1 from payments where lease_id = p_lease_id and amount = round(p_amount,2)
       and payment_date = p_payment_date and voided_at is null) then
    raise exception 'DUPLICATE_PAYMENT: A payment of the same amount on the same date already exists for this agreement';
  end if;
  if v_ref is not null and exists (select 1 from payments where method = p_method and lower(reference) = lower(v_ref) and voided_at is null) then
    raise exception 'DUPLICATE_REFERENCE: This transaction reference has already been recorded';
  end if;

  perform _generate_for_lease(l.id, month_end(app_today()));

  insert into payments (lease_id, tenant_id, property_id, unit_id, payment_date, amount, method, reference, notes, idempotency_key, recorded_by)
  values (l.id, l.tenant_id, l.property_id, l.unit_id, p_payment_date, round(p_amount,2), p_method, v_ref, p_notes, p_idempotency_key, auth.uid())
  returning id into v_pid;

  -- 1) existing dues, oldest first (or from the chosen period)
  for r in
    select o.id, (o.base_amount + o.adjustment) - coalesce((
             select sum(a.amount) from payment_allocations a join payments pm on pm.id = a.payment_id
             where a.obligation_id = o.id and pm.voided_at is null), 0) as outstanding
    from rent_obligations o
    where o.lease_id = l.id and not o.not_applicable
      and (p_start_period is null or o.period_month >= date_trunc('month', p_start_period))
    order by o.period_month
  loop
    exit when v_remaining <= 0;
    if r.outstanding > 0 then
      v_alloc := least(v_remaining, r.outstanding);
      insert into payment_allocations (payment_id, obligation_id, amount) values (v_pid, r.id, v_alloc);
      v_remaining := v_remaining - v_alloc;
    end if;
  end loop;

  -- 2) advance payment: create and fill future months up to the agreement end
  if v_remaining > 0 then
    select coalesce(max(period_month) + interval '1 month', date_trunc('month', l.start_date))::date into v_next
      from rent_obligations where lease_id = l.id;
    if p_start_period is not null then v_next := greatest(v_next, date_trunc('month', p_start_period)::date); end if;
    while v_remaining > 0 and v_next <= date_trunc('month', l.end_date) loop
      perform _generate_for_lease(l.id, month_end(v_next));
      select id, base_amount + adjustment as due, not_applicable into v_ob
        from rent_obligations where lease_id = l.id and period_month = v_next;
      if v_ob.id is not null and not v_ob.not_applicable and v_ob.due > 0 then
        v_alloc := least(v_remaining, v_ob.due);
        insert into payment_allocations (payment_id, obligation_id, amount) values (v_pid, v_ob.id, v_alloc);
        v_remaining := v_remaining - v_alloc;
      end if;
      v_next := (v_next + interval '1 month')::date;
    end loop;
  end if;

  update payments pm set
    period_from = s.f, period_to = s.t
  from (select min(o.period_start) f, max(o.period_end) t
          from payment_allocations a join rent_obligations o on o.id = a.obligation_id
         where a.payment_id = v_pid) s
  where pm.id = v_pid;

  perform log_activity('payment_recorded', 'payment', v_pid, l.property_id,
    'Payment of ₹' || to_char(round(p_amount,2), 'FM99,99,99,99,990.00') || ' recorded',
    jsonb_build_object('lease_id', l.id, 'method', p_method, 'reference', v_ref, 'unallocated', v_remaining));
  return v_pid;
exception when unique_violation then
  raise exception 'DUPLICATE_REFERENCE: This payment (or its transaction reference) has already been recorded';
end $$;

-- ---------- Void a payment (admin only; keeps the record) ----------
create or replace function public.void_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare pm payments;
begin
  if not is_admin() then raise exception 'Only an admin can void payments'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into pm from payments where id = p_payment_id for update;
  if pm.id is null then raise exception 'Payment not found'; end if;
  if pm.voided_at is not null then raise exception 'Payment is already void'; end if;
  update payments set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason where id = pm.id;
  update receipts set cancelled_at = now(), cancel_reason = 'Payment voided: ' || p_reason
   where payment_id = pm.id and cancelled_at is null;
  perform log_activity('payment_voided', 'payment', pm.id, pm.property_id,
    'Payment of ₹' || to_char(pm.amount, 'FM99,99,99,99,990.00') || ' voided', jsonb_build_object('reason', p_reason));
end $$;

-- ---------- Issue a receipt for an actual payment ----------
create or replace function public.issue_receipt(p_payment_id uuid, p_amount numeric default null)
returns public.receipts language plpgsql security definer set search_path = public as $$
declare
  pm payments; s business_settings; t tenants; pr properties; u units;
  v_done numeric; v_amt numeric; v_fy text; v_no int; v_num text; v_rec receipts; v_allocs jsonb; v_due numeric;
begin
  if not is_active_user() then raise exception 'Not authorised'; end if;
  select * into pm from payments where id = p_payment_id for update;
  if pm.id is null then raise exception 'Payment not found'; end if;
  if not can_access_property(pm.property_id) then raise exception 'Not authorised for this property'; end if;
  if pm.voided_at is not null then raise exception 'Cannot issue a receipt for a voided payment'; end if;

  select coalesce(sum(amount), 0) into v_done from receipts where payment_id = pm.id and cancelled_at is null;
  v_amt := round(coalesce(p_amount, pm.amount - v_done), 2);
  if v_amt <= 0 then raise exception 'ALREADY_RECEIPTED: This payment has already been fully receipted'; end if;
  if v_done + v_amt > pm.amount then raise exception 'Receipt total cannot exceed the amount actually received'; end if;

  select * into s from business_settings where id = 1;
  select * into t from tenants where id = pm.tenant_id;
  select * into pr from properties where id = pm.property_id;
  select * into u from units where id = pm.unit_id;

  select coalesce(jsonb_agg(jsonb_build_object('period_month', o.period_month, 'period_start', o.period_start,
           'period_end', o.period_end, 'amount', a.amount, 'due', o.base_amount + o.adjustment) order by o.period_month), '[]'),
         coalesce(sum(o.base_amount + o.adjustment), 0)
    into v_allocs, v_due
    from payment_allocations a join rent_obligations o on o.id = a.obligation_id where a.payment_id = pm.id;

  v_fy := financial_year(app_today());
  insert into receipt_counters (financial_year, last_number) values (v_fy, 1)
  on conflict (financial_year) do update set last_number = receipt_counters.last_number + 1
  returning last_number into v_no;
  v_num := s.receipt_prefix || '/' || v_fy || '/' || lpad(v_no::text, 5, '0');

  insert into receipts (receipt_number, payment_id, property_id, tenant_id, amount, snapshot, issued_by)
  values (v_num, pm.id, pm.property_id, pm.tenant_id, v_amt, jsonb_build_object(
      'business', jsonb_build_object('legal_name', s.legal_name, 'trade_name', s.trade_name, 'address', s.address,
                   'phone', s.phone, 'email', s.email, 'pan', s.pan, 'gstin', s.gstin,
                   'signatory_name', s.signatory_name, 'footer', s.receipt_footer),
      'tenant', jsonb_build_object('name', t.full_name, 'phone', t.phone),
      'property', jsonb_build_object('name', pr.name, 'address', pr.address, 'city', pr.city),
      'unit', jsonb_build_object('number', u.unit_number, 'floor', u.floor_number),
      'payment', jsonb_build_object('date', pm.payment_date, 'method', pm.method, 'reference', pm.reference,
                   'total_amount', pm.amount, 'period_from', pm.period_from, 'period_to', pm.period_to),
      'allocations', v_allocs,
      'is_partial', (pm.amount < v_due),
      'is_advance', (pm.period_to is not null and pm.period_to > month_end(pm.payment_date)),
      'unallocated_credit', pm.amount - coalesce((select sum(amount) from payment_allocations where payment_id = pm.id), 0),
      'is_sample', pr.is_sample),
    auth.uid())
  returning * into v_rec;

  perform log_activity('receipt_generated', 'receipt', v_rec.id, pm.property_id,
    'Receipt ' || v_num || ' issued for ₹' || to_char(v_amt, 'FM99,99,99,99,990.00'), null);
  return v_rec;
end $$;

-- ---------- Obligation adjustments (admin) ----------
create or replace function public.adjust_obligation(p_obligation_id uuid, p_adjustment numeric, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o rent_obligations; v_paid numeric;
begin
  if not is_admin() then raise exception 'Only an admin can adjust rent'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into o from rent_obligations where id = p_obligation_id for update;
  if o.id is null then raise exception 'Rent entry not found'; end if;
  if o.base_amount + p_adjustment < 0 then raise exception 'Adjusted rent cannot be negative'; end if;
  select coalesce(sum(a.amount),0) into v_paid from payment_allocations a join payments pm on pm.id = a.payment_id and pm.voided_at is null where a.obligation_id = o.id;
  if o.base_amount + p_adjustment < v_paid then raise exception 'Adjusted rent cannot be less than the amount already paid (₹%)', v_paid; end if;
  update rent_obligations set adjustment = p_adjustment, adjustment_reason = p_reason where id = o.id;
  perform log_activity('rent_adjusted', 'rent_obligation', o.id, o.property_id,
    'Rent for ' || to_char(o.period_month, 'Mon YYYY') || ' adjusted by ₹' || p_adjustment, jsonb_build_object('reason', p_reason, 'previous', o.adjustment));
end $$;

create or replace function public.set_obligation_not_applicable(p_obligation_id uuid, p_value boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o rent_obligations;
begin
  if not is_admin() then raise exception 'Only an admin can change this'; end if;
  select * into o from rent_obligations where id = p_obligation_id for update;
  if o.id is null then raise exception 'Rent entry not found'; end if;
  if p_value and exists (select 1 from payment_allocations a join payments pm on pm.id = a.payment_id and pm.voided_at is null where a.obligation_id = o.id) then
    raise exception 'This month already has payments allocated to it';
  end if;
  update rent_obligations set not_applicable = p_value, na_reason = p_reason where id = o.id;
  perform log_activity(case when p_value then 'rent_marked_na' else 'rent_marked_applicable' end, 'rent_obligation', o.id, o.property_id,
    'Rent for ' || to_char(o.period_month, 'Mon YYYY') || case when p_value then ' marked not applicable' else ' marked applicable' end,
    jsonb_build_object('reason', p_reason));
end $$;

-- ---------- Renew / terminate agreements (admin) ----------
create or replace function public.renew_lease(p_lease_id uuid, p_start date, p_end date, p_rent numeric,
  p_deposit numeric, p_due_day int, p_escalation_percent numeric default 0, p_escalation_interval int default 12,
  p_terms text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare l leases; v_id uuid;
begin
  if not is_admin() then raise exception 'Only an admin can renew agreements'; end if;
  select * into l from leases where id = p_lease_id for update;
  if l.id is null then raise exception 'Agreement not found'; end if;
  if l.status not in ('active', 'expired') then raise exception 'Only active or expired agreements can be renewed'; end if;
  if p_start <= l.end_date then raise exception 'Renewal must start after the current agreement ends (%)', l.end_date; end if;
  update leases set status = 'renewed' where id = l.id;
  insert into leases (tenant_id, unit_id, property_id, start_date, end_date, monthly_rent, security_deposit, rent_due_day,
                      escalation_percent, escalation_interval_months, escalation_terms, prorate_partial_months, previous_lease_id, is_sample)
  values (l.tenant_id, l.unit_id, l.property_id, p_start, p_end, p_rent, p_deposit, p_due_day,
          coalesce(p_escalation_percent,0), coalesce(p_escalation_interval,12), p_terms, l.prorate_partial_months, l.id, l.is_sample)
  returning id into v_id;
  perform log_activity('agreement_renewed', 'lease', v_id, l.property_id, 'Agreement ' || l.agreement_number || ' renewed', null);
  return v_id;
end $$;

create or replace function public.terminate_lease(p_lease_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare l leases;
begin
  if not is_admin() then raise exception 'Only an admin can terminate agreements'; end if;
  select * into l from leases where id = p_lease_id for update;
  if l.id is null then raise exception 'Agreement not found'; end if;
  if l.status not in ('active','expired') then raise exception 'Agreement is not active'; end if;
  if p_on < l.start_date then raise exception 'Termination date is before the agreement start'; end if;
  if exists (select 1 from payment_allocations a join rent_obligations o on o.id = a.obligation_id
             join payments pm on pm.id = a.payment_id and pm.voided_at is null
             where o.lease_id = l.id and o.period_month > date_trunc('month', p_on)) then
    raise exception 'Payments are allocated to months after %; void or re-allocate them first', p_on;
  end if;
  update leases set status = 'terminated', terminated_on = p_on, end_date = least(end_date, p_on),
         notes = concat_ws(E'\n', notes, 'Terminated on ' || p_on || ': ' || coalesce(p_reason, '')) where id = l.id;
  perform log_activity('agreement_terminated', 'lease', l.id, l.property_id, 'Agreement ' || l.agreement_number || ' terminated', jsonb_build_object('reason', p_reason));
end $$;

-- ---------- Dashboard metrics ----------
create or replace function public.dashboard_stats(p_property_id uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_from date := coalesce(p_from, date_trunc('month', app_today())::date);
  v_to date := coalesce(p_to, month_end(app_today()));
  res jsonb;
begin
  with u as (select * from v_units where archived_at is null and property_archived_at is null and (p_property_id is null or property_id = p_property_id)),
       ob as (select * from v_obligations where (p_property_id is null or property_id = p_property_id)),
       pay as (select * from payments where voided_at is null and (p_property_id is null or property_id = p_property_id)),
       months as (select generate_series(date_trunc('month', v_to) - interval '5 months', date_trunc('month', v_to), interval '1 month')::date m)
  select jsonb_build_object(
    'period_from', v_from, 'period_to', v_to,
    'total_properties', (select count(*) from properties where archived_at is null and (p_property_id is null or id = p_property_id)),
    'total_units', (select count(*) from u),
    'occupied_units', (select count(*) from u where occupancy = 'occupied'),
    'vacant_units', (select count(*) from u where occupancy = 'vacant'),
    'other_units', (select count(*) from u where occupancy not in ('occupied','vacant')),
    'expected_monthly_income', (select coalesce(sum(lease_rent_for_month(l, app_today())), 0) from leases l
                                 where l.status = 'active' and app_today() between l.start_date and l.end_date
                                   and (p_property_id is null or l.property_id = p_property_id)),
    'expected_in_period', (select coalesce(sum(amount_due), 0) from ob where not not_applicable and period_month between date_trunc('month', v_from) and v_to),
    'collected_against_period', (select coalesce(sum(amount_paid), 0) from ob where not not_applicable and period_month between date_trunc('month', v_from) and v_to),
    'received_in_period', (select coalesce(sum(amount), 0) from pay where payment_date between v_from and v_to),
    'outstanding_in_period', (select coalesce(sum(outstanding), 0) from ob where period_month between date_trunc('month', v_from) and v_to),
    'outstanding_total', (select coalesce(sum(outstanding), 0) from ob where due_date <= greatest(app_today(), v_to)),
    'overdue_total', (select coalesce(sum(outstanding), 0) from ob where status = 'overdue'),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', m,
        'expected', (select coalesce(sum(amount_due),0) from ob where period_month = m and not not_applicable),
        'collected', (select coalesce(sum(amount_paid),0) from ob where period_month = m and not not_applicable),
        'received', (select coalesce(sum(amount),0) from pay where date_trunc('month', payment_date) = m)) order by m), '[]') from months),
    'by_property', (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
        select jsonb_build_object('property_id', p.id, 'name', p.name,
          'expected', (select coalesce(sum(amount_due),0) from ob where property_id = p.id and not not_applicable and period_month between date_trunc('month', v_from) and v_to),
          'collected', (select coalesce(sum(amount),0) from pay where property_id = p.id and payment_date between v_from and v_to)) x
        from properties p where p.archived_at is null and (p_property_id is null or p.id = p_property_id)) s)
  ) into res;
  return res;
end $$;
