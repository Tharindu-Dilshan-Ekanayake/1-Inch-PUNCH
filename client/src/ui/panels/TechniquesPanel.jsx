import { SECRET_PUNCHES } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/** No techniques landed yet (a stable object, so the selector doesn't re-render). */
const NONE = {}

/**
 * The technique book: the ten hidden techniques (shared/balance.js SECRET_PUNCHES), each
 * with its odds and the power it adds, and how many times you've landed it. One you
 * haven't landed yet shows only its odds: "???". Every punch rolls for them.
 */
export function TechniquesPanel() {
  const book = useGame((s) => s.profile.secretPunches || NONE)
  const openPanel = useGame((s) => s.openPanel)
  const found = SECRET_PUNCHES.filter((s) => book[s.id] > 0).length
  return (
    <Panel title="Techniques" icon="tire" width={900}>
      <p className="m-0 text-center" style={{ fontSize: u(38), marginBottom: u(14) }}>
        <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
          Found {found}/{SECRET_PUNCHES.length} - any punch can trigger one!
        </StrokeText>
      </p>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: u(14) }}>
        {SECRET_PUNCHES.map((s) => {
          const count = book[s.id] || 0
          const known = count > 0
          return (
            <div
              key={s.id}
              className="flex items-center justify-between"
              style={{
                minWidth: 0,
                gap: u(8),
                padding: `${u(8)} ${u(16)}`,
                borderRadius: u(18),
                border: `${u(5)} solid #111`,
                background: known ? `linear-gradient(180deg, ${s.glow} 0%, ${s.color} 100%)` : 'linear-gradient(180deg, #5a6176 0%, #2c3142 100%)',
                boxShadow: `inset 0 ${u(4)} 0 rgba(255,255,255,0.35)`,
              }}
            >
              <div className="flex flex-col" style={{ gap: u(2) }}>
                <span style={{ fontSize: u(36) }}>
                  <StrokeText stroke={u(8)}>{known ? s.name : '???'}</StrokeText>
                </span>
                <span style={{ fontSize: u(26) }}>
                  <StrokeText stroke={u(6)}>
                    1 in {formatNumber(s.chance)} · {known ? `x${s.power} POWER` : 'x? POWER'}
                  </StrokeText>
                </span>
              </div>
              <span style={{ fontSize: u(known ? 40 : 28) }}>
                <StrokeText stroke={u(7)} gradient={known ? GRADIENTS.gold : undefined}>
                  {known ? `x${formatNumber(count)}` : 'LOCKED'}
                </StrokeText>
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-center" style={{ marginTop: u(18) }}>
        <ChunkyButton onClick={() => openPanel('rebirth')} gradient={GRADIENTS.blueButton} radius={16} border={5} style={{ height: u(80), padding: `0 ${u(30)}` }}>
          <span style={{ fontSize: u(40) }}>
            <StrokeText stroke={u(8)}>Back to Belts</StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </Panel>
  )
}

export default TechniquesPanel
