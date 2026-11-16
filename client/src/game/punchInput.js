import { PUNCH_INTERVAL } from '@shared/balance'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame } from '../store/game'
import { isPulling, punchButton } from './launch'
import { roll } from './roll/rollControl'
import { runtime } from './runtime'

/**
 * Throws a punch: in the Punch Zone, whatever pressing PUNCH would (take your stance, or
 * let the punch go); anywhere else a jab or a cross, the fists taking turns (the pose:
 * playerPose `strike`), and the authority grants its Power - at your training bag, as
 * one of the bag's punches. At most one every PUNCH_INTERVAL.
 */
export function clickPunch(now = performance.now()) {
  if (punchButton.press) {
    punchButton.press()
    return
  }
  const game = getGame()
  if (roll.active || game.roll || game.rollResult || game.panel || isPulling() || runtime.player.frozen) return
  if (now - runtime.player.strikeAt < PUNCH_INTERVAL * 1000) return
  runtime.player.strikeAt = now
  runtime.player.strikeSide = 1 - runtime.player.strikeSide
  sfx.punchSwing()
  actions.punch()
}
