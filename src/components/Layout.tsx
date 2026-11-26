import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, DoorOpen, Users, FileSignature, IndianRupee, ReceiptText, Wrench, FolderLock,
  BarChart3, HardHat, Settings, ChevronsLeft, ChevronsRight, Menu, LogOut, X,
} from 'lucide-react'
import { Wordmark } from './brand'
import { cn } from './ui'
import { useAuth } from '@/lib/auth'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/properties', label: 'Properties', icon: Building2 },
  { to: '/units', label: 'Units', icon: DoorOpen },
  { to: '/tenants', label: 'Tenants', icon: Users },
  { to: '/agreements', label: 'Agreements', icon: FileSignature },
  { to: '/rent', label: 'Rent & Payments', icon: IndianRupee },
  { to: '/receipts', label: 'Receipts', icon: ReceiptText },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/documents', label: 'Documents', icon: FolderLock },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/redevelopment', label: 'Redevelopment', icon: HardHat },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function readCollapsed() { try { return localStorage.getItem('ami.sidebar') === '1' } catch { return false } }

export default function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const loc = useLocation()
  useEffect(() => setMobileOpen(false), [loc.pathname])
  useEffect(() => { try { localStorage.setItem('ami.sidebar', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])

  const sidebar = (isMobile: boolean) => (
    <div className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
        <Wordmark collapsed={collapsed && !isMobile} />
        {isMobile && <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-1 text-slate-400"><X className="h-5 w-5" /></button>}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined}
            className={({ isActive }) => cn('group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-white/[0.07] text-white shadow-[inset_2px_0_0_#CBA765]' : 'hover:bg-white/[0.04] hover:text-white',
              collapsed && !isMobile && 'justify-center px-0')}>
            {({ isActive }) => <><Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-gold-400' : 'text-slate-400 group-hover:text-slate-200')} />
              {(!collapsed || isMobile) && <span className="truncate">{label}</span>}</>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/5 p-2">
        {(!collapsed || isMobile) && profile && (
          <div className="px-3 py-2">
            <div className="truncate text-sm text-white">{profile.full_name || profile.email}</div>
            <div className="text-[11px] uppercase tracking-wider text-gold-400">{profile.role === 'admin' ? 'Admin' : 'Property Manager'}</div>
          </div>
        )}
        <button onClick={signOut} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/[0.04] hover:text-white', collapsed && !isMobile && 'justify-center px-0')}>
          <LogOut className="h-[18px] w-[18px]" />{(!collapsed || isMobile) && 'Sign out'}
        </button>
        {!isMobile && (
          <button onClick={() => setCollapsed((c) => !c)} className={cn('mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs text-slate-500 hover:text-slate-300', collapsed && 'justify-center px-0')}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-paper">
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block', collapsed ? 'w-[68px]' : 'w-60')}>{sidebar(false)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar(true)}</aside>
        </div>
      )}
      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-60')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded p-1 text-navy-900"><Menu className="h-5 w-5" /></button>
          <Wordmark dark={false} />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><Outlet /></main>
      </div>
    </div>
  )
}
