import { useQuality } from '../store/quality'
import { createCrowd } from './crowd'
import { createMusic } from './music'

/**
 * Sound effects, the crowd and the background music, synthesised with WebAudio: no audio
 * files to download.
 *
 * Browsers only allow audio after a user gesture. The audio engine (AudioContext, echo,
 * noise, music) is built while the game loads (prepareAudio), where it costs nothing
 * anyone sees - built on the first tap instead, it froze whatever that tap did. It
 * starts suspended; the first tap/click/key resumes it and starts the music, and every
 * sound before that is silently skipped.
 */

const MUTE_KEY = 'pp.muted'
/** Master gain at full volume; everything is mixed to sit under this. */
const BASE_GAIN = 0.5

let ctx = null
let master = null
/** Input of the echo the chimes ring out into (see createEcho). */
let echo = null
let noiseBuffer = null
let music = null
/** The stadium crowd (crowd.js): murmuring always, roaring at the big moments. */
let crowd = null
/** The player's own mute button (persisted). */
let muted = readMuted()
/**
 * Muted for a Boxity ad break. Kept apart from `muted` so the break ending restores
 * whatever the player had chosen, never overwrites it.
 */
let adMuted = false
/** Boxity's master_volume / music_volume settings, 0..1 (not persisted: Boxity keeps them). */
let masterVolume = 1
let musicVolume = 1
const lastPlayed = new Map()
const muteListeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

const silent = () => muted || adMuted

function applyMaster() {
  if (master) master.gain.value = silent() ? 0 : BASE_GAIN * masterVolume
}

/**
 * Builds the audio engine, suspended: the context, the master gain, the echo, the noise
 * and the music. Call while loading (GameScene does); the first gesture then only has
 * to resume it. Safe to call again.
 */
export function prepareAudio() {
  if (ctx) return
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return
  ctx = new Ctor()
  // Created outside a gesture it starts suspended anyway; make sure of it until a tap.
  if (ctx.state === 'running') ctx.suspend()
  master = ctx.createGain()
  applyMaster()
  master.connect(ctx.destination)
  echo = createEcho()
  // One second of white noise, reused by every whoosh and crack.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  music = createMusic(ctx, master, noiseBuffer)
  music.setVolume(musicVolume)
  crowd = createCrowd(ctx, master, noiseBuffer)
  bakeAll()
}

/**
 * Low-end devices (the LOW preset) get no crowd: its cheers and claps are dozens of audio
 * nodes at a time, built on the main thread - on a slow phone, frames lost mid-flight.
 */
const lite = () => useQuality.getState().level === 'LOW'
const liveCrowd = () => (lite() ? null : crowd)

let musicStarted = false
function unlock() {
  // Built already while loading, normally; on the spot if a tap beat it to it.
  prepareAudio()
  if (!ctx) return
  if (!musicStarted) {
    musicStarted = true
    music.start()
    liveCrowd()?.start()
  }
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended') ctx.resume()
}

/**
 * A short, darkening echo for the chimes to ring out into, so they sparkle instead of
 * clicking off. Built once; every sound sent to it shares it.
 */
function createEcho() {
  const input = ctx.createGain()
  input.gain.value = 0.25
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.13
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3200
  const feedback = ctx.createGain()
  feedback.gain.value = 0.32
  input.connect(delay)
  delay.connect(damp).connect(feedback).connect(delay)
  damp.connect(master)
  return input
}

/** Installs the first-gesture unlock. Call once at startup. */
export function installAudioUnlock() {
  const events = ['pointerdown', 'keydown', 'touchend']
  const handler = () => {
    unlock()
    for (const e of events) window.removeEventListener(e, handler, true)
  }
  for (const e of events) window.addEventListener(e, handler, true)
  // Mobile browsers suspend audio in the background; resume on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended' && !adMuted) ctx.resume()
  })
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Not persisted; fine.
  }
  applyMaster()
  for (const listener of muteListeners) listener(muted)
}

const clampVolume = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1)

/** Overall volume 0..1 (Boxity's master_volume setting). */
export function setMasterVolume(volume) {
  masterVolume = clampVolume(volume)
  applyMaster()
}

/** Music volume 0..1 (Boxity's music_volume setting), on top of the master volume. */
export function setMusicVolume(volume) {
  musicVolume = clampVolume(volume)
  music?.setVolume(musicVolume)
}

/**
 * Silences everything for a Boxity ad break, and suspends the audio clock so the music
 * scheduler doesn't pile notes up behind it. Ending the break restores the player's
 * own mute choice and volumes exactly as they were.
 */
export function setAdBreakMuted(on) {
  adMuted = Boolean(on)
  applyMaster()
  if (!ctx) return
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended' && document.visibilityState === 'visible') ctx.resume()
}

/** Calls `listener(muted)` on every change; returns the unsubscribe. */
export function onMutedChange(listener) {
  muteListeners.add(listener)
  return () => muteListeners.delete(listener)
}

// --- The flight: rushing through the air ------------------------------------------------

let ride = null
let rideSetAt = 0

/**
 * You in flight: a low, soft rush of air, swelling and fluttering with your speed - a
 * round, low-passed sound with no hiss in it - while the crowd "ooohs". The music ducks
 * under it until `windStop`.
 */
function windStart() {
  if (!ctx || ride || ctx.state !== 'running') return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  // Only the low rush of air: everything above ~900 Hz is cut, which is what hissed.
  const body = ctx.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.value = 420
  body.Q.value = 0.8
  const air = ctx.createGain()
  air.gain.value = 0.0001
  src.connect(body).connect(air).connect(master)
  // The tumble: the air's loudness swells and dips once a turn.
  const tumble = ctx.createOscillator()
  tumble.frequency.value = 4
  const depth = ctx.createGain()
  depth.gain.value = 0
  tumble.connect(depth).connect(air.gain)
  // A low hum under it, so it reads as a thing spinning, not wind.
  const hum = ctx.createOscillator()
  hum.type = 'triangle'
  hum.frequency.value = 70
  const humGain = ctx.createGain()
  humGain.gain.value = 0.0001
  hum.connect(humGain).connect(master)
  src.start(t)
  tumble.start(t)
  hum.start(t)
  ride = { src, air, body, tumble, depth, hum, humGain }
  music?.duck(true)
  liveCrowd()?.anticipate(true)
}

/**
 * `level` 0..1 from your speed; `airborne` while you fly (silent once you land: the
 * landing's own sounds take over). Positional: it's called every frame.
 */
function windSet(level, airborne = false) {
  if (!ride) return
  // Ten updates a second is plenty for a smooth swell.
  const now = performance.now()
  if (now - rideSetAt < 100) return
  rideSetAt = now
  const t = ctx.currentTime
  const l = Math.min(1, Math.max(0, level))
  const on = airborne ? 1 : 0
  const loud = on * (0.012 + l * 0.05)
  ride.air.gain.setTargetAtTime(loud, t, 0.15)
  ride.depth.gain.setTargetAtTime(loud * 0.8, t, 0.15)
  ride.body.frequency.setTargetAtTime(300 + l * 600, t, 0.2)
  ride.tumble.frequency.setTargetAtTime(3 + l * 7, t, 0.25)
  ride.hum.frequency.setTargetAtTime(60 + l * 50, t, 0.25)
  ride.humGain.gain.setTargetAtTime(on * (0.006 + l * 0.012), t, 0.15)
}

function windStop() {
  if (!ride) return
  const { src, air, depth, tumble, hum, humGain } = ride
  ride = null
  const t = ctx.currentTime
  air.gain.setTargetAtTime(0.0001, t, 0.15)
  depth.gain.setTargetAtTime(0, t, 0.15)
  humGain.gain.setTargetAtTime(0.0001, t, 0.15)
  src.stop(t + 1)
  tumble.stop(t + 1)
  hum.stop(t + 1)
  music?.duck(false)
  liveCrowd()?.anticipate(false)
}

// --- The charge: power gathering in your fist while you hold PUNCH --------------------

let charge = null
let chargeSetAt = 0

/**
 * Holding PUNCH: power gathering in your fist - a warm, low hum (a note and its fifth)
 * with a soft rush of air over it, both climbing an octave as the meter fills; full, it
 * throbs fast, ready to go. Moved by stretchSet, stopped by stretchStop (the template's
 * names, kept for its callers). Ten nodes, built once per charge.
 */
function stretchStart() {
  if (!ctx || charge || silent() || ctx.state !== 'running') return
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.setTargetAtTime(1, t, 0.08)
  out.connect(master)
  // The hum: a note and its fifth, warm (low-passed).
  const warm = ctx.createBiquadFilter()
  warm.type = 'lowpass'
  warm.frequency.value = 700
  warm.Q.value = 0.7
  const hum = ctx.createGain()
  hum.gain.value = 0.03
  warm.connect(hum).connect(out)
  const root = ctx.createOscillator()
  root.type = 'triangle'
  root.frequency.value = 110
  const fifth = ctx.createOscillator()
  fifth.frequency.value = 165
  root.connect(warm)
  fifth.connect(warm)
  // The throb: the hum's loudness pulsing, faster as it fills.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 4
  const depth = ctx.createGain()
  depth.gain.value = 0.008
  lfo.connect(depth).connect(hum.gain)
  // Air rushing in round the fist.
  const air = ctx.createBufferSource()
  air.buffer = noiseBuffer
  air.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 600
  band.Q.value = 1.2
  const airGain = ctx.createGain()
  airGain.gain.value = 0.004
  air.connect(band).connect(airGain).connect(out)
  root.start(t)
  fifth.start(t)
  lfo.start(t)
  air.start(t, Math.random() * 0.5)
  charge = { out, warm, root, fifth, lfo, depth, band, airGain, air }
}

/** `level` 0-1, the power meter; `full` once it's full. Called every frame. */
function stretchSet(level, full = false) {
  if (!charge) return
  const now = performance.now()
  if (now - chargeSetAt < 40) return
  chargeSetAt = now
  const t = ctx.currentTime
  const f = 110 * (1 + level)
  charge.root.frequency.setTargetAtTime(f, t, 0.05)
  charge.fifth.frequency.setTargetAtTime(f * 1.5, t, 0.05)
  charge.warm.frequency.setTargetAtTime(700 + level * 1800, t, 0.06)
  charge.band.frequency.setTargetAtTime(600 + level * 2400, t, 0.06)
  charge.airGain.gain.setTargetAtTime(0.004 + level * 0.016, t, 0.08)
  charge.lfo.frequency.setTargetAtTime(full ? 14 : 4 + level * 6, t, 0.05)
  charge.depth.gain.setTargetAtTime(full ? 0.02 : 0.008, t, 0.05)
}

function stretchStop() {
  if (!charge) return
  const { out, root, fifth, lfo, air } = charge
  charge = null
  const t = ctx.currentTime
  out.gain.setTargetAtTime(0.0001, t, 0.04)
  for (const node of [root, fifth, lfo, air]) node.stop(t + 0.3)
}

function ready(name, minGapMs = 0) {
  if (!ctx || silent() || ctx.state !== 'running') return false
  const now = performance.now()
  if (minGapMs && now - (lastPlayed.get(name) || 0) < minGapMs) return false
  lastPlayed.set(name, now)
  return true
}

/**
 * Runs `build(t)` for a sound due `at` seconds from now: straight away when it's due
 * soon, otherwise just before it's due (`t` still lands it on time). So a chord, a run of
 * bells or a round of applause doesn't create dozens of audio nodes in the one frame that
 * asked for it - on a slow phone that frame stuck.
 */
export function whenDue(at, build) {
  const due = ctx.currentTime + at
  if (at <= LEAD) {
    build(due)
    return
  }
  setTimeout(() => {
    if (ctx) build(Math.max(ctx.currentTime, due))
  }, (at - LEAD) * 1000)
}
/** How early (s) a deferred sound is built before it's due. */
const LEAD = 0.06

/** A short enveloped oscillator note; `echo` also sends it into the echo. */
function tone(freq, opts = {}) {
  whenDue(opts.at ?? 0, (t) => toneAt(freq, t, opts))
}

function toneAt(freq, t, { type = 'sine', duration = 0.12, volume = 0.3, slideTo = null, attack = 0.01, echo: wet = false } = {}) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain).connect(master)
  if (wet) gain.connect(echo)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** A struck bell: the note, a quieter octave and a glassy strike, ringing into the echo. */
function bell(freq, opts) {
  bellWith(tone, freq, opts)
}

/** A bell made of tones from `T` (live: tone; baked: straight onto the offline clock). */
function bellWith(T, freq, { at = 0, volume = 0.1, decay = 0.4 } = {}) {
  T(freq, { at, duration: decay, volume, echo: true })
  T(freq * 2, { at, duration: decay * 0.6, volume: volume * 0.35, echo: true })
  T(freq * 3.01, { type: 'triangle', at, duration: 0.05, volume: volume * 0.3 })
}

/** Trophy chimes climb and fall this scale while they keep coming (C major pentatonic). */
const TROPHY_SCALE = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637]
/** A trophy within this long of the last carries the run on; otherwise it starts again. */
const TROPHY_RUN_MS = 700
let trophyRun = 0
let trophyAt = 0

/** Filtered noise: whooshes and cracks. */
function noise(opts = {}) {
  whenDue(opts.at ?? 0, (t) => noiseAt(t, opts))
}

function noiseAt(t, { duration = 0.3, volume = 0.25, from = 400, to = 2400, q = 1.2 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + duration * 0.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(gain).connect(master)
  // Looped, so a long one from a random spot never runs off the end of the second.
  src.loop = true
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.02)
}

// --- Baked sounds: rendered once, played as one node -----------------------------------

/** A deep hit under a smash: a sine dropping fast. */
const thump = (T, freq, volume, duration = 0.26) => T(freq, { duration, volume, slideTo: freq * 0.42 })

/** Little knocks of pieces landing: `count` tones round `freq` Hz, from `at` s, `gap` s apart. */
function knocks(T, count, freq, spread, { at = 0.12, gap = 0.06, volume = 0.06, type = 'triangle', duration = 0.06 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const f = freq + Math.random() * spread
    T(f, { type, at: at + i * gap + Math.random() * gap * 0.6, duration, volume, slideTo: f * 0.8 })
  }
}

/** Gravel: `count` tiny bursts of noise scattered over `seconds` from `at`. */
function gravel(N, count, seconds, { at = 0.08, from = 1500, volume = 0.07 } = {}) {
  for (let i = 0; i < count; i += 1) {
    N({ at: at + Math.random() * seconds, duration: 0.025, volume: volume * (0.6 + Math.random() * 0.6), from: from * (0.7 + Math.random() * 0.6), to: from * 0.6, q: 2 })
  }
}

/**
 * Each wall material's smash (Walls.jsx MATERIALS `sound`): what it sounds like coming
 * apart, under the combo's ding.
 */
const SMASHES = {
  /** Wood: a sharp crack, splintering crackle, planks knocking down. */
  wood(T, N) {
    thump(T, 110, 0.2)
    N({ duration: 0.06, volume: 0.42, from: 4200, to: 2200, q: 1.4 })
    N({ duration: 0.25, volume: 0.22, from: 2600, to: 900, q: 0.9 })
    for (let i = 0; i < 6; i += 1) N({ at: 0.03 + i * 0.03 + Math.random() * 0.02, duration: 0.02, volume: 0.12, from: 3000, to: 2000, q: 3 })
    knocks(T, 7, 320, 380)
  },
  /** Brick: a crunch, a crumble of gravel, chunks thudding down. */
  brick(T, N) {
    thump(T, 90, 0.26)
    N({ duration: 0.1, volume: 0.36, from: 1800, to: 700, q: 0.7 })
    N({ duration: 0.55, volume: 0.14, from: 1200, to: 400, q: 0.8 })
    gravel(N, 12, 0.5)
    knocks(T, 6, 220, 200, { at: 0.15, gap: 0.07, volume: 0.07 })
  },
  /** Stone: a deep boom, a long rumble, heavy blocks landing. */
  stone(T, N) {
    thump(T, 70, 0.32, 0.4)
    N({ duration: 0.12, volume: 0.32, from: 1400, to: 500, q: 0.6 })
    N({ duration: 0.7, volume: 0.16, from: 500, to: 160, q: 0.7 })
    knocks(T, 6, 140, 120, { at: 0.18, gap: 0.09, volume: 0.1, type: 'sine', duration: 0.12 })
    gravel(N, 8, 0.6, { at: 0.1, from: 1200, volume: 0.06 })
  },
  /** Metal: a clang ringing out (a struck plate's out-of-tune partials), plates clanking down. */
  metal(T, N) {
    thump(T, 85, 0.22)
    N({ duration: 0.05, volume: 0.3, from: 5000, to: 2500, q: 1 })
    const base = 380 + Math.random() * 120
    ;[1, 2.76, 5.4, 8.93].forEach((k, i) => T(base * k, { duration: 0.9 - i * 0.18, volume: 0.07 / (i + 1), attack: 0.002, echo: i < 2 }))
    for (let i = 0; i < 5; i += 1) {
      const f = 900 + Math.random() * 900
      const at = 0.2 + i * 0.1 + Math.random() * 0.05
      T(f, { at, duration: 0.18, volume: 0.03, attack: 0.002 })
      T(f * 2.76, { at, duration: 0.1, volume: 0.015, attack: 0.002 })
    }
  },
  /** Ice and glass: a bright shatter and a rain of tinkling shards. */
  ice(T, N) {
    thump(T, 100, 0.18)
    N({ duration: 0.18, volume: 0.3, from: 6000, to: 3500, q: 0.7 })
    N({ duration: 0.05, volume: 0.25, from: 3000, to: 5000, q: 1 })
    for (let i = 0; i < 16; i += 1) T(2400 + Math.random() * 3600, { at: 0.03 + Math.random() * 0.6, duration: 0.05 + Math.random() * 0.08, volume: 0.02 + Math.random() * 0.025, attack: 0.002 })
  },
  /** A paper screen: a tearing rip, its thin wooden lattice clattering. */
  paper(T, N) {
    thump(T, 130, 0.16, 0.18)
    N({ duration: 0.22, volume: 0.38, from: 1200, to: 3600, q: 0.9 })
    N({ at: 0.05, duration: 0.18, volume: 0.22, from: 2400, to: 1500, q: 1.5 })
    knocks(T, 5, 420, 300, { at: 0.1, gap: 0.06, volume: 0.05, duration: 0.05 })
  },
  /** Lava rock: stone, with a hiss of steam and a deep whoomp. */
  lava(T, N) {
    SMASHES.stone(T, N)
    T(55, { duration: 0.5, volume: 0.14, slideTo: 40, attack: 0.04 })
    N({ at: 0.05, duration: 0.8, volume: 0.07, from: 5200, to: 3000, q: 0.5 })
  },
  /** Starry stuff: a boom and a glittering, ringing shimmer. */
  galaxy(T, N) {
    thump(T, 80, 0.26, 0.35)
    N({ duration: 0.3, volume: 0.16, from: 600, to: 2600, q: 0.7 })
    ;[880, 1320, 1760, 2640].forEach((f, i) => T(f * (0.99 + Math.random() * 0.02), { at: 0.05 + i * 0.05, duration: 0.5, volume: 0.03, echo: true }))
    gravel(N, 6, 0.5, { from: 2400, volume: 0.04 })
  },
  /** Rainbow: a brick crunch and a sparkle running up. */
  rainbow(T, N) {
    SMASHES.brick(T, N)
    ;[1047, 1319, 1568, 2093].forEach((f, i) => T(f, { type: 'triangle', at: 0.08 + i * 0.05, duration: 0.15, volume: 0.035, echo: true }))
  },
  /** Toy bricks: a crack and a clatter of little plastic clicks. */
  toy(T, N) {
    thump(T, 95, 0.24)
    N({ duration: 0.08, volume: 0.4, from: 5200, to: 1800, q: 0.6 })
    N({ duration: 0.22, volume: 0.32, from: 3200, to: 700, q: 0.7 })
    N({ duration: 0.4, volume: 0.12, from: 900, to: 260, q: 1.1 })
    for (let i = 0; i < 9; i += 1) T(1200 + Math.random() * 2200, { type: 'square', at: 0.08 + i * 0.045 + Math.random() * 0.03, duration: 0.025, volume: 0.035 })
  },
}

/**
 * The sounds that come many times a second, or right on the frame that matters (a wall
 * smashed, a trophy, a Health tick, a bag punched, the punch landing): each is a recipe of
 * tones and noises, rendered once, offline, while the game loads, and then played as one
 * buffer - one audio node per play, not the dozen oscillators, filters and gains each
 * built on the main thread (several walls a second, that was a real share of a slow
 * phone's frame).
 *
 * `build(T, N, rate)`: T(freq, opts) a tone and N(opts) a noise, `opts.at` seconds in;
 * `rate` multiplies the pitch (baked at 1 and played faster or slower instead). `takes`
 * renders that many (the random bits differ), one picked at random each time.
 */
const RECIPES = {
  ...Object.fromEntries(Object.entries(SMASHES).map(([name, build]) => [`smash-${name}`, { seconds: name === 'metal' ? 1 : 0.85, takes: 2, build }])),
  /** The combo's bright 'ding', climbing a whole tone a wall (played faster). */
  ding: {
    seconds: 0.4,
    build(T, N, r = 1) {
      T(523 * r, { type: 'triangle', at: 0.04, duration: 0.18, volume: 0.09, echo: true })
      T(784.5 * r, { type: 'triangle', at: 0.1, duration: 0.22, volume: 0.06, echo: true })
    },
  },
  /** A trophy's bell, on a C (played up the scale). */
  bell: {
    seconds: 0.4,
    build(T, N, r = 1) {
      bellWith(T, 1047 * r, { volume: 0.085, decay: 0.32 })
    },
  },
  gain: {
    seconds: 0.1,
    build(T, N, r = 1) {
      T(880 * r, { type: 'triangle', duration: 0.07, volume: 0.07, slideTo: 1400 * r })
    },
  },
  gainSoft: {
    seconds: 0.1,
    build(T, N, r = 1) {
      T(880 * r, { type: 'triangle', duration: 0.07, volume: 0.05, slideTo: 1400 * r })
    },
  },
  /** A training bag punched: the leather's slap, the bag's heavy swing, its chain jingling. */
  bagHit: {
    seconds: 0.32,
    takes: 3,
    build(T, N) {
      N({ duration: 0.045, volume: 0.26, from: 1600, to: 700, q: 0.8 })
      T(118, { duration: 0.16, volume: 0.17, slideTo: 58 })
      N({ at: 0.04, duration: 0.2, volume: 0.025, from: 2600 + Math.random() * 800, to: 2200, q: 6 })
    },
  },
  /** A click punch: the glove swishing through the air and a soft thud. */
  swing: {
    seconds: 0.18,
    takes: 2,
    build(T, N) {
      N({ duration: 0.12, volume: 0.07, from: 900, to: 2600, q: 1.1 })
      T(130, { type: 'sine', at: 0.05, duration: 0.09, volume: 0.1, slideTo: 70 })
    },
  },
  click: {
    seconds: 0.08,
    build(T) {
      T(660, { type: 'triangle', duration: 0.05, volume: 0.15 })
    },
  },
  /** Drawing back to punch: air gathering, tension rising. */
  windUp: {
    seconds: 0.4,
    build(T, N) {
      N({ duration: 0.3, volume: 0.16, from: 350, to: 1500, q: 0.9 })
      T(95, { type: 'triangle', duration: 0.28, volume: 0.09, slideTo: 150, attack: 0.08 })
    },
  },
  /** The punch landing: a smack, a crack, the body of the hit, a boom under it and the air blasting out. */
  punchImpact: {
    seconds: 0.85,
    build(T, N) {
      N({ duration: 0.07, volume: 0.42, from: 1500, to: 500, q: 0.6 })
      N({ duration: 0.05, volume: 0.24, from: 3800, to: 2200, q: 1.3 })
      T(66, { duration: 0.5, volume: 0.34, slideTo: 30 })
      T(42, { duration: 0.75, volume: 0.2, attack: 0.02 })
      N({ at: 0.02, duration: 0.35, volume: 0.1, from: 2400, to: 500, q: 0.7 })
    },
  },
  /** The punch's force slamming into the wall that holds: a deep boom, a crack, a long rumble, grit pattering. */
  shockwave: {
    seconds: 1.2,
    build(T, N) {
      T(52, { duration: 0.9, volume: 0.34, slideTo: 26 })
      N({ duration: 0.12, volume: 0.32, from: 2600, to: 700, q: 0.7 })
      N({ duration: 1, volume: 0.13, from: 420, to: 110, q: 0.7 })
      gravel(N, 8, 0.7, { at: 0.15, volume: 0.05 })
    },
  },
  /** The wall that holds, hit: a heavy thud, a crack, grit falling off it. */
  wallHold: {
    seconds: 0.6,
    build(T, N) {
      T(70, { duration: 0.32, volume: 0.28, slideTo: 36 })
      N({ duration: 0.05, volume: 0.24, from: 2200, to: 900, q: 1 })
      N({ duration: 0.25, volume: 0.14, from: 600, to: 160, q: 0.8 })
      gravel(N, 4, 0.2, { at: 0.06, from: 1800, volume: 0.06 })
    },
  },
  /** A new stage reached mid-punch: a quick, cheerful rising jingle. */
  stageUp: {
    seconds: 0.62,
    takes: 2,
    build(T) {
      ;[659, 784, 988, 1319].forEach((f, i) => T(f, { type: 'triangle', at: i * 0.06, duration: 0.16, volume: 0.08, echo: true }))
      for (let i = 0; i < 3; i += 1) bellWith(T, 1760 + Math.random() * 900, { at: 0.24 + i * 0.05, volume: 0.03, decay: 0.18 })
    },
  },
  /** PERFECT: a crack, fire bursting up with a deep fwoosh and a crackle, a chime climbing. */
  perfect: {
    seconds: 0.85,
    build(T, N) {
      T(2200, { duration: 0.04, volume: 0.2, slideTo: 1400 })
      N({ duration: 0.25, volume: 0.1, from: 500, to: 2400, q: 0.9 })
      N({ duration: 0.5, volume: 0.16, from: 160, to: 600, q: 0.6 })
      T(90, { duration: 0.5, volume: 0.14, slideTo: 160 })
      for (let i = 0; i < 6; i += 1) N({ at: 0.1 + i * 0.07 + Math.random() * 0.04, duration: 0.04, volume: 0.07, from: 3800, to: 2600, q: 2 })
      ;[784, 1047, 1319, 1568, 2093].forEach((f, i) => bellWith(T, f, { at: 0.04 + i * 0.05, volume: 0.07, decay: 0.35 }))
    },
  },
  /** GREAT: an electric crack, a zap and a rising chime. */
  great: {
    seconds: 0.5,
    build(T, N) {
      T(1800, { type: 'square', duration: 0.05, volume: 0.1, slideTo: 600 })
      N({ duration: 0.16, volume: 0.1, from: 1800, to: 4000, q: 1.4 })
      ;[659, 988, 1319].forEach((f, i) => bellWith(T, f, { at: 0.03 + i * 0.05, volume: 0.07, decay: 0.3 }))
    },
  },
  /** GOOD: a clean, bright tok and a sparkle. */
  good: {
    seconds: 0.4,
    build(T) {
      T(1500, { duration: 0.05, volume: 0.18, slideTo: 1050 })
      bellWith(T, 1568, { at: 0.03, volume: 0.06, decay: 0.25 })
      bellWith(T, 2093, { at: 0.08, volume: 0.05, decay: 0.25 })
    },
  },
  levelUp: {
    seconds: 0.4,
    build(T) {
      ;[523, 659, 784, 1047].forEach((f, i) => T(f, { type: 'square', at: i * 0.07, duration: 0.14, volume: 0.09 }))
    },
  },
  /** A good punch blasting off as time snaps back: a deep boom and a rising whoosh (full power). */
  perfectRelease: {
    seconds: 0.65,
    build(T, N) {
      T(70, { duration: 0.6, volume: 0.3, slideTo: 32 })
      N({ duration: 0.3, volume: 0.12, from: 250, to: 1800, q: 0.7 })
      T(440, { type: 'triangle', duration: 0.35, volume: 0.06, slideTo: 1760 })
    },
  },
  jumpWhoosh: {
    seconds: 0.28,
    build(T, N) {
      N({ duration: 0.25, volume: 0.08, from: 300, to: 1200, q: 0.9 })
    },
  },
  /** Wins paid out: a fanfare, a shimmering chord and a shower of coins. */
  wins: {
    seconds: 1.3,
    takes: 2,
    build(T) {
      ;[784, 988, 1175, 1568].forEach((f, i) => T(f, { type: 'triangle', at: i * 0.07, duration: 0.2, volume: 0.1, echo: true }))
      // G major, held, each voice doubled a hair apart so it shimmers.
      for (const f of [784, 988, 1175]) {
        T(f * 1.003, { at: 0.28, duration: 0.9, volume: 0.045, attack: 0.05, echo: true })
        T(f * 0.997, { at: 0.28, duration: 0.9, volume: 0.045, attack: 0.05 })
      }
      for (let i = 0; i < 6; i += 1) bellWith(T, 2093 + Math.random() * 1200, { at: 0.3 + i * 0.07 + Math.random() * 0.03, volume: 0.035, decay: 0.2 })
    },
  },
}

/**
 * Baked sounds' sample rate: everything in them sits well under its 16 kHz limit, and
 * ~40 takes stay small (a couple of MB).
 */
const BAKE_RATE = 32000

/** Each recipe's rendered takes, by name, once baked. */
const baked = {}

/** A recipe's tones and noises straight onto the offline context's clock (no whenDue). */
const offlineTone = (freq, opts) => toneAt(freq, opts.at ?? 0, opts)
const offlineNoise = (opts) => noiseAt(opts.at ?? 0, opts)

/**
 * Renders every recipe's takes, one after another, in the background (OfflineAudioContext
 * renders off the main thread). While a recipe's being built, the module's context and
 * outputs point at the offline one, so toneAt / noiseAt build into it unchanged; its
 * echo sends go nowhere (a baked sound is sent into the live echo as it plays instead).
 */
function bakeAll() {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!Offline) return
  const jobs = []
  for (const [name, recipe] of Object.entries(RECIPES)) for (let i = 0; i < (recipe.takes || 1); i += 1) jobs.push([name, recipe])
  const next = () => {
    const job = jobs.shift()
    if (!job || !ctx) return
    const [name, recipe] = job
    let off
    try {
      off = new Offline(1, Math.ceil(recipe.seconds * BAKE_RATE), BAKE_RATE)
    } catch {
      return
    }
    const live = [ctx, master, echo]
    ctx = off
    master = off.destination
    echo = off.createGain()
    try {
      recipe.build(offlineTone, offlineNoise, 1)
    } finally {
      ;[ctx, master, echo] = live
    }
    off
      .startRendering()
      .then((buffer) => {
        ;(baked[name] ||= []).push(buffer)
        next()
      })
      .catch(() => null)
  }
  next()
}

/**
 * Plays recipe `name` now, `rate` times its pitch, also into the echo when `wet`, at
 * `volume` (through one gain node, when it isn't 1), `at` seconds from now: one buffer node if it's baked;
 * built live from the recipe if not (the first moments of loading, or no
 * OfflineAudioContext - at full volume).
 */
function play(name, rate = 1, wet = false, volume = 1, at = 0) {
  const takes = baked[name]
  if (!takes) {
    RECIPES[name].build(tone, noise, rate)
    return
  }
  const src = ctx.createBufferSource()
  src.buffer = takes[Math.floor(Math.random() * takes.length)]
  if (rate !== 1) src.playbackRate.value = rate
  let out = src
  if (volume !== 1) {
    out = ctx.createGain()
    out.gain.value = volume
    src.connect(out)
  }
  out.connect(master)
  if (wet) out.connect(echo)
  src.start(ctx.currentTime + at)
}

/**
 * A gong, for a belt earned: a struck bronze disc's out-of-tune partials ringing out for
 * seconds, sagging a touch in pitch, over the mallet's thud. Built live (it's rare).
 */
function gong() {
  const t = ctx.currentTime
  const base = 98
  ;[1, 1.48, 2.02, 2.69, 3.43, 4.21].forEach((k, i) => {
    toneAt(base * k, t, { duration: 3.2 - i * 0.4, volume: 0.09 / (1 + i * 0.6), attack: 0.004, slideTo: base * k * 0.985, echo: i < 2 })
  })
  noiseAt(t, { duration: 0.12, volume: 0.12, from: 900, to: 300, q: 0.8 })
}

export const sfx = {
  click() {
    if (ready('click', 40)) play('click')
  },
  /** A Health gain: a bright tick, softer for the ones that trickle in. */
  gain(soft = false) {
    if (ready('gain', 110)) play(soft ? 'gainSoft' : 'gain', 1 + Math.random() * 0.136)
  },
  /** A training bag punched, landing `at` seconds from now (each a little higher or lower than the last). */
  bagHit(at = 0) {
    if (ready('bagHit', 90)) play('bagHit', 0.92 + Math.random() * 0.16, false, 1, at)
  },
  levelUp() {
    if (ready('levelUp')) play('levelUp')
  },
  /** Drawing back to throw the punch. */
  windUp() {
    if (ready('windUp', 250)) play('windUp')
  },
  /** The punch landing on the first wall. */
  punchImpact() {
    if (ready('punchImpact', 250)) play('punchImpact')
  },
  /**
   * The punch's force slamming into the wall that holds at the end (`power` 0-1, how big
   * the punch was): a deep boom and a rumble, the crowd roaring over it.
   */
  groundSmash(power = 1) {
    if (!ready('groundSmash', 400)) return
    liveCrowd()?.roar(0.5 + 0.5 * power)
    play('shockwave', 1, false, 0.6 + 0.4 * power)
  },
  /** The force settling after it (`n` 1, 2, 3...): a soft thud, softer each time. */
  bounce(n = 1) {
    if (ready('bounce', 120)) tone(150, { duration: 0.16, volume: 0.16 / n, slideTo: 60 })
  },
  /**
   * A PERFECT punch: a crack, fire bursting up with a deep fwoosh and a crackle, and a
   * bright chime climbing up.
   */
  perfectHit() {
    if (ready('perfectHit', 300)) play('perfect', 1, true)
  },
  /**
   * A good punch blasting off as time snaps back (`power` 0-1, the grade's): a deep boom
   * and a rising whoosh.
   */
  perfectRelease(power = 1) {
    if (ready('perfectRelease', 300)) play('perfectRelease', 1, false, power)
  },
  /** A graded punch landing: its own sound for each grade. */
  gradeHit(grade) {
    if (grade === 'perfect') return sfx.perfectHit()
    if (ready('gradeHit', 300)) play(grade === 'great' ? 'great' : 'good', 1, true)
  },
  /** A WEAK punch: a dull, soft flop. */
  weakHit() {
    if (!ready('weakHit', 300)) return
    tone(320, { duration: 0.12, volume: 0.12, slideTo: 140 })
    tone(180, { type: 'triangle', at: 0.08, duration: 0.18, volume: 0.06, slideTo: 90 })
  },
  /** A click punch: a quick swish of the glove through the air and a soft thud. */
  punchSwing() {
    if (ready('punchSwing', 120)) play('swing')
  },
  /** The punch's force bursting off: a rising rush of air. */
  jumpWhoosh() {
    if (ready('jumpWhoosh', 250)) play('jumpWhoosh')
  },
  /**
   * A wall smashed: its material coming apart (`material`: a SMASHES key - wood
   * splintering, brick crumbling, metal clanging, glass shattering...), and a bright
   * 'ding' that climbs with every wall smashed in a row - the combo.
   */
  wallSmash(combo = 1, material = 'toy') {
    if (!ready('wallSmash', 120)) return
    play(SMASHES[material] ? `smash-${material}` : 'smash-toy')
    play('ding', Math.pow(2, (Math.min(combo - 1, 10) * 2) / 12), true)
  },
  /** A new stage reached mid-punch: a quick, cheerful rising jingle. */
  stageUp() {
    if (!ready('stageUp', 300)) return
    liveCrowd()?.whoo(2)
    play('stageUp', 1, true)
  },
  /** Trophies landing in the Wins counter: little coin pings, one after another. */
  coins(count = 8) {
    if (!ready('coins', 400)) return
    for (let i = 0; i < count; i += 1) bell(1900 + (i % 4) * 230, { at: 0.55 + i * 0.07, volume: 0.04, decay: 0.12 })
  },
  /** The punch hitting the wall that holds: a heavy thud, a crack, grit falling. */
  wallBlock() {
    if (ready('wallBlock', 150)) play('wallHold')
  },
  /**
   * A trophy smashed past: a bell that climbs the scale and back down while they keep
   * coming, so a run of them plays a little tune.
   */
  trophy() {
    if (!ready('trophy', 90)) return
    const now = performance.now()
    trophyRun = now - trophyAt < TROPHY_RUN_MS ? trophyRun + 1 : 0
    trophyAt = now
    const n = TROPHY_SCALE.length
    const k = trophyRun % (2 * n - 2)
    play('bell', TROPHY_SCALE[k < n ? k : 2 * n - 2 - k] / 1047, true)
  },
  /** Wins paid out (a punch's total, a badge): a fanfare, a shimmering chord and a shower of coins. */
  wins() {
    if (!ready('wins')) return
    liveCrowd()?.applause()
    play('wins', 1, true)
  },
  crack() {
    if (!ready('crack', 150)) return
    noise({ duration: 0.12, volume: 0.35, from: 1800, to: 600, q: 0.8 })
    tone(220, { type: 'square', duration: 0.08, volume: 0.08, slideTo: 90 })
  },
  reveal() {
    if (!ready('reveal')) return
    ;[392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.06, duration: 0.22, volume: 0.12 }))
  },
  buy() {
    if (!ready('buy')) return
    tone(1047, { type: 'square', duration: 0.07, volume: 0.08 })
    tone(1568, { type: 'square', at: 0.08, duration: 0.16, volume: 0.08 })
  },
  error() {
    if (ready('error', 200)) tone(160, { type: 'sawtooth', duration: 0.18, volume: 0.07, slideTo: 110 })
  },
  /** A new belt: the dojo's gong, the crowd roaring, a whoosh and a bright run up the scale. */
  rebirth() {
    if (!ready('rebirth')) return
    gong()
    liveCrowd()?.roar(1)
    noise({ duration: 0.5, volume: 0.07, from: 200, to: 1800, q: 0.6 })
    ;[294, 330, 392, 440, 494, 587].forEach((f, i) => tone(f, { type: 'triangle', at: 0.15 + i * 0.07, duration: 0.25, volume: 0.07, echo: true }))
  },
  /** Stepping up to a training bag you can use: a soft rising chime (each punch then thwacks: bagHit). */
  treadmillEnter() {
    if (!ready('treadmillEnter', 400)) return
    ;[523, 784, 1047].forEach((f, i) => tone(f, { type: 'sine', at: i * 0.05, duration: 0.28, volume: 0.07 }))
  },
  /** A jump: a springy little boing. */
  jump() {
    if (ready('jump', 120)) tone(260, { type: 'triangle', duration: 0.18, volume: 0.1, slideTo: 620 })
  },
  /** Landing from a jump: a soft thump. */
  jumpLand() {
    if (!ready('jumpLand', 150)) return
    tone(140, { type: 'sine', duration: 0.12, volume: 0.12, slideTo: 70 })
    noise({ duration: 0.08, volume: 0.06, from: 900, to: 300, q: 0.7 })
  },
  windStart,
  windSet,
  windStop,
  stretchStart,
  stretchSet,
  stretchStop,
}
