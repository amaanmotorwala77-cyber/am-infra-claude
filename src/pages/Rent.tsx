import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useTenants, useInvalidateFinance } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { formatINR, formatMonth, METHOD_LABEL, monthEnd, todayIST } from '@/lib/format'
import type { VObligation, VPayment } from '@/lib/types'
import { Button, Card, Checkbox, ErrorBlock, Field, FilterBar, Input, LoadingBlock, Modal, PageHeader, Select, StatCard, Tabs, Textarea } from '@/components/ui'
import { ObligationsTable, PaymentsTable } from '@/components/tables'
import { PaymentForm } from '@/components/forms/PaymentForm'

function AdjustDialog({ o, onClose }: { o: VObligation | null; onClose: () => void }) {
  const invalidate = useInvalidateFinance()
  const [adj, setAdj] = useState('0')
  const [reason, setReason] = useState('')
  const [na, setNa] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (o) { setAdj(String(o.adjustment)); setReason(o.adjustment_reason ?? o.na_reason ?? ''); setNa(o.not_applicable) } }, [o])
  async function save() {
    if (!o) return
    if (!reason.trim()) return toast.error('A reason is required for the audit log')
    setBusy(true)
    try {
      if (na !== o.not_applicable) await q(supabase.rpc('set_obligation_not_applicable', { p_obligation_id: o.id, p_value: na, p_reason: reason }))
      if (!na && Number(adj) !== Number(o.adjustment)) await q(supabase.rpc('adjust_obligation', { p_obligation_id: o.id, p_adjustment: Number(adj), p_reason: reason }))
      toast.success('Rent entry updated'); invalidate(); onClose()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!o} onOpenChange={(x) => !x && onClose()} title={`Adjust rent · ${o ? formatMonth(o.period_month) : ''}`} description={o ? `${o.tenant_name} · ${o.property_name} ${o.unit_number} · scheduled ${formatINR(o.base_amount)}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Checkbox checked={na} onChange={setNa} label="Rent not applicable for this month (waived / rent-free period)" />
        {!na && <Field label="Adjustment (₹)" hint="Negative for discount/waiver, positive for extra charges. Final amount must be ≥ amount already paid."><Input type="number" value={adj} onChange={(e) => setAdj(e.target.value)} /></Field>}
        {!na && o && <p className="text-sm">New amount due: <b>{formatINR(Number(o.base_amount) + Number(adj || 0))}</b></p>}
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

export default function Rent() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'ledger' | 'payments') || 'ledger'
  const { isAdmin } = useAuth()
  const today = todayIST()
  const { data: properties = [] } = useProperties()
  const { data: tenants = [] } = useTenants()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [allMonths, setAllMonths] = useState(false)
  const [prop, setProp] = useState('')
  const [tenant, setTenant] = useState('')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo] = useState(today)
  const [showVoid, setShowVoid] = useState(false)
  const [pay, setPay] = useState<{ lease?: string; period?: string } | null>(null)
  const [adjust, setAdjust] = useState<VObligation | null>(null)

  const ledger = useQuery({
    queryKey: ['v_obligations', 'ledger', allMonths ? 'all' : month, prop, tenant, status],
    queryFn: () => {
      let b = supabase.from('v_obligations').select('*').order('period_month', { ascending: false }).order('property_name').order('unit_number')
      if (!allMonths) b = b.eq('period_month', `${month}-01`); else b = b.lte('period_month', monthEnd(today)).limit(1000)
      if (prop) b = b.eq('property_id', prop)
      if (tenant) b = b.eq('tenant_id', tenant)
      if (status) b = b.eq('status', status)
      return q<VObligation[]>(b)
    },
    enabled: tab === 'ledger',
  })
  const payments = useQuery({
    queryKey: ['v_payments', 'list', from, to, prop, tenant, method, showVoid],
    queryFn: () => {
      let b = supabase.from('v_payments').select('*').gte('payment_date', from).lte('payment_date', to).order('payment_date', { ascending: false }).order('created_at', { ascending: false })
      if (prop) b = b.eq('property_id', prop)
      if (tenant) b = b.eq('tenant_id', tenant)
      if (method) b = b.eq('method', method)
      if (!showVoid) b = b.is('voided_at', null)
      return q<VPayment[]>(b)
    },
    enabled: tab === 'payments',
  })
  const rows = ledger.data ?? []
  const tot = rows.reduce((a, o) => (o.not_applicable ? a : { due: a.due + Number(o.amount_due), paid: a.paid + Number(o.amount_paid), out: a.out + Number(o.outstanding) }), { due: 0, paid: 0, out: 0 })
  const payTotal = (payments.data ?? []).filter((p) => !p.voided_at).reduce((a, p) => a + Number(p.amount), 0)

  return (
    <>
      <PageHeader title="Rent & Payments" description="Monthly rent obligations and recorded payments" actions={<Button variant="gold" onClick={() => setPay({})}><Plus className="h-4 w-4" />Record payment</Button>} />
      <Tabs value={tab} onChange={(t) => setParams(t === 'ledger' ? {} : { tab: t })} tabs={[{ value: 'ledger', label: 'Monthly rent ledger' }, { value: 'payments', label: 'Payments received' }]} />
      {tab === 'ledger' ? (<>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="Expected" value={formatINR(tot.due)} sub={allMonths ? 'All months to date' : formatMonth(`${month}-01`)} />
          <StatCard label="Collected" value={formatINR(tot.paid)} tone="green" sub={tot.due ? `${Math.round((tot.paid / tot.due) * 100)}% collected` : undefined} />
          <StatCard label="Outstanding" value={formatINR(tot.out)} tone="red" />
        </div>
        <Card>
          <FilterBar>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || today.slice(0, 7))} disabled={allMonths} className="sm:w-44" />
            <Checkbox checked={allMonths} onChange={setAllMonths} label="All months" />
            <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-52"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={tenant} onChange={(e) => setTenant(e.target.value)} className="sm:w-52"><option value="">All tenants</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44"><option value="">All statuses</option><option value="paid">Paid</option><option value="partially_paid">Partially paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="not_applicable">Not applicable</option></Select>
          </FilterBar>
          {ledger.isLoading ? <LoadingBlock /> : ledger.error ? <ErrorBlock error={ledger.error} onRetry={ledger.refetch} /> :
            <ObligationsTable rows={rows} onPay={(o) => setPay({ lease: o.lease_id, period: o.period_month })} onAdjust={isAdmin ? setAdjust : undefined} />}
        </Card>
      </>) : (<>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><StatCard label="Received in range" value={formatINR(payTotal)} tone="green" sub={`${(payments.data ?? []).filter((p) => !p.voided_at).length} payments`} /></div>
        <Card>
          <FilterBar>
            <label className="text-xs text-slate-500">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs text-slate-500">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-52"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={tenant} onChange={(e) => setTenant(e.target.value)} className="sm:w-52"><option value="">All tenants</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="sm:w-40"><option value="">All methods</option>{Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Checkbox checked={showVoid} onChange={setShowVoid} label="Show voided" />
          </FilterBar>
          {payments.isLoading ? <LoadingBlock /> : payments.error ? <ErrorBlock error={payments.error} onRetry={payments.refetch} /> : <PaymentsTable rows={payments.data ?? []} />}
        </Card>
      </>)}
      <PaymentForm open={!!pay} onOpenChange={(o) => !o && setPay(null)} defaultLeaseId={pay?.lease} defaultPeriod={pay?.period} />
      <AdjustDialog o={adjust} onClose={() => setAdjust(null)} />
    </>
  )
}
