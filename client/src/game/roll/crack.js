import { CanvasTexture, LinearFilter, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, UniformsLib, UniformsUtils } from 'three'

import { mulberry32 } from '@shared/rng'

/**
 * The crack in the wall that holds: where the punch's force hit, a dented crater with a
 * crushed, pale rim, and from it jagged cracks splitting out every way - forking as they
 * go, thinning to hairlines, a web of shorter cracks joining them round the crater - each
 * a dark groove with a pale lip. Painted once into a small texture (a fixed pattern, from
 * a seed) and laid on the wall's face as one quad; revealed from the middle outwards, so
 * the crack spreads across the wall in the instant after the hit, then creeps a little
 * further. One draw call, and only while a punch is stopped against a wall.
 */

/** The decal's size on the wall (m): wider than the crater's reach, the cracks fading out at its edge. */
export const CRACK_SIZE = 9

const vertex = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uGrow;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, vUv);
    // Shown out to uGrow (0 the middle, 1 the edge), its front a little soft.
    float r = length(vUv - 0.5) * 2.0;
    float a = t.a * (1.0 - smoothstep(uGrow - 0.12, uGrow, r));
    if (a < 0.01) discard;
    gl_FragColor = vec4(t.rgb, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/** Paints the crack into a `size` square canvas. */
function paintCrack(size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const rand = mulberry32(20241116)
  const c = size / 2
  const S = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  /** Strokes a crack along `pts` ([x, y, width]...): its pale lip, then the dark groove in it. */
  function stroke(pts) {
    for (const pass of [0, 1]) {
      for (let i = 1; i < pts.length; i += 1) {
        const [x0, y0] = pts[i - 1]
        const [x1, y1, w] = pts[i]
        ctx.beginPath()
        if (pass === 0) {
          ctx.strokeStyle = 'rgba(255, 246, 228, 0.42)'
          ctx.lineWidth = w + Math.max(1, S * 0.004)
          ctx.moveTo(x0 + w * 0.35, y0 + w * 0.45)
          ctx.lineTo(x1 + w * 0.35, y1 + w * 0.45)
        } else {
          ctx.strokeStyle = 'rgba(24, 17, 13, 0.94)'
          ctx.lineWidth = w
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
        }
        ctx.stroke()
      }
    }
  }

  /** Points along each main crack, to hang the web on. */
  const mains = []

  /**
   * A crack from (x, y) heading `angle`, `length` long, starting `width` wide: wandering
   * a little at every step, thinning as it goes, now and then forking (down to `depth` 2).
   */
  function crack(x, y, angle, length, width, depth) {
    const pts = [[x, y, width]]
    let travelled = 0
    let a = angle
    while (travelled < length) {
      const step = S * (0.018 + rand() * 0.022)
      a += (rand() - 0.5) * 0.65
      x += Math.cos(a) * step
      y += Math.sin(a) * step
      travelled += step
      const w = Math.max(S * 0.0025, width * (1 - travelled / length))
      pts.push([x, y, w])
      if (depth < 2 && rand() < 0.16 - depth * 0.05) {
        const side = rand() < 0.5 ? -1 : 1
        crack(x, y, a + side * (0.4 + rand() * 0.6), (length - travelled) * (0.45 + rand() * 0.3), w * 0.7, depth + 1)
      }
    }
    stroke(pts)
    return pts
  }

  // The dent: a dark crater, deepest in the middle.
  const crater = ctx.createRadialGradient(c, c, 0, c, c, S * 0.12)
  crater.addColorStop(0, 'rgba(14, 10, 8, 0.9)')
  crater.addColorStop(0.45, 'rgba(36, 28, 22, 0.62)')
  crater.addColorStop(1, 'rgba(40, 32, 26, 0)')
  ctx.fillStyle = crater
  ctx.beginPath()
  ctx.arc(c, c, S * 0.12, 0, Math.PI * 2)
  ctx.fill()

  // The main cracks, splitting out every way.
  const count = 12
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.4
    const start = S * 0.035
    mains.push(crack(c + Math.cos(a) * start, c + Math.sin(a) * start, a, S * (0.3 + rand() * 0.16), S * (0.017 + rand() * 0.007), 0))
  }

  // The web: short jagged cracks between neighbouring mains, in two rings round the crater.
  for (const ring of [0.11, 0.2]) {
    for (let i = 0; i < count; i += 1) {
      if (rand() < 0.3) continue
      const from = pointAt(mains[i], ring * S)
      const to = pointAt(mains[(i + 1) % count], ring * S * (0.9 + rand() * 0.25))
      if (!from || !to) continue
      const pts = [[from[0], from[1], S * 0.006]]
      const steps = 3
      for (let k = 1; k <= steps; k += 1) {
        const f = k / steps
        const jitter = k < steps ? (rand() - 0.5) * S * 0.02 : 0
        pts.push([from[0] + (to[0] - from[0]) * f + jitter, from[1] + (to[1] - from[1]) * f + jitter, S * (0.0065 - f * 0.003)])
      }
      stroke(pts)
    }
  }

  // The crushed rim: pale chips of the wall's face round the crater.
  ctx.fillStyle = 'rgba(255, 248, 232, 0.4)'
  for (let i = 0; i < 16; i += 1) {
    const a = rand() * Math.PI * 2
    const r = S * (0.045 + rand() * 0.05)
    const x = c + Math.cos(a) * r
    const y = c + Math.sin(a) * r
    const s = S * (0.006 + rand() * 0.01)
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s)
    ctx.lineTo(x + Math.cos(a + 2.1) * s * 0.7, y + Math.sin(a + 2.1) * s * 0.7)
    ctx.lineTo(x + Math.cos(a - 2.1) * s * 0.7, y + Math.sin(a - 2.1) * s * 0.7)
    ctx.closePath()
    ctx.fill()
  }
  return canvas
}

/** The point on a crack's polyline about `r` from the middle (the first one past it), or null. */
function pointAt(pts, r) {
  const c = pts[0]
  for (const p of pts) {
    const d = Math.hypot(p[0] - c[0], p[1] - c[1])
    if (d >= r * 0.9) return p
  }
  return null
}

/**
 * Creates the crack decal, its texture at most `maxTexture` px. Returns the mesh (add it
 * to the scene; hidden until shown), and:
 * - `show(x, y, z, grow)`: on the wall face at (x, y, z), facing back down the runway,
 *   spread out to `grow` (0-1).
 * - `hide()`, `dispose()`.
 */
export function createCrack(maxTexture) {
  const texture = new CanvasTexture(paintCrack(Math.min(512, maxTexture || 512)))
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uMap: { value: null }, uGrow: { value: 0 } }]),
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
  material.uniforms.uMap.value = texture
  const geometry = new PlaneGeometry(1, 1)
  const mesh = new Mesh(geometry, material)
  mesh.scale.setScalar(CRACK_SIZE)
  mesh.renderOrder = 1
  mesh.frustumCulled = false
  return {
    mesh,
    show(x, y, z, grow) {
      mesh.visible = true
      mesh.position.set(x, y, z)
      material.uniforms.uGrow.value = grow
    },
    hide() {
      mesh.visible = false
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
