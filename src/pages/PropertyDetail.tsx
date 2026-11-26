import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Plus, Upload, ImageIcon } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useUnits } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { formatDate, formatINR, formatNumber, PROPERTY_TYPE_LABEL } from '@/lib/format'
import type { Expense, Maintenance, Property, VObligation, VUnit } from '@/lib/types'
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SampleBadge, StatCard, Table, Tabs, Td, Th, THead, Tr } from '@/components/ui'
import { OccupancyBadge, MaintenanceBadge } from '@/components/status'
import { PropertyForm, UnitForm } from '@/components/forms/PropertyForms'
import { DocumentUploadForm, MaintenanceForm, ExpenseForm, EXPENSE_CATEGORIES } from '@/components/forms/OpsForms'
import { DocumentsTable, ObligationsTable, useDocuments } from '@/components/tables'

type Tab = 'units' | 'tenants' | 'rent' | 'expenses' | 'documents'

function Photos({ propertyId }: { propertyId: string }) {
  const { data: docs = [] } = useDocuments({ property_id: propertyId }, { category: 'property_photo' })
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const paths = docs.filter((d) => d.mime_type?.startsWith('image/')).slice(0, 8).map((d) => d.storage_path)
    if (!paths.length) { setUrls([]); return }
    supabase.storage.from('documents').createSignedUrls(paths, 600).then(({ data }) => setUrls((data ?? []).map((x) => x.signedUrl).filter(Boolean) as string[]))
  }, [docs])
  if (!urls.length) return null
  return <div className="mb-5 flex gap-3 overflow-x-auto pb-1">{urls.map((u) => <img key={u} src={u} alt="Property" className="h-32 w-48 shrink-0 rounded-md border border-line object-cover" />)}</div>
}

export default function PropertyDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('units')
  const [editOpen, setEditOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<VUnit | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archUnit, setArchUnit] = useState<VUnit | null>(null)
  const [docOpen, setDocOpen] = useState<null | 'doc' | 'photo'>(null)
  const [mOpen, setMOpen] = useState(false)
  const [eOpen, setEOpen] = useState(false)

  const prop = useQuery({ queryKey: ['property', id], queryFn: () => q<Property>(supabase.from('properties').select('*').eq('id', id).single()) })
  const { data: allProps = [] } = useProperties()
  const { data: units = [], isLoading: uLoading } = useUnits(id)
  const rent = useQuery({ queryKey: ['v_obligations', 'property', id], queryFn: () => q<VObligation[]>(supabase.from('v_obligations').select('*').eq('property_id', id).order('period_month', { ascending: false }).order('unit_number').limit(200)) })
  const maint = useQuery({ queryKey: ['maintenance', 'property', id], queryFn: () => q<Maintenance[]>(supabase.from('maintenance_requests').select('*, units(unit_number)').eq('property_id', id).order('reported_on', { ascending: false })) })
  const exps = useQuery({ queryKey: ['expenses', 'property', id], queryFn: () => q<Expense[]>(supabase.from('expenses').select('*').eq('property_id', id).is('archived_at', null).order('expense_date', { ascending: false })) })
  const docs = useDocuments({ property_id: id })

  if (prop.isLoading) return <LoadingBlock />
  if (prop.error || !prop.data) return <ErrorBlock error={prop.error ?? 'Property not found'} />
  const p = prop.data
  const occupied = units.filter((u) => u.occupancy === 'occupied')
  const arrears = (rent.data ?? []).filter((o) => o.status === 'overdue').reduce((a, o) => a + Number(o.outstanding), 0)

  async function toggleArchive() {
    try {
      await q(supabase.from('properties').update({ archived_at: p.archived_at ? null : new Date().toISOString() }).eq('id', p.id))
      toast.success(p.archived_at ? 'Property restored' : 'Property archived. Financial history is preserved.')
      qc.invalidateQueries({ queryKey: ['property'] }); qc.invalidateQueries({ queryKey: ['properties'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) { toast.error(friendlyError(e)) } finally { setArchiveOpen(false) }
  }
  async function archiveUnit() {
    if (!archUnit) return
    if (archUnit.occupancy === 'occupied') { toast.error('End or terminate the active agreement before archiving this unit'); setArchUnit(null); return }
    try { await q(supabase.from('units').update({ archived_at: new Date().toISOString() }).eq('id', archUnit.id)); toast.success(`Unit ${archUnit.unit_number} archived`); qc.invalidateQueries({ queryKey: ['v_units'] }) }
    catch (e) { toast.error(friendlyError(e)) } finally { setArchUnit(null) }
  }

  return (
    <>
      <Link to="/properties" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900"><ArrowLeft className="h-4 w-4" />Properties</Link>
      <PageHeader title={p.name} description={`${p.address}${p.city ? ', ' + p.city : ''}`}
        actions={isAdmin && <>
          <Button variant="outline" onClick={() => setDocOpen('photo')}><ImageIcon className="h-4 w-4" />Add photo</Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />Edit</Button>
          <Button variant="outline" onClick={() => setArchiveOpen(true)}>{p.archived_at ? <><ArchiveRestore className="h-4 w-4" />Restore</> : <><Archive className="h-4 w-4" />Archive</>}</Button>
          <Button onClick={() => { setEditingUnit(null); setUnitOpen(true) }}><Plus className="h-4 w-4" />Add unit</Button>
        </>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="navy">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>{p.is_sample && <SampleBadge />}{p.archived_at && <Badge tone="red">Archived {formatDate(p.archived_at)}</Badge>}
        {p.total_floors !== null && <Badge>{p.total_floors} floors</Badge>}{p.acquisition_date && <Badge>Acquired {formatDate(p.acquisition_date)}</Badge>}
      </div>
      <Photos propertyId={p.id} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Units" value={units.length} sub={`${occupied.length} occupied · ${units.filter((u) => u.occupancy === 'vacant').length} vacant`} />
        <StatCard label="Occupancy" value={units.length ? `${Math.round((occupied.length / units.length) * 100)}%` : '—'} />
        <StatCard label="Arrears" value={formatINR(arrears)} tone="red" sub="Overdue rent (recent 200 rows)" />
        <StatCard label="Open maintenance" value={(maint.data ?? []).filter((m) => m.status === 'open' || m.status === 'in_progress').length} />
      </div>
      {(p.description || p.ownership_details || p.notes) && (
        <Card className="mb-5 grid gap-4 p-4 text-sm sm:grid-cols-3">
          {p.description && <div><div className="text-xs uppercase tracking-wide text-slate-500">Description</div><p className="mt-1 whitespace-pre-line">{p.description}</p></div>}
          {p.ownership_details && <div><div className="text-xs uppercase tracking-wide text-slate-500">Ownership</div><p className="mt-1 whitespace-pre-line">{p.ownership_details}</p></div>}
          {p.notes && <div><div className="text-xs uppercase tracking-wide text-slate-500">Notes</div><p className="mt-1 whitespace-pre-line">{p.notes}</p></div>}
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'units', label: `Units (${units.length})` }, { value: 'tenants', label: 'Tenants' }, { value: 'rent', label: 'Rent history' }, { value: 'expenses', label: 'Maintenance & expenses' }, { value: 'documents', label: 'Documents' }]} />
      <Card>
        {tab === 'units' && (uLoading ? <LoadingBlock /> : units.length === 0 ? (
          <EmptyState title="No units yet" description="Add each flat, shop or office in this building." action={isAdmin && <Button onClick={() => setUnitOpen(true)}><Plus className="h-4 w-4" />Add unit</Button>} />
        ) : (
          <Table>
            <THead><tr><Th>Unit</Th><Th>Floor</Th><Th>Type</Th><Th className="text-right">Carpet (sq ft)</Th><Th className="text-right">Std. rent</Th><Th>Status</Th><Th>Current tenant</Th><Th /></tr></THead>
            <tbody>{units.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium">{u.unit_number}</Td><Td>{u.floor_number ?? '—'}</Td><Td>{u.unit_type ?? '—'}</Td>
                <Td className="text-right tabular-nums">{u.carpet_area_sqft ? formatNumber(u.carpet_area_sqft) : '—'}</Td>
                <Td className="text-right tabular-nums">{formatINR(u.monthly_rent)}</Td><Td><OccupancyBadge status={u.occupancy} /></Td>
                <Td>{u.current_tenant_id ? <Link className="text-gold-700 hover:underline" to={`/tenants/${u.current_tenant_id}`}>{u.current_tenant_name}</Link> : '—'}{u.current_lease_end && <div className="text-[11px] text-slate-500">until {formatDate(u.current_lease_end)}</div>}</Td>
                <Td className="text-right">{isAdmin && <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingUnit(u); setUnitOpen(true) }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setArchUnit(u)}>Archive</Button></div>}</Td>
              </Tr>))}</tbody>
          </Table>
        ))}
        {tab === 'tenants' && (occupied.length === 0 ? <EmptyState title="No current tenants" /> : (
          <Table>
            <THead><tr><Th>Tenant</Th><Th>Unit</Th><Th>Agreement</Th><Th>Ends</Th></tr></THead>
            <tbody>{occupied.map((u) => <Tr key={u.id} onClick={() => nav(`/tenants/${u.current_tenant_id}`)}><Td className="font-medium">{u.current_tenant_name}</Td><Td>{u.unit_number}</Td><Td>{u.current_agreement_number}</Td><Td>{formatDate(u.current_lease_end)}</Td></Tr>)}</tbody>
          </Table>
        ))}
        {tab === 'rent' && (rent.isLoading ? <LoadingBlock /> : <ObligationsTable rows={rent.data ?? []} />)}
        {tab === 'expenses' && (
          <div>
            <CardHeader title="Maintenance requests" action={<Button size="sm" onClick={() => setMOpen(true)}><Plus className="h-4 w-4" />New request</Button>} />
            {(maint.data ?? []).length === 0 ? <EmptyState title="No maintenance requests" /> : (
              <Table><THead><tr><Th>Issue</Th><Th>Unit</Th><Th>Reported</Th><Th>Assigned</Th><Th className="text-right">Cost</Th><Th>Status</Th></tr></THead>
                <tbody>{maint.data!.map((m) => <Tr key={m.id}><Td className="font-medium">{m.title}</Td><Td>{m.units?.unit_number ?? 'Common'}</Td><Td className="text-xs">{formatDate(m.reported_on)}</Td><Td className="text-xs">{m.assigned_to ?? '—'}</Td><Td className="text-right tabular-nums">{m.actual_cost !== null ? formatINR(m.actual_cost) : m.estimated_cost !== null ? <span className="text-slate-500">est. {formatINR(m.estimated_cost)}</span> : '—'}</Td><Td><MaintenanceBadge status={m.status} /></Td></Tr>)}</tbody></Table>
            )}
            <CardHeader title="Expenses" action={<Button size="sm" variant="outline" onClick={() => setEOpen(true)}><Plus className="h-4 w-4" />Record expense</Button>} />
            {(exps.data ?? []).length === 0 ? <EmptyState title="No expenses recorded" /> : (
              <Table><THead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th>Paid to</Th><Th className="text-right">Amount</Th></tr></THead>
                <tbody>{exps.data!.map((e) => <Tr key={e.id}><Td className="text-xs">{formatDate(e.expense_date)}</Td><Td>{EXPENSE_CATEGORIES[e.category]}</Td><Td>{e.description}</Td><Td className="text-xs">{e.paid_to ?? '—'}</Td><Td className="text-right tabular-nums">{formatINR(e.amount)}</Td></Tr>)}</tbody></Table>
            )}
          </div>
        )}
        {tab === 'documents' && (<>
          <CardHeader title="Documents" action={<Button size="sm" onClick={() => setDocOpen('doc')}><Upload className="h-4 w-4" />Upload</Button>} />
          <DocumentsTable rows={docs.data} isLoading={docs.isLoading} error={docs.error} />
        </>)}
      </Card>

      <PropertyForm open={editOpen} onOpenChange={setEditOpen} property={p} />
      <UnitForm open={unitOpen} onOpenChange={setUnitOpen} unit={editingUnit} propertyId={p.id} properties={allProps.length ? allProps : [p]} />
      <ConfirmDialog open={archiveOpen} onOpenChange={setArchiveOpen} title={p.archived_at ? 'Restore property?' : 'Archive property?'} danger={!p.archived_at}
        message={p.archived_at ? 'The property will appear in lists and dashboards again.' : 'The property will be hidden from lists and dashboards. All units, agreements, payments and receipts are preserved and remain in reports.'}
        confirmLabel={p.archived_at ? 'Restore' : 'Archive'} onConfirm={toggleArchive} />
      <ConfirmDialog open={!!archUnit} onOpenChange={(o) => !o && setArchUnit(null)} title={`Archive unit ${archUnit?.unit_number}?`} message="The unit is hidden from lists. Its agreements and rent history are preserved." confirmLabel="Archive" onConfirm={archiveUnit} />
      <DocumentUploadForm open={!!docOpen} onOpenChange={(o) => !o && setDocOpen(null)} defaults={{ property_id: p.id, category: docOpen === 'photo' ? 'property_photo' : 'property_document' }} />
      <MaintenanceForm open={mOpen} onOpenChange={setMOpen} defaultPropertyId={p.id} />
      <ExpenseForm open={eOpen} onOpenChange={setEOpen} defaultPropertyId={p.id} />
    </>
  )
}
