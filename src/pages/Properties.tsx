import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, List, Plus, Building2, MapPin } from 'lucide-react'
import { useProperties, useUnits } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { PROPERTY_TYPE_LABEL } from '@/lib/format'
import type { Property } from '@/lib/types'
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, FilterBar, LoadingBlock, PageHeader, SampleBadge, SearchInput, Select, Table, Td, Th, THead, Tr } from '@/components/ui'
import { PropertyForm } from '@/components/forms/PropertyForms'

function readView(): 'table' | 'cards' { try { return localStorage.getItem('ami.propview') === 'cards' ? 'cards' : 'table' } catch { return 'table' } }

export default function Properties() {
  const nav = useNavigate()
  const { isAdmin } = useAuth()
  const [showArchived, setShowArchived] = useState(false)
  const { data: properties = [], isLoading, error, refetch } = useProperties(showArchived)
  const { data: units = [] } = useUnits()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [occ, setOcc] = useState('')
  const [view, setView] = useState(readView)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Property | null>(null)

  const counts = useMemo(() => {
    const m: Record<string, { total: number; occupied: number; vacant: number }> = {}
    for (const u of units) { const c = (m[u.property_id] ??= { total: 0, occupied: 0, vacant: 0 }); c.total++; if (u.occupancy === 'occupied') c.occupied++; if (u.occupancy === 'vacant') c.vacant++ }
    return m
  }, [units])

  const rows = properties.filter((p) => {
    const s = search.toLowerCase()
    if (s && !p.name.toLowerCase().includes(s) && !p.address.toLowerCase().includes(s)) return false
    if (type && p.property_type !== type) return false
    const c = counts[p.id] ?? { total: 0, occupied: 0, vacant: 0 }
    if (occ === 'has_vacancy' && c.vacant === 0) return false
    if (occ === 'full' && (c.total === 0 || c.occupied < c.total)) return false
    return true
  })
  const setV = (v: 'table' | 'cards') => { setView(v); try { localStorage.setItem('ami.propview', v) } catch { /* ignore */ } }

  return (
    <>
      <PageHeader title="Properties" description="Buildings and their rental units"
        actions={isAdmin && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" />Add property</Button>} />
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or address" className="sm:w-72" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-44"><option value="">All types</option>{Object.entries(PROPERTY_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={occ} onChange={(e) => setOcc(e.target.value)} className="sm:w-48"><option value="">Any occupancy</option><option value="has_vacancy">Has vacant units</option><option value="full">Fully occupied</option></Select>
          <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
          <div className="flex gap-1 sm:ml-auto">
            <Button variant={view === 'table' ? 'primary' : 'outline'} size="icon" onClick={() => setV('table')} aria-label="Table view"><List className="h-4 w-4" /></Button>
            <Button variant={view === 'cards' ? 'primary' : 'outline'} size="icon" onClick={() => setV('cards')} aria-label="Card view"><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState icon={<Building2 className="h-6 w-6" />} title={properties.length ? 'No properties match your filters' : 'No properties yet'}
            action={isAdmin && !properties.length && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add your first property</Button>} />
        ) : view === 'table' ? (
          <Table>
            <THead><tr><Th>Property</Th><Th>Type</Th><Th>Floors</Th><Th className="text-right">Units</Th><Th className="text-right">Occupied</Th><Th className="text-right">Vacant</Th><Th /></tr></THead>
            <tbody>{rows.map((p) => { const c = counts[p.id] ?? { total: 0, occupied: 0, vacant: 0 }; return (
              <Tr key={p.id} onClick={() => nav(`/properties/${p.id}`)}>
                <Td><div className="flex items-center gap-2 font-medium">{p.name}{p.is_sample && <SampleBadge />}{p.archived_at && <Badge>Archived</Badge>}</div><div className="text-xs text-slate-500">{p.address}</div></Td>
                <Td>{PROPERTY_TYPE_LABEL[p.property_type]}</Td><Td>{p.total_floors ?? '—'}</Td>
                <Td className="text-right tabular-nums">{c.total}</Td><Td className="text-right tabular-nums">{c.occupied}</Td>
                <Td className="text-right tabular-nums">{c.vacant > 0 ? <span className="font-medium text-gold-700">{c.vacant}</span> : 0}</Td>
                <Td className="text-right">{isAdmin && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(p); setOpen(true) }}>Edit</Button>}</Td>
              </Tr>) })}</tbody>
          </Table>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => { const c = counts[p.id] ?? { total: 0, occupied: 0, vacant: 0 }; const pct = c.total ? Math.round((c.occupied / c.total) * 100) : 0; return (
              <button key={p.id} onClick={() => nav(`/properties/${p.id}`)} className="rounded-lg border border-line bg-white p-4 text-left transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2"><div className="font-serif text-lg text-navy-900">{p.name}</div>{p.is_sample && <SampleBadge />}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{p.address}</div>
                <div className="mt-3 flex gap-2"><Badge tone="navy">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>{p.archived_at && <Badge>Archived</Badge>}</div>
                <div className="mt-4 flex justify-between text-xs text-slate-600"><span>{c.total} units · {c.vacant} vacant</span><span>{pct}% occupied</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-gold-500" style={{ width: `${pct}%` }} /></div>
              </button>) })}
          </div>
        )}
      </Card>
      <PropertyForm open={open} onOpenChange={setOpen} property={editing} onSaved={(id) => !editing && nav(`/properties/${id}`)} />
    </>
  )
}
