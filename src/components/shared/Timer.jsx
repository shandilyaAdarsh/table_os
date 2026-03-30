/**
 * Timer — displays elapsed seconds as mm:ss with colour coding
 * Usage: <Timer seconds={240} />
 * Green < 5 min, Yellow 5–10 min, Red > 10 min
 */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getColour(seconds) {
  if (seconds < 300) return 'text-green-400'
  if (seconds < 600) return 'text-yellow-400'
  return 'text-red-400 animate-pulse'
}

export default function Timer({ seconds = 0, className = '' }) {
  const colour = getColour(seconds)
  return (
    <span className={`font-mono font-bold tabular-nums ${colour} ${className}`}>
      {formatTime(seconds)}
    </span>
  )
}
