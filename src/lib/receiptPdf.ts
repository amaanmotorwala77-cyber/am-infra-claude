import { jsPDF } from 'jspdf'
import type { Receipt } from './types'
import { amountInWords, formatDate, formatPeriod, METHOD_LABEL } from './format'

// jsPDF's built-in fonts have no ₹ glyph, so PDFs use "Rs."
const rs = (n: number) => 'Rs. ' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const NAVY: [number, number, number] = [15, 27, 45]
const GOLD: [number, number, number] = [184, 145, 90]
const GREY: [number, number, number] = [100, 110, 125]

function monogram(doc: jsPDF, x: number, y: number, s: number) {
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.5)
  doc.roundedRect(x, y, s, s, 1.6, 1.6)
  doc.setLineWidth(0.9)
  const k = s / 64
  doc.lines([[10 * k, -28 * k], [10 * k, 28 * k]], x + 12 * k, y + 46 * k)
  doc.line(x + 16 * k, y + 36 * k, x + 28 * k, y + 36 * k)
  doc.lines([[0, -28 * k], [9 * k, 16 * k], [9 * k, -16 * k], [0, 28 * k]], x + 34 * k, y + 46 * k)
}

export function buildReceiptPdf(r: Receipt): jsPDF {
  const s = r.snapshot
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16
  let y = 16

  // Header band
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F')
  monogram(doc, M, 8, 18)
  doc.setTextColor(255, 255, 255); doc.setFont('times', 'normal'); doc.setFontSize(20)
  doc.text('AM', M + 23, 18); doc.setTextColor(...GOLD); doc.text('Infra', M + 35, 18)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(190, 196, 206)
  doc.text('YOUR PROPERTIES. ONE PLATFORM.', M + 23, 23.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255)
  doc.text('RENT RECEIPT', W - M, 17, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GOLD)
  doc.text(r.receipt_number, W - M, 23.5, { align: 'right' })

  y = 44
  // Landlord block
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
  doc.text(s.business.legal_name, M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY)
  const addr = doc.splitTextToSize(s.business.address, 100) as string[]
  doc.text(addr, M, y + 5)
  let ly = y + 5 + addr.length * 4
  const contact = [s.business.phone && `Ph: ${s.business.phone}`, s.business.email, s.business.pan && `PAN: ${s.business.pan}`, s.business.gstin && `GSTIN: ${s.business.gstin}`].filter(Boolean).join('  ·  ')
  if (contact) { doc.text(contact, M, ly); ly += 4 }

  // Right meta
  const meta: [string, string][] = [['Receipt date', formatDate(r.issued_on)], ['Payment date', formatDate(s.payment.date)], ['Payment mode', METHOD_LABEL[s.payment.method] ?? s.payment.method]]
  if (s.payment.reference) meta.push(['Reference', s.payment.reference])
  meta.forEach(([k, v], i) => {
    doc.setTextColor(...GREY); doc.setFontSize(8); doc.text(k, 135, y + i * 5.5)
    doc.setTextColor(...NAVY); doc.setFontSize(9); doc.text(v, W - M, y + i * 5.5, { align: 'right' })
  })
  y = Math.max(ly, y + meta.length * 5.5) + 6
  doc.setDrawColor(231, 226, 216); doc.setLineWidth(0.3); doc.line(M, y, W - M, y)
  y += 9

  // Body sentence
  doc.setTextColor(...NAVY); doc.setFontSize(10)
  const period = formatPeriod(s.payment.period_from, s.payment.period_to)
  const sentence = `Received with thanks from ${s.tenant.name} the sum of ${rs(r.amount)} (${amountInWords(r.amount)}) towards rent for ` +
    `Unit ${s.unit.number}${s.unit.floor !== null && s.unit.floor !== undefined ? ` (Floor ${s.unit.floor})` : ''}, ${s.property.name}, ${s.property.address}${s.property.city ? ', ' + s.property.city : ''}` +
    ` for the period ${period}.`
  const lines = doc.splitTextToSize(sentence, W - 2 * M) as string[]
  doc.text(lines, M, y, { lineHeightFactor: 1.5 })
  y += lines.length * 5.6 + 6

  // Detail table
  const rows: [string, string][] = [
    ['Tenant', s.tenant.name], ['Property', s.property.name], ['Unit', s.unit.number], ['Rent period', period],
    ['Amount received', rs(r.amount)], ['Amount in words', amountInWords(r.amount)],
  ]
  if (r.amount < s.payment.total_amount) rows.push(['Note', `Part receipt of a payment of ${rs(s.payment.total_amount)}`])
  rows.forEach(([k, v], i) => {
    const rowY = y + i * 8
    if (i % 2 === 0) { doc.setFillColor(250, 248, 244); doc.rect(M, rowY - 5.2, W - 2 * M, 8, 'F') }
    doc.setFontSize(8.5); doc.setTextColor(...GREY); doc.text(k.toUpperCase(), M + 3, rowY)
    doc.setFontSize(9.5); doc.setTextColor(...NAVY)
    doc.setFont('helvetica', k === 'Amount received' ? 'bold' : 'normal')
    doc.text(doc.splitTextToSize(v, 115) as string[], M + 55, rowY)
    doc.setFont('helvetica', 'normal')
  })
  y += rows.length * 8 + 4

  // Allocation breakdown
  if (s.allocations?.length) {
    doc.setFontSize(8); doc.setTextColor(...GREY); doc.text('ALLOCATION OF THIS PAYMENT', M, y); y += 5
    s.allocations.forEach((a) => {
      const label = formatPeriod(a.period_start, a.period_end)
      const tag = a.amount < a.due ? `  (part of ${rs(a.due)})` : ''
      doc.setTextColor(...NAVY); doc.setFontSize(9)
      doc.text(label + tag, M + 3, y); doc.text(rs(a.amount), W - M - 3, y, { align: 'right' }); y += 5
    })
    if (s.unallocated_credit > 0) { doc.setTextColor(...GREY); doc.text('Held as advance credit', M + 3, y); doc.text(rs(s.unallocated_credit), W - M - 3, y, { align: 'right' }); y += 5 }
    y += 2
  }
  const flags = [s.is_partial && 'Partial payment — balance rent remains outstanding.', s.is_advance && `Advance payment covering ${period}.`].filter(Boolean) as string[]
  if (flags.length) { doc.setFontSize(8.5); doc.setTextColor(...GOLD); flags.forEach((f) => { doc.text(f, M, y); y += 4.5 }) }

  // Signature
  y = Math.max(y + 14, 205)
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.line(W - M - 62, y, W - M, y)
  doc.setFontSize(8.5); doc.setTextColor(...NAVY)
  doc.text(`For ${s.business.legal_name}`, W - M, y - 18, { align: 'right' })
  doc.text(s.business.signatory_name || 'Authorised Signatory', W - M, y + 4.5, { align: 'right' })
  doc.setTextColor(...GREY); doc.setFontSize(7.5); doc.text('Authorised signatory', W - M, y + 8.5, { align: 'right' })
  doc.text('Received by (tenant acknowledgement)', M, y + 4.5); doc.line(M, y, M + 62, y)

  // Footer
  doc.setFontSize(7.5); doc.setTextColor(...GREY)
  if (s.business.footer) doc.text(s.business.footer, W / 2, 280, { align: 'center' })
  doc.text(`${s.business.trade_name} · AM Infra PropertyOS · ${r.receipt_number}`, W / 2, 285, { align: 'center' })

  // Watermarks
  const mark = r.cancelled_at ? 'CANCELLED' : s.is_sample ? 'SAMPLE' : null
  if (mark) {
    doc.saveGraphicsState()
    // @ts-expect-error GState exists at runtime
    doc.setGState(new doc.GState({ opacity: 0.12 }))
    doc.setFontSize(80); doc.setTextColor(200, 30, 30); doc.setFont('helvetica', 'bold')
    doc.text(mark, W / 2, 160, { align: 'center', angle: 30 })
    doc.restoreGraphicsState()
  }
  return doc
}

export const downloadReceipt = (r: Receipt) => buildReceiptPdf(r).save(`${r.receipt_number.replace(/\//g, '-')}.pdf`)
export function printReceipt(r: Receipt) {
  const doc = buildReceiptPdf(r); doc.autoPrint()
  const url = doc.output('bloburl'); window.open(url as unknown as string, '_blank')
}
