import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Wrench } from 'lucide-react'
import { supabase, q } from '@/lib/supabase'
import { useProperties } from '@/lib/data'
import { formatDate, formatINR, formatMonth } from '@/lib/format'
import type { Expense, Maintenance as M } from '@/lib/types'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBlock, FilterBar, LoadingBlock, PageHeader, SearchInput, Select, StatCard, Table, Tabs, Td, Th, THead, Tr } from '@/components/ui'
import { MaintenanceBadge } from '@/components/status'
import { ExpenseForm, MaintenanceForm, EXPENSE_CATEGORIES } from '@/components/forms/OpsForms'

export default function Maintenance() {
  const { data: properties = [] } = useProperties()
  const [tab, setTab] = useState<'requests' | 'expenses' | 'summary'>('requests')
  const [prop, setProp] = useState('')
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [mOpen, setMOpen] = useState(false)
  const [editing, setEditing] = useState<M | null>(null)
  const [eOpen, setEOpen] = useState(false)
  const [editingE, setEditingE] = useState<Expense | null>(null)
  const [expenseFrom, setExpenseFrom] = useState<M | null>(null)

  const reqs = useQuery({ queryKey: ['maintenance', 'all'], queryFn: () => q<M[]>(supabase.from('maintenance_requests').select('*, properties(name), units(unit_number)').order('reported_on', { ascending: false })) })
  const exps = useQuery({ queryKey: ['expenses', 'all'], queryFn: () => q<Expense[]>(supabase.from('expenses').select('*, properties(name)').is('archived_at', null).order('expense_date', { ascending: false })) })

  const list = (reqs.data ?? []).filter((m) => (!prop || m.property_id === prop) &&
    (status === 'active' ? ['open', 'in_progress'].includes(m.status) : !status || m.status === status) &&
    (!search || `${m.title} ${m.assigned_to ?? ''} ${m.units?.unit_number ?? ''}`.toLowerCase().includes(search.toLowerCase())))
  const expRows = (exps.data ?? []).filter((e) => !prop || e.property_id === prop)

  // Summary: maintenance cost by property × month (completed actual cost + recorded expenses in "maintenance/repairs")
  const summary = useMemo(() => {
    const map = new Map<string, { property: string; month: string; requests: number; expenses: number }>()
    for (const m of reqs.data ?? []) {
      if (prop && m.property_id !== prop) continue
      if (m.actual_cost === null || m.status === 'cancelled') continue
      const month = (m.completed_on ?? m.reported_on).slice(0, 7); const k = `${m.property_id}|${month}`
      const r = map.get(k) ?? { property: m.properties?.name ?? '', month, requests: 0, expenses: 0 }; r.requests += Number(m.actual_cost); map.set(k, r)
    }
    for (const e of exps.data ?? []) {
      if (prop && e.property_id !== prop) continue
      if (e.maintenance_request_id) continue // already counted via request cost
      const month = e.expense_date.slice(0, 7); const k = `${e.property_id}|${month}`
      const r = map.get(k) ?? { property: e.properties?.name ?? '', month, requests: 0, expenses: 0 }; r.expenses += Number(e.amount); map.set(k, r)
    }
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month) || a.property.localeCompare(b.property))
  }, [reqs.data, exps.data, prop])

  const all = reqs.data ?? []
  return (
    <>
      <PageHeader title="Maintenance" description="Requests, contractor work and property expenses"
        actions={<><Button variant="outline" onClick={() => { setEditingE(null); setExpenseFrom(null); setEOpen(true) }}><Plus className="h-4 w-4" />Record expense</Button><Button onClick={() => { setEditing(null); setMOpen(true) }}><Plus className="h-4 w-4" />New request</Button></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={all.filter((m) => m.status === 'open').length} tone="red" />
        <StatCard label="In progress" value={all.filter((m) => m.status === 'in_progress').length} tone="gold" />
        <StatCard label="Urgent / high" value={all.filter((m) => ['open', 'in_progress'].includes(m.status) && ['urgent', 'high'].includes(m.priority)).length} tone="red" />
        <StatCard label="Unpaid contractor costs" value={formatINR(all.filter((m) => m.payment_status !== 'paid' && m.status === 'completed').reduce((a, m) => a + Number(m.actual_cost ?? 0), 0))} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'requests', label: 'Requests' }, { value: 'expenses', label: 'Expenses' }, { value: 'summary', label: 'Expense summary' }]} />
      <Card>
        <FilterBar>
          <Select value={prop} onChange={(e) => setProp(e.target.value)} className="sm:w-56"><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          {tab === 'requests' && <>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44"><option value="active">Open + in progress</option><option value="">All</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select>
            <SearchInput value={search} onChange={setSearch} className="sm:w-64" />
          </>}
        </FilterBar>
        {tab === 'requests' && (reqs.isLoading ? <LoadingBlock /> : reqs.error ? <ErrorBlock error={reqs.error} /> : list.length === 0 ? <EmptyState icon={<Wrench className="h-6 w-6" />} title="No requests" /> : (
          <Table>
            <THead><tr><Th>Issue</Th><Th>Property · Unit</Th><Th>Reported</Th><Th>Assigned to</Th><Th>Priority</Th><Th className="text-right">Est.</Th><Th className="text-right">Actual</Th><Th>Payment</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>{list.map((m) => (
              <Tr key={m.id} onClick={() => { setEditing(m); setMOpen(true) }}>
                <Td className="font-medium">{m.title}{m.description && <div className="max-w-xs truncate text-xs font-normal text-slate-500">{m.description}</div>}</Td>
                <Td className="text-xs">{m.properties?.name} · {m.units?.unit_number ?? 'Common'}</Td>
                <Td className="text-xs">{formatDate(m.reported_on)}{m.completed_on && <div className="text-emerald-700">done {formatDate(m.completed_on)}</div>}</Td>
                <Td className="text-xs">{m.assigned_to ?? '—'}</Td>
                <Td><Badge tone={m.priority === 'urgent' || m.priority === 'high' ? 'red' : 'neutral'}>{m.priority}</Badge></Td>
                <Td className="text-right tabular-nums">{m.estimated_cost !== null ? formatINR(m.estimated_cost) : '—'}</Td>
                <Td className="text-right tabular-nums">{m.actual_cost !== null ? formatINR(m.actual_cost) : '—'}</Td>
                <Td><Badge tone={m.payment_status === 'paid' ? 'green' : m.payment_status === 'partially_paid' ? 'amber' : 'neutral'}>{m.payment_status.replace('_', ' ')}</Badge></Td>
                <Td><MaintenanceBadge status={m.status} /></Td>
                <Td className="text-right">{m.actual_cost !== null && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingE(null); setExpenseFrom(m); setEOpen(true) }}>Log expense</Button>}</Td>
              </Tr>))}</tbody>
          </Table>
        ))}
        {tab === 'expenses' && (exps.isLoading ? <LoadingBlock /> : expRows.length === 0 ? <EmptyState title="No expenses recorded" /> : (
          <Table>
            <THead><tr><Th>Date</Th><Th>Property</Th><Th>Category</Th><Th>Description</Th><Th>Paid to</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>{expRows.map((e) => <Tr key={e.id} onClick={() => { setEditingE(e); setExpenseFrom(null); setEOpen(true) }}><Td className="text-xs">{formatDate(e.expense_date)}</Td><Td className="text-xs">{e.properties?.name}</Td><Td>{EXPENSE_CATEGORIES[e.category]}</Td><Td>{e.description}</Td><Td className="text-xs">{e.paid_to ?? '—'}</Td><Td className="text-right tabular-nums">{formatINR(e.amount)}</Td></Tr>)}</tbody>
          </Table>
        ))}
        {tab === 'summary' && (summary.length === 0 ? <EmptyState title="No costs recorded yet" /> : (<>
          <CardHeader title="Costs by property and month" subtitle="Completed request actual costs + other recorded expenses (expenses linked to a request are not double-counted)" />
          <Table>
            <THead><tr><Th>Month</Th><Th>Property</Th><Th className="text-right">Maintenance requests</Th><Th className="text-right">Other expenses</Th><Th className="text-right">Total</Th></tr></THead>
            <tbody>{summary.map((s) => <Tr key={s.property + s.month}><Td>{formatMonth(s.month + '-01')}</Td><Td>{s.property}</Td><Td className="text-right tabular-nums">{formatINR(s.requests)}</Td><Td className="text-right tabular-nums">{formatINR(s.expenses)}</Td><Td className="text-right font-medium tabular-nums">{formatINR(s.requests + s.expenses)}</Td></Tr>)}</tbody>
          </Table></>))}
      </Card>
      <MaintenanceForm open={mOpen} onOpenChange={setMOpen} item={editing} defaultPropertyId={prop || undefined} />
      <ExpenseForm open={eOpen} onOpenChange={setEOpen} item={editingE} maintenance={expenseFrom} defaultPropertyId={prop || undefined} />
    </>
  )
}
