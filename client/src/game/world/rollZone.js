import { CylinderGeometry, SphereGeometry } from 'three'

import { LAUNCH_STAND, PUNCH_HALF_WIDTH, ROLL_ARCH, ROLL_ZONE } from '@shared/world'

import { STYLE } from '../materials'
import { venueOf } from '../sceneStyle'

/** The PUNCH ZONE strip: the one gameplay yellow, the same in every world. */
const STRIP = '#ffd21f'
const PUNCH_RED = '#ff2e3a'
const DISC = new CylinderGeometry(1, 1, 1, 28)
const BALL = new SphereGeometry(1, 16, 12)

/** Height of the arch's beam, and the sign hung on its face. */
const ARCH_TOP = 11
export const ARCH_SIGN = { width: 12, height: 3, y: ARCH_TOP - 1.6, faceZ: ROLL_ARCH.z + 1.05 }

/** A lightning bolt in three slanted bars, on the arch's face at (x, y). */
function addBolt(blocks, x, y, z, flip, color) {
  blocks.add(x + 0.35 * flip, y + 0.75, z, 0.7, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0.9 * flip)
  blocks.add(x, y, z, 1.4, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0)
  blocks.add(x - 0.35 * flip, y - 0.75, z, 0.7, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0.9 * flip)
}

/**
 * The start of the runway: the yellow PUNCH ZONE across its mouth (painted with its name,
 * see signs.js) with navy chevrons pointing down the runway at the walls, a glowing pad at
 * each end, and a big start arch over it with a PUNCH ZONE sign between lightning bolts,
 * crowned by a giant boxing glove - in the venue's colours; the strip itself is the same
 * yellow everywhere. Across its front runs the punch line (LAUNCH_STAND, PUNCH_HALF_WIDTH):
 * a white line, marked every couple of metres, where everyone punching lines up.
 *
 * Boxes go into the world's block set and the round parts into its props, so the whole
 * thing rides in those two draw calls. `detail` (off on LOW) adds the bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on (flush faces flicker, worst on phones' coarser depth buffers).
 */
export function buildRollZone(blocks, props, { detail = true, world = 0 } = {}) {
  const c = venueOf(world).arch
  const { minX, maxX, minZ, maxZ } = ROLL_ZONE
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const w = maxX - minX
  const d = maxZ - minZ

  // The strip: a navy border with the yellow fill raised on it, running right up to the
  // field's edge.
  blocks.addOn(cx, 0, cz + 0.3, w + 1.2, 0.05, d + 0.6, c.base)
  blocks.addOn(cx, 0.05, cz + 0.3, w, 0.05, d - 0.2, STRIP)
  // Chevrons on the strip, pointing down the runway.
  for (const x of [-9, 9]) {
    for (const side of [-1, 1]) {
      blocks.add(x + side * 0.7, 0.12, cz, 2.2, 0.04, 0.6, c.base, STYLE.SMOOTH, side * 0.75)
    }
  }
  // Glowing pads at both ends.
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 2.2)
    props.add(DISC, { position: [x, 0.08, cz + 0.3], scale: [2, 0.12, 2.6], color: '#ffffff' })
    props.add(DISC, { position: [x, 0.15, cz + 0.3], scale: [1.6, 0.06, 2.2], color: STRIP, style: STYLE.GLOW })
  }

  // The punch line: a glowing white line across the strip just in front of where you
  // stand, a short red tick every two metres along it.
  const lineZ = LAUNCH_STAND.z - 0.7
  blocks.add(LAUNCH_STAND.x, 0.13, lineZ, PUNCH_HALF_WIDTH * 2 + 1, 0.04, 0.22, '#ffffff', STYLE.GLOW)
  for (let x = -PUNCH_HALF_WIDTH; x <= PUNCH_HALF_WIDTH + 0.01; x += 2.5) {
    blocks.add(LAUNCH_STAND.x + x, 0.16, lineZ - 0.32, 0.16, 0.04, 0.5, PUNCH_RED, STYLE.SMOOTH)
  }

  // The start arch: striped pillars either side, a beam across the top carrying the
  // sign and a gold crest, and a glowing orb on each pillar.
  const archZ = ROLL_ARCH.z
  const span = ROLL_ARCH.x * 2
  for (const side of [-1, 1]) {
    const x = side * ROLL_ARCH.x
    blocks.addOn(x, 0, archZ, 2.2, 0.8, 2.2, c.base)
    blocks.addOn(x, 0.8, archZ, 1.6, ARCH_TOP - 0.8, 1.6, c.pillar, STYLE.STRIPES)
    blocks.addOn(x, ARCH_TOP + 1.3, archZ, 2.1, 2.1, 2.1, c.crest, STYLE.GLOW)
    if (detail) {
      for (let y = 1.8; y < ARCH_TOP - 0.6; y += 1.1) {
        blocks.add(x, y, archZ + 0.88, 0.3, 0.3, 0.16, Math.round(y) % 2 ? '#ffffff' : c.base, STYLE.GLOW)
      }
    }
  }
  blocks.addOn(0, ARCH_TOP - 0.2, archZ, span + 1, 1.5, 1.3, c.pillar, STYLE.STRIPES)
  blocks.addOn(0, ARCH_TOP - 0.45, archZ, span - 1.4, 0.25, 1.4, c.glow, STYLE.GLOW)
  blocks.addOn(0, ARCH_TOP + 1.3, archZ, span - 4, 0.3, 1, c.base, STYLE.SMOOTH)
  // The sign: a gold-framed navy panel, lettering painted on (signs.js), a lightning bolt
  // either side.
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2 - 0.15, archZ + 0.75, ARCH_SIGN.width + 0.6, ARCH_SIGN.height + 0.3, 0.3, c.crest)
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.8, ARCH_SIGN.width, ARCH_SIGN.height, 0.3, c.base, STYLE.SMOOTH)
  for (const side of [-1, 1]) addBolt(blocks, side * (ARCH_SIGN.width / 2 + 2.1), ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.78, side, c.crest)
  if (detail) {
    for (let x = -ROLL_ARCH.x + 1.5; x <= ROLL_ARCH.x - 1.49; x += 1) {
      if (Math.abs(x) < ARCH_SIGN.width / 2 + 0.7) continue
      blocks.add(x, ARCH_TOP + 0.95, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? c.crest : '#ffffff', STYLE.GLOW)
      blocks.add(x + 0.5, ARCH_TOP + 0.15, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? '#ffffff' : c.crest, STYLE.GLOW)
    }
  }

  // The crown: a giant red boxing glove punching up out of the beam - a white cuff, the
  // fist with its knuckle pad and thumb - with a gold ring glowing behind it.
  const baseY = ARCH_TOP + 1.4
  props.add(DISC, { position: [0, baseY + 0.5, archZ], scale: [1.25, 1.1, 1.25], color: '#ffffff' })
  props.add(DISC, { position: [0, baseY + 1.1, archZ], scale: [1.32, 0.18, 1.32], color: c.crest, style: STYLE.GLOW })
  props.add(BALL, { position: [0, baseY + 2.75, archZ], scale: [1.75, 2.0, 1.8], color: PUNCH_RED })
  props.add(BALL, { position: [0, baseY + 3.85, archZ + 0.35], scale: [1.65, 1.15, 1.6], color: PUNCH_RED })
  props.add(BALL, { position: [1.35, baseY + 2.85, archZ + 0.95], rotation: [0, 0, -0.35], scale: [0.65, 1.15, 0.75], color: '#e8262e' })
  props.add(BALL, { position: [-0.2, baseY + 3.3, archZ + 1.45], scale: [0.55, 0.35, 0.25], color: '#ffffff', style: STYLE.GLOW })
  props.add(DISC, { position: [0, baseY + 3.0, archZ - 1.4], rotation: [Math.PI / 2, 0, 0], scale: [4.4, 0.3, 4.4], color: c.crest, style: STYLE.GLOW })
}
