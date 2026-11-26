import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Building2, Users, FileSignature, IndianRupee, ReceiptText, Wrench, FolderLock, BarChart3,
  KeyRound, ShieldCheck, Lock, History, Ban, Eye, Menu, X, Landmark, HardHat, Home, Check,
} from 'lucide-react'
import { Wordmark, Monogram } from '@/components/brand'
import { cn } from '@/components/ui'

const NAV = [
  { href: '#about', label: 'About' },
  { href: '#platform', label: 'Platform' },
  { href: '#how', label: 'How it works' },
  { href: '#security', label: 'Security' },
  { href: '#roadmap', label: 'Roadmap' },
]

const FEATURES = [
  { icon: Building2, title: 'Properties & units', text: 'Every building and every flat, shop or office, with carpet area, standard rent and live occupancy.' },
  { icon: Users, title: 'Tenant register', text: 'One record per tenant with contacts, agreements, payment history and documents. Archived, never deleted.' },
  { icon: FileSignature, title: 'Rental agreements', text: 'Terms, escalation and due dates, with alerts at 60 and 30 days before expiry. Renewals keep the full history.' },
  { icon: IndianRupee, title: 'Rent ledger', text: 'A rent entry for every month of every agreement. Partial, advance and multi-month payments are allocated automatically.' },
  { icon: ReceiptText, title: 'Rent receipts', text: 'Branded PDF receipts for the exact amount received, numbered per financial year. Download or print any time.' },
  { icon: Wrench, title: 'Maintenance', text: 'Requests, contractors, estimated and actual costs, photos and invoices, building by building.' },
  { icon: FolderLock, title: 'Document vault', text: 'Agreements, KYC, property papers and invoices in private storage, linked to the right property or tenant.' },
  { icon: BarChart3, title: 'Reports', text: 'Collection, arrears, occupancy, expiry and profitability reports, filterable and exportable to CSV.' },
]

const FLOW = [
  { n: '01', title: 'Agreement signed', text: 'Rent, deposit, due day and escalation are entered once.' },
  { n: '02', title: 'Rent scheduled', text: 'A rent entry is created for each month. Refreshing never duplicates it.' },
  { n: '03', title: 'Payment recorded', text: 'Only money actually received is entered, with its UPI, NEFT or cheque reference.' },
  { n: '04', title: 'Receipt issued', text: 'A numbered receipt is generated for that exact amount and the period it covers.' },
]

const SECURITY = [
  { icon: KeyRound, title: 'Role-based access', text: 'Admins see everything. Property managers see only the buildings assigned to them.' },
  { icon: ShieldCheck, title: 'Enforced in the database', text: 'Row-level security protects every record, not just the screens.' },
  { icon: Lock, title: 'Private documents', text: 'Files sit in a private store and open through links that expire in 60 seconds.' },
  { icon: Ban, title: 'No silent edits', text: 'Recorded payments and issued receipts cannot be altered. Voiding needs an admin and a reason.' },
  { icon: History, title: 'Full audit trail', text: 'Payments, receipts, adjustments and changes are logged with who did what, and when.' },
  { icon: Eye, title: 'Nothing assumed', text: 'Rent is never marked paid because it was expected. It has to be recorded.' },
]

const ROADMAP = [
  { phase: 'Phase 1', title: 'Foundation', items: ['Secure sign-in & roles', 'Properties & units', 'Dashboard'], live: true },
  { phase: 'Phase 2', title: 'Rental management', items: ['Tenants & agreements', 'Monthly rent ledger', 'Payments & arrears'], live: true },
  { phase: 'Phase 3', title: 'Receipts & documents', items: ['PDF rent receipts', 'Receipt history', 'Private document vault'], live: true },
  { phase: 'Phase 4', title: 'Operations', items: ['Maintenance & expenses', 'Reports & CSV export', 'Profitability view'], live: true },
  { phase: 'Phase 5', title: 'Redevelopment', items: ['Floor plans & inventory', 'Construction milestones', 'Budgets, bookings & sales'], live: false },
]

/** Stylised, data-free product preview (no figures, so nothing reads as real records). */
function ProductPreview() {
  const bars = [[62, 58], [70, 66], [66, 49], [74, 70], [72, 61], [78, 44]]
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-2xl bg-gold-500/10 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl">
        <div className="flex">
          <div className="hidden w-14 shrink-0 flex-col items-center gap-3 bg-navy-900 py-4 sm:flex">
            <Monogram className="h-7 w-7" />
            {[Home, Building2, Users, IndianRupee, ReceiptText, BarChart3].map((I, i) => (
              <I key={i} className={cn('h-4 w-4', i === 3 ? 'text-gold-400' : 'text-slate-500')} />
            ))}
          </div>
          <div className="flex-1 bg-paper p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-serif text-base text-navy-900">Dashboard</div>
              <div className="rounded-md bg-gold-500 px-2.5 py-1 text-[10px] font-medium text-white">+ Record payment</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {['Occupancy', 'Rent due', 'Collected', 'Arrears'].map((l, i) => (
                <div key={l} className="rounded-md border border-line bg-white p-2.5">
                  <div className="text-[9px] font-medium uppercase tracking-wider text-slate-500">{l}</div>
                  <div className={cn('mt-2 h-3 rounded', i === 2 ? 'w-3/4 bg-emerald-600/70' : i === 3 ? 'w-1/3 bg-red-700/60' : 'w-2/3 bg-navy-900/80')} />
                  <div className="mt-1.5 h-1.5 w-1/2 rounded bg-slate-200" />
                </div>
              ))}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-5">
              <div className="rounded-md border border-line bg-white p-3 sm:col-span-3">
                <div className="text-[10px] font-semibold text-navy-900">Expected vs collected</div>
                <div className="mt-3 flex h-24 items-end gap-2.5">
                  {bars.map(([e, c], i) => (
                    <div key={i} className="flex h-full flex-1 items-end gap-0.5">
                      <div className="flex-1 rounded-t-sm bg-slate-300" style={{ height: `${e}%` }} />
                      <div className="flex-1 rounded-t-sm bg-gold-500" style={{ height: `${c}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-line bg-white p-3 sm:col-span-2">
                <div className="text-[10px] font-semibold text-navy-900">Rent this month</div>
                {[['bg-emerald-50 text-emerald-800', 'Paid'], ['bg-amber-50 text-amber-800', 'Partial'], ['bg-sky-50 text-sky-800', 'Pending'], ['bg-red-50 text-red-800', 'Overdue']].map(([c, l]) => (
                  <div key={l} className="mt-2 flex items-center justify-between">
                    <div className="h-1.5 w-16 rounded bg-slate-200" />
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium', c)}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400">Illustrative preview. No real data shown.</p>
    </div>
  )
}

function SectionHeading({ eyebrow, title, text, light }: { eyebrow: string; title: string; text?: string; light?: boolean }) {
  return (
    <div className="max-w-2xl">
      <div className={cn('text-xs font-semibold uppercase tracking-[0.2em]', light ? 'text-gold-400' : 'text-gold-600')}>{eyebrow}</div>
      <h2 className={cn('mt-3 font-serif text-3xl leading-tight sm:text-4xl', light ? 'text-white' : 'text-navy-900')}>{title}</h2>
      {text && <p className={cn('mt-4 text-base leading-relaxed', light ? 'text-slate-300' : 'text-slate-600')}>{text}</p>}
    </div>
  )
}

export default function Landing() {
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    document.title = 'AM Infra — Real estate, managed with care'
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen scroll-smooth bg-paper text-navy-900">
      {/* Header */}
      <header className={cn('fixed inset-x-0 top-0 z-40 transition-colors', scrolled || menu ? 'border-b border-line bg-white/95 backdrop-blur' : 'bg-transparent')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" aria-label="AM Infra home"><Wordmark dark={!scrolled && !menu} /></a>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={cn('text-sm transition-colors', scrolled ? 'text-slate-600 hover:text-navy-900' : 'text-slate-300 hover:text-white')}>{n.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors',
              scrolled || menu ? 'bg-navy-900 text-white hover:bg-navy-800' : 'bg-white text-navy-900 hover:bg-gold-50')}>Sign in</Link>
            <button onClick={() => setMenu((m) => !m)} aria-label="Menu" className={cn('rounded p-2 md:hidden', scrolled || menu ? 'text-navy-900' : 'text-white')}>
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="border-t border-line bg-white px-4 py-2 md:hidden">
            {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="block py-2.5 text-sm text-navy-900">{n.label}</a>)}
          </nav>
        )}
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-navy-900 pb-20 pt-32 sm:pt-36">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden
          style={{ backgroundImage: 'linear-gradient(#CBA765 1px, transparent 1px), linear-gradient(90deg, #CBA765 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-400">
              <Landmark className="h-3.5 w-3.5" /> Family-owned real estate
            </div>
            <h1 className="mt-6 font-serif text-4xl leading-[1.08] text-white sm:text-5xl lg:text-[56px]">
              Real estate,<br />held and managed<br /><span className="text-gold-400">with care.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
              AM Infra owns and manages residential and commercial buildings. <span className="text-white">PropertyOS</span> is the platform we built to run them: every unit, tenant, agreement and rupee in one place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-gold-500 px-6 text-sm font-medium text-white transition-colors hover:bg-gold-600">
                Sign in to PropertyOS <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#platform" className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5">Explore the platform</a>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* About */}
      <section id="about" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <SectionHeading eyebrow="About AM Infra" title="A family business, run with discipline."
              text="We hold and look after buildings for the long term. That means fair dealings with tenants, well-kept properties and records that are always in order. As our portfolio moves towards redevelopment, we are building the systems to support that next chapter." />
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { icon: Building2, t: 'Ownership', d: 'Residential and commercial buildings, held for the long term.' },
                { icon: Users, t: 'Management', d: 'Tenants, agreements, upkeep and timely, documented rent collection.' },
                { icon: HardHat, t: 'Redevelopment', d: 'Preparing existing buildings for their next life, with tenants at the centre.' },
              ].map(({ icon: I, t, d }) => (
                <div key={t} className="flex gap-4 rounded-lg border border-line bg-white p-5 shadow-card sm:flex-col lg:flex-row">
                  <div className="h-10 w-10 shrink-0 rounded-md bg-gold-50 p-2.5 text-gold-600"><I className="h-5 w-5" /></div>
                  <div><div className="font-semibold">{t}</div><p className="mt-1 text-sm text-slate-600">{d}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Platform */}
      <section id="platform" className="scroll-mt-16 border-y border-line bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="AM Infra PropertyOS" title="Your properties. One platform."
            text="Our in-house system replaces registers, spreadsheets and scattered files. It works on a laptop at the office and on a phone at the building." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: I, title, text }) => (
              <div key={title} className="bg-white p-6">
                <I className="h-5 w-5 text-gold-600" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="How rent flows" title="From agreement to receipt, every rupee accounted for." />
          <ol className="mt-12 grid gap-4 md:grid-cols-4">
            {FLOW.map((s, i) => (
              <li key={s.n} className="relative rounded-lg border border-line bg-white p-6 shadow-card">
                <div className="font-serif text-3xl text-gold-500">{s.n}</div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
                {i < FLOW.length - 1 && <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-paper text-gold-500 md:block" aria-hidden />}
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-lg border border-gold-300/60 bg-gold-50/60 px-5 py-4 text-sm text-navy-900">
            Partial payments, advances and arrears are handled automatically. A payment can cover several months, and a month can be paid in parts.
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-16 bg-navy-900 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading light eyebrow="Security & integrity" title="Built for tenant data and financial records."
            text="PropertyOS holds personal details, agreements and payment history, so security is part of the design." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(({ icon: I, title, text }) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-6">
                <I className="h-5 w-5 text-gold-400" />
                <h3 className="mt-4 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="Roadmap" title="From rental management to full development."
            text="The rental platform is live. Next, the same system grows to cover redevelopment: floor plans, construction tracking, project finances and sales." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ROADMAP.map((r) => (
              <div key={r.phase} className={cn('rounded-lg border p-5', r.live ? 'border-line bg-white shadow-card' : 'border-dashed border-gold-400 bg-gold-50/40')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{r.phase}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', r.live ? 'bg-emerald-50 text-emerald-800' : 'bg-gold-100 text-gold-700')}>{r.live ? 'Live' : 'Planned'}</span>
                </div>
                <h3 className="mt-3 font-semibold">{r.title}</h3>
                <ul className="mt-3 space-y-1.5">
                  {r.items.map((it) => <li key={it} className="flex gap-2 text-sm text-slate-600"><Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', r.live ? 'text-emerald-600' : 'text-gold-500')} />{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl bg-navy-900 px-6 py-10 sm:flex-row sm:items-center sm:px-10">
          <div>
            <h2 className="font-serif text-2xl text-white sm:text-3xl">For the AM Infra team</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-400">PropertyOS is a private system. Accounts are approved by an administrator, and each person sees only the properties assigned to them.</p>
          </div>
          <Link to="/login" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-gold-500 px-6 text-sm font-medium text-white transition-colors hover:bg-gold-600">
            Sign in <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark dark={false} />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV.map((n) => <a key={n.href} href={n.href} className="hover:text-navy-900">{n.label}</a>)}
            <Link to="/login" className="hover:text-navy-900">Sign in</Link>
          </div>
          <div>© {year} AM Infra. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
