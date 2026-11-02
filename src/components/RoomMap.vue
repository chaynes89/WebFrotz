<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { MapRoom, MapSnapshot } from '../engine/protocol'

const props = defineProps<{ map: MapSnapshot; expanded: boolean; supported: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const surface = ref<HTMLDivElement>()
const failure = ref('')
const current = computed(() => props.supported ? props.map.rooms[props.map.current]?.label || 'Awaiting location' : 'Mapping unavailable')
let renderer: THREE.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let observer: ResizeObserver | undefined
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
const rooms = new THREE.Group()
scene.add(rooms)

function render() { renderer?.render(scene, camera) }
function position(room: MapRoom) { return new THREE.Vector3(room.x * 3, room.z * 2, room.y * 3) }
function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      if ('geometry' in object) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose()
        material.dispose()
      }
    }
  })
  group.clear()
}

function label(text: string, active: boolean) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Map labels require a canvas context.')
  const font = '18px monospace'
  context.font = font
  const width = Math.ceil(context.measureText(text).width) + 20
  const height = 32
  const resolution = 2
  canvas.width = width * resolution
  canvas.height = height * resolution
  context.scale(resolution, resolution)
  context.fillStyle = '#101b15'
  context.fillRect(0, 0, width, height)
  context.strokeStyle = active ? '#eec381' : '#426b48'
  context.strokeRect(0.5, 0.5, width - 1, height - 1)
  context.fillStyle = active ? '#f4d7a4' : '#b7eab2'
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, width / 2, height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
  sprite.scale.set(width * 0.008, height * 0.008, 1)
  return sprite
}

function rebuild() {
  if (!renderer) return
  try {
    disposeGroup(rooms)
    for (const connection of props.map.connections) {
      const from = props.map.rooms[connection.from], to = props.map.rooms[connection.to]
      if (!from || !to) continue
      const geometry = new THREE.BufferGeometry().setFromPoints([position(from), position(to)])
      const material = connection.inferred
        ? new THREE.LineDashedMaterial({ color: '#91a38a', dashSize: 0.2, gapSize: 0.15 })
        : new THREE.LineBasicMaterial({ color: connection.vertical ? '#e6b579' : '#6bcb74' })
      const line = new THREE.Line(geometry, material)
      line.computeLineDistances()
      rooms.add(line)
    }
    props.map.rooms.forEach((room, index) => {
      const active = index === props.map.current
      const node = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.22, 0.62),
        new THREE.MeshBasicMaterial({ color: active ? '#eec381' : '#8adc88', wireframe: !active }),
      )
      node.position.copy(position(room))
      const caption = label(room.label, active)
      caption.position.copy(node.position).add(new THREE.Vector3(0, 0.45, 0))
      rooms.add(node, caption)
    })
    render()
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

function resetView() {
  if (!controls) return
  const bounds = new THREE.Box3()
  for (const room of props.map.rooms) bounds.expandByPoint(position(room))
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3())
  const span = bounds.isEmpty() ? 6 : Math.max(6, bounds.getSize(new THREE.Vector3()).length())
  controls.target.copy(center)
  camera.position.copy(center).add(new THREE.Vector3(span * 0.65, span, span * 1.2))
  controls.update()
  render()
}
function zoom(factor: number) {
  if (!controls) return
  const offset = camera.position.clone().sub(controls.target)
  const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)
  camera.position.copy(controls.target).add(offset.setLength(distance))
  controls.update()
  render()
}
function rotate(angle: number) {
  if (!controls) return
  camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target)
  controls.update()
  render()
}
function contextLost(event: Event) {
  event.preventDefault()
  failure.value = 'Map graphics context was lost. Room list remains available; reload to restore graphics.'
}
function preventMenu(event: Event) { event.preventDefault() }

onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor('#0c1610', 1)
    renderer.domElement.tabIndex = 0
    renderer.domElement.setAttribute('aria-label', 'Three-dimensional room map. Arrow keys pan; use buttons to rotate and zoom.')
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    renderer.domElement.addEventListener('contextmenu', preventMenu)
    surface.value!.appendChild(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.minDistance = 2
    controls.maxDistance = 500
    controls.listenToKeyEvents(renderer.domElement)
    controls.addEventListener('change', render)
    scene.add(new THREE.GridHelper(90, 30, '#42603f', '#233427'))
    observer = new ResizeObserver(() => {
      const width = surface.value!.clientWidth, height = surface.value!.clientHeight
      if (width && height) {
        renderer!.setSize(width, height)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        render()
      }
    })
    observer.observe(surface.value!)
    rebuild()
    resetView()
  } catch (error) {
    failure.value = `3D map unavailable: ${error instanceof Error ? error.message : String(error)}. Use the room list below.`
  }
})
watch(() => props.map, (next, previous) => {
  rebuild()
  if (previous.rooms.length === 0 || next.rooms.length === 0) resetView()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  controls?.dispose()
  disposeGroup(rooms)
  scene.traverse(object => {
    if (object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => material.dispose())
    }
  })
  renderer?.domElement.removeEventListener('webglcontextlost', contextLost)
  renderer?.dispose()
})
</script>

<template>
  <section class="map-panel" aria-label="Navigation map" :class="{ expanded }">
    <header class="panel-heading">
      <span><span class="led" /> NAVIGATION / {{ String(map.rooms.length).padStart(3, '0') }} NODES</span>
      <button @click="emit('toggle')" :aria-expanded="expanded" title="Ctrl+M">
        {{ expanded ? 'Dock map' : 'Expand map' }} <kbd>⌃ M</kbd>
      </button>
    </header>
    <div class="map-display">
      <div ref="surface" class="map-surface" :class="{ unavailable: failure }" />
      <div v-if="!map.rooms.length && !failure" class="map-empty">
        <span class="crosshair">+</span>
        <strong>{{ supported ? 'NO TERRAIN ACQUIRED' : 'V5 / NO ROOM TELEMETRY' }}</strong>
        <span>{{ supported ? 'Room telemetry arrives as you explore.' : 'Automatic mapping is supported for V1-V3 only.' }}</span>
      </div>
      <p v-if="failure" class="map-failure" role="status">{{ failure }}</p>
      <div class="map-coordinate" aria-hidden="true">LOCAL GRID / X · Y · Z<br />PASSIVE SURVEY</div>
    </div>
    <div class="map-instruments">
      <span class="current-location">{{ current }}</span>
      <div class="map-buttons">
        <button @click="rotate(-0.3)" :disabled="!!failure" aria-label="Rotate map left">↶</button>
        <button @click="rotate(0.3)" :disabled="!!failure" aria-label="Rotate map right">↷</button>
        <button @click="zoom(0.8)" :disabled="!!failure" aria-label="Zoom map in">+</button>
        <button @click="zoom(1.25)" :disabled="!!failure" aria-label="Zoom map out">−</button>
        <button @click="resetView" :disabled="!!failure">Center</button>
      </div>
    </div>
    <details class="map-directory">
      <summary>Room directory / {{ map.connections.length }} links <span>Drag: rotate · right-drag: pan · wheel: zoom</span></summary>
      <p v-if="!map.rooms.length">No rooms discovered.</p>
      <ul v-else>
        <li v-for="(room, index) in map.rooms" :key="room.object" :aria-current="index === map.current ? 'location' : undefined">
          {{ index === map.current ? '▶ ' : '' }}{{ room.label }} / {{ room.x }}, {{ room.y }}, {{ room.z }}
        </li>
      </ul>
      <p>Solid: recognized movement. Dashed: inferred traversal. Amber: current node / vertical link.</p>
    </details>
  </section>
</template>
