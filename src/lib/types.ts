export type Role = 'admin' | 'manager'
export interface Profile { id: string; email: string; full_name: string | null; role: Role; is_active: boolean; created_at: string }

export interface Property {
  id: string; name: string; address: string; city: string | null; property_type: 'residential' | 'commercial' | 'mixed_use'
  total_floors: number | null; description: string | null; ownership_details: string | null; acquisition_date: string | null
  notes: string | null; cover_image_path: string | null; is_sample: boolean; archived_at: string | null; created_at: string
}

export interface Unit {
  id: string; property_id: string; unit_number: string; floor_number: number | null; carpet_area_sqft: number | null
  unit_type: string | null; availability: 'available' | 'under_maintenance' | 'not_for_rent'; monthly_rent: number
  security_deposit: number; notes: string | null; archived_at: string | null
}
export interface VUnit extends Unit {
  property_name: string; property_archived_at: string | null; current_lease_id: string | null; current_agreement_number: string | null
  current_tenant_id: string | null; current_tenant_name: string | null; current_lease_end: string | null
  occupancy: 'occupied' | 'vacant' | 'under_maintenance' | 'not_for_rent' | 'archived'
}

export interface Tenant {
  id: string; full_name: string; phone: string | null; email: string | null; emergency_contact_name: string | null
  emergency_contact_phone: string | null; id_proof_note: string | null; notes: string | null; is_sample: boolean; archived_at: string | null; created_at: string
}
export interface VTenant extends Tenant {
  current_lease_id: string | null; agreement_number: string | null; lease_start: string | null; lease_end: string | null
  monthly_rent: number | null; security_deposit: number | null; rent_due_day: number | null; lease_status: string | null
  property_id: string | null; property_name: string | null; unit_number: string | null; outstanding_due: number
}

export interface Lease {
  id: string; agreement_number: string; tenant_id: string; unit_id: string; property_id: string; start_date: string; end_date: string
  monthly_rent: number; security_deposit: number; rent_due_day: number; escalation_percent: number; escalation_interval_months: number
  escalation_terms: string | null; prorate_partial_months: boolean; status: 'draft' | 'active' | 'renewed' | 'terminated' | 'expired'
  allow_overlap: boolean; previous_lease_id: string | null; terminated_on: string | null; notes: string | null; is_sample: boolean; created_at: string
}
export interface VLease extends Lease {
  tenant_name: string; tenant_phone: string | null; property_name: string; unit_number: string; display_status: string
  days_to_expiry: number; expiry_alert: 'expired' | 'within_30' | 'within_60' | null; has_renewal: boolean
}

export type ObligationStatus = 'paid' | 'partially_paid' | 'pending' | 'overdue' | 'not_applicable'
export interface VObligation {
  id: string; lease_id: string; property_id: string; unit_id: string; tenant_id: string; period_month: string; period_start: string
  period_end: string; due_date: string; base_amount: number; adjustment: number; adjustment_reason: string | null
  not_applicable: boolean; na_reason: string | null; amount_due: number; amount_paid: number; outstanding: number
  status: ObligationStatus; is_partial: boolean; tenant_name: string; property_name: string; unit_number: string; agreement_number: string
}

export type PaymentMethod = 'bank_transfer' | 'upi' | 'cheque' | 'cash' | 'other'
export interface VPayment {
  id: string; lease_id: string; tenant_id: string; property_id: string; unit_id: string; payment_date: string; amount: number
  method: PaymentMethod; reference: string | null; notes: string | null; period_from: string | null; period_to: string | null
  voided_at: string | null; void_reason: string | null; created_at: string; tenant_name: string; property_name: string
  property_address: string; unit_number: string; agreement_number: string; allocated_amount: number; unallocated_amount: number
  receipted_amount: number; first_receipt_id: string | null
}

export interface ReceiptSnapshot {
  business: { legal_name: string; trade_name: string; address: string; phone: string | null; email: string | null; pan: string | null; gstin: string | null; signatory_name: string | null; footer: string | null }
  tenant: { name: string; phone: string | null }
  property: { name: string; address: string; city: string | null }
  unit: { number: string; floor: number | null }
  payment: { date: string; method: PaymentMethod; reference: string | null; total_amount: number; period_from: string | null; period_to: string | null }
  allocations: { period_month: string; period_start: string; period_end: string; amount: number; due: number }[]
  is_partial: boolean; is_advance: boolean; unallocated_credit: number; is_sample: boolean
}
export interface Receipt {
  id: string; receipt_number: string; payment_id: string; property_id: string; tenant_id: string; amount: number; issued_on: string
  snapshot: ReceiptSnapshot; cancelled_at: string | null; cancel_reason: string | null; created_at: string
}

export interface Maintenance {
  id: string; property_id: string; unit_id: string | null; tenant_id: string | null; title: string; description: string | null
  reported_on: string; assigned_to: string | null; estimated_cost: number | null; actual_cost: number | null
  payment_status: 'unpaid' | 'partially_paid' | 'paid'; status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'; completed_on: string | null; notes: string | null; created_at: string
  properties?: { name: string }; units?: { unit_number: string } | null
}
export interface Expense {
  id: string; property_id: string; unit_id: string | null; maintenance_request_id: string | null; category: string; description: string
  amount: number; expense_date: string; paid_to: string | null; payment_method: PaymentMethod | null; reference: string | null
  archived_at: string | null; properties?: { name: string }
}
export interface DocumentRow {
  id: string; name: string; category: string; storage_path: string; mime_type: string | null; size_bytes: number | null
  property_id: string | null; unit_id: string | null; tenant_id: string | null; lease_id: string | null; payment_id: string | null
  maintenance_request_id: string | null; notes: string | null; archived_at: string | null; created_at: string
  properties?: { name: string } | null; tenants?: { full_name: string } | null; leases?: { agreement_number: string } | null
}
export interface BusinessSettings {
  legal_name: string; trade_name: string; address: string; phone: string | null; email: string | null; pan: string | null
  gstin: string | null; receipt_prefix: string; receipt_footer: string | null; signatory_name: string | null
}
export interface Activity { id: number; occurred_at: string; action: string; entity_type: string; entity_id: string | null; summary: string | null }
