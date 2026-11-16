import { CylinderGeometry, SphereGeometry, TorusGeometry } from 'three'

import {
  COURT_BACK_X,
  COURT_HALF,
  PAD_COUNT,
  PAD_HEIGHT,
  PAD_RADIUS,
  PAD_SIDE,
  PAD_X,
  padCenterZ,
  SHOP_SIGN,
  SHOP_SIGN_FACING,
  SHOP_STAGES,
  TABLE_NEAR_X,
} from '@shared/world'

import { STYLE } from '../materials'
import { venueOf } from '../sceneStyle'

/**
 * Static lobby structures, added to the world's shared BlockSet and prop builder so they
 * render in the same few draw calls as the grandstands.
 */

/**
 * Per-bag look, in pad order (matches PADS in shared/balance.js): the mat's base, top,
 * glowing ring and centre emblem, the bag frame's posts and the bag itself (`screen`), the
 * practice floor beyond it, and the colour of its labels. `beach` ones (Palm Beach's
 * bags) have surfboard posts and a surfboard and palm on top of their board.
 */
export const PAD_THEMES = [
  { base: '#1f5fc8', top: '#3f9cff', ring: '#9fe8ff', emblem: '#ffffff', rail: '#1d5fd6', court: '#2c4fa8', screen: '#5fd6ff', text: '#5fd6ff' },
  { base: '#b8222e', top: '#ff3b3b', ring: '#ffd21f', emblem: '#1d1f22', rail: '#c8323c', court: '#a8323c', screen: '#ffd21f', text: '#ff7a6a' },
  { base: '#d64a9a', top: '#ff8fd0', ring: '#ffffff', emblem: '#ffd23f', rail: '#d63f8f', court: '#b8467e', screen: '#ffffff', text: '#ff9cd6' },
  { base: '#1d3f8a', top: '#2f6fe0', ring: '#7fe2ff', emblem: '#ffd21f', rail: '#173b8f', court: '#26408a', screen: '#7fe2ff', text: '#7fb8ff' },
  { base: '#5a2a9a', top: '#8a4cff', ring: '#ff7ad9', emblem: '#ffffff', rail: '#6a2fd0', court: '#4a2a8a', screen: '#ff7ad9', text: '#c69bff' },
  { base: '#1a8ab8', top: '#7ff0ff', ring: '#ffffff', emblem: '#9b6bff', rail: '#14a3c9', court: '#1f7aa8', screen: '#ffffff', text: '#9fe8ff', style: STYLE.GLOW },
  { base: '#1b2266', top: '#2a1450', ring: '#c35cff', emblem: '#ffd21f', rail: '#2a1450', court: '#1b1f5c', screen: '#ffd21f', text: '#d39bff', style: STYLE.GALAXY },
  // Palm Beach's beach bars: sand and surf, then a deep-sea wave.
  { base: '#e8c27a', top: '#ffe29a', ring: '#3fd8ff', emblem: '#ff7a3a', rail: '#2fb8e0', court: '#d9b46a', screen: '#3fd8ff', text: '#5fe6ff', beach: true },
  { base: '#0b4f8a', top: '#1a8fd8', ring: '#7ff6ff', emblem: '#ffffff', rail: '#0a6fb8', court: '#0b3f72', screen: '#7ff6ff', text: '#7ff6ff', style: STYLE.GLOW, beach: true },
]

/**
 * Each training bag (TrainingBags.jsx swings them): hanging just beyond the mat's middle
 * (PAD_SIDE) - in front of you as you stand there facing it - from a hook under its frame's beam.
 * `x` its line, `pivotY` the hook, then the bag's radius, its height and its bottom.
 */
export const BAG = { x: PAD_X + PAD_SIDE * 1.05, pivotY: PAD_HEIGHT + 3.3, radius: 0.42, height: 1.35, bottomY: PAD_HEIGHT + 0.72 }
/** How far either side of the bag its frame's posts stand. */
const FRAME_Z = 1.25
const LINE = '#f4f7fb'
const LEG = '#3a3f4a'
const STEEL = '#c9d2de'
/** The multiplier backboard: high above the bar, and compact. Labels centre on it (lobbyLabels). */
export const BOARD_BOTTOM = 4.8
export const BOARD_HEIGHT = 3.6

const DISC = new CylinderGeometry(1, 1, 1, 24)
const RING = new TorusGeometry(1, 0.08, 4, 28)
const CYL = new CylinderGeometry(1, 1, 1, 12)
const BALL = new SphereGeometry(1, 12, 8)

/**
 * A bar's gym floor, beyond its mat (PAD_SIDE): a coloured floor with white lines and a low barrier
 * at the back. Boxes go in `blocks`: no draw calls of their own. (The bar itself stands
 * over the mat: buildPullUpBar.)
 */
function buildCourt(blocks, z, theme) {
  const courtStart = TABLE_NEAR_X - PAD_SIDE * 0.4
  const courtLength = Math.abs(COURT_BACK_X - courtStart)
  const courtX = (courtStart + COURT_BACK_X) / 2
  blocks.addOn(courtX, 0, z, courtLength, 0.05, COURT_HALF * 2, theme.court, STYLE.SMOOTH)
  // Its lines stand 4 cm proud of the floor (nothing within 3 cm of another surface).
  for (const s of [-1, 1]) blocks.addOn(courtX, 0.05, z + s * (COURT_HALF - 0.15), courtLength - 0.3, 0.04, 0.12, LINE, STYLE.SMOOTH)
  blocks.addOn(COURT_BACK_X - PAD_SIDE * 0.3, 0.05, z, 0.12, 0.04, COURT_HALF * 2 - 0.42, LINE, STYLE.SMOOTH)

  // The barrier across the back: panels in two colours with a glowing top.
  for (let i = 0; i < 3; i += 1) {
    const pz = z - COURT_HALF + (i + 0.5) * ((COURT_HALF * 2) / 3)
    blocks.addOn(COURT_BACK_X, 0, pz, 0.22, 0.75, (COURT_HALF * 2) / 3 - 0.06, i % 2 ? theme.top : '#1f2a5c', STYLE.SMOOTH)
  }
  blocks.addOn(COURT_BACK_X, 0.75, z, 0.26, 0.08, COURT_HALF * 2, theme.ring, STYLE.GLOW)
}

/** A dumbbell lying along Z at (x, y, z): a steel handle and a weight each end. */
function addDumbbell(props, x, y, z, color, size = 1) {
  props.add(CYL, { position: [x, y, z], rotation: [Math.PI / 2, 0, 0], scale: [0.05 * size, 0.7 * size, 0.05 * size], color: STEEL })
  for (const s of [-1, 1]) {
    props.add(DISC, { position: [x, y, z + s * 0.3 * size], rotation: [Math.PI / 2, 0, 0], scale: [0.2 * size, 0.12 * size, 0.2 * size], color })
  }
}

/**
 * The bag's frame over the mat (the trainee stands at its centre facing out along
 * PAD_SIDE, the bag hanging in front of them): two posts in the bag's colour with glowing
 * caps either side of it and a beam across with the hook the bag swings from, then beyond the mat a
 * weights bench with a rack of dumbbells and, behind it, the big backboard the bag's
 * multiplier label (labels/lobbyLabels.js) hangs in front of.
 *
 * Everything beyond x = TABLE_NEAR_X stays inside the pad's static collider
 * (shared/world.js), so what you can't walk through is what's drawn.
 */
function buildBagFrame(blocks, props, z, theme) {
  const top = PAD_HEIGHT
  const height = BAG.pivotY - top + 0.25
  const fx = BAG.x
  // The frame: a post either side of the bag (surfboards on a beach bag), feet, glowing caps.
  for (const s of [-1, 1]) {
    const pz = z + s * FRAME_Z
    blocks.addOn(fx, top, pz, 0.8, 0.14, 0.8, LEG, STYLE.SMOOTH)
    if (theme.beach) {
      props.add(BALL, { position: [fx, top + (height + 0.4) / 2, pz], scale: [0.36, (height + 0.4) / 2, 0.14], color: theme.rail })
      props.add(BALL, { position: [fx, top + (height + 0.4) / 2, pz], scale: [0.08, (height + 0.2) / 2, 0.15], color: '#ffffff' })
    } else {
      blocks.addOn(fx, top + 0.14, pz, 0.34, height, 0.34, theme.rail, STYLE.SMOOTH)
      blocks.addOn(fx, top + 0.7, pz, 0.38, 0.09, 0.38, theme.ring, STYLE.GLOW)
    }
    blocks.addOn(fx, top + height + 0.3, pz, 0.46, 0.18, 0.46, theme.ring, STYLE.GLOW)
  }
  // The beam across the tops, and the hook in its middle.
  blocks.addOn(fx, top + height, z, 0.42, 0.34, FRAME_Z * 2 + 0.5, theme.rail, STYLE.SMOOTH)
  props.add(CYL, { position: [fx, BAG.pivotY + 0.1, z], scale: [0.14, 0.14, 0.14], color: STEEL })
  // A practice dummy's mark on the mat where you stand, facing the bag.
  props.add(RING, { position: [PAD_X - PAD_SIDE * 0.05, top + 0.05, z], rotation: [Math.PI / 2, 0, 0], scale: [0.55, 0.55, 1], color: '#ffffff', style: STYLE.GLOW })

  // Beyond the mat: a weights bench and a rack of dumbbells, in the bar's colours.
  const cx = PAD_X + PAD_SIDE * 3.4
  const bench = cx - PAD_SIDE * 0.6
  const rack = cx + PAD_SIDE * 0.7
  blocks.addOn(bench, 0, z, 1.0, 0.42, 1.9, LEG, STYLE.SMOOTH)
  blocks.addOn(bench, 0.42, z, 1.1, 0.16, 2.0, theme.rail, STYLE.SMOOTH)
  blocks.addOn(rack, 0, z, 0.7, 1.05, 2.0, '#2a2f3a', STYLE.SMOOTH)
  blocks.addOn(rack, 1.05, z, 0.8, 0.06, 2.1, theme.ring, STYLE.GLOW)
  for (let i = 0; i < 3; i += 1) addDumbbell(props, rack, 0.35 + i * 0.32, z + (i - 1) * 0.2, i === 1 ? theme.top : '#2a2f3a', 0.85 + i * 0.12)
  addDumbbell(props, bench, 0.78, z, theme.screen, 1)

  // The backboard behind it, kept small and high so the follow camera behind the trainee
  // (on the plaza side of the mat, looking out) sees it over their head rather than a wall of it: a
  // navy panel in a rail-coloured frame with a glowing border in the bar's ring colour,
  // on two thin posts, a gold dumbbell on top.
  const bx = PAD_X + PAD_SIDE * 5.6
  /** Its face, towards the plaza. */
  const face = (d) => bx - PAD_SIDE * d
  const by = BOARD_BOTTOM
  const bh = BOARD_HEIGHT
  for (const s of [-1, 1]) blocks.addOn(bx, 0, z + s * 1.5, 0.25, by, 0.25, LEG, STYLE.SMOOTH)
  blocks.addOn(bx, by, z, 0.4, bh, 4.2, theme.rail, STYLE.SMOOTH)
  blocks.addOn(face(0.23), by + 0.2, z, 0.08, bh - 0.4, 3.8, '#141a3a', STYLE.SMOOTH)
  blocks.addOn(face(0.28), by + 0.12, z, 0.06, 0.1, 3.9, theme.ring, STYLE.GLOW)
  blocks.addOn(face(0.28), by + bh - 0.22, z, 0.06, 0.1, 3.9, theme.ring, STYLE.GLOW)
  for (const s of [-1, 1]) blocks.addOn(face(0.28), by + 0.2, z + s * 1.9, 0.06, bh - 0.4, 0.1, theme.ring, STYLE.GLOW)
  if (theme.beach) {
    // A surfboard standing on end on top, and a little palm beside it.
    props.add(BALL, { position: [bx, by + bh + 1.0, z - 0.7], scale: [0.14, 0.95, 0.34], color: theme.ring })
    props.add(BALL, { position: [bx, by + bh + 1.0, z - 0.7], scale: [0.15, 0.8, 0.07], color: '#ffffff' })
    blocks.addOn(bx, by + bh, z + 0.9, 0.22, 1.5, 0.22, '#9a6a3a', STYLE.SMOOTH)
    blocks.add(bx, by + bh + 1.62, z + 0.9, 1.6, 0.18, 0.5, '#2fae4a', STYLE.SMOOTH, 0.4)
    blocks.add(bx, by + bh + 1.66, z + 0.9, 0.5, 0.16, 1.6, '#4cd36a', STYLE.SMOOTH, 0.4)
  } else {
    addDumbbell(props, bx, by + bh + 0.45, z, '#ffd21f', 1.6)
  }
}

/**
 * The training spots: round two-tier mats in the bag's colours with a glowing ring round
 * the top, each with its bag frame over it and a practice floor beyond. The rounded parts go
 * into the world's props, the rest into its blocks: no draw calls of their own.
 */
export function buildPads(blocks, props) {
  for (let i = 0; i < PAD_COUNT; i += 1) {
    const theme = PAD_THEMES[i]
    const z = padCenterZ(i)
    const r = PAD_RADIUS
    props.add(DISC, { position: [PAD_X, PAD_HEIGHT * 0.4, z], scale: [r + 0.25, PAD_HEIGHT * 0.8, r + 0.25], color: theme.base })
    props.add(DISC, { position: [PAD_X, PAD_HEIGHT - 0.06, z], scale: [r, 0.14, r], color: theme.top, style: theme.style ?? STYLE.STUDS })
    props.add(RING, { position: [PAD_X, PAD_HEIGHT + 0.02, z], rotation: [Math.PI / 2, 0, 0], scale: [r - 0.25, r - 0.25, 1], color: theme.ring, style: STYLE.GLOW })
    // The mat's emblem: a glowing disc either side of where you stand.
    for (const s of [-1, 1]) {
      props.add(CYL, { position: [PAD_X - PAD_SIDE * 1.6, PAD_HEIGHT + 0.03, z + s * 1.35], scale: [0.4, 0.04, 0.4], color: theme.emblem === '#1d1f22' ? '#ffffff' : theme.emblem })
      props.add(CYL, { position: [PAD_X - PAD_SIDE * 1.6, PAD_HEIGHT + 0.08, z + s * 1.35], scale: [0.22, 0.04, 0.22], color: theme.ring, style: STYLE.GLOW })
    }
    buildBagFrame(blocks, props, z, theme)
    buildCourt(blocks, z, theme)
  }
}

const WHITE = '#f4f7fb'

/**
 * The arm shop: two open display stages (the stands on them are TireShop's) and the big
 * ARM SHOP sign behind, built like the start arch - white decks on a yellow band with
 * gold light strips round the edges. `detail` (off on LOW) adds the sign's bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on.
 */
export function buildShop(blocks, { detail = true, world = 0 } = {}) {
  const { band: YELLOW, strip: PALE, post: GOLD, panel: NAVY } = venueOf(world).shop
  for (const s of SHOP_STAGES) {
    const w = s.maxX - s.minX
    const d = s.maxZ - s.minZ
    const cx = (s.minX + s.maxX) / 2
    const cz = (s.minZ + s.maxZ) / 2
    blocks.addOn(cx, -0.1, cz, w, s.height + 0.1, d, WHITE)
    blocks.addOn(cx, 0, cz, w + 0.3, s.height * 0.5, d + 0.3, YELLOW)
    // Light strips along all four top edges, and a gold post at each corner.
    for (const side of [-1, 1]) {
      blocks.addOn(cx + side * (w / 2 - 0.25), s.height, cz, 0.35, 0.08, d - 1.4, PALE, STYLE.GLOW)
      blocks.addOn(cx, s.height, cz + side * (d / 2 - 0.25), w - 1.4, 0.08, 0.35, PALE, STYLE.GLOW)
      for (const end of [-1, 1]) {
        blocks.addOn(cx + side * (w / 2 - 0.35), s.height, cz + end * (d / 2 - 0.35), 0.6, 0.7, 0.6, GOLD, STYLE.GLOW)
      }
    }
  }

  // The sign: two striped legs, a navy panel in a yellow frame, a gold cap, its face
  // turned to the plaza (`f`).
  const { x, minZ, maxZ, top } = SHOP_SIGN
  const f = SHOP_SIGN_FACING
  const length = maxZ - minZ
  const midZ = (minZ + maxZ) / 2
  const bottom = top - 8.2
  for (const z of [minZ + 1.5, maxZ - 1.5]) blocks.addOn(x - 0.1 * f, 0, z, 0.9, bottom + 0.3, 0.9, YELLOW, STYLE.STRIPES)
  blocks.addOn(x, bottom, midZ, 0.6, top - bottom, length, YELLOW)
  blocks.addOn(x + 0.1 * f, bottom + 0.5, midZ, 0.6, top - bottom - 1, length - 1, NAVY, STYLE.SMOOTH)
  blocks.addOn(x, top, midZ, 0.9, 0.4, length + 0.4, GOLD, STYLE.GLOW)
  if (detail) {
    for (let z = minZ + 1; z <= maxZ - 0.99; z += 1.5) {
      blocks.add(x + 0.42 * f, bottom + 0.25, z, 0.16, 0.3, 0.3, Math.round(z) % 2 ? '#ffffff' : GOLD, STYLE.GLOW)
      blocks.add(x + 0.42 * f, top - 0.25, z + 0.75, 0.16, 0.3, 0.3, Math.round(z) % 2 ? GOLD : '#ffffff', STYLE.GLOW)
    }
  }
}
