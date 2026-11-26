\set ON_ERROR_STOP 1
\pset format unaligned
\pset footer off
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@test.local'),('00000000-0000-0000-0000-0000000000b2','mgr@test.local');
select email, role, is_active from profiles order by email;
-- act as admin
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
-- 1. property
insert into properties (name,address,property_type,total_floors) values ('Test Tower','1 Test Rd','residential',5);
-- 2. units
insert into units (property_id,unit_number,floor_number,carpet_area_sqft,monthly_rent,security_deposit)
 select id,'A-1',1,500,30000,90000 from properties where name='Test Tower';
insert into units (property_id,unit_number,floor_number,monthly_rent) select id,'A-2',1,25000 from properties where name='Test Tower';
-- 3. tenant
insert into tenants (full_name,phone,email) values ('Test Tenant','+91 99999 00000','t@example.com');
-- 4. lease: started 2026-09-01 for 11 months, rent 30000, due 5th
insert into leases (tenant_id,unit_id,property_id,start_date,end_date,monthly_rent,security_deposit,rent_due_day)
 select t.id,u.id,u.property_id,'2026-09-01','2027-07-31',30000,90000,5 from tenants t, units u where t.full_name='Test Tenant' and u.unit_number='A-1';
-- 5. obligations (trigger + idempotent regen)
select 'gen again', generate_rent_obligations();
select period_month, due_date, amount_due, status from v_obligations order by period_month;
-- overlap test
\set ON_ERROR_STOP 0
insert into leases (tenant_id,unit_id,property_id,start_date,end_date,monthly_rent)
 select t.id,u.id,u.property_id,'2027-01-01','2027-12-31',30000 from tenants t, units u where t.full_name='Test Tenant' and u.unit_number='A-1';
\set ON_ERROR_STOP 1
-- 6. payments: Sep full, Oct partial 10000
select record_payment((select id from leases limit 1), '2026-09-04', 30000, 'upi', 'UPI-111', null, gen_random_uuid()) as p1 \gset
select record_payment((select id from leases limit 1), '2026-10-06', 10000, 'cash', null, 'part', gen_random_uuid()) as p2 \gset
-- idempotency (same key => same payment, no duplicate)
select record_payment((select id from leases limit 1), '2026-10-20', 5000, 'cash', null, 'second part', '11111111-1111-1111-1111-111111111111') as p3 \gset
select (record_payment((select id from leases limit 1), '2026-10-20', 5000, 'cash', null, 'second part', '11111111-1111-1111-1111-111111111111') = :'p3') as idempotent_ok;
-- duplicate reference blocked
\set ON_ERROR_STOP 0
select record_payment((select id from leases limit 1), '2026-11-02', 100, 'upi', 'upi-111', null, gen_random_uuid());
select record_payment((select id from leases limit 1), '2026-11-02', 100, 'cheque', null, null, gen_random_uuid());
select record_payment((select id from leases limit 1), '2027-11-02', 100, 'cash', null, null, gen_random_uuid());
\set ON_ERROR_STOP 1
select period_month, amount_due, amount_paid, outstanding, status from v_obligations order by period_month;
-- advance: pay 15000 (rest of Oct) + Nov 30000 + Dec 30000 + Jan 10000 = 85000
select record_payment((select id from leases limit 1), '2026-11-03', 85000, 'bank_transfer', 'NEFT-9', 'advance', gen_random_uuid()) as p4 \gset
select period_month, amount_due, amount_paid, outstanding, status from v_obligations order by period_month;
select amount, period_from, period_to, allocated_amount, unallocated_amount from v_payments order by created_at;
-- 7. receipts
select receipt_number, amount, snapshot->>'is_partial' partial, snapshot->>'is_advance' adv from issue_receipt(:'p2');
select receipt_number, amount, snapshot->>'is_advance' adv, snapshot->'payment'->>'period_to' pto from issue_receipt(:'p4');
\set ON_ERROR_STOP 0
select issue_receipt(:'p2');
\set ON_ERROR_STOP 1
select receipt_number, amount from issue_receipt(:'p1', 20000);
select receipt_number, amount from issue_receipt(:'p1');
-- 8. tenant history
select full_name, outstanding_due, agreement_number from v_tenants;
-- 9/10 dashboard
select jsonb_pretty(dashboard_stats() - 'monthly') ;
select dashboard_stats()->'monthly';
-- adjustment + void
select adjust_obligation((select id from rent_obligations where period_month='2027-01-01'), -2000, 'Diwali discount');
select void_payment(:'p2', 'entered twice');
select period_month, amount_due, amount_paid, outstanding, status from v_obligations order by period_month;
select receipt_number, cancelled_at is not null cancelled from receipts order by receipt_number;
\set ON_ERROR_STOP 0
update payments set amount = 1;
delete from payments;
select receipt_number from receipts;
\set ON_ERROR_STOP 1
-- 11. manager RLS: inactive manager sees nothing, cannot record
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',false);
select (select count(*) from properties) props, (select count(*) from payments) pays, (select count(*) from tenants) ten;
\set ON_ERROR_STOP 0
select record_payment((select id from leases limit 1), '2026-11-01', 100, 'cash', null, null, gen_random_uuid());
update profiles set role='admin', is_active=true where id = auth.uid();
\set ON_ERROR_STOP 1
-- admin activates + assigns another property only
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
update profiles set is_active = true where email='mgr@test.local';
select load_sample_data();
insert into property_assignments (user_id, property_id) select '00000000-0000-0000-0000-0000000000b2', id from properties where name like '[SAMPLE] Sea%';
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',false);
select name from properties;
select count(*) mgr_visible_payments from payments;
select count(*) mgr_tenants from tenants;
\set ON_ERROR_STOP 0
insert into properties (name,address) values ('x','y');
update business_settings set legal_name='hack';
select void_payment((select id from payments limit 1), 'x');
select issue_receipt(:'p4');
\set ON_ERROR_STOP 1
select record_payment((select id from leases where is_sample limit 1), app_today(), 1000, 'cash', null, 'mgr test', gen_random_uuid()) is not null as mgr_can_record;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
select tenant_name, agreement_number, expiry_alert, days_to_expiry from v_leases order by tenant_name;
select purge_sample_data();
select count(*) remaining_props from properties;
select action, summary from activity_log order by id desc limit 8;
