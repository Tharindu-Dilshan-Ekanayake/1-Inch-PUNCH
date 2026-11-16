/**
 * The scene's whole look in one place: the Sunset Dojo - an evening sky, violet overhead
 * melting to a glowing orange horizon, the low sun behind the runway, a golden-green
 * plaza, and blocky hills all round it in terracotta and plum (hills.js) with autumn
 * maples, mossy boulders and the odd violet torii gate on their terraces, the wall-lined
 * runway running off between them. Violet and gold trim everything built for it.
 *
 * Colours are sRGB hex, exactly as you would pick them in an image editor.
 *
 * Light intensities are three.js physical units: a light of intensity PI (~3.14)
 * lights a surface facing it to its full texture colour. The cool sky fill plus the warm
 * low sun add up to just over that on the ground, which keeps the turf vivid; shadowed
 * ground only gets the cool fill, so shadows read blue and the lit side gold.
 */

/** Style id of the grassy blocky hills (materials STYLE.HILL; a number here so this file stays import-free). */
const STYLE_HILL = 14

/** The home team's colours: everything built for the venue uses these. */
export const TEAM = {
  blue: '#1f4fd8',
  navy: '#14234f',
  white: '#f4f7fb',
  gold: '#ffc21a',
}

export const SKY = {
  /** Straight up: an evening violet. */
  top: '#5b4fd6',
  /** At eye level: the sunset's orange glow. Fog uses the same colour so distant ground melts into the sky. */
  horizon: '#ffb47a',
  /** Lower = the deep colour reaches further down towards the horizon. */
  exponent: 0.55,
  /** The sun's glow round its direction, and how strong it is. */
  sun: '#ffd08a',
  glow: 1,
  /** High clouds (0 none, 1 plenty), and stars (night stages only). */
  clouds: 0.85,
  stars: 0,
}

export const FOG = {
  color: SKY.horizon,
}

/** Every surface colour in the lobby. */
export const PALETTE = {
  /** The ball shop's yard. */
  shopFloor: '#e8edf6',
  /** Rings painted round the portal on the sideline. */
  apron: '#16245a',
  apronEdge: TEAM.gold,
  /** The pavilions: pale concrete steps (a shade darker every third row), the team's seats. */
  concrete: ['#c9ced6', '#c9ced6', '#b7bdc8'],
  seats: [TEAM.blue, TEAM.white, TEAM.gold],
  standBase: '#8c93a1',
  rail: '#ffffff',
  /** Mown turf, light and dark: the plaza's field, the strip round it and the kick field. */
  turf: ['#2fbf47', '#3ad456'],
  /** The crowd's shirts: mostly the home team's, a few away fans. */
  crowd: [TEAM.blue, '#ffffff', TEAM.gold, '#2f66d6', TEAM.blue, '#ffe27a', '#e8eef8', '#ff5a4a'],
  /** Flags along the roofs. */
  flags: [TEAM.blue, TEAM.white, TEAM.gold],
  /** The city round the stadium: hazy blue-grey and dusky purple towers. */
  city: ['#5a6787', '#6b6f8f', '#4f5a7a', '#776c8c', '#5d7290'],
  /** Car park and service roads beyond the stands. */
  asphalt: '#555b68',
}

/**
 * Each world's venue: the colours everything built for it uses, and whether it's the beach
 * (none is, now; the beach pieces are kept for a world that wants them). World 1 is the
 * Sunset Dojo (violet and gold, terracotta hills with autumn maples); World 2 is the
 * Bamboo Temple (vermilion, black and gold, green mountains of mossy stone with bamboo
 * groves, pines, stone lanterns, pagodas and red torii). The lobby (World.jsx) and the
 * runway (Lane.jsx) are built from the one for the world you're in, and rebuilt when you
 * step through the portal. `valley`: the runway's hills and turf (Lane.jsx).
 */
export const VENUES = [
  {
    beach: false,
    primary: '#6a2cf0',
    dark: '#1d1238',
    light: '#fff4e6',
    accent: '#ffb81f',
    concrete: PALETTE.concrete,
    wall: '#c4c9d2',
    vip: '#d5dae1',
    glass: '#1c2b46',
    crowd: PALETTE.crowd,
    flags: PALETTE.flags,
    pitch: { north: '#6a2cf0', south: '#2a1a5c', border: '#ffffff', track: '#7a3ad8', apron: '#2a1a5c' },
    /** Beyond the turf round the plaza (golden grass, under the hills), and the turf strip itself. */
    surround: '#93c13a',
    strip: ['#a3cc3e', '#b0d848'],
    shopFloor: '#f3e6d6',
    logo: { rim: '#ffcf3a', ring: '#6a2cf0', inner: '#ffe9c2', top: 'SUNSET', bottom: 'DOJO' },
    /** The hills round the lobby: terracotta slopes to plum crags by terrace (low to high), and what grows on them. */
    hills: { rock: ['#e0915e', '#d27a52', '#bd6650', '#9b5a68', '#7a557f'], cap: STYLE_HILL, trees: 'maple' },
    endNorth: 'SMASH IT!',
    /** The start arch and the ball shop's stages and sign. */
    arch: { pillar: '#7a2cff', base: '#1d1238', glow: '#ffd27a', crest: '#ffb81f' },
    shop: { band: '#7a2cff', strip: '#ffd27a', post: '#ffb81f', panel: '#1d1238' },
    valley: { grass: ['#9fd23c', '#93c636'], ground: '#8fbf34', dirt: ['#e0915e', '#c8714c'], leaves: ['#ff7a1a', '#ff4a2a'], trunk: '#4a2e22' },
  },
  {
    beach: false,
    primary: '#d22a2a',
    dark: '#1e1416',
    light: '#fff6e6',
    accent: '#ffc21f',
    concrete: ['#c9c6bc', '#c9c6bc', '#b5b2a8'],
    wall: '#cfc8b8',
    vip: '#ded8ca',
    glass: '#1e2a26',
    crowd: ['#d22a2a', '#ffffff', '#ffc21f', '#1e1416', '#3f8f3a', '#ff9ab8', '#ffffff', '#d22a2a'],
    flags: ['#d22a2a', '#ffffff', '#ffc21f'],
    pitch: { north: '#d22a2a', south: '#1e1416', border: '#ffffff', track: '#b8322a', apron: '#1e1416' },
    /** Mossy grass under the mountains, and the plaza's turf strip. */
    surround: '#6fae3c',
    strip: ['#7cc44a', '#86ce52'],
    shopFloor: '#efe2c8',
    logo: { rim: '#ffc21f', ring: '#d22a2a', inner: '#fff2d6', top: 'BAMBOO', bottom: 'TEMPLE' },
    /** Mossy stone, greener low down, slate-blue at the peaks; bamboo, pines, lanterns, pagodas. */
    hills: { rock: ['#93a888', '#82987a', '#71876e', '#627569', '#566468'], cap: STYLE_HILL, trees: 'bamboo' },
    endNorth: 'BAMBOO TEMPLE',
    arch: { pillar: '#d22a2a', base: '#1e1416', glow: '#ffe2a0', crest: '#ffc21f' },
    shop: { band: '#d22a2a', strip: '#ffe2a0', post: '#ffc21f', panel: '#1e1416' },
    valley: { grass: ['#7cc44a', '#70b842'], ground: '#6fae3c', dirt: ['#8fa38a', '#7c917a'], leaves: ['#2f7a3a', '#ff9ab8'], trunk: '#4a3a2a' },
  },
]
export const venueOf = (world) => VENUES[world] ?? VENUES[0]

export const LIGHTS = {
  /** Soft lilac fill from the evening sky, a warm golden bounce off the plaza. */
  hemiSky: '#e4d6ff',
  hemiGround: '#e0c99a',
  hemiIntensity: 2.0,

  /** A low, warm evening sun. */
  sunColor: '#ffd6a0',
  sunIntensity: 2.0,
  /**
   * Direction *towards* the sun: low in the north-west, beyond the far end of the runway
   * (the sky's glow sits there too), so shadows fall long and back towards you.
   */
  sunDirection: [-0.45, 0.6, -0.66],
  /** 1 = shadows get no sunlight at all; lower = lighter shadows. */
  shadowIntensity: 0.6,
  /** Blur radius of shadow edges, in shadow-map texels. */
  shadowSoftness: 3,
}
