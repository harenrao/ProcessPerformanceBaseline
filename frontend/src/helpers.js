// Keep in sync with USERS in backend/app/seed.py
export const DEMO = [
  { username: 'gt.admin', password: 'gt-admin', role: 'GT Admin', name: 'Harender Singh' },
  { username: 'gt.kalpana', password: 'gt-2026', role: 'GT Director', name: 'Kalpana Tikoo' },
  { username: 'gt.diksha', password: 'gt-2026', role: 'GT Consultant', name: 'Diksha Gupta' },
  { username: 'meridian.cio', password: 'client-2026', role: 'Client', name: 'Meridian Bank' },
  { username: 'acme.cto', password: 'client-2026', role: 'Client', name: 'Acme Industries' },
  { username: 'nordwind.it', password: 'client-2026', role: 'Client', name: 'Nordwind Logistics' },
]

export const isGT = (u) => u && u.role !== 'Client'
export const canApprove = (u) => u && (u.role === 'GT Admin' || u.role === 'GT Director')
export const canManageUsers = canApprove

export function fmt(v, digits = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (typeof v !== 'number') return String(v)
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (a >= 100) return Number.isInteger(v) ? String(v) : v.toFixed(1)
  if (a >= 1) return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return v.toPrecision(Math.min(digits, 3))
}

export const pct = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`)
export const fmtP = (p) => (p === null || p === undefined ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3))
export const date = (s) => (s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const datetime = (s) => (s ? new Date(s).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
export const initials = (n = '') => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export const RAG_LABEL = { green: 'Green', amber: 'Amber', red: 'Red', grey: 'Not run' }
export const STATUS = {
  draft: { cls: 'grey', label: 'Draft' },
  submitted: { cls: 'amber', label: 'In review' },
  approved: { cls: 'green', label: 'Approved' },
  superseded: { cls: 'grey', label: 'Superseded' },
}

export const RULES = {
  1: '1 point beyond 3σ',
  2: '9 points in a row on one side of the centre line',
  3: '6 points in a row steadily rising or falling',
  5: '2 of 3 points beyond 2σ on the same side',
  6: '4 of 5 points beyond 1σ on the same side',
}

// Categorical order (validated for CVD separation); never cycled.
export const SERIES = ['#3B5BA5', '#B5651D', '#6A3FA0', '#00897B', '#8A6208']
