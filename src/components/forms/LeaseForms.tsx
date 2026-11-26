import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useTenants, useUnits, useInvalidateFinance } from '@/lib/data'
import { uploadDocument } from '@/lib/docs'
import type { VLease, Lease } from '@/lib/types'
import { formatDate, formatINR, todayIST } from '@/lib/format'
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { validate, req, money, dateStr, optStr, type Errors } from './common'

const leaseSchema = z.object({
  tenant_id: req('Tenant'), unit_id: req('Unit'), start_date: dateStr('Start date'), end_date: dateStr('End date'),
  monthly_rent: money('Monthly rent', 1), security_deposit: money('Security deposit'),
  rent_due_day: z.coerce.number().int().min(1, 'Day 1–31').max(31, 'Day 1–31'),
  escalation_percent: z.coerce.number().min(0).max(100), escalation_interval_months: z.coerce.number().int().min(1).max(120),
  escalation_terms: optStr, notes: optStr, prorate_partial_months: z.boolean(), allow_overlap: z.boolean(),
}).refine((d) => d.end_date >= d.start_date, { path: ['end_date'], message: 'End date must be after start date' })

function addMonthsMinusDay(start: string, months: number) {
  const [y, m, d] = start.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, d - 1))
  return dt.toISOString().slice(0, 10)
}

export function LeaseForm({ open, onOpenChange, lease, defaultTenantId, defaultUnitId }: {
  open: boolean; onOpenChange: (o: boolean) => void; lease?: Lease | null; defaultTenantId?: string; defaultUnitId?: string
}) {
  const qc = useQueryClient(); const invalidate = useInvalidateFinance()
  const { data: properties = [] } = useProperties()
  const { data: units = [] } = useUnits()
  const { data: tenants = [] } = useTenants()
  const [v, setV] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState({ prorate_partial_months: true, allow_overlap: false })
  const [propertyId, setPropertyId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const start = lease?.start_date ?? todayIST().slice(0, 8) + '01'
    setV({
      tenant_id: lease?.tenant_id ?? defaultTenantId ?? '', unit_id: lease?.unit_id ?? defaultUnitId ?? '',
      start_date: start, end_date: lease?.end_date ?? addMonthsMinusDay(start, 11),
      monthly_rent: lease ? String(lease.monthly_rent) : '', security_deposit: lease ? String(lease.security_deposit) : '',
      rent_due_day: String(lease?.rent_due_day ?? 5), escalation_percent: String(lease?.escalation_percent ?? 0),
      escalation_interval_months: String(lease?.escalation_interval_months ?? 12), escalation_terms: lease?.escalation_terms ?? '', notes: lease?.notes ?? '',
    })
    setFlags({ prorate_partial_months: lease?.prorate_partial_months ?? true, allow_overlap: lease?.allow_overlap ?? false })
    setPropertyId(lease?.property_id ?? units.find((u) => u.id === defaultUnitId)?.property_id ?? '')
    setFile(null); setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lease])

  const unitOptions = useMemo(() => units.filter((u) => (!propertyId || u.property_id === propertyId)), [units, propertyId])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))

  function pickUnit(id: string) {
    const u = units.find((x) => x.id === id)
    setV((s) => ({ ...s, unit_id: id, monthly_rent: s.monthly_rent || (u ? String(u.monthly_rent) : ''), security_deposit: s.security_deposit || (u ? String(u.security_deposit) : '') }))
  }

  async function save() {
    const { data, errors } = validate(leaseSchema, { ...v, ...flags }); setErrors(errors); if (!data) return
    if (file && file.type !== 'application/pdf') { toast.error('Signed agreement must be a PDF'); return }
    setBusy(true)
    try {
      const row = lease
        ? await q<Lease>(supabase.from('leases').update(data).eq('id', lease.id).select().single())
        : await q<Lease>(supabase.from('leases').insert({ ...data, property_id: units.find((u) => u.id === data.unit_id)?.property_id }).select().single())
      if (file) await uploadDocument(file, { category: 'rental_agreement', name: `Agreement ${row.agreement_number}.pdf`, property_id: row.property_id, unit_id: row.unit_id, tenant_id: row.tenant_id, lease_id: row.id })
      toast.success(lease ? 'Agreement updated — unpaid rent months recalculated' : `Agreement ${row.agreement_number} created and rent schedule generated`)
      qc.invalidateQueries({ queryKey: ['v_leases'] }); qc.invalidateQueries({ queryKey: ['documents'] }); qc.invalidateQueries({ queryKey: ['tenant'] }); invalidate()
      onOpenChange(false)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={lease ? `Edit agreement ${lease.agreement_number}` : 'New rental agreement'} wide
      description="Monthly rent obligations are generated automatically from these terms."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>{lease ? 'Save changes' : 'Create agreement'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tenant" required error={errors.tenant_id}>
          <Select value={v.tenant_id} onChange={set('tenant_id')} disabled={!!lease}>
            <option value="">Select tenant…</option>{tenants.filter((t) => !t.archived_at).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Property">
          <Select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setV((s) => ({ ...s, unit_id: '' })) }} disabled={!!lease}>
            <option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Unit" required error={errors.unit_id} className="sm:col-span-2">
          <Select value={v.unit_id} onChange={(e) => pickUnit(e.target.value)} disabled={!!lease}>
            <option value="">Select unit…</option>
            {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.property_name} · {u.unit_number} — {u.occupancy === 'occupied' ? `occupied by ${u.current_tenant_name}` : u.occupancy.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Start date" required error={errors.start_date}><Input type="date" value={v.start_date ?? ''} onChange={(e) => setV((s) => ({ ...s, start_date: e.target.value, end_date: lease ? s.end_date : (e.target.value ? addMonthsMinusDay(e.target.value, 11) : s.end_date) }))} /></Field>
        <Field label="End date" required error={errors.end_date} hint="Defaults to 11 months (leave & licence)"><Input type="date" value={v.end_date ?? ''} onChange={set('end_date')} /></Field>
        <Field label="Monthly rent (₹)" required error={errors.monthly_rent}><Input type="number" min={0} value={v.monthly_rent ?? ''} onChange={set('monthly_rent')} /></Field>
        <Field label="Security deposit (₹)" error={errors.security_deposit}><Input type="number" min={0} value={v.security_deposit ?? ''} onChange={set('security_deposit')} /></Field>
        <Field label="Rent due day of month" error={errors.rent_due_day} hint="Clamped to month end (e.g. 31 → 30 in Nov)"><Input type="number" min={1} max={31} value={v.rent_due_day ?? ''} onChange={set('rent_due_day')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Escalation %" error={errors.escalation_percent}><Input type="number" min={0} max={100} step="0.5" value={v.escalation_percent ?? ''} onChange={set('escalation_percent')} /></Field>
          <Field label="Every (months)" error={errors.escalation_interval_months}><Input type="number" min={1} value={v.escalation_interval_months ?? ''} onChange={set('escalation_interval_months')} /></Field>
        </div>
        <Field label="Escalation terms (as written in agreement)" className="sm:col-span-2"><Input value={v.escalation_terms ?? ''} onChange={set('escalation_terms')} /></Field>
        <div className="space-y-2 sm:col-span-2">
          <Checkbox checked={flags.prorate_partial_months} onChange={(c) => setFlags((f) => ({ ...f, prorate_partial_months: c }))} label="Pro-rate rent for partial first/last months" />
          <Checkbox checked={flags.allow_overlap} onChange={(c) => setFlags((f) => ({ ...f, allow_overlap: c }))} label={<span>Allow overlapping active agreement on this unit <span className="text-xs text-slate-500">(e.g. shared/co-tenancy — normally leave off)</span></span>} />
        </div>
        {!lease && <Field label="Signed agreement (PDF, optional)" className="sm:col-span-2"><Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="py-1.5" /></Field>}
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  )
}

export function RenewLeaseForm({ open, onOpenChange, lease }: { open: boolean; onOpenChange: (o: boolean) => void; lease: VLease | null }) {
  const invalidate = useInvalidateFinance()
  const [v, setV] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open || !lease) return
    const [y, m, d] = lease.end_date.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    const rent = Math.round(lease.monthly_rent * (1 + (lease.escalation_percent || 5) / 100))
    setV({ start, end: addMonthsMinusDay(start, 11), rent: String(rent), deposit: String(lease.security_deposit), due: String(lease.rent_due_day), esc: String(lease.escalation_percent), every: String(lease.escalation_interval_months), terms: lease.escalation_terms ?? '' })
  }, [open, lease])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  async function save() {
    if (!lease) return
    if (!(Number(v.rent) > 0)) return toast.error('Enter the new monthly rent')
    if (v.end < v.start) return toast.error('End date must be after start date')
    setBusy(true)
    try {
      await q(supabase.rpc('renew_lease', { p_lease_id: lease.id, p_start: v.start, p_end: v.end, p_rent: Number(v.rent), p_deposit: Number(v.deposit || 0), p_due_day: Number(v.due), p_escalation_percent: Number(v.esc || 0), p_escalation_interval: Number(v.every || 12), p_terms: v.terms || null }))
      toast.success('Agreement renewed. The previous agreement and its rent history are preserved.')
      invalidate(); onOpenChange(false)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Renew ${lease?.agreement_number ?? ''}`} description={lease ? `${lease.tenant_name} · ${lease.property_name} ${lease.unit_number} · current rent ${formatINR(lease.monthly_rent)} until ${formatDate(lease.end_date)}` : ''}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Renew agreement</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New start date" hint="Must be after current end date"><Input type="date" value={v.start ?? ''} onChange={set('start')} /></Field>
        <Field label="New end date"><Input type="date" value={v.end ?? ''} onChange={set('end')} /></Field>
        <Field label="New monthly rent (₹)"><Input type="number" value={v.rent ?? ''} onChange={set('rent')} /></Field>
        <Field label="Security deposit (₹)"><Input type="number" value={v.deposit ?? ''} onChange={set('deposit')} /></Field>
        <Field label="Due day"><Input type="number" min={1} max={31} value={v.due ?? ''} onChange={set('due')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Escalation %"><Input type="number" value={v.esc ?? ''} onChange={set('esc')} /></Field>
          <Field label="Every (months)"><Input type="number" value={v.every ?? ''} onChange={set('every')} /></Field>
        </div>
        <Field label="Escalation terms" className="sm:col-span-2"><Input value={v.terms ?? ''} onChange={set('terms')} /></Field>
      </div>
    </Modal>
  )
}
