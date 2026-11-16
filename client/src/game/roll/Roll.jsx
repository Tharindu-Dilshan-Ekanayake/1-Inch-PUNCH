import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CylinderGeometry, Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three'

import { TROPHY_FIRST, TROPHY_SPACING, WALL_EVERY } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { trophyValue, winsMultiplier, zoneIndexAt } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { burst } from '../fx/fxQueue'
import { getGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { iconUrl } from '../../ui/icons'
import { createToyInstances, PropBuilder } from '../blocks'
import { spawnScattered } from '../fx/popups'
import { sharedMaterials, STYLE } from '../materials'
import { runtime } from '../runtime'
import { activeWorld, perWorld, showLobbySky, zones } from '../worldLook'
import { writeDistance, writeZone } from './hudLink'
import FireBurst from '../fx/FireBurst'
import Lane from './Lane'
import FistCharge from './FistCharge'
import Walls from './Walls'
import { FIST_AHEAD, KICK_HIT, trackPoint } from './path'
import { linkPrograms } from '../linkPrograms'
import { advanceRoll, roll } from './rollControl'
import { ZONE_THEMES } from './themes'
import Weather from './Weather'

const MAX_TROPHIES = 16
/** Trophies float this high over the kick's line. */
const TROPHY_HEIGHT = 3.4
/**
 * Frame-loop priority: before every other system, so the chase camera has moved before
 * anything projects into it (name tags, popups). Negative, so R3F still renders itself.
 */
const BEFORE_EVERYTHING = -1

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _look = new Vector3()
const _cam = new Vector3()
/** The chase camera's smoothed position, before any shake is added on top. */
const camBase = new Vector3()
const _up = new Vector3(0, 1, 0)
/** Stable vector for runtime.flightFocus (the scratch ones are reused mid-frame). */
const tireFocus = new Vector3()

/** The punch landing on the wall that holds jolts the camera: this much (metres), fading over this long (ms). */
const LAND_JOLT = 0.2
const LAND_JOLT_MS = 170

/** At most one trophy popup this often; the trophies in between are summed into it. */
const TROPHY_POPUP_MS = 650
const TROPHY_ICON = iconUrl('trophy')
/** Trophy popups are scattered over the screen (see spawnScattered), a touch bigger than gains. */
const TROPHY_POPUP = { iconUrl: TROPHY_ICON, scale: 1.2 }

const zoneNameGradients = perWorld((zs) =>
  zs.map((z) => {
    const [a, b, c] = ZONE_THEMES[z.theme].name
    return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`
  }),
)
/**
 * The punch, as you make your move and throw it: the camera stands off your right side, a
 * little behind your spot on the punch line - this far out, this far back, a little over
 * head height so the whole spinning jump stays in the picture - looking past you at the
 * first wall (this far ahead, this far over, this high): you in profile, springing up,
 * spinning, landing in your stance and punching, the wall bursting in front of you. The
 * lens tightens for an instant as it lands (`impactZoom` degrees).
 */
const STRIKE_CAM = { side: 5.4, back: 3.2, height: 2.1, look: 7, lookX: -0.8, lookY: 1.75, impactZoom: 5 }
/**
 * Then, starting `after` seconds after the punch lands and taking `swing` seconds to get
 * there, the camera drops in low behind the break and follows it straight down the
 * runway (at its shown pace, never over SHOW_SPEED: rollControl's showPace) three walls
 * back - `behind` metres, so as the fourth wall bursts the camera is passing where the
 * first stood - but never ahead of `hold` metres behind the punch spot: it waits there,
 * behind you, while the first walls go, then sets off after the break. Low (`height`,
 * under the walls' tops: 6.4 m), a little to your side of the middle (`side` of your
 * line), looking level down the runway past the break (`ahead`, `lookY`), through a
 * slightly longer lens (`fov` degrees): each wall smashed to bits in the middle of the
 * picture, the wreckage of the ones before strewn along the runway in front of you.
 */
const CHASE_CAM = { after: 0.12, swing: 0.7, behind: 3 * WALL_EVERY - FIST_AHEAD, hold: 7, side: 0.6, height: 5, ahead: 10, lookY: 2.2, fov: 48 }
/** Further than this from where the stopped camera wants to be, it cuts there instead of gliding. */
const CUT_TO_STOP = 40
const _lookWant = new Vector3()
const _dir = new Vector3()
const _side = new Vector3()
const _sideLook = new Vector3()
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function createTrophyGeometry() {
  const p = new PropBuilder()
  const gold = '#ffcc1f'
  p.add(new CylinderGeometry(0.42, 0.24, 0.62, 12), { position: [0, 0.55, 0], color: gold, style: STYLE.GLOW })
  p.add(new TorusGeometry(0.2, 0.06, 6, 10, Math.PI), { position: [-0.42, 0.62, 0], rotation: [0, 0, Math.PI / 2], color: gold })
  p.add(new TorusGeometry(0.2, 0.06, 6, 10, Math.PI), { position: [0.42, 0.62, 0], rotation: [0, 0, -Math.PI / 2], color: gold })
  p.add(new CylinderGeometry(0.08, 0.08, 0.3, 6), { position: [0, 0.12, 0], color: gold })
  p.box(0, -0.05, 0, 0.5, 0.14, 0.5, '#ffb01e', STYLE.SMOOTH)
  return p.build()
}

/**
 * Lazily loaded: the runway and its trophies, and the camera that films the punch while
 * you fly (your avatar flies itself: Player.jsx; other players' fly theirs: remote/).
 * While nobody is launching it still streams the first stretch, which is the runway you
 * see from the lobby.
 */
export default function Roll() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const rootRef = useRef(null)
  const trophyRef = useRef(null)
  const startedFor = useRef(0)
  /** The cuts (roll.cuts) the camera has jumped for. */
  const cutsShown = useRef(0)
  /** Trophies passed so far this roll: the next one's metre, and Wins not yet shown. */
  const trophyTally = useRef({ next: TROPHY_FIRST, pending: 0, shownAt: 0 })
  const zoneShown = useRef(-1)
  const wasActive = useRef(false)
  /** The camera's field of view outside rolls, restored after each. */
  const baseFov = useRef(60)

  const assets = useMemo(() => {
    const trophies = createToyInstances(createTrophyGeometry(), sharedMaterials().toy, MAX_TROPHIES)

    return { trophies }
  }, [])

  // This module loads after the lobby is on screen; compile its shaders in the
  // background before showing it, so the first roll doesn't stall on them.
  useEffect(() => {
    const root = rootRef.current
    // Skipped in dev, where StrictMode's remount disposes materials mid-compile (see
    // ShaderWarmup).
    if (!root || import.meta.env.DEV) return undefined
    let cancelled = false
    // compile() only gathers what's visible, and gathers it there and then: so it's
    // called with the root shown, and the root hidden straight after, until it's done.
    root.visible = true
    const compiling = gl.compileAsync(root, camera, scene)
    root.visible = false
    compiling
      .catch(() => null)
      .finally(() => {
        if (cancelled) return
        // Linked now, in the lobby, not at the first kick (linkPrograms.js).
        linkPrograms(gl)
        root.visible = true
      })
    return () => {
      cancelled = true
    }
  }, [gl, camera, scene])

  useEffect(
    () => () => {
      assets.trophies.geometry.dispose()
      assets.trophies.dispose()
      showLobbySky(null)
    },
    [assets],
  )

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const settings = getQuality()
    const now = performance.now()

    // --- The kick -----------------------------------------------------------------
    let focus = 0
    if (roll.active) {
      advanceRoll(state.clock.elapsedTime)
      if (startedFor.current !== roll.startedAt) {
        startedFor.current = roll.startedAt
        camBase.copy(camera.position)
        // Looking where the camera already looks - never left on the last punch's stop,
        // thousands of metres away (that showed empty sky as the punch began).
        _look.copy(camera.position).addScaledVector(camera.getWorldDirection(_dir), 10)
        baseFov.current = camera.fov
        const tally = trophyTally.current
        tally.next = TROPHY_FIRST
        tally.pending = 0
        tally.shownAt = 0
        zoneShown.current = -1
        cutsShown.current = 0
      }
      focus = Math.max(0, roll.meter)
      const speed = roll.speed
      const p = roll.position
      runtime.flightFocus = tireFocus.copy(p)
      writeDistance(Math.max(0, roll.meter))
      const zi = zoneIndexAt(Math.max(0, roll.meter))
      if (zi !== zoneShown.current) {
        // Into a new stage (not the one you start in): confetti round you and a cheerful
        // jingle.
        if (zoneShown.current >= 0 && zi > zoneShown.current) {
          sfx.stageUp()
          if (settings.particles) burst({ x: p.x, y: p.y + 2, z: p.z - 6, count: 44, palette: 'confetti', speed: 10 })
        }
        zoneShown.current = zi
        writeZone(zi, zones()[zi].name, zoneNameGradients()[zi])
      }

      // The sound of the flight, swelling with its speed, gone once it stops.
      // (Silent once it has slammed down: the boom and the hops take over.)
      if (roll.airborne && speed > 4) {
        sfx.windStart()
        sfx.windSet(speed / 120, roll.airborne, 0)
      } else if (roll.bounces > 0 || roll.stopped) {
        sfx.windStop()
      }

      if (runtime.camera.mode === 'roll') {
        // On the launch's own clock, so the camera freezes with you in slow motion.
        const elapsed = (now - roll.startedAt - roll.lag) / 1000
        /** How far into the chase (0-1): its longer lens comes in with it. */
        let chase = 0
        if (roll.phase === 'stopped' || roll.crashed) {
          // Stopped: swing round to the side and in, onto the wall that held.
          const k = smoothstep(0, 1.4, elapsed - roll.duration + (roll.crashed ? 0.5 : 0))
          const angle = (Math.floor(roll.distance) % 2 === 0 ? 1 : -1) * 0.7 * k
          const dist = 12 - 3.5 * k
          const height = 5.4 - 1.6 * k
          _cam.set(Math.sin(angle) * dist, height + Math.cos(angle) * dist * 0.15, Math.cos(angle) * dist).add(p)
          // From far off (a short punch seen from the punch spot, or a cut at the end), a cut.
          if (camBase.distanceTo(_cam) > CUT_TO_STOP) {
            camBase.copy(_cam)
            _look.copy(p).y += 0.6
          } else camBase.lerp(_cam, 1 - Math.exp(-4 * delta))
          _lookWant.copy(p).y += 0.6
          _look.lerp(_lookWant, 1 - Math.exp(-6 * delta))
        } else {
          // Off your right side as you wind up and throw it (eased in from wherever the
          // camera was); the moment it lands, the camera rises in behind the break and
          // follows it straight through the walls as they burst. Locked to the break (no
          // lag behind it), and on each cut it jumps straight to the new place - no swoop.
          const off = smoothstep(KICK_HIT + CHASE_CAM.after, KICK_HIT + CHASE_CAM.after + CHASE_CAM.swing, elapsed)
          chase = off
          trackPoint(roll.fromMeter - STRIKE_CAM.back, roll.startX + STRIKE_CAM.side, STRIKE_CAM.height, _side)
          const camMeter = Math.max(roll.meter - CHASE_CAM.behind, roll.fromMeter - CHASE_CAM.hold)
          trackPoint(camMeter, roll.x + CHASE_CAM.side, CHASE_CAM.height, _cam)
          _cam.lerp(_side, 1 - off)
          trackPoint(roll.fromMeter + STRIKE_CAM.look, roll.startX + STRIKE_CAM.lookX, STRIKE_CAM.lookY, _sideLook)
          trackPoint(roll.meter + CHASE_CAM.ahead, roll.x * 0.5, CHASE_CAM.lookY, _lookWant)
          _lookWant.lerp(_sideLook, 1 - off)
          if (cutsShown.current !== roll.cuts) {
            cutsShown.current = roll.cuts
            camBase.copy(_cam)
            _look.copy(_lookWant)
          } else {
            // Easing in during the wind-up; once it's travelling, held right on it.
            const k = off > 0 ? 1 - Math.exp(-30 * delta) : 1 - Math.exp(-6 * delta)
            camBase.lerp(_cam, k)
            _look.lerp(_lookWant, k)
          }
        }
        // The punch landing on the wall that holds: one short, smooth shudder (never a
        // random shake every frame).
        const sinceLand = now - roll.landedAt
        const jolt = roll.landedAt && sinceLand < LAND_JOLT_MS * 4 ? LAND_JOLT * Math.exp(-sinceLand / LAND_JOLT_MS) * Math.sin(sinceLand * 0.045) : 0
        camera.position.set(camBase.x, camBase.y + jolt, camBase.z)
        camera.lookAt(_look)
        // The punch landing: the lens tightens a touch for an instant (the hit), then
        // eases back; otherwise it holds steady (no zooming with speed or on every wall).
        const sinceKick = elapsed - KICK_HIT
        const impact = sinceKick > 0 && sinceKick < 0.8 ? -STRIKE_CAM.impactZoom * Math.exp(-sinceKick / 0.16) * smoothstep(0, 0.03, sinceKick) : 0
        const sinceFreeze = roll.freezeAt ? now - roll.freezeAt : Infinity
        const zoom = (CHASE_CAM.fov - baseFov.current) * chase
        const fov = baseFov.current + zoom + impact + (sinceFreeze < roll.freezeMs ? -8 * roll.freezePower * smoothstep(0, 160, sinceFreeze) : 0)
        // (The frame's own camera handle: the same camera, but writable by lint's rules.)
        const lens = state.camera
        if (Math.abs(fov - lens.fov) > 0.05) {
          lens.fov += (fov - lens.fov) * (1 - Math.exp(-6 * delta))
          lens.updateProjectionMatrix()
        }
      }
    }
    if (wasActive.current && !roll.active) {
      state.camera.fov = baseFov.current
      state.camera.updateProjectionMatrix()
      sfx.windStop()
      showLobbySky(scene.fog)
    }
    wasActive.current = roll.active

    const ahead = settings.viewDistance

    // --- Trophies -----------------------------------------------------------------
    if (roll.active) {
      // Tally the ones just flown past. The Wins were granted with the launch; this is
      // the visual receipt. At speed you pass dozens a second, so they're summed into
      // one popup at most every TROPHY_POPUP_MS.
      const tally = trophyTally.current
      while (tally.next <= Math.min(roll.meter, roll.distance)) {
        tally.pending += trophyValue(tally.next, activeWorld())
        tally.next += TROPHY_SPACING
      }
      if (tally.pending > 0 && now - tally.shownAt >= TROPHY_POPUP_MS) {
        const multiplier = winsMultiplier(getGame().profile, Date.now())
        spawnScattered(`+${formatNumber(Math.round(tally.pending * multiplier))}`, TROPHY_POPUP)
        sfx.trophy()
        tally.pending = 0
        tally.shownAt = now
      }
    }
    const trophies = trophyRef.current
    if (trophies) {
      const spin = now * 0.003
      let count = 0
      const k0 = Math.max(0, Math.ceil((focus - 10 - TROPHY_FIRST) / TROPHY_SPACING))
      for (let m = TROPHY_FIRST + k0 * TROPHY_SPACING; m < focus + ahead * 0.8 && count < MAX_TROPHIES; m += TROPHY_SPACING) {
        if (roll.active && m <= roll.meter) continue
        trackPoint(m, 0, TROPHY_HEIGHT + Math.sin(spin + m) * 0.25, _p)
        _q.setFromAxisAngle(_up, spin + m)
        _s.setScalar(1.5)
        trophies.setMatrixAt(count, _m.compose(_p, _q, _s))
        count += 1
      }
      trophies.count = count
      trophies.instanceMatrix.needsUpdate = true
    }

  }, BEFORE_EVERYTHING)

  return (
    <group ref={rootRef}>
      <Lane />
      <Walls />
      <FistCharge />
      <FireBurst />
      <primitive ref={trophyRef} object={assets.trophies} />
      <Weather />
    </group>
  )
}
