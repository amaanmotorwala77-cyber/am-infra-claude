import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldCheck, Database, Trash2 } from 'lucide-react'
import { supabase, q, friendlyError } from '@/lib/supabase'
import { useProperties, useSettings } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import type { BusinessSettings, Profile } from '@/lib/types'
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, LoadingBlock, PageHeader, Select, Table, Tabs, Td, Textarea, Th, THead, Tr } from '@/components/ui'

function Business() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { data, isLoading } = useSettings()
  const [v, setV] = useState<Partial<BusinessSettings>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setV(data) }, [data])
  if (isLoading) return <LoadingBlock />
  const set = (k: keyof BusinessSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  async function save() {
    if (!v.legal_name?.trim() || !v.address?.trim()) return toast.error('Legal name and address are required')
    if (!/^[A-Z0-9-]{1,10}$/.test(v.receipt_prefix ?? '')) return toast.error('Receipt prefix: 1–10 capital letters, digits or hyphens')
    setBusy(true)
    try {
      const { legal_name, trade_name, address, phone, email, pan, gstin, receipt_prefix, receipt_footer, signatory_name } = v
      await q(supabase.from('business_settings').update({ legal_name, trade_name, address, phone, email, pan, gstin: gstin || null, receipt_prefix, receipt_footer, signatory_name }).eq('id', 1))
      toast.success('Business details saved. New receipts will use them.'); qc.invalidateQueries({ queryKey: ['business_settings'] })
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Landlord / business details" subtitle="Printed on every new receipt. Existing receipts keep the details they were issued with." />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Owner legal name" required className="sm:col-span-2"><Input value={v.legal_name ?? ''} onChange={set('legal_name')} disabled={!isAdmin} /></Field>
        <Field label="Trade name"><Input value={v.trade_name ?? ''} onChange={set('trade_name')} disabled={!isAdmin} /></Field>
        <Field label="Authorised signatory"><Input value={v.signatory_name ?? ''} onChange={set('signatory_name')} disabled={!isAdmin} /></Field>
        <Field label="Address" required className="sm:col-span-2"><Textarea rows={2} value={v.address ?? ''} onChange={set('address')} disabled={!isAdmin} /></Field>
        <Field label="Phone"><Input value={v.phone ?? ''} onChange={set('phone')} disabled={!isAdmin} /></Field>
        <Field label="Email"><Input value={v.email ?? ''} onChange={set('email')} disabled={!isAdmin} /></Field>
        <Field label="PAN"><Input value={v.pan ?? ''} onChange={set('pan')} disabled={!isAdmin} /></Field>
        <Field label="GSTIN (if registered)"><Input value={v.gstin ?? ''} onChange={set('gstin')} disabled={!isAdmin} /></Field>
        <Field label="Receipt number prefix" hint="Receipts are numbered PREFIX/2026-27/00001"><Input value={v.receipt_prefix ?? ''} onChange={(e) => setV((s) => ({ ...s, receipt_prefix: e.target.value.toUpperCase() }))} disabled={!isAdmin} /></Field>
        <Field label="Receipt footer"><Input value={v.receipt_footer ?? ''} onChange={set('receipt_footer')} disabled={!isAdmin} /></Field>
      </div>
      {isAdmin && <div className="flex justify-end border-t border-line px-4 py-3"><Button onClick={save} loading={busy}>Save details</Button></div>}
    </Card>
  )
}

function UsersTab() {
  const qc = useQueryClient()
  const { profile: me } = useAuth()
  const { data: properties = [] } = useProperties()
  const users = useQuery({ queryKey: ['profiles'], queryFn: () => q<Profile[]>(supabase.from('profiles').select('*').order('created_at')) })
  const assigns = useQuery({ queryKey: ['assignments'], queryFn: () => q<{ user_id: string; property_id: string }[]>(supabase.from('property_assignments').select('user_id, property_id')) })
  async function update(u: Profile, patch: Partial<Profile>) {
    try { await q(supabase.from('profiles').update(patch).eq('id', u.id)); toast.success('User updated'); qc.invalidateQueries({ queryKey: ['profiles'] }) } catch (e) { toast.error(friendlyError(e)) }
  }
  async function toggleAssign(userId: string, propertyId: string, on: boolean) {
    try {
      if (on) await q(supabase.from('property_assignments').insert({ user_id: userId, property_id: propertyId }))
      else await q(supabase.from('property_assignments').delete().eq('user_id', userId).eq('property_id', propertyId))
      qc.invalidateQueries({ queryKey: ['assignments'] })
    } catch (e) { toast.error(friendlyError(e)) }
  }
  if (users.isLoading) return <LoadingBlock />
  return (
    <Card>
      <CardHeader title="Users & permissions" subtitle="New sign-ups wait here as inactive Property Managers. Permissions are enforced in the database (RLS), not just the UI." />
      <Table>
        <THead><tr><Th>User</Th><Th>Joined</Th><Th>Role</Th><Th>Status</Th><Th>Assigned properties (managers)</Th></tr></THead>
        <tbody>{(users.data ?? []).map((u) => (
          <Tr key={u.id}>
            <Td><div className="font-medium">{u.full_name || u.email}</div><div className="text-xs text-slate-500">{u.email}</div></Td>
            <Td className="text-xs">{formatDate(u.created_at)}</Td>
            <Td><Select value={u.role} onChange={(e) => update(u, { role: e.target.value as Profile['role'] })} disabled={u.id === me?.id} className="w-40"><option value="admin">Admin</option><option value="manager">Property Manager</option></Select></Td>
            <Td>{u.id === me?.id ? <Badge tone="green">You</Badge> : <Button size="sm" variant={u.is_active ? 'outline' : 'gold'} onClick={() => update(u, { is_active: !u.is_active })}>{u.is_active ? 'Deactivate' : 'Approve'}</Button>}</Td>
            <Td>{u.role === 'admin' ? <span className="text-xs text-slate-500">All properties</span> : (
              <div className="flex flex-wrap gap-1.5">{properties.map((p) => { const on = (assigns.data ?? []).some((a) => a.user_id === u.id && a.property_id === p.id); return (
                <button key={p.id} onClick={() => toggleAssign(u.id, p.id, !on)} className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-gold-500 bg-gold-50 text-gold-700' : 'border-line text-slate-500 hover:border-slate-400'}`}>{p.name}</button>) })}
                {!properties.length && <span className="text-xs text-slate-500">No properties</span>}</div>)}</Td>
          </Tr>))}</tbody>
      </Table>
    </Card>
  )
}

function SampleData() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  async function run(fn: 'load_sample_data' | 'purge_sample_data') {
    setBusy(fn)
    try { const msg = await q<string>(supabase.rpc(fn)); toast.success(msg); qc.invalidateQueries() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null); setConfirm(false) }
  }
  return (
    <Card>
      <CardHeader title="Sample data" subtitle="For testing only. Every sample record is prefixed [SAMPLE], flagged in the database and badged in the UI." />
      <div className="space-y-3 p-4 text-sm text-slate-700">
        <p>Loads 2 fictional buildings, 6 units, 4 fictional tenants with agreements (one expiring soon), and a few maintenance items. <b>No payments are created</b> — record test payments yourself to try the workflow. Receipts for sample properties carry a SAMPLE watermark.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run('load_sample_data')} loading={busy === 'load_sample_data'}><Database className="h-4 w-4" />Load sample data</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Remove all sample data</Button>
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} danger title="Remove all sample data?" confirmLabel="Remove sample data" loading={busy === 'purge_sample_data'} onConfirm={() => run('purge_sample_data')}
        message="Permanently removes every [SAMPLE] property and everything recorded against it (units, agreements, test payments, receipts, maintenance). Real records are not touched." />
    </Card>
  )
}

function Account() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  async function change() {
    if (pw.length < 8) return toast.error('Use at least 8 characters')
    setBusy(true)
    try { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) throw error; toast.success('Password updated'); setPw('') } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Your account" />
      <div className="flex max-w-md flex-col gap-3 p-4"><Field label="New password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field><Button onClick={change} loading={busy} className="self-start">Change password</Button></div>
      <div className="m-4 mt-0 flex gap-3 rounded-md border border-line bg-paper p-3 text-xs text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
        <div>Security: all data is protected by Supabase Row Level Security. Payments, allocations and receipts can only be created through audited database functions; they cannot be edited or deleted — only voided by an Admin with a reason. Documents are in a private bucket and opened through 60-second signed links.</div></div>
    </Card>
  )
}

export default function Settings() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<'business' | 'users' | 'sample' | 'account'>('business')
  const tabs = [{ value: 'business' as const, label: 'Business details' }, ...(isAdmin ? [{ value: 'users' as const, label: 'Users' }, { value: 'sample' as const, label: 'Sample data' }] : []), { value: 'account' as const, label: 'Account & security' }]
  return (
    <>
      <PageHeader title="Settings" description={isAdmin ? 'Business configuration, users and permissions' : 'Only Admins can change system settings'} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'business' && <Business />}
      {tab === 'users' && isAdmin && <UsersTab />}
      {tab === 'sample' && isAdmin && <SampleData />}
      {tab === 'account' && <Account />}
    </>
  )
}
