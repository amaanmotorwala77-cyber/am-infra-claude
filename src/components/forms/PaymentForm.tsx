import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useActiveLeases, useInvalidateFinance } from '@/lib/data'
import type { PaymentMethod, Receipt, VObligation } from '@/lib/types'
import { formatDate, formatINR, formatMonth, METHOD_LABEL, todayIST } from '@/lib/format'
import { downloadReceipt } from '@/lib/receiptPdf'
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { ObligationBadge } from '@/components/status'

export function PaymentForm({ open, onOpenChange, defaultLeaseId, defaultPeriod }: {
  open: boolean; onOpenChange: (o: boolean) => void; defaultLeaseId?: string; defaultPeriod?: string
}) {
  const invalidate = useInvalidateFinance()
  const { data: leases = [] } = useActiveLeases()
  const [leaseId, setLeaseId] = useState('')
  const [date, setDate] = useState(todayIST())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('upi')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<'oldest' | 'from'>('oldest')
  const [fromMonth, setFromMonth] = useState('')
  const [allowDup, setAllowDup] = useState(false)
  const [idemKey, setIdemKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<{ id: string; amount: number } | null>(null)
  const [issuing, setIssuing] = useState(false)

  useEffect(() => {
    if (!open) return
    setLeaseId(defaultLeaseId ?? ''); setDate(todayIST()); setAmount(''); setMethod('upi'); setReference(''); setNotes('')
    setMode(defaultPeriod ? 'from' : 'oldest'); setFromMonth(defaultPeriod?.slice(0, 7) ?? ''); setAllowDup(false)
    setIdemKey(crypto.randomUUID()); setErrors({}); setSaved(null)
  }, [open, defaultLeaseId, defaultPeriod])

  const lease = leases.find((l) => l.id === leaseId)
  const { data: dues = [] } = useQuery({
    queryKey: ['v_obligations', 'lease', leaseId], enabled: !!leaseId,
    queryFn: () => q<VObligation[]>(supabase.from('v_obligations').select('*').eq('lease_id', leaseId).order('period_month')),
  })
  const open_dues = useMemo(() => dues.filter((d) => d.outstanding > 0), [dues])
  const totalOutstanding = open_dues.filter((d) => d.due_date <= todayIST()).reduce((a, d) => a + Number(d.outstanding), 0)

  // Preview allocation client-side (server does the real allocation)
  const preview = useMemo(() => {
    let rem = Number(amount) || 0
    const out: { label: string; amt: number }[] = []
    for (const d of open_dues) {
      if (mode === 'from' && fromMonth && d.period_month < fromMonth + '-01') continue
      if (rem <= 0) break
      const a = Math.min(rem, Number(d.outstanding)); out.push({ label: formatMonth(d.period_month), amt: a }); rem -= a
    }
    return { out, advance: rem }
  }, [amount, open_dues, mode, fromMonth])

  async function submit() {
    const e: Record<string, string> = {}
    if (!leaseId) e.lease = 'Select the agreement'
    if (!(Number(amount) > 0)) e.amount = 'Enter the amount actually received'
    if (!date) e.date = 'Payment date is required'; else if (date > todayIST()) e.date = 'Payment date cannot be in the future'
    if ((method === 'upi' || method === 'cheque') && !reference.trim()) e.reference = method === 'cheque' ? 'Cheque number is required' : 'UPI transaction ID is required'
    if (mode === 'from' && !fromMonth) e.from = 'Pick the starting month'
    setErrors(e); if (Object.keys(e).length) return
    setBusy(true)
    try {
      const id = await q<string>(supabase.rpc('record_payment', {
        p_lease_id: leaseId, p_payment_date: date, p_amount: Number(amount), p_method: method, p_reference: reference.trim() || null,
        p_notes: notes.trim() || null, p_idempotency_key: idemKey, p_start_period: mode === 'from' ? fromMonth + '-01' : null, p_allow_duplicate: allowDup,
      }))
      toast.success(`Payment of ${formatINR(amount)} recorded`)
      invalidate(); setSaved({ id, amount: Number(amount) })
    } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) }
  }

  async function issue() {
    if (!saved) return
    setIssuing(true)
    try {
      const r = await q<Receipt>(supabase.rpc('issue_receipt', { p_payment_id: saved.id }).single())
      downloadReceipt(r); toast.success(`Receipt ${r.receipt_number} generated`); invalidate(); onOpenChange(false)
    } catch (err) { toast.error(friendlyError(err)) } finally { setIssuing(false) }
  }

  if (saved) {
    return (
      <Modal open={open} onOpenChange={onOpenChange} title="Payment recorded"
        footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button><Button variant="gold" onClick={issue} loading={issuing}>Generate receipt PDF</Button></>}>
        <div className="flex items-start gap-3 text-sm"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
          <div><p className="font-medium text-navy-900">{formatINR(saved.amount)} received from {lease?.tenant_name}</p>
            <p className="mt-1 text-slate-600">The rent ledger and dashboard are updated. Generate a receipt now or later from the Receipts / Rent pages.</p></div></div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record rent payment" description="Only record money actually received." wide
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy}>Record payment</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tenant · property · unit (agreement)" required error={errors.lease} className="sm:col-span-2">
          <Select value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
            <option value="">Select…</option>
            {leases.map((l) => <option key={l.id} value={l.id}>{l.tenant_name} — {l.property_name} {l.unit_number} ({l.agreement_number}{l.display_status !== 'active' ? `, ${l.display_status}` : ''})</option>)}
          </Select>
        </Field>
        {lease && (
          <div className="rounded-md border border-line bg-paper p-3 text-sm sm:col-span-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Rent {formatINR(lease.monthly_rent)} / month · due on day {lease.rent_due_day}</span>
              <span className="font-medium">Outstanding to date: <span className={totalOutstanding > 0 ? 'text-red-700' : 'text-emerald-700'}>{formatINR(totalOutstanding)}</span></span>
            </div>
            {open_dues.length > 0 && (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                {open_dues.slice(0, 12).map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs"><span>{formatMonth(d.period_month)} · due {formatDate(d.due_date)}</span>
                    <span className="flex items-center gap-2">{formatINR(d.outstanding)} <ObligationBadge status={d.status} /></span></div>
                ))}
              </div>
            )}
          </div>
        )}
        <Field label="Payment date" required error={errors.date}><Input type="date" max={todayIST()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount received (₹)" required error={errors.amount}><Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Payment method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label={method === 'cheque' ? 'Cheque number' : 'Transaction reference'} required={method === 'upi' || method === 'cheque'} error={errors.reference}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'upi' ? 'UPI ref / UTR' : method === 'bank_transfer' ? 'NEFT/IMPS/RTGS UTR' : ''} />
        </Field>
        <Field label="Apply payment to" className="sm:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'oldest' | 'from')} className="sm:w-64">
              <option value="oldest">Oldest outstanding dues first</option><option value="from">Starting from a specific month</option>
            </Select>
            {mode === 'from' && <Input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="sm:w-48" />}
          </div>
          {errors.from && <span className="text-xs text-red-700">{errors.from}</span>}
        </Field>
        {Number(amount) > 0 && leaseId && (
          <div className="rounded-md border border-dashed border-gold-300 bg-gold-50/50 p-3 text-xs text-navy-900 sm:col-span-2">
            <div className="mb-1 font-semibold uppercase tracking-wide text-gold-700">Allocation preview</div>
            {preview.out.map((p, i) => <div key={i} className="flex justify-between"><span>{p.label}</span><span>{formatINR(p.amt)}</span></div>)}
            {preview.advance > 0 && <div className="flex justify-between text-gold-700"><span>Advance → next months of the agreement</span><span>{formatINR(preview.advance)}</span></div>}
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Checkbox checked={allowDup} onChange={setAllowDup} label={<span className="text-xs">This is a separate payment even if same amount &amp; date as an existing one</span>} /></div>
      </div>
    </Modal>
  )
}
