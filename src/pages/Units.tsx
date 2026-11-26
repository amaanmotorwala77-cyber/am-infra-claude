import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, DoorOpen } from 'lucide-react'
import { useProperties, useUnits } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { formatDate, formatINR, formatNumber } from '@/lib/format'
import type { VUnit } from '@/lib/types'
import { Button, Card, EmptyState, ErrorBlock, FilterBar, LoadingBlock, PageHeader, SearchInput, Select, Table, Td, Th, THead, Tr } from '@/components/ui'
import { OccupancyBadge } from '@/components/status'
import { UnitForm } from '@/components/forms/PropertyForms'
import { LeaseForm } from '@/components/forms/LeaseForms'

export default function Units() {
  const { isAdmin } = useAuth()
  const { data: properties = [] } = useProperties()
  const { data: units = [], isLoading, error, refetch } = useUnits()
  const [search, setSearch] = useState('')
  const [prop, setProp] = useState('')
  const [occ, setOcc] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<VUnit | null>(null)
  const [leaseFor, setLeaseFor] = useState<VUnit | null>(null)

  const rows = units.filter((u) => (!prop || u.property_id === prop) && (!occ || u.occupancy === occ) && u.property_archived_at === null &&
    (!search || `${u.unit_number} ${u.property_name} ${u.current_tenant_name ?? ''} ${u.unit_type ?? ''}`.toLowerCase().includes(search.toLowerCase())))

  return (
    <>
      <PageHeader title="Units" description={`${units.filter((u) => u.occupancy === 'vacant').length} vacant of ${units.length} units`}
        actions={isAdmin && <Button onClick={() => { setEditing(null); setOpen(true) }} disabled={!properties.length}><Plus className="h-4 w-4" />Add unit</Button>} />
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Unit, tenant, type…" className="sm:w-64" />
          <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-56"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select value={occ} onChange={(e) => setOcc(e.target.value)} className="sm:w-48"><option value="">All statuses</option><option value="occupied">Occupied</option><option value="vacant">Vacant</option><option value="under_maintenance">Under maintenance</option><option value="not_for_rent">Not for rent</option></Select>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={refetch} /> : rows.length === 0 ? <EmptyState icon={<DoorOpen className="h-6 w-6" />} title={units.length ? 'No units match' : 'No units yet'} description={!properties.length ? 'Add a property first.' : undefined} /> : (
          <Table>
            <THead><tr><Th>Property</Th><Th>Unit</Th><Th>Floor</Th><Th>Type</Th><Th className="text-right">Carpet</Th><Th className="text-right">Std. rent</Th><Th className="text-right">Deposit</Th><Th>Status</Th><Th>Tenant / agreement</Th><Th /></tr></THead>
            <tbody>{rows.map((u) => (
              <Tr key={u.id}>
                <Td className="text-xs"><Link to={`/properties/${u.property_id}`} className="hover:underline">{u.property_name}</Link></Td>
                <Td className="font-medium">{u.unit_number}</Td><Td>{u.floor_number ?? '—'}</Td><Td>{u.unit_type ?? '—'}</Td>
                <Td className="text-right tabular-nums">{u.carpet_area_sqft ? `${formatNumber(u.carpet_area_sqft)} ft²` : '—'}</Td>
                <Td className="text-right tabular-nums">{formatINR(u.monthly_rent)}</Td><Td className="text-right tabular-nums">{formatINR(u.security_deposit)}</Td>
                <Td><OccupancyBadge status={u.occupancy} /></Td>
                <Td className="text-xs">{u.current_tenant_id ? <><Link to={`/tenants/${u.current_tenant_id}`} className="font-medium text-gold-700 hover:underline">{u.current_tenant_name}</Link><div className="text-slate-500">{u.current_agreement_number} · to {formatDate(u.current_lease_end)}</div></> : '—'}</Td>
                <Td className="text-right">{isAdmin && <div className="flex justify-end gap-1">
                  {u.occupancy === 'vacant' && <Button size="sm" variant="outline" onClick={() => setLeaseFor(u)}>Let unit</Button>}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(u); setOpen(true) }}>Edit</Button></div>}</Td>
              </Tr>))}</tbody>
          </Table>
        )}
      </Card>
      <UnitForm open={open} onOpenChange={setOpen} unit={editing} properties={properties} propertyId={prop || undefined} />
      <LeaseForm open={!!leaseFor} onOpenChange={(o) => !o && setLeaseFor(null)} defaultUnitId={leaseFor?.id} />
    </>
  )
}
