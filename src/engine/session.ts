import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { emptyMap, type FromEngine, type InputRequest, type ToEngine } from './protocol'
import { validateStory } from './story'
import { desktop, exportTranscript, persistMap, restoreGame, saveGame, type DesktopStory } from '../desktop'
import { validatePersistedMap } from './persistedMap'
import type { MapSnapshot } from './protocol'

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
  const storyId = ref('')
  const hasLocalSave = ref(false)
  const nativeBusy = ref(false)
  let writes = Promise.resolve()
  let persistenceError = ''
  let worker: Worker | undefined
  const storyData = shallowRef<ArrayBuffer>()
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

  function queueMap(id: string, snapshot: MapSnapshot) {
    writes = writes.then(async () => {
      await persistMap(id, snapshot)
      persistenceError = ''
    }).catch(cause => {
      persistenceError = `Map could not be stored: ${String(cause)}`
      error.value = persistenceError
    })
  }

  function launch(savedMap?: MapSnapshot) {
    stop()
    map.value = emptyMap()
    transcript.value = ''
    status.value = ''
    upper.value = ''
    error.value = ''
    notice.value = ''
    state.value = 'loading'
    const activeGeneration = generation
    const activeStory = storyId.value
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
        case 'map':
          map.value = message.map
          if (desktop && activeStory) queueMap(activeStory, message.map)
          break
        case 'input': request.value = message.request; state.value = 'running'; break
        case 'state':
          if (message.reason === 1) {
            transcript.value += version.value === 5 ?
              '\n[Session initialized / V5 text mode]\n' : savedMap?.rooms.length ?
                '\n[Session initialized / local discoveries loaded]\n' : '\n[Session initialized / discoveries reset]\n'
            savedMap = undefined
          }
          else notice.value = (message.reason === 2 ? 'Game restored.' : 'Turn undone.') +
            (version.value === 5 ? '' : ' Discoveries retained.')
          break
        case 'save':
          if (desktop) {
            nativeBusy.value = true
            void saveGame(activeStory, message.data).then(saved => {
              if (generation !== activeGeneration) return
              hasLocalSave.value ||= saved
              notice.value = saved ? 'Save file written locally.' : 'Save export cancelled; no file written.'
            }).catch(cause => { error.value = `Save failed: ${String(cause)}` })
              .finally(() => { nativeBusy.value = false })
          } else {
            download(new Uint8Array(message.data), `${storyName.value}.qzl`, 'application/octet-stream')
            notice.value = 'Save file exported. Keep it with this story.'
          }
          break
        case 'warning': notice.value = message.message; break
        case 'error': error.value = message.message; state.value = 'error'; request.value = undefined; break
        case 'ended': state.value = 'ended'; request.value = undefined; break
      }
    }
    post({ type: 'start', story: storyData.value!.slice(0), wasmBase: new URL(`${import.meta.env.BASE_URL}wasm/`, location.origin).href, map: savedMap })
  }

  async function load(file: File) {
    const activeSelection = ++selection
    try {
      if (file.size > 256 * 1024) throw new Error('Supported stories must be at most 256 KiB.')
      const data = await file.arrayBuffer()
      if (selection !== activeSelection) return false
      const v = validateStory(data)
      storyData.value = data
      storyName.value = file.name
      version.value = v
      storyId.value = ''
      hasLocalSave.value = false
      launch()
      return true
    } catch (cause) {
      if (selection === activeSelection) error.value = cause instanceof Error ? cause.message : String(cause)
      return false
    }
  }

  function loadDesktop(story: DesktopStory) {
    try {
      const data = new Uint8Array(story.data).buffer
      const v = validateStory(data)
      const savedSource = story.id === storyId.value && state.value !== 'loading' ? map.value : story.map
      const saved = savedSource === null ? undefined : validatePersistedMap(savedSource)
      storyData.value = data
      storyName.value = story.name
      version.value = v
      storyId.value = story.id
      hasLocalSave.value = story.hasSave
      launch(v === 5 ? undefined : saved)
      if (saved?.rooms.length) notice.value = 'Local discoveries loaded. Game starts fresh; restore a save to resume progress.'
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
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

  async function restoreDesktop(latest = false) {
    const active = request.value
    if (active?.kind !== 'restore' || nativeBusy.value) return
    nativeBusy.value = true
    try {
      const bytes = await restoreGame(storyId.value, latest)
      if (request.value !== active) return
      post({ type: 'restore', id: active.id, data: bytes === null ? null : new Uint8Array(bytes).buffer })
      request.value = undefined
    } catch (cause) { error.value = `Restore failed: ${String(cause)}` }
    finally { nativeBusy.value = false }
  }

  async function exportText() {
    if (!desktop) return download(transcript.value, 'webfrotz-transcript.txt', 'text/plain')
    nativeBusy.value = true
    try {
      const saved = await exportTranscript(transcript.value)
      notice.value = saved ? 'Transcript exported locally.' : 'Transcript export cancelled.'
    } catch (cause) { error.value = `Transcript export failed: ${String(cause)}` }
    finally { nativeBusy.value = false }
  }

  onBeforeUnmount(stop)
  return {
    map, transcript, status, upper, request, state, error, notice, storyName, version, storyData,
    storyId, hasLocalSave, nativeBusy, loadDesktop, restoreDesktop, exportText,
    flushPersistence: async () => {
      await writes
      if (persistenceError) throw new Error(persistenceError)
    },
    unload: () => {
      stop()
      storyData.value = undefined
      storyName.value = ''
      storyId.value = ''
      version.value = 0
      hasLocalSave.value = false
      map.value = emptyMap()
      transcript.value = ''
      status.value = ''
      upper.value = ''
    },
    load, stop, submit, restore, restart: () => {
      if (storyData.value) {
        if (desktop && storyId.value) queueMap(storyId.value, emptyMap())
        launch()
      }
    },
    canCommand: computed(() => request.value?.kind === 'line'),
  }
}
