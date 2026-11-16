import { BoxGeometry, BufferAttribute, Color, Matrix4, Mesh, MeshPhongMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { beltFor } from '@shared/balance'

/**
 * The karate belt every fighter wears (shared/balance.js BELTS): white to start, a new
 * colour with every rebirth, then bronze, silver, gold and the gem belts - metallic ones
 * shine, the top ones glow, and the rainbow belt cycles through every colour.
 *
 * One small merged mesh per avatar: the band round the waist, the knot in front and its
 * two tails, the trim stripes and knot in the belt's trim colour (vertex colours, so
 * cloth and trim are one draw call). Built in the Bloxity rig's units (the avatar ~6.4
 * tall, the torso ~2 wide and 1 deep, facing +Z), to hang on the Spine1 bone at the
 * waist (avatarRig.attachBelt); `scale` refits it for the blocky stand-in.
 */

/** [x, y, z, width, height, depth, trim?, rotZ] for each box, about the waist's middle. */
const PIECES = [
  // The band: front, back and both sides, a hair proud of the torso.
  [0, 0, 0.56, 2.16, 0.34, 0.07, 0, 0],
  [0, 0, -0.56, 2.16, 0.34, 0.07, 0, 0],
  [1.07, 0, 0, 0.07, 0.34, 1.16, 0, 0],
  [-1.07, 0, 0, 0.07, 0.34, 1.16, 0, 0],
  // A trim stripe along the front.
  [0, 0, 0.6, 2.0, 0.06, 0.02, 1, 0],
  // The knot, and the two tails hanging from it, each with a trim stripe at its end.
  [0.05, 0.01, 0.64, 0.36, 0.3, 0.12, 1, 0.12],
  [-0.08, -0.42, 0.66, 0.15, 0.66, 0.05, 0, 0.22],
  [0.2, -0.4, 0.66, 0.15, 0.62, 0.05, 0, -0.28],
  [-0.15, -0.64, 0.69, 0.155, 0.08, 0.03, 1, 0.22],
  [0.29, -0.6, 0.69, 0.155, 0.08, 0.03, 1, -0.28],
]

let geometry = null

function beltGeometry() {
  if (geometry) return geometry
  const parts = PIECES.map(([x, y, z, w, h, d, trim, rz]) => {
    const g = new BoxGeometry(w, h, d).toNonIndexed()
    g.deleteAttribute('uv')
    g.applyMatrix4(new Matrix4().makeRotationZ(rz).setPosition(x, y, z))
    const count = g.getAttribute('position').count
    g.setAttribute('aTrim', new BufferAttribute(new Float32Array(count).fill(trim), 1))
    return g
  })
  geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  geometry.computeBoundingSphere()
  return geometry
}

const _cloth = new Color()
const _trim = new Color()

/**
 * A belt mesh with `setBelt(rebirths)` (recolours it for that many rebirths; a no-op when
 * unchanged) and `tick(time)` (the rainbow belt's colour cycle; call every frame, cheap
 * when not rainbow). `dispose()` frees its colours and material (the shape is shared).
 */
export function createBelt(scale = 1) {
  const shape = beltGeometry()
  const g = shape.clone()
  const trim = shape.getAttribute('aTrim')
  const colors = new BufferAttribute(new Float32Array(trim.count * 3), 3)
  g.setAttribute('color', colors)
  const material = new MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: new Color('#222222') })
  const mesh = new Mesh(g, material)
  mesh.scale.setScalar(scale)
  mesh.castShadow = true
  mesh.name = 'belt'
  let shown = null
  let shownRebirths = -1
  let rainbow = false
  let lastTick = -1

  const paint = (cloth, trimColor) => {
    for (let i = 0; i < trim.count; i += 1) {
      const c = trim.getX(i) > 0.5 ? trimColor : cloth
      colors.setXYZ(i, c.r, c.g, c.b)
    }
    colors.needsUpdate = true
  }

  mesh.setBelt = (rebirths) => {
    // Called every frame: nothing to do (and nothing allocated) until the belt changes.
    if (rebirths === shownRebirths) return
    shownRebirths = rebirths
    const belt = beltFor(rebirths)
    const key = `${belt.id}:${belt.stars}`
    if (key === shown) return
    shown = key
    rainbow = Boolean(belt.rainbow)
    const shine = belt.shine ?? 0
    material.shininess = 20 + shine * 90
    material.specular.setScalar(0.08 + shine * 0.55)
    material.emissive.set(belt.color).multiplyScalar(belt.glow ?? 0)
    paint(_cloth.set(belt.color), _trim.set(belt.trim))
  }

  mesh.tick = (time) => {
    // The rainbow belt cycles about ten times a second's worth of colour updates.
    if (!rainbow || time - lastTick < 0.08) return
    lastTick = time
    _cloth.setHSL((time * 0.25) % 1, 0.85, 0.6)
    _trim.setHSL((time * 0.25 + 0.5) % 1, 0.9, 0.75)
    material.emissive.copy(_cloth).multiplyScalar(0.35)
    paint(_cloth, _trim)
  }

  mesh.disposeBelt = () => {
    g.dispose()
    material.dispose()
  }
  return mesh
}
