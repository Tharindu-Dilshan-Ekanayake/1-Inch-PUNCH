/**
 * The player's body language, shared by the Bloxity avatar and the blocky stand-in so
 * both move the same way: a karate fighter's.
 *
 * `computePose` turns the motion state into joint angles; each avatar applies them to its
 * own limbs. Angles are radians in character space (the character faces +Z, its left
 * side is +X), about each joint's pivot:
 *   swing - about X: negative swings a hanging limb forward (arm up in front, knee up);
 *           on the spine and neck, which point up, negative bends them back
 *   sway  - about Z: positive moves a limb towards +X
 *   twist - about Y: positive turns the right shoulder forward
 * `lift` raises (or, to keep bent legs on the ground, lowers) the body, in metres.
 * `stretchL` / `stretchR` are how long each arm is against its rest length - always 1
 * here (the template's rubber arms stretched them); the avatars still honour them.
 */

export const POSED_BONES = [
  'Spine1',
  'Neck1',
  'ArmL1',
  'ArmL2',
  'ArmR1',
  'ArmR2',
  'LegL1',
  'LegL2',
  'LegR1',
  'LegR2',
]

/** Written by `computePose` every frame; one shared result, never reallocated. */
export const pose = {
  lift: 0,
  stretchL: 1,
  stretchR: 1,
  bones: Object.fromEntries(POSED_BONES.map((name) => [name, { swing: 0, sway: 0, twist: 0 }])),
}

/**
 * The 1.8 m character's measurements: shoulder height and how far out from the middle,
 * arm length (shoulder to palm), and the pivot the body turns about when it dives (its
 * middle). Measured on Bloxity's player.glb fitted to 1.8 m.
 */
export const BODY = { shoulderY: 1.35, shoulderX: 0.56, arm: 0.63, pivot: 0.9 }

/** Sway sign that moves a limb away from the body, per side. */
const OUT_L = 1
const OUT_R = -1

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Adds to a joint, scaled by weight `w`. */
function add(name, swing, sway, twist, w) {
  const b = pose.bones[name]
  b.swing += swing * w
  b.sway += sway * w
  b.twist += twist * w
}

// --- Arms -------------------------------------------------------------------------

/**
 * The karate punch's arms: the lead fist held out at the target (upper arm raised forward
 * this far, turned in this far, the elbow a little bent) and the chambered fist pulled
 * back to the hip (upper arm swung back, out from the body, the forearm folded forward).
 */
const STANCE = { turn: 0.3, leadUp: -1.3, leadIn: -0.12, leadFore: -0.45, chamberBack: 0.55, chamberOut: 0.15, chamberFore: -2.0 }

/** The boxing guard: upper arm forward and in, forearm folded up, the glove by the chin. */
const GUARD = { upper: -0.62, inward: 0.22, fore: -1.95 }

/** One arm (`side` 'L' or 'R') in the guard, `extend` (0-1) of the way to a straight punch. */
function arm(side, extend, w, drop = 0) {
  const out = side === 'L' ? OUT_L : OUT_R
  const e = clamp01(extend)
  add(`Arm${side}1`, lerp(GUARD.upper + drop, -1.52, e), lerp(-GUARD.inward, -0.18, e) * out, 0, w)
  add(`Arm${side}2`, lerp(GUARD.fore, -0.08, e), 0, 0, w)
}

/**
 * Fighting stance, fists up: lead (left) foot forward, knees soft, a light bounce on the
 * balls of the feet, the gloves by the chin.
 */
function guard(w, time) {
  const bounce = Math.abs(Math.sin(time * 4.2))
  add('LegL1', -0.2, 0.08 * OUT_L, 0, w)
  add('LegL2', 0.22, 0, 0, w)
  add('LegR1', 0.18, 0.08 * OUT_R, 0, w)
  add('LegR2', 0.26, 0, 0, w)
  add('Spine1', 0.08, 0, -0.12, w)
  add('Neck1', -0.08, 0, 0.1, w)
  arm('L', 0.04 + 0.03 * bounce, w)
  arm('R', 0, w, 0.08)
  pose.lift += (-0.06 + bounce * 0.025) * w
}

/**
 * Walk to sprint: the legs swing and the body bobs once per step; the fists stay up,
 * pumping with the stride. `phase` advances faster with speed, so the steps quicken.
 */
function stride(phase, ratio) {
  const cycle = Math.sin(phase)
  const leg = 0.85 * ratio
  add('LegL1', cycle * leg, 0, 0, 1)
  add('LegR1', -cycle * leg, 0, 0, 1)
  // Knees fold on the back swing only.
  add('LegL2', Math.max(0, -cycle) * 1.1 * ratio, 0, 0, 1)
  add('LegR2', Math.max(0, cycle) * 1.1 * ratio, 0, 0, 1)
  add('Spine1', (0.06 + 0.1 * ratio) * ratio, 0, cycle * 0.12 * ratio, 1)
  // Arms pump against the legs, elbows bent, fists loose.
  add('ArmL1', -cycle * 0.7 * ratio - 0.2 * ratio, 0.08 * OUT_L * ratio, 0, 1)
  add('ArmR1', cycle * 0.7 * ratio - 0.2 * ratio, 0.08 * OUT_R * ratio, 0, 1)
  add('ArmL2', -1.2 * ratio, 0, 0, 1)
  add('ArmR2', -1.2 * ratio, 0, 0, 1)
  pose.lift += (Math.abs(Math.cos(phase)) * 0.05 - 0.015) * ratio
}

/** In the air: one knee up on the way up; falling, the legs reach down for the ground. */
function airborne(vy) {
  const f = smooth(0, 1, clamp01((2 - vy) / 9))
  add('LegL1', lerp(-1.3, -0.35, f), 0.08 * OUT_L, 0, 1)
  add('LegL2', lerp(1.6, 0.25, f), 0, 0, 1)
  add('LegR1', lerp(0.25, -0.1, f), 0.08 * OUT_R, 0, 1)
  add('LegR2', lerp(0.5, 0.2, f), 0, 0, 1)
  add('Spine1', lerp(0.15, -0.06, f), 0, 0, 1)
  // Fists up and out for balance.
  add('ArmL1', -1.1, 0.5 * OUT_L, 0, 1)
  add('ArmR1', -1.1, 0.5 * OUT_R, 0, 1)
  add('ArmL2', -1.2, 0, 0, 1)
  add('ArmR2', -1.2, 0, 0, 1)
}

/**
 * One punch at a training bag, `t` (0-1) through it, from the combo the bag work cycles
 * through (`kind`: 0 jab, 1 cross, 2 hook, 3 uppercut), thrown with the whole body: from
 * the guard it loads (the hips turn away, the weight sinks), snaps out (the hips and
 * shoulders whip round into it, the weight drops onto the front leg, the back heel
 * drives) and lands at BAG_IMPACT, holds a beat and comes back to the guard.
 */
export const BAG_IMPACT = 0.26
/** Seconds one punch at a bag takes, out and back (a little under TRAIN_INTERVAL). */
export const BAG_PUNCH_TIME = 0.55
/** Seconds from a bag punch starting to it landing: the bag swings and thwacks then. */
export const BAG_LAND_S = BAG_IMPACT * BAG_PUNCH_TIME
const COMBO = ['jab', 'cross', 'hook', 'uppercut']

function bagPunch(t, kind, w) {
  const which = COMBO[((kind % 4) + 4) % 4]
  const load = t < 0.16 ? smooth(0, 0.16, t) : 1 - smooth(0.16, BAG_IMPACT, t)
  const e = t < BAG_IMPACT ? smooth(0.12, BAG_IMPACT, t) : 1 - smooth(0.42, 0.95, t)
  // The impact's jolt back up the arm.
  const jolt = t > BAG_IMPACT && t < BAG_IMPACT + 0.12 ? Math.sin(((t - BAG_IMPACT) / 0.12) * Math.PI) * 0.08 : 0
  const right = which === 'cross' || which === 'uppercut'
  // Legs: a fighting stance, the front knee bending deeper into the punch, the back leg driving.
  add('LegL1', -0.3 - 0.22 * e, 0.1 * OUT_L, 0, w)
  add('LegL2', 0.32 + 0.3 * e, 0, 0, w)
  add('LegR1', 0.3 + (right ? 0.22 : 0.08) * e, 0.1 * OUT_R, 0, w)
  add('LegR2', 0.28 - 0.1 * e, 0, 0, w)
  // The body: wound away as it loads, whipped round into the punch, leaning into it.
  const into = { jab: -0.32, cross: 0.66, hook: -0.78, uppercut: 0.5 }[which]
  const turn = -into * 0.35 * load + into * e
  add('Spine1', 0.1 + 0.18 * e - 0.06 * load + (which === 'uppercut' ? -0.12 * e : 0), 0, turn, w)
  add('Neck1', -0.1 - 0.1 * e, 0, -turn * 0.75, w)
  const side = right ? 'R' : 'L'
  const out = right ? OUT_R : OUT_L
  if (which === 'jab' || which === 'cross') {
    arm(side, e - jolt, w)
  } else if (which === 'hook') {
    // Elbow up at shoulder height, the forearm bent square, swept round across the front.
    add(`Arm${side}1`, lerp(GUARD.upper, -1.5, smooth(0, 0.5, e + load * 0.3)), lerp(-GUARD.inward, 0.85 - 0.75 * e, e + load * 0.4) * out, 0, w)
    add(`Arm${side}2`, lerp(GUARD.fore, -1.55, e + load * 0.4), 0, 0, w)
  } else {
    // Dropped low as it loads, then driven up through the middle, elbow bent.
    add(`Arm${side}1`, lerp(lerp(GUARD.upper, -0.3, load), -1.65, e), lerp(-GUARD.inward, -0.05, e) * out, 0, w)
    add(`Arm${side}2`, lerp(lerp(GUARD.fore, -2.3, load), -1.7, e), 0, 0, w)
  }
  // The other fist stays up guarding the chin.
  arm(right ? 'L' : 'R', 0, w, 0.08)
  // Sinking into it, and (the uppercut) springing up out of a dip.
  const dip = which === 'uppercut' ? 0.16 * load - 0.06 * e : 0.04 * load
  pose.lift -= (0.09 + 0.07 * e + dip) * w
}

/**
 * Punching a training bag over and over (`phase` advances one punch every
 * TRAIN_INTERVAL): the combo of bagPunch, one punch per turn of the phase. (Other
 * players' bag work; yours is timed to each hit landing instead: computePose `bagPunch`.)
 */
function bagWork(phase, w) {
  const rep = Math.floor(phase / (Math.PI * 2))
  bagPunch(phase / (Math.PI * 2) - rep, rep, w)
}

/**
 * The spinning jump before the punch (`w` how tucked up, 0-1): knees drawn up high, the
 * fists pulled in tight by the chest, the body upright and compact - a spin goes faster
 * tucked in.
 */
function spinJump(time, w) {
  add('LegL1', -1.45, 0.06 * OUT_L, 0, w)
  add('LegL2', 1.95, 0, 0, w)
  add('LegR1', -1.15, 0.06 * OUT_R, 0, w)
  add('LegR2', 1.8, 0, 0, w)
  add('Spine1', 0.18, 0, 0, w)
  add('Neck1', -0.12, 0, 0, w)
  add('ArmL1', -0.85, -0.35 * OUT_L, 0, w)
  add('ArmL2', -2.05, 0, 0, w)
  add('ArmR1', -0.85, -0.35 * OUT_R, 0, w)
  add('ArmR2', -2.05, 0, 0, w)
  pose.lift += 0.12 * w
}

/**
 * In your stance on the punch spot, charging (`strain` 0-1): a karate front stance -
 * lead (left) foot forward, its knee bent, the back leg long - the lead fist held out in
 * front, aimed at the wall, and the punching (right) fist pulled back to the hip,
 * chambered. As the meter fills you sink lower and draw the fist further back, the
 * shoulders turning away from the target while the eyes stay on it; at full charge, a
 * slow, heavy throb of the power held in. `windup` (0-1) is the beat before the punch:
 * one last coil.
 */
function punchStance(strain, time, w, windup = 0) {
  const s = clamp01(strain)
  const c = clamp01(windup)
  const breathe = Math.sin(time * 5) * 0.015 * (1 - c)
  const throb = Math.sin(time * 16) * 0.015 * smooth(0.92, 1, s)
  add('LegL1', -0.55 - 0.12 * s - 0.05 * c, 0.1 * OUT_L, 0, w)
  add('LegL2', 0.55 + 0.2 * s + 0.08 * c, 0, 0, w)
  add('LegR1', 0.42 + 0.08 * s + 0.05 * c, 0.1 * OUT_R, 0, w)
  add('LegR2', 0.12 + 0.05 * s, 0, 0, w)
  const turn = STANCE.turn + 0.15 * s + 0.15 * c
  add('Spine1', 0.06 + 0.04 * s + throb, 0, -turn, w)
  add('Neck1', -0.06, 0, turn * 0.9, w)
  add('ArmL1', STANCE.leadUp - 0.05 * s, STANCE.leadIn * OUT_L, 0, w)
  add('ArmL2', STANCE.leadFore + 0.1 * s, 0, 0, w)
  add('ArmR1', STANCE.chamberBack + 0.15 * s + 0.12 * c + throb, STANCE.chamberOut * OUT_R, 0, w)
  add('ArmR2', STANCE.chamberFore - 0.1 * s, 0, 0, w)
  pose.lift -= (0.1 + 0.08 * s + 0.03 * c + breathe) * w
}

/**
 * The punch thrown, on the spot (`w` its weight): a karate reverse punch - the right fist
 * driven straight out at shoulder height onto the centre line, the left snapped back to
 * the hip, the hips and shoulders turned hard into it, the front knee deep and the back
 * leg straight, driving. `kick` (-0.1..0.2) is the snap past straight and back, so the
 * punch overshoots and settles instead of stopping dead; held, the power still hums
 * through the arm.
 */
function punchOut(time, w, kick = 0) {
  const tremor = Math.sin(time * 30) * 0.01
  add('ArmR1', -1.5 - 0.1 * kick + tremor, 0.2 * -OUT_R, 0, w)
  add('ArmR2', -0.05 + 0.1 * Math.max(0, -kick), 0, 0, w)
  add('ArmL1', STANCE.chamberBack, STANCE.chamberOut * OUT_L, 0, w)
  add('ArmL2', STANCE.chamberFore, 0, 0, w)
  add('Spine1', 0.1 + 0.15 * kick, 0, 0.42 + 0.4 * kick, w)
  add('Neck1', -0.08, 0, -0.38 - 0.3 * kick, w)
  add('LegL1', -0.62 - 0.15 * kick, 0.1 * OUT_L, 0, w)
  add('LegL2', 0.62 + 0.15 * kick, 0, 0, w)
  add('LegR1', 0.48 + 0.08 * kick, 0.1 * OUT_R, 0, w)
  add('LegR2', 0.04, 0, 0, w)
  pose.lift -= (0.14 + 0.06 * kick) * w
}

/**
 * The flying punch (the holder lies the body down head first): the right fist driven
 * out ahead, the left drawn in by the chest, legs straight out behind and fluttering,
 * head up to see the walls coming.
 */
function flying(time, w) {
  const flutter = Math.sin(time * 14) * 0.08
  add('ArmR1', -3.05, 0.05 * OUT_R, 0, w)
  add('ArmR2', -0.05, 0, 0, w)
  add('ArmL1', -0.9, 0.35 * OUT_L, 0, w)
  add('ArmL2', -2.1, 0, 0, w)
  add('LegL1', 0.12 + flutter, 0.1 * OUT_L, 0, w)
  add('LegR1', 0.12 - flutter, 0.1 * OUT_R, 0, w)
  add('LegL2', 0.1, 0, 0, w)
  add('LegR2', 0.1, 0, 0, w)
  add('Spine1', -0.12, 0, 0, w)
  add('Neck1', -0.75, 0, 0, w)
}

/** Knocked flat by the wall that held: arms and legs splayed out like a starfish, head up. */
function sprawled(time, w) {
  add('ArmL1', -2.4, 0.9 * OUT_L, 0, w)
  add('ArmR1', -2.4, 0.9 * OUT_R, 0, w)
  add('ArmL2', -0.4, 0, 0, w)
  add('ArmR2', -0.4, 0, 0, w)
  add('LegL1', 0.1, 0.35 * OUT_L, 0, w)
  add('LegR1', 0.1, 0.35 * OUT_R, 0, w)
  add('Neck1', -0.6 + Math.sin(time * 9) * 0.05, 0, 0, w)
}

/** Fists up and pumping, bouncing on the spot: the celebration once you're up again. */
function cheering(time, w) {
  const pump = Math.sin(time * 10)
  add('ArmL1', -2.75 + pump * 0.25, 0.32 * OUT_L, 0, w)
  add('ArmR1', -2.75 - pump * 0.25, 0.32 * OUT_R, 0, w)
  add('ArmL2', -0.5 - Math.max(0, pump) * 0.6, 0, 0, w)
  add('ArmR2', -0.5 - Math.max(0, -pump) * 0.6, 0, 0, w)
  add('LegL1', -0.12, 0.06 * OUT_L, 0, w)
  add('LegR1', -0.12, 0.06 * OUT_R, 0, w)
  add('LegL2', 0.22, 0, 0, w)
  add('LegR2', 0.22, 0, 0, w)
  add('Spine1', -0.1, 0, 0, w)
  add('Neck1', -0.15, 0, 0, w)
  pose.lift += Math.abs(Math.sin(time * 7)) * 0.16 * w
}

/** Seconds a click punch takes, out and back (game/punchInput.js). */
export const STRIKE_TIME = 0.32

/** Scales a joint's angles by `k` (making room for something laid over them). */
function fade(name, k) {
  const b = pose.bones[name]
  b.swing *= k
  b.sway *= k
  b.twist *= k
}

const ARMS = ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2']

/**
 * A click punch laid over whatever the body is doing (`t` 0-1 through it; `side` 0 the
 * lead/left jab, 1 the rear/right cross): the arms are taken over for it - the punching
 * fist snaps straight out and comes back a little slower, the other held up by the chin
 * - and the shoulders turn into it, while the legs carry on walking or standing.
 */
function strikeOver(t, side) {
  const out = t < 0.3 ? smooth(0, 0.3, t) : 1 - smooth(0.3, 1, t)
  const w = t < 0.12 ? t / 0.12 : t > 0.82 ? (1 - t) / 0.18 : 1
  for (const name of ARMS) fade(name, 1 - w)
  arm(side ? 'R' : 'L', out, w)
  arm(side ? 'L' : 'R', 0, w, 0.08)
  add('Spine1', 0.04 * out, 0, (side ? 0.38 : -0.22) * out, w)
  add('Neck1', 0, 0, (side ? -0.22 : 0.12) * out, w)
}

/**
 * @param {{ time?: number, speed?: number, maxSpeed?: number, grounded?: boolean,
 *   vy?: number, stride?: number, run?: number, grip?: number, strain?: number,
 *   pitch?: number, fly?: number, sprawl?: number, cheer?: number,
 *   emote?: string|null }} motion
 *   `run` (0-1) is punching a training bag (`stride` is the punch's phase); the name is
 *   the template's, and what other players are told ('run').
 *   `grip` 0 or more means in your punch stance (below 0: not); `strain` (0-1) how far
 *   the wind-up has charged, and `punch` (0-1) how far the punch is thrown (the arm
 *   straight out at 1). `pitch` is how far a holder dives the body (unused by punches).
 *   `fly` (0-1) is the flying punch; `sprawl` (0-1) knocked flat by the wall that held
 *   and `cheer` (0-1) up and celebrating.
 *   `strike` (0-1, 0 none) is how far through a click punch you are, `strikeSide` its
 *   fist (0 left, 1 right): laid over everything else (strikeOver).
 *   `emote` is a Boxity emote id to play over this pose, or null. It isn't posed here:
 *   the Bloxity avatar blends the emote clip on top of this pose (avatarRig.updateEmote),
 *   so the same motion object drives both.
 */
export function computePose(motion) {
  bodyPose(motion)
  const bag = motion.bagPunch ?? 0
  if (bag > 0 && bag < 1) {
    // Your punch at a bag, timed to its hit landing (Player.jsx), over the guard.
    for (const name of POSED_BONES) fade(name, 0)
    pose.lift = 0
    bagPunch(bag, motion.bagCombo ?? 0, 1)
    return pose
  }
  const strike = motion.strike ?? 0
  if (strike > 0 && strike < 1) strikeOver(strike, motion.strikeSide ?? 1)
  return pose
}

/** Everything but a click punch (computePose lays that over it). */
function bodyPose(motion) {
  const {
    time = 0,
    speed = 0,
    maxSpeed = 6,
    grounded = true,
    vy = 0,
    stride: phase = time * 5,
    run = 0,
    grip = -1,
    strain = 0,
    punch = 0,
    windup = 0,
    kick = 0,
    fly = 0,
    sprawl = 0,
    cheer = 0,
  } = motion
  for (const name of POSED_BONES) {
    const b = pose.bones[name]
    b.swing = 0
    b.sway = 0
    b.twist = 0
  }
  pose.lift = 0
  pose.stretchL = 1
  pose.stretchR = 1

  // The punch: the stance (charging), snapping into the punch thrown as `punch` rises -
  // and before it, the spinning jump (`tuck`: how tucked up in the air).
  const thrown = clamp01(punch)
  const tuck = clamp01(motion.tuck ?? 0)
  if (grip >= 0 || tuck > 0) {
    const stance = 1 - tuck
    if (tuck > 0) spinJump(time, tuck)
    if (stance > 0 && thrown < 1) punchStance(strain, time, stance * (1 - thrown), windup)
    if (stance > 0 && thrown > 0) punchOut(time, stance * thrown, kick)
    const squat = clamp01(motion.squat ?? 0)
    if (squat > 0) {
      // Squatting deeper (the crouch before the jump, the dip landing): thighs forward,
      // knees bent twice as far, leaning in to balance - the hips dropping to keep the
      // feet on the ground.
      add('LegL1', -0.7, 0, 0, squat)
      add('LegL2', 1.4, 0, 0, squat)
      add('LegR1', -0.55, 0, 0, squat)
      add('LegR2', 1.2, 0, 0, squat)
      add('Spine1', 0.3, 0, 0, squat)
      pose.lift -= 0.2 * squat
    }
    return pose
  }
  if (thrown > 0 || fly > 0 || sprawl > 0 || cheer > 0) {
    if (thrown > 0) punchOut(time, thrown, kick)
    if (fly > 0) flying(time, fly)
    if (sprawl > 0) sprawled(time, sprawl)
    if (cheer > 0) cheering(time, cheer)
    const rest = clamp01(1 - thrown - fly - sprawl - cheer)
    if (rest > 0) guard(rest, time)
    return pose
  }
  if (run > 0 && grounded) {
    bagWork(phase, clamp01(run))
    return pose
  }
  const ratio = grounded ? clamp01(speed / Math.max(maxSpeed, 0.001)) : 0
  if (grounded) {
    const still = 1 - smooth(0.05, 0.4, ratio)
    if (still > 0) guard(still, time)
    if (ratio > 0.02) stride(phase, ratio)
  } else {
    airborne(vy)
  }
  return pose
}
