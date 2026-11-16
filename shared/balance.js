/**
 * Every tunable number in the game. Rules live in logic.js; this file is only data,
 * so balancing never means touching code. `scripts/balance-sim.mjs` plays the game
 * with these numbers and prints the pacing (time to each rebirth, pair of gloves and stage).
 *
 * Shared by client (display) and server (authority): both always agree on costs and
 * multipliers because they read the same table.
 *
 * The loop (+1 Dojo Punch): punch the training bags for Power -> step into the PUNCH
 * ZONE, charge your punch and let it go at the top of the meter (more Power smashes you
 * through more walls, and every metre pays) -> Wins -> better gloves, eggs and bags ->
 * take the BELT EXAM at max level (a rebirth: the next belt, a bigger Power multiplier
 * and a higher cap) -> smash further still. Every punch has a tiny chance of a HIDDEN
 * TECHNIQUE (SECRET_PUNCHES): a cut-in and a punch many times as strong.
 *
 * Inside the code the template's names stay (so saves and the server never change):
 * `health` is Power, a `tire` is a pair of GLOVES, a `pad` is a training bag, a `roll`
 * is a punch through the walls and a `zone` is a stretch of walls of one material. Only
 * what players see was renamed. How each pair of gloves looks is
 * client/src/game/armStyles.js; the belts are BELTS below.
 */

// --- Health and levels --------------------------------------------------------------

/** Seconds between gains punching a training bag: one punch, one gain. */
export const TRAIN_INTERVAL = 0.6
/**
 * Click (or tap) anywhere and you throw a punch: at most one every PUNCH_INTERVAL
 * seconds. At your training bag it's the bag's next punch, sooner than it would come by
 * itself; anywhere else it's a plain gain (the same as a tick of a punch's run).
 */
export const PUNCH_INTERVAL = 0.3
/** Seconds between the "+N" gains you earn while your punch smashes through the walls. */
export const ROLL_TICK = 1

/**
 * Your level comes from your Health: reaching level L takes healthForLevel(L) Health.
 * Each level needs LEVEL_GROWTH_EARLY times the last at first, easing towards
 * LEVEL_GROWTH_LATE: early rebirths multiply your gains many times over (a new bar,
 * x2 from the rebirth itself, the next gloves), later ones much less, and the levels
 * keep step so every rebirth takes a little longer than the one before.
 */
export const LEVEL_BASE = 20
export const LEVEL_GROWTH_EARLY = 1.3
export const LEVEL_GROWTH_LATE = 1.097
export const LEVEL_GROWTH_FADE = 100
/** Levels past this are not reachable: the table stops here. */
export const MAX_LEVEL = 1200

const LEVEL_TABLE = (() => {
  const table = new Float64Array(MAX_LEVEL + 1)
  let need = LEVEL_BASE
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    table[level] = table[level - 1] + need
    const growth = LEVEL_GROWTH_LATE + (LEVEL_GROWTH_EARLY - LEVEL_GROWTH_LATE) * Math.exp(-level / LEVEL_GROWTH_FADE)
    need *= growth
  }
  return table
})()

/** Two significant figures: level thresholds read cleanly (2,300, not 2,317). */
const round2 = (n) => {
  if (n < 100) return Math.round(n)
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

export const healthForLevel = (level) => (level <= 1 ? 0 : round2(LEVEL_TABLE[Math.min(MAX_LEVEL, level)]))

// --- Rebirth ----------------------------------------------------------------------

/** Max level by rebirth count: R0 = 15, R1 = 23, then +8 per rebirth. */
export const levelCap = (rebirths) => Math.min(MAX_LEVEL, 15 + 8 * Math.max(0, rebirths))

/** Health multiplier from rebirths, as in the reference: R0 = x1, R1 = x2, R2 = x3 ... */
export const rebirthMultiplier = (rebirths) => 1 + Math.max(0, rebirths)

/**
 * From Rebirth 15, every 5th rebirth (15, 20, 25...) comes with a gift of eggs: late in
 * the game, when each rebirth takes longest, there's always one coming up. One more egg
 * every 10 rebirths, up to 6.
 */
export const REBIRTH_GIFT_FROM = 15
export const REBIRTH_GIFT_EVERY = 5
export function rebirthGift(rebirths) {
  if (rebirths < REBIRTH_GIFT_FROM || (rebirths - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY !== 0) return null
  const amount = Math.min(6, 3 + Math.floor((rebirths - REBIRTH_GIFT_FROM) / 10))
  return { rebirths, item: 'eggVolcano', amount, label: `${amount} Volcano Eggs` }
}
/** The next rebirth after `rebirths` that brings a gift, and the gift. */
export function nextRebirthGift(rebirths) {
  const from = Math.max(REBIRTH_GIFT_FROM, rebirths + 1)
  const at = from + ((REBIRTH_GIFT_EVERY - ((from - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY)) % REBIRTH_GIFT_EVERY)
  return rebirthGift(at)
}

/** Skipping straight to a rebirth costs this many max-level punches' worth of Wins. */
export const REBIRTH_SKIP_ROLLS = 10

// --- Belts (what a rebirth is called) ---------------------------------------------

/**
 * Every rebirth is a BELT EXAM: you start in a white belt and each rebirth ties on the
 * next one. The nine karate colours first, then belts of precious stuff - bronze, silver,
 * gold, platinum, gems - up to the cosmic and rainbow belts. Past the last, the rainbow
 * belt earns a star a rebirth (beltFor). `color` is the belt's cloth; `trim` the stripe
 * and knot; `shine` how metallic it looks (0 cloth, 1 polished metal), `glow` how much it
 * shines on its own, and `rainbow` cycles its colour.
 */
export const BELTS = [
  { id: 'white', name: 'White Belt', color: '#f4f4f0', trim: '#c9c9c4' },
  { id: 'yellow', name: 'Yellow Belt', color: '#ffd21f', trim: '#e0a800' },
  { id: 'orange', name: 'Orange Belt', color: '#ff8a1f', trim: '#d0600a' },
  { id: 'green', name: 'Green Belt', color: '#3fc24a', trim: '#22862c' },
  { id: 'blue', name: 'Blue Belt', color: '#2f7bff', trim: '#1a4fc0' },
  { id: 'purple', name: 'Purple Belt', color: '#9b4dff', trim: '#6a24c8' },
  { id: 'red', name: 'Red Belt', color: '#ff3b3b', trim: '#b81c24' },
  { id: 'brown', name: 'Brown Belt', color: '#8a5228', trim: '#5c3214' },
  { id: 'black', name: 'Black Belt', color: '#1d1d22', trim: '#ffd21f' },
  { id: 'bronze', name: 'Bronze Belt', color: '#cd7f32', trim: '#8a4f18', shine: 0.7 },
  { id: 'silver', name: 'Silver Belt', color: '#d6dde8', trim: '#8a96a8', shine: 0.9 },
  { id: 'gold', name: 'Gold Belt', color: '#ffc81a', trim: '#c27a00', shine: 1, glow: 0.15 },
  { id: 'platinum', name: 'Platinum Belt', color: '#eef2f8', trim: '#9fb4d0', shine: 1, glow: 0.2 },
  { id: 'emerald', name: 'Emerald Belt', color: '#2bd17a', trim: '#0a6b34', shine: 0.8, glow: 0.25 },
  { id: 'ruby', name: 'Ruby Belt', color: '#ff3b5c', trim: '#7a0a22', shine: 0.8, glow: 0.25 },
  { id: 'sapphire', name: 'Sapphire Belt', color: '#3f6bff', trim: '#14246e', shine: 0.8, glow: 0.25 },
  { id: 'diamond', name: 'Diamond Belt', color: '#bff0ff', trim: '#4fc0ff', shine: 1, glow: 0.35 },
  { id: 'obsidian', name: 'Obsidian Belt', color: '#2a1440', trim: '#c35cff', shine: 0.9, glow: 0.3 },
  { id: 'cosmic', name: 'Cosmic Belt', color: '#2b1a6e', trim: '#ff6bd0', shine: 0.6, glow: 0.5 },
  { id: 'rainbow', name: 'Rainbow Belt', color: '#ff6bd0', trim: '#ffffff', shine: 0.6, glow: 0.5, rainbow: true },
]

/**
 * The belt you wear after `rebirths` rebirths: `{ ...belt, index, stars }`. Past the last
 * belt you keep the rainbow belt and earn a star for every rebirth beyond it.
 */
export function beltFor(rebirths) {
  const r = Math.max(0, Math.floor(rebirths) || 0)
  const index = Math.min(r, BELTS.length - 1)
  const stars = Math.max(0, r - (BELTS.length - 1))
  const belt = BELTS[index]
  return { ...belt, index, stars, label: stars > 0 ? `${belt.name} ★${stars}` : belt.name }
}

// --- Training bags (the template's pads) -----------------------------------------

/**
 * Training bags, south to north in world.js order. Standing at one punches it (and gains
 * Health) every TRAIN_INTERVAL: a jab, then a cross. `rebirths` = rebirths needed;
 * `product` = the SHOP pass that unlocks it instead; `world` = the only world it works in
 * (the beach bags at the north end of the row work in the Bamboo Temple only, and stand locked
 * in World 1 as a teaser).
 */
export const PADS = [
  { id: 'starter', name: 'Straw Bag', mult: 1, rebirths: 0 },
  { id: 'speed', name: 'Leather Bag', mult: 2, rebirths: 1 },
  { id: 'turbo', name: 'Bamboo Dummy', mult: 4, rebirths: 2 },
  { id: 'nitro', name: 'Iron Bag', mult: 10, rebirths: 4 },
  { id: 'rocket', name: 'Thunder Bag', mult: 20, rebirths: 6 },
  { id: 'diamond', name: 'Crystal Bag', mult: 40, product: 'padVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Bag', mult: 100, product: 'padBest', tag: 'BEST OVERALL!' },
  // Kept close to the Galaxy Bag: every Power multiplier here speeds up the whole late
  // game (scripts/balance-sim.mjs) - the beach bags are milestones, not a jump.
  { id: 'surf', name: 'Bamboo Bag', mult: 115, rebirths: 10, world: 1 },
  { id: 'tsunami', name: 'Temple Bag', mult: 130, rebirths: 16, world: 1 },
]

// --- Gloves (the template's tires) -------------------------------------------------

/**
 * The gloves you wear. `power` is the Health every single gain is worth before
 * multipliers (the "+1" of the starter gloves); `cost` is in Wins; `rarity` (RARITIES) is
 * shown on its stand. Bought in order at the glove shop. They start as plain training
 * gloves, turn to candy, jelly, stone, bamboo, robot and chrome, then frost, magma and
 * gems, and end as nebula, dragon, cosmic and infinity fists. About x2.6 power for
 * x2.8-x3.3 the Wins each. The ids are the template's (saves and the server key on them).
 */
export const TIRES = [
  { id: 'bicycle', name: 'Training Gloves', power: 1, cost: 0, rarity: 'common' },
  // Cheap enough to buy with the Wins from your very first punch.
  { id: 'mountain', name: 'Red Boxer Gloves', power: 3, cost: 1, rarity: 'common' },
  { id: 'wood', name: 'Slime Gloves', power: 5, cost: 15, rarity: 'common' },
  { id: 'stone', name: 'Candy Gloves', power: 12, cost: 75, rarity: 'uncommon' },
  { id: 'cookie', name: 'Jelly Gloves', power: 30, cost: 300, rarity: 'uncommon' },
  { id: 'pizza', name: 'Stone Fists', power: 75, cost: 1200, rarity: 'rare' },
  { id: 'donut', name: 'Bamboo Gloves', power: 200, cost: 4500, rarity: 'rare' },
  { id: 'watermelon', name: 'Octo Gloves', power: 500, cost: 16000, rarity: 'rare' },
  { id: 'monster', name: 'Robo Fists', power: 1250, cost: 55000, rarity: 'epic' },
  { id: 'mint', name: 'Zebra Gloves', power: 3500, cost: 180000, rarity: 'epic' },
  { id: 'silver', name: 'Chrome Gloves', power: 9000, cost: 600000, rarity: 'epic' },
  { id: 'ice', name: 'Frost Gloves', power: 23000, cost: 2e6, rarity: 'epic' },
  { id: 'gold', name: 'Golden Gloves', power: 60000, cost: 6e6, rarity: 'legendary' },
  { id: 'lava', name: 'Magma Fists', power: 155000, cost: 17e6, rarity: 'legendary' },
  { id: 'platinum', name: 'Thunder Gloves', power: 400000, cost: 48e6, rarity: 'legendary' },
  { id: 'emerald', name: 'Emerald Gloves', power: 1.05e6, cost: 135e6, rarity: 'legendary' },
  { id: 'ruby', name: 'Ruby Gloves', power: 2.7e6, cost: 380e6, rarity: 'mythic' },
  { id: 'diamond', name: 'Diamond Gloves', power: 7e6, cost: 1.05e9, rarity: 'mythic' },
  { id: 'rainbow', name: 'Spectrum Gloves', power: 1.8e7, cost: 3e9, rarity: 'mythic' },
  { id: 'unicorn', name: 'Cotton Candy Gloves', power: 4.8e7, cost: 8.5e9, rarity: 'mythic' },
  { id: 'galaxy', name: 'Nebula Gloves', power: 1.25e8, cost: 2.4e10, rarity: 'secret' },
  { id: 'dragon', name: 'Dragon Fists', power: 3.3e8, cost: 6.8e10, rarity: 'secret' },
  { id: 'cosmic', name: 'Cosmic Gloves', power: 8.6e8, cost: 1.9e11, rarity: 'secret' },
  { id: 'infinity', name: 'Infinity Fists', power: 2.2e9, cost: 5.4e11, rarity: 'secret' },
]

// --- Punching through the walls (the template's rolls) ----------------------------

/**
 * How far a punch smashes you through the walls (in metres): 0 Power still breaks ROLL_BASE metres, and each stage's start
 * is reached with the Power in its `wall`, less WALL_MARGIN; in between, distance
 * follows Power (in log terms) from one stage's start to the next. So the stages'
 * `wall` Power sets the pace. Nothing on the runway stops you: there are no gates.
 * See logic.rollReach.
 */
export const ROLL_BASE = 60
export const ROLL_H0 = 50
/** A stage's `wall` is this many times the Power that just reaches its start. */
export const WALL_MARGIN = 1.3

/**
 * The runway's sixty stages: stretches of distance, each a little longer than the one
 * before (100 m, 106 m, 112 m ... about 450 m), with no gates between them - just a new
 * name and sky. `theme` picks the sky (one of twenty). `wall` = the Power that paces how
 * far a punch smashes (see ROLL_BASE); each about twice the last. `winsPerMeter` pays for
 * every metre flown in the stage - the further out, the more each metre pays - and
 * `discover` is a one-off prize the first time you ever reach the stage. `smash` is
 * left over from the template's gates and no longer paid. Generated by
 * scripts/gen-stages.py.
 */
export const ZONES = [
  { id: 'grassy', name: 'Backyard', theme: 'grassy', start: 0, wall: 0, winsPerMeter: 0.006, smash: 0, discover: 0 },
  { id: 'autumn', name: 'Maple Lane', theme: 'autumn', start: 100, wall: 11, winsPerMeter: 0.0072, smash: 2, discover: 5 },
  { id: 'desert', name: 'Cactus Desert', theme: 'desert', start: 200, wall: 21, winsPerMeter: 0.00984, smash: 3, discover: 7 },
  { id: 'beach', name: 'Sunny Shore', theme: 'beach', start: 306, wall: 41, winsPerMeter: 0.0135, smash: 4, discover: 9 },
  { id: 'jungle', name: 'Jungle Vines', theme: 'jungle', start: 418, wall: 79, winsPerMeter: 0.0185, smash: 5, discover: 13 },
  { id: 'frozen', name: 'Frozen Tundra', theme: 'frozen', start: 536, wall: 150, winsPerMeter: 0.0255, smash: 7, discover: 18 },
  { id: 'cherry', name: 'Blossom Hills', theme: 'cherry', start: 660, wall: 300, winsPerMeter: 0.0351, smash: 10, discover: 24 },
  { id: 'candy', name: 'Candy Clouds', theme: 'candy', start: 790, wall: 590, winsPerMeter: 0.0486, smash: 13, discover: 34 },
  { id: 'mushroom', name: 'Mushroom Meadow', theme: 'mushroom', start: 926, wall: 1200, winsPerMeter: 0.0673, smash: 19, discover: 47 },
  { id: 'volcano', name: 'Volcano', theme: 'volcano', start: 1068, wall: 2300, winsPerMeter: 0.0934, smash: 26, discover: 65 },
  { id: 'swamp', name: 'Swamp Hollow', theme: 'swamp', start: 1216, wall: 4600, winsPerMeter: 0.13, smash: 36, discover: 90 },
  { id: 'crystal', name: 'Crystal Caves', theme: 'crystal', start: 1370, wall: 9200, winsPerMeter: 0.181, smash: 50, discover: 130 },
  { id: 'ocean', name: 'Coral Reef', theme: 'ocean', start: 1530, wall: 18000, winsPerMeter: 0.253, smash: 70, discover: 180 },
  { id: 'neon', name: 'Neon City', theme: 'neon', start: 1696, wall: 37000, winsPerMeter: 0.355, smash: 99, discover: 250 },
  { id: 'sky', name: 'Cloud Highway', theme: 'sky', start: 1868, wall: 75000, winsPerMeter: 0.498, smash: 140, discover: 350 },
  { id: 'rainbow', name: 'Rainbow Falls', theme: 'rainbow', start: 2046, wall: 150000, winsPerMeter: 0.7, smash: 190, discover: 490 },
  { id: 'moon', name: 'The Moon', theme: 'moon', start: 2230, wall: 310000, winsPerMeter: 0.987, smash: 270, discover: 690 },
  { id: 'aurora', name: 'Aurora Peaks', theme: 'aurora', start: 2420, wall: 640000, winsPerMeter: 1.39, smash: 390, discover: 970 },
  { id: 'space', name: 'Orbit Station', theme: 'space', start: 2616, wall: 1.3e6, winsPerMeter: 1.97, smash: 550, discover: 1400 },
  { id: 'cosmic', name: 'Star Gate', theme: 'cosmic', start: 2818, wall: 2.7e6, winsPerMeter: 2.8, smash: 780, discover: 1900 },
  { id: 'hills', name: 'Green Hills', theme: 'grassy', start: 3026, wall: 5.7e6, winsPerMeter: 3.98, smash: 1100, discover: 2800 },
  { id: 'maple', name: 'Maple Woods', theme: 'autumn', start: 3240, wall: 1.2e7, winsPerMeter: 5.66, smash: 1600, discover: 3900 },
  { id: 'dunes', name: 'Dune Sea', theme: 'desert', start: 3460, wall: 2.5e7, winsPerMeter: 8.08, smash: 2200, discover: 5600 },
  { id: 'island', name: 'Palm Island', theme: 'beach', start: 3686, wall: 5.3e7, winsPerMeter: 11.6, smash: 3200, discover: 8000 },
  { id: 'temple', name: 'Lost Temple', theme: 'jungle', start: 3918, wall: 1.1e8, winsPerMeter: 16.6, smash: 4600, discover: 12000 },
  { id: 'glacier', name: 'Glacier Pass', theme: 'frozen', start: 4156, wall: 2.4e8, winsPerMeter: 23.8, smash: 6600, discover: 17000 },
  { id: 'sakura', name: 'Sakura Garden', theme: 'cherry', start: 4400, wall: 5.1e8, winsPerMeter: 34.2, smash: 9500, discover: 24000 },
  { id: 'sweets', name: 'Sweet Valley', theme: 'candy', start: 4650, wall: 1.1e9, winsPerMeter: 49.3, smash: 14000, discover: 34000 },
  { id: 'fungi', name: 'Fungi Forest', theme: 'mushroom', start: 4906, wall: 2.3e9, winsPerMeter: 71.3, smash: 20000, discover: 50000 },
  { id: 'magma', name: 'Magma Core', theme: 'volcano', start: 5168, wall: 5e9, winsPerMeter: 103, smash: 29000, discover: 72000 },
  { id: 'marsh', name: 'Green Marsh', theme: 'swamp', start: 5436, wall: 1.1e10, winsPerMeter: 150, smash: 42000, discover: 100000 },
  { id: 'gems', name: 'Gem Mines', theme: 'crystal', start: 5710, wall: 2.4e10, winsPerMeter: 218, smash: 60000, discover: 150000 },
  { id: 'deep', name: 'Deep Ocean', theme: 'ocean', start: 5990, wall: 5.2e10, winsPerMeter: 317, smash: 88000, discover: 220000 },
  { id: 'cyber', name: 'Cyber City', theme: 'neon', start: 6276, wall: 1.1e11, winsPerMeter: 462, smash: 130000, discover: 320000 },
  { id: 'castle', name: 'Sky Castle', theme: 'sky', start: 6568, wall: 2.5e11, winsPerMeter: 676, smash: 190000, discover: 470000 },
  { id: 'prism', name: 'Prism Path', theme: 'rainbow', start: 6866, wall: 5.6e11, winsPerMeter: 990, smash: 270000, discover: 690000 },
  { id: 'lunar', name: 'Lunar Craters', theme: 'moon', start: 7170, wall: 1.2e12, winsPerMeter: 1450, smash: 400000, discover: 1e6 },
  { id: 'lights', name: 'Northern Lights', theme: 'aurora', start: 7480, wall: 2.8e12, winsPerMeter: 2140, smash: 590000, discover: 1.5e6 },
  { id: 'galaxy', name: 'Galaxy Rift', theme: 'space', start: 7796, wall: 6.2e12, winsPerMeter: 3150, smash: 870000, discover: 2.2e6 },
  { id: 'infinity', name: 'Infinity', theme: 'cosmic', start: 8118, wall: 1.4e13, winsPerMeter: 4650, smash: 1.3e6, discover: 3.2e6 },
  { id: 'sunflower', name: 'Sunflower Fields', theme: 'grassy', start: 8446, wall: 3.2e13, winsPerMeter: 6870, smash: 1.9e6, discover: 4.8e6 },
  { id: 'harvest', name: 'Harvest Valley', theme: 'autumn', start: 8780, wall: 7.2e13, winsPerMeter: 10200, smash: 2.8e6, discover: 7.1e6 },
  { id: 'oasis', name: 'Golden Oasis', theme: 'desert', start: 9120, wall: 1.6e14, winsPerMeter: 15100, smash: 4.2e6, discover: 1e7 },
  { id: 'lagoon', name: 'Blue Lagoon', theme: 'beach', start: 9466, wall: 3.7e14, winsPerMeter: 22500, smash: 6.2e6, discover: 1.6e7 },
  { id: 'canopy', name: 'Treetop Canopy', theme: 'jungle', start: 9818, wall: 8.6e14, winsPerMeter: 33500, smash: 9.3e6, discover: 2.3e7 },
  { id: 'yeti', name: 'Yeti Mountain', theme: 'frozen', start: 10176, wall: 2e15, winsPerMeter: 50000, smash: 1.4e7, discover: 3.5e7 },
  { id: 'lantern', name: 'Lantern Garden', theme: 'cherry', start: 10540, wall: 4.6e15, winsPerMeter: 74800, smash: 2.1e7, discover: 5.2e7 },
  { id: 'cupcake', name: 'Cupcake Kingdom', theme: 'candy', start: 10910, wall: 1.1e16, winsPerMeter: 112000, smash: 3.1e7, discover: 7.8e7 },
  { id: 'glowcap', name: 'Glowcap Grotto', theme: 'mushroom', start: 11286, wall: 2.5e16, winsPerMeter: 168000, smash: 4.7e7, discover: 1.2e8 },
  { id: 'inferno', name: 'Inferno Peak', theme: 'volcano', start: 11668, wall: 5.8e16, winsPerMeter: 253000, smash: 7e7, discover: 1.8e8 },
  { id: 'bayou', name: 'Firefly Bayou', theme: 'swamp', start: 12056, wall: 1.4e17, winsPerMeter: 382000, smash: 1.1e8, discover: 2.7e8 },
  { id: 'geode', name: 'Geode Valley', theme: 'crystal', start: 12450, wall: 3.2e17, winsPerMeter: 576000, smash: 1.6e8, discover: 4e8 },
  { id: 'atlantis', name: 'Atlantis', theme: 'ocean', start: 12850, wall: 7.6e17, winsPerMeter: 872000, smash: 2.4e8, discover: 6.1e8 },
  { id: 'arcade', name: 'Arcade Avenue', theme: 'neon', start: 13256, wall: 1.8e18, winsPerMeter: 1.3e6, smash: 3.7e8, discover: 9.2e8 },
  { id: 'islands', name: 'Sky Islands', theme: 'sky', start: 13668, wall: 4.3e18, winsPerMeter: 2e6, smash: 5.6e8, discover: 1.4e9 },
  { id: 'unicorn', name: 'Unicorn Trail', theme: 'rainbow', start: 14086, wall: 1e19, winsPerMeter: 3e6, smash: 8.5e8, discover: 2.1e9 },
  { id: 'mars', name: 'Red Planet', theme: 'moon', start: 14510, wall: 2.5e19, winsPerMeter: 4.7e6, smash: 1.3e9, discover: 3.2e9 },
  { id: 'comet', name: 'Comet Ice', theme: 'aurora', start: 14940, wall: 6e19, winsPerMeter: 7.1e6, smash: 2e9, discover: 4.9e9 },
  { id: 'nebula', name: 'Nebula', theme: 'space', start: 15376, wall: 1.5e20, winsPerMeter: 1.1e7, smash: 3e9, discover: 7.5e9 },
  { id: 'beyond', name: 'The Beyond', theme: 'cosmic', start: 15818, wall: 3.5e20, winsPerMeter: 1.7e7, smash: 4.6e9, discover: 1.2e10 },
]

/**
 * What the walls in each stage are made of - the name you see as you smash through
 * ("344 M - BRICK WALL") - toughest last, each fitting its stage's theme (sky and
 * scenery). Applied over ZONES' generated names, so re-running gen-stages.py keeps them.
 */
export const WALL_NAMES = [
  'Paper Wall', 'Cardboard Wall', 'Sandstone Wall', 'Driftwood Wall', 'Bamboo Wall',
  'Ice Wall', 'Cherry Wood Wall', 'Candy Brick Wall', 'Mushroom Wall', 'Basalt Wall',
  'Mossy Stone Wall', 'Crystal Wall', 'Coral Wall', 'Neon Glass Wall', 'Cloud Wall',
  'Rainbow Wall', 'Moon Rock Wall', 'Glacier Wall', 'Titanium Wall', 'Star Metal Wall',
  'Granite Wall', 'Iron Oak Wall', 'Pyramid Stone Wall', 'Seashell Wall', 'Temple Wall',
  'Permafrost Wall', 'Pagoda Wall', 'Rock Candy Wall', 'Giant Cap Wall', 'Magma Wall',
  'Bog Iron Wall', 'Amethyst Wall', 'Pearl Wall', 'Cyber Steel Wall', 'Storm Wall',
  'Prism Wall', 'Crater Wall', 'Aurora Wall', 'Meteor Wall', 'Nebula Wall',
  'Steel Wall', 'Bronze Wall', 'Golden Wall', 'Lagoon Glass Wall', 'Jade Wall',
  'Diamond Ice Wall', 'Lantern Wall', 'Cupcake Wall', 'Glowcap Wall', 'Inferno Wall',
  'Firefly Wall', 'Geode Wall', 'Abyss Wall', 'Arcade Wall', 'Sky Fortress Wall',
  'Unicorn Wall', 'Mars Rock Wall', 'Comet Wall', 'Black Hole Wall', 'Infinity Wall',
]
for (let i = 0; i < ZONES.length; i += 1) if (WALL_NAMES[i]) ZONES[i].name = WALL_NAMES[i]

/**
 * The walls down the runway: one every WALL_EVERY metres from WALL_FIRST, each smashed
 * as your punch bursts through it. Only a look (the Wins follow the metres, as ever):
 * the client places them (roll/Walls.jsx); the punch stops at the first one past its
 * distance, which cracks but holds.
 */
export const WALL_FIRST = 6
export const WALL_EVERY = 12
/** Track metre of wall `i` (0 = the first, right in front of the punch spot). */
export const wallMeter = (i) => WALL_FIRST + i * WALL_EVERY

/** Wins pickups down the runway: first at 40 m, then every 80 m. */
export const TROPHY_FIRST = 40
export const TROPHY_SPACING = 80
/** A trophy is worth this many metres of its zone's Wins (at least 1). */
export const TROPHY_METERS = 80

/**
 * Seconds from letting the punch go to bursting through the first wall: the move - a
 * crouch, a jump spinning round once in the air, landing in your stance, one coil, the
 * punch (client roll/path.js MOVE). (The charge before it is yours: you hold for as long
 * as you like, and the server only hears about the release.)
 */
export const ROLL_LAUNCH = 1.1
/**
 * Seconds a punch of `distance` metres takes, the wind-up included. Logarithmic: long
 * smashes stay short.
 */
export const rollDuration = (distance) => ROLL_LAUNCH + 3 + 2.2 * Math.log(1 + distance / 60)
/** The result popup after you stop, before you're back in the Punch Zone. */
export const ROLL_RECOVERY = 2.2

/**
 * The power meter. Step onto the punch spot in the PUNCH ZONE and press PUNCH: you take
 * your stance and the meter charges up (CHARGE_TIME to full). At full charge it pulses:
 * the meter bounces off the top and back, again and again (TWANG_PERIOD a bounce, dipping
 * TWANG_DEPTH). Press PUNCH again to let it go and smash into the walls. `accuracy` is how full the
 * meter was when you let go: 1 at the very top of a twang. The grade it lands in decides
 * the punch, each grade clearly apart from the next: how far you smash (`reach`, a share of
 * what your Power alone would send you - half the distance for a WEAK one, half as far
 * again for a PERFECT one) and how many Wins it pays (`bonus`). Auto Punch skips the
 * meter: a plain x1 punch, between GOOD and GREAT.
 *
 * Wins are the Power's worth times `bonus` - not paid by the metres the grade adds: late
 * in the game each stage pays ~1.4 times the last, so paying for half as far again would
 * multiply a PERFECT punch's Wins dozens of times over (logic.applyRoll).
 */
/** Seconds the power meter takes to charge from empty to full. */
export const CHARGE_TIME = 0.9
/** The meter (0-1) `seconds` into a charge: filling, then (twangAt) pulsing at the top. */
export const chargeAt = (seconds) => (seconds < CHARGE_TIME ? Math.max(0, seconds / CHARGE_TIME) : twangAt(seconds - CHARGE_TIME))
/**
 * Seconds per pulse at full charge, and how far down the meter each one dips. The
 * bounce is sharp at the top (|sin|), so the PERFECT moment is ~0.1 s each time: a real
 * test of timing, still fair on a phone, and a punch let go at full charge is never
 * worse than GOOD.
 */
export const TWANG_PERIOD = 0.75
export const TWANG_DEPTH = 0.5
/** The meter (0-1) `seconds` after reaching full charge: bouncing off the top. */
export const twangAt = (seconds) => 1 - TWANG_DEPTH * Math.abs(Math.sin((Math.PI * Math.max(0, seconds)) / TWANG_PERIOD))
/**
 * Grades by `min` accuracy: PERFECT is the top 12% of the meter, GREAT 30%, GOOD 60%.
 * `reach` is [at the grade's outer edge, at its inner edge]: a little further the nearer
 * the top within a grade, and a big step up to the next.
 */
export const HIT_GRADES = [
  { id: 'perfect', min: 0.88, reach: [1.4, 1.5], bonus: 1.6, label: 'PERFECT!' },
  { id: 'great', min: 0.7, reach: [1.1, 1.2], bonus: 1.25, label: 'GREAT!' },
  { id: 'good', min: 0.4, reach: [0.8, 0.9], bonus: 1, label: 'GOOD' },
  { id: 'weak', min: 0, reach: [0.5, 0.6], bonus: 0.75, label: 'TOO WEAK...' },
]
const clampAccuracy = (accuracy) => Math.min(1, Math.max(0, accuracy))
/** The grade for a meter `accuracy` (0-1), or null for a punch without the meter. */
export const hitGrade = (accuracy) => (Number.isFinite(accuracy) ? HIT_GRADES.find((g) => clampAccuracy(accuracy) >= g.min) : null)
/**
 * How far a punch at meter `accuracy` smashes, as a share of what your Power alone
 * would: 0.5 barely pulled, 1.5 at the top of a twang, in a clear step per grade; 1 for a
 * punch without the meter.
 */
export function hitReach(accuracy) {
  const grade = hitGrade(accuracy)
  if (!grade) return 1
  const index = HIT_GRADES.indexOf(grade)
  const top = index > 0 ? HIT_GRADES[index - 1].min : 1
  const t = Math.min(1, (clampAccuracy(accuracy) - grade.min) / (top - grade.min))
  return grade.reach[0] + (grade.reach[1] - grade.reach[0]) * t
}

// --- Pets & eggs ------------------------------------------------------------------

export const RARITIES = {
  common: { name: 'Common', color: '#b9c3cf', order: 0 },
  uncommon: { name: 'Uncommon', color: '#4ade80', order: 1 },
  rare: { name: 'Rare', color: '#38bdf8', order: 2 },
  epic: { name: 'Epic', color: '#b15cff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffc41f', order: 4 },
  mythic: { name: 'Mythic', color: '#ff3b6b', order: 5 },
  secret: { name: 'Secret', color: '#ff5bd8', order: 6 },
}

/** `mult` multiplies Health gains. Equipped pets stack additively (see logic.js). */
export const PETS = {
  cat: { name: 'Cat', rarity: 'common', mult: 1.1 },
  dog: { name: 'Dog', rarity: 'common', mult: 1.15 },
  bunny: { name: 'Bunny', rarity: 'uncommon', mult: 1.25 },
  bear: { name: 'Bear', rarity: 'rare', mult: 1.5 },
  cow: { name: 'Cow', rarity: 'uncommon', mult: 1.4 },
  parrot: { name: 'Parrot', rarity: 'rare', mult: 1.7 },
  fox: { name: 'Fox', rarity: 'epic', mult: 2.2 },
  tiger: { name: 'Tiger', rarity: 'legendary', mult: 3 },
  flamingo: { name: 'Flamingo', rarity: 'uncommon', mult: 2.5 },
  turtle: { name: 'Turtle', rarity: 'rare', mult: 3.2 },
  owl: { name: 'Owl', rarity: 'epic', mult: 4.5 },
  phoenix: { name: 'Phoenix', rarity: 'legendary', mult: 7 },
  pony: { name: 'Pony', rarity: 'rare', mult: 5 },
  unicorn: { name: 'Unicorn', rarity: 'epic', mult: 8 },
  pegasus: { name: 'Pegasus', rarity: 'legendary', mult: 13 },
  salamander: { name: 'Salamander', rarity: 'rare', mult: 10 },
  firebird: { name: 'Fire Bird', rarity: 'epic', mult: 16 },
  golem: { name: 'Magma Golem', rarity: 'legendary', mult: 26 },
  inferno: { name: 'Inferno Wolf', rarity: 'mythic', mult: 45 },
  dragon: { name: 'Dragon', rarity: 'epic', mult: 2.5 },
  crab: { name: 'Lucky Crab', rarity: 'uncommon', mult: 1.2 },
  sphinx: { name: 'Sphinx', rarity: 'secret', mult: 80 },
  // the Bamboo Temple's Beach Egg: the Kraken is the best pet in the game, but only just - the
  // best three pets set the late game's pace (scripts/balance-sim.mjs).
  seagull: { name: 'Seagull', rarity: 'rare', mult: 16 },
  dolphin: { name: 'Dolphin', rarity: 'epic', mult: 22 },
  shark: { name: 'Shark', rarity: 'legendary', mult: 32 },
  kraken: { name: 'Kraken', rarity: 'mythic', mult: 55 },
}

/**
 * Eggs, bought with Wins. `world` = the only world it hatches in (the Beach Egg: Palm
 * Beach). `pets` are [petId, weight] - weights are percentages and
 * sum to 100. Each egg is priced at about the Wins of a few punches at the stage of the
 * game whose pets it beats.
 */
export const EGGS = {
  basic: { name: 'Basic', cost: { wins: 15 }, pets: [['cat', 45], ['dog', 30], ['bunny', 20], ['bear', 5]] },
  meadow: { name: 'Grass', cost: { wins: 120 }, pets: [['cow', 45], ['parrot', 30], ['fox', 20], ['tiger', 5]] },
  sunset: { name: 'Sunset', cost: { wins: 750 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 6000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  volcano: { name: 'Volcano', cost: { wins: 35000 }, pets: [['salamander', 50], ['firebird', 30], ['golem', 15], ['inferno', 5]] },
  beach: { name: 'Beach', cost: { wins: 2000000 }, world: 1, pets: [['seagull', 45], ['dolphin', 30], ['shark', 20], ['kraken', 5]] },
}

export const MAX_EQUIPPED_PETS = 3
export const MAX_PET_INVENTORY = 60
/** Multi-hatch opens this many at once, for that many times the cost. */
export const MULTI_HATCH = 3

// --- Items, boosts, rewards -------------------------------------------------------

export const POTION_DURATION_MS = 5 * 60 * 1000

export const ITEMS = {
  potionHealth: { name: 'x2 Power Potion', kind: 'potion', boost: 'health', durationMs: POTION_DURATION_MS },
  potionWins: { name: 'x2 Wins Potion', kind: 'potion', boost: 'wins', durationMs: POTION_DURATION_MS },
  eggMeadow: { name: 'Grass Egg', kind: 'egg', egg: 'meadow' },
  eggSunset: { name: 'Sunset Egg', kind: 'egg', egg: 'sunset' },
  eggUnicorn: { name: 'Unicorn Egg', kind: 'egg', egg: 'unicorn' },
  eggVolcano: { name: 'Volcano Egg', kind: 'egg', egg: 'volcano' },
}

/** 7-day cycle; day N unlocks N x 24h after the cycle started. */
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DAILY_REWARDS = [
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Dragon', icon: 'pet:dragon', sub: 'x1', grant: { pet: 'dragon' } },
  { label: 'x2 Power', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'Unicorn Egg', icon: 'egg:unicorn', sub: 'x1', grant: { item: 'eggUnicorn' } },
  { label: 'x2 Power', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Volcano Egg', icon: 'egg:volcano', sub: 'x1', grant: { item: 'eggVolcano' } },
]

/**
 * Claimable once each per session, after this many minutes played: something to look
 * forward to every few minutes for the first hour.
 */
export const PLAYTIME_REWARDS = [
  { minutes: 3, label: '+10 Wins', icon: 'trophy', grant: { wins: 10 } },
  { minutes: 8, label: 'x2 Power', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 15, label: 'Grass Egg', icon: 'egg:meadow', grant: { item: 'eggMeadow' } },
  { minutes: 25, label: 'x2 Wins', icon: 'potionWins', grant: { item: 'potionWins' } },
  { minutes: 35, label: '+250 Wins', icon: 'trophy', grant: { wins: 250 } },
  { minutes: 45, label: 'Sunset Egg', icon: 'egg:sunset', grant: { item: 'eggSunset' } },
  { minutes: 60, label: 'x2 Power', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 90, label: 'Unicorn Egg', icon: 'egg:unicorn', grant: { item: 'eggUnicorn' } },
]

/** The stand by spawn: a pet the first time, a potion on later sessions. */
export const FREE_REWARD = { firstTime: { pet: 'crab' }, repeat: { item: 'potionHealth' } }

/** Offline training: a quarter of your pad's rate, for up to 8 hours away. */
export const OFFLINE_RATE = 0.25
export const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 60 * 1000

/**
 * The world portal (placed by PORTALS in world.js): its name, and what opens it the
 * first time - this many rebirths AND this many Wins held (not spent). After that it's
 * open for good, both ways. Stepping through earns the badge of the same id.
 */
export const WORLD_PORTALS = {
  world2: { name: 'Bamboo Temple', wins: 1000000, rebirths: 8 },
}

/**
 * the Bamboo Temple's Secret Star, hidden somewhere in its lobby (STAR in world.js): finding it
 * doubles every Power gain for good, in every world.
 */
export const SECRET_STAR = { world: 1, power: 2 }

// --- Worlds -----------------------------------------------------------------------

/**
 * the Bamboo Temple (World 2), through the portal once you've rebirthed 8 times and hold 1M
 * Wins: a dojo on the beach. Its own Beach Egg, two beach bags and a Secret Star,
 * and its own runway - the same stages, one for one, as beach spots - where every metre,
 * trophy and first-visit prize pays `wins` times as much. Its gates
 * need the same Health as World 1's - a harder World 2 would pay less than World 1 right
 * after each rebirth - so going over is always worth it, and coming back (the same
 * portal) costs nothing.
 */
export const WORLDS = [
  { id: 'world1', name: 'Sunset Dojo', wins: 1 },
  { id: 'world2', name: 'Bamboo Temple', wins: 3 },
]

/**
 * The Bamboo Temple's stages: [id, scenery name, theme], one for each of World 1's - a climb
 * from bamboo groves and temple steps past waterfalls, snowy peaks and dragon caves up to
 * the spirit gates and the stars. (The ids are older than the theme - saves name them -
 * and on screen each stage shows its World 1 wall's name: only the theme changes the look.)
 */
const WORLD2_STAGES = [
  ['w2-sandy-shore', 'Bamboo Gate', 'jungle'],
  ['w2-seashell-field', 'Stone Steps', 'grassy'],
  ['w2-palm-grove', 'Koi Pond', 'ocean'],
  ['w2-surf-stadium', 'Bamboo Grove', 'jungle'],
  ['w2-coconut-bowl', 'Cherry Garden', 'cherry'],
  ['w2-lifeguard-tower', 'Lantern Path', 'autumn'],
  ['w2-boardwalk-arena', 'Rice Terraces', 'swamp'],
  ['w2-sunset-pier', 'Temple Court', 'grassy'],
  ['w2-tiki-stadium', 'Pagoda Hill', 'autumn'],
  ['w2-coral-bowl', 'Zen Garden', 'desert'],
  ['w2-lagoon-field', 'Sacred Falls', 'ocean'],
  ['w2-shipwreck-cove', 'Misty Bridge', 'sky'],
  ['w2-pelican-point', 'Tea House', 'cherry'],
  ['w2-beach-party-bowl', 'Jade Temple', 'crystal'],
  ['w2-lighthouse-field', 'Maple Ridge', 'autumn'],
  ['w2-tide-pool-arena', 'Crane Lake', 'frozen'],
  ['w2-sandcastle-stadium', 'Bell Tower', 'sky'],
  ['w2-volcano-isle', 'Monk Path', 'grassy'],
  ['w2-moonlit-bay', 'Dragon Gate', 'volcano'],
  ['w2-starfish-bowl', 'Snowy Peak', 'frozen'],
  ['w2-turtle-beach', 'Golden Shrine', 'sky'],
  ['w2-mango-field', 'Tiger Cave', 'jungle'],
  ['w2-driftwood-arena', 'Thunder Falls', 'aurora'],
  ['w2-seagull-stadium', 'Plum Blossom', 'cherry'],
  ['w2-surfboard-bowl', 'Sakura Lane', 'cherry'],
  ['w2-bonfire-beach', 'Dojo Hall', 'autumn'],
  ['w2-hammock-field', 'Hidden Valley', 'swamp'],
  ['w2-pirate-bay', 'Fox Shrine', 'autumn'],
  ['w2-reef-stadium', 'Cloud Temple', 'sky'],
  ['w2-sea-breeze-bowl', 'Iron Gate', 'moon'],
  ['w2-flamingo-field', 'Lotus Pond', 'ocean'],
  ['w2-aloha-arena', 'Pine Ridge', 'frozen'],
  ['w2-dune-stadium', 'Ninja Village', 'neon'],
  ['w2-rainbow-reef', 'Shogun Castle', 'grassy'],
  ['w2-island-bowl', 'Samurai Road', 'desert'],
  ['w2-treasure-cove', 'Spirit Gate', 'aurora'],
  ['w2-wave-rider-field', 'Moon Shrine', 'moon'],
  ['w2-pearl-stadium', 'Lightning Peak', 'sky'],
  ['w2-glowing-bay', 'Ember Forge', 'volcano'],
  ['w2-coconut-cove', 'Starlit Garden', 'cosmic'],
  ['w2-sunrise-shore', 'Bronze Hall', 'desert'],
  ['w2-dolphin-bowl', 'Obsidian Cliffs', 'volcano'],
  ['w2-palm-paradise', 'Crystal Caves', 'crystal'],
  ['w2-tropic-stadium', 'Ice Monastery', 'frozen'],
  ['w2-crab-cove', 'Phoenix Nest', 'volcano'],
  ['w2-sundown-field', 'Emerald Falls', 'jungle'],
  ['w2-kraken-bay', 'Sky Bridge', 'sky'],
  ['w2-shark-fin-arena', 'Thunder Dojo', 'neon'],
  ['w2-golden-sands', 'Typhoon Coast', 'ocean'],
  ['w2-paradise-bowl', 'Silver Temple', 'moon'],
  ['w2-neon-boardwalk', 'Celestial Stairs', 'cosmic'],
  ['w2-starlit-beach', 'Dragon Spine', 'volcano'],
  ['w2-aurora-bay', 'Aurora Peak', 'aurora'],
  ['w2-marlin-stadium', 'Ruby Pagoda', 'cherry'],
  ['w2-mermaid-lagoon', 'Comet Shrine', 'space'],
  ['w2-big-wave-bowl', 'Diamond Dojo', 'crystal'],
  ['w2-hula-field', 'Heaven Gate', 'sky'],
  ['w2-ocean-kingdom', 'Cosmic Temple', 'cosmic'],
  ['w2-galaxy-beach', 'Grandmaster Hall', 'rainbow'],
  ['w2-beach-champions', 'Legend Summit', 'rainbow'],
]

const worldZones = (world) =>
  ZONES.map((zone, i) => {
    const mult = WORLDS[world].wins
    // The Bamboo Temple keeps its own ids and scenery; the walls are the same stuff as World 1's.
    const [id, , theme] = world === 1 ? WORLD2_STAGES[i] : [zone.id, zone.name, zone.theme]
    const name = zone.name
    return {
      ...zone,
      id,
      name,
      theme,
      winsPerMeter: zone.winsPerMeter * mult,
      smash: zone.smash * mult,
      discover: zone.discover * mult,
    }
  })

/** Each world's stages, as ZONES: `WORLD_ZONES[profile.world]`. */
export const WORLD_ZONES = [ZONES, worldZones(1)]
export const zonesOf = (world) => WORLD_ZONES[world] ?? ZONES

// --- Shop -------------------------------------------------------------------------

/**
 * The shop. Wins are the game's only currency: everything here, like gloves and eggs,
 * is bought with them. `pass` = permanent unlock; `consumable` = grants every time.
 */
export const SHOP = {
  healthX2: { name: 'x2 Power', price: 400, kind: 'pass' },
  winsX2: { name: 'x2 Wins', price: 2500, kind: 'pass' },
  autoRoll: { name: 'Auto Punch', price: 150, kind: 'pass' },
  padVeryOp: { name: 'VERY OP! Bag', price: 150000, kind: 'pass' },
  padBest: { name: 'BEST OVERALL! Bag', price: 2500000, kind: 'pass' },
  sphinx: { name: 'Sphinx', price: 2500000, kind: 'consumable', grant: { pet: 'sphinx' }, stock: 1000 },
}

/**
 * Boxity Gems products, by sku. Prices live in Boxity's catalog, never here: the game
 * only names the sku and, once Boxity confirms the sale, grants what it says. Wins
 * packs grow with you: `winsRolls` max-level punches' worth of Wins.
 */
export const GEM_PRODUCTS = {
  wins_small: { name: 'Pile of Wins', blurb: '10 max-level punches of Wins', icon: 'trophy', grant: { winsRolls: 10 } },
  wins_big: { name: 'Mountain of Wins', blurb: '60 max-level punches of Wins', icon: 'trophy', grant: { winsRolls: 60 } },
  potion_bundle: { name: 'Potion Bundle', blurb: '3 x2 Power + 3 x2 Wins potions', icon: 'potionHealth', grant: { items: { potionHealth: 3, potionWins: 3 } } },
  volcano_eggs: { name: '3 Volcano Eggs', blurb: 'The best pets in the game', icon: 'egg:volcano', grant: { items: { eggVolcano: 3 } } },
  auto_roll: { name: 'Auto Punch', blurb: 'Punches the walls for you in the Punch Zone', icon: 'tire', grant: { pass: 'autoRoll' } },
  health_x2: { name: 'x2 Power', blurb: 'Double every Power gain, forever', icon: 'heart', grant: { pass: 'healthX2' } },
  wins_x2: { name: 'x2 Wins', blurb: 'Double every punch’s Wins, forever', icon: 'trophy', grant: { pass: 'winsX2' } },
  pad_best: { name: 'Galaxy Bag', blurb: 'Unlocks the x100 Galaxy training bag', icon: 'portal', grant: { pass: 'padBest' } },
}

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens. `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'health-potion': { label: 'x2 Power Potion', icon: 'potionHealth', grant: { item: 'potionHealth' }, cooldownMs: 3 * 60 * 1000 },
  'wins-potion': { label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' }, cooldownMs: 3 * 60 * 1000 },
}

/** Sphinx stock shown before the server reports the live count. */
export const SPHINX_STOCK_DEFAULT = 954

/**
 * The three Health packs under the level bar. They grow with you: each gives `share`
 * of the Health your next level needs, for `rolls` punches' worth of Wins at that Health.
 * Packs aren't held back by the level cap.
 */
export const HEALTH_PACKS = [
  { share: 1, rolls: 1 },
  { share: 5, rolls: 4 },
  { share: 20, rolls: 12 },
]

// --- Coming back for more: streaks, quests, combos, lucky gifts, friends ---------------

/**
 * A game day, in UTC: quests reset and login streaks count by it, the same for everyone
 * everywhere (`dayNumber(now)` is the day since 1970).
 */
export const DAY_MS = 24 * 60 * 60 * 1000
export const dayNumber = (now) => Math.floor(now / DAY_MS)

/**
 * Login streak: play on consecutive days and every punch pays STREAK_STEP more Wins per
 * day in a row (day 1 x1, day 2 x1.1 ... day 11 and on x2). Miss a day and it starts again
 * from day 1 - the reason to come back tomorrow.
 */
export const STREAK_STEP = 0.1
export const STREAK_MAX_DAYS = 11
export const streakMultiplier = (days) => 1 + STREAK_STEP * (Math.min(STREAK_MAX_DAYS, Math.max(1, days)) - 1)

/**
 * PERFECT combo: PERFECT punches in a row each pay COMBO_STEP more Wins than the last
 * (the 2nd +10%, the 3rd +20% ... up to +COMBO_MAX); anything less than PERFECT breaks it.
 * Kept for the session, never saved.
 */
export const COMBO_STEP = 0.1
export const COMBO_MAX = 0.5
export const comboBonus = (combo) => 1 + Math.min(COMBO_MAX, COMBO_STEP * Math.max(0, combo - 1))

/**
 * Playing together: every other player in your server (and your world) adds CROWD_STEP
 * to your punches' Wins, up to CROWD_MAX - bring your friends.
 */
export const CROWD_STEP = 0.1
export const CROWD_MAX = 0.3
export const crowdBonus = (others) => 1 + Math.min(CROWD_MAX, CROWD_STEP * Math.max(0, others))

/**
 * Lucky gifts: each punch has LUCKY_CHANCE of landing a surprise on top of its Wins.
 * `weight`s are relative. Wins gifts grow with you (`winsRolls` max-level punches' worth);
 * an egg gift is an egg that fits how far you've got (logic.eggItemFor).
 */
export const LUCKY_CHANCE = 0.08
export const LUCKY_GIFTS = [
  { weight: 45, label: 'Bag of Wins', icon: 'trophy', grant: { winsRolls: 4 } },
  { weight: 20, label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' } },
  { weight: 20, label: 'x2 Power Potion', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { weight: 15, label: 'Mystery Egg', icon: 'egg', grant: { egg: true } },
]

/**
 * Daily quests: QUESTS_PER_DAY a day - an EASY, a MEDIUM and a HARD one of different
 * kinds, picked fresh each day for each player - and a bonus chest for finishing all
 * three. Rewards grow with you: `winsRolls` max-level punches' worth of Wins (HARD adds
 * a potion; the chest adds an egg that fits your progress).
 *
 * Each kind counts one thing (`counter`, fed by the session as you play) up to its
 * target; `mode: 'best'` keeps the best single value instead of adding up. `targets` are
 * per tier; `scale` scales them with your best flight so far ('total': that many of it in
 * metres, 'best': that share of it). `{n}` in `text` is the target.
 */
export const QUESTS_PER_DAY = 3
export const QUEST_TIERS = [
  { id: 'easy', label: 'EASY', winsRolls: 3 },
  { id: 'medium', label: 'MEDIUM', winsRolls: 6 },
  { id: 'hard', label: 'HARD', winsRolls: 12, item: 'potionWins' },
]
export const QUEST_BONUS = { winsRolls: 15 }
export const QUEST_TYPES = {
  launch: { counter: 'launch', text: 'Punch the walls {n} times', targets: [5, 12, 25] },
  great: { counter: 'great', text: 'Land {n} GREAT or PERFECT punches', targets: [2, 5, 10] },
  perfect: { counter: 'perfect', text: 'Land {n} PERFECT punches', targets: [1, 3, 6] },
  combo: { counter: 'combo', mode: 'best', text: 'Hit a PERFECT combo of {n}', targets: [2, 3, 4] },
  reps: { counter: 'rep', text: 'Punch a training bag {n} times', targets: [40, 120, 300] },
  meters: { counter: 'meters', text: 'Smash {n} m of walls in total', scale: 'total', targets: [4, 10, 25] },
  far: { counter: 'far', mode: 'best', text: 'Smash {n} m in one punch', scale: 'best', targets: [0.6, 0.8, 0.95] },
  hatch: { counter: 'hatch', text: 'Hatch {n} pets', targets: [1, 3, 6] },
  minutes: { counter: 'minute', text: 'Play for {n} minutes', targets: [5, 15, 30] },
}

// --- Tutorial & badges ------------------------------------------------------------

/**
 * The guide for new players: train, punch, spend the Wins on new gloves, punch further,
 * rebirth. Each step completes when its event fires (and, with `health`, once you have
 * that much); after the last the guide is done.
 */
export const TUTORIAL = [
  { text: 'Punch the Straw Bag to gain Power', event: 'train', target: 'pad0', health: 30 },
  { text: 'Go to the PUNCH ZONE and smash the walls!', event: 'roll', target: 'roll' },
  { text: 'Buy the Red Boxer Gloves with your Wins!', event: 'buyTire', target: 'tires' },
]

export const BADGES = {
  firstRoll: { name: 'First Smash' },
  firstRebirth: { name: 'First Rebirth' },
  firstPet: { name: 'Pet Owner' },
  firstWall: { name: 'Explorer' },
  kilometer: { name: '1 Kilometre Punch' },
  space: { name: 'Space Puncher' },
  cosmic: { name: 'Cosmic Champion' },
  world2: { name: 'Beach Fighter' },
  secretStar: { name: 'Star Finder' },
}

// --- Hidden techniques (secret punches) ---------------------------------------------

/**
 * Every punch rolls for a HIDDEN TECHNIQUE, rarest first: `chance` is 1 in that many
 * punches. One landing turns the punch into that technique - a cut-in with its name and
 * odds, then a punch with `power` times your Power behind it (further through the walls,
 * and the Wins that far is worth). Ten of them, from the Iron Fist (1 in 25) to the
 * Infinity Fist (1 in 100,000). Each one you land is counted in profile.secretPunches -
 * the technique book. `color` and `glow` dress the cut-in and the aura.
 */
export const SECRET_PUNCHES = [
  { id: 'iron', name: 'Iron Fist', chance: 25, power: 2, color: '#c9d2de', glow: '#ffffff' },
  { id: 'tiger', name: 'Tiger Strike', chance: 60, power: 3, color: '#ff9a2e', glow: '#ffd21f' },
  { id: 'thunder', name: 'Thunder Palm', chance: 150, power: 5, color: '#5fd6ff', glow: '#fff36a' },
  { id: 'dragon', name: 'Dragon Fist', chance: 400, power: 8, color: '#3fe06a', glow: '#d6ff6a' },
  { id: 'phoenix', name: 'Phoenix Punch', chance: 1000, power: 12, color: '#ff5a1c', glow: '#ffd21f' },
  { id: 'tsunami', name: 'Tsunami Smash', chance: 2500, power: 20, color: '#2f7bff', glow: '#7ff6ff' },
  { id: 'volcano', name: 'Volcano Knuckle', chance: 6000, power: 35, color: '#ff2a2a', glow: '#ff9a2e' },
  { id: 'galaxy', name: 'Galaxy Breaker', chance: 15000, power: 60, color: '#a465ff', glow: '#ff6bd0' },
  { id: 'void', name: 'Void Strike', chance: 40000, power: 100, color: '#2a1440', glow: '#c35cff' },
  { id: 'infinity', name: 'Infinity Fist', chance: 100000, power: 250, color: '#ffffff', glow: '#ffd21f' },
]

/** The technique a punch lands with `rand`, rarest first, or null for a plain punch. */
export function rollSecretPunch(rand = Math.random) {
  for (let i = SECRET_PUNCHES.length - 1; i >= 0; i -= 1) {
    if (rand() < 1 / SECRET_PUNCHES[i].chance) return SECRET_PUNCHES[i]
  }
  return null
}

/**
 * Seconds the cut-in holds the punch before it lets go (the authority adds them to the
 * punch's cooldown, so both sides agree when you're free again).
 */
export const SECRET_HOLD = 1.6
