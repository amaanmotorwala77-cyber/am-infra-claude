// INR, Indian numbering, Asia/Kolkata dates.
export const TZ = 'Asia/Kolkata'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('en-IN')

export const toNum = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v))
export const formatINR = (v: unknown, decimals = false) => (decimals ? inr2 : inr).format(toNum(v))
export const formatNumber = (v: unknown) => num.format(toNum(v))

/** Compact Indian notation for summary tiles: ₹4.2 L, ₹1.3 Cr */
export function formatINRCompact(v: unknown) {
  const n = toNum(v)
  const a = Math.abs(n)
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`
  return formatINR(n)
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function parseDate(d: string | Date) {
  if (d instanceof Date) return d
  // date-only strings are treated as calendar dates (no TZ shift)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day, 6, 30)) }
  return new Date(d)
}

export function formatDate(d?: string | Date | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(parseDate(d))
}
export function formatDateTime(d?: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parseDate(d))
}
export function formatMonth(d?: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, month: 'short', year: 'numeric' }).format(parseDate(d))
}
export function formatPeriod(from?: string | null, to?: string | null) {
  if (!from) return '—'
  const a = formatMonth(from), b = formatMonth(to ?? from)
  const fullFrom = from.endsWith('-01'), fullTo = !!to && to === monthEnd(to)
  if (fullFrom && fullTo) return a === b ? a : `${a} – ${b}`
  return `${formatDate(from)} – ${formatDate(to)}`
}

export const monthStart = (d: string) => d.slice(0, 7) + '-01'
export function monthEnd(d: string) {
  const [y, m] = d.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${d.slice(0, 7)}-${String(last).padStart(2, '0')}`
}
export function addMonths(d: string, n: number) {
  const [y, m] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// ---------- Amount in words (Indian system) ----------
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function two(n: number) { return n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}` }
function three(n: number) {
  const h = Math.floor(n / 100), r = n % 100
  return [h ? `${ones[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' ')
}
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  if (rupees === 0 && paise === 0) return 'Rupees Zero Only'
  const parts: string[] = []
  let n = rupees
  const crore = Math.floor(n / 1e7); n %= 1e7
  const lakh = Math.floor(n / 1e5); n %= 1e5
  const thousand = Math.floor(n / 1e3); n %= 1e3
  if (crore) parts.push(`${crore >= 100 ? amountInWords(crore).replace(/^Rupees | Only$/g, '') : two(crore)} Crore`)
  if (lakh) parts.push(`${two(lakh)} Lakh`)
  if (thousand) parts.push(`${two(thousand)} Thousand`)
  if (n) parts.push(three(n))
  let s = `Rupees ${parts.join(' ') || 'Zero'}`
  if (paise) s += ` and ${two(paise)} Paise`
  return s + ' Only'
}

export const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash', other: 'Other',
}
export const PROPERTY_TYPE_LABEL: Record<string, string> = { residential: 'Residential', commercial: 'Commercial', mixed_use: 'Mixed-use' }
