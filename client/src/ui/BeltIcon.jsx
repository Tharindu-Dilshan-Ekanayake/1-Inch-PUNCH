import { memo, useId } from 'react'

import { beltFor } from '@shared/balance'

/**
 * A karate belt tied in a knot, as an inline SVG in the belt's colours (shared/balance.js
 * BELTS): the band across, the knot in the middle and its two tails, the trim stripe on
 * the tails' ends. Metal belts get a shine, the rainbow belt every colour.
 *
 * @param {{ rebirths: number, size?: string|number }} props
 */
export const BeltIcon = memo(function BeltIcon({ rebirths, size = 64 }) {
  const id = useId().replace(/:/g, '')
  const belt = beltFor(rebirths)
  const cloth = belt.rainbow ? `url(#bl-r-${id})` : belt.shine ? `url(#bl-s-${id})` : belt.color
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`bl-r-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ff3b5c" />
          <stop offset="0.2" stopColor="#ff9a1f" />
          <stop offset="0.4" stopColor="#ffe53b" />
          <stop offset="0.6" stopColor="#4ef05a" />
          <stop offset="0.8" stopColor="#2fc6ff" />
          <stop offset="1" stopColor="#b05cff" />
        </linearGradient>
        <linearGradient id={`bl-s-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor={belt.color} />
          <stop offset="1" stopColor={belt.trim} />
        </linearGradient>
      </defs>
      <g stroke="#111" strokeWidth="5" strokeLinejoin="round">
        {/* The band across. */}
        <rect x="4" y="30" width="92" height="20" rx="6" fill={cloth} />
        {/* The tails, hanging from the knot, with the trim at their ends. */}
        <path d="M46 46 L30 86 L42 90 L54 52 Z" fill={cloth} />
        <path d="M54 46 L72 84 L60 90 L46 52 Z" fill={cloth} />
        <path d="M33 79 L42 82 L40 90 L30 86 Z" fill={belt.trim} />
        <path d="M70 78 L72 84 L60 90 L62 81 Z" fill={belt.trim} />
        {/* The knot. */}
        <rect x="38" y="26" width="24" height="28" rx="7" fill={cloth} />
      </g>
      <rect x="10" y="33" width="80" height="4" rx="2" fill="#ffffff" opacity="0.4" />
      {belt.stars > 0 && (
        <text x="50" y="22" textAnchor="middle" fontSize="22" fill="#ffd21f" stroke="#111" strokeWidth="4" paintOrder="stroke" fontFamily="Fredoka One, sans-serif">
          ★{belt.stars}
        </text>
      )}
    </svg>
  )
})

export default BeltIcon
