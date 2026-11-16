import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { PAD_YAW } from '@shared/world'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { emoteFromAnim } from '../../bloxity/emotes'
import { RUN_CADENCE } from '../kick'

import { BloxityAvatar } from '../PlayerAvatar'

/** How often the set of fully drawn players is reconsidered. */
const PICK_MS = 500
/** Top walking speed: full stride amplitude, as for your own character. */
const MAX_SPEED = 10.875
const _up = new Vector3(0, 1, 0)


/**
 * One other player as their real Bloxity avatar, dressed as they are - arms painted as
 * the arms they've equipped - and posed by the same playerPose as yours, from what the
 * network says they're doing: walking pace, pull-ups on a bar, jumping, stretching back
 * on the launch posts. Their launches fly the avatar itself down the runway, replayed
 * from the same numbers as yours (RemotePlayers works the flight out: `r.flight`).
 */
function RemoteAvatar({ sessionId, look }) {
  const groupRef = useRef(null)
  const innerRef = useRef(null)
  const lastY = useRef(null)
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: MAX_SPEED, vy: 0, stride: 0, grip: -1 })
  const armsId = useCallback(() => remotePlayers.get(sessionId)?.tireId || 'bicycle', [sessionId])
  const beltRebirths = useCallback(() => remotePlayers.get(sessionId)?.rebirths || 0, [sessionId])

  useFrame((_state, rawDelta) => {
    const group = groupRef.current
    const inner = innerRef.current
    const r = remotePlayers.get(sessionId)
    if (!group || !inner || !r) return
    const delta = Math.min(rawDelta, 0.05)
    const m = motionRef.current
    m.time += delta
    group.visible = true
    m.grip = -1
    m.strain = 0
    m.pitch = 0
    m.fly = 0
    m.sprawl = 0
    m.cheer = 0
    m.tuck = 0
    m.squat = 0
    m.punch = 0
    m.windup = 0
    m.kick = 0
    m.run = 0
    m.emote = null

    if (r.flying) {
      // Their punch: on their punch spot, facing the walls - the wind-up, the punch
      // thrown and held while its blast flies, then a cheer (path.rideState).
      const st = r.flight
      group.position.copy(r.position)
      group.position.y += st.hop
      group.quaternion.setFromAxisAngle(_up, Math.PI + st.spin)
      inner.position.set(0, 0, 0)
      inner.quaternion.identity()
      m.grip = st.grip
      m.strain = st.strain
      m.punch = st.punch
      m.windup = st.windup
      m.kick = st.kick
      m.cheer = st.cheer
      m.tuck = st.tuck
      m.squat = st.squat
      m.speed = 0
      m.grounded = true
      return
    }

    inner.position.set(0, 0, 0)
    inner.quaternion.identity()
    group.position.copy(r.position)
    const running = r.anim === 'run'
    if (r.pulling) {
      // Charging a punch on the spot: in their stance, facing down the walls, winding up.
      group.quaternion.setFromAxisAngle(_up, Math.PI)
      m.grip = 0
      m.strain = 0.6 + 0.4 * Math.abs(Math.sin(m.time * 3))
      m.speed = 0
      m.grounded = true
      return
    }
    group.quaternion.setFromAxisAngle(_up, running ? PAD_YAW : r.yaw)
    // At a bag: punching it, as yours does.
    m.run = running ? 1 : 0

    const speed = running ? 0 : r.speed
    m.speed = speed
    m.grounded = r.anim !== 'jump'
    // A Boxity emote they're playing (stood still while it lasts).
    m.emote = emoteFromAnim(r.anim)
    if (m.emote) m.speed = 0
    // Vertical speed from the interpolated height, smoothed: rising vs falling.
    const y = r.position.y
    if (lastY.current !== null) m.vy += ((y - lastY.current) / Math.max(delta, 1e-3) - m.vy) * 0.3
    lastY.current = y
    m.stride += delta * (running ? RUN_CADENCE : 5 + 6 * Math.min(1, speed / MAX_SPEED))
  })

  return (
    <group ref={groupRef}>
      <group ref={innerRef}>
        <BloxityAvatar equipped={look?.equipped} proportions={look?.proportions} motionRef={motionRef} armsId={armsId} beltRebirths={beltRebirths} targetHeight={1.8} />
      </group>
    </group>
  )
}

/**
 * The other players nearest the camera, as their real avatars - standing, walking or
 * training: as many as the quality preset allows (`remoteAvatars`), within
 * `remoteAvatarDistance` - on every preset, everyone in the room, near or far. Anyone
 * beyond those limits would be the cheap blocky figure RemotePlayers draws
 * (`r.fullAvatar` tells it who's covered).
 * Chosen twice a second, never per frame, so React only re-renders when the set of
 * players (or an outfit) actually changes.
 */
export function RemoteAvatars() {
  const camera = useThree((s) => s.camera)
  const [shown, setShown] = useState([])

  useEffect(() => {
    const pick = () => {
      const settings = getQuality()
      const near = []
      for (const r of remotePlayers.values()) {
        r.fullAvatar = false
        const d = camera.position.distanceTo(r.position)
        if (d < settings.remoteAvatarDistance) near.push([d, r])
      }
      near.sort((a, b) => a[0] - b[0])
      const next = near
        .slice(0, settings.remoteAvatars)
        .map(([, r]) => r)
        .sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1))
      for (const r of next) r.fullAvatar = true
      setShown((prev) => {
        const same = prev.length === next.length && prev.every((p, i) => p.sessionId === next[i].sessionId && p.lookKey === next[i].lookKey)
        return same ? prev : next.map((r) => ({ sessionId: r.sessionId, look: r.look, lookKey: r.lookKey }))
      })
    }
    pick()
    const id = setInterval(pick, PICK_MS)
    return () => clearInterval(id)
  }, [camera])

  return (
    <>
      {shown.map((s) => (
        <Suspense key={`${s.sessionId}:${s.lookKey}`} fallback={null}>
          <RemoteAvatar sessionId={s.sessionId} look={s.look} />
        </Suspense>
      ))}
    </>
  )
}

export default RemoteAvatars
