import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Eye, FileText, ReceiptText, Archive } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { openSignedUrl, useInvalidateFinance } from '@/lib/data'
import { DOC_CATEGORIES } from '@/lib/docs'
import { useAuth } from '@/lib/auth'
import { formatDate, formatINR, formatMonth, formatPeriod, METHOD_LABEL } from '@/lib/format'
import { downloadReceipt } from '@/lib/receiptPdf'
import type { DocumentRow, Receipt, VObligation, VPayment } from '@/lib/types'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, Table, Td, Th, THead, Tr } from './ui'
import { ObligationBadge } from './status'

export function useDocuments(filter: Partial<Record<'property_id' | 'tenant_id' | 'lease_id' | 'unit_id' | 'maintenance_request_id', string>>, opts?: { category?: string; includeArchived?: boolean }) {
  return useQuery({
    queryKey: ['documents', filter, opts],
    queryFn: () => {
      let b = supabase.from('documents').select('*, properties(name), tenants(full_name), leases(agreement_number)').order('created_at', { ascending: false })
      for (const [k, v] of Object.entries(filter)) if (v) b = b.eq(k, v)
      if (opts?.category) b = b.eq('category', opts.category)
      if (!opts?.includeArchived) b = b.is('archived_at', null)
      return q<DocumentRow[]>(b)
    },
  })
}

export function DocumentsTable({ rows, isLoading, error }: { rows?: DocumentRow[]; isLoading?: boolean; error?: unknown }) {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [archiving, setArchiving] = useState<DocumentRow | null>(null)
  async function open(d: DocumentRow, download?: boolean) { try { await openSignedUrl(d.storage_path, download ? d.name : undefined) } catch (e) { toast.error(friendlyError(e)) } }
  async function archive() {
    if (!archiving) return
    try { await q(supabase.from('documents').update({ archived_at: new Date().toISOString() }).eq('id', archiving.id)); toast.success('Document archived'); qc.invalidateQueries({ queryKey: ['documents'] }) }
    catch (e) { toast.error(friendlyError(e)) } finally { setArchiving(null) }
  }
  if (isLoading) return <LoadingBlock />
  if (error) return <ErrorBlock error={error} />
  if (!rows?.length) return <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents" description="Uploaded files are stored privately." />
  return (
    <>
      <Table>
        <THead><tr><Th>Name</Th><Th>Category</Th><Th>Property</Th><Th>Tenant / agreement</Th><Th>Uploaded</Th><Th className="text-right">Actions</Th></tr></THead>
        <tbody>{rows.map((d) => (
          <Tr key={d.id}>
            <Td><div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-slate-400" /><span className="max-w-[240px] truncate">{d.name}</span>{d.archived_at && <Badge>Archived</Badge>}</div>{d.size_bytes ? <div className="pl-6 text-xs text-slate-500">{(d.size_bytes / 1024 / 1024).toFixed(2)} MB</div> : null}</Td>
            <Td><Badge tone="neutral">{DOC_CATEGORIES[d.category] ?? d.category}</Badge></Td>
            <Td className="text-xs">{d.properties?.name ?? '—'}</Td>
            <Td className="text-xs">{d.tenants?.full_name ?? '—'}{d.leases ? <div className="text-slate-500">{d.leases.agreement_number}</div> : null}</Td>
            <Td className="text-xs">{formatDate(d.created_at)}</Td>
            <Td className="text-right"><div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" onClick={() => open(d)} aria-label="Preview"><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => open(d, true)} aria-label="Download"><Download className="h-4 w-4" /></Button>
              {isAdmin && !d.archived_at && <Button size="icon" variant="ghost" onClick={() => setArchiving(d)} aria-label="Archive"><Archive className="h-4 w-4" /></Button>}
            </div></Td>
          </Tr>))}</tbody>
      </Table>
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title="Archive document?" message={`"${archiving?.name}" will be hidden from lists but kept in storage.`} confirmLabel="Archive" onConfirm={archive} />
    </>
  )
}

export function ObligationsTable({ rows, onPay, showTenant = true, onAdjust }: { rows: VObligation[]; onPay?: (o: VObligation) => void; showTenant?: boolean; onAdjust?: (o: VObligation) => void }) {
  if (!rows.length) return <EmptyState title="No rent entries" description="Rent rows appear automatically for every month of an active agreement." />
  return (
    <Table>
      <THead><tr>{showTenant && <Th>Tenant</Th>}<Th>Property · Unit</Th><Th>Month</Th><Th>Due date</Th><Th className="text-right">Expected</Th><Th className="text-right">Paid</Th><Th className="text-right">Outstanding</Th><Th>Status</Th><Th /></tr></THead>
      <tbody>{rows.map((o) => (
        <Tr key={o.id}>
          {showTenant && <Td className="font-medium">{o.tenant_name}</Td>}
          <Td className="text-xs">{o.property_name} · <b>{o.unit_number}</b></Td>
          <Td>{formatMonth(o.period_month)}{(o.period_start !== o.period_month || o.period_end.slice(8) < '28') && <div className="text-[11px] text-slate-500">{formatDate(o.period_start)}–{formatDate(o.period_end)}</div>}</Td>
          <Td className="text-xs">{formatDate(o.due_date)}</Td>
          <Td className="text-right tabular-nums">{formatINR(o.amount_due)}{Number(o.adjustment) !== 0 && <div className="text-[11px] text-gold-700" title={o.adjustment_reason ?? ''}>adj. {formatINR(o.adjustment)}</div>}</Td>
          <Td className="text-right tabular-nums">{formatINR(o.amount_paid)}</Td>
          <Td className="text-right font-medium tabular-nums">{formatINR(o.outstanding)}</Td>
          <Td><ObligationBadge status={o.status} /></Td>
          <Td className="text-right"><div className="flex justify-end gap-1">
            {onPay && o.outstanding > 0 && <Button size="sm" variant="outline" onClick={() => onPay(o)}>Record</Button>}
            {onAdjust && <Button size="sm" variant="ghost" onClick={() => onAdjust(o)}>Adjust</Button>}
          </div></Td>
        </Tr>))}</tbody>
    </Table>
  )
}

export function PaymentsTable({ rows, showTenant = true }: { rows: VPayment[]; showTenant?: boolean }) {
  const { isAdmin } = useAuth()
  const invalidate = useInvalidateFinance()
  const [voiding, setVoiding] = useState<VPayment | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  async function receipt(p: VPayment) {
    setBusy(p.id)
    try {
      let r: Receipt
      if (p.receipted_amount >= p.amount && p.first_receipt_id) r = await q<Receipt>(supabase.from('receipts').select('*').eq('id', p.first_receipt_id).single())
      else { r = await q<Receipt>(supabase.rpc('issue_receipt', { p_payment_id: p.id }).single()); toast.success(`Receipt ${r.receipt_number} generated`); invalidate() }
      downloadReceipt(r)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }
  async function doVoid(reason: string) {
    if (!voiding) return
    try { await q(supabase.rpc('void_payment', { p_payment_id: voiding.id, p_reason: reason })); toast.success('Payment voided. Its receipts were cancelled.'); invalidate() }
    catch (e) { toast.error(friendlyError(e)) } finally { setVoiding(null) }
  }
  if (!rows.length) return <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No payments recorded" />
  return (
    <>
      <Table>
        <THead><tr><Th>Date</Th>{showTenant && <Th>Tenant</Th>}<Th>Property · Unit</Th><Th>Period covered</Th><Th>Method / Ref</Th><Th className="text-right">Amount</Th><Th>Receipt</Th><Th /></tr></THead>
        <tbody>{rows.map((p) => (
          <Tr key={p.id} className={p.voided_at ? 'opacity-60' : ''}>
            <Td className="text-xs">{formatDate(p.payment_date)}</Td>
            {showTenant && <Td className="font-medium">{p.tenant_name}</Td>}
            <Td className="text-xs">{p.property_name} · <b>{p.unit_number}</b></Td>
            <Td className="text-xs">{formatPeriod(p.period_from, p.period_to)}{p.unallocated_amount > 0 && <div className="text-gold-700">{formatINR(p.unallocated_amount)} credit</div>}</Td>
            <Td className="text-xs">{METHOD_LABEL[p.method]}{p.reference && <div className="text-slate-500">{p.reference}</div>}</Td>
            <Td className="text-right font-medium tabular-nums">{formatINR(p.amount)}</Td>
            <Td>{p.voided_at ? <Badge tone="red" >Void</Badge> : p.receipted_amount >= p.amount ? <Badge tone="green">Issued</Badge> : p.receipted_amount > 0 ? <Badge tone="amber">Part</Badge> : <Badge>Not issued</Badge>}</Td>
            <Td className="text-right"><div className="flex justify-end gap-1">
              {!p.voided_at && <Button size="sm" variant="outline" loading={busy === p.id} onClick={() => receipt(p)}>{p.receipted_amount >= p.amount ? 'Download' : 'Receipt'}</Button>}
              {isAdmin && !p.voided_at && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setVoiding(p)}>Void</Button>}
            </div>{p.voided_at && <div className="text-[11px] text-slate-500" title={p.void_reason ?? ''}>{p.void_reason}</div>}</Td>
          </Tr>))}</tbody>
      </Table>
      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} danger requireReason confirmLabel="Void payment" onConfirm={doVoid} title="Void this payment?"
        message={<>The payment of <b>{formatINR(voiding?.amount)}</b> from {voiding?.tenant_name} will be marked void (not deleted), its allocations reversed and receipts cancelled. This cannot be undone.</>} />
    </>
  )
}
