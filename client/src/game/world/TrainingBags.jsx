import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'

import { TRAIN_INTERVAL } from '@shared/balance'
import { PAD_COUNT, PAD_SIDE, padAt, padCenterZ } from '@shared/world'

import { remotePlayers } from '../../net/remotePlayers'
import { getGame } from '../../store/game'
import { createToyInstances, PropBuilder } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { burst } from '../fx/fxQueue'
import { runtime } from '../runtime'
import { BAG, PAD_THEMES } from './structures'

/**
 * The training bags, one hanging in each training spot's frame (structures.BAG), all in
 * one instanced draw call: a leather bag in its spot's colour with dark bands and caps,
 * hung on a short chain. Each swings on a damped spring about its hook: every punch you
 * land (net/events -> runtime.bagHits) knocks yours away from you, and anyone else
 * punching one keeps it rocking in time with their punches. The bag's swing is all the
 * state; nothing is allocated per frame.
 */

/** Spring stiffness and damping of a hanging bag (radians): a heavy, slow swing. */
const K = 26
const C = 2.6
/** How hard one punch shoves a bag (rad/s), and the most it ever swings. */
const HIT = 2.1
const MAX_SWING = 0.55

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3(1, 1, 1)
const _z = new Vector3(0, 0, 1)
const _x = new Vector3(1, 0, 0)
const _twist = new Quaternion()

/** One bag, hung from its hook at the origin: chain, cap, body with bands, bottom cap. */
function createBagGeometry() {
  const p = new PropBuilder()
  const chain = BAG.pivotY - (BAG.bottomY + BAG.height)
  const r = BAG.radius
  const bodyMid = -chain - BAG.height / 2
  p.add(new CylinderGeometry(0.035, 0.035, chain, 6), { position: [0, -chain / 2, 0], color: '#9aa4b2' })
  p.add(new CylinderGeometry(r * 0.55, r * 0.95, 0.16, 16), { position: [0, -chain - 0.02, 0], color: '#2a2a30' })
  // The body: white here, tinted the spot's colour per bag (instance colour).
  p.add(new CylinderGeometry(r, r, BAG.height, 18, 1), { position: [0, bodyMid, 0], color: '#ffffff', style: STYLE.SMOOTH })
  for (const y of [-chain - 0.22, bodyMid, -chain - BAG.height + 0.2]) {
    p.add(new CylinderGeometry(r + 0.025, r + 0.025, 0.09, 18, 1), { position: [0, y, 0], color: '#2a2a30' })
  }
  p.add(new SphereGeometry(r, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { position: [0, -chain - BAG.height, 0], scale: [1, 0.4, 1], color: '#2a2a30' })
  return p.build()
}

export function TrainingBags() {
  const ref = useRef(null)
  const bags = useMemo(() => {
    const mesh = createToyInstances(createBagGeometry(), sharedMaterials().toy, PAD_COUNT)
    mesh.count = PAD_COUNT
    mesh.castShadow = true
    // Each bag in its spot's colour.
    const tint = new Color()
    for (let i = 0; i < PAD_COUNT; i += 1) {
      mesh.setColorAt(i, tint.set(PAD_THEMES[i].top))
      _p.set(BAG.x, BAG.pivotY, padCenterZ(i))
      mesh.setMatrixAt(i, _m.compose(_p, _q.identity(), _s))
    }
    mesh.instanceColor.needsUpdate = true
    return mesh
  }, [])
  /** Per bag: swing angle and speed, the last hit seen, and when a remote puncher last hit it. */
  const state = useRef(null)
  state.current ??= Array.from({ length: PAD_COUNT }, () => ({ a: 0, v: 0, twist: 0, seen: 0, remoteAt: 0 }))
  const busy = useRef(new Uint8Array(PAD_COUNT))

  useEffect(
    () => () => {
      bags.geometry.dispose()
      bags.dispose()
    },
    [bags],
  )

  useFrame((frame, rawDelta) => {
    const mesh = ref.current
    if (!mesh) return
    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    // Who else is punching which bag (their anim is 'run' on a spot).
    const remote = busy.current
    remote.fill(0)
    for (const r of remotePlayers.values()) {
      if (r.anim !== 'run' || (r.world || 0) !== (getGame().profile.world || 0)) continue
      const pad = padAt(r.position.x, r.position.z, 0.6)
      if (pad >= 0) remote[pad] = 1
    }
    for (let i = 0; i < PAD_COUNT; i += 1) {
      const s = state.current[i]
      const hit = runtime.bagHits[i] || 0
      if (hit !== s.seen && now >= hit) {
        s.seen = hit
        // Your punch landing: the bag knocked away from you (out along PAD_SIDE), a
        // twist, and a spray of sparks off it (presets with particles).
        s.v += PAD_SIDE * HIT * (0.85 + Math.random() * 0.3)
        s.twist = (Math.random() - 0.5) * 0.4
        burst({ x: BAG.x - PAD_SIDE * 0.5, y: BAG.bottomY + BAG.height * 0.6, z: padCenterZ(i), count: 7, palette: 'power', speed: 5 })
      }
      if (remote[i] && now - s.remoteAt > TRAIN_INTERVAL * 1000) {
        s.remoteAt = now
        s.v += PAD_SIDE * HIT * 0.8
      }
      s.v += (-K * s.a - C * s.v) * delta
      s.a = Math.max(-MAX_SWING, Math.min(MAX_SWING, s.a + s.v * delta))
      s.twist *= 1 - Math.min(1, delta * 1.5)
      _q.setFromAxisAngle(_z, s.a)
      _twist.setFromAxisAngle(_x, s.twist * Math.sin(now * 0.004 + i))
      _q.multiply(_twist)
      _p.set(BAG.x, BAG.pivotY, padCenterZ(i))
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={bags} />
}

export default TrainingBags
