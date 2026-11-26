import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, q } from './supabase'
import type { Property, VUnit, VTenant, VLease, BusinessSettings } from './types'

export function useProperties(includeArchived = false) {
  return useQuery({
    queryKey: ['properties', includeArchived],
    queryFn: async () => {
      let qb = supabase.from('properties').select('*').order('name')
      if (!includeArchived) qb = qb.is('archived_at', null)
      return q<Property[]>(qb)
    },
  })
}

export function useUnits(propertyId?: string) {
  return useQuery({
    queryKey: ['v_units', propertyId ?? 'all'],
    queryFn: async () => {
      let qb = supabase.from('v_units').select('*').is('archived_at', null).order('property_name').order('unit_number')
      if (propertyId) qb = qb.eq('property_id', propertyId)
      return q<VUnit[]>(qb)
    },
  })
}

export function useTenants() {
  return useQuery({ queryKey: ['v_tenants'], queryFn: () => q<VTenant[]>(supabase.from('v_tenants').select('*').order('full_name')) })
}

export function useActiveLeases() {
  return useQuery({
    queryKey: ['v_leases', 'payable'],
    queryFn: () => q<VLease[]>(supabase.from('v_leases').select('*').in('status', ['active', 'expired', 'terminated', 'renewed']).order('tenant_name')),
  })
}

export function useSettings() {
  return useQuery({ queryKey: ['business_settings'], queryFn: () => q<BusinessSettings>(supabase.from('business_settings').select('*').eq('id', 1).single()) })
}

/** Idempotent server-side generation of monthly rent rows; safe to call on every visit. */
export function useEnsureObligations() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['generate_obligations'],
    queryFn: async () => {
      const n = await q<number>(supabase.rpc('generate_rent_obligations'))
      if (n > 0) qc.invalidateQueries({ queryKey: ['v_obligations'] })
      return n
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** Invalidate everything that depends on money movement */
export function useInvalidateFinance() {
  const qc = useQueryClient()
  return () => Promise.all(['v_obligations', 'v_payments', 'receipts', 'dashboard', 'v_tenants', 'activity', 'v_leases', 'v_units', 'reports']
    .map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

/** Open a private document via a short-lived signed URL (never public). */
export async function openSignedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60, download ? { download } : undefined)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}
