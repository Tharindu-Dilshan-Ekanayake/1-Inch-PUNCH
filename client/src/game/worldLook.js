import { WORLD_ZONES } from '@shared/balance'
import { Color } from 'three'

import { getGame } from '../store/game'
import { SKY } from './sceneStyle'
import { skyUniforms } from './skyState'

/**
 * The world you're in (index into balance WORLDS) and what it changes on screen: the
 * stages the field shows - their names, colours and scenery; every world's gates stand
 * at the same yards - and the sky. GameScene remounts the field when the world changes,
 * so whatever it builds on mount follows; tables derived from the stages are built once
 * per world (`perWorld`) and picked when used.
 */
export const activeWorld = () => getGame().profile.world || 0

/** The current world's stages (ZONES for World 1). */
export const zones = () => WORLD_ZONES[activeWorld()] ?? WORLD_ZONES[0]

/** `build(zones, world)` for every world, up front; returns a getter for the current one. */
export function perWorld(build) {
  const tables = WORLD_ZONES.map((zs, world) => build(zs, world))
  return () => tables[activeWorld()] ?? tables[0]
}

/**
 * A sky's look, parsed once: `{ top, horizon, sun, glow, clouds, stars }` from hex and
 * numbers (sceneStyle SKY's shape; ZONE_THEMES' `sky` too).
 */
export function skyLook({ top, horizon, sun = '#ffffff', glow = 0.5, clouds = 0.4, stars = 0 }) {
  return { top: new Color(top), horizon: new Color(horizon), sun: new Color(sun), glow, clouds, stars }
}

/**
 * The lobby's sky in each world: the Sunset Dojo's evening; the Bamboo Temple's clear
 * mountain morning - deep blue overhead going to a soft peach haze on the peaks, the sun
 * pale gold, plenty of cloud; the fog the colour of that haze.
 */
const LOBBY_SKIES = [skyLook(SKY), skyLook({ top: '#3f7fdc', horizon: '#ffe2c4', sun: '#fff2cc', glow: 0.85, clouds: 0.95, stars: 0 })]
export const lobbySky = () => LOBBY_SKIES[activeWorld()] ?? LOBBY_SKIES[0]

/**
 * Moves the sky (and the fog, which matches its horizon) towards `look` by `k` (0-1; 1
 * jumps straight there). Allocation-free: safe in a frame loop.
 */
export function blendSky(look, k, fog) {
  const u = skyUniforms
  u.topColor.value.lerp(look.top, k)
  u.horizonColor.value.lerp(look.horizon, k)
  u.sunColor.value.lerp(look.sun, k)
  u.glow.value += (look.glow - u.glow.value) * k
  u.clouds.value += (look.clouds - u.clouds.value) * k
  u.stars.value += (look.stars - u.stars.value) * k
  if (fog) fog.color.copy(u.horizonColor.value)
}

/** Puts the current world's lobby sky back (and the fog, which matches its horizon). */
export function showLobbySky(fog) {
  blendSky(lobbySky(), 1, fog)
}
