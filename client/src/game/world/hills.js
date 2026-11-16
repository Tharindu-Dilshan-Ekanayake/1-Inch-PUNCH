import { hash2 } from '@shared/rng'
import { CANYON_HALF_WIDTH, PLAZA } from '@shared/world'

import { STYLE } from '../materials'
import { SCOREBOARD } from './terrain'

/**
 * The canyon walls round the lobby: blocky candy mesas (STYLE.MESA) - pastel rock in wavy
 * strata under a dripping frosting cap - one box per column on a 4 m grid, stepping up in
 * terraces the further they stand from the plaza: low ledges just past its edge, cliffs
 * 36 m high further out, each terrace a colour further along the venue's rock ramp
 * (peach, coral, pink, lilac, periwinkle in the Candy Canyon; sandstone at Palm Beach).
 * The runway's mouth is left open to the north (Lane.jsx carries the mesas on down it).
 * Now and then something grows on a terrace: lollipops and gumdrops in the Candy Canyon,
 * palms at Palm Beach.
 *
 * Everything goes into the world's block set: no draw calls of its own, nothing to do per
 * frame. `density` (the preset's decorDensity) thins the decor and, on LOW, coarsens the
 * grid to 8 m columns (a quarter of the boxes).
 */

/** The open ground the mesas keep clear of: the plaza and everything round its edge. */
const OPEN = { minX: PLAZA.minX - 4, maxX: PLAZA.maxX + 4, minZ: PLAZA.minZ, maxZ: PLAZA.maxZ + 4 }
/** The runway's valley floor, north of the plaza, left open for it. */
const VALLEY_HALF = CANYON_HALF_WIDTH + 6
/** How far out the mesas go, from the middle. */
const REACH = { x: 96, south: PLAZA.maxZ + 112, north: -104 }

const CANDY = ['#ff5fa8', '#ffd21f', '#4be0c0', '#b05cff', '#ff8a3a', '#5fb8ff']
const PALM = { trunk: '#b4884f', leaves: ['#3fbf5a', '#54d36a'] }
/** The Sunset Dojo's growth: autumn maples (reds, oranges, golds), mossy boulders, violet torii. */
const MAPLE = ['#ff7a1a', '#ff4a2a', '#ffb02e', '#e8402a']
const BOULDER = ['#b7a59a', '#a08f86']
const MOSS = '#8fbf34'
const TORII = { post: '#7a2cff', beam: '#1d1238', cap: '#ffb81f' }

/** The Bamboo Temple's growth and shrines. */
const TEMPLE = { cane: ['#6fb13e', '#8cc84a', '#5a9a34'], leaf: ['#4f9f3a', '#62b444'], pine: ['#2f7a3a', '#3a8a44'], trunk: '#5a3e2a', stone: ['#b2b4b0', '#9a9d9a'], red: '#d22a2a', roof: '#2f3742', gold: '#ffc21f' }

/**
 * Something on a terrace at the Bamboo Temple: a grove of bamboo (most often), a pine
 * (tiered dark crowns on a crooked trunk), a stone lantern, a little three-roofed pagoda,
 * or a red torii gate.
 */
function addTempleDecor(blocks, x, top, z, k) {
  const r = hash2(k, 31)
  const turn = hash2(k, 36) * Math.PI
  if (r < 0.5) {
    // Bamboo: jointed canes of different heights, leafy at the top.
    for (let i = 0; i < 5; i += 1) {
      const a = hash2(k, 40 + i) * Math.PI * 2
      const d = 0.3 + hash2(k, 50 + i) * 1.2
      const h = 5 + hash2(k, 60 + i) * 4
      const cx = x + Math.cos(a) * d
      const cz = z + Math.sin(a) * d
      blocks.addOn(cx, top, cz, 0.22, h, 0.22, TEMPLE.cane[i % 3], STYLE.STRIPES)
      blocks.add(cx, top + h - 0.5, cz, 1.6, 0.1, 0.5, TEMPLE.leaf[i % 2], STYLE.SMOOTH, a)
    }
  } else if (r < 0.75) {
    // A pine: a crooked trunk under three tiers of dark, flat crowns.
    const h = 3 + hash2(k, 32) * 1.5
    blocks.addOn(x, top, z, 0.55, h, 0.55, TEMPLE.trunk, STYLE.SMOOTH)
    blocks.addOn(x + 0.4, top + h - 0.3, z, 4, 0.9, 3.2, TEMPLE.pine[0], STYLE.STUDS, turn)
    blocks.addOn(x - 0.5, top + h + 0.7, z + 0.3, 2.8, 0.8, 2.4, TEMPLE.pine[1], STYLE.STUDS, turn + 0.5)
    blocks.addOn(x + 0.2, top + h + 1.6, z - 0.2, 1.6, 0.7, 1.4, TEMPLE.pine[0], STYLE.STUDS, turn + 1)
  } else if (r < 0.87) {
    // A stone lantern.
    blocks.addOn(x, top, z, 1.1, 0.3, 1.1, TEMPLE.stone[1], STYLE.SMOOTH)
    blocks.addOn(x, top + 0.3, z, 0.42, 1.2, 0.42, TEMPLE.stone[0], STYLE.SMOOTH)
    blocks.addOn(x, top + 1.5, z, 0.7, 0.7, 0.7, '#ffe7a8', STYLE.GLOW)
    blocks.addOn(x, top + 2.2, z, 1.4, 0.3, 1.4, TEMPLE.stone[1], STYLE.SMOOTH, Math.PI / 4)
    blocks.addOn(x, top + 2.5, z, 0.3, 0.35, 0.3, TEMPLE.stone[0], STYLE.SMOOTH)
  } else if (r < 0.95) {
    // A pagoda: three red storeys, each under a dark roof with a gold rim, a spire on top.
    let y = top
    for (let i = 0; i < 3; i += 1) {
      const w = 2.8 - i * 0.6
      blocks.addOn(x, y, z, w, 1.3, w, TEMPLE.red, STYLE.SMOOTH, turn)
      blocks.addOn(x, y + 1.3, z, w + 1.4, 0.3, w + 1.4, TEMPLE.roof, STYLE.BRICK, turn)
      blocks.addOn(x, y + 1.6, z, w + 0.6, 0.14, w + 0.6, TEMPLE.gold, STYLE.GLOW, turn)
      y += 1.74
    }
    blocks.addOn(x, y, z, 0.2, 1.4, 0.2, TEMPLE.gold, STYLE.GLOW)
  } else {
    // A red torii: two posts, a tie beam, a black lintel.
    const across = hash2(k, 37) < 0.5
    for (const d of [-1.4, 1.4]) blocks.addOn(across ? x + d : x, top, across ? z : z + d, 0.42, 3.4, 0.42, TEMPLE.red, STYLE.SMOOTH)
    blocks.addOn(x, top + 2.5, z, across ? 4 : 0.4, 0.3, across ? 0.4 : 4, TEMPLE.red, STYLE.SMOOTH)
    blocks.addOn(x, top + 3.4, z, across ? 4.8 : 0.6, 0.36, across ? 0.6 : 4.8, '#1b1b1f', STYLE.SMOOTH)
  }
}

/** Metres from (x, z) to the nearest open ground (the plaza, or the runway's valley). */
function openDistance(x, z) {
  const dx = Math.max(OPEN.minX - x, 0, x - OPEN.maxX)
  const dz = Math.max(OPEN.minZ - z, 0, z - OPEN.maxZ)
  const plaza = Math.hypot(dx, dz)
  const valley = z < OPEN.minZ ? Math.max(0, Math.abs(x) - VALLEY_HALF) : Infinity
  return Math.min(plaza, valley)
}

/** Under the scoreboard on the south mesas: kept below its screen. */
const underScoreboard = (x, z) =>
  Math.abs(x - SCOREBOARD.x) < SCOREBOARD.width / 2 + 3 && Math.abs(z - SCOREBOARD.z) < 4

/**
 * Something on a terrace at (x, top, z): in the Sunset Dojo a maple, a few mossy boulders
 * or a little torii gate; elsewhere a giant lollipop (a white stick, a candy disc striped
 * white, turned to face a random way), a stack of gumdrops, or a palm.
 */
function addDecor(blocks, x, top, z, k, kind) {
  if (kind === 'maple') {
    const r = hash2(k, 31)
    const turn = hash2(k, 36) * Math.PI
    if (r < 0.6) {
      // A maple: a dark trunk under a layered, blocky crown in autumn red, orange and gold.
      const h = 3 + hash2(k, 32) * 2.2
      const leaf = MAPLE[Math.floor(hash2(k, 35) * MAPLE.length)]
      const leaf2 = MAPLE[(MAPLE.indexOf(leaf) + 1) % MAPLE.length]
      blocks.addOn(x, top, z, 0.6, h, 0.6, '#4a2e22', STYLE.SMOOTH)
      blocks.addOn(x, top + h - 0.6, z, 4.4, 1.6, 4.4, leaf, STYLE.STUDS, turn)
      blocks.addOn(x + 0.3, top + h + 1, z - 0.2, 3.2, 1.3, 3.2, leaf2, STYLE.STUDS, turn)
      blocks.addOn(x - 0.2, top + h + 2.3, z + 0.2, 1.8, 0.9, 1.8, leaf, STYLE.STUDS, turn)
    } else if (r < 0.86) {
      // Mossy boulders and a little autumn shrub beside them.
      blocks.addOn(x, top, z, 2.2, 1.3, 1.8, BOULDER[0], STYLE.SMOOTH, turn)
      blocks.addOn(x, top + 1.3, z, 1.6, 0.25, 1.3, MOSS, STYLE.STUDS, turn)
      blocks.addOn(x + 1.3, top, z + 0.7, 1.2, 0.8, 1.2, BOULDER[1], STYLE.SMOOTH, turn + 0.6)
      blocks.addOn(x - 1.1, top, z - 0.9, 1.6, 1.1, 1.6, MAPLE[2], STYLE.STUDS, turn)
    } else {
      // A little torii gate: two violet posts, a tie beam, and a dark lintel capped in gold.
      const across = hash2(k, 37) < 0.5
      const off = (d) => (across ? [x + d, z] : [x, z + d])
      for (const d of [-1.4, 1.4]) {
        const [px, pz] = off(d)
        blocks.addOn(px, top, pz, 0.42, 3.4, 0.42, TORII.post, STYLE.SMOOTH)
      }
      const span = across ? [4, 0.3, 0.4] : [0.4, 0.3, 4]
      const lintel = across ? [4.8, 0.36, 0.6] : [0.6, 0.36, 4.8]
      blocks.addOn(x, top + 2.5, z, span[0], span[1], span[2], TORII.post, STYLE.SMOOTH)
      blocks.addOn(x, top + 3.4, z, lintel[0], lintel[1], lintel[2], TORII.beam, STYLE.SMOOTH)
      blocks.addOn(x, top + 3.76, z, lintel[0] - 0.2, 0.12, lintel[2] - 0.2, TORII.cap, STYLE.GLOW)
    }
    return
  }
  if (kind === 'bamboo') {
    addTempleDecor(blocks, x, top, z, k)
    return
  }
  if (kind === 'palm') {
    const h = 4 + hash2(k, 32) * 2.5
    blocks.addOn(x, top, z, 0.7, h, 0.7, PALM.trunk, STYLE.STRIPES)
    blocks.addOn(x, top + h, z, 4.2, 0.6, 1.2, PALM.leaves[0], STYLE.STUDS)
    blocks.addOn(x, top + h + 0.1, z, 1.2, 0.6, 4.2, PALM.leaves[1], STYLE.STUDS)
    return
  }
  const color = CANDY[Math.floor(hash2(k, 35) * CANDY.length)]
  if (hash2(k, 31) < 0.55) {
    const h = 3.6 + hash2(k, 32) * 2.4
    blocks.addOn(x, top, z, 0.35, h, 0.35, '#ffffff', STYLE.SMOOTH)
    blocks.add(x, top + h + 1.4, z, 3, 3, 0.7, color, STYLE.STRIPES, 0, hash2(k, 36) * Math.PI, Math.PI / 4)
  } else {
    blocks.addOn(x, top, z, 3.2, 1.6, 3.2, color, STYLE.STUDS)
    blocks.addOn(x, top + 1.6, z, 2.2, 1.2, 2.2, CANDY[(CANDY.indexOf(color) + 2) % CANDY.length], STYLE.STUDS)
    blocks.addOn(x, top + 2.8, z, 1.1, 0.8, 1.1, '#ffffff', STYLE.STUDS)
  }
}

/**
 * Builds the mesas into `blocks` in `venue`'s colours (sceneStyle VENUES: `hills`).
 * Returns how many columns and decor pieces went in (for tests/debug).
 */
export function buildHills(blocks, { density = 1, venue } = {}) {
  const look = venue?.hills ?? { rock: ['#ffa27e', '#ff8aa8', '#f08ad8', '#c08cff', '#94a2ff'], trees: 'candy' }
  const cell = density < 0.5 ? 8 : 4
  const decorChance = density >= 0.75 ? 0.07 : density >= 0.5 ? 0.05 : 0.035
  let columns = 0
  let trees = 0
  for (let gx = -REACH.x; gx < REACH.x; gx += cell) {
    for (let gz = REACH.north; gz < REACH.south; gz += cell) {
      const x = gx + cell / 2
      const z = gz + cell / 2
      const d = openDistance(x, z)
      if (d < 2) continue
      // Terraces 4 m apart in height, every ~9 m out, with a little noise so the edges
      // wander; never higher than 36 m.
      const k = Math.floor(gx / 4) * 977 + Math.floor(gz / 4)
      const n = hash2(Math.floor(gx / 8), Math.floor(gz / 8))
      const step = Math.min(9, 1 + Math.floor(d / 9 + n * 1.3))
      let h = 4 * step
      if (underScoreboard(x, z)) h = Math.min(h, 20)
      const rock = look.rock[Math.min(look.rock.length - 1, Math.floor((step - 1) / 2))]
      blocks.addOn(x, 0, z, cell, h, cell, rock, look.cap ?? STYLE.MESA)
      columns += 1
      // Decor now and then on a terrace near enough to be seen.
      if (d < 70 && hash2(k, 30) < decorChance * (cell / 4) ** 2) {
        addDecor(blocks, x + (hash2(k, 33) - 0.5) * (cell - 3.4), h, z + (hash2(k, 34) - 0.5) * (cell - 3.4), k, look.trees)
        trees += 1
      }
    }
  }
  return { columns, trees }
}
