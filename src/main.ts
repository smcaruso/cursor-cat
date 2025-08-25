import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Ensure the canvas exists and is typed correctly
const canvas = document.getElementById('cursorcat') as HTMLCanvasElement | null
if (!canvas) {
  console.error('🛑 <canvas id="cursorcat"> not found in the DOM')
  throw new Error('Canvas with id "cursorcat" is required')
}

// Renderer configured to use the existing canvas
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
})
renderer.setClearColor(0x000000, 0) // transparent background
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping

// Scene & camera
const scene = new THREE.Scene()
scene.background = null // keep transparent if canvas overlays UI

const camera = new THREE.PerspectiveCamera(
  60,
  (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight),
  0.1,
  100
)
camera.position.set(0, -0.5, 3)


// Load matcap texture and create material
const matcapTexture = new THREE.TextureLoader().load('blue-matcap-1.png')
const matcapMaterial = new THREE.MeshMatcapMaterial({ color: 0xBCB8FF, matcap: matcapTexture })

// Load GLTF model
const loader = new GLTFLoader()
let cat: THREE.Object3D | null = null

// Add a small sphere below the cat
const sphereGeometry = new THREE.SphereGeometry(0.01, 16, 16)
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
const SPHERE_PLANE_Z = 2
const SPHERE_BASE_Y = -0.75
const SPHERE_LERP = 0.18
const sphereTarget = new THREE.Vector3(0, SPHERE_BASE_Y, SPHERE_PLANE_Z)
sphere.position.set(0, SPHERE_BASE_Y, SPHERE_PLANE_Z)
scene.add(sphere)

let pingPongDir = 1
const PINGPONG_SPEED = 0.01
const PINGPONG_LIMIT = 0.35

const raycaster = new THREE.Raycaster()
const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), -SPHERE_PLANE_Z)
const _pt = new THREE.Vector3()
let trackOffsetX = 0

function setSphereToCursor(e: PointerEvent) {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const ndc = new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)) // y: top=+1, bottom=-1
  raycaster.setFromCamera(ndc, camera)
  if (raycaster.ray.intersectPlane(planeZ, _pt)) {
    sphereTarget.set(_pt.x, _pt.y, SPHERE_PLANE_Z)
  }
}

// Mouse-driven rotation targeting
const MAX_YAW = Math.PI / 6;   // left/right (~30°)
const MAX_PITCH = Math.PI / 10; // up/down (~18°)
const ROTATE_LERP = 0.12;      // smoothing factor per frame
let targetYaw = 0;   // rotation around Y
let targetPitch = 0; // rotation around X
let isIdleTracking = false
const _tmpCat = new THREE.Vector3()
const _tmpSphere = new THREE.Vector3()
let idleTimeout: number | null = null
const IDLE_DELAY = 1000 // 1 seconds

function updateTargetFromEvent(e: PointerEvent) {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width  // 0..1 within canvas
  const y = (e.clientY - rect.top) / rect.height  // 0..1 within canvas
  const ndcX = x * 2 - 1 // -1..1
  const ndcY = y * 2 - 1 // -1..1
  targetYaw = ndcX * MAX_YAW
  targetPitch = ndcY * MAX_PITCH
  setSphereToCursor(e)
  isIdleTracking = false
  if (idleTimeout) clearTimeout(idleTimeout)
  idleTimeout = window.setTimeout(() => {
    isIdleTracking = true
  }, IDLE_DELAY)
}

// Listen on the canvas only (respects overlaying UI)
canvas.addEventListener('pointermove', updateTargetFromEvent)
canvas.addEventListener('pointerenter', updateTargetFromEvent)
canvas.addEventListener('pointerleave', () => {
  if (idleTimeout) clearTimeout(idleTimeout)
  isIdleTracking = true
})

loader.load('cat.glb', (gltf) => {
  cat = gltf.scene
  cat.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        mesh.material = matcapMaterial
      }
    }
  })
  scene.add(cat)
  if (cat) { cat.rotation.set(0, 0, 0) }
})

// Resize handling – respects the existing canvas size in layout
function onResize() {
  if (!canvas) return
  const width = canvas.clientWidth || window.innerWidth
  const height = canvas.clientHeight || window.innerHeight
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
}

function updateIdleTargetTowardSphere() {
  if (!cat) return
  cat.getWorldPosition(_tmpCat)
  sphere.getWorldPosition(_tmpSphere)
  const dx = _tmpSphere.x - _tmpCat.x
  const dy = _tmpSphere.y - _tmpCat.y
  const dz = _tmpSphere.z - _tmpCat.z
  // yaw around Y: angle in XZ plane, facing +Z
  const yaw = Math.atan2(dx, dz)
  // pitch around X: angle up/down relative to horizontal distance
  const horiz = Math.hypot(dx, dz)
  const pitch = Math.atan2(dy, horiz)
  // direct fixation on the sphere (no clamping)
  targetYaw = yaw
  targetPitch = -pitch
}

// Animation loop
let raf = 0
function tick() {
  onResize()
  if (isIdleTracking) {
    updateIdleTargetTowardSphere()
  }
  if (cat) {
    cat.rotation.y += (targetYaw - cat.rotation.y) * ROTATE_LERP
    cat.rotation.x += (targetPitch - cat.rotation.x) * ROTATE_LERP
  }
  trackOffsetX += pingPongDir * PINGPONG_SPEED
  if (trackOffsetX > PINGPONG_LIMIT || trackOffsetX < -PINGPONG_LIMIT) {
    pingPongDir *= -1
    trackOffsetX = Math.max(-PINGPONG_LIMIT, Math.min(PINGPONG_LIMIT, trackOffsetX))
  }
  if (isIdleTracking) {
    sphereTarget.set(trackOffsetX, SPHERE_BASE_Y, SPHERE_PLANE_Z)
  }
  sphere.position.lerp(sphereTarget, SPHERE_LERP)
  renderer.render(scene, camera)
  raf = requestAnimationFrame(tick)
}

tick()

// Hot Module Replacement / cleanup (so dev server restarts cleanly)
if (import.meta && (import.meta as any).hot) {
  (import.meta as any).hot.dispose(() => {
    cancelAnimationFrame(raf)
    renderer.dispose()
    // three.js cleans up scene graph automatically when GC'd
  })
}
