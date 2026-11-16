/**
 * Background music, made with WebAudio like the sound effects: an upbeat dojo groove -
 * big taiko drums and the sharp crack of a rim, a wood block ticking, a plucked bass, a
 * koto-like harp rippling over the chords and a breathy bamboo flute singing the tune,
 * all in a bright Japanese pentatonic (the yo scale on D: D E G A B) over D - G - A - D,
 * B - G - A - D. Kept quiet under the game and the crowd.
 *
 * The whole loop (8 bars, ~18 s) is rendered once, offline, while the game loads, and
 * played as one looping buffer: nothing is built while you play. (Built note by note -
 * several oscillators, filters and gains every eighth, on the main thread - it was a
 * steady cost on a slow phone, in the lobby and mid-punch alike.) Where offline rendering
 * isn't available the notes are scheduled live instead, a little ahead on the audio clock
 * by a timer (the usual look-ahead scheduler), never from the render loop.
 */

const BPM = 104
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD_S = 0.35
const TICK_MS = 100
/** The loop: 64 eighths (8 bars). */
const LOOP_STEPS = 64
/**
 * The rendered loop's sample rate: everything goes through a low-pass well under its
 * 12 kHz limit, so this loses nothing and keeps the buffer small (~1.8 MB).
 */
const LOOP_RATE = 24000
/** Rendered this much past the loop's end, and folded back onto its start: the last notes ring on seamlessly. */
const LOOP_TAIL = 0.8

/**
 * One bar each: its bass root, and the four notes the koto ripples through (stacked
 * fourths and fifths, all in the yo scale), as MIDI notes.
 */
const BARS = [
  { root: 38, koto: [62, 67, 69, 74] }, // D
  { root: 43, koto: [67, 71, 74, 79] }, // G
  { root: 45, koto: [69, 74, 76, 81] }, // A
  { root: 38, koto: [62, 67, 69, 74] }, // D
  { root: 47, koto: [71, 76, 79, 83] }, // B
  { root: 43, koto: [67, 71, 74, 79] }, // G
  { root: 45, koto: [69, 74, 76, 81] }, // A
  { root: 38, koto: [62, 67, 69, 74] }, // D
]
/** Which of its bar's four notes the koto plucks on each eighth: a ripple up and back. */
const RIPPLE = [0, 1, 2, 3, 2, 1, 2, 3]
/** The flute's tune: [eighth within the loop, MIDI note, eighths long]. */
const TUNE = [
  [0, 74, 3], [3, 76, 1], [4, 74, 2], [6, 71, 2],
  [8, 69, 3], [11, 71, 1], [12, 74, 4],
  [16, 76, 2], [18, 79, 2], [20, 76, 2], [22, 74, 2],
  [24, 71, 2], [26, 69, 2], [28, 74, 4],
  [32, 79, 3], [35, 81, 1], [36, 79, 2], [38, 76, 2],
  [40, 74, 3], [43, 76, 1], [44, 79, 4],
  [48, 81, 2], [50, 79, 2], [52, 76, 2], [54, 74, 2],
  [56, 76, 2], [58, 71, 2], [60, 74, 4],
]

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

/**
 * The band, playing into `destination` on `ctx` (the live context, or an offline one
 * rendering the loop): `play(step, t)` sounds eighth `step` of the loop at time t.
 */
function createBand(ctx, destination, noiseBuffer) {
  // A low-pass over everything keeps it warm and out of the effects' way.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 4200
  tone.connect(destination)

  /** An enveloped oscillator note (at `hz` instead of `midi` when given), optionally low-passed. */
  function note(midi, t, { type = 'sine', length = 0.3, volume = 0.05, attack = 0.01, cutoff = 0, hz = 0 } = {}) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = hz || freq(midi)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    if (cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      osc.connect(filter).connect(gain).connect(tone)
    } else {
      osc.connect(gain).connect(tone)
    }
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  /** Filtered noise: the drums' skins and rims, the flute's breath. */
  function hiss(t, { type = 'bandpass', frequency = 1500, q = 0.9, volume = 0.04, length = 0.06, attack = 0 } = {}) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    if (attack) {
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    } else gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    src.connect(filter).connect(gain).connect(tone)
    src.loop = true
    src.start(t, Math.random() * 0.5)
    src.stop(t + length + 0.01)
  }

  /** A big taiko drum: a deep boom dropping in pitch, and the slap of its skin. */
  function taiko(t, volume = 0.2) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(92, t)
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.3)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    osc.connect(gain).connect(tone)
    osc.start(t)
    osc.stop(t + 0.5)
    hiss(t, { type: 'lowpass', frequency: 420, q: 0.7, volume: volume * 0.5, length: 0.08 })
  }

  /** The rim of a drum struck: a sharp "ka". */
  function rim(t) {
    hiss(t, { frequency: 2200, q: 2, volume: 0.05, length: 0.04 })
    note(0, t, { hz: 1600, length: 0.03, volume: 0.02, attack: 0.002 })
  }

  /** A koto-like pluck: a bright twang dropping into a soft, ringing note. */
  function pluck(midi, t, volume) {
    note(midi, t, { type: 'triangle', length: 0.5, volume, attack: 0.004 })
    note(midi, t, { type: 'sawtooth', length: 0.12, volume: volume * 0.3, attack: 0.002, cutoff: 2600 })
  }

  /**
   * A bamboo flute: a pure tone scooping up into the note, a slow vibrato coming in as it
   * holds, and the breath across the mouthpiece.
   */
  function flute(midi, t, length, volume = 0.03) {
    const f = freq(midi)
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(f * 0.97, t)
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.06)
    const vibrato = ctx.createOscillator()
    vibrato.frequency.value = 5.2
    const depth = ctx.createGain()
    depth.gain.setValueAtTime(0, t)
    depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(length, 0.35))
    vibrato.connect(depth).connect(osc.frequency)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.07)
    gain.gain.setValueAtTime(volume, t + Math.max(0.08, length - 0.12))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(tone)
    osc.start(t)
    vibrato.start(t)
    osc.stop(t + length + 0.05)
    vibrato.stop(t + length + 0.05)
    hiss(t, { frequency: f * 2, q: 3, volume: volume * 0.18, length: Math.max(0.12, length * 0.6), attack: 0.03 })
  }

  /** Everything that sounds on eighth `step` (of the 64-eighth loop) at time t. */
  function play(step, t) {
    const inBar = step % 8
    const barIndex = Math.floor(step / 8) % BARS.length
    const bar = BARS[barIndex]
    // Taiko on 1 and 3, a "don-don" at the end of every fourth bar, a roll into the loop's top.
    if (inBar === 0) taiko(t, 0.2)
    if (inBar === 4) taiko(t, 0.16)
    if (barIndex % 4 === 3 && (inBar === 6 || inBar === 7)) taiko(t, inBar === 7 ? 0.18 : 0.13)
    if (barIndex === 7 && inBar === 5) taiko(t, 0.11)
    // The rim's crack on 2 and 4; the wood block ticking the off-beats.
    if (inBar === 2 || inBar === 6) rim(t)
    if (inBar % 2 === 1) note(0, t, { hz: inBar === 3 || inBar === 7 ? 1480 : 1175, length: 0.04, volume: 0.012, attack: 0.002 })
    // Plucked bass: root, octave, fifth, root.
    if (inBar === 0) note(bar.root, t, { type: 'triangle', length: 0.34, volume: 0.08, attack: 0.005 })
    if (inBar === 3) note(bar.root + 12, t, { type: 'triangle', length: 0.26, volume: 0.05, attack: 0.005 })
    if (inBar === 4) note(bar.root + 7, t, { type: 'triangle', length: 0.3, volume: 0.06, attack: 0.005 })
    if (inBar === 6) note(bar.root, t, { type: 'triangle', length: 0.26, volume: 0.06, attack: 0.005 })
    // The koto rippling through the bar's notes, leaning on the one.
    pluck(bar.koto[RIPPLE[inBar]], t, inBar === 0 ? 0.04 : 0.026)
    // The flute's tune.
    for (const [at, midi, length] of TUNE) {
      if (at === step % LOOP_STEPS) flute(midi, t, EIGHTH * length * 0.95)
    }
  }

  return { play }
}

/**
 * Runs `fn(i)` for every i below `count`, `per` at a time, each batch in an idle moment of
 * its own (so building a few hundred notes never takes one long frame); resolves when done.
 */
function inSlices(count, per, fn) {
  const idle = window.requestIdleCallback ? (run) => window.requestIdleCallback(run, { timeout: 500 }) : (run) => setTimeout(run, 16)
  return new Promise((resolve) => {
    let i = 0
    const run = () => {
      const end = Math.min(count, i + per)
      for (; i < end; i += 1) fn(i)
      if (i < count) idle(run)
      else resolve()
    }
    run()
  })
}

/**
 * Renders the loop offline (off the main thread); resolves with it as a buffer on `ctx`
 * exactly one loop long, the notes ringing past the end folded back onto the start - or
 * null where that isn't possible.
 */
function renderLoop(ctx, noiseBuffer) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!Offline) return Promise.resolve(null)
  const seconds = LOOP_STEPS * EIGHTH
  let off
  try {
    off = new Offline(1, Math.ceil((seconds + LOOP_TAIL) * LOOP_RATE), LOOP_RATE)
  } catch {
    return Promise.resolve(null)
  }
  const band = createBand(off, off.destination, noiseBuffer)
  return inSlices(LOOP_STEPS, 8, (step) => band.play(step, step * EIGHTH))
    .then(() => off.startRendering())
    .then((rendered) => {
      const length = Math.round(seconds * LOOP_RATE)
      const loop = ctx.createBuffer(1, length, LOOP_RATE)
      const from = rendered.getChannelData(0)
      const to = loop.getChannelData(0)
      to.set(from.subarray(0, length))
      for (let i = length; i < from.length; i += 1) to[i - length] += from[i]
      return loop
    })
    .catch(() => null)
}

export function createMusic(ctx, destination, noiseBuffer) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)
  const level = { base: 0.5, ducked: 1, volume: 1 }
  let started = false
  /** The rendered loop playing, once it's ready and the music has started. */
  let source = null
  /** The live fallback: the band and its scheduler. */
  let band = null
  let step = 0
  let nextAt = 0
  let timer = null

  function schedule() {
    // After the page was hidden (the context suspended), pick up from now.
    nextAt = Math.max(nextAt, ctx.currentTime + 0.05)
    while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
      band.play(step, nextAt)
      nextAt += EIGHTH
      step = (step + 1) % LOOP_STEPS
    }
  }

  function playLive() {
    if (timer) return
    band = createBand(ctx, out, noiseBuffer)
    nextAt = ctx.currentTime + 0.1
    timer = setInterval(schedule, TICK_MS)
    schedule()
  }

  /** The rendered loop: undefined while rendering, null if it isn't coming. */
  let loop
  renderLoop(ctx, noiseBuffer).then((buffer) => {
    loop = buffer
    if (started) begin()
  })

  /** Starts whichever is ready: the rendered loop, or (none coming) the live band. */
  function begin() {
    if (source || timer) return
    if (loop) {
      source = ctx.createBufferSource()
      source.buffer = loop
      source.loop = true
      source.connect(out)
      source.start()
    } else if (loop === null) playLive()
  }

  const applyLevel = (seconds) =>
    out.gain.setTargetAtTime(level.base * level.ducked * level.volume, ctx.currentTime, seconds)

  return {
    start() {
      if (started) return
      started = true
      // Now if the loop is rendered (it normally is by the first tap); else once it is.
      begin()
      // Fade in.
      applyLevel(1.2)
    },
    /** Quieter while something else should be heard (the rush of a flying ball). */
    duck(on) {
      level.ducked = on ? 0.45 : 1
      applyLevel(0.4)
    },
    /** The player's music volume, 0..1 (Boxity's music_volume setting). */
    setVolume(volume) {
      level.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      // Before start() the fade-in will pick it up.
      if (started) applyLevel(0.15)
    },
  }
}
