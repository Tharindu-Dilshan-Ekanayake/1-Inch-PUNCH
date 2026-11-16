import { Color, InstancedBufferAttribute, InstancedMesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from 'three'

/**
 * Dust clouds for smashed walls: soft, billowing puffs that burst out of the hole, roll
 * out along the ground at the foot of the wall, swell, drift and thin away - tinted with
 * the wall's own colour. Plus, where the punch landed, a quick bright puff, a starburst
 * (a white-hot core, long yellow rays) and a white shockwave ring flying out.
 *
 * One InstancedMesh of camera-facing quads (one draw call), a fixed pool, nothing
 * allocated while it runs. Each puff is drawn by the shader alone (a soft round cloud
 * with lumpy edges: no texture). Transparent and unlit; no depth writes, so puffs blend
 * over each other without sorting. Presets without particles (LOW) get none: there, the
 * walls' own dusty crumbs stand in (Walls.jsx).
 */

const vertex = /* glsl */ `
  attribute vec3 aPuff;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  varying float vKind;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vFade = aPuff.x;
    vSeed = aPuff.y;
    vKind = aPuff.z;
    vColor = instanceColor;
    // Facing the camera: the quad's corners laid out in view space round its middle.
    vec3 centre = instanceMatrix[3].xyz;
    float size = length(instanceMatrix[0].xyz);
    vec4 mvPosition = modelViewMatrix * vec4(centre, 1.0);
    mvPosition.xy += position.xy * size;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragment = /* glsl */ `
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  varying float vKind;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  float dustHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dustNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dustHash(i), dustHash(i + vec2(1.0, 0.0)), f.x), mix(dustHash(i + vec2(0.0, 1.0)), dustHash(i + 1.0), f.x), f.y);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r0 = length(p);
    if (vKind > 1.5) {
      // The shockwave: a thin bright ring, soft either side.
      float ring = smoothstep(0.74, 0.9, r0) * (1.0 - smoothstep(0.9, 1.0, r0));
      if (ring * vFade < 0.01) discard;
      gl_FragColor = vec4(vColor, ring * vFade);
      #include <colorspace_fragment>
      #include <fog_fragment>
      return;
    }
    if (vKind > 0.5) {
      // The starburst: a white-hot core, four long yellow rays and four short ones between.
      float ang = atan(p.y, p.x) + vSeed;
      float long4 = pow(abs(cos(ang * 2.0)), 36.0) * (1.0 - smoothstep(0.1, 1.0, r0));
      float short4 = pow(abs(sin(ang * 2.0)), 36.0) * (1.0 - smoothstep(0.05, 0.5, r0));
      float core = 1.0 - smoothstep(0.08, 0.32, r0);
      float star = max(core, max(long4, short4));
      if (star * vFade < 0.01) discard;
      gl_FragColor = vec4(mix(vec3(1.0, 0.86, 0.22), vec3(1.0), core), star * vFade);
      #include <colorspace_fragment>
      #include <fog_fragment>
      return;
    }
    // A lumpy edge, each puff its own (vSeed), churning slowly as it fades.
    float a = atan(p.y, p.x);
    float lumps = dustNoise(vec2(a * 1.6 + vSeed * 17.0, vSeed * 5.0 + vFade * 1.5));
    float r = length(p) / (0.72 + 0.28 * lumps);
    float cloud = 1.0 - smoothstep(0.25, 1.0, r);
    // Thicker in places, inside.
    cloud *= 0.7 + 0.3 * dustNoise(p * 2.5 + vSeed * 31.0);
    if (cloud * vFade < 0.01) discard;
    // Lit from above: a little brighter on top.
    vec3 col = vColor * (0.88 + 0.2 * vUv.y);
    gl_FragColor = vec4(col, cloud * vFade);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

const _white = new Color('#ffffff')
/** What a puff is: a dust cloud, the hit's starburst, or its shockwave ring. */
const KIND = { puff: 0, star: 1, ring: 2 }
const _tint = new Color()

/**
 * Creates the dust: `pool` puffs at most. Returns the mesh (add it to the scene), and:
 * - `burst(x, y, z, color, along, amount)`: a wall smashed at (x, y, z) - the hole's
 *   middle - in `color`, its foot `along` metres wide either side; `amount` 0-1 scales
 *   how many puffs (the preset).
 * - `update(delta)`: advances every puff, once a frame.
 * - `dispose()`.
 */
export function createDust(pool) {
  const geometry = new PlaneGeometry(1, 1)
  // Per puff: how thick it is now (0 gone - 1), and its own lumps.
  // Per puff: how thick it is now (0 gone - 1), its own lumps, and what it is (KIND).
  const puffAttr = new InstancedBufferAttribute(new Float32Array(pool * 3), 3)
  geometry.setAttribute('aPuff', puffAttr)
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog]),
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    fog: true,
  })
  const mesh = new InstancedMesh(geometry, material, pool)
  mesh.frustumCulled = false
  mesh.count = 0
  // Drawn after the walls and their pieces.
  mesh.renderOrder = 2
  mesh.setColorAt(0, _white)

  // Puff state, struct-of-arrays: position, velocity, size from-to, age, life, peak thickness.
  const p = new Float32Array(pool * 3)
  const v = new Float32Array(pool * 3)
  const size0 = new Float32Array(pool)
  const size1 = new Float32Array(pool)
  const age = new Float32Array(pool).fill(1)
  const life = new Float32Array(pool)
  const peak = new Float32Array(pool)
  /** How fast it swells: 1 a slow billow, higher a quick flash. */
  const grow = new Float32Array(pool)
  let next = 0

  function puff(x, y, z, vx, vy, vz, from, to, seconds, thickness, color, speed = 1, kind = KIND.puff) {
    const k = next
    next = (next + 1) % pool
    p[k * 3] = x
    p[k * 3 + 1] = y
    p[k * 3 + 2] = z
    v[k * 3] = vx
    v[k * 3 + 1] = vy
    v[k * 3 + 2] = vz
    size0[k] = from
    size1[k] = to
    age[k] = 0
    life[k] = seconds
    peak[k] = thickness
    grow[k] = speed
    puffAttr.setY(k, Math.random())
    puffAttr.setZ(k, kind)
    mesh.setColorAt(k, color)
    mesh.instanceColor.needsUpdate = true
  }

  return {
    mesh,
    burst(x, y, z, color, along, amount) {
      // Dust is the wall's colour, paled: powder, not paint.
      _tint.copy(color).lerp(_white, 0.45)
      // (Sizes in metres: the chase camera watches from three walls back, so a cloud has
      // to be big to read.) The punch landing: a starburst, a shockwave ring flying out, and a bright puff.
      puff(x, y, z + 0.5, 0, 0, 0, 1.2, 9, 0.26, 1, _white, 7, KIND.star)
      puff(x, y, z + 0.45, 0, 0, 0, 2, 15, 0.42, 0.85, _white, 3, KIND.ring)
      puff(x, y, z + 0.3, 0, 0.5, -1.5, 1.5, 6.5, 0.35, 0.9, _white, 4)
      // Bursting out of the hole every way.
      const ring = Math.round(4 + 5 * amount)
      for (let i = 0; i < ring; i += 1) {
        const a = (i / ring) * Math.PI * 2 + Math.random() * 0.6
        const out = 3 + Math.random() * 4
        puff(x + Math.cos(a), Math.max(0.8, y + Math.sin(a)), z - 0.3, Math.cos(a) * out, Math.sin(a) * out * 0.6 + 0.8, -(2 + Math.random() * 4), 2.5, 6.5 + Math.random() * 2.5, 1.6 + Math.random() * 0.8, 0.75, _tint)
      }
      // Rolling out along the ground at the foot of the wall as it comes down, lingering.
      const foot = Math.round(4 + 5 * amount)
      for (let i = 0; i < foot; i += 1) {
        const across = (i / Math.max(1, foot - 1) - 0.5) * 2 * along
        puff(x * 0.3 + across + (Math.random() - 0.5) * 1.5, 1, z + (Math.random() - 0.5), Math.sign(across || 1) * (1.5 + Math.random() * 3), 0.6 + Math.random() * 0.8, -(1 + Math.random() * 3), 3, 7.5 + Math.random() * 3, 2 + Math.random() * 0.8, 0.7, _tint)
      }
    },
    update(delta) {
      const e = mesh.instanceMatrix.array
      const drag = Math.exp(-2.4 * delta)
      let top = 0
      for (let k = 0; k < pool; k += 1) {
        const o = k * 16
        if (age[k] >= life[k]) {
          if (puffAttr.getX(k) !== 0) {
            puffAttr.setX(k, 0)
            e[o] = 0
          }
          continue
        }
        age[k] += delta
        const t = Math.min(1, age[k] / life[k])
        const i3 = k * 3
        v[i3] *= drag
        v[i3 + 1] = v[i3 + 1] * drag + 0.25 * delta
        v[i3 + 2] *= drag
        p[i3] += v[i3] * delta
        p[i3 + 1] += v[i3 + 1] * delta
        p[i3 + 2] += v[i3 + 2] * delta
        // Swells fast, then slowly; thickest just after it's out, thinning to nothing.
        const swell = 1 - Math.pow(1 - t, 2 + grow[k])
        const size = size0[k] + (size1[k] - size0[k]) * swell
        const thick = peak[k] * Math.min(1, t * 8) * (1 - t) * (1 - t)
        e[o] = size
        e[o + 1] = 0
        e[o + 2] = 0
        e[o + 12] = p[i3]
        e[o + 13] = p[i3 + 1]
        e[o + 14] = p[i3 + 2]
        e[o + 15] = 1
        puffAttr.setX(k, thick)
        top = k + 1
      }
      mesh.count = top
      mesh.visible = top > 0
      if (top) {
        mesh.instanceMatrix.needsUpdate = true
        puffAttr.needsUpdate = true
      }
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}
