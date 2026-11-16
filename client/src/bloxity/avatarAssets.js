/**
 * URL construction and slot metadata for Bloxity avatar assets.
 *
 * The shapes here are not guesses: they mirror the assembly logic inside
 * legion-sdk.min.js (the same code that renders the avatar preview in the Bloxity
 * portal), so an avatar built with this file matches what the player sees there.
 *
 * `avatar.getEquipped()` returns:
 *   { hatId, backId, skinId, headId, armLId, armRId, legLId, legRId, torsoId,
 *     hairId, maskId, neckId, chestId, waistId, handId, shoesId,
 *     pantsId, shirtId, faceId, characterId }
 */

import { apiUrl, staticUrl } from './env'
import { getSDK, safeCall } from './sdk'

/**
 * Where avatar assets live. Built on every call from the Boxity environment (see
 * env.js), never frozen into a constant at import: prod, stage and a local stack each
 * serve their own.
 */
export const avatarCdn = () => `${staticUrl()}/avatars`

/** The base humanoid body + skeleton. All other assets modify this. */
export const baseBodyUrl = () => `${avatarCdn()}/player.glb`

/** Bone that hats attach to, from player.glb's skeleton. */
export const HAT_BONE = 'Neck1'
/** Bone that back items attach to. */
export const BACK_BONE = 'Spine2'
/** Bone whose bind-pose Y drives the neckHeight proportion. */
export const NECK_OFFSET_BONE = 'Neck_Offset'

/** Skin id used when nothing is equipped — the base body has no baked-in texture. */
export const DEFAULT_SKIN_ID = '0'

/**
 * Body-part slots.
 *
 * Each maps an equipped id onto a named skinned mesh already present in player.glb.
 * A part is applied by swapping that mesh's *geometry*, not by attaching a new
 * object — that is what keeps it bound to the shared skeleton.
 */
export const PART_SLOTS = {
  head: { idKey: 'headId', mesh: 'default_head', dir: 'head', suffix: '' },
  arm_L: { idKey: 'armLId', mesh: 'default_arm_L', dir: 'arms', suffix: '_L' },
  arm_R: { idKey: 'armRId', mesh: 'default_arm_R', dir: 'arms', suffix: '_R' },
  leg_L: { idKey: 'legLId', mesh: 'default_leg_L', dir: 'legs', suffix: '_L' },
  leg_R: { idKey: 'legRId', mesh: 'default_leg_R', dir: 'legs', suffix: '_R' },
  torso: { idKey: 'torsoId', mesh: 'default_torso', dir: 'torso', suffix: '' },
}

/** Values that all mean "nothing equipped". Superset of the SDK's own check. */
const EMPTY_IDS = new Set(['-1', '', 'undefined', 'null'])

/**
 * @param {unknown} id
 * @returns {boolean} true when the id names a real asset worth fetching
 */
export function isRealId(id) {
  if (id === null || id === undefined) return false
  return !EMPTY_IDS.has(String(id).trim())
}

export const assetUrls = {
  part: (slot, id) => {
    const { dir, suffix } = PART_SLOTS[slot]
    return `${avatarCdn()}/parts/${dir}/${id}${suffix}.glb`
  },
  skinTexture: (id) => `${avatarCdn()}/skins/${id}.png`,
  hatMesh: (id) => `${avatarCdn()}/items/hats/${id}.obj`,
  hatTexture: (id) => `${avatarCdn()}/textures/hats/${id}.png`,
  backMesh: (id) => `${avatarCdn()}/items/back/${id}.obj`,
  backTexture: (id) => `${avatarCdn()}/textures/back/${id}.png`,
  /** neck, chest, waist, hand, shoes. */
  accessoryMesh: (slot, id) => `${avatarCdn()}/items/${slot}/${id}.obj`,
  accessoryTexture: (slot, id) => `${avatarCdn()}/textures/${slot}/${id}.png`,
}

/**
 * Everything worn on a bone, by slot: which equipped id, where its mesh and texture
 * live, and how it sits.
 *   - hat, hair, mask: on Neck1 at (0, 0.8, 0), all three worn together.
 *   - back: on Spine2 at its origin.
 *   - neck, chest, waist: on their bone at `origin` in player.glb's model space.
 *   - hand, shoes: a pair - the mesh on the left bone and a mirrored copy on the right,
 *     following those bones' position and rotation only (see avatarRig.placeFollowers).
 * `model` is where a head/back item sits in player.glb's model space, for custom
 * characters (avatarRig.attachToCharacter).
 */
export const WORN_SLOTS = {
  hat: { idKey: 'hatId', bone: HAT_BONE, local: [0, 0.8, 0], model: [0, 5.6, 0], mesh: assetUrls.hatMesh, texture: assetUrls.hatTexture },
  hair: { idKey: 'hairId', bone: HAT_BONE, local: [0, 0.8, 0], model: [0, 5.6, 0], mesh: assetUrls.hatMesh, texture: assetUrls.hatTexture },
  mask: { idKey: 'maskId', bone: HAT_BONE, local: [0, 0.8, 0], model: [0, 5.6, 0], mesh: assetUrls.hatMesh, texture: assetUrls.hatTexture },
  back: { idKey: 'backId', bone: BACK_BONE, local: [0, 0, 0], model: [0, 4.2, 0], mesh: assetUrls.backMesh, texture: assetUrls.backTexture },
  neck: { idKey: 'neckId', bone: 'Spine2', origin: [0, 4.8, 0] },
  chest: { idKey: 'chestId', bone: 'Spine2', origin: [0, 3.6, 0] },
  waist: { idKey: 'waistId', bone: 'Spine1', origin: [0, 2.4, 0] },
  hand: { idKey: 'handId', bone: 'ArmL2_leaf', mirror: 'ArmR2_leaf', origin: [0, 0, 0] },
  shoes: { idKey: 'shoesId', bone: 'LegL2_leaf', mirror: 'LegR2_leaf', origin: [0, 0, 0] },
}
for (const [slot, cfg] of Object.entries(WORN_SLOTS)) {
  cfg.mesh ??= (id) => assetUrls.accessoryMesh(slot, id)
  cfg.texture ??= (id) => assetUrls.accessoryTexture(slot, id)
}

/** Skin ids fall back to "0" rather than being skipped. */
export const skinIdOrDefault = (id) => (isRealId(id) ? String(id) : DEFAULT_SKIN_ID)

/**
 * Clothing and face are not separate meshes: Bloxity draws them onto the skin texture
 * server-side. Listed in the order the API expects their URL segments.
 */
const SKIN_OVERLAYS = [
  ['pantsId', 'pn'],
  ['shirtId', 'sh'],
  ['faceId', 'fc'],
]

/**
 * URL of the skin with the worn pants, shirt and face drawn on, or null when none are
 * worn (then the plain `assetUrls.skinTexture` is the right texture).
 *
 * Mirrors the SDK's `avatar.getSkinTextureUrl()`, but built from the equipped payload
 * this component is rendering rather than the SDK's current user, so it can't lag a
 * live outfit change.
 */
export function skinCompositeUrl(equipped) {
  // As in the SDK, '0' also means "no overlay" here.
  const worn = (id) => isRealId(id) && String(id) !== '0'
  const layers = SKIN_OVERLAYS.filter(([key]) => worn(equipped?.[key]))
  if (layers.length === 0) return null

  let key = `s${skinIdOrDefault(equipped.skinId)}`
  for (const [field, prefix] of layers) key += `_${prefix}${equipped[field]}`
  return `${apiUrl()}/v1/avatar/skin-texture/${key}.png`
}

// --- From the SDK, when it has them ---------------------------------------------------


/**
 * Every slot worn on a bone, from Boxity: hat and back (fixed), then each slot
 * `avatar.getAccessorySlots()` lists - hair, mask, neck, chest, waist, hand, shoes and any
 * slot Boxity adds later - so a new slot shows up without a code change. Each entry is
 * WORN_SLOTS-shaped: `{ type, idKey, bone, origin, mirror?, inheritScale, model?,
 * mesh(id), texture(id) }`, its URLs from `avatar.getAccessoryUrls(field, id)`. With no
 * SDK (or an older one) the built-in WORN_SLOTS table stands in.
 */
export function wornSlots() {
  const avatar = getSDK()?.avatar
  const fixed = ['hat', 'back'].map((type) => ({ type, ...WORN_SLOTS[type] }))
  const listed = typeof avatar?.getAccessorySlots === 'function' ? safeCall(avatar.getAccessorySlots.bind(avatar)) : null
  if (!Array.isArray(listed) || listed.length === 0) {
    return Object.entries(WORN_SLOTS).map(([type, cfg]) => ({ type, ...cfg }))
  }
  const urlsFor = (field, id) =>
    typeof avatar.getAccessoryUrls === 'function' ? safeCall(avatar.getAccessoryUrls.bind(avatar), field, id) || null : null
  const slots = []
  for (const slot of listed) {
    if (!slot || typeof slot.field !== 'string' || typeof slot.bone !== 'string') continue
    const fallback = WORN_SLOTS[slot.type]
    const dir = slot.dir || slot.type
    slots.push({
      type: slot.type,
      idKey: slot.field,
      bone: slot.bone,
      origin: Array.isArray(slot.origin) ? slot.origin : fallback?.origin ?? [0, 0, 0],
      mirror: slot.mirrorBone || undefined,
      inheritScale: slot.inheritScale !== false,
      // Head items: their placement in player.glb's model space (custom characters).
      model: Array.isArray(slot.origin) ? slot.origin : fallback?.model,
      mesh: (id) => urlsFor(slot.field, id)?.mesh || fallback?.mesh?.(id) || assetUrls.accessoryMesh(dir, id),
      texture: (id) => urlsFor(slot.field, id)?.texture || fallback?.texture?.(id) || assetUrls.accessoryTexture(dir, id),
    })
  }
  return [...fixed, ...slots]
}

/**
 * The body texture for a look - the skin with the worn pants, shirt and face drawn on -
 * from `avatar.getSkinTextureUrlFor(equipped)`; without the SDK, the same URL built by
 * hand (skinCompositeUrl, else the plain skin).
 */
export function skinTextureUrlFor(equipped) {
  const avatar = getSDK()?.avatar
  const fromSdk = typeof avatar?.getSkinTextureUrlFor === 'function' ? safeCall(avatar.getSkinTextureUrlFor.bind(avatar), equipped || {}) : null
  if (typeof fromSdk === 'string' && fromSdk) return fromSdk
  return skinCompositeUrl(equipped) || assetUrls.skinTexture(skinIdOrDefault(equipped?.skinId))
}
