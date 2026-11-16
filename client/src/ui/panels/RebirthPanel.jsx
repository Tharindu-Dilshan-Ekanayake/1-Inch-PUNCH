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
  health: 'linear-gradient(180deg, #8ff0ff 0%, #2fb8ff 50%, #1677ff 100%)',
  after: 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)',
  level: 'linear-gradient(180deg, #ffe25a 0%, #ffb21e 55%, #f08a0a 100%)',
}
const PURPLE = 'linear-gradient(180deg, #ffd6ff 0%, #e27bff 50%, #a93cf0 100%)'
const LEVEL_FILL = 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)'

function StatCard({ kind, text }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{
        height: u(104),
        borderRadius: u(22),
        background: CARD_GRADIENTS[kind],
        border: `${u(5)} solid #111`,
        boxShadow: `inset 0 ${u(5)} 0 rgba(255,255,255,0.45), inset 0 -${u(6)} 0 rgba(0,0,0,0.18)`,
      }}
    >
      <span className="relative" style={{ fontSize: u(text.length > 11 ? 50 : 60) }}>
        <StrokeText stroke={u(11)}>{text}</StrokeText>
      </span>
    </div>
  )
}

/**
 * The BELT EXAM (a rebirth): the belt you wear against the one the exam earns you, what
 * each gives (Power multiplier and max level), your progress to max level, and the TAKE
 * EXAM button once you're there - or Skip, for Wins, before then.
 */
/** A belt and its name: the one you wear, or (`next`) the one the exam earns. */
function BeltCard({ rebirths, next = false }) {
  const belt = beltFor(rebirths)
  const gradient = belt.rainbow ? GRADIENTS.rainbow : `linear-gradient(180deg, #ffffff 0%, ${belt.color} 45%, ${belt.trim} 100%)`
  return (
    <div className="flex flex-col items-center" style={{ gap: u(4) }}>
      <span style={{ fontSize: u(40) }}>
        <StrokeText stroke={u(8)}>{next ? 'Next Belt' : 'Your Belt'}</StrokeText>
      </span>
      <BeltIcon rebirths={rebirths} size={u(150)} />
      <span style={{ fontSize: u(52) }}>
        <StrokeText stroke={u(11)} gradient={gradient}>
          {belt.label}
        </StrokeText>
      </span>
    </div>
  )
}

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
    <Panel title="Belt Exam" icon="rebirth" width={920}>
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr', columnGap: u(20), rowGap: u(16) }}>
        <BeltCard rebirths={rebirths} />
        <Icon name="fastForward" size={u(80)} />
        <BeltCard rebirths={rebirths + 1} next />

        <StatCard kind="health" text={`${formatMultiplier(rebirthMultiplier(rebirths))} Power`} />
        <Icon name="fastForward" size={u(80)} />
        <StatCard kind="after" text={`${formatMultiplier(rebirthMultiplier(rebirths + 1))} Power`} />

        <StatCard kind="level" text={`Max Level ${cap}`} />
        <Icon name="fastForward" size={u(80)} />
        <StatCard kind="level" text={`Max Level ${levelCap(rebirths + 1)}`} />
      </div>

      <p className="m-0 text-center" style={{ fontSize: u(46), marginTop: u(18) }}>
        <StrokeText stroke={u(9)} gradient={PURPLE}>
          The exam resets your Level and Power!
        </StrokeText>
      </p>
      {gift && (
        <p className="m-0 flex items-center justify-center" style={{ fontSize: u(40), marginTop: u(8), gap: u(10) }}>
          <Icon name="egg:volcano" size={u(56)} />
          <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
            {gift.rebirths === rebirths + 1 ? `This exam gives ${gift.label}!` : `${beltFor(gift.rebirths).label}: +${gift.label}!`}
          </StrokeText>
        </p>
      )}

      <div
        className="relative mx-auto overflow-hidden"
        style={{ width: '88%', marginTop: u(12), height: u(76), borderRadius: u(38), border: `${u(5)} solid #111`, background: '#eef6ff' }}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: LEVEL_FILL, borderRadius: u(32) }} />
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: u(50) }}>
          <StrokeText stroke={u(10)}>
            Level {level}/{cap}
          </StrokeText>
        </div>
      </div>

      <div className="flex" style={{ marginTop: u(26), gap: u(22) }}>
        <ChunkyButton
          disabled={!ready}
          onClick={() => actions.rebirth()}
          gradient={ready ? GRADIENTS.greenButton : GRADIENTS.greyButton}
          className="flex-1"
          style={{ height: u(108) }}
          radius={22}
          border={5}
        >
          <span style={{ fontSize: u(60) }}>
            <StrokeText stroke={u(12)}>{ready ? 'TAKE EXAM!' : `Need Level ${cap}`}</StrokeText>
          </span>
        </ChunkyButton>
        {!ready && (
          <ChunkyButton onClick={skip} gradient={GRADIENTS.rainbow} className="flex-1" style={{ height: u(108), gap: u(16) }} radius={22} border={5}>
            <span style={{ fontSize: u(60) }}>
              <StrokeText stroke={u(12)}>Skip</StrokeText>
            </span>
            <Price amount={skipPrice} size={48} afford={canSkip} />
          </ChunkyButton>
        )}
      </div>

      <label className="pointer-events-auto flex cursor-pointer items-center justify-center" style={{ marginTop: u(18), gap: u(12), fontSize: u(32) }}>
        <input
          type="checkbox"
          checked={autoRebirth}
          onChange={(e) => actions.setSetting('autoRebirth', e.target.checked)}
          style={{ width: u(34), height: u(34), accentColor: '#3fdc4a' }}
        />
        <StrokeText stroke={u(7)}>Auto Belt Exam at max level</StrokeText>
      </label>
      <div className="flex justify-center" style={{ marginTop: u(14) }}>
        <ChunkyButton onClick={() => openPanel('techniques')} gradient={GRADIENTS.purpleButton} radius={16} border={5} style={{ height: u(76), padding: `0 ${u(28)}` }}>
          <span style={{ fontSize: u(38) }}>
            <StrokeText stroke={u(8)}>
              Hidden Techniques {techniques}/{SECRET_PUNCHES.length}
            </StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </Panel>
  )
}

export default RebirthPanel
