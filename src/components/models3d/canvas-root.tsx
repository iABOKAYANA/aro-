'use client'

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

import type { PublicModel3D, Floor3D } from '@/lib/models3d'

/**
 * The heavy R3F subtree — the ONLY module tree in the codebase importing
 * three/react-three. Loaded behind next/dynamic ssr:false from viewer-root.
 */

/* ─── Loading progress → surface veil (via THREE.DefaultLoadingManager) ─── */
if (typeof window !== 'undefined') {
  const manager = THREE.DefaultLoadingManager
  manager.onProgress = function m3dOnProg(_url, loaded, total) {
    if (total > 0) window.dispatchEvent(new CustomEvent('m3d-progress', { detail: { p: Math.min(0.98, loaded / total) } }))
  }
}

const STATUS_HEX: Record<string, string> = {
  AVAILABLE: '#22c55e',
  RESERVED: '#f59e0b',
  SOLD: '#6b7280',
}

/* ─── GLB stage: auto-frame the architecture into a normalized world ─── */
function GltfStage({ url, targetHeight }: { url: string; targetHeight: number }) {
  const { scene } = useGLTF(url) as { scene: THREE.Object3D }
  // First commit = model fully streamed/parsed on screen → lift the loader veil.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('m3d-progress', { detail: { p: 1 } }))
  }, [])
  const group = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    box.getSize(size)
    const scale = targetHeight / Math.max(size.y, 0.001)
    const center = box.getCenter(new THREE.Vector3())
    const root = scene.clone(true)
    root.scale.setScalar(scale)
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    return root
  }, [scene, targetHeight])
  return <primitive object={group} />
}

/**
 * GLB loader boundary: a corrupt/unsupported file degrades to the clearly
 * labeled demo scene (never a broken black canvas).
 */
class CatchLoad extends Component<{ children: ReactNode; onError: () => void }> {
  componentDidCatch() {
    window.dispatchEvent(new CustomEvent('m3d-load-error'))
    this.props.onError()
  }
  render() {
    return this.props.children
  }
}

function GltfOrFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return <CatchLoad onError={() => setFailed(true)}>{children}</CatchLoad>
}

/* ─── Procedural demo (upstream labeled — never presented as a real unit) ─── */
function DemoBuilding({ floors }: { floors: Floor3D[] }) {
  const floorH = 3
  const span = 9
  const depth = 6
  const count = Math.max(1, floors.length || 4)
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const conf = floors[i]
        const units = (conf?.units || []).slice(0, 5)
        const slots = Math.max(units.length, 3)
        return (
          <group key={i} position={[0, i * floorH, 0]}>
            <mesh receiveShadow castShadow position={[0, floorH / 2, 0]}>
              <boxGeometry args={[span, floorH, depth]} />
              <meshStandardMaterial color={i % 2 ? '#8b909b' : '#a6abb5'} roughness={0.9} />
            </mesh>
            {Array.from({ length: slots }, (_, w) => {
              const st = STATUS_HEX[units[w]?.status || 'AVAILABLE'] || '#22c55e'
              const x = -span / 2 + 1.2 + w * ((span - 2) / Math.max(slots - 1, 1))
              return (
                <mesh key={w} position={[x, floorH / 2, depth / 2 + 0.05]}>
                  <boxGeometry args={[1.3, 1.6, 0.12]} />
                  <meshStandardMaterial color="#16233e" emissive={st} emissiveIntensity={0.35} roughness={0.35} metalness={0.15} />
                </mesh>
              )
            })}
            <mesh position={[0, 0.01, 0]}>
              <boxGeometry args={[span + 0.4, 0.12, depth + 0.4]} />
              <meshStandardMaterial color="#7e838d" roughness={1} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.35, depth / 2 + 0.9]} castShadow>
        <boxGeometry args={[3.4, 0.16, 1.6]} />
        <meshStandardMaterial color="#5b6472" roughness={0.8} />
      </mesh>
    </group>
  )
}

function DemoRoom() {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[8, 0.1, 6]} />
        <meshStandardMaterial color="#b9b2a6" roughness={0.85} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 1.5, -3]}>
        <boxGeometry args={[8, 3, 0.15]} />
        <meshStandardMaterial color="#ece7df" roughness={0.95} />
      </mesh>
      <mesh receiveShadow castShadow position={[-4, 1.5, 0]}>
        <boxGeometry args={[0.15, 3, 6]} />
        <meshStandardMaterial color="#e5dfd6" roughness={0.95} />
      </mesh>
      <mesh receiveShadow castShadow position={[4, 1.5, 0]}>
        <boxGeometry args={[0.15, 3, 6]} />
        <meshStandardMaterial color="#e5dfd6" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[-1.6, 0.4, -2.1]} rotation={[0, 0.05, 0]}>
        <boxGeometry args={[2.4, 0.8, 0.9]} />
        <meshStandardMaterial color="#3f4a5c" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-1.6, 0.36, -0.7]}>
        <boxGeometry args={[1.4, 0.1, 0.8]} />
        <meshStandardMaterial color="#6d5138" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[2.4, 0.35, -1.9]}>
        <boxGeometry args={[2.2, 0.7, 1.6]} />
        <meshStandardMaterial color="#5b6472" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[3.2, 0.55, 2]}>
        <boxGeometry args={[3.4, 1.1, 0.7]} />
        <meshStandardMaterial color="#37424f" roughness={0.6} />
      </mesh>
    </group>
  )
}

/* ─── Hotspot room pins (click → room panel) ─── */
function HotspotPins({ hotspots, onPick }: {
  hotspots: { id: string; position: [number, number, number]; labelAr: string; labelEn: string }[]
  onPick: (id: string) => void
}) {
  return (
    <>
      {hotspots.map((h) => (
        <group key={h.id} position={h.position}>
          <Html center distanceFactor={10} zIndexRange={[16777000, 0]}>
            <button
              onClick={(e) => { e.stopPropagation(); onPick(h.id) }}
              className="m3d-pin flex items-center gap-1.5 whitespace-nowrap rounded-full border border-estate-gold/60 bg-[#0e1930]/95 px-3 py-1.5 text-xs font-bold text-white shadow-xl transition-transform hover:scale-110"
              dir="auto"
            >
              <span aria-hidden="true">📍</span>
              {h.labelAr || h.labelEn}
            </button>
          </Html>
          <mesh position={[0, 0.25, 0]}>
            <sphereGeometry args={[0.085, 12, 12]} />
            <meshStandardMaterial color="#d4a843" emissive="#d4a843" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/* ─── Active-floor highlight band ─── */
function FloorBand({ floor, floors }: { floor: string | null; floors: Floor3D[] }) {
  const conf = floors.find((f) => f.id === floor)
  if (!conf) return null
  return (
    <mesh position={[0, (conf.y ?? 0) + 1.5, 0]}>
      <boxGeometry args={[10.4, 2.9, 7]} />
      <meshStandardMaterial color="#d4a843" transparent opacity={0.14} emissive="#d4a843" emissiveIntensity={0.25} depthWrite={false} />
    </mesh>
  )
}

/* ─── Controls: orbit ↔ walk, zoom events, focus glide ─── */
function ControlsRig({ walk, cameraFocusY }: { walk: boolean; cameraFocusY: number }) {
  const orbit = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const { camera } = useThree()
  const walkState = useRef({ keys: new Set<string>(), yaw: 0, pitch: -0.05, locked: false, moveId: null as number | null, lookId: null as number | null, lookX0: null as number | null, moveX0: null as number | null, moveY0: null as number | null, moveX: 0, moveY: 0 })
  const focusRef = useRef(cameraFocusY)

  useEffect(() => {
    focusRef.current = cameraFocusY
  }, [cameraFocusY])

  useEffect(() => {
    const onZoom = (e: Event) => {
      const dir = (e as CustomEvent<number>).detail as number
      const c = orbit.current
      if (!c) return
      if (dir > 0) c.dollyOut(1.25)
      else c.dollyIn(1.25)
      c.update()
    }
    window.addEventListener('m3d-zoom', onZoom)
    return () => window.removeEventListener('m3d-zoom', onZoom)
  }, [])

  useEffect(() => {
    if (!walk) return
    const st = walkState.current
    st.locked = false
    const kd = (e: KeyboardEvent) => {
      st.keys.add(e.key.toLowerCase())
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
    }
    const ku = (e: KeyboardEvent) => st.keys.delete(e.key.toLowerCase())
    const md = (e: MouseEvent) => {
      if (!st.locked) return
      st.yaw -= e.movementX * 0.0032
      st.pitch = Math.max(-0.7, Math.min(0.55, st.pitch - e.movementY * 0.0028))
    }
    const ensureLock = () => {
      const canvas = document.querySelector('canvas')
      if (canvas && !document.pointerLockElement) {
        try {
          const p = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {
          /* pointer lock unavailable — walk stays touch/keyboard driven */
        }
      }
    }
    const plChange = () => { st.locked = document.pointerLockElement === document.querySelector('canvas') }
    // Mobile: left half = move pad, right half = look pad (drag anywhere).
    const ts = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth / 2 && !st.moveId) { st.moveId = t.identifier; st.moveX0 = t.clientX; st.moveY0 = t.clientY }
        else if (!st.lookId) { st.lookId = t.identifier; st.lookX0 = t.clientX }
      }
    }
    const tm = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === st.moveId && st.moveX0 !== null && st.moveY0 !== null) {
          st.moveX = Math.max(-1, Math.min(1, (t.clientX - st.moveX0) / 48))
          st.moveY = Math.max(-1, Math.min(1, (t.clientY - st.moveY0) / 48))
        } else if (t.identifier === st.lookId && st.lookX0 !== null) {
          st.yaw -= (t.clientX - st.lookX0) * 0.0042
          st.lookX0 = t.clientX
        }
      }
    }
    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === st.moveId) { st.moveId = null; st.moveX0 = null; st.moveY0 = null; st.moveX = 0; st.moveY = 0 }
        if (t.identifier === st.lookId) { st.lookId = null; st.lookX0 = null }
      }
    }
    document.addEventListener('keydown', kd)
    document.addEventListener('keyup', ku)
    document.addEventListener('mousemove', md)
    document.addEventListener('click', ensureLock)
    document.addEventListener('pointerlockchange', plChange)
    document.addEventListener('touchstart', ts, { passive: true })
    document.addEventListener('touchmove', tm, { passive: true })
    document.addEventListener('touchend', te, { passive: true })
    document.addEventListener('touchcancel', te, { passive: true })
    return () => {
      document.removeEventListener('keydown', kd)
      document.removeEventListener('keyup', ku)
      document.removeEventListener('mousemove', md)
      document.removeEventListener('click', ensureLock)
      document.removeEventListener('pointerlockchange', plChange)
      document.removeEventListener('touchstart', ts)
      document.removeEventListener('touchmove', tm)
      document.removeEventListener('touchend', te)
      document.removeEventListener('touchcancel', te)
      st.keys.clear()
      st.moveId = null
      st.lookId = null
      st.moveX = 0
      st.moveY = 0
      st.locked = false
    }
  }, [walk])

  useFrame((_, delta) => {
    // Smooth focus glide when a floor chip is clicked.
    camera.position.y += (focusRef.current - camera.position.y) * Math.min(1, delta * 2.2)
    if (walk) {
      const st = walkState.current
      let fwd = 0
      let side = 0
      if (st.keys.has('w') || st.keys.has('arrowup')) fwd += 1
      if (st.keys.has('s') || st.keys.has('arrowdown')) fwd -= 1
      if (st.keys.has('a') || st.keys.has('arrowleft')) side -= 1
      if (st.keys.has('d') || st.keys.has('arrowright')) side += 1
      if (Math.abs(st.moveX) > 0.05) side += st.moveX
      if (Math.abs(st.moveY) > 0.05) fwd += -st.moveY
      const len = Math.hypot(fwd, side)
      const speed = (st.keys.has('shift') ? 5.2 : 2.6) * delta * Math.min(1, len)
      if (len > 0.01) {
        const dir = new THREE.Vector3(
          Math.sin(st.yaw) * (fwd / len) + Math.cos(st.yaw) * (side / len),
          0,
          Math.cos(st.yaw) * (fwd / len) - Math.sin(st.yaw) * (side / len)
        )
        camera.position.x = THREE.MathUtils.clamp(camera.position.x + dir.x * speed, -60, 60)
        camera.position.z = THREE.MathUtils.clamp(camera.position.z + dir.z * speed, -60, 60)
      }
      camera.position.y = 1.65
      const q = new THREE.Euler(st.pitch, st.yaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(q)
    }
  })

  if (walk) return null
  return (
    <OrbitControls
      ref={orbit}
      makeDefault
      enablePan
      panSpeed={0.7}
      autoRotate={!walk}
      autoRotateSpeed={0.55}
      minDistance={1.4}
      maxDistance={48}
      maxPolarAngle={Math.PI / 2.02}
      target={[0, 3.2, 0]}
    />
  )
}

/* ─── Scene root ─── */
export interface CanvasRootProps {
  model: PublicModel3D
  night: boolean
  walk: boolean
  activeFloor: string | null
  onSelectHotspot: (h: { id: string; position: [number, number, number]; labelAr: string; labelEn: string }) => void
  onSelectUnit: (u: { id: string; label: string; status: string; price?: number; area?: number; rooms?: number; unitId?: string; floorNameAr: string; floorNameEn: string }) => void
  /** CEO configurator click-to-place mode. */
  pickMode?: boolean
}

function InnerScene({ model, walk, activeFloor, onSelectHotspot, onSelectUnit, pickMode }: CanvasRootProps) {
  const hotspotsById = useMemo(() => new Map(model.hotspots.map((h) => [h.id, h])), [model.hotspots])
  const floors = model.floors

  // Demo scenes mount immediately — signal the veil to drop at first paint.
  useEffect(() => {
    if (!model.hasRealModel) window.dispatchEvent(new CustomEvent('m3d-progress', { detail: { p: 1 } }))
  }, [model.hasRealModel])

  const fallback = useMemo(
    () => (model.kind === 'BUILDING' ? <DemoBuilding floors={floors} /> : <DemoRoom />),
    [model.kind, floors]
  )

  const focusY = useMemo(() => {
    const idx = floors.findIndex((x) => x.id === activeFloor)
    if (idx < 0) return 3.2
    const y = floors[idx].y ?? idx * 3
    return Math.max(0.8, Math.min(y + 2.4, 60))
  }, [floors, activeFloor])

  const targetHeight = model.kind === 'BUILDING' ? 15 : 7
  const pick = pickMode
    ? (e: { stopPropagation: () => void; point: THREE.Vector3 }) => {
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('m3d-ceo-pick', { detail: [e.point.x, e.point.y, e.point.z] }))
      }
    : undefined

  return (
    <>
      {/* Click catcher so surface clicks resolve in CEO placing mode */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onPointerDown={pick} visible={false}>
        <planeGeometry args={[70, 70]} />
        <meshBasicMaterial />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
        <circleGeometry args={[48, 48]} />
        <meshStandardMaterial color="#9aa394" roughness={1} />
      </mesh>

      {model.hasRealModel ? (
        <GltfOrFallback fallback={fallback}>
          <Suspense fallback={null}>
            <group onPointerDown={pick}>
              <GltfStage url={`/api/3d/file/${model.id}`} targetHeight={targetHeight} />
            </group>
          </Suspense>
        </GltfOrFallback>
      ) : (
        <group onPointerDown={pick}>{fallback}</group>
      )}

      <FloorBand floor={activeFloor} floors={floors} />
      <HotspotPins
        hotspots={model.hotspots}
        onPick={(id) => {
          const h = hotspotsById.get(id)
          if (h) onSelectHotspot(h)
        }}
      />
      {/* Unit pins per floor (the 3D building experience) */}
      {floors.map((f, fi) => {
        const fy = f.y ?? fi * 3
        return (
          <group key={f.id}>
            {(f.units || []).slice(0, 5).map((u, ui) => (
              <Html key={u.id} center distanceFactor={12} position={[-2.2 + ui * 1.2, fy + 1.5, 3.35]} zIndexRange={[16777000, 0]}>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectUnit({ ...u, floorNameAr: f.nameAr, floorNameEn: f.nameEn }) }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/70 text-[11px] font-extrabold text-white shadow-lg transition-transform hover:scale-125"
                  style={{ background: STATUS_HEX[u.status] || '#22c55e' }}
                  aria-label={u.label}
                  title={u.label}
                >
                  {ui + 1}
                </button>
              </Html>
            ))}
          </group>
        )
      })}
    </>
  )
}

export default function CanvasRoot(props: CanvasRootProps) {
  const { night } = props
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: props.model.kind === 'BUILDING' ? [26, 15, 26] : props.model.kind === 'INTERIOR' ? [10, 7, 10] : [17, 11, 17], fov: 42, near: 0.1, far: 260 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <NightRig night={night} />
      <InnerScene {...props} />
    </Canvas>
  )
}

/** Day/night wheels: sky/fog color, sun-vs-moon lights. */
function NightRig({ night }: { night: boolean }) {
  return (
    <>
      <color attach="background" args={[night ? '#050914' : '#b9d0e8']} />
      <fog attach="fog" args={[night ? '#050914' : '#b9d0e8', 32, 95]} />
      {night ? (
        <>
          <hemisphereLight intensity={0.22} color="#8fa3c8" groundColor="#0a0f1e" />
          <directionalLight position={[-8, 12, -5]} intensity={0.5} color="#93b4ff" castShadow shadow-mapSize={[1024, 1024]} />
          <ambientLight intensity={0.15} color="#26314d" />
        </>
      ) : (
        <>
          <hemisphereLight intensity={0.7} color="#cfe2ff" groundColor="#8a7f70" />
          <directionalLight position={[9, 15, 7]} intensity={2.1} color="#fff0d8" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
          <ambientLight intensity={0.4} />
        </>
      )}
    </>
  )
}
