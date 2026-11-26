import { Badge } from './ui'

const OB: Record<string, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  paid: ['Paid', 'green'], partially_paid: ['Partially paid', 'amber'], pending: ['Pending', 'blue'],
  overdue: ['Overdue', 'red'], not_applicable: ['Not applicable', 'neutral'],
}
export const ObligationBadge = ({ status }: { status: string }) => { const [l, t] = OB[status] ?? [status, 'neutral']; return <Badge tone={t}>{l}</Badge> }

const OCC: Record<string, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue' | 'gold']> = {
  occupied: ['Occupied', 'green'], vacant: ['Vacant', 'gold'], under_maintenance: ['Under maintenance', 'amber'],
  not_for_rent: ['Not for rent', 'neutral'], archived: ['Archived', 'neutral'],
}
export const OccupancyBadge = ({ status }: { status: string }) => { const [l, t] = OCC[status] ?? [status, 'neutral']; return <Badge tone={t}>{l}</Badge> }

const LS: Record<string, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  active: ['Active', 'green'], expired: ['Expired', 'red'], renewed: ['Renewed', 'blue'], terminated: ['Terminated', 'neutral'], draft: ['Draft', 'neutral'],
}
export const LeaseBadge = ({ status }: { status: string }) => { const [l, t] = LS[status] ?? [status, 'neutral']; return <Badge tone={t}>{l}</Badge> }

export function ExpiryBadge({ alert, days }: { alert: string | null; days: number }) {
  if (alert === 'expired') return <Badge tone="red">Expired {Math.abs(days)}d ago</Badge>
  if (alert === 'within_30') return <Badge tone="red">Expires in {days}d</Badge>
  if (alert === 'within_60') return <Badge tone="amber">Expires in {days}d</Badge>
  return null
}

const MS: Record<string, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  open: ['Open', 'red'], in_progress: ['In progress', 'amber'], completed: ['Completed', 'green'], cancelled: ['Cancelled', 'neutral'],
}
export const MaintenanceBadge = ({ status }: { status: string }) => { const [l, t] = MS[status] ?? [status, 'neutral']; return <Badge tone={t}>{l}</Badge> }
