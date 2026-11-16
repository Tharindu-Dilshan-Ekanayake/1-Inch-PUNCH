import {
  CanvasTexture,
  Color,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { getSDK, safeCall } from './sdk'

/**
 * Boxity's platform character kit (`Legion.SDK.character`): the preferred way to dress a
 * player. Given a player's outfit key it loads Boxity's pre-built outfit
 * (`{staticUrl}/outfits/v1/<key>.glb`) and binds it to the rig's own bones - the whole
 * look and body shape, including item types Boxity adds later - hiding the stock body.
 * While a rig is dressed the game leaves its parts, skin and accessories alone
 * (PlayerAvatar skips its own assembly); `proportions: 'game'` because avatarRig
 * applies body proportions to the bones every frame.
 *
 * The kit only runs while Boxity has it switched on (`character.canDress(key)`); when it
 * says no, for a custom character, or on an older SDK, these return null and the
 * game's own assembly (the manual path) draws the avatar instead.
 *
 * The kit is handed the few three.js classes it builds with, not `import * as THREE`
 * (which would keep the whole library in the bundle).
 */
const KIT_THREE = Object.freeze({
  CanvasTexture,
  Color,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
})

/**
 * The outfit key for a look: the local player's (`local`: avatar.getOutfitKey()), or
 * anyone's from their replicated ids and proportions (avatar.getOutfitKeyFor). Null on
 * an SDK without outfit keys.
 */
export function outfitKeyFor(equipped, proportions, local = false) {
  const avatar = getSDK()?.avatar
  if (!avatar) return null
  if (local && typeof avatar.getOutfitKey === 'function') return safeCall(avatar.getOutfitKey.bind(avatar)) || null
  if (typeof avatar.getOutfitKeyFor !== 'function') return null
  return safeCall(avatar.getOutfitKeyFor.bind(avatar), { ...(equipped || {}), proportions: proportions || undefined }) || null
}

/** Whether the kit will dress outfit `key` right now (switched on, a valid key, no custom character). */
export function canDress(key) {
  const character = getSDK()?.character
  if (!key || typeof character?.canDress !== 'function') return false
  return Boolean(safeCall(character.canDress.bind(character), key))
}

/**
 * Dresses `root` (a cloned player.glb rig) in outfit `key`. Resolves the kit's handle -
 * `handle.update(newKey)` re-dresses for a new look, `handle.dispose()` takes it off -
 * or null (not available, or the outfit failed to load). Never rejects.
 */
export async function dressRig(root, key) {
  const character = getSDK()?.character
  if (!root || !canDress(key) || typeof character?.dress !== 'function') return null
  try {
    return (await character.dress({ THREE: KIT_THREE, GLTFLoader, root, outfitKey: key, proportions: 'game' })) || null
  } catch (err) {
    console.warn('[bloxity] character kit could not dress the avatar; drawing it ourselves', err)
    return null
  }
}
