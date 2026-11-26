import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Building2, DoorOpen, IndianRupee, AlertTriangle, Percent, Plus, Wrench, CalendarClock, Home } from 'lucide-react'
import { supabase, q } from '@/lib/supabase'
import { useProperties } from '@/lib/data'
import { addMonths, formatDate, formatDateTime, formatINR, formatINRCompact, formatMonth, METHOD_LABEL, monthEnd, todayIST } from '@/lib/format'
import type { Activity, Maintenance, VLease, VObligation, VPayment } from '@/lib/types'
import { Button, Card, CardHeader, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Select, StatCard } from '@/components/ui'
import { ExpiryBadge, MaintenanceBadge, ObligationBadge } from '@/components/status'
import { PaymentForm } from '@/components/forms/PaymentForm'
import { PropertyForm } from '@/components/forms/PropertyForms'

interface Stats {
  total_properties: number; total_units: number; occupied_units: number; vacant_units: number; other_units: number
  expected_monthly_income: number; expected_in_period: number; collected_against_period: number; received_in_period: number
  outstanding_in_period: number; outstanding_total: number; overdue_total: number
  monthly: { month: string; expected: number; collected: number; received: number }[]
  by_property: { property_id: string; name: string; expected: number; collected: number }[]
}

const tickINR = (v: number) => formatINRCompact(v).replace('₹', '₹')

export default function Dashboard() {
  const nav = useNavigate()
  const today = todayIST()
  const [propertyId, setPropertyId] = useState('')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [propOpen, setPropOpen] = useState(false)
  const from = range?.from || `${month}-01`
  const to = range?.to || monthEnd(`${month}-01`)
  const { data: properties = [] } = useProperties()

  const stats = useQuery({
    queryKey: ['dashboard', propertyId, from, to],
    queryFn: () => q<Stats>(supabase.rpc('dashboard_stats', { p_property_id: propertyId || null, p_from: from, p_to: to })),
  })
  const upcoming = useQuery({
    queryKey: ['v_obligations', 'upcoming', propertyId],
    queryFn: () => {
      let b = supabase.from('v_obligations').select('*').gt('outstanding', 0).lte('due_date', addMonths(today, 1)).order('due_date').limit(8)
      if (propertyId) b = b.eq('property_id', propertyId)
      return q<VObligation[]>(b)
    },
  })
  const payments = useQuery({
    queryKey: ['v_payments', 'recent', propertyId],
    queryFn: () => { let b = supabase.from('v_payments').select('*').is('voided_at', null).order('created_at', { ascending: false }).limit(6); if (propertyId) b = b.eq('property_id', propertyId); return q<VPayment[]>(b) },
  })
  const expiring = useQuery({
    queryKey: ['v_leases', 'expiring', propertyId],
    queryFn: () => { let b = supabase.from('v_leases').select('*').not('expiry_alert', 'is', null).order('end_date').limit(8); if (propertyId) b = b.eq('property_id', propertyId); return q<VLease[]>(b) },
  })
  const maint = useQuery({
    queryKey: ['maintenance', 'attention', propertyId],
    queryFn: () => { let b = supabase.from('maintenance_requests').select('*, properties(name), units(unit_number)').in('status', ['open', 'in_progress']).order('reported_on').limit(6); if (propertyId) b = b.eq('property_id', propertyId); return q<Maintenance[]>(b) },
  })
  const activity = useQuery({
    queryKey: ['activity', propertyId],
    queryFn: () => { let b = supabase.from('activity_log').select('id, occurred_at, action, entity_type, entity_id, summary').order('occurred_at', { ascending: false }).limit(10); if (propertyId) b = b.eq('property_id', propertyId); return q<Activity[]>(b) },
  })

  const s = stats.data
  const pct = s && s.expected_in_period > 0 ? Math.round((s.collected_against_period / s.expected_in_period) * 100) : null
  const chart = useMemo(() => (s?.monthly ?? []).map((m) => ({ ...m, label: formatMonth(m.month), expected: Number(m.expected), collected: Number(m.collected), received: Number(m.received) })), [s])
  const periodLabel = range ? `${formatDate(from)} – ${formatDate(to)}` : formatMonth(from)

  if (stats.isLoading) return <LoadingBlock />
  if (stats.error) return <ErrorBlock error={stats.error} onRetry={() => stats.refetch()} />
  if (s && s.total_properties === 0 && !propertyId) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your properties. One platform." />
        <Card><EmptyState icon={<Building2 className="h-6 w-6" />} title="No properties yet" description="Add your first building to start tracking units, tenants and rent. (Admins can also load clearly-labelled sample data from Settings.)"
          action={<Button onClick={() => setPropOpen(true)}><Plus className="h-4 w-4" />Add your first property</Button>} /></Card>
        <PropertyForm open={propOpen} onOpenChange={setPropOpen} onSaved={(id) => nav(`/properties/${id}`)} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Dashboard" description={`Overview for ${periodLabel}`} actions={<Button variant="gold" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4" />Record payment</Button>} />
      <Card className="mb-5 flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-xs text-slate-500 sm:w-56">Property<Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <label className="text-xs text-slate-500 sm:w-44">Month<Input type="month" value={month} onChange={(e) => { setMonth(e.target.value || today.slice(0, 7)); setRange(null) }} /></label>
        <span className="hidden pb-2 text-xs text-slate-400 sm:inline">or range</span>
        <label className="text-xs text-slate-500 sm:w-40">From<Input type="date" value={range?.from ?? ''} onChange={(e) => setRange((r) => ({ from: e.target.value, to: r?.to || monthEnd(e.target.value || today) }))} /></label>
        <label className="text-xs text-slate-500 sm:w-40">To<Input type="date" value={range?.to ?? ''} onChange={(e) => setRange((r) => ({ from: r?.from || `${month}-01`, to: e.target.value }))} /></label>
        {range && <Button variant="ghost" size="sm" onClick={() => setRange(null)}>Clear range</Button>}
      </Card>

      {s && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Properties" value={s.total_properties} icon={<Building2 className="h-4 w-4" />} sub={`${s.total_units} rental units`} />
          <StatCard label="Occupied / Vacant" value={<span>{s.occupied_units}<span className="text-slate-300"> / </span><span className="text-gold-600">{s.vacant_units}</span></span>} icon={<DoorOpen className="h-4 w-4" />}
            sub={s.total_units ? `${Math.round((s.occupied_units / s.total_units) * 100)}% occupancy${s.other_units ? ` · ${s.other_units} unavailable` : ''}` : 'No units'} />
          <StatCard label="Expected monthly rent" value={formatINRCompact(s.expected_monthly_income)} icon={<Home className="h-4 w-4" />} sub="From active agreements today" />
          <StatCard label="Collection rate" value={pct === null ? '—' : `${pct}%`} tone={pct !== null && pct < 80 ? 'red' : 'green'} icon={<Percent className="h-4 w-4" />} sub={`of rent due for ${periodLabel}`} />
          <StatCard label="Rent due (period)" value={formatINR(s.expected_in_period)} icon={<CalendarClock className="h-4 w-4" />} sub="Expected — not yet money" />
          <StatCard label="Collected against period" value={formatINR(s.collected_against_period)} tone="green" icon={<IndianRupee className="h-4 w-4" />} sub={`Cash received in period: ${formatINR(s.received_in_period)}`} />
          <StatCard label="Outstanding (period)" value={formatINR(s.outstanding_in_period)} tone="gold" icon={<AlertTriangle className="h-4 w-4" />} sub="Unpaid rent for selected period" />
          <StatCard label="Total arrears" value={formatINR(s.overdue_total)} tone="red" icon={<AlertTriangle className="h-4 w-4" />} sub="All overdue rent to date" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Rent collection — last 6 months" subtitle="Expected rent vs rent collected against each month" />
            <div className="h-72 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: 4, right: 8, top: 8 }} barGap={2}>
                  <CartesianGrid stroke="#EEE9DF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={tickINR} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: 'rgba(15,27,45,0.04)' }} contentStyle={{ borderRadius: 8, borderColor: '#E7E2D8', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar isAnimationActive={false} dataKey="expected" name="Expected" fill="#C9CFD8" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar isAnimationActive={false} dataKey="collected" name="Collected" fill="#B8915A" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Income by property" subtitle={`Cash received · ${periodLabel}`} />
            <div className="h-72 p-3">
              {s.by_property.length === 0 ? <EmptyState title="No properties" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.by_property.map((p) => ({ ...p, expected: Number(p.expected), collected: Number(p.collected), short: p.name.replace('[SAMPLE] ', '').slice(0, 18) }))} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid stroke="#EEE9DF" horizontal={false} />
                    <XAxis type="number" tickFormatter={tickINR} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="short" tick={{ fontSize: 11, fill: '#334155' }} width={110} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ borderRadius: 8, borderColor: '#E7E2D8', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar isAnimationActive={false} dataKey="expected" name="Expected" fill="#C9CFD8" radius={[0, 3, 3, 0]} maxBarSize={14} />
                    <Bar isAnimationActive={false} dataKey="collected" name="Received" fill="#0F1B2D" radius={[0, 3, 3, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </>}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming & overdue rent" action={<Link to="/rent" className="text-xs text-gold-700 hover:underline">View ledger</Link>} />
          {upcoming.data?.length ? upcoming.data.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-0">
              <div className="min-w-0"><div className="truncate font-medium">{o.tenant_name}</div><div className="text-xs text-slate-500">{o.property_name} · {o.unit_number} · {formatMonth(o.period_month)} · due {formatDate(o.due_date)}</div></div>
              <div className="flex shrink-0 items-center gap-2"><span className="tabular-nums">{formatINR(o.outstanding)}</span><ObligationBadge status={o.status} /></div>
            </div>)) : <EmptyState title="Nothing due in the next month" />}
        </Card>
        <Card>
          <CardHeader title="Recently recorded payments" action={<Link to="/rent?tab=payments" className="text-xs text-gold-700 hover:underline">All payments</Link>} />
          {payments.data?.length ? payments.data.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-0">
              <div className="min-w-0"><div className="truncate font-medium">{p.tenant_name}</div><div className="text-xs text-slate-500">{formatDate(p.payment_date)} · {METHOD_LABEL[p.method]} · {p.property_name} {p.unit_number}</div></div>
              <span className="shrink-0 font-medium tabular-nums text-emerald-700">{formatINR(p.amount)}</span>
            </div>)) : <EmptyState title="No payments recorded yet" />}
        </Card>
        <Card>
          <CardHeader title="Agreement expiry alerts" action={<Link to="/agreements" className="text-xs text-gold-700 hover:underline">Agreements</Link>} />
          {expiring.data?.length ? expiring.data.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-0">
              <div className="min-w-0"><div className="truncate font-medium">{l.tenant_name}</div><div className="text-xs text-slate-500">{l.agreement_number} · {l.property_name} {l.unit_number} · ends {formatDate(l.end_date)}</div></div>
              <ExpiryBadge alert={l.expiry_alert} days={l.days_to_expiry} />
            </div>)) : <EmptyState title="No agreements expiring within 60 days" />}
        </Card>
        <Card>
          <CardHeader title="Maintenance needing attention" action={<Link to="/maintenance" className="text-xs text-gold-700 hover:underline">Maintenance</Link>} />
          {maint.data?.length ? maint.data.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-0">
              <div className="min-w-0"><div className="flex items-center gap-2 truncate font-medium"><Wrench className="h-3.5 w-3.5 text-slate-400" />{m.title}</div><div className="text-xs text-slate-500">{m.properties?.name}{m.units ? ` · ${m.units.unit_number}` : ''} · reported {formatDate(m.reported_on)} · {m.priority}</div></div>
              <MaintenanceBadge status={m.status} />
            </div>)) : <EmptyState title="No open requests" />}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent activity" />
        {activity.data?.length ? (
          <ul className="divide-y divide-line/70">
            {activity.data.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gold-500 align-middle" />{a.summary ?? a.action}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatDateTime(a.occurred_at)}</span>
              </li>))}
          </ul>) : <EmptyState title="No activity yet" />}
      </Card>
      <PaymentForm open={payOpen} onOpenChange={setPayOpen} />
    </>
  )
}
