import { useEffect, useState } from 'react'

import { beltFor, rebirthMultiplier, TUTORIAL } from '@shared/balance'
import { formatDistance, formatNumber } from '@shared/format'
import { isMaxLevel, nextTire, zoneIndexAt } from '@shared/logic'

import { zones } from '../../game/worldLook'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ffa000 100%)'
const PANEL_GRADIENT = 'linear-gradient(180deg, #ffe45c 0%, #ffc21f 55%, #ff9a12 100%)'

/**
 * The tutorial for brand-new players: run, kick, buy a ball - then it's gone for good.
 * A small strip, "1/3" and the step with its progress ("(16/30)"), so the world stays in
 * view; the 3D arrows (TutorialArrows) show where to go.
 */
function TutorialBanner({ step }) {
  const current = TUTORIAL[step]
  const health = useGame((s) => s.profile.health)
  const onZone = useGame((s) => s.zone.rollZone)
  let text = current.text
  if (current.health) text += ` (${formatNumber(Math.min(health, current.health))}/${formatNumber(current.health)})`
  if (current.event === 'roll' && onZone) text = 'Press PUNCH, then press again at the top of the meter!'
  return (
    <div
      className="flex items-center"
      style={{
        gap: u(14),
        padding: `${u(6)} ${u(22)} ${u(6)} ${u(8)}`,
        borderRadius: u(30),
        border: `${u(4)} solid #111`,
        background: PANEL_GRADIENT,
        boxShadow: `0 ${u(4)} 0 rgba(0,0,0,0.3), inset 0 ${u(4)} 0 rgba(255,255,255,0.45)`,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ minWidth: u(64), height: u(44), borderRadius: u(22), background: '#111', fontSize: u(26) }}
      >
        <StrokeText stroke={u(5)} gradient={BANNER_GRADIENT}>
          {step + 1}/{TUTORIAL.length}
        </StrokeText>
      </span>
      <span style={{ fontSize: u(34) }}>
        <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
          {text}
        </StrokeText>
      </span>
    </div>
  )
}

/** The goal banner shows for SHOW_MS, then comes back by itself every EVERY_MS. */
const SHOW_MS = 5000
const EVERY_MS = 60000

/**
 * Whether a reminder about `key` is showing: for SHOW_MS straight away, then again for
 * SHOW_MS once a minute (EVERY_MS from each showing) - and straight away whenever `key`
 * changes (a new goal is news).
 */
function useReminder(key) {
  // `round` counts the showings, so a new goal arriving mid-showing restarts its time.
  const [state, setState] = useState({ key, on: true, round: 0 })
  if (state.key !== key) setState({ key, on: true, round: state.round + 1 })
  useEffect(() => {
    const id = state.on
      ? setTimeout(() => setState((s) => ({ ...s, on: false })), SHOW_MS)
      : setTimeout(() => setState((s) => ({ ...s, on: true, round: s.round + 1 })), EVERY_MS - SHOW_MS)
    return () => clearTimeout(id)
  }, [state.on, state.round])
  return state.on && state.key === key
}

/**
 * The next goal - something close enough to chase: the belt exam when you're at max
 * level, else the next pair of gloves and how far your Wins are from it, else the next
 * wall material past your best punch. A tap opens what it's about. A reminder, not a
 * fixture: it shows for 5 s, fades away, and comes back by itself once a minute (and
 * as soon as there's a new goal), so it never sits over the game.
 */
function GoalBanner() {
  const profile = useGame((s) => s.profile)
  const pending = useGame((s) => s.pendingWins)
  const openPanel = useGame((s) => s.openPanel)
  let text
  let progress = null
  let panel = null
  /** Which goal it is (not how far along): a new one shows straight away. */
  let goal
  if (isMaxLevel(profile)) {
    text = `BELT EXAM READY! Earn your ${beltFor(profile.rebirths + 1).name} for x${rebirthMultiplier(profile.rebirths + 1)} Power`
    panel = 'rebirth'
    goal = `exam:${profile.rebirths}`
  } else {
    const next = nextTire(profile)
    if (next) {
      const wins = Math.max(0, profile.wins - pending)
      text = wins >= next.cost ? `You can buy ${next.name}! Visit the Glove Shop` : `Next gloves: ${next.name}`
      progress = Math.min(1, wins / Math.max(1, next.cost))
      if (wins < next.cost) text += ` (${formatNumber(wins)}/${formatNumber(next.cost)} Wins)`
      goal = `${wins >= next.cost ? 'buy' : 'save'}:${next.name}`
    } else {
      const stages = zones()
      const nextStage = stages[Math.min(stages.length - 1, zoneIndexAt(profile.stats.bestDistance) + 1)]
      text = `Next: ${nextStage.name} at ${formatDistance(nextStage.start)} (best ${formatDistance(profile.stats.bestDistance)})`
      progress = Math.min(1, profile.stats.bestDistance / Math.max(1, nextStage.start))
      goal = `stage:${nextStage.name}`
    }
  }
  const shown = useReminder(goal)
  return (
    <button
      type="button"
      onClick={panel && shown ? () => openPanel(panel) : undefined}
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={`${panel && shown ? 'pp-btn pointer-events-auto' : ''} relative flex flex-col items-center overflow-hidden transition-[opacity,transform] duration-300`}
      style={{
        padding: `${u(6)} ${u(24)} ${u(progress === null ? 6 : 14)}`,
        borderRadius: u(30),
        border: `${u(4)} solid #111`,
        background: panel ? 'linear-gradient(180deg, #b4efff 0%, #4cb8ff 50%, #2477e8 100%)' : PANEL_GRADIENT,
        boxShadow: `0 ${u(4)} 0 rgba(0,0,0,0.3), inset 0 ${u(4)} 0 rgba(255,255,255,0.45)`,
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${u(-24)})`,
      }}
    >
      <span style={{ fontSize: u(32) }}>
        <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
          {text}
        </StrokeText>
      </span>
      {progress !== null && (
        <span className="absolute bottom-0 left-0 right-0" style={{ height: u(8), background: 'rgba(0,0,0,0.35)' }}>
          <span className="block h-full origin-left" style={{ transform: `scaleX(${progress})`, background: '#3fe05a' }} />
        </span>
      )}
    </button>
  )
}

/**
 * Top centre: the tutorial while there is one, then the next goal (GoalBanner). (The
 * playtime gift lives on the left menu: GiftTile.)
 */
export function TopCenter() {
  const step = useGame((s) => s.profile.tutorialStep)
  return (
    <div className="hud-topcenter pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ width: 'max-content', maxWidth: '90vw' }}>
      {TUTORIAL[step] ? <TutorialBanner step={step} /> : <GoalBanner />}
    </div>
  )
}

export default TopCenter
