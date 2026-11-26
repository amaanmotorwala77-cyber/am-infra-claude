import { useEffect, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, q, friendlyError } from '@/lib/supabase'
import type { Property, Unit, Tenant } from '@/lib/types'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { validate, req, optStr, optNum, money, optDate, toForm, type Errors } from './common'

// ---------------- Property ----------------
const propertySchema = z.object({
  name: req('Property name'), address: req('Address'), city: optStr,
  property_type: z.enum(['residential', 'commercial', 'mixed_use']),
  total_floors: optNum, description: optStr, ownership_details: optStr, acquisition_date: optDate, notes: optStr,
})
const PROP_KEYS = ['name', 'address', 'city', 'property_type', 'total_floors', 'description', 'ownership_details', 'acquisition_date', 'notes']

export function PropertyForm({ open, onOpenChange, property, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; property?: Property | null; onSaved?: (id: string) => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setV({ ...toForm(property, PROP_KEYS), property_type: property?.property_type ?? 'residential', city: property?.city ?? 'Mumbai' }); setErrors({}) } }, [open, property])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))

  async function save() {
    const { data, errors } = validate(propertySchema, v); setErrors(errors); if (!data) return
    setBusy(true)
    try {
      const row = property
        ? await q<Property>(supabase.from('properties').update(data).eq('id', property.id).select().single())
        : await q<Property>(supabase.from('properties').insert(data).select().single())
      toast.success(property ? 'Property updated' : 'Property added')
      qc.invalidateQueries({ queryKey: ['properties'] }); qc.invalidateQueries({ queryKey: ['property'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false); onSaved?.(row.id)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={property ? 'Edit property' : 'Add property'} wide
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save property</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property name" required error={errors.name} className="sm:col-span-2"><Input value={v.name ?? ''} onChange={set('name')} placeholder="e.g. Simla House" /></Field>
        <Field label="Address" required error={errors.address} className="sm:col-span-2"><Textarea rows={2} value={v.address ?? ''} onChange={set('address')} /></Field>
        <Field label="City"><Input value={v.city ?? ''} onChange={set('city')} /></Field>
        <Field label="Property type" required>
          <Select value={v.property_type} onChange={set('property_type')}>
            <option value="residential">Residential</option><option value="commercial">Commercial</option><option value="mixed_use">Mixed-use</option>
          </Select>
        </Field>
        <Field label="Total floors" error={errors.total_floors}><Input type="number" min={0} value={v.total_floors ?? ''} onChange={set('total_floors')} /></Field>
        <Field label="Acquisition date"><Input type="date" value={v.acquisition_date ?? ''} onChange={set('acquisition_date')} /></Field>
        <Field label="Ownership details" className="sm:col-span-2"><Textarea rows={2} value={v.ownership_details ?? ''} onChange={set('ownership_details')} placeholder="Owner / entity, share, title notes" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  )
}

// ---------------- Unit ----------------
const unitSchema = z.object({
  property_id: req('Property'), unit_number: req('Unit number'), floor_number: optNum, carpet_area_sqft: optNum, unit_type: optStr,
  availability: z.enum(['available', 'under_maintenance', 'not_for_rent']), monthly_rent: money('Monthly rent'), security_deposit: money('Security deposit'), notes: optStr,
})
const UNIT_KEYS = ['property_id', 'unit_number', 'floor_number', 'carpet_area_sqft', 'unit_type', 'availability', 'monthly_rent', 'security_deposit', 'notes']

export function UnitForm({ open, onOpenChange, unit, propertyId, properties }: {
  open: boolean; onOpenChange: (o: boolean) => void; unit?: Unit | null; propertyId?: string; properties: Property[]
}) {
  const qc = useQueryClient()
  const [v, setV] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  useEffect(() => {
    if (open) { setV({ ...toForm(unit, UNIT_KEYS), property_id: unit?.property_id ?? propertyId ?? '', availability: unit?.availability ?? 'available', unit_type: unit?.unit_type ?? '1 BHK', monthly_rent: unit ? String(unit.monthly_rent) : '', security_deposit: unit ? String(unit.security_deposit) : '0' }); setErrors({}) }
  }, [open, unit, propertyId])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))

  async function save() {
    const { data, errors } = validate(unitSchema, v); setErrors(errors); if (!data) return
    setBusy(true)
    try {
      if (unit) await q(supabase.from('units').update(data).eq('id', unit.id))
      else await q(supabase.from('units').insert(data))
      toast.success(unit ? 'Unit updated' : `Unit ${data.unit_number} added`)
      qc.invalidateQueries({ queryKey: ['v_units'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
      if (addAnother && !unit) setV((s) => ({ ...s, unit_number: '', notes: '' })); else onOpenChange(false)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={unit ? `Edit unit ${unit.unit_number}` : 'Add unit'}
      footer={<>
        {!unit && <label className="mr-auto flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} className="accent-gold-600" />Add another after saving</label>}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save unit</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" required error={errors.property_id} className="sm:col-span-2">
          <Select value={v.property_id} onChange={set('property_id')} disabled={!!unit}>
            <option value="">Select property…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Unit number" required error={errors.unit_number}><Input value={v.unit_number ?? ''} onChange={set('unit_number')} placeholder="e.g. 301" /></Field>
        <Field label="Floor" error={errors.floor_number}><Input type="number" value={v.floor_number ?? ''} onChange={set('floor_number')} /></Field>
        <Field label="Carpet area (sq ft)" error={errors.carpet_area_sqft}><Input type="number" min={0} value={v.carpet_area_sqft ?? ''} onChange={set('carpet_area_sqft')} /></Field>
        <Field label="Unit type"><Input list="unit-types" value={v.unit_type ?? ''} onChange={set('unit_type')} />
          <datalist id="unit-types">{['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', 'Shop', 'Office', 'Godown', 'Parking'].map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Standard monthly rent (₹)" required error={errors.monthly_rent}><Input type="number" min={0} value={v.monthly_rent ?? ''} onChange={set('monthly_rent')} /></Field>
        <Field label="Standard security deposit (₹)" error={errors.security_deposit}><Input type="number" min={0} value={v.security_deposit ?? ''} onChange={set('security_deposit')} /></Field>
        <Field label="Availability" hint="Occupancy is set automatically from active agreements" className="sm:col-span-2">
          <Select value={v.availability} onChange={set('availability')}>
            <option value="available">Available to let</option><option value="under_maintenance">Under maintenance</option><option value="not_for_rent">Not for rent (self-use etc.)</option>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  )
}

// ---------------- Tenant ----------------
const tenantSchema = z.object({
  full_name: req('Full name'),
  phone: optStr.refine((v) => !v || /^[0-9+ -]{7,20}$/.test(v), 'Enter a valid phone number'),
  email: optStr.refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email'),
  emergency_contact_name: optStr, emergency_contact_phone: optStr, id_proof_note: optStr, notes: optStr,
})
const TENANT_KEYS = ['full_name', 'phone', 'email', 'emergency_contact_name', 'emergency_contact_phone', 'id_proof_note', 'notes']

export function TenantForm({ open, onOpenChange, tenant, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; tenant?: Tenant | null; onSaved?: (t: Tenant) => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setV(toForm(tenant, TENANT_KEYS)); setErrors({}) } }, [open, tenant])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }))

  async function save() {
    const { data, errors } = validate(tenantSchema, v); setErrors(errors); if (!data) return
    setBusy(true)
    try {
      const row = tenant
        ? await q<Tenant>(supabase.from('tenants').update(data).eq('id', tenant.id).select().single())
        : await q<Tenant>(supabase.from('tenants').insert(data).select().single())
      toast.success(tenant ? 'Tenant updated' : 'Tenant added')
      qc.invalidateQueries({ queryKey: ['v_tenants'] }); qc.invalidateQueries({ queryKey: ['tenant'] })
      onOpenChange(false); onSaved?.(row)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={tenant ? 'Edit tenant' : 'Add tenant'} description="Lease, rent and deposit are set on the rental agreement."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save tenant</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name / firm name" required error={errors.full_name} className="sm:col-span-2"><Input value={v.full_name ?? ''} onChange={set('full_name')} /></Field>
        <Field label="Phone" error={errors.phone}><Input value={v.phone ?? ''} onChange={set('phone')} placeholder="+91 98xxx xxxxx" /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={v.email ?? ''} onChange={set('email')} /></Field>
        <Field label="Emergency contact name"><Input value={v.emergency_contact_name ?? ''} onChange={set('emergency_contact_name')} /></Field>
        <Field label="Emergency contact phone"><Input value={v.emergency_contact_phone ?? ''} onChange={set('emergency_contact_phone')} /></Field>
        <Field label="ID / KYC note" hint="Don't type full ID numbers here — upload the document instead" className="sm:col-span-2"><Input value={v.id_proof_note ?? ''} onChange={set('id_proof_note')} placeholder="e.g. Aadhaar & PAN collected" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  )
}
