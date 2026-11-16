import { Euler, Quaternion, Vector3 } from 'three'

import { ROLL_LAUNCH } from '@shared/balance'
import { SLOPE_ANGLE, TRACK_START_Z } from '@shared/world'

import { BODY } from '../playerPose'

/**
 * Geometry of a launch: one long, straight runway running north from the plaza's edge,
 * dead level (SLOPE_ANGLE is 0; the maths still allows a slope).
 *
 * Track metre `m` is measured along the runway from the start line (the plaza's north
 * edge). Before the start (m < 0) the ground is the plaza. Everything here is pure maths
 * and allocation-free, so the frame loop can call it freely.
 */

export const SIN = Math.sin(SLOPE_ANGLE)
export const COS = Math.cos(SLOPE_ANGLE)
export const TAN = Math.tan(SLOPE_ANGLE)

/** World z of track metre m. */
export const zAt = (m) => TRACK_START_Z - (m > 0 ? m * COS : m)
/** Height of the floor at track metre m. */
export const floorY = (m) => (m > 0 ? -m * SIN : 0)
/** Height of the track's floor plane under world z. */
export const slopeY = (z) => (z < TRACK_START_Z ? -(TRACK_START_Z - z) * TAN : 0)
/** Height of a surface parallel to the floor, `h` metres off it, under world z. */
export const surfaceY = (z, h) => slopeY(z) + h / COS

/** How a box lies on the track: tipped back by the slope angle. */
export const SLOPE_EULER_X = -SLOPE_ANGLE

/** World point at track metre m, `x` to the side and `h` off the floor. */
export function trackPoint(m, x, h, out) {
  if (m <= 0) return out.set(x, h, TRACK_START_Z - m)
  return out.set(x, -m * SIN + h * COS, TRACK_START_Z - m * COS - h * SIN)
}

const _e = new Euler()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()

/**
 * Matrix of a box lying on the track, given in track terms: centred `x` across, `h`
 * off the floor (to its centre) and at metre `m` (also its centre), sized `sx` across,
 * `sy` thick and `sz` along the track, leaning `lean` radians about its own long axis.
 */
export function slopeBoxMatrix(m, x, h, sx, sy, sz, lean, out) {
  trackPoint(m, x, h, _p)
  _q.setFromEuler(_e.set(m > 0 ? SLOPE_EULER_X : 0, 0, lean))
  return out.compose(_p, _q, _s.set(sx, sy, sz))
}

/** Same as slopeBoxMatrix, but as BlockSet.add arguments: [x, y, z, rotX]. */
export function slopeBoxPlacement(m, x, h) {
  trackPoint(m, x, h, _p)
  return [_p.x, _p.y, _p.z, m > 0 ? SLOPE_EULER_X : 0]
}

/** Metres a world z is along the track (negative in the plaza). */
export const meterAtZ = (z) => (z < TRACK_START_Z ? (TRACK_START_Z - z) / COS : TRACK_START_Z - z)

/// --- A punch (the template's launch) -------------------------------------------------
//
// You stay on the punch spot and throw the punch; its POWER goes on down the runway as an
// unseen force (only your glove glows as you charge: FistCharge.jsx), smashing every wall
// it reaches, until it hits the one that holds. The ride state below is that force - its
// metre, its position, its speed (the camera and the walls follow it) - plus how your
// body moves back on the spot: the wind-up, the punch thrown and held, the cheer.

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** The blast sets off from your fist (this far ahead of the punch spot) and is up to speed here. */
const FIST_FROM = 0.8
export const PUSH_AHEAD = 1.7
/** Seconds into a punch that the blast leaves your fist: the move and the punch. */
export const KICK_HIT = ROLL_LAUNCH
/**
 * The move, as shares of KICK_HIT (1.1 s): let go and you crouch, spring up (`takeoff`)
 * and spin round once in the air - knees tucked, arms in - land (`land`) in your stance
 * with a dip of the knees, coil (`coil`) and drive the punch out, landing on the wall at
 * 1. HOP is how high the jump goes (m), CROUCH how deep the landing's dip (of a full squat).
 */
export const MOVE = { takeoff: 0.14, land: 0.62, coil: 0.74, punch: 0.86 }
const HOP = 1.6
const CROUCH = 0.8
/** Ease in and out (smootherstep): the spin winds up, whips round and settles. */
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10)
/** The blast flies at your shoulder's height: BODY_FLAT plus WAVE_AIR over the floor. */
export const BODY_FLAT = 0.3
const WAVE_AIR = BODY.shoulderY - BODY_FLAT
/** How big the blast reads to the trail and effects. */
export const TIRE_SIZE = 0.6
/** From the blast's middle to its front: the wall that holds stands there. */
export const FIST_AHEAD = 1.1

/**
 * The blast's flight takes LAND_T of the punch's time after the wind-up, ending as it
 * hits the wall that holds and bursts; the rest is the dust settling and you cheering.
 */
const LAND_T = 0.86
/** Seconds to drop the punch and start cheering, once it has stopped. */
const STAND_UP = 0.45

/**
 * How hard a punch's force slows as the walls soak it up: the share of its run that eases
 * out (the rest is steady). Long punches tear through the first walls at hundreds of
 * metres a second and slow right down for the last few, so you see each of those burst
 * apart; short ones barely slow, so they still hit the last wall hard.
 */
const easeFor = (span) => Math.min(0.97, Math.max(0.5, 0.5 + 0.12 * Math.log(1 + span / 60)))

/**
 * How far along its distance (0-1) the force is `t` of the way through its run (`a` from
 * easeFor): off your fist fast, slowing as the walls soak it up, still moving when it
 * hits the last one.
 */
const progress = (t, a) => {
  const u = 1 - clamp01(t)
  return a * (1 - u * u * u) + (1 - a) * (1 - u)
}
/** Its rate (d progress / dt). */
const progressRate = (t, a) => {
  const u = 1 - clamp01(t)
  return 3 * a * u * u + (1 - a)
}

/**
 * Seconds into a punch of `duration` (the wind-up included) and `distance` at which its
 * force has smashed `f` (0-1) of the way: 1 is the moment it hits the wall that holds.
 */
export const kickTimeAt = (f, duration, distance = 0) => {
  const a = easeFor(distance)
  const target = clamp01(f)
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2
    if (progress(mid, a) < target) lo = mid
    else hi = mid
  }
  return KICK_HIT + LAND_T * hi * Math.max(0.1, duration - KICK_HIT)
}

/** How much the blast bobs as it flies (metres): a touch more for a better punch. */
const KICK_ARC = { weak: 0.1, good: 0.18, great: 0.24, perfect: 0.3 }
export const flightPeak = (distance, hit = null) => (KICK_ARC[hit] ?? 0.18) * Math.min(1, 0.4 + Math.sqrt(Math.max(0, distance)) / 40)

/** A fresh state for rideState to write into. */
export const createRideState = () => ({
  phase: 'launch',
  launch: 0,
  meter: 0,
  speed: 0,
  /** Height of the blast's middle off the floor, less BODY_FLAT. */
  air: 0,
  size: TIRE_SIZE,
  /** True while the blast is flying (until it hits the wall that holds). */
  airborne: false,
  /** Always 0: nothing bounces any more (kept for the sounds that listen for it). */
  bounces: 0,
  /** The blast never dives or spins; kept for code that turns the old flier. */
  pitch: 0,
  roll: 0,
  /** 0 or more while you're in your stance on the spot (the pose's stance), else -1. */
  grip: -1,
  /** How coiled the wind-up is (0-1), for the pose. */
  strain: 0,
  /** How far the punch is thrown (0 cocked, 1 the arm straight out), for the pose. */
  punch: 0,
  /** The last-moment wind-up before it (0-1): coiling further back, for the pose. */
  windup: 0,
  /** The punch's snap past straight and back (a springy -0.1..0.2), for the pose. */
  kick: 0,
  /** The move: how high off the ground you are (m; below 0 crouching), how far round the spin has turned you (radians), how tucked up in the air you are (0-1). */
  hop: 0,
  spin: 0,
  tuck: 0,
  /** How deep you're squatting (0-1): the crouch before the jump, the dip as you land. */
  squat: 0,
  /** Never set: your body stays on the spot (kept for the pose's other uses). */
  fly: 0,
  sprawl: 0,
  /** Up and cheering once the blast has stopped (0-1). */
  cheer: 0,
  /** How big the blast is (0 not yet thrown, 1 flying). */
  wave: 0,
  /** True once the blast has hit the wall that holds. */
  crashed: false,
  x: 0,
  /** The blast's middle. */
  position: new Vector3(),
})

/**
 * Everything about a punch `elapsed` seconds in - yours, or another player's replayed
 * from the same numbers, so both look identical. `ride` is `{ fromMeter, startX,
 * distance, duration, hit }` (duration includes the wind-up); `lane` is a sideways
 * offset so blasts don't overlap. Writes into `out` (see createRideState):
 *   phase    'launch' (the wind-up and the punch) | 'ride' | 'stopped'
 *   meter    metres the blast is along the runway; speed in m/s along it
 *   position the blast's middle; grip/strain/punch/cheer how your body moves on the spot
 */
export function rideState(elapsed, ride, lane, out) {
  const from = ride.fromMeter + FIST_FROM
  const start = ride.fromMeter + PUSH_AHEAD
  const end = Math.max(start + 1, ride.distance)
  const flightTime = Math.max(0.1, ride.duration - KICK_HIT)
  let meter
  let speed = 0
  let air = WAVE_AIR
  out.airborne = false
  out.crashed = false
  out.bounces = 0
  out.grip = -1
  out.strain = 0
  out.punch = 0
  out.windup = 0
  out.kick = 0
  out.fly = 0
  out.sprawl = 0
  out.cheer = 0
  out.pitch = 0
  out.roll = 0
  out.hop = 0
  out.spin = 0
  out.tuck = 0
  out.squat = 0
  if (elapsed < KICK_HIT) {
    // The move (MOVE): crouch, a spinning jump, land in your stance, coil, punch - then
    // the blast bursts off the fist, faster and faster.
    out.phase = 'launch'
    const u = clamp01(elapsed / KICK_HIT)
    out.launch = u
    out.grip = 0
    out.strain = 1
    meter = from
    if (u < MOVE.takeoff) {
      // Sinking into a crouch.
      out.squat = smooth(0, MOVE.takeoff, u)
    } else if (u < MOVE.land) {
      // Up and round: a jump's arc, spinning once, knees tucked at the top.
      const a = (u - MOVE.takeoff) / (MOVE.land - MOVE.takeoff)
      out.hop = HOP * 4 * a * (1 - a)
      out.spin = Math.PI * 2 * smoother(a)
      out.squat = 1 - smooth(0, 0.12, a)
      out.tuck = Math.sin(Math.PI * Math.min(1, a * 1.12))
    } else if (u < MOVE.coil) {
      // Down into the stance: a dip of the knees as you land, the punch chambered.
      const a = (u - MOVE.land) / (MOVE.coil - MOVE.land)
      out.squat = CROUCH * Math.sin(Math.PI * a)
      out.windup = smooth(0.3, 1, a)
    } else {
      // Coil, then the punch snaps out in a tenth of a second, overshoots straight a
      // touch and springs back (follow-through), the blast leaving the fist.
      const k = clamp01((u - MOVE.punch) / (1 - MOVE.punch))
      out.windup = 1 - smooth(0, 0.3, k)
      out.punch = smooth(0, 0.45, k)
      out.kick = k > 0.45 ? 0.18 * Math.exp(-(k - 0.45) * 7) * Math.cos((k - 0.45) * 16) : 0
      out.wave = smooth(0.2, 0.8, k)
      meter = from + (start - from) * k * k
      speed = (2 * k * (start - from)) / ((1 - MOVE.punch) * KICK_HIT)
    }
  } else {
    const t = (elapsed - KICK_HIT) / flightTime
    out.launch = 1
    out.phase = t >= 1 ? 'stopped' : 'ride'
    if (t < LAND_T) {
      const a = easeFor(end - start)
      const f = progress(t / LAND_T, a)
      meter = start + (end - start) * f
      speed = ((end - start) * progressRate(t / LAND_T, a)) / (LAND_T * flightTime)
      air = WAVE_AIR + flightPeak(end - start, ride.hit) * Math.sin(f * 40)
      out.airborne = true
      out.wave = 1
      // You hold the punch out, following it with your eyes; the power going out of it
      // still shudders through the arm for a moment.
      out.punch = 1
      out.kick = 0.03 * Math.exp(-t * 6) * Math.sin(t * 90)
    } else {
      // The wall held: the blast bursts against it (the walls and effects show it).
      out.crashed = true
      meter = end
      out.wave = 0
      out.punch = 1 - smooth(LAND_T, 1, t)
    }
    if (t >= 1) out.cheer = smooth(0, STAND_UP, elapsed - ride.duration)
  }
  // From your fist straight down the runway on your own line (`lane`: your spot on the
  // punch line, normally the same as startX).
  const settle = clamp01((meter - start) / 40)
  const x = ride.startX * (1 - settle) + lane * settle
  out.meter = meter
  out.speed = speed
  out.air = air
  out.x = x
  out.size = TIRE_SIZE
  trackPoint(meter, x, BODY_FLAT + air, out.position)
  return out
}

/** The metre the wall that holds a punch stopping at `distance` stands at. */
export const stopWallMeter = (distance, fromMeter) => Math.max(fromMeter + PUSH_AHEAD + 1, distance) + FIST_AHEAD

const _ax = new Vector3(1, 0, 0)
const _ay = new Vector3(0, 1, 0)
const _az = new Vector3(0, 0, 1)
const _qa = new Quaternion()
const _qb = new Quaternion()

/**
 * The body's turn for ride state `st`, facing down the runway (-Z): turned about the
 * vertical to face it, barrel-rolled about the way it's going, then dived forward
 * about its middle. Applied to an avatar that faces +Z.
 */
export function flierTurn(st, out) {
  out.setFromAxisAngle(_ay, Math.PI)
  out.multiply(_qa.setFromAxisAngle(_az, st.roll))
  return out.multiply(_qb.setFromAxisAngle(_ax, st.pitch))
}
