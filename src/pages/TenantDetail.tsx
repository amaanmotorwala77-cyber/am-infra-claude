import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Plus, Upload, Phone, Mail, ShieldAlert } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { formatDate, formatINR, todayIST } from '@/lib/format'
import { downloadReceipt } from '@/lib/receiptPdf'
import type { Maintenance, Receipt, VLease, VObligation, VPayment, VTenant } from '@/lib/types'
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SampleBadge, StatCard, Table, Tabs, Td, Th, THead, Tr } from '@/components/ui'
import { ExpiryBadge, LeaseBadge, MaintenanceBadge } from '@/components/status'
import { TenantForm } from '@/components/forms/PropertyForms'
import { LeaseForm } from '@/components/forms/LeaseForms'
import { PaymentForm } from '@/components/forms/PaymentForm'
import { DocumentUploadForm } from '@/components/forms/OpsForms'
import { DocumentsTable, ObligationsTable, PaymentsTable, useDocuments } from '@/components/tables'

type Tab = 'agreements' | 'ledger' | 'payments' | 'receipts' | 'documents' | 'maintenance'

export default function TenantDetail() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('ledger')
  const [editOpen, setEditOpen] = useState(false)
  const [leaseOpen, setLeaseOpen] = useState(false)
  const [payOpen, setPayOpen] = useState<{ lease?: string; period?: string } | null>(null)
  const [docOpen, setDocOpen] = useState(false)
  const [archOpen, setArchOpen] = useState(false)

  const t = useQuery({ queryKey: ['tenant', id], queryFn: () => q<VTenant>(supabase.from('v_tenants').select('*').eq('id', id).single()) })
  const leases = useQuery({ queryKey: ['v_leases', 'tenant', id], queryFn: () => q<VLease[]>(supabase.from('v_leases').select('*').eq('tenant_id', id).order('start_date', { ascending: false })) })
  const obls = useQuery({ queryKey: ['v_obligations', 'tenant', id], queryFn: () => q<VObligation[]>(supabase.from('v_obligations').select('*').eq('tenant_id', id).order('period_month', { ascending: false })) })
  const pays = useQuery({ queryKey: ['v_payments', 'tenant', id], queryFn: () => q<VPayment[]>(supabase.from('v_payments').select('*').eq('tenant_id', id).order('payment_date', { ascending: false })) })
  const rcpts = useQuery({ queryKey: ['receipts', 'tenant', id], queryFn: () => q<Receipt[]>(supabase.from('receipts').select('*').eq('tenant_id', id).order('created_at', { ascending: false })) })
  const maint = useQuery({ queryKey: ['maintenance', 'tenant', id], queryFn: async () => {
    const unitIds = (leases.data ?? []).map((l) => l.unit_id); if (!unitIds.length) return []
    return q<Maintenance[]>(supabase.from('maintenance_requests').select('*, properties(name), units(unit_number)').in('unit_id', unitIds).order('reported_on', { ascending: false }))
  }, enabled: !!leases.data })
  const docs = useDocuments({ tenant_id: id })

  if (t.isLoading) return <LoadingBlock />
  if (t.error || !t.data) return <ErrorBlock error={t.error ?? 'Tenant not found'} />
  const tn = t.data
  const today = todayIST()
  const all = obls.data ?? []
  const outstanding = all.filter((o) => o.due_date <= today).reduce((a, o) => a + Number(o.outstanding), 0)
  const totalPaid = (pays.data ?? []).filter((p) => !p.voided_at).reduce((a, p) => a + Number(p.amount), 0)
  const activeLease = (leases.data ?? []).find((l) => l.status === 'active')

  async function toggleArchive() {
    if (!tn.archived_at && activeLease) { toast.error('Terminate or let the active agreement end before archiving this tenant'); setArchOpen(false); return }
    try { await q(supabase.from('tenants').update({ archived_at: tn.archived_at ? null : new Date().toISOString() }).eq('id', tn.id)); toast.success(tn.archived_at ? 'Tenant restored' : 'Tenant archived — history retained'); qc.invalidateQueries({ queryKey: ['tenant'] }); qc.invalidateQueries({ queryKey: ['v_tenants'] }) }
    catch (e) { toast.error(friendlyError(e)) } finally { setArchOpen(false) }
  }

  return (
    <>
      <Link to="/tenants" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900"><ArrowLeft className="h-4 w-4" />Tenants</Link>
      <PageHeader title={tn.full_name} description={tn.property_name ? `${tn.property_name} · Unit ${tn.unit_number}` : 'No current agreement'}
        actions={<>
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />Edit</Button>
          <Button variant="outline" onClick={() => setArchOpen(true)}>{tn.archived_at ? <><ArchiveRestore className="h-4 w-4" />Restore</> : <><Archive className="h-4 w-4" />Archive</>}</Button>
          {isAdmin && <Button variant="outline" onClick={() => setLeaseOpen(true)}><Plus className="h-4 w-4" />New agreement</Button>}
          {(leases.data ?? []).length > 0 && <Button variant="gold" onClick={() => setPayOpen({ lease: activeLease?.id })}><Plus className="h-4 w-4" />Record payment</Button>}
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        {tn.is_sample && <SampleBadge />}{tn.archived_at && <Badge>Archived</Badge>}
        {tn.phone && <a href={`tel:${tn.phone}`} className="inline-flex items-center gap-1 hover:text-navy-900"><Phone className="h-3.5 w-3.5" />{tn.phone}</a>}
        {tn.email && <a href={`mailto:${tn.email}`} className="inline-flex items-center gap-1 hover:text-navy-900"><Mail className="h-3.5 w-3.5" />{tn.email}</a>}
        {tn.emergency_contact_name && <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" />Emergency: {tn.emergency_contact_name} {tn.emergency_contact_phone}</span>}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding to date" value={formatINR(outstanding)} tone={outstanding > 0 ? 'red' : 'green'} />
        <StatCard label="Monthly rent" value={activeLease ? formatINR(activeLease.monthly_rent) : '—'} sub={activeLease ? `Due day ${activeLease.rent_due_day}` : undefined} />
        <StatCard label="Security deposit" value={activeLease ? formatINR(activeLease.security_deposit) : '—'} />
        <StatCard label="Total paid (all time)" value={formatINR(totalPaid)} sub={`${(pays.data ?? []).filter((p) => !p.voided_at).length} payments`} />
      </div>
      {tn.notes && <Card className="mb-5 p-4 text-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Notes</div><p className="mt-1 whitespace-pre-line">{tn.notes}</p>{tn.id_proof_note && <p className="mt-2 text-xs text-slate-500">KYC: {tn.id_proof_note}</p>}</Card>}

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'ledger', label: 'Rent ledger' }, { value: 'payments', label: 'Payment history' }, { value: 'receipts', label: 'Receipts' }, { value: 'agreements', label: `Agreements (${leases.data?.length ?? 0})` }, { value: 'documents', label: 'Documents' }, { value: 'maintenance', label: 'Maintenance' }]} />
      <Card>
        {tab === 'ledger' && (obls.isLoading ? <LoadingBlock /> : <ObligationsTable rows={all} showTenant={false} onPay={(o) => setPayOpen({ lease: o.lease_id, period: o.period_month })} />)}
        {tab === 'payments' && (pays.isLoading ? <LoadingBlock /> : <PaymentsTable rows={pays.data ?? []} showTenant={false} />)}
        {tab === 'receipts' && ((rcpts.data ?? []).length === 0 ? <EmptyState title="No receipts issued" /> : (
          <Table><THead><tr><Th>Receipt no.</Th><Th>Issued</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>{rcpts.data!.map((r) => <Tr key={r.id}><Td className="font-medium">{r.receipt_number}</Td><Td>{formatDate(r.issued_on)}</Td><Td className="text-right tabular-nums">{formatINR(r.amount)}</Td><Td>{r.cancelled_at ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Valid</Badge>}</Td><Td className="text-right"><Button size="sm" variant="outline" onClick={() => downloadReceipt(r)}>Download</Button></Td></Tr>)}</tbody></Table>
        ))}
        {tab === 'agreements' && ((leases.data ?? []).length === 0 ? <EmptyState title="No agreements yet" action={isAdmin && <Button onClick={() => setLeaseOpen(true)}>Create agreement</Button>} /> : (
          <Table><THead><tr><Th>Agreement</Th><Th>Property · Unit</Th><Th>Term</Th><Th className="text-right">Rent</Th><Th className="text-right">Deposit</Th><Th>Escalation</Th><Th>Status</Th></tr></THead>
            <tbody>{leases.data!.map((l) => <Tr key={l.id}><Td className="font-medium">{l.agreement_number}{l.previous_lease_id && <div className="text-[11px] text-slate-500">Renewal</div>}</Td><Td className="text-xs">{l.property_name} · <b>{l.unit_number}</b></Td><Td className="text-xs">{formatDate(l.start_date)} – {formatDate(l.end_date)}</Td><Td className="text-right tabular-nums">{formatINR(l.monthly_rent)}</Td><Td className="text-right tabular-nums">{formatINR(l.security_deposit)}</Td><Td className="text-xs">{Number(l.escalation_percent) ? `${l.escalation_percent}% / ${l.escalation_interval_months} mo` : '—'}</Td><Td><div className="flex flex-wrap gap-1"><LeaseBadge status={l.display_status} /><ExpiryBadge alert={l.expiry_alert} days={l.days_to_expiry} /></div></Td></Tr>)}</tbody></Table>
        ))}
        {tab === 'documents' && (<><CardHeader title="Tenant documents" action={<Button size="sm" onClick={() => setDocOpen(true)}><Upload className="h-4 w-4" />Upload</Button>} /><DocumentsTable rows={docs.data} isLoading={docs.isLoading} error={docs.error} /></>)}
        {tab === 'maintenance' && ((maint.data ?? []).length === 0 ? <EmptyState title="No maintenance requests for this tenant's units" /> : (
          <Table><THead><tr><Th>Issue</Th><Th>Unit</Th><Th>Reported</Th><Th>Status</Th></tr></THead>
            <tbody>{maint.data!.map((m) => <Tr key={m.id}><Td className="font-medium">{m.title}</Td><Td>{m.properties?.name} · {m.units?.unit_number}</Td><Td>{formatDate(m.reported_on)}</Td><Td><MaintenanceBadge status={m.status} /></Td></Tr>)}</tbody></Table>
        ))}
      </Card>

      <TenantForm open={editOpen} onOpenChange={setEditOpen} tenant={tn} />
      <LeaseForm open={leaseOpen} onOpenChange={setLeaseOpen} defaultTenantId={tn.id} />
      <PaymentForm open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)} defaultLeaseId={payOpen?.lease} defaultPeriod={payOpen?.period} />
      <DocumentUploadForm open={docOpen} onOpenChange={setDocOpen} defaults={{ tenant_id: tn.id, property_id: tn.property_id, category: 'tenant_document' }} />
      <ConfirmDialog open={archOpen} onOpenChange={setArchOpen} title={tn.archived_at ? 'Restore tenant?' : 'Archive tenant?'} message={tn.archived_at ? 'The tenant will appear in active lists again.' : 'Archived tenants are hidden from lists. All agreements, payments and receipts are kept.'} confirmLabel={tn.archived_at ? 'Restore' : 'Archive'} onConfirm={toggleArchive} />
    </>
  )
}
