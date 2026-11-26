import { useState } from 'react'
import { Upload, Lock } from 'lucide-react'
import { useProperties, useTenants } from '@/lib/data'
import { DOC_CATEGORIES } from '@/lib/docs'
import { Button, Card, Checkbox, FilterBar, PageHeader, SearchInput, Select } from '@/components/ui'
import { DocumentsTable, useDocuments } from '@/components/tables'
import { DocumentUploadForm } from '@/components/forms/OpsForms'

export default function Documents() {
  const { data: properties = [] } = useProperties()
  const { data: tenants = [] } = useTenants()
  const [prop, setProp] = useState('')
  const [tenant, setTenant] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [open, setOpen] = useState(false)
  const docs = useDocuments({ property_id: prop, tenant_id: tenant }, { category: category || undefined, includeArchived: archived })
  const rows = (docs.data ?? []).filter((d) => !search || `${d.name} ${d.notes ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <>
      <PageHeader title="Documents" description="Private document library — files open via 60-second signed links only" actions={<Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload document</Button>} />
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or notes" className="sm:w-64" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-48"><option value="">All categories</option>{Object.entries(DOC_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-52"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select value={tenant} onChange={(e) => setTenant(e.target.value)} className="sm:w-52"><option value="">All tenants</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select>
          <Checkbox checked={archived} onChange={setArchived} label="Include archived" />
          <span className="flex items-center gap-1 text-xs text-slate-500 sm:ml-auto"><Lock className="h-3.5 w-3.5" />Private bucket</span>
        </FilterBar>
        <DocumentsTable rows={rows} isLoading={docs.isLoading} error={docs.error} />
      </Card>
      <DocumentUploadForm open={open} onOpenChange={setOpen} defaults={{ property_id: prop || null, tenant_id: tenant || null, category: category || 'other' }} />
    </>
  )
}
