import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { LoadingBlock } from './components/ui'
import { useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { useEnsureObligations } from './lib/data'
import Login from './pages/Login'
import Landing from './pages/Landing'
import { SetupRequired, PendingApproval } from './pages/Gate'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import Units from './pages/Units'
import Tenants from './pages/Tenants'
import TenantDetail from './pages/TenantDetail'
import Agreements from './pages/Agreements'
import Rent from './pages/Rent'
import Receipts from './pages/Receipts'
import Maintenance from './pages/Maintenance'
import Documents from './pages/Documents'
import Reports from './pages/Reports'
import Redevelopment from './pages/Redevelopment'
import Settings from './pages/Settings'

function Authed() {
  useEnsureObligations()
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="units" element={<Units />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="agreements" element={<Agreements />} />
        <Route path="rent" element={<Rent />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="documents" element={<Documents />} />
        <Route path="reports" element={<Reports />} />
        <Route path="redevelopment" element={<Redevelopment />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  const { session, profile, loading } = useAuth()
  if (isConfigured && loading) return <div className="min-h-screen bg-paper"><LoadingBlock /></div>
  // Public (logged-out) routes: landing page at "/", login at "/login"
  if (!isConfigured || !session) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={isConfigured ? <Login /> : <SetupRequired />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  if (!profile) return <div className="min-h-screen bg-paper"><LoadingBlock label="Loading your profile…" /></div>
  if (!profile.is_active) return <PendingApproval />
  return <Authed />
}
