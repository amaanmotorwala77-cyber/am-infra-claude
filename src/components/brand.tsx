import { cn } from './ui'

export function Monogram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9', className)} aria-label="AM Infra">
      <rect x="1.5" y="1.5" width="61" height="61" rx="10" fill="none" stroke="#CBA765" strokeWidth="2" />
      <path d="M12 46 L22 18 L32 46 M16 36 H28" stroke="#CBA765" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M34 46 V18 L43 34 L52 18 V46" stroke="#CBA765" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ collapsed, dark = true }: { collapsed?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Monogram />
      {!collapsed && (
        <div className="leading-tight">
          <div className={cn('font-serif text-lg tracking-wide', dark ? 'text-white' : 'text-navy-900')}>AM <span className="text-gold-400">Infra</span></div>
          <div className={cn('text-[10px] uppercase tracking-[0.2em]', dark ? 'text-slate-400' : 'text-slate-500')}>PropertyOS</div>
        </div>
      )}
    </div>
  )
}
