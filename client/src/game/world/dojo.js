import { CylinderGeometry } from 'three'

import { DOJO_FLOOR, DOJO_WALL_X, DUMMY, GONG, LANTERNS, MAKIWARA, NOBORI, PAD_COUNT, padCenterZ, PLAZA } from '@shared/world'
import { hash2 } from '@shared/rng'

import { STYLE } from '../materials'

/**
 * The lobby's dojo (both worlds): the training bags stand on a tatami floor framed in
 * polished wood, with the dojo's back wall behind them just past the plaza's edge - dark
 * posts, wooden wainscot, glowing shoji screens, a dark tiled roof leaning out over them,
 * paper lanterns hanging from its eave and a hanging scroll between each pair of posts
 * (the scrolls' lettering is painted: signs.js). Round the plaza: stone lanterns along the
 * path, a big gong in a vermilion frame by the punch zone, tall banners on poles (nobori,
 * lettered in signs.js), a practice yard of wooden striking posts (makiwara) and a wooden
 * dummy, and clumps of bamboo beyond the edges.
 *
 * Boxes go in the world's block set, the round parts in its props: no draw calls of their
 * own, nothing done per frame. What stands in the plaza is solid (shared/world.js
 * STATIC_COLLIDERS). Parts that touch are stacked at least 3 cm apart (no z-fighting).
 * `detail` false (LOW) leaves out the bamboo, the dummy and half the eave lanterns.
 */

const WOOD = { dark: '#3a2418', mid: '#7a4a2a', light: '#a8743f', floor: '#b07a46' }
const VERMILION = '#d22a2a'
const STONE = ['#a3a6a8', '#8f9496']
const TILE = '#46505e'
const TATAMI = '#d8c88a'
const BAMBOO = ['#6fb13e', '#8cc84a', '#5a9a34']
const BAMBOO_LEAF = ['#4f9f3a', '#62b444']

const CYL = new CylinderGeometry(1, 1, 1, 14)

/** Posts along the back wall: between the bags, and at both ends. */
function wallPosts() {
  const zs = []
  for (let i = 0; i <= PAD_COUNT; i += 1) zs.push(padCenterZ(i) + 2.7)
  return zs
}

/** The tatami floor under the bags, framed in wood. */
function addFloor(blocks) {
  const f = DOJO_FLOOR
  const w = f.maxX - f.minX
  const d = f.maxZ - f.minZ
  const cx = (f.minX + f.maxX) / 2
  const cz = (f.minZ + f.maxZ) / 2
  blocks.addOn(cx, 0, cz, w, 0.06, d, TATAMI, STYLE.TATAMI)
  // The wooden frame round it, a step higher.
  blocks.addOn(cx, 0, f.minZ - 0.25, w + 1, 0.12, 0.5, WOOD.floor, STYLE.PLANKS)
  blocks.addOn(cx, 0, f.maxZ + 0.25, w + 1, 0.12, 0.5, WOOD.floor, STYLE.PLANKS)
  blocks.addOn(f.minX - 0.25, 0, cz, 0.5, 0.12, d, WOOD.floor, STYLE.PLANKS)
  blocks.addOn(f.maxX + 0.25, 0, cz, 0.5, 0.12, d, WOOD.floor, STYLE.PLANKS)
  // A wooden walkway (engawa) from the floor to the back wall.
  const walk = DOJO_WALL_X + 0.2 - (f.minX - 0.5)
  blocks.addOn((DOJO_WALL_X + 0.2 + f.minX - 0.5) / 2, 0, cz, Math.abs(walk), 0.09, d + 1, WOOD.floor, STYLE.PLANKS)
}

/** The back wall: posts, wainscot, shoji screens, a beam, the tiled roof and its eave lanterns. */
function addWall(blocks, props, detail) {
  const posts = wallPosts()
  const z0 = posts[posts.length - 1]
  const z1 = posts[0]
  const length = z1 - z0
  const mid = (z0 + z1) / 2
  const x = DOJO_WALL_X
  for (const z of posts) blocks.addOn(x + 0.35, 0, z, 0.6, 7.2, 0.6, WOOD.dark, STYLE.SMOOTH)
  // Between each pair: wainscot below, a shoji screen above (each 3 cm behind the posts' faces).
  for (let i = 0; i < posts.length - 1; i += 1) {
    const zc = (posts[i] + posts[i + 1]) / 2
    const span = posts[i] - posts[i + 1] - 0.6
    blocks.addOn(x + 0.2, 0, zc, 0.36, 1.4, span, WOOD.mid, STYLE.PLANKS)
    blocks.addOn(x + 0.1, 1.4, zc, 0.2, 5, span, '#fbf3e0', STYLE.SHOJI)
  }
  // The beam along the top, and the roof leaning out over the walkway, its ridge behind.
  blocks.addOn(x + 0.35, 7.2, mid, 0.7, 0.5, length + 0.6, WOOD.dark, STYLE.SMOOTH)
  blocks.add(x + 1.6, 8.1, mid, 6.4, 0.36, length + 3, TILE, STYLE.BRICK, 0, 0, -0.36)
  blocks.add(x - 1.35, 9.25, mid, 0.6, 0.5, length + 3.2, '#2f3742', STYLE.SMOOTH)
  // Its fascia board along the eave, vermilion, and paper lanterns hanging under it.
  blocks.add(x + 4.5, 6.98, mid, 0.18, 0.5, length + 3, VERMILION, STYLE.SMOOTH, 0, 0, -0.36)
  posts.forEach((z, i) => {
    if (!detail && i % 2) return
    props.add(CYL, { position: [x + 4.1, 5.9, z], scale: [0.36, 0.75, 0.36], color: i % 2 ? '#ffffff' : VERMILION, style: STYLE.GLOW })
    blocks.add(x + 4.1, 6.33, z, 0.5, 0.12, 0.5, '#1b1b1f', STYLE.SMOOTH)
    blocks.add(x + 4.1, 5.47, z, 0.5, 0.12, 0.5, '#1b1b1f', STYLE.SMOOTH)
  })
  // The scrolls' wooden rods (the scroll itself is painted: signs.js DOJO_SCROLLS).
  for (let i = 0; i < posts.length - 1; i += 1) {
    const zc = (posts[i] + posts[i + 1]) / 2
    blocks.add(x + 0.3, 5.75, zc, 0.14, 0.14, 1.5, WOOD.dark, STYLE.SMOOTH)
    blocks.add(x + 0.3, 3.05, zc, 0.14, 0.14, 1.5, WOOD.dark, STYLE.SMOOTH)
  }
}

/** A stone lantern (toro): base, shaft, platform, a glowing light box, a stepped roof and finial. */
function addStoneLantern(blocks, x, z) {
  blocks.addOn(x, 0, z, 1.2, 0.3, 1.2, STONE[1], STYLE.SMOOTH)
  blocks.addOn(x, 0.3, z, 0.46, 1.1, 0.46, STONE[0], STYLE.SMOOTH)
  blocks.addOn(x, 1.4, z, 1, 0.22, 1, STONE[1], STYLE.SMOOTH)
  blocks.addOn(x, 1.62, z, 0.72, 0.7, 0.72, '#ffe7a8', STYLE.GLOW)
  // Stone corners round the light box.
  for (const [dx, dz] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) blocks.addOn(x + dx, 1.62, z + dz, 0.16, 0.7, 0.16, STONE[0], STYLE.SMOOTH)
  blocks.addOn(x, 2.32, z, 1.4, 0.26, 1.4, STONE[1], STYLE.SMOOTH, Math.PI / 4)
  blocks.addOn(x, 2.58, z, 0.8, 0.22, 0.8, STONE[0], STYLE.SMOOTH, Math.PI / 4)
  blocks.addOn(x, 2.8, z, 0.28, 0.32, 0.28, STONE[1], STYLE.SMOOTH)
}

/** The gong: a vermilion frame, its black lintel turned up at the ends, the bronze gong hung on cords. */
function addGong(blocks, props) {
  const { x, z } = GONG
  for (const dx of [-1.9, 1.9]) {
    blocks.addOn(x + dx, 0, z, 0.8, 0.35, 0.8, STONE[1], STYLE.SMOOTH)
    blocks.addOn(x + dx, 0.35, z, 0.38, 4.3, 0.38, VERMILION, STYLE.SMOOTH)
  }
  blocks.addOn(x, 3.9, z, 4.4, 0.26, 0.34, VERMILION, STYLE.SMOOTH)
  blocks.addOn(x, 4.65, z, 5.2, 0.34, 0.5, '#1b1b1f', STYLE.SMOOTH)
  for (const dx of [-2.55, 2.55]) blocks.addOn(x + dx, 4.99, z, 0.5, 0.24, 0.5, '#1b1b1f', STYLE.SMOOTH)
  // Cords from the tie beam, the gong, and the boss in its middle.
  for (const dx of [-0.55, 0.55]) blocks.add(x + dx, 3.55, z, 0.05, 0.6, 0.05, '#e8d8a8', STYLE.SMOOTH)
  props.add(CYL, { position: [x, 2.15, z], rotation: [Math.PI / 2, 0, 0], scale: [1.35, 0.14, 1.35], color: '#d9a43a', style: STYLE.SMOOTH })
  props.add(CYL, { position: [x, 2.15, z + 0.1], rotation: [Math.PI / 2, 0, 0], scale: [0.42, 0.1, 0.42], color: '#a8741e', style: STYLE.SMOOTH })
  props.add(CYL, { position: [x, 2.15, z - 0.1], rotation: [Math.PI / 2, 0, 0], scale: [0.42, 0.1, 0.42], color: '#a8741e', style: STYLE.SMOOTH })
  // The mallet leaning on the frame.
  blocks.add(x + 2.4, 1.1, z + 0.45, 0.08, 2.1, 0.08, WOOD.light, STYLE.SMOOTH, 0, 0, 0.25)
  blocks.add(x + 2.13, 2.12, z + 0.45, 0.34, 0.34, 0.34, '#f0e6d0', STYLE.SMOOTH, 0, 0, 0.25)
}

/** A striking post (makiwara): a stone footing, a wooden post, the rope-bound striking pad near its top. */
function addMakiwara(blocks, x, z) {
  blocks.addOn(x, 0, z, 0.8, 0.2, 0.8, STONE[1], STYLE.SMOOTH)
  blocks.addOn(x, 0.2, z, 0.3, 1.75, 0.26, WOOD.light, STYLE.PLANKS)
  blocks.addOn(x, 1.15, z + 0.02, 0.36, 0.5, 0.32, '#d9c28a', STYLE.STRIPES)
}

/** A wooden dummy: a thick log on a frame, three arms and a leg sticking out of it. */
function addDummy(blocks) {
  const { x, z } = DUMMY
  for (const dx of [-0.9, 0.9]) blocks.addOn(x + dx, 0, z, 0.24, 2.4, 0.24, WOOD.dark, STYLE.SMOOTH)
  blocks.addOn(x, 2.4, z, 2.1, 0.24, 0.3, WOOD.dark, STYLE.SMOOTH)
  blocks.addOn(x, 0.25, z, 0.62, 2.1, 0.62, WOOD.mid, STYLE.PLANKS)
  blocks.add(x - 0.25, 1.75, z + 0.55, 0.12, 0.12, 0.7, WOOD.light, STYLE.SMOOTH, 0.4)
  blocks.add(x + 0.25, 1.75, z + 0.55, 0.12, 0.12, 0.7, WOOD.light, STYLE.SMOOTH, -0.4)
  blocks.add(x, 1.3, z + 0.55, 0.12, 0.12, 0.7, WOOD.light, STYLE.SMOOTH)
  blocks.add(x, 0.6, z + 0.5, 0.14, 0.14, 0.6, WOOD.light, STYLE.SMOOTH, 0, -0.5)
}

/** A banner pole (nobori): a black pole with a crossbar at the top (the banner on it is painted: signs.js). */
function addNoboriPole(blocks, x, z) {
  blocks.addOn(x, 0, z, 0.5, 0.25, 0.5, STONE[1], STYLE.SMOOTH)
  blocks.addOn(x, 0.25, z, 0.14, 5.6, 0.14, '#1b1b1f', STYLE.SMOOTH)
  blocks.add(x + 0.55, 5.6, z, 1.25, 0.08, 0.08, '#1b1b1f', STYLE.SMOOTH)
}

/** A clump of bamboo at (x, z): tall jointed canes, leaning a little, leafy at the top. */
function addBamboo(blocks, x, z, k) {
  for (let i = 0; i < 7; i += 1) {
    const a = hash2(k, i) * Math.PI * 2
    const r = 0.4 + hash2(k, i + 9) * 1.1
    const h = 7 + hash2(k, i + 19) * 4.5
    const cx = x + Math.cos(a) * r
    const cz = z + Math.sin(a) * r
    blocks.addOn(cx, 0, cz, 0.2, h, 0.2, BAMBOO[i % 3], STYLE.STRIPES)
    for (let j = 0; j < 2; j += 1) {
      blocks.add(cx, h - 0.6 - j * 1.4, cz, 1.6, 0.1, 0.5, BAMBOO_LEAF[(i + j) % 2], STYLE.SMOOTH, a + j * 1.3)
    }
  }
}

/** Builds the dojo into `blocks` and `props`. */
export function buildDojo(blocks, props, { detail = true } = {}) {
  addFloor(blocks)
  addWall(blocks, props, detail)
  for (const l of LANTERNS) addStoneLantern(blocks, l.x, l.z)
  addGong(blocks, props)
  for (const b of NOBORI) addNoboriPole(blocks, b.x, b.z)
  for (const m of MAKIWARA) addMakiwara(blocks, m.x, m.z)
  if (!detail) return
  addDummy(blocks)
  // Bamboo beyond the plaza's edges: behind the dojo's roof and in the corners.
  const spots = [
    [PLAZA.minX - 5, PLAZA.maxZ - 3],
    [PLAZA.minX - 6, 24],
    [PLAZA.minX - 7, 2],
    [PLAZA.minX - 6, -18],
    [PLAZA.minX - 4, PLAZA.minZ + 3],
    [PLAZA.maxX + 4, PLAZA.maxZ - 3],
    [PLAZA.maxX + 3, PLAZA.minZ + 4],
  ]
  spots.forEach(([x, z], i) => addBamboo(blocks, x, z, 700 + i))
}
