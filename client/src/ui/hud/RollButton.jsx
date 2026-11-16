import { useCallback, useEffect, useRef, useState } from 'react'

import { HIT_GRADES, hitGrade, hitReach } from '@shared/balance'

import { sfx } from '../../audio/sfx'
import { cancelPull, grab, launch, letGo, punchButton } from '../../game/launch'
import { setText } from '../../game/roll/hudLink'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** With Auto Punch on, the next punch starts this long after you're back in the zone. */
const AUTO_DELAY_MS = 700
/** Auto Punch lets go this long after the meter fills. */
const AUTO_HOLD_MS = 120
/** A press is ignored this soon after the last (a double tap, a bouncing key). */
const PRESS_COOLDOWN_MS = 220

/** The meter's coloured bands, from the grades: each runs from its `min` to the top. */
const BANDS = HIT_GRADES.filter((g) => g.min > 0).map((g) => ({ id: g.id, from: g.min }))
const BAND_COLORS = {
  perfect: 'linear-gradient(180deg, #fff6a3 0%, #ffd21f 55%, #ff9c00 100%)',
  great: 'linear-gradient(180deg, #d9ff9a 0%, #5fe83a 55%, #1fb52a 100%)',
  good: 'linear-gradient(180deg, #bff4ff 0%, #4fc8ff 55%, #1f8ae0 100%)',
}
/** Each grade's colour for the live label over the meter. */
const GRADE_COLORS = { perfect: '#ffd21f', great: '#7dff4a', good: '#9fe8ff', weak: '#ff6a5a' }
const PUNCH_GRADIENT = 'linear-gradient(180deg, #c8ff8a 0%, #5fe83a 45%, #19b52a 100%)'
const RELEASE_GRADIENT = 'linear-gradient(180deg, #fff6a3 0%, #ffcb1f 45%, #ff7a0a 100%)'

/**
 * The Punch Zone's HUD: the big PUNCH! button and the power meter. Press PUNCH (or E /
 * Enter / Space-free tap) anywhere in the zone and you step onto the punch spot and take
 * your stance; the meter charges up by itself and, once full, pulses off the top. Press
 * PUNCH again to let it go: the fuller the meter, the further you smash and the more it
 * pays (HIT_GRADES) - let go right at the top of a pulse for PERFECT. With the Auto Punch
 * pass, a toggle under it charges and lets go for you every time you're back (a plain
 * punch, no meter). Walking or jumping drops the stance without punching.
 *
 * The meter is moved straight on the DOM every animation frame (the player keeps
 * launch.charge up to date); React only hears about stepping on and letting go.
 */
export function RollButton() {
  const near = useGame((s) => (s.zone.rollZone || s.zone.atPosts) && !s.roll && !s.rollResult && !s.panel)
  const ownsAuto = useGame((s) => Boolean(s.profile.passes.autoRoll))
  const autoOn = useGame((s) => Boolean(s.profile.passes.autoRoll && s.profile.settings.autoRoll))
  /** In the stance right now (mirrors launch.gripping for React). */
  const [gripping, setGripping] = useState(false)
  const [auto, setAuto] = useState(false)
  const lastPress = useRef(-Infinity)
  const fillRef = useRef(null)
  const labelRef = useRef(null)
  const visible = near || gripping

  const doGrab = useCallback((byAuto = false) => {
    if (launch.gripping || launch.released) return
    grab(byAuto)
    sfx.stretchStart()
    setGripping(true)
    setAuto(byAuto)
  }, [])

  /** Lets go; `plain` sends no meter reading (Auto Punch). */
  const doLetGo = useCallback((plain = false) => {
    if (!launch.gripping) return
    const charge = letGo()
    sfx.stretchStop()
    setGripping(false)
    setAuto(false)
    actions.roll(plain ? undefined : Math.round(charge * 1000) / 1000)
  }, [])

  const press = useCallback(() => {
    const now = performance.now()
    if (now - lastPress.current < PRESS_COOLDOWN_MS) return
    lastPress.current = now
    if (launch.gripping) doLetGo()
    else doGrab()
  }, [doGrab, doLetGo])

  // The stance can be dropped elsewhere (walking off, a jump): keep React in step.
  useEffect(() => {
    if (!visible) return undefined
    const id = setInterval(() => {
      setGripping(launch.gripping)
      setAuto(launch.auto)
    }, 80)
    return () => clearInterval(id)
  }, [visible])

  // A panel opened or the punch started: drop the stance.
  const panel = useGame((s) => s.panel)
  const rolling = useGame((s) => Boolean(s.roll))
  const [blocked, setBlocked] = useState(false)
  if (Boolean(panel || rolling) !== blocked) {
    setBlocked(Boolean(panel || rolling))
    if (panel || rolling) {
      setGripping(false)
      setAuto(false)
    }
  }
  useEffect(() => {
    if (!blocked || !launch.gripping) return
    cancelPull()
    sfx.stretchStop()
  }, [blocked])

  // A click on the game does what pressing PUNCH does, while it's showing.
  useEffect(() => {
    if (!visible) return undefined
    punchButton.press = press
    return () => {
      if (punchButton.press === press) punchButton.press = null
    }
  }, [visible, press])

  useEffect(() => {
    if (!visible) return undefined
    const onKey = (e) => {
      if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) press()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, press])

  // Auto Punch: charge by itself every time you're back in the zone.
  useEffect(() => {
    if (!near || !autoOn || gripping) return undefined
    const id = setTimeout(() => doGrab(true), AUTO_DELAY_MS)
    return () => clearTimeout(id)
  }, [near, autoOn, gripping, doGrab])

  // The meter, every frame, while charging (and noticing the stance dropped). Only what
  // changed is written: the bar slides (a transform, no layout), the label's text and
  // colour change only when the grade does.
  useEffect(() => {
    if (!gripping) return undefined
    let raf = 0
    const layers = [...(labelRef.current?.querySelectorAll('.pp-text-stroke, .pp-text-fill') ?? [])]
    const fillLayer = labelRef.current?.querySelector('.pp-text-fill')
    let shownText = ''
    let shownColor = ''
    const tick = () => {
      if (!launch.gripping) {
        sfx.stretchStop()
        setGripping(false)
        setAuto(false)
        return
      }
      const charge = launch.charge
      sfx.stretchSet(charge, launch.full)
      if (auto && launch.full && performance.now() - launch.fullSince > AUTO_HOLD_MS) {
        doLetGo(true)
        return
      }
      if (fillRef.current) fillRef.current.style.transform = `translateX(${(charge - 1) * 100}%)`
      // The grade letting go now would get, in its colour, and how far it would smash:
      // "PUNCH! PERFECT x1.5". Both layers of the outlined text (StrokeText).
      const grade = hitGrade(charge)
      const text = launch.full ? `PUNCH NOW! ${grade.label.replace(/[!.]+$/, '')} x${hitReach(charge).toFixed(1)}` : 'CHARGING...'
      if (text !== shownText) {
        shownText = text
        for (const layer of layers) setText(layer, text)
      }
      const color = launch.full ? GRADE_COLORS[grade.id] : '#ffffff'
      if (fillLayer && color !== shownColor) {
        shownColor = color
        fillLayer.style.color = color
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [gripping, auto, doLetGo])

  if (!visible) return null
  return (
    <>
      {/* The power meter, up under the top bar: the middle of the screen is you. */}
      {gripping && !auto && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(150) }}>
          <span ref={labelRef} className="whitespace-nowrap" style={{ fontSize: u(54), color: '#ffffff' }}>
            <StrokeText stroke={u(11)}>CHARGING...</StrokeText>
          </span>
          <div
            className="relative overflow-hidden"
            style={{
              width: u(560),
              height: u(54),
              borderRadius: u(27),
              border: `${u(6)} solid #1b1b1f`,
              background: '#2a1f4a',
              boxShadow: `0 ${u(6)} 0 rgba(0,0,0,0.35)`,
            }}
          >
            {BANDS.map((b) => (
              <div key={b.id} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, right: 0, background: BAND_COLORS[b.id], opacity: 0.32 }} />
            ))}
            <div
              ref={fillRef}
              className="absolute top-0 bottom-0 left-0"
              style={{
                width: '100%',
                transform: 'translateX(-100%)',
                willChange: 'transform',
                background: 'repeating-linear-gradient(135deg, #ff5a3a 0 14px, #ffb02e 14px 28px)',
                borderRight: `${u(5)} solid #ffffff`,
              }}
            />
            {BANDS.map((b) => (
              <div key={`${b.id}-mark`} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, width: u(4), background: '#1b1b1f', opacity: 0.6 }} />
            ))}
          </div>
          <span className="flex items-center" style={{ fontSize: u(32), marginTop: u(10) }}>
            <StrokeText stroke={u(7)}>Press PUNCH again at the very top of the meter!</StrokeText>
          </span>
        </div>
      )}
      <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(290) }}>
        {!auto && (
          <ChunkyButton
            gradient={gripping ? RELEASE_GRADIENT : PUNCH_GRADIENT}
            onPointerDown={(e) => {
              e.preventDefault()
              press()
            }}
            title="Punch (E)"
            radius={18}
            border={6}
            className="pp-punch-btn"
            style={{ width: u(420), height: u(120), position: 'relative' }}
          >
            <span style={{ fontSize: u(76), letterSpacing: u(2) }}>
              <StrokeText stroke={u(12)}>{gripping ? 'RELEASE!' : 'PUNCH!'}</StrokeText>
            </span>
            <span
              className="absolute flex items-center justify-center"
              style={{ top: u(-16), right: u(-16), width: u(46), height: u(46), borderRadius: u(10), background: '#ffffff', border: `${u(4)} solid #111`, fontSize: u(28), color: '#111' }}
            >
              E
            </span>
          </ChunkyButton>
        )}
        {ownsAuto && (
          <ChunkyButton
            gradient={autoOn ? GRADIENTS.goldButton : GRADIENTS.greyButton}
            onClick={() => actions.setSetting('autoRoll', !autoOn)}
            title="Auto Punch"
            radius={10}
            border={4}
            style={{ height: u(56), padding: `0 ${u(20)}`, marginTop: u(14) }}
          >
            <span style={{ fontSize: u(32) }}>
              <StrokeText stroke={u(7)}>Auto Punch: {autoOn ? 'ON' : 'OFF'}</StrokeText>
            </span>
          </ChunkyButton>
        )}
      </div>
    </>
  )
}

export default RollButton
