export function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`
  if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `₹${value}`
}

export function formatCount(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`
  if (value >= 100000) return `${(value / 100000).toFixed(1).replace(/\.0$/, '')}L`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${value}`
}
