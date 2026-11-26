// shadcn/ui-style primitives (hand-rolled on Radix + Tailwind, same API conventions)
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Loader2, X, Search, AlertTriangle } from 'lucide-react'

export const cn = (...c: ClassValue[]) => twMerge(clsx(c))

// ---------- Button ----------
type BtnVariant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger' | 'link'
const btnBase = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap'
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800',
  gold: 'bg-gold-500 text-white hover:bg-gold-600',
  outline: 'border border-line bg-white text-navy-900 hover:bg-paper',
  ghost: 'text-navy-800 hover:bg-navy-900/5',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  link: 'text-gold-700 underline-offset-2 hover:underline px-0 h-auto',
}
const btnSizes = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4', lg: 'h-11 px-5', icon: 'h-9 w-9' }
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant; size?: keyof typeof btnSizes; loading?: boolean
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button ref={ref} className={cn(btnBase, btnVariants[variant], variant !== 'link' && btnSizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  ))
Button.displayName = 'Button'

// ---------- Inputs ----------
const fieldCls = 'w-full rounded-md border border-line bg-white px-3 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 disabled:bg-slate-50 disabled:text-slate-500'
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(fieldCls, 'h-9', className)} {...p} />)
Input.displayName = 'Input'
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} rows={3} className={cn(fieldCls, 'py-2', className)} {...p} />)
Textarea.displayName = 'Textarea'
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => <select ref={ref} className={cn(fieldCls, 'h-9 pr-8', className)} {...p}>{children}</select>)
Select.displayName = 'Select'

export function Field({ label, error, hint, required, children, className }: {
  label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}{required && <span className="text-gold-600"> *</span>}</span>
      {children}
      {error ? <span className="block text-xs text-red-700">{error}</span> : hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-navy-900">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-gold-600" />
      <span>{label}</span>
    </label>
  )
}

// ---------- Layout bits ----------
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-white shadow-card', className)} {...p} />
}
export function CardHeader({ title, action, subtitle }: { title: React.ReactNode; action?: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div><h3 className="text-sm font-semibold text-navy-900">{title}</h3>{subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}</div>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-2xl text-navy-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const badgeTones = {
  neutral: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200', blue: 'bg-sky-50 text-sky-800 ring-sky-200', gold: 'bg-gold-50 text-gold-700 ring-gold-300', navy: 'bg-navy-900 text-white',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTones; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-transparent', badgeTones[tone], className)}>{children}</span>
}
export const SampleBadge = () => <Badge tone="gold">Sample</Badge>

export function StatCard({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; tone?: 'gold' | 'red' | 'green' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
        {icon && <span className={cn('text-slate-400', tone === 'gold' && 'text-gold-500', tone === 'red' && 'text-red-600', tone === 'green' && 'text-emerald-600')}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-navy-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}

// ---------- Tables ----------
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-x-auto', className)}><table className="w-full min-w-[640px] text-sm">{children}</table></div>
}
export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="border-b border-line bg-paper/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</thead>
)
export const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => <th className={cn('px-4 py-2.5 font-semibold', className)}>{children}</th>
export const Td = ({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cn('px-4 py-3 align-middle text-navy-900', className)}>{children}</td>
export const Tr = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <tr onClick={onClick} className={cn('border-b border-line/70 last:border-0', onClick && 'cursor-pointer hover:bg-paper', className)}>{children}</tr>
)

// ---------- Feedback ----------
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn('h-5 w-5 animate-spin text-gold-500', className)} /> }
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Spinner />{label}</div>
}
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = (error as Error)?.message ?? String(error)
  return (
    <div className="m-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">Couldn’t load data: {msg}</div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  )
}
export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-gold-50 p-3 text-gold-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------- Dialog ----------
export function Modal({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-xl focus:outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}>
          <div className="flex items-start justify-between border-b border-line px-5 py-4">
            <div>
              <DialogPrimitive.Title className="font-serif text-lg text-navy-900">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-xs text-slate-500">{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function ConfirmDialog({ open, onOpenChange, title, message, confirmLabel = 'Confirm', danger, onConfirm, requireReason, loading }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean
  onConfirm: (reason: string) => void; requireReason?: boolean; loading?: boolean
}) {
  const [reason, setReason] = React.useState('')
  React.useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}
      footer={<>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={requireReason && !reason.trim()} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </>}>
      <div className="space-y-3 text-sm text-slate-700">
        <div>{message}</div>
        {requireReason && <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit log" /></Field>}
      </div>
    </Modal>
  )
}

// ---------- Tabs ----------
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value ? 'border-gold-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800')}>{t.label}</button>
      ))}
    </div>
  )
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
}
