import { beltFor, levelCap, nextRebirthGift, rebirthMultiplier, SECRET_PUNCHES } from '@shared/balance'
import { formatMultiplier } from '@shared/format'
import { isMaxLevel, rebirthProgress, rebirthSkipPrice } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame, useGame } from '../../store/game'
import BeltIcon from '../BeltIcon'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const CARD_GRADIENTS = {
  after: 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)',
  level: 'linear-gradient(180deg, #ffe25a 0%, #ffb21e 55%, #f08a0a 100%)',
}
const PURPLE = 'linear-gradient(180deg, #ffd6ff 0%, #e27bff 50%, #a93cf0 100%)'
const LEVEL_FILL = 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)'

/**
 * One stat before and after the exam as a single pill: "x3 Power >> x4 Power" - the left
 * value plain, the right one (what the exam earns) bright with a glow.
 */
function StatRow({ kind, from, to }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{
        height: u(70),
        gap: u(14),
        borderRadius: u(18),
        background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))',
        border: `${u(4)} solid #0b0c0e`,
        boxShadow: `inset 0 ${u(3)} 0 rgba(255,255,255,0.1)`,
      }}
    >
      <span style={{ fontSize: u(32), opacity: 0.9 }}>
        <StrokeText stroke={u(7)}>{from}</StrokeText>
      </span>
      <Icon name="fastForward" size={u(38)} />
      <span
        className="flex items-center justify-center"
        style={{
          height: u(52),
          padding: `0 ${u(16)}`,
          borderRadius: u(14),
          background: CARD_GRADIENTS[kind],
          border: `${u(4)} solid #111`,
          boxShadow: `inset 0 ${u(4)} 0 rgba(255,255,255,0.45), 0 0 ${u(18)} rgba(120,255,140,0.35)`,
          fontSize: u(34),
        }}
      >
        <StrokeText stroke={u(7)}>{to}</StrokeText>
      </span>
    </div>
  )
}

/**
 * A belt and its name: the one you wear, or (`next`) the one the exam earns, in a soft
 * card - the next one glowing gold.
 */
function BeltCard({ rebirths, next = false }) {
  const belt = beltFor(rebirths)
  const gradient = belt.rainbow ? GRADIENTS.rainbow : `linear-gradient(180deg, #ffffff 0%, ${belt.color} 45%, ${belt.trim} 100%)`
  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        gap: u(2),
        padding: `${u(8)} ${u(10)} ${u(10)}`,
        borderRadius: u(20),
        background: next
          ? 'radial-gradient(ellipse at 50% 38%, rgba(255,214,90,0.32), rgba(255,214,90,0.04) 70%)'
          : 'radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 70%)',
        border: `${u(4)} solid ${next ? 'rgba(255,214,90,0.55)' : 'rgba(255,255,255,0.12)'}`,
      }}
    >
      <span style={{ fontSize: u(30), opacity: 0.92 }}>
        <StrokeText stroke={u(6)}>{next ? 'Next Belt' : 'Your Belt'}</StrokeText>
      </span>
      <BeltIcon rebirths={rebirths} size={u(112)} />
      <span style={{ fontSize: u(40) }}>
        <StrokeText stroke={u(9)} gradient={gradient}>
          {belt.label}
        </StrokeText>
      </span>
    </div>
  )
}

/**
 * The BELT EXAM (a rebirth): the belt you wear against the one the exam earns you, what
 * each gives (Power multiplier and max level), your progress to max level, and the TAKE
 * EXAM button once you're there - or Skip, for Wins, before then.
 */
export function RebirthPanel() {
  const rebirths = useGame((s) => s.profile.rebirths)
  const level = useGame((s) => s.profile.level)
  const progress = useGame((s) => rebirthProgress(s.profile))
  const ready = useGame((s) => isMaxLevel(s.profile))
  const skipPrice = useGame((s) => rebirthSkipPrice(s.profile))
  const canSkip = useGame((s) => s.profile.wins >= skipPrice)
  const autoRebirth = useGame((s) => s.profile.settings.autoRebirth)
  const openPanel = useGame((s) => s.openPanel)
  const techniques = useGame((s) => SECRET_PUNCHES.filter((t) => s.profile.secretPunches?.[t.id] > 0).length)
  const cap = levelCap(rebirths)
  const gift = nextRebirthGift(rebirths)

  const skip = () => {
    if (getGame().profile.wins < skipPrice) {
      sfx.error()
      return
    }
    actions.skipRebirth()
  }

  return (
    <Panel title="Belt Exam" icon="rebirth" width={680}>
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr', columnGap: u(12) }}>
        <BeltCard rebirths={rebirths} />
        <Icon name="fastForward" size={u(54)} />
        <BeltCard rebirths={rebirths + 1} next />
      </div>

      <div className="flex flex-col" style={{ gap: u(10), marginTop: u(14) }}>
        <StatRow kind="after" from={`${formatMultiplier(rebirthMultiplier(rebirths))} Power`} to={`${formatMultiplier(rebirthMultiplier(rebirths + 1))} Power`} />
        <StatRow kind="level" from={`Max Level ${cap}`} to={`Max Level ${levelCap(rebirths + 1)}`} />
      </div>

      <p className="m-0 text-center" style={{ fontSize: u(32), marginTop: u(14) }}>
        <StrokeText stroke={u(7)} gradient={PURPLE}>
          The exam resets your Level and Power!
        </StrokeText>
      </p>
      {gift && (
        <p className="m-0 flex items-center justify-center" style={{ fontSize: u(28), marginTop: u(4), gap: u(8) }}>
          <Icon name="egg:volcano" size={u(40)} />
          <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
            {gift.rebirths === rebirths + 1 ? `This exam gives ${gift.label}!` : `${beltFor(gift.rebirths).label}: +${gift.label}!`}
          </StrokeText>
        </p>
      )}

      <div
        className="relative mx-auto overflow-hidden"
        style={{ width: '92%', marginTop: u(12), height: u(56), borderRadius: u(28), border: `${u(4)} solid #111`, background: '#eef6ff' }}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: LEVEL_FILL, borderRadius: u(24) }} />
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: u(36) }}>
          <StrokeText stroke={u(8)}>
            Level {level}/{cap}
          </StrokeText>
        </div>
      </div>

      <div className="flex" style={{ marginTop: u(16), gap: u(16) }}>
        <ChunkyButton
          disabled={!ready}
          onClick={() => actions.rebirth()}
          gradient={ready ? GRADIENTS.greenButton : GRADIENTS.greyButton}
          className="flex-1"
          style={{ height: u(84) }}
          radius={20}
          border={5}
        >
          <span style={{ fontSize: u(46) }}>
            <StrokeText stroke={u(10)}>{ready ? 'TAKE EXAM!' : `Need Level ${cap}`}</StrokeText>
          </span>
        </ChunkyButton>
        {!ready && (
          <ChunkyButton onClick={skip} gradient={GRADIENTS.rainbow} className="flex-1" style={{ height: u(84), gap: u(12) }} radius={20} border={5}>
            <span style={{ fontSize: u(46) }}>
              <StrokeText stroke={u(10)}>Skip</StrokeText>
            </span>
            <Price amount={skipPrice} size={38} afford={canSkip} />
          </ChunkyButton>
        )}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: u(14), gap: u(16) }}>
        <label className="pointer-events-auto flex cursor-pointer items-center" style={{ gap: u(10), fontSize: u(26) }}>
          <input
            type="checkbox"
            checked={autoRebirth}
            onChange={(e) => actions.setSetting('autoRebirth', e.target.checked)}
            style={{ width: u(28), height: u(28), accentColor: '#3fdc4a' }}
          />
          <StrokeText stroke={u(6)}>Auto exam at max level</StrokeText>
        </label>
        <ChunkyButton onClick={() => openPanel('techniques')} gradient={GRADIENTS.purpleButton} radius={14} border={4} style={{ height: u(58), padding: `0 ${u(20)}` }}>
          <span style={{ fontSize: u(28) }}>
            <StrokeText stroke={u(6)}>
              Techniques {techniques}/{SECRET_PUNCHES.length}
            </StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </Panel>
  )
}

export default RebirthPanel
