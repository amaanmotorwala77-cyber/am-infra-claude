import { useEffect, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useTenants, useUnits } from '@/lib/data'
import { DOC_CATEGORIES, uploadDocument, type DocLinks } from '@/lib/docs'
import type { Maintenance, Expense } from '@/lib/types'
import { METHOD_LABEL, todayIST } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { validate, req, optStr, optNum, money, dateStr, optDate, toForm, type Errors } from './common'

// ---------------- Maintenance ----------------
const mSchema = z.object({
  property_id: req('Property'), unit_id: optStr, title: req('Issue title'), description: optStr, reported_on: dateStr('Date reported'),
  assigned_to: optStr, estimated_cost: optNum, actual_cost: optNum, payment_status: z.enum(['unpaid', 'partially_paid', 'paid']),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']), priority: z.enum(['low', 'normal', 'high', 'urgent']),
  completed_on: optDate, notes: optStr,
}).refine((d) => d.status !== 'completed' || !!d.completed_on, { path: ['completed_on'], message: 'Completion date is required when completed' })
const M_KEYS = ['property_id', 'unit_id', 'title', 'description', 'reported_on', 'assigned_to', 'estimated_cost', 'actual_cost', 'payment_status', 'status', 'priority', 'completed_on', 'notes']

export function MaintenanceForm({ open, onOpenChange, item, defaultPropertyId }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Maintenance | null; defaultPropertyId?: string }) {
  const qc = useQueryClient()
  const { data: properties = [] } = useProperties()
  const { data: units = [] } = useUnits()
  const [v, setV] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<FileList | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) { setV({ ...toForm(item, M_KEYS), property_id: item?.property_id ?? defaultPropertyId ?? '', reported_on: item?.reported_on ?? todayIST(), payment_status: item?.payment_status ?? 'unpaid', status: item?.status ?? 'open', priority: item?.priority ?? 'normal' }); setErrors({}); setFiles(null) }
  }, [open, item, defaultPropertyId])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value, ...(k === 'status' && e.target.value === 'completed' && !s.completed_on ? { completed_on: todayIST() } : {}) }))

  async function save() {
    const { data, errors } = validate(mSchema, v); setErrors(errors); if (!data) return
    setBusy(true)
    try {
      const row = item
        ? await q<Maintenance>(supabase.from('maintenance_requests').update(data).eq('id', item.id).select().single())
        : await q<Maintenance>(supabase.from('maintenance_requests').insert(data).select().single())
      if (files) for (const f of Array.from(files)) {
        await uploadDocument(f, { category: f.type.startsWith('image/') ? 'property_photo' : 'maintenance_invoice', property_id: row.property_id, unit_id: row.unit_id, maintenance_request_id: row.id })
      }
      toast.success(item ? 'Request updated' : 'Maintenance request created')
      qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['documents'] }); qc.invalidateQueries({ queryKey: ['activity'] })
      onOpenChange(false)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={item ? 'Edit maintenance request' : 'New maintenance request'} wide
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" required error={errors.property_id}>
          <Select value={v.property_id} onChange={(e) => setV((s) => ({ ...s, property_id: e.target.value, unit_id: '' }))}>
            <option value="">Select…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Unit (optional)">
          <Select value={v.unit_id} onChange={set('unit_id')}>
            <option value="">Common area / whole building</option>{units.filter((u) => u.property_id === v.property_id).map((u) => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
          </Select>
        </Field>
        <Field label="Issue title" required error={errors.title} className="sm:col-span-2"><Input value={v.title ?? ''} onChange={set('title')} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>
        <Field label="Date reported" required error={errors.reported_on}><Input type="date" value={v.reported_on ?? ''} onChange={set('reported_on')} /></Field>
        <Field label="Assigned to (contractor / person)"><Input value={v.assigned_to ?? ''} onChange={set('assigned_to')} /></Field>
        <Field label="Status"><Select value={v.status} onChange={set('status')}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
        <Field label="Priority"><Select value={v.priority} onChange={set('priority')}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></Select></Field>
        <Field label="Estimated cost (₹)" error={errors.estimated_cost}><Input type="number" min={0} value={v.estimated_cost ?? ''} onChange={set('estimated_cost')} /></Field>
        <Field label="Actual cost (₹)" error={errors.actual_cost}><Input type="number" min={0} value={v.actual_cost ?? ''} onChange={set('actual_cost')} /></Field>
        <Field label="Payment status"><Select value={v.payment_status} onChange={set('payment_status')}><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option></Select></Field>
        <Field label="Completion date" error={errors.completed_on}><Input type="date" value={v.completed_on ?? ''} onChange={set('completed_on')} /></Field>
        <Field label="Photos / invoices" className="sm:col-span-2"><Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles(e.target.files)} className="py-1.5" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  )
}

// ---------------- Expense ----------------
export const EXPENSE_CATEGORIES: Record<string, string> = {
  maintenance: 'Maintenance', repairs: 'Repairs', property_tax: 'Property tax', society_charges: 'Society charges', utilities: 'Utilities',
  insurance: 'Insurance', staff: 'Staff / security', legal: 'Legal & professional', other: 'Other',
}
const eSchema = z.object({
  property_id: req('Property'), category: z.string(), description: req('Description'), amount: money('Amount', 1),
  expense_date: dateStr('Date'), paid_to: optStr, payment_method: z.string().optional().transform((v) => v || null), reference: optStr, maintenance_request_id: optStr,
})
export function ExpenseForm({ open, onOpenChange, item, defaultPropertyId, maintenance }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Expense | null; defaultPropertyId?: string; maintenance?: Maintenance | null }) {
  const qc = useQueryClient()
  const { data: properties = [] } = useProperties()
  const [v, setV] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setV({ ...toForm(item, ['property_id', 'category', 'description', 'amount', 'expense_date', 'paid_to', 'payment_method', 'reference', 'maintenance_request_id']),
      property_id: item?.property_id ?? maintenance?.property_id ?? defaultPropertyId ?? '', category: item?.category ?? 'maintenance',
      expense_date: item?.expense_date ?? todayIST(), description: item?.description ?? maintenance?.title ?? '',
      amount: item ? String(item.amount) : maintenance?.actual_cost ? String(maintenance.actual_cost) : '', paid_to: item?.paid_to ?? maintenance?.assigned_to ?? '',
      maintenance_request_id: item?.maintenance_request_id ?? maintenance?.id ?? '' })
    setErrors({})
  }, [open, item, defaultPropertyId, maintenance])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  async function save() {
    const { data, errors } = validate(eSchema, v); setErrors(errors); if (!data) return
    setBusy(true)
    try {
      if (item) await q(supabase.from('expenses').update(data).eq('id', item.id)); else await q(supabase.from('expenses').insert(data))
      toast.success(item ? 'Expense updated' : 'Expense recorded')
      qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['reports'] }); onOpenChange(false)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={item ? 'Edit expense' : 'Record expense'}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save expense</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" required error={errors.property_id} className="sm:col-span-2">
          <Select value={v.property_id} onChange={set('property_id')}><option value="">Select…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        <Field label="Category"><Select value={v.category} onChange={set('category')}>{Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Date" required error={errors.expense_date}><Input type="date" value={v.expense_date ?? ''} onChange={set('expense_date')} /></Field>
        <Field label="Description" required error={errors.description} className="sm:col-span-2"><Input value={v.description ?? ''} onChange={set('description')} /></Field>
        <Field label="Amount (₹)" required error={errors.amount}><Input type="number" min={0} value={v.amount ?? ''} onChange={set('amount')} /></Field>
        <Field label="Paid to"><Input value={v.paid_to ?? ''} onChange={set('paid_to')} /></Field>
        <Field label="Payment method"><Select value={v.payment_method ?? ''} onChange={set('payment_method')}><option value="">—</option>{Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Reference"><Input value={v.reference ?? ''} onChange={set('reference')} /></Field>
      </div>
    </Modal>
  )
}

// ---------------- Document upload ----------------
export function DocumentUploadForm({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: DocLinks & { category?: string } }) {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: properties = [] } = useProperties()
  const { data: tenants = [] } = useTenants()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('other')
  const [links, setLinks] = useState<DocLinks>({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setFile(null); setName(''); setNotes(''); setCategory(defaults?.category ?? 'other'); setLinks({ ...defaults }) } }, [open])
  async function save() {
    if (!file) return toast.error('Choose a file')
    if (!links.property_id && !isAdmin) return toast.error('Select the property this document belongs to')
    setBusy(true)
    try {
      await uploadDocument(file, { name, category, notes, ...links })
      toast.success('Document uploaded'); qc.invalidateQueries({ queryKey: ['documents'] }); onOpenChange(false)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Upload document" description="Stored privately. Opened only through short-lived signed links."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Upload</Button></>}>
      <div className="grid gap-4">
        <Field label="File" required hint="PDF, images, Office files — max 25 MB"><Input type="file" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !name) setName(f.name) }} className="py-1.5" /></Field>
        <Field label="Document name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(DOC_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Related property" required={!isAdmin}>
          <Select value={links.property_id ?? ''} onChange={(e) => setLinks((l) => ({ ...l, property_id: e.target.value || null }))}><option value="">{isAdmin ? 'None / general' : 'Select…'}</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        <Field label="Related tenant">
          <Select value={links.tenant_id ?? ''} onChange={(e) => setLinks((l) => ({ ...l, tenant_id: e.target.value || null }))}><option value="">None</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select>
        </Field>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
