import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { isPadUnlocked } from '@shared/logic'
import { clampToWalkable, groundHeightAt, LAUNCH_STAND, PAD_YAW, padAt, punchSpotX, STATIC_COLLIDERS } from '@shared/world'

import { sfx } from '../audio/sfx'
import { getGame } from '../store/game'
import ErrorBoundary from '../ui/ErrorBoundary'
import FallbackAvatar from './FallbackAvatar'
import PlayerAvatar from './PlayerAvatar'
import { RUN_CADENCE } from './kick'
import { cancelPull, isPulling, launch, updatePull } from './launch'
import { BAG_PUNCH_TIME, BODY, STRIKE_TIME } from './playerPose'
import { roll } from './roll/rollControl'
import { runtime } from './runtime'
import useKeyboard from './useKeyboard'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const WALK_SPEED = 10.875
const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Ledges up to this high are walked straight onto (the showroom's back stage). */
const STEP_UP = 1.05
/** Pushing the stick this hard while charging a punch walks you out of your stance. */
const WALK_OFF = 0.6
/** Stepping up to the punch line (m/s): brisk, but under the server's speed check. */
const STEP_TO_LINE = 9

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }
const _pivot = new Vector3()
const _hip = new Vector3()

/** Pushes a circle out of an axis-aligned rect. Returns true on contact. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return false

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (RADIUS - d) / d
    pos.x += dx * push
    pos.z += dz * push
    return true
  }

  // Centre inside the rect (spawned in, or a wall appeared on top of us): leave by the
  // nearest side.
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
  return true
}

/**
 * The local player: a kinematic character controller.
 *
 * No physics engine: the world is flat ground, a few raised floors and a list of
 * rectangular walls, which a circle-vs-rect push-out handles exactly. That saves the
 * ~2 MB Rapier WASM download and keeps the active rigid body count at zero.
 *
 * Press PUNCH in the PUNCH ZONE (launch.js) and you step onto the punch spot and take your
 * stance while the meter charges; press it again and the punch is sent. While it plays your
 * logical position stays on the spot (what the server checks) while your avatar lunges
 * off it and smashes fist-first down the walls (roll/path.rideState), diving flat and,
 * on a PERFECT, drilling round about its middle. At a training bag you face it (east) and
 * punch it: a jab and a cross.
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: WALK_SPEED,
    vy: 0,
    stride: 0,
    grip: -1,
  })

  // The blob shadow follows the character (or, flying, the point under it).
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    motion.time += delta

    const group = groupRef.current
    const visual = visualRef.current

    // --- The punch spot: in your stance, charging ---------------------------------
    const pulling = !roll.active && isPulling()
    if (pulling && launch.snap) {
      // Just pressed PUNCH: your spot is the punch line straight ahead of where you stand
      // (everyone punching lines up side by side), facing down the walls.
      launch.snap = false
      launch.spotX = punchSpotX(pos.x)
      velocity.current.set(0, 0, 0)
    }

    // --- Input, relative to the camera ----------------------------------------
    _input.set(0, 0, 0)
    const still = player.frozen || launch.released
    if (!still) {
      _input.set(
        (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX,
        0,
        (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY,
      )
    }
    const inputLength = Math.min(1, _input.length())

    if (inputLength > 0.02) {
      _input.normalize()
      // Flatten the camera's forward onto the ground plane so "up" always means
      // "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
        .multiplyScalar(WALK_SPEED * inputLength)
    } else {
      _move.set(0, 0, 0)
    }

    if (pulling) {
      // In your stance you stay on the spot; pushing the stick hard walks you out of it
      // (no punch). Waiting on the authority after letting go, you stay put either way.
      if (launch.gripping && inputLength > WALK_OFF) {
        cancelPull()
        sfx.stretchStop()
      } else {
        _move.set(0, 0, 0)
      }
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps.
    const blend = 1 - Math.exp(-ACCELERATION * delta)
    velocity.current.lerp(_move, blend)

    // --- Horizontal move + collision --------------------------------------------
    const prevX = pos.x
    const prevZ = pos.z
    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta
    if (pulling && isPulling()) {
      // Stepping up to your spot on the punch line, then holding it.
      const dx = launch.spotX - pos.x
      const dz = LAUNCH_STAND.z - pos.z
      const d = Math.hypot(dx, dz)
      const step = STEP_TO_LINE * delta
      if (d <= step) {
        pos.x = launch.spotX
        pos.z = LAUNCH_STAND.z
      } else {
        pos.x += (dx / d) * step
        pos.z += (dz / d) * step
      }
    }
    updatePull(now)

    for (const rect of STATIC_COLLIDERS) pushOut(pos, rect)
    for (const rect of runtime.dynamicColliders) pushOut(pos, rect)
    clampToWalkable(pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    // A ledge too tall to step onto acts as a wall.
    let floor = groundHeightAt(pos.x, pos.z)
    if (floor - pos.y > STEP_UP) {
      pos.x = prevX
      pos.z = prevZ
      floor = groundHeightAt(pos.x, pos.z)
    }

    // --- Vertical ---------------------------------------------------------------
    const wantJump = !still && (k.jump || joy.jump)
    // Jumping drops your stance (no punch).
    if (wantJump && pulling) cancelPull()
    if (wantJump && player.grounded) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    pos.y += vy.current * delta

    if (pos.y <= floor) {
      // Coming down from a jump (not just stepping off a kerb) lands with a thump.
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      pos.y = floor
      vy.current = 0
      player.grounded = true
    } else if (pos.y - floor > 0.05) {
      // Walked off a ledge, or still rising from a jump.
      player.grounded = false
    }

    // --- Facing -----------------------------------------------------------------
    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    // Standing still at an unlocked bag: punching it, facing it.
    const pad = padAt(pos.x, pos.z)
    const training = pad >= 0 && player.grounded && speed < 0.5 && !still && isPadUnlocked(getGame().profile, pad)
    if (training) player.yaw = PAD_YAW
    else if (pulling) player.yaw = Math.PI
    else if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)

    // --- Where the body is: on the ground (punching on the spot, too) ------------
    motion.grip = -1
    motion.strain = 0
    motion.punch = 0
    motion.windup = 0
    motion.kick = 0
    motion.pitch = 0
    motion.fly = 0
    motion.sprawl = 0
    motion.cheer = 0
    motion.tuck = 0
    motion.squat = 0
    if (roll.active) {
      // The punch: on your spot, facing the walls - the move (a crouch, a spinning jump,
      // landing in your stance), the punch thrown and held while its blast smashes down
      // the runway, then a cheer (rollControl/path).
      _pivot.set(pos.x, pos.y + BODY.pivot + roll.hop, pos.z)
      motion.grip = roll.grip
      motion.strain = roll.strain
      motion.punch = roll.punch
      motion.windup = roll.windup
      motion.kick = roll.kick
      motion.cheer = roll.cheer
      motion.tuck = roll.tuck
      motion.squat = roll.squat
      if (visual) visual.quaternion.setFromAxisAngle(_up, Math.PI + roll.spin)
    } else {
      // Step-ups ease in over a few frames on the visual only; the logical position
      // snaps so collision and triggers stay exact.
      const shownY = group ? group.position.y : pos.y
      const steppingUp = player.grounded && pos.y > shownY
      const y = steppingUp ? shownY + (pos.y - shownY) * Math.min(1, delta * 18) : pos.y
      _pivot.set(pos.x, y + BODY.pivot, pos.z)
      if (pulling) {
        // In your stance, winding up as the meter charges; at full charge you shiver
        // with the power held back.
        motion.grip = 0
        motion.strain = launch.released ? 1 : launch.charge
      }
      if (visual) {
        _targetQuat.setFromAxisAngle(_up, player.yaw)
        visual.quaternion.slerp(_targetQuat, pulling ? 1 : 1 - Math.pow(0.0005, delta))
      }
    }
    if (group && visual) {
      // The body turns and dives about its middle: the group sits under the middle, and
      // the visual is offset so that point stays put whichever way it's turned.
      group.position.set(_pivot.x, _pivot.y - BODY.pivot, _pivot.z)
      _hip.set(0, BODY.pivot, 0).applyQuaternion(visual.quaternion)
      visual.position.set(-_hip.x, BODY.pivot - _hip.y, -_hip.z)
    }
    shownAt.set(_pivot.x, pos.y, _pivot.z)

    // --- Publish motion ---------------------------------------------------------
    player.speed = speed
    player.anim = !player.grounded ? 'jump' : pulling ? 'pull' : training ? 'run' : speed > 0.5 ? 'walk' : 'idle'

    motion.speed = speed
    motion.grounded = player.grounded
    motion.vy = vy.current
    // At a bag: a punch of the combo (jab, cross, hook, uppercut) for each hit, timed so it
    // lands as the bag takes it (net/events: player.bagPunchAt), the guard in between.
    motion.run = 0
    const sinceBag = (now - player.bagPunchAt) / 1000 / BAG_PUNCH_TIME
    motion.bagPunch = training && sinceBag >= 0 && sinceBag < 1 ? Math.max(0.001, sinceBag) : 0
    motion.bagCombo = player.bagCombo
    // A click punch (punchInput.js), over whatever else you're doing - not in your stance,
    // and not at a bag (the bag's own punch shows it).
    const sinceStrike = (now - player.strikeAt) / 1000 / STRIKE_TIME
    motion.strike = !roll.active && !pulling && !training && sinceStrike >= 0 && sinceStrike < 1 ? Math.max(0.001, sinceStrike) : 0
    motion.strikeSide = player.strikeSide
    motion.stride += delta * (training ? RUN_CADENCE : 5 + 6 * Math.min(1, speed / WALK_SPEED))
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} />
          </Suspense>
        </ErrorBoundary>
      </group>
    </group>
  )
}

export default Player
