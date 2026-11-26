import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { useProperties, useTenants } from '@/lib/data'
import { formatDate, formatINR, todayIST } from '@/lib/format'
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, FilterBar, LoadingBlock, PageHeader, SampleBadge, SearchInput, Select, Table, Td, Th, THead, Tr } from '@/components/ui'
import { LeaseBadge } from '@/components/status'
import { TenantForm } from '@/components/forms/PropertyForms'

export default function Tenants() {
  const nav = useNavigate()
  const { data: tenants = [], isLoading, error, refetch } = useTenants()
  const { data: properties = [] } = useProperties()
  const [search, setSearch] = useState('')
  const [prop, setProp] = useState('')
  const [status, setStatus] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [open, setOpen] = useState(false)

  const rows = tenants.filter((t) => {
    if (!showArchived && t.archived_at) return false
    if (prop && t.property_id !== prop) return false
    if (status === 'current' && t.lease_status !== 'active') return false
    if (status === 'no_lease' && t.current_lease_id) return false
    if (status === 'dues' && !(t.outstanding_due > 0)) return false
    if (search && !`${t.full_name} ${t.phone ?? ''} ${t.email ?? ''} ${t.unit_number ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      <PageHeader title="Tenants" description="Central tenant register — records are archived, never deleted" actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add tenant</Button>} />
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, email, unit" className="sm:w-64" />
          <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-56"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48"><option value="">All tenants</option><option value="current">Active agreement</option><option value="dues">With outstanding dues</option><option value="no_lease">No current agreement</option></Select>
          <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
        </FilterBar>
        {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={tenants.length ? 'No tenants match' : 'No tenants yet'} action={!tenants.length && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add tenant</Button>} />
        ) : (
          <Table>
            <THead><tr><Th>Tenant</Th><Th>Contact</Th><Th>Property · Unit</Th><Th>Lease</Th><Th className="text-right">Rent</Th><Th>Due day</Th><Th>Agreement</Th><Th className="text-right">Outstanding</Th></tr></THead>
            <tbody>{rows.map((t) => (
              <Tr key={t.id} onClick={() => nav(`/tenants/${t.id}`)}>
                <Td><div className="flex items-center gap-2 font-medium">{t.full_name}{t.is_sample && <SampleBadge />}{t.archived_at && <Badge>Archived</Badge>}</div></Td>
                <Td className="text-xs">{t.phone ?? '—'}<div className="text-slate-500">{t.email}</div></Td>
                <Td className="text-xs">{t.property_name ? <>{t.property_name} · <b>{t.unit_number}</b></> : '—'}</Td>
                <Td className="text-xs">{t.lease_start ? `${formatDate(t.lease_start)} – ${formatDate(t.lease_end)}` : '—'}</Td>
                <Td className="text-right tabular-nums">{t.monthly_rent ? formatINR(t.monthly_rent) : '—'}</Td>
                <Td>{t.rent_due_day ?? '—'}</Td>
                <Td>{t.lease_status ? <LeaseBadge status={t.lease_status === 'active' && t.lease_end && t.lease_end < todayIST() ? 'expired' : t.lease_status} /> : <span className="text-xs text-slate-400">None</span>}</Td>
                <Td className="text-right font-medium tabular-nums">{t.outstanding_due > 0 ? <span className="text-red-700">{formatINR(t.outstanding_due)}</span> : formatINR(0)}</Td>
              </Tr>))}</tbody>
          </Table>
        )}
      </Card>
      <TenantForm open={open} onOpenChange={setOpen} onSaved={(t) => nav(`/tenants/${t.id}`)} />
    </>
  )
}
