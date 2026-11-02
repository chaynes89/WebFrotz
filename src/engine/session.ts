import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { emptyMap, type FromEngine, type InputRequest, type ToEngine } from './protocol'
import { validateStory } from './story'
import { desktop, exportTranscript, persistMap, restoreGame, saveGame, type DesktopStory } from '../desktop'
import { validatePersistedMap } from './persistedMap'
import type { MapSnapshot } from './protocol'
import {
  forgetStory, getProgress, getStory, listLibrary, lockStory, putCheckpoint, putStory, storageMessage,
  storyIdentity, trimTranscript, type LibraryEntry, type ProgressRecord, type ProgressSlot,
} from './browserLibrary'

export interface AutosaveStatus {
  state: 'off' | 'waiting' | 'stored' | 'paused' | 'failed' | 'unavailable'
  at?: number
  detail?: string
}
interface BrowserStory { id: string; name: string; version: number; data: ArrayBuffer; problem: string }
export interface Recovery { name: string; current: ProgressSlot; previous?: ProgressSlot }
const newRun = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

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
  const library = ref<LibraryEntry[]>([])
  const libraryError = ref('')
  const recovery = shallowRef<Recovery>()
  const autosave = ref<AutosaveStatus>({ state: 'off' })
  let pendingStory: BrowserStory | undefined
  let autosaveTarget = ''
  let runId = ''
  let heldLock: { id: string; ready: Promise<{ granted: boolean; release: () => void }> } | undefined

  function releaseLock() {
    const lock = heldLock
    heldLock = undefined
    if (lock) void writes.finally(() => lock.ready.then(held => held.release()))
  }
  function ensureLock(id: string) {
    if (heldLock?.id === id) return heldLock.ready
    releaseLock()
    const ready = lockStory(id)
    heldLock = { id, ready }
    return ready
  }

  async function refreshLibrary() {
    if (desktop) return
    try {
      library.value = await listLibrary()
    } catch (cause) { libraryError.value = `Browser library unavailable: ${storageMessage(cause)}.` }
  }

  function queueCheckpoint(id: string, slot: ProgressSlot, activeGeneration: number, firstOfRun: boolean, base?: number) {
    const lock = ensureLock(id)
    writes = writes.then(async () => {
      if (!(await lock).granted) return
      await putCheckpoint(id, slot, base)
      if (generation === activeGeneration) autosave.value = { state: 'stored', at: slot.savedAt }
      if (firstOfRun) await refreshLibrary()
      else library.value = library.value.map(entry => entry.id === id ? { ...entry, progressAt: slot.savedAt } : entry)
    }).catch(cause => {
      const detail = storageMessage(cause)
      if (generation === activeGeneration) {
        autosave.value = { state: 'failed', detail }
        error.value = `Autosave failed: ${detail}. Recent progress is not stored in this browser; use Save to export a file.`
      }
    })
  }

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

  function launch(savedMap?: MapSnapshot, resume?: ProgressSlot) {
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
    const target = desktop ? '' : autosaveTarget
    let initialized = false
    let firstOfRun = true
    if (target && autosave.value.state !== 'paused') autosave.value = { state: 'waiting' }
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
            if (initialized) { runId = newRun(); firstOfRun = true }
            initialized = true
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
        case 'checkpoint':
          if (!target) break
          queueCheckpoint(target, {
            format: 1, runId, savedAt: Date.now(), data: message.data,
            textBuffer: message.textBuffer, tokenBuffer: message.tokenBuffer,
            transcript: trimTranscript(transcript.value), status: status.value, upper: upper.value,
            map: version.value === 5 ? null : map.value,
          }, activeGeneration, firstOfRun, firstOfRun && resume?.runId === runId ? resume.savedAt : undefined)
          firstOfRun = false
          break
        case 'checkpoint-failed':
          if (!target) break
          autosave.value = { state: 'failed', detail: 'the interpreter could not create a checkpoint' }
          error.value = 'Autosave failed: the interpreter could not create a checkpoint. Use Save to export a file.'
          break
        case 'resumed':
          initialized = true
          transcript.value = `${resume?.transcript ?? ''}\n[Autosave resumed / stored ${new Date(resume?.savedAt ?? 0).toLocaleString()}]\n`
          if (version.value === 5) upper.value = resume?.upper ?? ''
          notice.value = 'Autosave resumed. Undo history starts from this turn.'
          break
        case 'warning': notice.value = message.message; break
        case 'error': error.value = message.message; state.value = 'error'; request.value = undefined; break
        case 'ended': state.value = 'ended'; request.value = undefined; break
      }
    }
    post({
      type: 'start', story: storyData.value!.slice(0), wasmBase: new URL(`${import.meta.env.BASE_URL}wasm/`, location.origin).href,
      map: savedMap, autosave: Boolean(target),
      resume: resume && { data: resume.data.slice().buffer, textBuffer: resume.textBuffer, tokenBuffer: resume.tokenBuffer, status: resume.status, upper: resume.upper },
    })
  }

  async function browserEntry(data: ArrayBuffer, name: string, v: number): Promise<{ story: BrowserStory; record?: ProgressRecord }> {
    const story: BrowserStory = { id: '', name, version: v, data, problem: '' }
    try { story.id = await storyIdentity(data) } catch (cause) {
      story.problem = `Autosave unavailable: ${storageMessage(cause)}.`
      return { story }
    }
    let record: ProgressRecord | undefined
    await writes
    try { record = await getProgress(story.id) } catch (cause) {
      story.problem = `Autosave disabled: stored progress could not be read (${storageMessage(cause)}). It was left unchanged.`
    }
    return { story, record }
  }

  async function begin(story: BrowserStory, record?: ProgressRecord) {
    if (record?.current) {
      pendingStory = story
      recovery.value = { name: story.name, current: record.current, previous: record.previous }
      return
    }
    start(story)
  }

  function start(story: BrowserStory, slot?: ProgressSlot) {
    recovery.value = undefined
    pendingStory = undefined
    if (storyId.value !== story.id) releaseLock()
    storyData.value = story.data
    storyName.value = story.name
    version.value = story.version
    storyId.value = story.id
    hasLocalSave.value = false
    runId = slot?.runId ?? newRun()
    autosaveTarget = story.id && !story.problem ? story.id : ''
    autosave.value = autosaveTarget ? { state: 'waiting' } : { state: 'unavailable', detail: story.problem }
    if (autosaveTarget) {
      const activeStory = story.id
      void ensureLock(activeStory).then(lock => {
        if (!lock.granted && storyId.value === activeStory) {
          autosave.value = { state: 'paused', detail: 'this story is open in another WebFrotz tab' }
          notice.value = 'This story is already open in another tab. Autosave is paused here so neither tab overwrites the other.'
        }
      })
    }
    launch(slot?.map ?? undefined, slot)
    if (story.problem) error.value = story.problem
  }

  function resolveRecovery(choice: 'current' | 'previous' | 'new' | 'cancel') {
    const story = pendingStory
    const offered = recovery.value
    if (!story || !offered) return
    if (choice === 'cancel') {
      recovery.value = undefined
      pendingStory = undefined
      return
    }
    start(story, choice === 'current' ? offered.current : choice === 'previous' ? offered.previous : undefined)
  }

  async function openStored(id: string) {
    const activeSelection = ++selection
    try {
      const stored = await getStory(id)
      const v = validateStory(stored.data)
      const { story, record } = await browserEntry(stored.data, stored.name, v)
      if (selection !== activeSelection) return false
      try {
        await putStory({ ...stored, openedAt: Date.now() })
        libraryError.value = ''
      } catch (cause) { libraryError.value = `Could not update library order (${storageMessage(cause)}).` }
      await begin(story, record)
      void refreshLibrary()
      return true
    } catch (cause) {
      if (selection === activeSelection) error.value = `Cannot open stored story: ${cause instanceof Error ? cause.message : String(cause)}`
      return false
    }
  }

  async function forget(id: string) {
    if (storyId.value === id) unload()
    await writes
    await forgetStory(id)
    await refreshLibrary()
  }

  function unload() {
    stop()
    releaseLock()
    recovery.value = undefined
    pendingStory = undefined
    autosaveTarget = ''
    autosave.value = { state: 'off' }
    storyData.value = undefined
    storyName.value = ''
    storyId.value = ''
    version.value = 0
    hasLocalSave.value = false
    map.value = emptyMap()
    transcript.value = ''
    status.value = ''
    upper.value = ''
  }

  async function load(file: File) {
    const activeSelection = ++selection
    try {
      if (file.size > 256 * 1024) throw new Error('Supported stories must be at most 256 KiB.')
      const data = await file.arrayBuffer()
      if (selection !== activeSelection) return false
      const v = validateStory(data)
      if (!desktop) {
        const { story, record } = await browserEntry(data, file.name, v)
        if (selection !== activeSelection) return false
        if (story.id) {
          const now = Date.now()
          try {
            await putStory({ id: story.id, name: file.name, version: v, data: data.slice(0), addedAt: now, openedAt: now })
            libraryError.value = ''
          } catch (cause) {
            libraryError.value = `Story was not stored in this browser (${storageMessage(cause)}); choose the file again next time.`
          }
          void refreshLibrary()
        }
        await begin(story, record)
        return true
      }
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

  onBeforeUnmount(() => { stop(); releaseLock() })
  return {
    map, transcript, status, upper, request, state, error, notice, storyName, version, storyData,
    storyId, hasLocalSave, nativeBusy, loadDesktop, restoreDesktop, exportText,
    library, libraryError, recovery, autosave, refreshLibrary, resolveRecovery, openStored, forget,
    flushPersistence: async () => {
      await writes
      if (persistenceError) throw new Error(persistenceError)
    },
    unload,
    load, stop, submit, restore, restart: () => {
      if (storyData.value) {
        if (desktop && storyId.value) queueMap(storyId.value, emptyMap())
        runId = newRun()
        launch()
      }
    },
    canCommand: computed(() => request.value?.kind === 'line'),
  }
}
