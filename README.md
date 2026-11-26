# AM Infra PropertyOS

**Your properties. One platform.** A property management system for AM Infra. It covers properties, units, tenants, rental agreements, rent collection, receipts, maintenance, documents and reports. Phase 5 (redevelopment) has its foundations in place.

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui-style components (Radix), Recharts, jsPDF
- **Backend:** Supabase (Postgres, Auth, private Storage, Row Level Security)
- **Locale:** INR (₹), Indian number grouping (1,20,000), Asia/Kolkata dates, financial year from April to March

---

## 1. One-time setup (about 15 minutes)

### a) Create the Supabase project
1. Go to https://supabase.com and create a project. Pick the **Mumbai (ap-south-1)** region.
2. Open **SQL Editor** and run these files **in order**. Paste each one and click Run:
   1. `supabase/migrations/20261126000001_core_schema.sql`
   2. `supabase/migrations/20261126000002_rent_engine.sql`
   3. `supabase/migrations/20261126000003_security.sql` (this also creates the private `documents` storage bucket)
   4. `supabase/migrations/20261126000004_sample_data.sql`

   If you use the Supabase CLI instead: `supabase link` and then `supabase db push`.
3. Under **Authentication → Sign In / Providers → Email**, keep email enabled. "Confirm email" is recommended.
4. Under **Authentication → URL Configuration**, set the Site URL to wherever you host the app (e.g. `https://am-infra.vercel.app`).

### b) Configure the app
```bash
cp .env.example .env.local
# Fill in from Supabase → Project Settings → API:
# VITE_SUPABASE_URL=https://<ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon public key>
npm install
npm run dev        # http://localhost:5173
```
> Only the **anon** key goes in the frontend. Never put the `service_role` key in `.env.local` or anywhere in this app. RLS protects the data.

### c) First login
1. Open the app and choose **Create an account**. **The first account automatically becomes the Admin.**
2. Go to **Settings → Business details** and replace the placeholders. These details are printed on every receipt.
3. *(Optional)* Go to **Settings → Sample data → Load sample data** to try things out. Every sample record is prefixed `[SAMPLE]`. You can remove them all with one click.
4. Family members or managers sign up themselves. They wait as *inactive Property Managers* until you **Approve** them in **Settings → Users** and click the properties they may manage.
   Once everyone has joined, you can turn off "Allow new users to sign up" in Supabase Auth.

### d) Deploy (phone + laptop access)
- **Vercel (recommended):**
  1. Push this folder to a private GitHub repo.
  2. On vercel.com, choose **Add New → Project** and import the repo. Vercel detects Vite automatically.
  3. Add the env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then click **Deploy**.
  4. *(Optional)* Add your domain under **Settings → Domains**. Then set the same URL as the Site URL in Supabase Auth.

  `vercel.json` already handles page routing and security headers.
- **Netlify:** build with `npm run build` and publish `dist`. `public/_redirects` handles routing.

### Public landing page
- Logged-out visitors see the AM Infra landing page at `/` (`src/pages/Landing.tsx`). The sign-in page is at `/login`.
- Signed-in users go straight to the dashboard.
- The landing page works even before Supabase is configured. Only `/login` shows the setup notice.
- `index.html` has `<meta name="robots" content="noindex">`, which keeps the site out of Google. Remove that line if you want the company page to show up in search.

---

## 2. Daily workflow
1. **Properties → Add property**, then **Add unit** for each flat, shop or office.
2. **Tenants → Add tenant.**
3. **Agreements → New agreement**: choose the tenant, unit, dates, rent, due day and escalation, and optionally attach the signed PDF.
   Monthly rent rows are generated automatically and are never duplicated.
4. When money arrives, go to **Rent & Payments → Record payment**. Enter the amount actually received, the method and the UTR/cheque number.
5. Click **Generate receipt PDF**. You can download, print or re-open it any time from **Receipts**.
6. **Dashboard** and **Reports** update immediately. CSV export is on every report.

---

## 3. Architecture

```
React SPA (anon key + user JWT)
   │  supabase-js
   ▼
Supabase ── Auth (email/password)
         ── Postgres: tables + RLS + SECURITY DEFINER functions (all money logic)
         ── Storage: private "documents" bucket, RLS by property folder, signed URLs only
```

### Database (see `supabase/migrations`)
| Table | Purpose |
|---|---|
| `profiles`, `property_assignments` | Users, role (admin / manager) and which properties a manager can access |
| `business_settings` | Landlord legal name, address, PAN and receipt prefix (one row) |
| `properties` → `units` | Buildings and rentable units (archived, never deleted) |
| `tenants` | Tenant register |
| `leases` | Rental agreements. Renewals link by `previous_lease_id`. A Postgres **exclusion constraint** blocks overlapping active leases per unit unless `allow_overlap` is set |
| `rent_obligations` | One row per lease per month. `UNIQUE(lease_id, period_month)` prevents duplicates. Holds escalation, pro-ration and adjustments |
| `payments` | Money actually received. An idempotency key and a unique reference per method block double entry. Amounts are immutable; a payment can only be *voided* |
| `payment_allocations` | Splits a payment across one or more months (partial, multi-month, arrears, advance) |
| `receipts`, `receipt_counters` | Gap-free numbering per financial year (`AMI/2026-27/00001`) with an immutable snapshot of what was printed |
| `maintenance_requests`, `expenses` | Operations and costs |
| `documents` | File metadata linked to a property, unit, tenant, lease, payment, maintenance request or project |
| `activity_log` | Audit trail: automatic triggers on master data plus explicit entries for payments, voids, receipts and adjustments |
| `redevelopment_projects` | Phase 5 foundation. Links to an existing `property` |

Views: `v_obligations` (status and outstanding are computed, never stored), `v_payments`, `v_leases` (expiry alerts at 30 and 60 days), `v_units` (occupancy derived from active agreements), `v_tenants`.

### How rent, payments and receipts connect
```
lease ──< rent_obligations (month, due date, amount + adjustment)
                 ▲
payment ──< payment_allocations >── obligation       status = f(sum of non-void allocations, due date)
   │
   └──< receipts (snapshot of the actual amount received + months covered)
```
- `record_payment()` locks the lease, rejects duplicates and allocates the payment to the oldest dues first (or from a month you choose). Any surplus creates and fills the following months as an **advance**.
- Rent is only "Paid" when recorded payments cover it. Nothing is ever marked paid from expected amounts.
- `issue_receipt()` can only receipt money that was actually received (a partial receipt is allowed). It never issues more than the payment amount.
- Admin-only: `void_payment()` (with a reason, and cancels its receipts), `adjust_obligation()`, `set_obligation_not_applicable()`, `renew_lease()`, `terminate_lease()`.

### Permissions (enforced in the database)
| | Admin | Property Manager |
|---|---|---|
| See data | All properties | Only assigned properties (RLS) |
| Properties / units / agreements | Create and edit | View |
| Tenants | Full | Create and edit, for their properties |
| Record payments, issue receipts | ✓ | ✓ (assigned properties) |
| Void payments, adjust rent | ✓ | ✗ |
| Maintenance, expenses, documents | ✓ | ✓ (assigned properties) |
| Users, business settings, sample data | ✓ | ✗ |

Financial tables have **no** direct insert, update or delete grants. Delete triggers block hard deletes of tenancy and financial records. Anonymous users have no access to anything.

---

## 4. Testing
- `supabase/tests/workflow_test.sql` tests the schema end-to-end in plain Postgres: obligations, the overlap block, idempotency, duplicate references, partial, multi-month and advance payments, receipts, adjustments, voids, the delete/update guards, manager RLS and sample load/purge. `local_auth_stub.sql` imitates Supabase's `auth` schema for local runs.
- The 10-step UI workflow was run in a headless browser against this schema with RLS active:

  1. Property → 2. units → 3. tenant → 4. agreement → 5. obligations → 6. payment → 7. receipt PDF → 8. tenant history → 9. dashboard → 10. outstanding.

  All steps passed.

## 5. Known limitations / next steps
- Credit beyond an agreement's end date stays as "unallocated credit" on the payment. It is not moved to a renewal automatically.
- Terminating an agreement mid-month keeps that month's scheduled rent. Use **Adjust** to reduce it.
- Security deposit refunds are recorded as expenses. Phase 4+ could add a dedicated deposit ledger.
- New users join through sign-up plus Admin approval. Email invitations would need a Supabase Edge Function using the service-role key on the server.
- Phase 5 (floor plans, construction, budgets, sales) is scaffolded only.
