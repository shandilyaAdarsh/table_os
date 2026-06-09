/**
 * Badge — a small status pill
 * Usage: <Badge variant="pending" />
 * Variants: pending | cooking | ready | done | vacant | occupied | payment_pending | needs_bussing
 */

const VARIANT_STYLES = {
  pending:         'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  accepted:        'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  preparing:       'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  ready:           'bg-green-500/20 text-green-300 border border-green-500/40',
  done:            'bg-slate-500/20 text-slate-300 border border-slate-500/40',
  vacant:          'bg-slate-600/20 text-slate-400 border border-slate-600/40',
  occupied:        'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  payment_pending: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
  needs_bussing:   'bg-red-500/20 text-red-300 border border-red-500/40',
  hot:             'bg-red-600/20 text-red-300 border border-red-500/40',
  grill:           'bg-amber-600/20 text-amber-300 border border-amber-500/40',
  bread:           'bg-yellow-600/20 text-yellow-300 border border-yellow-500/40',
  bar:             'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
  fry:             'bg-lime-500/20 text-lime-300 border border-lime-500/40',
}

export default function Badge({ variant = 'pending', label, className = '' }) {
  const styles = VARIANT_STYLES[variant?.toLowerCase()] ?? VARIANT_STYLES.pending
  const displayLabel = label ?? variant?.replace('_', ' ').toUpperCase()
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${styles} ${className}`}
    >
      {displayLabel}
    </span>
  )
}
