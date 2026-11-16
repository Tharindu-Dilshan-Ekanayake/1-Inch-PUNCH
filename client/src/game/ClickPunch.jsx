import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { clickPunch } from './punchInput'

/** A press that moves less than this (px) and lets go within CLICK_MS is a click, not a camera drag. */
const CLICK_SLOP = 8
const CLICK_MS = 350

/**
 * Click (or tap) the game to punch: a press on the canvas that barely moves and lets go
 * quickly - dragging still turns the camera (FollowCamera), and the touch joystick and
 * buttons are their own elements, so they never punch.
 */
export function ClickPunch() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const el = gl.domElement
    const presses = new Map()
    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      presses.set(e.pointerId, { x: e.clientX, y: e.clientY, at: performance.now() })
    }
    const onUp = (e) => {
      const press = presses.get(e.pointerId)
      presses.delete(e.pointerId)
      if (!press) return
      const now = performance.now()
      // A second finger down (a pinch zoom) is never a punch.
      if (presses.size > 0 || now - press.at > CLICK_MS) return
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return
      clickPunch(now)
    }
    const onCancel = (e) => presses.delete(e.pointerId)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [gl])

  return null
}

export default ClickPunch
