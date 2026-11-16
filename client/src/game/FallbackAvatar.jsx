import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { beltFor } from '@shared/balance'

import { getGame } from '../store/game'
import { armBase } from './armStyles'
import { createBoxInstances, disposeBlocks } from './blocks'
import { sharedMaterials, STYLE } from './materials'
import { computePose } from './playerPose'

/** Classic 5-stud figure scaled to the 1.8-unit player: one stud = S world units. */
const S = 0.36

/**
 * Parts as [pivot x, pivot y, width, height, depth, colour, joint, below, role]: limbs
 * hang from their pivot and turn by their joint's pose (`below`: how far under the pivot
 * the part starts - a glove hangs past the end of its arm); head and torso are centred.
 * A karate gi: white top and trousers, the belt round the waist and boxing gloves (both
 * recoloured to what you wear: `role`). The figure faces +Z, so its right side is -X.
 */
const PARTS = [
  [0, 4.5, 1.2, 1, 1, '#f5cd47', null, 0],
  [0, 3, 2, 2, 1, '#f4f4f0', null, 0],
  [0, 2.25, 2.14, 0.34, 1.12, '#f4f4f0', null, 0, 'belt'],
  [1.5, 4, 1, 2, 1, '#f4f4f0', 'ArmL1', 0],
  [-1.5, 4, 1, 2, 1, '#f4f4f0', 'ArmR1', 0],
  [1.5, 4, 1.25, 1, 1.25, '#ff3b3b', 'ArmL1', 1.75, 'glove'],
  [-1.5, 4, 1.25, 1, 1.25, '#ff3b3b', 'ArmR1', 1.75, 'glove'],
  [0.5, 2, 1, 2, 1, '#e8e8e2', 'LegL1', 0],
  [-0.5, 2, 1, 2, 1, '#e8e8e2', 'LegR1', 0],
].map(([x, y, w, h, d, color, joint, below, role]) => ({ x: x * S, y: y * S, w: w * S, h: h * S, d: d * S, color: new Color(color), joint, below: below * S, role }))

const RIGHT_ARM = PARTS.find((part) => part.joint === 'ArmR1' && !part.role)

const _m = new Matrix4()
const _pivot = new Matrix4()
const _rot = new Matrix4()
const _q = new Quaternion()
const _e = new Euler(0, 0, 0, 'XZY')
const _p = new Vector3()
const _s = new Vector3()
const _tint = new Color()

/**
 * A classic blocky character, shown while the Bloxity avatar downloads (and instead of
 * it if it can't load), so the player is never invisible. Six boxes in one instanced
 * draw call through the shared toy material - no extra shader program. Posed by the
 * same playerPose as the real avatar (its limbs have no elbows or knees).
 *
 * @param {{ motionRef: React.MutableRefObject<object>, handRef?: React.MutableRefObject<object>, onReady?: () => void }} props
 */
export function FallbackAvatar({ motionRef, handRef, onReady }) {
  const ref = useRef(null)
  const mesh = useMemo(() => {
    const m = createBoxInstances(PARTS.length, sharedMaterials().toy, STYLE.SMOOTH)
    PARTS.forEach((part, i) => m.setColorAt(i, part.color))
    m.count = PARTS.length
    m.castShadow = true
    return m
  }, [])

  useEffect(() => () => disposeBlocks(mesh), [mesh])

  useEffect(() => {
    onReady?.()
  }, [onReady])

  /** What the belt and gloves were last painted as. */
  const painted = useRef({ rebirths: -1, tire: null })

  useFrame(() => {
    const instanced = ref.current
    if (!instanced) return
    const { rebirths, equippedTire } = getGame().profile
    const seen = painted.current
    if (seen.rebirths !== rebirths || seen.tire !== equippedTire) {
      seen.rebirths = rebirths
      seen.tire = equippedTire
      const belt = beltFor(rebirths).color
      const glove = armBase(equippedTire)
      PARTS.forEach((part, i) => {
        if (part.role === 'belt') instanced.setColorAt(i, _tint.set(belt))
        else if (part.role === 'glove') instanced.setColorAt(i, _tint.set(glove))
      })
      if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    }
    const pose = computePose(motionRef.current)
    PARTS.forEach((part, i) => {
      const joint = part.joint ? pose.bones[part.joint] : null
      _pivot.makeTranslation(part.x, part.y + pose.lift, 0)
      _q.setFromEuler(joint ? _e.set(joint.swing, joint.twist, joint.sway) : _e.set(0, 0, 0))
      _rot.makeRotationFromQuaternion(_q)
      // Rubber arms: longer and thinner as they stretch.
      const stretch = part.joint === 'ArmL1' ? pose.stretchL : part.joint === 'ArmR1' ? pose.stretchR : 1
      const thin = part.role ? 1 : Math.min(1.15, Math.max(0.5, 1 / Math.sqrt(Math.max(0.3, stretch))))
      const h = part.h * (part.role ? 1 : stretch)
      _p.set(0, joint ? -h / 2 - part.below * stretch : 0, 0)
      _s.set(part.w * thin, h, part.d * thin)
      _m.compose(_p, _q.identity(), _s)
      instanced.setMatrixAt(i, _pivot.multiply(_rot).multiply(_m))

      // Anything held rides at the bottom of the right arm, turned with it.
      const hand = handRef?.current
      if (part === RIGHT_ARM && hand) {
        hand.position.set(0, -h + 0.06, 0).applyEuler(_e)
        hand.position.x += part.x
        hand.position.y += part.y + pose.lift
        hand.quaternion.setFromEuler(_e)
      }
    })
    instanced.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default FallbackAvatar
