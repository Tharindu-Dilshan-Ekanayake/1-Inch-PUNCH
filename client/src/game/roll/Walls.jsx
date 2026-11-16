import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { WALL_EVERY, WALL_FIRST, wallMeter } from '@shared/balance'
import { zoneIndexAt } from '@shared/logic'
import { LAUNCH_STAND } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { zones } from '../worldLook'
import { createCrack } from './crack'
import { createDust } from './dust'
import { FIST_AHEAD, meterAtZ, stopWallMeter, trackPoint } from './path'
import { roll } from './rollControl'

/**
 * The walls down the runway, and the punch smashing through them.
 *
 * A wall stands every WALL_EVERY metres from WALL_FIRST (balance.js), the first right in
 * front of the punch spot: a panel across the runway between two pillars, made of what
 * its stage's walls are made of (MATERIALS: paper, wood, brick, stone, metal, ice ...).
 * Nothing visible flies at them: the punch's force is unseen, and as it reaches a wall
 * the panel is smashed to bits - the middle, where the force hit, pulverised into small
 * pieces and a spray of dusty crumbs, the rest breaking into its material's chunks a beat
 * later as the break spreads out, the outer ones tumbling down - in a cloud of dust, with
 * a crunch and a beat of slow motion (rollControl, via roll.hitAt); then its pillars
 * topple outwards and fall flat beside the runway. The wall that holds stands just past
 * where the punch stops (path.stopWallMeter): the force hits it, it shudders and cracks,
 * and a few chips fly.
 *
 * Nothing is built per wall: WALL_SLOTS walls' worth of boxes are one
 * InstancedMesh moved along to wherever you're looking, the pieces another. Two draw
 * calls at any distance, nothing allocated while it runs (a fixed pool, simple
 * ballistics: no physics engine, no rigid bodies). Each piece keeps its own instance, so
 * its colour and surface are written once, when it's thrown, and its matrix is written
 * straight into the instance buffer each frame.
 */

/** Walls drawn at once, from a little behind the focus to well ahead of it. */
const WALL_SLOTS = 22
/** Boxes per wall: the panel, two pillars and a cap on each (in the stage's accent colour). */
const PARTS = 5
const WALL_INSTANCES = WALL_SLOTS * PARTS + PARTS
const STOP_BASE = WALL_SLOTS * PARTS

/** The panel: as wide as the runway (Lane.jsx LANE_WIDTH 18) and a little over. */
const PANEL_W = 19
const PANEL_H = 6.4
const PANEL_D = 0.9
const PILLAR_X = PANEL_W / 2 + 0.55
const PILLAR = { w: 1.3, h: 7.4, d: 1.5 }
const CAP = { w: 1.8, h: 0.6, d: 2 }

/**
 * Pieces in flight at most, by preset: the pool is POOL_MAX instances, a preset throws
 * into the first POOL[quality] of them (the oldest piece gives way to a new one).
 */
const POOL = { low: 320, medium: 480, high: 720 }
const POOL_MAX = 720

/**
 * What a wall is made of decides how it looks and how it breaks: its panel's surface and
 * its pillars' (materials STYLE: wood planks, brick, dressed stone, riveted metal, ice,
 * a paper screen, the toy bricks...), the grid its panel breaks into on HIGH (across,
 * up: short lengths of plank from wood, bricks from brick, blocks of stone, plates of
 * metal, a spray of small shards from ice) - a share of that each way on lower presets
 * (GRID_SHARE) - how fast its pieces tumble, and the sound of it smashing (sfx SMASHES).
 * Flying pieces wear the panel's surface.
 */
const MATERIALS = {
  wood: { panel: STYLE.PLANKS, pillar: STYLE.PLANKS, grid: [7, 9], spin: 0.8, sound: 'wood' },
  brick: { panel: STYLE.BRICK, pillar: STYLE.BRICK, grid: [10, 8], spin: 1, sound: 'brick' },
  stone: { panel: STYLE.STONE, pillar: STYLE.STONE, grid: [7, 5], spin: 0.6, sound: 'stone' },
  metal: { panel: STYLE.METAL, pillar: STYLE.METAL, grid: [5, 4], spin: 0.7, sound: 'metal' },
  ice: { panel: STYLE.ICE, pillar: STYLE.ICE, grid: [10, 7], spin: 1.5, sound: 'ice' },
  shoji: { panel: STYLE.SHOJI, pillar: STYLE.PLANKS, grid: [6, 5], spin: 1.2, sound: 'paper' },
  lava: { panel: STYLE.LAVA, pillar: STYLE.STONE, grid: [8, 5], spin: 0.8, sound: 'lava' },
  galaxy: { panel: STYLE.GALAXY, pillar: STYLE.METAL, grid: [8, 6], spin: 1, sound: 'galaxy' },
  rainbow: { panel: STYLE.RAINBOW, pillar: STYLE.STUDS, grid: [8, 6], spin: 1, sound: 'rainbow' },
  toy: { panel: STYLE.STUDS, pillar: STYLE.STUDS, grid: [8, 6], spin: 1, sound: 'toy' },
}
const GRID_SHARE = { low: 0.6, medium: 0.8, high: 1 }
/**
 * Where the force hit, the wall is pulverised: cells whose middle is within CORE metres
 * of the hit go as four small pieces each, thrown harder (not on LOW) - plus CRUMBS[q]
 * dusty crumbs bursting out of the hole every way, gone in CRUMB_LIFE seconds or so.
 */
const CORE = 2.6
/** Further than this (m) from the hit, a block of 2 x 2 cells comes off whole: a big slab. */
const SLAB = 5.2
const CRUMBS = { low: 10, medium: 22, high: 36 }
const CRUMB_LIFE = 0.9
const CHIPS = { low: 4, medium: 8, high: 12 }
/** Dust clouds (dust.js), on presets with particles: puffs at most, and how thick a smash's cloud is by preset. */
const DUST_POOL = 110
const DUST = { medium: 0.5, high: 1 }
/** Heavier than real: the pieces come down hard and fast, lying in the runway before the chase camera gets there. */
const GRAVITY = 34
/** A piece lasts this long (s), shrinking away over its last FADE. */
const LIFE = 2.6
/** Lying on the runway, a piece slides and stops turning at this rate (per second). */
const FRICTION = 5
/** At most one wall-smash sound this often (ms). */
const SMASH_SOUND_MS = 110
const FADE = 0.5
/**
 * A smashed wall's pillars topple outwards, away from the runway, and fall flat at its
 * sides (never across it, in the way of the shot): a beat after its bricks go (`delay`,
 * s), from standing still with this angular acceleration (rad/s²), with a little rebound
 * as they land. Gone (shrinking away) by LIFE. The walls broken most recently, up to
 * TOPPLES.
 */
const TOPPLE = { delay: 0.04, accel: 7.5 }
/**
 * A wall this far (m) or less behind the break bursts; further back it was skipped over
 * (the picture cut ahead): its pillars are simply lying flat already, as though it went
 * while the camera was away.
 */
const NEAR_BREAK = 4
/** The crack in the wall that holds (crack.js) spreads this far in its first CRACK_SPREAD s, the rest over CRACK_CREEP s. */
const CRACK_SPREAD = 0.14
const CRACK_CREEP = 0.7
/** How long ago (s) a skipped wall is taken to have gone: its pillars down, not yet fading. */
const SKIPPED_AGE = 0.9
const TOPPLES = 12
const FLAT = Math.PI / 2
/**
 * Walls are drawn from this far behind the break: the chase camera trails three walls
 * back (Roll.jsx CHASE_CAM), and the smashed ones it looks past still lie there.
 */
const REAR = 3 * WALL_EVERY + 10

/**
 * Each stage's wall, by its name (balance WALL_NAMES): what it's made of (MATERIALS) and
 * its colours - [material, panel, pillars, caps].
 */
const WALL_BY_NAME = {
  'Paper Wall': ['shoji', '#fbf3e0', '#7a4a2a', '#ffd21f'],
  'Cardboard Wall': ['wood', '#c9965a', '#8a5f34', '#ffe27a'],
  'Sandstone Wall': ['stone', '#e6c88e', '#b0884e', '#fff1a8'],
  'Driftwood Wall': ['wood', '#b9a58a', '#6f5a44', '#3fd8ff'],
  'Bamboo Wall': ['wood', '#c9d27a', '#5f8a34', '#d6ff6a'],
  'Ice Wall': ['ice', '#bfeaff', '#4f9fd8', '#ffffff'],
  'Cherry Wood Wall': ['wood', '#b5584e', '#5a2a28', '#ffb3d1'],
  'Candy Brick Wall': ['brick', '#ff8fc8', '#ffffff', '#ffd23f'],
  'Mushroom Wall': ['toy', '#ef5450', '#fff2e0', '#ffffff'],
  'Basalt Wall': ['stone', '#45414a', '#1d1a1e', '#ff5a14'],
  'Mossy Stone Wall': ['stone', '#7d9466', '#3f5230', '#c8ff6a'],
  'Crystal Wall': ['ice', '#c7a0ff', '#5a2ab8', '#ffffff'],
  'Coral Wall': ['stone', '#ff9a86', '#1f7aa8', '#7ff6ff'],
  'Neon Glass Wall': ['ice', '#3a3a9a', '#151530', '#ff3bd8'],
  'Cloud Wall': ['toy', '#ffffff', '#8fcfff', '#ffd21f'],
  'Rainbow Wall': ['rainbow', '#ffffff', '#7a5cff', '#ffe53b'],
  'Moon Rock Wall': ['stone', '#a4aab4', '#555b66', '#9fe8ff'],
  'Glacier Wall': ['ice', '#a8f6ea', '#3a6ad8', '#7dffb0'],
  'Titanium Wall': ['metal', '#c3cad4', '#3e4858', '#5fd6ff'],
  'Star Metal Wall': ['metal', '#5a4aa6', '#1a0f40', '#ffd24a'],
  'Granite Wall': ['stone', '#b8a9a3', '#5f544f', '#ffd21f'],
  'Iron Oak Wall': ['wood', '#7a5230', '#2a2a2e', '#ff9a2e'],
  'Pyramid Stone Wall': ['stone', '#e8c47a', '#9a6a2e', '#fff1a8'],
  'Seashell Wall': ['stone', '#ffd9cc', '#d8a08a', '#3fd8ff'],
  'Temple Wall': ['stone', '#d8c8a8', '#7a5a2a', '#d6ff6a'],
  'Permafrost Wall': ['ice', '#d6f4ff', '#5a8fc8', '#ffffff'],
  'Pagoda Wall': ['wood', '#c8402e', '#2a1414', '#ffd21f'],
  'Rock Candy Wall': ['ice', '#ffb0e0', '#ffffff', '#ffd23f'],
  'Giant Cap Wall': ['toy', '#d8403e', '#fff2e0', '#ffffff'],
  'Magma Wall': ['lava', '#ff6a14', '#1d1416', '#ff5a14'],
  'Bog Iron Wall': ['metal', '#6a6a52', '#34452a', '#c8ff6a'],
  'Amethyst Wall': ['ice', '#a46ae8', '#4a1a8a', '#ffffff'],
  'Pearl Wall': ['ice', '#f4eee8', '#c8b8a8', '#7ff6ff'],
  'Cyber Steel Wall': ['metal', '#36447a', '#151530', '#ff3bd8'],
  'Storm Wall': ['stone', '#5a6478', '#2a3040', '#fff36a'],
  'Prism Wall': ['rainbow', '#ffffff', '#3a6ad8', '#ffffff'],
  'Crater Wall': ['stone', '#8a8f98', '#4a4f58', '#9fe8ff'],
  'Aurora Wall': ['ice', '#9ff6e0', '#3a6ad8', '#7dffb0'],
  'Meteor Wall': ['stone', '#5e4e4a', '#2a1e1c', '#ff7a2a'],
  'Nebula Wall': ['galaxy', '#3a2486', '#1a0f40', '#ffd24a'],
  'Steel Wall': ['metal', '#a8b0bc', '#4a525e', '#ffd21f'],
  'Bronze Wall': ['metal', '#c8803a', '#6a3a18', '#fff1a8'],
  'Golden Wall': ['metal', '#ffcc33', '#a8781a', '#ffffff'],
  'Lagoon Glass Wall': ['ice', '#4fd6e0', '#1f7aa8', '#7ff6ff'],
  'Jade Wall': ['stone', '#3fae7a', '#1f5a3a', '#d6ff6a'],
  'Diamond Ice Wall': ['ice', '#e0faff', '#7fb8e0', '#ffffff'],
  'Lantern Wall': ['shoji', '#ffe9b0', '#8a3420', '#ff9a2e'],
  'Cupcake Wall': ['toy', '#ffb0d0', '#ffffff', '#ff5fa8'],
  'Glowcap Wall': ['ice', '#6affd0', '#1f5a4a', '#d6ff6a'],
  'Inferno Wall': ['lava', '#ff3a14', '#1d1416', '#ffb02e'],
  'Firefly Wall': ['stone', '#34463a', '#1a2a1e', '#d6ff6a'],
  'Geode Wall': ['ice', '#c07aff', '#3a2a4a', '#ffffff'],
  'Abyss Wall': ['stone', '#1f2648', '#0a0f20', '#3fd8ff'],
  'Arcade Wall': ['metal', '#2e2e66', '#151530', '#ff3bd8'],
  'Sky Fortress Wall': ['brick', '#e8eef8', '#8fcfff', '#ffd21f'],
  'Unicorn Wall': ['rainbow', '#ffb6e6', '#a8d8ff', '#ffffff'],
  'Mars Rock Wall': ['stone', '#c8603a', '#6a2a18', '#ffb02e'],
  'Comet Wall': ['ice', '#bfe8ff', '#3e4858', '#5fd6ff'],
  'Black Hole Wall': ['galaxy', '#14102a', '#05030f', '#c35cff'],
  'Infinity Wall': ['rainbow', '#ffffff', '#ffffff', '#ffd21f'],
}

/** Stages the table doesn't name (other worlds'): their material from words in the name. */
const MATERIAL_WORDS = [
  [/wood|oak|bamboo|pagoda|shack|pier|boardwalk|tiki|hut|ship/i, 'wood'],
  [/brick|fortress/i, 'brick'],
  [/stone|rock|basalt|granite|temple|crater|meteor|coral|jade|sand|shell/i, 'stone'],
  [/metal|steel|iron|titanium|bronze|gold|arcade|tower/i, 'metal'],
  [/ice|glacier|frost|crystal|glass|amethyst|pearl|geode|prism|diamond|lagoon/i, 'ice'],
  [/paper|lantern/i, 'shoji'],
  [/magma|inferno|lava|volcano/i, 'lava'],
  [/nebula|galaxy|black hole|abyss/i, 'galaxy'],
  [/rainbow|unicorn|infinity/i, 'rainbow'],
]
const materialFor = (name) => MATERIAL_WORDS.find(([words]) => words.test(name))?.[1] ?? 'toy'

/**
 * What each theme's walls look like: [panel, frame, trim] (for stages WALL_BY_NAME
 * doesn't name). The panel is the instance
 * colour of its studded bricks; the frame the pillars; the trim the caps on their tops.
 * Later rounds of the same theme (stages 21-40, 41-60) are the same stuff, darker
 * and tougher-looking (wallLook).
 */
const WALL_LOOKS = {
  grassy: ['#f6f1e2', '#a8794a', '#ffd21f'],
  autumn: ['#d29a5c', '#7a4a22', '#ff9a2e'],
  desert: ['#ecc883', '#b07a3e', '#fff1a8'],
  beach: ['#d8bd94', '#7d5c3c', '#3fd8ff'],
  jungle: ['#a6d65a', '#3f6e1e', '#d6ff6a'],
  frozen: ['#c9f3ff', '#4f9fd8', '#ffffff'],
  cherry: ['#ffb8d3', '#8a3448', '#ffffff'],
  candy: ['#ff8fd0', '#ffffff', '#ffd23f'],
  mushroom: ['#ef5450', '#fff2e0', '#ffffff'],
  volcano: ['#3a3036', '#1d1416', '#ff5a14'],
  swamp: ['#6a8a52', '#34452a', '#c8ff6a'],
  crystal: ['#c09aff', '#5a2ab8', '#ffffff'],
  ocean: ['#ff9a86', '#1f7aa8', '#7ff6ff'],
  neon: ['#2e2e66', '#151530', '#ff3bd8'],
  sky: ['#ffffff', '#8fcfff', '#ffd21f'],
  rainbow: ['#ff7ad9', '#7a5cff', '#ffe53b'],
  moon: ['#a4aab4', '#555b66', '#9fe8ff'],
  aurora: ['#a8f6ea', '#3a6ad8', '#7dffb0'],
  space: ['#cdd5e0', '#3e4858', '#5fd6ff'],
  cosmic: ['#3a2486', '#1a0f40', '#ffd24a'],
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _axis = new Vector3()
const _zAxis = new Vector3(0, 0, 1)
const _hidden = new Matrix4().makeScale(0, 0, 0)
const _dark = new Color('#1b1b1f')
const _white = new Color('#ffffff')
const _shade = new Color()
const _dust = new Color()


/** Each stage's wall, per world: [panel, frame, trim] Colors and its MATERIALS entry. */
const lookCache = new Map()
function wallLook(zoneIndex) {
  const list = zones()
  let entry = lookCache.get(list)
  if (!entry) {
    entry = list.map((z, i) => {
      const named = WALL_BY_NAME[z.name]
      if (named) {
        const [material, panel, frame, trim] = named
        return [new Color(panel), new Color(frame), new Color(trim), MATERIALS[material]]
      }
      const [panel, frame, trim] = WALL_LOOKS[z.theme] ?? WALL_LOOKS.grassy
      const round = Math.floor(i / 20)
      // Later rounds: the same stuff, a shade darker and more solid.
      const toughen = (hex) => new Color(hex).lerp(_dark, 0.12 * round)
      return [toughen(panel), toughen(frame), new Color(trim), MATERIALS[materialFor(z.name)]]
    })
    lookCache.set(list, entry)
  }
  return entry[Math.min(entry.length - 1, Math.max(0, zoneIndex))]
}

/** Writes wall slot `base`'s boxes at track metre `m` (the panel's middle), shaken by `shake` metres. */
function placeWall(mesh, base, m, look, shake = 0) {
  const [panel, frame, trim, material] = look
  setStyles(mesh, base, material)
  _q.identity()
  trackPoint(m, shake, PANEL_H / 2, _p)
  mesh.setMatrixAt(base, _m.compose(_p, _q, _s.set(PANEL_W, PANEL_H, PANEL_D)))
  mesh.setColorAt(base, panel)
  for (let side = 0; side < 2; side += 1) {
    const x = (side ? PILLAR_X : -PILLAR_X) + shake
    trackPoint(m, x, PILLAR.h / 2, _p)
    mesh.setMatrixAt(base + 1 + side, _m.compose(_p, _q, _s.set(PILLAR.w, PILLAR.h, PILLAR.d)))
    mesh.setColorAt(base + 1 + side, frame)
    trackPoint(m, x, PILLAR.h + CAP.h / 2, _p)
    mesh.setMatrixAt(base + 3 + side, _m.compose(_p, _q, _s.set(CAP.w, CAP.h, CAP.d)))
    mesh.setColorAt(base + 3 + side, trim)
  }
}

/**
 * Writes wall slot `base` as a smashed wall's pillars falling: each tipped `tip` radians
 * (0 standing, FLAT lying on the ground) outwards, about its outer edge at the floor -
 * its panel gone, each box scaled by `size` (it shrinks away at the end).
 */
function placeFallingPillars(mesh, base, m, look, tip, size) {
  const [, frame, trim, material] = look
  setStyles(mesh, base, material)
  mesh.setMatrixAt(base, _hidden)
  const c = Math.cos(tip)
  const sn = Math.sin(tip)
  for (let side = 0; side < 2; side += 1) {
    const out = side ? 1 : -1
    const pivot = out * (PILLAR_X + PILLAR.w / 2)
    // Turned about the runway's line, its top going outwards.
    _q.setFromAxisAngle(_zAxis, -out * tip)
    // A box whose middle is `inward` in from the pivot and `up` above it, standing.
    const box = (k, inward, up, w, h, d, color) => {
      trackPoint(m, pivot + out * (up * sn - inward * c), inward * sn + up * c, _p)
      mesh.setMatrixAt(base + k, _m.compose(_p, _q, _s.set(w * size, h * size, d * size)))
      mesh.setColorAt(base + k, color)
    }
    box(1 + side, PILLAR.w / 2, PILLAR.h / 2, PILLAR.w, PILLAR.h, PILLAR.d, frame)
    box(3 + side, PILLAR.w / 2, PILLAR.h + CAP.h / 2, CAP.w, CAP.h, CAP.d, trim)
  }
}

/** How far over (radians) a smashed wall's pillars are `t` seconds after it broke. */
function toppleAngle(t) {
  const u = Math.max(0, t - TOPPLE.delay)
  const land = Math.sqrt((2 * FLAT) / TOPPLE.accel)
  if (u < land) return 0.5 * TOPPLE.accel * u * u
  const since = u - land
  return FLAT - 0.12 * Math.exp(-since * 6) * Math.abs(Math.sin(since * 14))
}

/** Wall slot `base`'s surfaces: its panel and pillars in `material`'s, the caps plain. */
function setStyles(mesh, base, material) {
  const style = mesh.geometry.attributes.aStyle
  style.setX(base, material.panel)
  style.setX(base + 1, material.pillar)
  style.setX(base + 2, material.pillar)
  style.setX(base + 3, STYLE.SMOOTH)
  style.setX(base + 4, STYLE.SMOOTH)
}

function hideWall(mesh, base) {
  for (let k = 0; k < PARTS; k += 1) mesh.setMatrixAt(base + k, _hidden)
}

export default function Walls() {
  const wallRef = useRef(null)
  const debrisRef = useRef(null)
  /** Per punch: which roll it is, and the furthest wall index already smashed. */
  const state = useRef({
    for: -1,
    smashed: -1,
    combo: 0,
    crackedAt: 0,
    crackFor: -1,
    soundAt: 0,
    /** The walls whose frames are falling: their index and when (performance.now()). */
    topples: Array.from({ length: TOPPLES }, () => ({ index: -1, at: 0 })),
    toppleNext: 0,
  })

  const assets = useMemo(() => {
    const walls = createBoxInstances(WALL_INSTANCES, sharedMaterials().toy, STYLE.STUDS)
    walls.count = WALL_INSTANCES
    for (let i = 0; i < WALL_INSTANCES; i += 1) walls.setMatrixAt(i, _hidden)
    walls.castShadow = false
    walls.receiveShadow = true
    const debris = createBoxInstances(POOL_MAX, sharedMaterials().toy, STYLE.STUDS)
    debris.castShadow = false
    // Every piece has its own instance: hidden (zero scale) until thrown.
    for (let k = 0; k < POOL_MAX; k += 1) debris.setMatrixAt(k, _hidden)
    debris.setColorAt(0, _white)
    // Piece state, struct-of-arrays: position, velocity, spin axis, rate and angle, size,
    // age and lifetime, and how long it holds still before it goes (the break spreading
    // out from the hit). `shown`: its instance is showing (hidden again once, as it goes).
    const pool = {
      p: new Float32Array(POOL_MAX * 3),
      v: new Float32Array(POOL_MAX * 3),
      axis: new Float32Array(POOL_MAX * 3),
      spin: new Float32Array(POOL_MAX),
      angle: new Float32Array(POOL_MAX),
      size: new Float32Array(POOL_MAX * 3),
      age: new Float32Array(POOL_MAX).fill(1),
      life: new Float32Array(POOL_MAX),
      delay: new Float32Array(POOL_MAX),
      shown: new Uint8Array(POOL_MAX),
      next: 0,
      /** Colours or surfaces written since the last upload. */
      dirty: false,
    }
    const dust = createDust(DUST_POOL)
    const crack = createCrack(getQuality().maxTexture)
    return { walls, debris, pool, dust, crack }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.walls)
      disposeBlocks(assets.debris)
      assets.dust.dispose()
      assets.crack.dispose()
    },
    [assets],
  )

  /**
   * Sends one piece of a wall flying from (`x`, `y`) on the wall at track metre `m`:
   * velocity (`vx`, `vy`, `vz`), size (`sx`, `sy`, `sz`), tumbling at `spin` about a
   * random axis, holding still for `delay` seconds first, in `color` times `shade`, with
   * surface `style` (materials STYLE), lasting `life` seconds. Into the next of the
   * preset's `limit` slots: the oldest piece there gives way.
   */
  const piece = (m, x, y, vx, vy, vz, sx, sy, sz, spin, delay, color, shade, style, life, limit) => {
    const pool = assets.pool
    const debris = assets.debris
    const k = pool.next % limit
    pool.next = (k + 1) % limit
    trackPoint(m, x, y, _p)
    pool.p[k * 3] = _p.x
    pool.p[k * 3 + 1] = _p.y
    pool.p[k * 3 + 2] = _p.z
    pool.v[k * 3] = vx
    pool.v[k * 3 + 1] = vy
    pool.v[k * 3 + 2] = vz
    _axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    pool.axis[k * 3] = _axis.x
    pool.axis[k * 3 + 1] = _axis.y
    pool.axis[k * 3 + 2] = _axis.z
    pool.spin[k] = spin
    pool.angle[k] = 0
    pool.size[k * 3] = sx
    pool.size[k * 3 + 1] = sy
    pool.size[k * 3 + 2] = sz
    pool.age[k] = 0
    pool.life[k] = life
    pool.delay[k] = delay
    debris.setColorAt(k, _shade.copy(color).multiplyScalar(shade))
    debris.geometry.attributes.aStyle.setX(k, style)
    pool.dirty = true
  }

  /**
   * Smashes the whole wall at track metre `m` to bits, so it comes down rather than
   * vanishing. The hit lands at (`hx`, `hy`) on it. Its panel goes in its material's grid
   * of pieces (a share of it on lower presets: GRID_SHARE), each starting exactly where it
   * was in the wall: those round the hit pulverised into four small pieces each (CORE),
   * blasted out of the hole at once, a little further on down the runway the harder the
   * punch (`speed`); further out the break reaches them a beat later (the crack
   * spreading) and they're thrown less hard - tumbling outward and dropping, the
   * outermost barely more than falling out. Out of the hole bursts a spray of dusty
   * crumbs (CRUMBS), and a cloud of dust on presets with particles. (Its pillars topple:
   * placeFallingPillars.) Nothing is thrown on as fast as the chase camera comes on
   * behind: the pieces lie strewn along the runway by the time it gets there, rather than
   * flying along in front of it.
   */
  const shatter = (m, look, hx, hy, speed, quality) => {
    const material = look[3]
    const share = GRID_SHARE[quality]
    const limit = POOL[quality]
    const nx = Math.max(3, Math.round(material.grid[0] * share))
    const ny = Math.max(2, Math.round(material.grid[1] * share))
    const cw = PANEL_W / nx
    const ch = PANEL_H / ny
    const push = Math.min(speed, 80)
    const pulverise = quality !== 'low'
    /** One piece of (`w` x `h`) from (`x`, `y`) on the wall, thrown `power` times as hard. */
    const fling = (x, y, w, h, power) => {
      const r1 = Math.random()
      const r2 = Math.random()
      const r3 = Math.random()
      // How close to the hit (1 at it, falling away over a few metres).
      const dx = x - hx
      const dy = y - hy
      const d = Math.hypot(dx, dy)
      const near = Math.exp(-d / 3.2)
      // Out from the hole, a little up, and on down the runway (-Z). A hair smaller than
      // its cell, so the pieces read as separate; each a shade lighter or darker.
      const out = (1.5 + 7 * near) * power
      piece(
        m,
        x,
        y,
        (dx / (d + 0.3)) * out + (r1 - 0.5) * 2,
        (dy / (d + 0.3)) * out * 0.5 + 0.5 + r2 * 2.5 * near,
        -(1 + (4 + push * 0.08) * near * power + r3 * 2),
        w * (0.9 + r1 * 0.08),
        h * (0.9 + r2 * 0.08),
        PANEL_D * (0.85 + r3 * 0.15),
        (1.5 + (2 + r3 * 9) * (0.3 + near)) * material.spin * power,
        // The break spreads from the hit at ~60 m/s.
        d / 60,
        look[0],
        0.86 + r1 * 0.22,
        material.panel,
        LIFE * (0.8 + r3 * 0.2),
        limit,
      )
    }
    // In blocks of 2 x 2 cells: a block well away from the hit comes off as one big slab,
    // nearer it breaks into its cells, and at the hit each cell is pulverised.
    for (let by = 0; by < ny; by += 2) {
      for (let bx = 0; bx < nx; bx += 2) {
        const bw = Math.min(2, nx - bx)
        const bh = Math.min(2, ny - by)
        const sx = -PANEL_W / 2 + cw * (bx + bw / 2)
        const sy = ch * (by + bh / 2)
        if (bw === 2 && bh === 2 && Math.hypot(sx - hx, sy - hy) > SLAB) {
          fling(sx, sy, cw * 2, ch * 2, 0.85)
          continue
        }
        for (let gy = by; gy < by + bh; gy += 1) {
          for (let gx = bx; gx < bx + bw; gx += 1) {
            // Every other course a little out of line, like a real wall's bricks.
            const x = -PANEL_W / 2 + cw * (gx + 0.5) + (gy % 2 ? (Math.random() - 0.5) * cw * 0.15 : 0)
            const y = ch * (gy + 0.5)
            if (pulverise && Math.hypot(x - hx, y - hy) < CORE) {
              for (let q = 0; q < 4; q += 1) fling(x + (q & 1 ? 0.25 : -0.25) * cw, y + (q & 2 ? 0.25 : -0.25) * ch, cw * 0.5, ch * 0.5, 1.3)
            } else fling(x, y, cw, ch, 1)
          }
        }
      }
    }
    // Crumbs: small, dusty, out of the hole every way, quickly gone.
    _dust.copy(look[0]).lerp(_white, 0.35)
    for (let i = 0; i < CRUMBS[quality]; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const size = 0.1 + Math.random() * 0.24
      const fast = 6 + Math.random() * 11
      piece(
        m - PANEL_D * 0.5,
        hx + c * r,
        Math.min(PANEL_H - 0.2, Math.max(0.2, hy + s * r)),
        c * fast,
        s * fast * 0.7 + 2 + Math.random() * 4,
        -(2 + Math.random() * (4 + push * 0.06)),
        size,
        size * (0.6 + Math.random() * 0.5),
        size * (0.7 + Math.random() * 0.4),
        8 + Math.random() * 14,
        0,
        _dust,
        0.85 + Math.random() * 0.3,
        material.panel,
        CRUMB_LIFE * (0.7 + Math.random() * 0.6),
        limit,
      )
    }
    // A cloud of dust where it gave way, rolling out along its foot (presets with particles).
    if (DUST[quality]) {
      trackPoint(m, hx, hy, _p)
      assets.dust.burst(_p.x, _p.y, _p.z, look[0], PANEL_W / 2, DUST[quality])
    }
  }

  useFrame((frame, rawDelta) => {
    const walls = wallRef.current
    const debris = debrisRef.current
    if (!walls || !debris) return
    const delta = Math.min(rawDelta, 0.05)
    const settings = getQuality()
    const quality = !settings.particles ? 'low' : settings.decorDensity >= 0.75 ? 'high' : 'medium'
    const st = state.current
    const now = performance.now()

    // --- Which walls, and which are already smashed --------------------------------
    const fromMeter = meterAtZ(LAUNCH_STAND.z)
    let focus = WALL_FIRST
    let stopMeter = Infinity
    if (roll.active) {
      if (st.for !== roll.startedAt) {
        st.for = roll.startedAt
        st.smashed = -1
        for (const t of st.topples) t.index = -1
        st.combo = 0
      }
      focus = Math.max(WALL_FIRST, roll.meter)
      stopMeter = stopWallMeter(roll.distance, fromMeter)
      // The punch's force reaches FIST_AHEAD ahead of its point: every wall it has
      // reached breaks (all but the one that holds).
      if (!roll.crashed && roll.phase !== 'launch') {
        const front = roll.meter + FIST_AHEAD
        const last = Math.floor((Math.min(front, stopMeter - 0.5) - WALL_FIRST) / WALL_EVERY)
        while (st.smashed < last) {
          st.smashed += 1
          const m = wallMeter(st.smashed)
          const look = wallLook(zoneIndexAt(m))
          // Only walls the break is at burst: when the picture cuts ahead (rollControl's
          // showPace) the ones skipped over - behind the break, between it and the camera -
          // are already down when it gets there (quietly, and cheaply): pillars lying flat,
          // nothing standing in the way of the shot.
          const near = m >= roll.meter - NEAR_BREAK
          const topple = st.topples[st.toppleNext]
          st.toppleNext = (st.toppleNext + 1) % TOPPLES
          topple.index = st.smashed
          topple.at = near ? now : now - SKIPPED_AGE * 1000
          if (near) {
            shatter(m, look, roll.x, roll.position.y, roll.speed, quality)
            st.combo += 1
            // One crash at a time: when the picture cuts ahead, several walls go at once.
            if (now - st.soundAt > SMASH_SOUND_MS) {
              st.soundAt = now
              sfx.wallSmash(Math.min(6, st.combo), look[3].sound)
            }
            // The first few walls get a beat of slow motion and a camera jolt each
            // (rollControl); after that the clock would fall too far behind.
            if (st.combo <= 3 && now - roll.hitAt > 300) roll.hitAt = now
          }
        }
      }
    } else {
      st.for = -1
    }

    // --- The walls -------------------------------------------------------------------
    const first = Math.max(0, Math.ceil((focus - REAR - WALL_FIRST) / WALL_EVERY))
    const reach = settings.viewDistance * 0.9
    let slot = 0
    for (let i = first; slot < WALL_SLOTS; i += 1) {
      const m = wallMeter(i)
      if (m > focus + reach) break
      // Where the wall that holds goes, no ordinary wall.
      if (Math.abs(m - stopMeter) < 3) continue
      if (roll.active && i <= st.smashed) {
        // Smashed this punch: its bricks are flying (the pool) and its pillars falling -
        // or, skipped over when the picture cut ahead, just gone.
        let topple = null
        for (const t of st.topples) if (t.index === i) topple = t
        const age = topple ? (now - topple.at) / 1000 : LIFE
        if (age < LIFE) placeFallingPillars(walls, slot * PARTS, m, wallLook(zoneIndexAt(m)), toppleAngle(age), LIFE - age < FADE ? (LIFE - age) / FADE : 1)
        else hideWall(walls, slot * PARTS)
      } else placeWall(walls, slot * PARTS, m, wallLook(zoneIndexAt(m)))
      slot += 1
    }
    for (; slot < WALL_SLOTS; slot += 1) hideWall(walls, slot * PARTS)

    // The wall that holds: hit, it shudders and cracks, a puff of dust and a few chips.
    if (roll.active && Number.isFinite(stopMeter)) {
      const look = wallLook(zoneIndexAt(stopMeter))
      if (roll.crashed && st.crackFor !== roll.startedAt) {
        st.crackFor = roll.startedAt
        st.crackedAt = now
        trackPoint(stopMeter - PANEL_D, roll.x, roll.position.y, _p)
        if (DUST[quality]) assets.dust.burst(_p.x, _p.y, _p.z, look[0], PANEL_W / 4, DUST[quality] * 0.5)
        chips(stopMeter - PANEL_D, look, roll.x, roll.position.y, CHIPS[quality], POOL[quality])
      }
      const since = roll.crashed ? (now - st.crackedAt) / 1000 : Infinity
      const shake = since < 0.6 ? Math.sin(since * 60) * 0.14 * (1 - since / 0.6) : 0
      placeWall(walls, STOP_BASE, stopMeter, look, shake)
      if (roll.crashed) {
        // The crack splitting out from where it was hit: most of the way in a blink
        // (CRACK_SPREAD), then creeping on to its full reach (CRACK_CREEP).
        const burstOut = 1 - (1 - Math.min(1, since / CRACK_SPREAD)) ** 3
        const creep = Math.min(1, Math.max(0, (since - CRACK_SPREAD) / CRACK_CREEP))
        trackPoint(stopMeter - PANEL_D / 2 - 0.03, roll.x + shake, roll.position.y, _p)
        assets.crack.show(_p.x, _p.y, _p.z, 0.82 * burstOut + 0.18 * creep)
      } else assets.crack.hide()
    } else {
      hideWall(walls, STOP_BASE)
      assets.crack.hide()
    }
    walls.instanceMatrix.needsUpdate = true
    walls.geometry.attributes.aStyle.needsUpdate = true
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true

    assets.dust.update(delta)

    // --- The pieces ------------------------------------------------------------------
    // Each in its own instance: its matrix written straight into the buffer (rotation
    // about its spin axis, times its size, at its position), hidden once as it goes.
    const pool = assets.pool
    const e = debris.instanceMatrix.array
    const settle = Math.exp(-FRICTION * delta)
    let top = 0
    let changed = false
    for (let k = 0; k < POOL_MAX; k += 1) {
      const o = k * 16
      if (pool.age[k] >= pool.life[k]) {
        if (pool.shown[k]) {
          pool.shown[k] = 0
          e.fill(0, o, o + 16)
          changed = true
        }
        continue
      }
      pool.age[k] += delta
      const i3 = k * 3
      if (pool.age[k] > pool.delay[k]) {
        pool.v[i3 + 1] -= GRAVITY * delta
        pool.p[i3] += pool.v[i3] * delta
        pool.p[i3 + 1] += pool.v[i3 + 1] * delta
        pool.p[i3 + 2] += pool.v[i3 + 2] * delta
        pool.angle[k] += pool.spin[k] * delta
        const half = pool.size[i3 + 1] / 2
        if (pool.p[i3 + 1] <= half) {
          // A thud on the runway, losing most of it; then sliding and tumbling to a stop.
          pool.p[i3 + 1] = half
          if (pool.v[i3 + 1] < -1.5) pool.v[i3 + 1] = -pool.v[i3 + 1] * 0.25
          else pool.v[i3 + 1] = 0
          pool.v[i3] *= settle
          pool.v[i3 + 2] *= settle
          pool.spin[k] *= settle
        }
      }
      // Its last FADE seconds: lying on the runway it settles and sinks into it; still in
      // the air (a crumb), it shrinks away.
      const left = pool.life[k] - pool.age[k]
      const fade = left < FADE ? Math.max(0, left / FADE) : 1
      const grounded = pool.p[i3 + 1] <= pool.size[i3 + 1] / 2 + 0.01
      const shrink = grounded ? 0.35 + 0.65 * fade : fade
      const sink = grounded ? (1 - fade) * pool.size[i3 + 1] * 0.9 : 0
      const sx = pool.size[i3] * shrink
      const sy = pool.size[i3 + 1] * shrink
      const sz = pool.size[i3 + 2] * shrink
      const x = pool.axis[i3]
      const y = pool.axis[i3 + 1]
      const z = pool.axis[i3 + 2]
      const c = Math.cos(pool.angle[k])
      const s = Math.sin(pool.angle[k])
      const t = 1 - c
      e[o] = (t * x * x + c) * sx
      e[o + 1] = (t * x * y + s * z) * sx
      e[o + 2] = (t * x * z - s * y) * sx
      e[o + 3] = 0
      e[o + 4] = (t * x * y - s * z) * sy
      e[o + 5] = (t * y * y + c) * sy
      e[o + 6] = (t * y * z + s * x) * sy
      e[o + 7] = 0
      e[o + 8] = (t * x * z + s * y) * sz
      e[o + 9] = (t * y * z - s * x) * sz
      e[o + 10] = (t * z * z + c) * sz
      e[o + 11] = 0
      e[o + 12] = pool.p[i3]
      e[o + 13] = pool.p[i3 + 1] - sink
      e[o + 14] = pool.p[i3 + 2]
      e[o + 15] = 1
      pool.shown[k] = 1
      top = k + 1
      changed = true
    }
    // Only the slots in use go up to the GPU (and those just emptied above them).
    if (changed) {
      const matrices = debris.instanceMatrix
      matrices.clearUpdateRanges()
      matrices.addUpdateRange(0, Math.max(top, debris.count) * 16)
      matrices.needsUpdate = true
    }
    debris.count = top
    if (pool.dirty) {
      pool.dirty = false
      debris.geometry.attributes.aStyle.needsUpdate = true
      if (debris.instanceColor) debris.instanceColor.needsUpdate = true
    }
  })

  /** A few chips knocked off the face of the wall that holds, at (hx, hy), into the preset's `limit` pool slots. */
  const chips = (m, look, hx, hy, count, limit) => {
    for (let i = 0; i < count; i += 1) {
      const r1 = Math.random()
      const r2 = Math.random()
      const r3 = Math.random()
      const size = 0.25 + r1 * 0.35
      // Back towards the punch, out and up.
      piece(m, hx + (r1 - 0.5) * 1.6, hy + (r2 - 0.5) * 1.6, (r1 - 0.5) * 8, 2 + r2 * 5, 3 + r3 * 5, size, size * 0.7, size * 0.8, 5 + r3 * 8, 0, look[0], 0.85 + r2 * 0.2, look[3].panel, LIFE, limit)
    }
  }

  return (
    <>
      <primitive ref={wallRef} object={assets.walls} />
      <primitive ref={debrisRef} object={assets.debris} />
      <primitive object={assets.dust.mesh} />
      <primitive object={assets.crack.mesh} />
    </>
  )
}
