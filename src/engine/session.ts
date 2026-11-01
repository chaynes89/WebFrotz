import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { emptyMap, type FromEngine, type InputRequest, type ToEngine } from './protocol'
import { validateStory } from './story'

export function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useSession() {
  const map = shallowRef(emptyMap())
  const transcript = ref('')
  const status = ref('')
  const upper = ref('')
  const request = shallowRef<InputRequest>()
  const state = ref<'offline' | 'loading' | 'running' | 'ended' | 'error'>('offline')
  const error = ref('')
  const notice = ref('')
  const storyName = ref('')
  const version = ref(0)
  let worker: Worker | undefined
  let story: ArrayBuffer | undefined
  let generation = 0
  let selection = 0

  function post(message: ToEngine) { worker?.postMessage(message) }
  function stop() {
    generation++
    selection++
    worker?.terminate()
    worker = undefined
    request.value = undefined
    state.value = 'offline'
  }

  function launch() {
    stop()
    map.value = emptyMap()
    transcript.value = ''
    status.value = ''
    upper.value = ''
    error.value = ''
    notice.value = ''
    state.value = 'loading'
    const activeGeneration = generation
    worker = new Worker(new URL('./frotz.worker.ts', import.meta.url), { type: 'module' })
    worker.onerror = event => {
      if (generation !== activeGeneration) return
      error.value = event.message || 'Interpreter worker failed to load.'
      state.value = 'error'
      request.value = undefined
    }
    worker.onmessage = (event: MessageEvent<FromEngine>) => {
      if (generation !== activeGeneration) return
      const message = event.data
      switch (message.type) {
        case 'output': transcript.value += message.text; break
        case 'screen': status.value = message.status; upper.value = message.upper; break
        case 'map': map.value = message.map; break
        case 'input': request.value = message.request; state.value = 'running'; break
        case 'state':
          if (message.reason === 1) transcript.value += '\n[Session initialized / discoveries reset]\n'
          else notice.value = message.reason === 2 ? 'Game restored. Discoveries retained.' : 'Turn undone. Discoveries retained.'
          break
        case 'save':
          download(new Uint8Array(message.data), `${storyName.value}.qzl`, 'application/octet-stream')
          notice.value = 'Save file exported. Keep it with this story.'
          break
        case 'warning': notice.value = message.message; break
        case 'error': error.value = message.message; state.value = 'error'; request.value = undefined; break
        case 'ended': state.value = 'ended'; request.value = undefined; break
      }
    }
    post({ type: 'start', story: story!.slice(0), wasmBase: new URL(`${import.meta.env.BASE_URL}wasm/`, location.origin).href })
  }

  async function load(file: File) {
    const activeSelection = ++selection
    try {
      if (file.size > 128 * 1024) throw new Error('V1-V3 stories must be at most 128 KiB.')
      const data = await file.arrayBuffer()
      if (selection !== activeSelection) return false
      const v = validateStory(data)
      story = data
      storyName.value = file.name
      version.value = v
      launch()
      return true
    } catch (cause) {
      if (selection === activeSelection) error.value = cause instanceof Error ? cause.message : String(cause)
      return false
    }
  }

  function submit(text: string, key = 13) {
    const active = request.value
    if (!active || active.kind === 'restore') return
    post({ type: 'input', id: active.id, text, key })
    request.value = undefined
  }

  async function restore(file: File | null) {
    const active = request.value
    if (active?.kind !== 'restore') return
    try {
      if (file && file.size > 8 * 1024 * 1024) throw new Error('Restore files must be at most 8 MiB.')
      const data = file ? await file.arrayBuffer() : null
      if (request.value !== active) return
      post({ type: 'restore', id: active.id, data })
      request.value = undefined
    } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  }

  onBeforeUnmount(stop)
  return {
    map, transcript, status, upper, request, state, error, notice, storyName, version,
    load, stop, submit, restore, restart: () => { if (story) launch() },
    canCommand: computed(() => request.value?.kind === 'line'),
  }
}
