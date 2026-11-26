import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Eye, Printer, ReceiptText } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useInvalidateFinance } from '@/lib/data'
import { formatDate, formatINR, formatPeriod, METHOD_LABEL } from '@/lib/format'
import { buildReceiptPdf, downloadReceipt, printReceipt } from '@/lib/receiptPdf'
import type { Receipt, VPayment } from '@/lib/types'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBlock, FilterBar, Input, LoadingBlock, Modal, PageHeader, SampleBadge, SearchInput, Select, Table, Td, Th, THead, Tr } from '@/components/ui'

export default function Receipts() {
  const invalidate = useInvalidateFinance()
  const { data: properties = [] } = useProperties()
  const [search, setSearch] = useState('')
  const [prop, setProp] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preview, setPreview] = useState<{ r: Receipt; url: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const receipts = useQuery({
    queryKey: ['receipts', 'list', prop, from, to],
    queryFn: () => {
      let b = supabase.from('receipts').select('*').order('created_at', { ascending: false }).limit(500)
      if (prop) b = b.eq('property_id', prop)
      if (from) b = b.gte('issued_on', from)
      if (to) b = b.lte('issued_on', to)
      return q<Receipt[]>(b)
    },
  })
  const pending = useQuery({
    queryKey: ['v_payments', 'unreceipted'],
    queryFn: async () => (await q<VPayment[]>(supabase.from('v_payments').select('*').is('voided_at', null).order('payment_date', { ascending: false }).limit(300))).filter((p) => Number(p.receipted_amount) < Number(p.amount)),
  })

  const rows = (receipts.data ?? []).filter((r) => !search || `${r.receipt_number} ${r.snapshot.tenant.name} ${r.snapshot.property.name} ${r.snapshot.unit.number} ${r.snapshot.payment.reference ?? ''}`.toLowerCase().includes(search.toLowerCase()))

  async function issue(p: VPayment) {
    setBusy(p.id)
    try { const r = await q<Receipt>(supabase.rpc('issue_receipt', { p_payment_id: p.id }).single()); toast.success(`Receipt ${r.receipt_number} generated`); downloadReceipt(r); invalidate() }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }
  function open(r: Receipt) { const url = buildReceiptPdf(r).output('bloburl') as unknown as string; setPreview({ r, url }) }

  return (
    <>
      <PageHeader title="Receipts" description="Receipts reflect money actually received — numbers are unique per financial year" />
      {(pending.data ?? []).length > 0 && (
        <Card className="mb-5">
          <CardHeader title={`Payments awaiting a receipt (${pending.data!.length})`} />
          <Table>
            <THead><tr><Th>Date</Th><Th>Tenant</Th><Th>Unit</Th><Th>Period</Th><Th className="text-right">Amount</Th><Th /></tr></THead>
            <tbody>{pending.data!.slice(0, 10).map((p) => (
              <Tr key={p.id}><Td className="text-xs">{formatDate(p.payment_date)}</Td><Td className="font-medium">{p.tenant_name}</Td><Td className="text-xs">{p.property_name} · {p.unit_number}</Td><Td className="text-xs">{formatPeriod(p.period_from, p.period_to)}</Td>
                <Td className="text-right tabular-nums">{formatINR(Number(p.amount) - Number(p.receipted_amount))}</Td>
                <Td className="text-right"><Button size="sm" variant="gold" loading={busy === p.id} onClick={() => issue(p)}>Generate receipt</Button></Td></Tr>))}</tbody>
          </Table>
        </Card>
      )}
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Receipt no., tenant, unit, reference" className="sm:w-72" />
          <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-52"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <label className="text-xs text-slate-500">Issued from<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-slate-500">to<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </FilterBar>
        {receipts.isLoading ? <LoadingBlock /> : receipts.error ? <ErrorBlock error={receipts.error} /> : rows.length === 0 ? <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No receipts yet" description="Record a payment, then generate its receipt." /> : (
          <Table>
            <THead><tr><Th>Receipt no.</Th><Th>Issued</Th><Th>Tenant</Th><Th>Property · Unit</Th><Th>Period</Th><Th>Method</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>{rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.receipt_number}{r.snapshot.is_sample && <> <SampleBadge /></>}</Td>
                <Td className="text-xs">{formatDate(r.issued_on)}</Td><Td>{r.snapshot.tenant.name}</Td>
                <Td className="text-xs">{r.snapshot.property.name} · <b>{r.snapshot.unit.number}</b></Td>
                <Td className="text-xs">{formatPeriod(r.snapshot.payment.period_from, r.snapshot.payment.period_to)}{r.snapshot.is_advance && <div className="text-gold-700">Advance</div>}{r.snapshot.is_partial && <div className="text-amber-700">Partial</div>}</Td>
                <Td className="text-xs">{METHOD_LABEL[r.snapshot.payment.method]}</Td>
                <Td className="text-right font-medium tabular-nums">{formatINR(r.amount)}</Td>
                <Td>{r.cancelled_at ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Valid</Badge>}</Td>
                <Td className="text-right"><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="Open" onClick={() => open(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Download" onClick={() => downloadReceipt(r)}><Download className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Print" onClick={() => printReceipt(r)}><Printer className="h-4 w-4" /></Button>
                </div></Td>
              </Tr>))}</tbody>
          </Table>
        )}
      </Card>
      <Modal open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={preview?.r.receipt_number ?? ''} wide
        footer={preview && <><Button variant="outline" onClick={() => printReceipt(preview.r)}><Printer className="h-4 w-4" />Print</Button><Button onClick={() => downloadReceipt(preview.r)}><Download className="h-4 w-4" />Download PDF</Button></>}>
        {preview && <iframe title="Receipt preview" src={preview.url} className="h-[70vh] w-full rounded border border-line" />}
      </Modal>
    </>
  )
}
