import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, FileSignature, Upload, FileText } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useInvalidateFinance } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { formatDate, formatINR, todayIST } from '@/lib/format'
import type { VLease } from '@/lib/types'
import { Button, Card, EmptyState, ErrorBlock, Field, FilterBar, Input, LoadingBlock, Modal, PageHeader, SampleBadge, SearchInput, Select, StatCard, Table, Td, Textarea, Th, THead, Tr } from '@/components/ui'
import { ExpiryBadge, LeaseBadge } from '@/components/status'
import { LeaseForm, RenewLeaseForm } from '@/components/forms/LeaseForms'
import { DocumentUploadForm } from '@/components/forms/OpsForms'
import { DocumentsTable, useDocuments } from '@/components/tables'

function TerminateDialog({ lease, onClose }: { lease: VLease | null; onClose: () => void }) {
  const invalidate = useInvalidateFinance()
  const [date, setDate] = useState(todayIST())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    if (!lease) return
    if (!reason.trim()) return toast.error('Enter a reason')
    setBusy(true)
    try { await q(supabase.rpc('terminate_lease', { p_lease_id: lease.id, p_on: date, p_reason: reason })); toast.success('Agreement terminated. Unpaid rent after the end date was removed; paid history kept.'); invalidate(); onClose() }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!lease} onOpenChange={(o) => !o && onClose()} title={`Terminate ${lease?.agreement_number ?? ''}`} description={`${lease?.tenant_name} · ${lease?.property_name} ${lease?.unit_number}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={go}>Terminate agreement</Button></>}>
      <div className="space-y-4">
        <Field label="Last day of tenancy" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Rent for the final month is kept as scheduled; use “Adjust” in Rent &amp; Payments if it should be reduced. Security deposit refunds should be recorded as an expense.</p>
      </div>
    </Modal>
  )
}

function LeaseDocs({ lease, onClose }: { lease: VLease | null; onClose: () => void }) {
  const docs = useDocuments({ lease_id: lease?.id ?? '__none__' })
  return <Modal open={!!lease} onOpenChange={(o) => !o && onClose()} title={`Documents · ${lease?.agreement_number ?? ''}`} wide><DocumentsTable rows={docs.data} isLoading={docs.isLoading} error={docs.error} /></Modal>
}

export default function Agreements() {
  const { isAdmin } = useAuth()
  const { data: properties = [] } = useProperties()
  const leases = useQuery({ queryKey: ['v_leases', 'all'], queryFn: () => q<VLease[]>(supabase.from('v_leases').select('*').order('end_date')) })
  const [search, setSearch] = useState('')
  const [prop, setProp] = useState('')
  const [status, setStatus] = useState('current')
  const [alert, setAlert] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [edit, setEdit] = useState<VLease | null>(null)
  const [renew, setRenew] = useState<VLease | null>(null)
  const [term, setTerm] = useState<VLease | null>(null)
  const [upload, setUpload] = useState<VLease | null>(null)
  const [docs, setDocs] = useState<VLease | null>(null)

  const all = leases.data ?? []
  const count = (a: string) => all.filter((l) => l.expiry_alert === a && !l.has_renewal).length
  const rows = all.filter((l) => {
    if (prop && l.property_id !== prop) return false
    if (status === 'current' && !['active', 'expired'].includes(l.display_status)) return false
    if (status && status !== 'current' && l.display_status !== status) return false
    if (alert && l.expiry_alert !== alert) return false
    if (search && !`${l.agreement_number} ${l.tenant_name} ${l.unit_number} ${l.property_name}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      <PageHeader title="Rental agreements" description="Terms, renewals and expiry tracking" actions={isAdmin && <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" />New agreement</Button>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <button onClick={() => { setAlert(alert === 'expired' ? '' : 'expired'); setStatus('') }} className="text-left"><StatCard label="Expired, not renewed" value={count('expired')} tone="red" /></button>
        <button onClick={() => { setAlert(alert === 'within_30' ? '' : 'within_30'); setStatus('') }} className="text-left"><StatCard label="Expiring ≤ 30 days" value={count('within_30')} tone="red" /></button>
        <button onClick={() => { setAlert(alert === 'within_60' ? '' : 'within_60'); setStatus('') }} className="text-left"><StatCard label="Expiring 31–60 days" value={count('within_60')} tone="gold" /></button>
      </div>
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Agreement no., tenant, unit" className="sm:w-64" />
          <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-52"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44"><option value="current">Current (active/expired)</option><option value="">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="renewed">Renewed</option><option value="terminated">Terminated</option></Select>
          <Select value={alert} onChange={(e) => setAlert(e.target.value)} className="sm:w-44"><option value="">Any expiry</option><option value="expired">Expired</option><option value="within_30">Within 30 days</option><option value="within_60">Within 60 days</option></Select>
        </FilterBar>
        {leases.isLoading ? <LoadingBlock /> : leases.error ? <ErrorBlock error={leases.error} /> : rows.length === 0 ? <EmptyState icon={<FileSignature className="h-6 w-6" />} title="No agreements match" /> : (
          <Table>
            <THead><tr><Th>Agreement</Th><Th>Tenant</Th><Th>Property · Unit</Th><Th>Term</Th><Th className="text-right">Rent</Th><Th className="text-right">Deposit</Th><Th>Due</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>{rows.map((l) => (
              <Tr key={l.id}>
                <Td className="font-medium">{l.agreement_number}{l.is_sample && <> <SampleBadge /></>}{l.previous_lease_id && <div className="text-[11px] text-slate-500">Renewal</div>}</Td>
                <Td><Link to={`/tenants/${l.tenant_id}`} className="hover:underline">{l.tenant_name}</Link></Td>
                <Td className="text-xs">{l.property_name} · <b>{l.unit_number}</b></Td>
                <Td className="text-xs">{formatDate(l.start_date)} – {formatDate(l.end_date)}</Td>
                <Td className="text-right tabular-nums">{formatINR(l.monthly_rent)}{Number(l.escalation_percent) > 0 && <div className="text-[11px] text-slate-500">+{l.escalation_percent}%/{l.escalation_interval_months}mo</div>}</Td>
                <Td className="text-right tabular-nums">{formatINR(l.security_deposit)}</Td>
                <Td>Day {l.rent_due_day}</Td>
                <Td><div className="flex flex-wrap gap-1"><LeaseBadge status={l.display_status} />{!l.has_renewal && <ExpiryBadge alert={l.expiry_alert} days={l.days_to_expiry} />}</div></Td>
                <Td className="text-right"><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="Documents" onClick={() => setDocs(l)}><FileText className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Upload signed PDF" onClick={() => setUpload(l)}><Upload className="h-4 w-4" /></Button>
                  {isAdmin && ['active', 'expired'].includes(l.status) && <>
                    <Button size="sm" variant="outline" onClick={() => setRenew(l)}>Renew</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(l)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setTerm(l)}>End</Button>
                  </>}
                </div></Td>
              </Tr>))}</tbody>
          </Table>
        )}
      </Card>
      <LeaseForm open={newOpen} onOpenChange={setNewOpen} />
      <LeaseForm open={!!edit} onOpenChange={(o) => !o && setEdit(null)} lease={edit} />
      <RenewLeaseForm open={!!renew} onOpenChange={(o) => !o && setRenew(null)} lease={renew} />
      <TerminateDialog lease={term} onClose={() => setTerm(null)} />
      <LeaseDocs lease={docs} onClose={() => setDocs(null)} />
      <DocumentUploadForm open={!!upload} onOpenChange={(o) => !o && setUpload(null)} defaults={upload ? { lease_id: upload.id, tenant_id: upload.tenant_id, property_id: upload.property_id, unit_id: upload.unit_id, category: 'rental_agreement' } : undefined} />
    </>
  )
}
