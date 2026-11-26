import { supabase, q } from './supabase'
import { safeFileName } from '@/components/forms/common'

export const DOC_CATEGORIES: Record<string, string> = {
  rental_agreement: 'Rental agreement', rent_receipt: 'Rent receipt', property_document: 'Property document',
  tenant_document: 'Tenant document', maintenance_invoice: 'Maintenance invoice', property_photo: 'Property photo', other: 'Other',
}
export const MAX_UPLOAD_MB = 25

export interface DocLinks {
  property_id?: string | null; unit_id?: string | null; tenant_id?: string | null; lease_id?: string | null
  payment_id?: string | null; maintenance_request_id?: string | null
}

/** Uploads to the private bucket and records metadata. Path prefix = property id (drives storage RLS). */
export async function uploadDocument(file: File, meta: { name?: string; category: string; notes?: string | null } & DocLinks) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_UPLOAD_MB} MB`)
  const folder = meta.property_id || 'general'
  const path = `${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  const { name, category, notes, ...links } = meta
  return q(supabase.from('documents').insert({
    name: name?.trim() || file.name, category, notes: notes || null, storage_path: path, mime_type: file.type || null, size_bytes: file.size,
    ...Object.fromEntries(Object.entries(links).map(([k, v]) => [k, v || null])),
  }).select().single())
}
