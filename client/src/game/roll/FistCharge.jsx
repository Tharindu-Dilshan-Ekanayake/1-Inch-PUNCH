import { useFrame } from '@react-three/fiber'

import { launch } from '../launch'
import { runtime } from '../runtime'
import { roll } from './rollControl'

/**
 * The power gathering in your fist as you charge a punch: your right glove lights up from
 * inside (armStyles' charge glow), brighter as the meter fills, throbbing slowly once
 * it's full, and fading out as the punch is thrown. Nothing flies off it: the punch's
 * force is unseen, and you see it only in the walls breaking (Walls.jsx).
 *
 * Writes runtime.player.charge (0-1) each frame for your avatar to show; draws nothing.
 */
export default function FistCharge() {
  useFrame((frame) => {
    const t = frame.clock.elapsedTime
    // Charging, or the beat of wind-up before the punch is thrown.
    const charging = !roll.active && (launch.gripping || launch.released)
    const winding = roll.active && roll.phase === 'launch' && roll.punch < 0.6
    if (!charging && !winding) {
      runtime.player.charge = 0
      return
    }
    const level = charging ? (launch.released ? 1 : launch.charge) : 1
    const full = charging ? launch.full : true
    const throb = full ? 0.82 + 0.18 * Math.sin(t * 7) : 1
    const fade = winding ? 1 - roll.punch / 0.6 : 1
    runtime.player.charge = (0.15 + 0.6 * level) * throb * fade
  })
  return null
}
