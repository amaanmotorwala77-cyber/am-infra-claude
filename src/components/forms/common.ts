import { z } from 'zod'

export type Errors = Record<string, string>

export function validate<T>(schema: z.ZodType<T>, values: unknown): { data?: T; errors: Errors } {
  const r = schema.safeParse(values)
  if (r.success) return { data: r.data, errors: {} }
  const errors: Errors = {}
  for (const i of r.error.issues) { const k = String(i.path[0] ?? '_'); if (!errors[k]) errors[k] = i.message }
  return { errors }
}

export const req = (label: string) => z.string().trim().min(1, `${label} is required`)
export const optStr = z.string().trim().optional().transform((v) => (v ? v : null))
export const optNum = z.union([z.string(), z.number()]).optional().transform((v, ctx) => {
  if (v === undefined || v === '' || v === null) return null
  const n = Number(v)
  if (Number.isNaN(n)) { ctx.addIssue({ code: 'custom', message: 'Must be a number' }); return z.NEVER }
  if (n < 0) { ctx.addIssue({ code: 'custom', message: 'Cannot be negative' }); return z.NEVER }
  return n
})
export const money = (label: string, min = 0) => z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = Number(v)
  if (v === '' || Number.isNaN(n)) { ctx.addIssue({ code: 'custom', message: `${label} is required` }); return z.NEVER }
  if (n < min || (min > 0 && n === 0)) { ctx.addIssue({ code: 'custom', message: `${label} must be ${min > 0 ? 'greater than 0' : 'zero or more'}` }); return z.NEVER }
  return Math.round(n * 100) / 100
})
export const dateStr = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`)
export const optDate = z.string().optional().transform((v) => (v ? v : null))

/** Turn nullable DB row into string form values */
export function toForm<T extends object>(row: T | null | undefined, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys) { const v = row ? (row as Record<string, unknown>)[k] : undefined; out[k] = v === null || v === undefined ? '' : String(v) }
  return out
}

export function safeFileName(n: string) { return n.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) }
