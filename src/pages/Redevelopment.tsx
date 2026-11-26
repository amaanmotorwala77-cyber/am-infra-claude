import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HardHat, Plus, Layers, Hammer, Wallet, Users2, CalendarRange } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea, Th, THead, Tr } from '@/components/ui'

interface Project { id: string; name: string; property_id: string | null; location: string | null; description: string | null; status: string; start_date: string | null; expected_completion: string | null; project_manager: string | null; properties?: { name: string } | null }
const STATUS: Record<string, string> = { planning: 'Planning', approvals: 'Approvals', construction: 'Construction', completed: 'Completed', on_hold: 'On hold' }

export default function Redevelopment() {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: properties = [] } = useProperties()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => q<Project[]>(supabase.from('redevelopment_projects').select('*, properties(name)').order('created_at', { ascending: false })) })
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<Record<string, string>>({ status: 'planning' })
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  async function save() {
    if (!v.name?.trim()) return toast.error('Project name is required')
    setBusy(true)
    try {
      await q(supabase.from('redevelopment_projects').insert({ name: v.name.trim(), property_id: v.property_id || null, location: v.location || null, description: v.description || null, status: v.status, start_date: v.start_date || null, expected_completion: v.expected_completion || null, project_manager: v.project_manager || null }))
      toast.success('Project created'); qc.invalidateQueries({ queryKey: ['projects'] }); setOpen(false); setV({ status: 'planning' })
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const upcoming = [
    { icon: Users2, t: 'Existing occupants & rehab', d: 'Pull existing units, tenants, carpet areas and agreements from the linked property; track rehabilitation entitlements.' },
    { icon: Layers, t: 'Floor plans', d: 'Building and floor layouts with unit numbers, carpet areas and availability.' },
    { icon: Hammer, t: 'Construction', d: 'Milestones, progress, contractors, approvals and documents.' },
    { icon: Wallet, t: 'Budgets & costs', d: 'Project budgets vs actual construction expenses.' },
    { icon: CalendarRange, t: 'Sales & inventory', d: 'New flat inventory, bookings, buyers, payment schedules, possession timelines.' },
  ]
  return (
    <>
      <PageHeader title="Redevelopment projects" description="Phase 5 — foundation in place; full module comes after rental management" actions={isAdmin && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New project</Button>} />
      <Card className="mb-5">
        <CardHeader title="Projects" subtitle="Projects can link to an existing property so its units, tenants and documents carry over later" />
        {projects.data?.length ? (
          <Table><THead><tr><Th>Project</Th><Th>Existing property</Th><Th>Location</Th><Th>Status</Th><Th>Start</Th><Th>Expected completion</Th><Th>Manager</Th></tr></THead>
            <tbody>{projects.data.map((p) => <Tr key={p.id}><Td className="font-medium">{p.name}{p.description && <div className="max-w-xs truncate text-xs font-normal text-slate-500">{p.description}</div>}</Td><Td className="text-xs">{p.properties?.name ?? '—'}</Td><Td className="text-xs">{p.location ?? '—'}</Td><Td><Badge tone="gold">{STATUS[p.status]}</Badge></Td><Td className="text-xs">{formatDate(p.start_date)}</Td><Td className="text-xs">{formatDate(p.expected_completion)}</Td><Td className="text-xs">{p.project_manager ?? '—'}</Td></Tr>)}</tbody></Table>
        ) : <EmptyState icon={<HardHat className="h-6 w-6" />} title="No redevelopment projects yet" description="Create a basic project record now; detailed tools are coming in Phase 5." />}
      </Card>
      <div className="mb-2 flex items-center gap-2"><h2 className="font-serif text-lg text-navy-900">Coming in Phase 5</h2><Badge tone="gold">Planned</Badge></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {upcoming.map(({ icon: I, t, d }) => <Card key={t} className="p-4 opacity-90"><I className="h-5 w-5 text-gold-500" /><div className="mt-2 text-sm font-semibold text-navy-900">{t}</div><p className="mt-1 text-xs text-slate-500">{d}</p></Card>)}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="New redevelopment project" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={busy}>Create</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" required className="sm:col-span-2"><Input value={v.name ?? ''} onChange={set('name')} /></Field>
          <Field label="Existing property"><Select value={v.property_id ?? ''} onChange={set('property_id')}><option value="">None</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Status"><Select value={v.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Location" className="sm:col-span-2"><Input value={v.location ?? ''} onChange={set('location')} /></Field>
          <Field label="Start date"><Input type="date" value={v.start_date ?? ''} onChange={set('start_date')} /></Field>
          <Field label="Expected completion"><Input type="date" value={v.expected_completion ?? ''} onChange={set('expected_completion')} /></Field>
          <Field label="Project manager" className="sm:col-span-2"><Input value={v.project_manager ?? ''} onChange={set('project_manager')} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={v.description ?? ''} onChange={set('description')} /></Field>
        </div>
      </Modal>
    </>
  )
}
