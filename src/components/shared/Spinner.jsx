/**
 * Spinner — loading indicator
 * Usage: <Spinner size="sm" /> or <Spinner size="lg" label="Loading orders…" />
 * Sizes: sm | md | lg
 */

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
}

export default function Spinner({ size = 'md', label, className = '' }) {
  const sizeClass = SIZES[size] ?? SIZES.md
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`} role="status" aria-label={label ?? 'Loading'}>
      <span
        className={`inline-block rounded-full border-slate-700 border-t-orange-400 animate-spin ${sizeClass}`}
      />
      {label && (
        <span className="text-slate-400 text-sm">{label}</span>
      )}
    </div>
  )
}
