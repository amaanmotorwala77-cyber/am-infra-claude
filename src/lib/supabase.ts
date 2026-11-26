import { createClient, type PostgrestError } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = !!url && !!anonKey && !url.includes('YOUR-PROJECT')

// Only the public anon key is ever used in the browser. Row Level Security protects all data.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export const DOCS_BUCKET = 'documents'

const FRIENDLY: [RegExp, string][] = [
  [/DUPLICATE_PAYMENT:\s*(.*)/, '$1. Tick "This is a separate payment" if it really is a second payment.'],
  [/DUPLICATE_REFERENCE:\s*(.*)/, '$1.'],
  [/ALREADY_RECEIPTED:\s*(.*)/, '$1.'],
  [/leases_no_overlap/, 'This unit already has an active agreement for overlapping dates.'],
  [/units_property_number_uniq/, 'A unit with this number already exists in this property.'],
  [/row-level security/i, 'You do not have permission to do this.'],
  [/permission denied/i, 'You do not have permission to do this.'],
  [/JWT expired/i, 'Your session expired. Please sign in again.'],
]

export function friendlyError(e: unknown): string {
  const msg = (e as PostgrestError)?.message || (e as Error)?.message || String(e)
  for (const [re, out] of FRIENDLY) { const m = msg.match(re); if (m) return m[0].replace(re, out) }
  return msg
}

/** Unwraps a Supabase response, throwing on error */
export async function q<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}
