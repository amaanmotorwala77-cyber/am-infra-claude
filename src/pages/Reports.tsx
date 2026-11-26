import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { supabase, q } from '@/lib/supabase'
import { useProperties, useUnits } from '@/lib/data'
import { addMonths, formatDate, formatINR, formatMonth, METHOD_LABEL, monthEnd, todayIST } from '@/lib/format'
import { downloadCSV } from '@/lib/csv'
import type { Expense, Maintenance, VLease, VObligation, VPayment } from '@/lib/types'
import { Button, Card, CardHeader, EmptyState, ErrorBlock, FilterBar, Input, LoadingBlock, PageHeader, Select, Table, Td, Th, THead, Tr, cn } from '@/components/ui'
import { EXPENSE_CATEGORIES } from '@/components/forms/OpsForms'

type Col = { key: string; label: string; money?: boolean; date?: boolean; month?: boolean }
type Row = Record<string, string | number | null>

const REPORTS = {
  collection: { label: 'Monthly rent collection', group: 'Financial' },
  outstanding: { label: 'Outstanding rent', group: 'Financial' },
  property_income: { label: 'Property-wise rental income', group: 'Financial' },
  tenant_payments: { label: 'Tenant-wise payment history', group: 'Financial' },
  maintenance: { label: 'Maintenance expense report', group: 'Financial' },
  profitability: { label: 'Monthly income & expense (profitability)', group: 'Financial' },
  occupancy: { label: 'Occupancy report', group: 'Operational' },
  vacant: { label: 'Vacant units', group: 'Operational' },
  expiry: { label: 'Agreement expiry', group: 'Operational' },
  tenant_list: { label: 'Property-wise tenant list', group: 'Operational' },
} as const
type ReportKey = keyof typeof REPORTS

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)

export default function Reports() {
  const today = todayIST()
  const [report, setReport] = useState<ReportKey>('collection')
  const [from, setFrom] = useState(addMonths(today, -5).slice(0, 7))
  const [to, setTo] = useState(today.slice(0, 7))
  const [prop, setProp] = useState('')
  const { data: properties = [] } = useProperties(true)
  const { data: units = [] } = useUnits()
  const fromD = `${from}-01`, toD = monthEnd(`${to}-01`)

  const data = useQuery({
    queryKey: ['reports', fromD, toD, prop],
    queryFn: async () => {
      const f = <T,>(b: T) => b
      let ob = supabase.from('v_obligations').select('*').gte('period_month', fromD).lte('period_month', toD)
      let pay = supabase.from('v_payments').select('*').is('voided_at', null).gte('payment_date', fromD).lte('payment_date', toD).order('tenant_name').order('payment_date')
      let ex = supabase.from('expenses').select('*, properties(name)').is('archived_at', null).gte('expense_date', fromD).lte('expense_date', toD)
      let mr = supabase.from('maintenance_requests').select('*, properties(name), units(unit_number)').neq('status', 'cancelled')
      let ls = supabase.from('v_leases').select('*').order('end_date')
      if (prop) { ob = ob.eq('property_id', prop); pay = pay.eq('property_id', prop); ex = ex.eq('property_id', prop); mr = mr.eq('property_id', prop); ls = ls.eq('property_id', prop) }
      const [o, p, e, m, l] = await Promise.all([q<VObligation[]>(f(ob)), q<VPayment[]>(pay), q<Expense[]>(ex), q<Maintenance[]>(mr), q<VLease[]>(ls)])
      return { o, p, e, m: m.filter((x) => { const d = x.completed_on ?? x.reported_on; return d >= fromD && d <= toD }), l }
    },
  })

  const { cols, rows, totals } = useMemo((): { cols: Col[]; rows: Row[]; totals?: Row } => {
    const d = data.data
    if (!d) return { cols: [], rows: [] }
    const u = units.filter((x) => !prop || x.property_id === prop)
    const months: string[] = []
    for (let m = fromD; m <= toD; m = addMonths(m, 1)) months.push(m)
    const maintCost = (pid: string | null, month?: string) =>
      sum(d.m.filter((x) => x.actual_cost !== null && (!pid || x.property_id === pid) && (!month || (x.completed_on ?? x.reported_on).startsWith(month.slice(0, 7)))), (x) => Number(x.actual_cost)) +
      sum(d.e.filter((x) => !x.maintenance_request_id && (!pid || x.property_id === pid) && (!month || x.expense_date.startsWith(month.slice(0, 7)))), (x) => Number(x.amount))
    const live = d.o.filter((x) => !x.not_applicable)

    switch (report) {
      case 'collection': {
        const rows = months.map((m) => { const os = live.filter((x) => x.period_month === m); return {
          month: m, expected: sum(os, (x) => Number(x.amount_due)), collected: sum(os, (x) => Number(x.amount_paid)), outstanding: sum(os, (x) => Number(x.outstanding)),
          rate: sum(os, (x) => Number(x.amount_due)) ? `${Math.round((sum(os, (x) => Number(x.amount_paid)) / sum(os, (x) => Number(x.amount_due))) * 100)}%` : '—',
          received: sum(d.p.filter((p) => p.payment_date.startsWith(m.slice(0, 7))), (p) => Number(p.amount)) } })
        return { cols: [{ key: 'month', label: 'Month', month: true }, { key: 'expected', label: 'Expected rent', money: true }, { key: 'collected', label: 'Collected against month', money: true }, { key: 'outstanding', label: 'Outstanding', money: true }, { key: 'rate', label: 'Collection %' }, { key: 'received', label: 'Cash received in month', money: true }],
          rows, totals: { month: 'Total', expected: sum(rows, (r) => r.expected), collected: sum(rows, (r) => r.collected), outstanding: sum(rows, (r) => r.outstanding), rate: '', received: sum(rows, (r) => r.received) } }
      }
      case 'outstanding': {
        const rows = live.filter((x) => Number(x.outstanding) > 0).sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || a.period_month.localeCompare(b.period_month))
          .map((x) => ({ tenant: x.tenant_name, property: x.property_name, unit: x.unit_number, month: x.period_month, due_date: x.due_date, expected: Number(x.amount_due), paid: Number(x.amount_paid), outstanding: Number(x.outstanding), status: x.status.replace('_', ' '), days_overdue: x.due_date < today ? Math.round((Date.parse(today) - Date.parse(x.due_date)) / 864e5) : 0 }))
        return { cols: [{ key: 'tenant', label: 'Tenant' }, { key: 'property', label: 'Property' }, { key: 'unit', label: 'Unit' }, { key: 'month', label: 'Month', month: true }, { key: 'due_date', label: 'Due', date: true }, { key: 'expected', label: 'Expected', money: true }, { key: 'paid', label: 'Paid', money: true }, { key: 'outstanding', label: 'Outstanding', money: true }, { key: 'days_overdue', label: 'Days overdue' }, { key: 'status', label: 'Status' }],
          rows, totals: { tenant: 'Total', expected: sum(rows, (r) => r.expected), paid: sum(rows, (r) => r.paid), outstanding: sum(rows, (r) => r.outstanding) } }
      }
      case 'property_income': {
        const rows = properties.filter((p) => !prop || p.id === prop).map((p) => { const os = live.filter((x) => x.property_id === p.id); return {
          property: p.name, expected: sum(os, (x) => Number(x.amount_due)), collected: sum(os, (x) => Number(x.amount_paid)), outstanding: sum(os, (x) => Number(x.outstanding)),
          received: sum(d.p.filter((x) => x.property_id === p.id), (x) => Number(x.amount)), expenses: maintCost(p.id) } }).map((r) => ({ ...r, net: r.received - r.expenses }))
        return { cols: [{ key: 'property', label: 'Property' }, { key: 'expected', label: 'Expected', money: true }, { key: 'collected', label: 'Collected (against period)', money: true }, { key: 'outstanding', label: 'Outstanding', money: true }, { key: 'received', label: 'Cash received', money: true }, { key: 'expenses', label: 'Expenses', money: true }, { key: 'net', label: 'Net (received − expenses)', money: true }],
          rows, totals: { property: 'Total', expected: sum(rows, (r) => r.expected), collected: sum(rows, (r) => r.collected), outstanding: sum(rows, (r) => r.outstanding), received: sum(rows, (r) => r.received), expenses: sum(rows, (r) => r.expenses), net: sum(rows, (r) => r.net) } }
      }
      case 'tenant_payments': {
        const rows = d.p.map((p) => ({ tenant: p.tenant_name, property: p.property_name, unit: p.unit_number, date: p.payment_date, period: p.period_from ? `${formatMonth(p.period_from)} – ${formatMonth(p.period_to)}` : '', method: METHOD_LABEL[p.method], reference: p.reference, amount: Number(p.amount) }))
        return { cols: [{ key: 'tenant', label: 'Tenant' }, { key: 'property', label: 'Property' }, { key: 'unit', label: 'Unit' }, { key: 'date', label: 'Date', date: true }, { key: 'period', label: 'Period' }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount', money: true }],
          rows, totals: { tenant: 'Total', amount: sum(rows, (r) => r.amount) } }
      }
      case 'maintenance': {
        const rows: Row[] = [
          ...d.m.filter((x) => x.actual_cost !== null || x.estimated_cost !== null).map((x) => ({ date: x.completed_on ?? x.reported_on, property: x.properties?.name ?? '', unit: x.units?.unit_number ?? 'Common', type: 'Request', description: x.title, vendor: x.assigned_to, status: x.status.replace('_', ' '), estimated: Number(x.estimated_cost ?? 0), actual: Number(x.actual_cost ?? 0) })),
          ...d.e.filter((x) => !x.maintenance_request_id).map((x) => ({ date: x.expense_date, property: x.properties?.name ?? '', unit: '', type: EXPENSE_CATEGORIES[x.category], description: x.description, vendor: x.paid_to, status: 'recorded', estimated: 0, actual: Number(x.amount) })),
        ].sort((a, b) => String(b.date).localeCompare(String(a.date)))
        return { cols: [{ key: 'date', label: 'Date', date: true }, { key: 'property', label: 'Property' }, { key: 'unit', label: 'Unit' }, { key: 'type', label: 'Type' }, { key: 'description', label: 'Description' }, { key: 'vendor', label: 'Paid to / contractor' }, { key: 'status', label: 'Status' }, { key: 'estimated', label: 'Estimated', money: true }, { key: 'actual', label: 'Actual', money: true }],
          rows, totals: { date: 'Total', estimated: sum(rows, (r) => Number(r.estimated)), actual: sum(rows, (r) => Number(r.actual)) } }
      }
      case 'profitability': {
        const rows = months.map((m) => { const os = live.filter((x) => x.period_month === m); const received = sum(d.p.filter((p) => p.payment_date.startsWith(m.slice(0, 7))), (p) => Number(p.amount)); const expenses = maintCost(prop || null, m)
          return { month: m, expected: sum(os, (x) => Number(x.amount_due)), outstanding: sum(os, (x) => Number(x.outstanding)), received, expenses, net: received - expenses } })
        return { cols: [{ key: 'month', label: 'Month', month: true }, { key: 'expected', label: 'Expected rent', money: true }, { key: 'outstanding', label: 'Outstanding rent', money: true }, { key: 'received', label: 'Rent received (income)', money: true }, { key: 'expenses', label: 'Operating & maintenance expenses', money: true }, { key: 'net', label: 'Net rental profit', money: true }],
          rows, totals: { month: 'Total', expected: sum(rows, (r) => r.expected), outstanding: sum(rows, (r) => r.outstanding), received: sum(rows, (r) => r.received), expenses: sum(rows, (r) => r.expenses), net: sum(rows, (r) => r.net) } }
      }
      case 'occupancy': {
        const rows = properties.filter((p) => !p.archived_at && (!prop || p.id === prop)).map((p) => { const us = u.filter((x) => x.property_id === p.id); const occ = us.filter((x) => x.occupancy === 'occupied').length
          return { property: p.name, units: us.length, occupied: occ, vacant: us.filter((x) => x.occupancy === 'vacant').length, unavailable: us.length - occ - us.filter((x) => x.occupancy === 'vacant').length, occupancy: us.length ? `${Math.round((occ / us.length) * 100)}%` : '—' } })
        const t = { units: sum(rows, (r) => r.units), occupied: sum(rows, (r) => r.occupied) }
        return { cols: [{ key: 'property', label: 'Property' }, { key: 'units', label: 'Units' }, { key: 'occupied', label: 'Occupied' }, { key: 'vacant', label: 'Vacant' }, { key: 'unavailable', label: 'Unavailable' }, { key: 'occupancy', label: 'Occupancy' }],
          rows, totals: { property: 'Total', ...t, vacant: sum(rows, (r) => r.vacant), unavailable: sum(rows, (r) => r.unavailable), occupancy: t.units ? `${Math.round((t.occupied / t.units) * 100)}%` : '—' } }
      }
      case 'vacant': {
        const rows = u.filter((x) => x.occupancy === 'vacant').map((x) => ({ property: x.property_name, unit: x.unit_number, floor: x.floor_number, type: x.unit_type, carpet: x.carpet_area_sqft, rent: Number(x.monthly_rent), deposit: Number(x.security_deposit) }))
        return { cols: [{ key: 'property', label: 'Property' }, { key: 'unit', label: 'Unit' }, { key: 'floor', label: 'Floor' }, { key: 'type', label: 'Type' }, { key: 'carpet', label: 'Carpet (sq ft)' }, { key: 'rent', label: 'Asking rent', money: true }, { key: 'deposit', label: 'Deposit', money: true }],
          rows, totals: { property: `${rows.length} vacant`, rent: sum(rows, (r) => r.rent) } }
      }
      case 'expiry': {
        const rows = d.l.filter((l) => ['active', 'expired'].includes(l.status) && !l.has_renewal && l.days_to_expiry <= 90).map((l) => ({ agreement: l.agreement_number, tenant: l.tenant_name, property: l.property_name, unit: l.unit_number, start: l.start_date, end: l.end_date, days: l.days_to_expiry, rent: Number(l.monthly_rent), alert: l.days_to_expiry < 0 ? 'Expired' : l.days_to_expiry <= 30 ? '≤ 30 days' : l.days_to_expiry <= 60 ? '≤ 60 days' : '≤ 90 days' }))
        return { cols: [{ key: 'agreement', label: 'Agreement' }, { key: 'tenant', label: 'Tenant' }, { key: 'property', label: 'Property' }, { key: 'unit', label: 'Unit' }, { key: 'start', label: 'Start', date: true }, { key: 'end', label: 'End', date: true }, { key: 'days', label: 'Days left' }, { key: 'alert', label: 'Alert' }, { key: 'rent', label: 'Rent', money: true }], rows }
      }
      case 'tenant_list': {
        const rows = d.l.filter((l) => l.status === 'active').sort((a, b) => a.property_name.localeCompare(b.property_name) || a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }))
          .map((l) => ({ property: l.property_name, unit: l.unit_number, tenant: l.tenant_name, phone: l.tenant_phone, agreement: l.agreement_number, start: l.start_date, end: l.end_date, rent: Number(l.monthly_rent), deposit: Number(l.security_deposit), due_day: l.rent_due_day }))
        return { cols: [{ key: 'property', label: 'Property' }, { key: 'unit', label: 'Unit' }, { key: 'tenant', label: 'Tenant' }, { key: 'phone', label: 'Phone' }, { key: 'agreement', label: 'Agreement' }, { key: 'start', label: 'Start', date: true }, { key: 'end', label: 'End', date: true }, { key: 'rent', label: 'Rent', money: true }, { key: 'deposit', label: 'Deposit', money: true }, { key: 'due_day', label: 'Due day' }],
          rows, totals: { property: 'Total', rent: sum(rows, (r) => r.rent), deposit: sum(rows, (r) => r.deposit) } }
      }
    }
  }, [data.data, report, units, properties, prop, fromD, toD, today])

  const fmt = (c: Col, v: unknown) => v === null || v === undefined || v === '' ? (c.money ? '' : '—') : c.money ? formatINR(v) : c.date ? formatDate(String(v)) : c.month ? (String(v).match(/^\d{4}-\d{2}-\d{2}$/) ? formatMonth(String(v)) : String(v)) : String(v)
  const exportCsv = () => downloadCSV(`am-infra-${report}-${from}-to-${to}.csv`, [...rows, ...(totals ? [totals] : [])].map((r) => Object.fromEntries(cols.map((c) => [c.label, c.money ? Number(r[c.key] ?? 0).toFixed(2) : r[c.key] ?? '']))))
  const usesRange = !['occupancy', 'vacant', 'expiry', 'tenant_list'].includes(report)

  return (
    <>
      <PageHeader title="Reports" description="Expected = scheduled rent · Collected = payments allocated to those months · Received = cash by payment date" />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          {(['Financial', 'Operational'] as const).map((g) => (
            <div key={g} className="mb-2">
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g}</div>
              {(Object.keys(REPORTS) as ReportKey[]).filter((k) => REPORTS[k].group === g).map((k) => (
                <button key={k} onClick={() => setReport(k)} className={cn('block w-full rounded-md px-2 py-1.5 text-left text-sm', report === k ? 'bg-navy-900 text-white' : 'text-navy-900 hover:bg-paper')}>{REPORTS[k].label}</button>
              ))}
            </div>
          ))}
        </Card>
        <Card>
          <CardHeader title={REPORTS[report].label} subtitle={usesRange ? `${formatMonth(fromD)} – ${formatMonth(toD)}` : 'As of today'} action={<Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />Export CSV</Button>} />
          <FilterBar>
            <label className="text-xs text-slate-500">From month<Input type="month" value={from} onChange={(e) => setFrom(e.target.value || from)} disabled={!usesRange} /></label>
            <label className="text-xs text-slate-500">To month<Input type="month" value={to} onChange={(e) => setTo(e.target.value || to)} disabled={!usesRange} /></label>
            <label className="text-xs text-slate-500 sm:w-56">Property<Select value={prop} onChange={(e) => setProp(e.target.value)}><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archived_at ? ' (archived)' : ''}</option>)}</Select></label>
          </FilterBar>
          {data.isLoading ? <LoadingBlock /> : data.error ? <ErrorBlock error={data.error} onRetry={data.refetch} /> : rows.length === 0 ? <EmptyState title="No data for this selection" /> : (
            <Table>
              <THead><tr>{cols.map((c) => <Th key={c.key} className={c.money ? 'text-right' : ''}>{c.label}</Th>)}</tr></THead>
              <tbody>
                {rows.map((r, i) => <Tr key={i}>{cols.map((c) => <Td key={c.key} className={cn(c.money && 'text-right tabular-nums', c.key === 'net' && Number(r[c.key]) < 0 && 'text-red-700')}>{fmt(c, r[c.key])}</Td>)}</Tr>)}
                {totals && <tr className="border-t-2 border-navy-900/20 bg-paper font-semibold">{cols.map((c) => <Td key={c.key} className={cn(c.money && 'text-right tabular-nums')}>{c.key in totals ? (c.money ? formatINR(totals[c.key]) : String(totals[c.key] ?? '')) : ''}</Td>)}</tr>}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
