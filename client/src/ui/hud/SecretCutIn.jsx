import { useEffect } from 'react'

import { SECRET_HOLD, SECRET_PUNCHES } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

/**
 * A hidden technique's cut-in (balance SECRET_PUNCHES), played while the punch holds its
 * wind-up (SECRET_HOLD): the screen dims a little at the edges, a band in the
 * technique's colours sweeps in across the middle, and HIDDEN TECHNIQUE! slams in over
 * its name on the band, its odds ("1 in 400") and the power it adds under it. All CSS
 * animation (index.css .pp-secret-*), mounted for the cut-in only - a rare moment, so
 * React state is fine here.
 */
export function SecretCutIn() {
  const shown = useGame((s) => s.secretCutIn)
  const showSecret = useGame((s) => s.showSecret)

  // Taken down once its moment is over.
  useEffect(() => {
    if (!shown) return undefined
    const id = setTimeout(() => showSecret(null), SECRET_HOLD * 1000 + 250)
    return () => clearTimeout(id)
  }, [shown, showSecret])

  const technique = shown ? SECRET_PUNCHES.find((s) => s.id === shown.id) : null
  if (!technique) return null
  const gradient = `linear-gradient(180deg, #ffffff 0%, ${technique.glow} 38%, ${technique.color} 100%)`
  return (
    <div key={shown.at} className="pp-secret pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="pp-secret-dim absolute inset-0" />
      <div className="pp-secret-band absolute" style={{ '--c1': technique.glow, '--c2': technique.color }}>
        <div className="pp-secret-shine absolute" />
      </div>
      <div className="pp-secret-flash absolute inset-0" />
      <div className="pp-secret-stack absolute left-1/2 flex flex-col items-center" style={{ top: '27%' }}>
        <span className="pp-secret-kicker" style={{ fontSize: u(50) }}>
          <StrokeText stroke={u(10)} gradient="linear-gradient(180deg, #fff6a3 0%, #ffcb1f 55%, #ff7a0a 100%)">
            HIDDEN TECHNIQUE!
          </StrokeText>
        </span>
        <span className="pp-secret-name" style={{ fontSize: u(124), lineHeight: 1.1 }}>
          <StrokeText stroke={u(18)} gradient={gradient}>
            {technique.name.toUpperCase()}
          </StrokeText>
        </span>
        <div className="flex items-center" style={{ gap: u(26), marginTop: u(26) }}>
          <span className="pp-secret-badge pp-secret-badge-1" style={{ fontSize: u(50) }}>
            <StrokeText stroke={u(10)}>1 in {formatNumber(technique.chance)}</StrokeText>
          </span>
          <span className="pp-secret-badge pp-secret-badge-2" style={{ fontSize: u(50) }}>
            <StrokeText stroke={u(10)} gradient="linear-gradient(180deg, #d9ff9a 0%, #5fe83a 55%, #1fb52a 100%)">
              x{technique.power} POWER
            </StrokeText>
          </span>
        </div>
      </div>
    </div>
  )
}

export default SecretCutIn
