import { Vector3 } from 'three'

import { comboBonus, HIT_GRADES, SECRET_PUNCHES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { LAUNCH_STAND, punchSpotX, ROLL_RETURN } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { burst, fireBurst } from '../fx/fxQueue'
import { spawnScattered } from '../fx/popups'
import { consumePull } from '../launch'
import { runtime } from '../runtime'
import { zones } from '../worldLook'
import { showHit } from './hudLink'
import { BODY_FLAT, createRideState, KICK_HIT, meterAtZ, MOVE, rideState, kickTimeAt, trackPoint } from './path'

/** How big the blast's burst on the wall that holds is, by grade (Impact.jsx's scale). */
const IMPACT_SIZE = { perfect: 30, great: 24, good: 18, weak: 12 }
/** How long the "+N Wins" result shows over you, landed, before you're back. */
const RESULT_HOLD_MS = 2600

/**
 * The launch currently playing (the template's "roll"), read every frame by the camera,
 * the runway, your avatar and the effects. Everything about it is known when it starts
 * (the authority already resolved the distance and the Wins), so the client just plays it
 * back: no per-frame network traffic.
 *
 * It's a ride state (see path.rideState: phase, meter, air, pitch, roll, grip, the pose
 * weights, position...) plus the launch's numbers. Your logical position stays on the
 * LAUNCH PAD while you fly (that's what the server checks); only your avatar and the
 * camera go down the runway.
 */
export const roll = {
  ...createRideState(),
  active: false,
  /** True once you've landed and the result is showing. */
  stopped: false,
  startedAt: 0,
  distance: 0,
  duration: 1,
  wins: 0,
  prize: 0,
  discovered: [],
  /** Zone index of the wall that stopped it, or -1. */
  blocked: -1,
  /** How many stages it flies into past the first. */
  broken: 0,
  best: false,
  tireId: 'bicycle',
  /** How well you let go (HIT_GRADES id), or null for Auto Launch. */
  hit: null,
  /** Where you punched from: metre along the runway and how far to the side. */
  fromMeter: 0,
  startX: 0,
  /** The hidden technique this punch landed (SECRET_PUNCHES id) or null, and its cut-in's seconds. */
  secret: null,
  hold: 0,
  /** PERFECTs in a row with this launch (0: not a PERFECT), and its lucky gift or null. */
  combo: 0,
  gift: null,
  /** performance.now() of the last landing, take-off and wall hit, for dust, shake and sound. */
  landedAt: 0,
  tookOffAt: 0,
  hitAt: 0,
  /** performance.now() when you shot past the posts. */
  kickedAt: 0,
  /**
   * A graded hit's hit-stop: when it started (performance.now(), 0 if none this kick),
   * how long it lasts, how strong the camera's zoom, punch and shake are (0-1), and the
   * roll clock's lag when it started (the freeze is measured from it).
   */
  freezeAt: 0,
  freezeMs: 0,
  freezePower: 0,
  freezeLag: 0,
  /**
   * You slamming down at the end of the arc: when (performance.now()), where, and how
   * high you fell from - what the turf splash and its spray of grass need.
   */
  impactAt: 0,
  impact: new Vector3(),
  impactMeter: 0,
  impactPeak: 0,
  frameKey: -1,
  /**
   * Slow motion: ms the roll's clock is behind real time. Every wall smashed slows the
   * ball (and the camera on it) for a moment, so you see the planks burst; the clock
   * catches up again a little faster than real time afterwards, and is always caught up
   * before the ball stops, so the kick ends exactly when the authority said.
   */
  lag: 0,
  lastNow: 0,
  /**
   * The punch as shown (see showPace): where it really is (meter is where it's shown),
   * when this shot started (seconds on the punch's clock, -1 before the first) and from
   * what metre, and how many times the picture has cut ahead so far.
   */
  realMeter: 0,
  shotAt: -1,
  shotFrom: 0,
  cuts: 0,
}

/** How long each smash's slow motion lasts, how slow, and how fast the clock catches up. */
const SLOW_MS = 220
const SLOW_RATE = 0.25
/** How fast the roll's clock runs during a hit-stop: all but frozen. */
const FREEZE_RATE = 0.06
const CATCH_UP = 0.4

let timers = []

function clearTimers() {
  for (const id of timers) clearTimeout(id)
  timers = []
}

/**
 * Moves the roll on to this frame. Idempotent per frame (keyed on the renderer's
 * clock), so the camera, walls and effects all see exactly the same state however many
 * of them ask.
 */
export function advanceRoll(clockTime) {
  if (!roll.active || roll.frameKey === clockTime) return roll
  roll.frameKey = clockTime
  const now = performance.now()
  const wasAirborne = roll.airborne
  const wasCrashed = roll.crashed
  const wasWaiting = roll.phase === 'launch'
  const wasBounces = roll.bounces
  const dt = roll.lastNow ? Math.min(now - roll.lastNow, 100) : 0
  roll.lastNow = now
  if (now - roll.freezeAt < roll.freezeMs) {
    // From the clock, not summed frame by frame: frame steps are capped, so on a slow
    // device a summed freeze would mostly slip away.
    roll.lag = roll.freezeLag + (now - roll.freezeAt) * (1 - FREEZE_RATE)
  } else if (now - roll.hitAt < SLOW_MS && !roll.crashed) roll.lag += dt * (1 - SLOW_RATE)
  else roll.lag = Math.max(0, roll.lag - dt * CATCH_UP)
  // All caught up by half a second before the stop.
  const left = roll.duration - (now - roll.startedAt) / 1000
  roll.lag = Math.min(roll.lag, Math.max(0, left - 0.5) * 400)
  const elapsed = (now - roll.startedAt - roll.lag) / 1000
  rideState(elapsed, roll, roll.startX, roll)
  if (roll.phase !== 'launch') showPace(elapsed)
  if (wasWaiting && roll.phase !== 'launch') {
    roll.kickedAt = now
    blastOff(now)
  }
  if (!wasAirborne && roll.airborne) {
    roll.tookOffAt = now
    sfx.jumpWhoosh()
  } else if (wasAirborne && !roll.airborne) {
    // Slammed down from the top of the arc: the runway cracks open (Impact.jsx), the
    // camera jolts, a moment of slow motion, and a boom.
    roll.landedAt = now
    roll.hitAt = now
    roll.impactAt = now
    roll.impact.copy(roll.position)
    roll.impactMeter = roll.meter
    // The blast bursting on the wall that holds: a shockwave across the runway (Impact.jsx)
    // as big as the punch was good, and a boom.
    roll.impactPeak = IMPACT_SIZE[roll.hit] ?? 18
    sfx.groundSmash(Math.min(1, roll.impactPeak / 30))
  }
  // Each belly bounce on the turf after it: a thud, softer every time.
  if (roll.bounces > wasBounces && wasBounces > 0) sfx.bounce(roll.bounces - 1)
  if (!wasCrashed && roll.crashed) {
    roll.hitAt = now
    sfx.wallBlock()
  }
  return roll
}

/**
 * The punch on screen never goes faster than SHOW_SPEED (m/s). A strong punch's force
 * really tears down the runway at hundreds of metres a second: far too fast to watch -
 * the walls strobe past and it's hard on the eyes. So it's shown in shots. In each, the
 * force goes at most SHOW_SPEED, wall after wall bursting at a pace you can follow; once
 * it has fallen CUT_GAP behind where the punch really is (and the shot has run SHOT_MIN),
 * the picture cuts ahead to it and a new shot starts there. Near the end the punch slows
 * under SHOW_SPEED and the last walls go at their real pace, so it still stops exactly
 * where and when the authority said.
 */
const SHOW_SPEED = 55
const CUT_GAP = 24
const SHOT_MIN = 1.6
/** In the last LAST_CALL seconds a shot may be cut short (to SHOT_LEAST) to catch up. */
const LAST_CALL = 1.6
const SHOT_LEAST = 0.6

/**
 * Paces the ride state just computed for `elapsed` (see SHOW_SPEED): roll.meter, position
 * and speed become what's shown, roll.realMeter where the punch really is, and roll.cuts
 * counts the cuts (the camera jumps with each).
 */
function showPace(elapsed) {
  const real = roll.meter
  roll.realMeter = real
  if (roll.shotAt < 0) {
    roll.shotAt = elapsed
    roll.shotFrom = real
  }
  const ran = elapsed - roll.shotAt
  let shown = roll.shotFrom + Math.min(real - roll.shotFrom, SHOW_SPEED * ran)
  const late = kickTimeAt(1, roll.duration) - elapsed < LAST_CALL
  // Cut ahead: the shot has run long enough and fallen too far behind - or, landed on the
  // wall that holds, the punch is always seen where it really is.
  if ((real - shown > CUT_GAP && ran >= (late ? SHOT_LEAST : SHOT_MIN)) || (roll.crashed && real - shown > 0.5)) {
    roll.shotAt = elapsed
    roll.shotFrom = real
    roll.cuts += 1
    shown = real
  }
  if (shown < real) {
    roll.meter = shown
    roll.speed = Math.min(roll.speed, SHOW_SPEED)
    trackPoint(shown, roll.x, BODY_FLAT + roll.air, roll.position)
  }
}

/**
 * How each grade of launch looks and sounds as you shoot past the posts: its burst
 * (FireBurst kind), confetti, how long time stands still and how hard the camera reacts
 * (0-1). The rest - the title - follows the grade too.
 */
const HIT_FX = {
  // No freeze (freezeMs 0): time standing still at launch read as the game sticking.
  perfect: { fire: 'perfect', palette: 'gold', count: 60, speed: 12, freezeMs: 0, power: 1 },
  great: { fire: 'great', palette: 'power', count: 34, speed: 9, freezeMs: 0, power: 0.65 },
  good: { fire: 'good', palette: 'confetti', count: 16, speed: 6, freezeMs: 0, power: 0.35 },
  weak: { fire: null, palette: null, count: 0, speed: 0, freezeMs: 0, power: 0 },
}

/**
 * Shooting past the posts: the grade the stretch meter gave the launch, straight away, so
 * you see why you fly as far as you do. GOOD, GREAT and PERFECT each get their own moment,
 * bigger every step: time stands still for a beat while a burst flies off you - sparkles,
 * an electric-blue blast, a column of fire - and the grade's title slams onto the screen
 * (HitFlash.jsx); then you blast away with the lens punching wide and the camera shaking
 * (Roll.jsx). A WEAK one just flops off the rubber.
 */
function blastOff(now) {
  // Every punch: a kick of dust off the floor round your feet as you drive into it.
  const feet = runtime.player.position
  burst({ x: feet.x, y: feet.y + 0.15, z: feet.z - 0.3, count: 22, palette: 'dust', speed: 4.5 })
  const grade = HIT_GRADES.find((g) => g.id === roll.hit)
  if (!grade) return
  const fx = HIT_FX[grade.id]
  const p = roll.position
  if (fx.count) burst({ x: p.x, y: p.y, z: p.z, count: fx.count, palette: fx.palette, speed: fx.speed })
  // A hidden technique: its name bursts off you as you go.
  const technique = SECRET_PUNCHES.find((s) => s.id === roll.secret)
  if (technique) {
    spawnScattered(`${technique.name.toUpperCase()}! x${technique.power} POWER`, { scale: 1.45 })
    burst({ x: p.x, y: p.y + 0.5, z: p.z, count: 70, palette: 'gold', speed: 14 })
  }
  // PERFECTs in a row: the combo and the Wins it adds.
  if (grade.id === 'perfect' && roll.combo >= 2) {
    timers.push(setTimeout(() => spawnScattered(`PERFECT COMBO x${roll.combo}! +${Math.round((comboBonus(roll.combo) - 1) * 100)}% WINS`, { scale: 1.25 }), 450))
  }
  if (grade.id === 'weak') {
    spawnScattered(grade.label, { scale: 1.3 })
    sfx.weakHit()
    return
  }
  // The freeze starts the moment you passed the posts on the launch's clock, not at
  // whichever frame noticed: on a slow frame you'd be well away by then.
  roll.freezeAt = Math.min(now, roll.startedAt + roll.lag + KICK_HIT * 1000)
  roll.freezeMs = fx.freezeMs
  roll.freezePower = fx.power
  roll.freezeLag = roll.lag
  fireBurst(p.x, p.y, p.z, fx.fire)
  showHit(grade.id)
  sfx.gradeHit(grade.id)
  timers.push(setTimeout(() => sfx.perfectRelease(fx.power), fx.freezeMs))
}

/**
 * Starts a punch the authority already resolved, from the punch spot: the wind-up, the
 * lunge, and off you smash down the walls (roll/Walls.jsx breaks them as you go). A
 * hidden technique first plays its cut-in while you hold the wind-up.
 */
export function beginRoll(result) {
  clearTimers()
  const game = getGame()
  consumePull()
  // A technique landed for the first time: it goes in the book (said once the punch is over).
  const newTechnique = result.secret && !(game.profile.secretPunches?.[result.secret] > 0) ? SECRET_PUNCHES.find((s) => s.id === result.secret) : null
  // A hidden technique holds the punch for its cut-in first (the authority counted it in).
  const holdMs = Math.max(0, Number(result.hold) || 0) * 1000
  const at = (seconds) => holdMs + seconds * 1000
  Object.assign(roll, {
    active: true,
    stopped: false,
    startedAt: performance.now() + holdMs,
    distance: result.distance,
    duration: result.duration,
    wins: result.wins,
    prize: result.prize || 0,
    discovered: result.discovered || [],
    blocked: result.blocked ?? -1,
    broken: result.broken || 0,
    best: result.best,
    tireId: result.tireId || game.profile.equippedTire,
    hit: result.hit ?? null,
    fromMeter: meterAtZ(LAUNCH_STAND.z),
    // Your spot on the punch line: the punch goes straight down the runway from it.
    startX: punchSpotX(runtime.player.position.x),
    secret: result.secret || null,
    hold: holdMs / 1000,
    combo: result.combo || 0,
    gift: result.gift || null,
    landedAt: 0,
    tookOffAt: 0,
    hitAt: 0,
    kickedAt: 0,
    freezeAt: 0,
    freezeMs: 0,
    freezePower: 0,
    impactAt: 0,
    frameKey: -1,
    lag: 0,
    lastNow: 0,
    realMeter: 0,
    shotAt: -1,
    shotFrom: 0,
    cuts: 0,
  })
  rideState(0, roll, roll.startX, roll)
  runtime.player.frozen = true
  // Square up to the runway.
  runtime.player.yaw = Math.PI
  runtime.camera.mode = 'roll'
  // The HUD's switch to the flight (a React update and a restyle) in a task of its own,
  // not the frame the launch starts in: together they made that one frame stick on slow
  // phones. The flight itself is already under way from the runtime state above.
  const started = {
    distance: result.distance,
    wins: result.wins,
    prize: result.prize || 0,
    blocked: result.blocked ?? -1,
    duration: result.duration,
    best: result.best,
    giftWins: result.gift?.wins || 0,
  }
  timers.push(setTimeout(() => game.startRoll(started), 0))

  // A hidden technique: the cut-in (SecretCutIn.jsx) while you hold the pose.
  if (result.secret) {
    timers.push(setTimeout(() => game.showSecret(result.secret), 0))
    sfx.perfectHit()
  }
  // The move: a rush of air as you spring up spinning, a thump and a puff of dust as you
  // land in your stance, then the punch landing.
  timers.push(setTimeout(() => sfx.windUp(), at(KICK_HIT * MOVE.takeoff)))
  timers.push(
    setTimeout(() => {
      sfx.jumpLand()
      fireBurst(roll.startX, 0.05, LAUNCH_STAND.z, 'turf')
    }, at(KICK_HIT * MOVE.land)),
  )
  timers.push(setTimeout(() => sfx.punchImpact(), at(KICK_HIT)))
  timers.push(
    setTimeout(() => {
      roll.stopped = true
      sfx.wins()
      const f = roll.position
      burst({ x: f.x, y: f.y + 1.8, z: f.z, count: 50, palette: 'gold', speed: 9 })
      game.endRoll()
      if (newTechnique) game.showToast(`NEW TECHNIQUE: ${newTechnique.name}! It's in your book (Belts > Techniques)`)
      // A stage reached for the first time ever: its name and the prize, once.
      const stages = zones()
      for (const zi of roll.discovered) {
        game.showToast(`NEW STAGE: ${stages[zi].name}! +${formatNumber(stages[zi].discover)} Wins`)
      }
      // A lucky gift: a present bursting open over you, and what was in it.
      const gift = roll.gift
      if (gift) {
        timers.push(
          setTimeout(
            () => {
              sfx.reveal()
              burst({ x: f.x, y: f.y + 2.4, z: f.z, count: 70, palette: 'confetti', speed: 11 })
              const what = gift.wins ? `+${formatNumber(gift.wins)} Wins` : gift.label
              game.showToast(`LUCKY GIFT! ${gift.wins ? `${gift.label}: ${what}` : what}`)
            },
            roll.discovered.length ? 1600 : 500,
          ),
        )
      }
      timers.push(setTimeout(() => fadeThrough(finishRoll), RESULT_HOLD_MS))
    }, at(result.duration)),
  )
}

/**
 * Back at the start, just short of the punch spot, camera behind you. With Auto Punch
 * on you stay in the zone instead, so the next punch goes straight away.
 */
export function finishRoll() {
  clearTimers()
  roll.active = false
  roll.stopped = false
  runtime.flightFocus = null
  const player = runtime.player
  const { passes, settings } = getGame().profile
  if (!(passes.autoRoll && settings.autoRoll)) player.position.set(ROLL_RETURN.x, 0, ROLL_RETURN.z)
  player.yaw = Math.PI
  player.frozen = false
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  getGame().clearRollResult()
}
