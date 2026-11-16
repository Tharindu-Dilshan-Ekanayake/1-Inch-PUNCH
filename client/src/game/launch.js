import { chargeAt, CHARGE_TIME } from '@shared/balance'

/**
 * Your punch, before the authority hears about it. Press PUNCH in the Punch Zone and you
 * step up to the punch line where you stand across it (shared/world punchSpotX) and take
 * your stance (`gripping`, the template's name); the power meter charges up by itself (shared/balance.js chargeAt: CHARGE_TIME to
 * full, then pulsing at the top). Press PUNCH again and the punch is sent
 * (net/actions.roll) graded on the meter at that moment; the stance holds until the
 * server's answer starts it (roll/rollControl.beginRoll). Plain module state, written by
 * the PUNCH button and read every frame by the player, the camera and the avatar - never
 * React state, never per-frame network traffic.
 */
export const launch = {
  /** In your stance on the punch spot, charging. */
  gripping: false,
  /** Charging by itself (Auto Punch): lets go at full charge. */
  auto: false,
  /** Set when you press PUNCH: the player picks your spot on the punch line on its next frame. */
  snap: false,
  /** Your spot on the punch line (x): where you stood across it when you pressed PUNCH. */
  spotX: 0,
  /** The meter now (0-1), and whether it's full (pulsing at the top). */
  charge: 0,
  full: false,
  /** performance.now() the charge started, and when it reached full. */
  chargeSince: 0,
  fullSince: 0,
  /** Let go and waiting for the authority: when. */
  released: false,
  releasedAt: 0,
}

/** No answer this long after letting go (off the zone, busy): drop the stance. */
const RELEASE_TIMEOUT_MS = 1500

/** Steps onto the punch spot and starts charging (`auto`: Auto Punch lets go by itself). */
export function grab(auto = false, now = performance.now()) {
  launch.gripping = true
  launch.auto = auto
  launch.snap = true
  launch.released = false
  launch.charge = 0
  launch.full = false
  launch.chargeSince = now
  launch.fullSince = 0
}

/** The meter at `now`; called every frame by the player. Returns the meter (0-1). */
export function updatePull(now) {
  if (launch.released && now - launch.releasedAt > RELEASE_TIMEOUT_MS) cancelPull()
  if (!launch.gripping) return launch.charge
  const t = (now - launch.chargeSince) / 1000
  const full = t >= CHARGE_TIME
  if (full && !launch.full) launch.fullSince = now
  launch.full = full
  launch.charge = chargeAt(t)
  return launch.charge
}

/** Lets the punch go: returns the meter at that moment (what the punch is graded on). */
export function letGo(now = performance.now()) {
  updatePull(now)
  const charge = launch.charge
  launch.gripping = false
  launch.auto = false
  launch.released = true
  launch.releasedAt = now
  return charge
}

/** The authority's punch has started from the stance: it takes it from here. */
export function consumePull() {
  launch.gripping = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.full = false
}

/** Drops the stance (jumped, walked off, a panel opened, no answer came). */
export function cancelPull() {
  launch.gripping = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.full = false
}

/**
 * The PUNCH button's press while it's showing (RollButton sets it), or null: a click on
 * the game in the Punch Zone does what pressing PUNCH does (game/punchInput.js).
 */
export const punchButton = { press: null }

/** Whether you're on the punch spot at all: charging, or let go and waiting. */
export const isPulling = () => launch.gripping || launch.released
