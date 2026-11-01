<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RoomMap from './components/RoomMap.vue'
import CommandHelp from './components/CommandHelp.vue'
import { useSession } from './engine/session'
import { desktop, forgetLibrary, openRecent, pickStory, recentStories, type RecentStory } from './desktop'
import { version as appVersion } from '../package.json'

const session = useSession()
const { map, transcript, status, upper, request, state, error, notice, storyName, version, storyData, canCommand } = session
const { hasLocalSave, nativeBusy } = session
const recents = ref<RecentStory[]>([])
const choosing = ref(false)
const clearing = ref(false)
const clearDialog = ref<HTMLDialogElement>()
const closing = ref(false)
const closeDialog = ref<HTMLDialogElement>()
const closeFailure = ref('')
const licenseOpen = ref(false)
const licenseDialog = ref<HTMLDialogElement>()
const licenseText = ref('')
let unlistenClose: (() => void) | undefined
const helpOpen = ref(false)
const expanded = ref(false)
const command = ref('')
const input = ref<HTMLInputElement>()
const transcriptPanel = ref<HTMLDivElement>()
const storyPicker = ref<HTMLInputElement>()
const restorePicker = ref<HTMLInputElement>()
const restarting = ref(false)
const restartDialog = ref<HTMLDialogElement>()
const history: string[] = []
let historyIndex = 0
const room = computed(() => version.value === 5 ? 'V5 / no room telemetry' : map.value.rooms[map.value.current]?.label || 'No position fix')
const online = computed(() => state.value === 'running' || state.value === 'loading')
const phase = computed(() => request.value?.kind === 'restore' ? 'AWAITING SAVE FILE' :
  request.value ? 'AWAITING INPUT' : state.value.toUpperCase())

function keyboard(event: KeyboardEvent) {
  if (helpOpen.value || restarting.value || clearing.value || closing.value || licenseOpen.value || nativeBusy.value || choosing.value) return
  if (event.ctrlKey && event.key.toLowerCase() === 'm') {
    event.preventDefault()
    expanded.value = !expanded.value
  }
  if (event.key === 'Escape') expanded.value = false
}
function inputKeyboard(event: KeyboardEvent) {
  if (nativeBusy.value || choosing.value) return
  if (canCommand.value && event.altKey && ['n', 'u'].includes(event.key.toLowerCase())) {
    event.preventDefault()
    session.submit('', event.key.toLowerCase() === 'n' ? 18 : 17)
  } else if (request.value?.kind === 'key' && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    session.submit('', event.key.charCodeAt(0))
    command.value = ''
  } else if (canCommand.value && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)))
    command.value = history[historyIndex] || ''
  }
}
function submit() {
  if (!request.value || request.value.kind === 'restore' || nativeBusy.value || choosing.value) return
  if (request.value.kind === 'key') {
    session.submit('', command.value ? command.value.charCodeAt(0) : 13)
  } else {
    const text = command.value.slice(0, request.value.max)
    history.push(text)
    historyIndex = history.length
    session.submit(text)
  }
  command.value = ''
}
async function selected(event: Event, restoring: boolean) {
  const picker = event.target as HTMLInputElement
  const file = picker.files?.[0]
  if (file) {
    if (restoring) await session.restore(file)
    else {
      if (await session.load(file)) {
        history.length = 0
        historyIndex = 0
        command.value = ''
      }
    }
  }
  picker.value = ''
}
async function loadNative(id?: string) {
  if (choosing.value || nativeBusy.value) return
  choosing.value = true
  try {
    await session.flushPersistence()
    const story = id ? await openRecent(id) : await pickStory()
    if (story && session.loadDesktop(story)) {
      history.length = 0
      historyIndex = 0
      command.value = ''
      recents.value = await recentStories()
    }
  } catch (cause) { error.value = `Cannot open story: ${String(cause)}` }
  finally { choosing.value = false }
}
async function clearLocal() {
  try {
    await session.flushPersistence()
    await forgetLibrary()
    session.unload()
    recents.value = []
    notice.value = 'Local recent paths and maps cleared. Your story and save files were not deleted.'
    clearing.value = false
  } catch (cause) { error.value = `Cannot clear local history: ${String(cause)}` }
}
async function closeApp() {
  try {
    await session.flushPersistence()
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().destroy()
  } catch (cause) { closeFailure.value = `Cannot finish storing discoveries: ${String(cause)}` }
}
async function closeWithoutMap() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().destroy()
  } catch (cause) { closeFailure.value = `Cannot close desktop window: ${String(cause)}` }
}
async function showLicense() {
  try {
    const files = import.meta.env.PROD ? ['COPYING.txt', 'SOURCE.txt', 'DEPENDENCIES.md'] : ['COPYING.txt']
    licenseText.value = (await Promise.all(files.map(async file => {
      const response = await fetch(`${import.meta.env.BASE_URL}${file}`)
      if (!response.ok) throw new Error(`Cannot read bundled ${file}: ${response.status}`)
      return response.text()
    }))).join('\n\n')
    licenseOpen.value = true
    await nextTick()
    licenseDialog.value?.showModal()
  } catch (cause) { error.value = `Cannot open license notices: ${String(cause)}` }
}
function restart() {
  session.restart()
  restarting.value = false
  history.length = 0
  historyIndex = 0
  command.value = ''
}
watch(request, async active => {
  if (active && active.kind !== 'restore' && !helpOpen.value) {
    await nextTick()
    input.value?.focus()
  }
})
watch([nativeBusy, choosing], async ([busy, picking]) => {
  if (!busy && !picking && request.value && request.value.kind !== 'restore' && !helpOpen.value) {
    await nextTick()
    input.value?.focus()
  }
})
watch(restarting, async active => {
  await nextTick()
  if (active) restartDialog.value?.showModal()
  else restartDialog.value?.close()
})
watch(clearing, async active => {
  await nextTick()
  if (active) clearDialog.value?.showModal()
  else clearDialog.value?.close()
})
watch(closing, async active => {
  await nextTick()
  if (active) closeDialog.value?.showModal()
  else closeDialog.value?.close()
})
watch(transcript, async (_, old) => {
  const panel = transcriptPanel.value
  if (!panel) return
  const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100 || !old
  await nextTick()
  if (nearBottom) panel.scrollTop = panel.scrollHeight
})
onMounted(async () => {
  window.addEventListener('keydown', keyboard)
  if (desktop) {
    try {
      recents.value = await recentStories()
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      unlistenClose = await getCurrentWindow().onCloseRequested(event => {
        event.preventDefault()
        if (!nativeBusy.value && !choosing.value) closing.value = true
        else notice.value = 'Finish the native file dialog before closing.'
      })
    } catch (cause) { error.value = `Desktop initialization failed: ${String(cause)}` }
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyboard)
  unlistenClose?.()
})
</script>

<template>
  <main class="hardware">
    <div class="screw top-left" aria-hidden="true" /><div class="screw top-right" aria-hidden="true" />
    <header class="hardware-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true">W/F</span><div><h1>WEBFROTZ</h1><p>DEEP-SPACE STORY TERMINAL</p></div></div>
      <div class="serial">PERSONAL EXPLORATION SYSTEM<br /><span>MODEL II / C · V{{ appVersion }}</span></div>
      <button class="help-button" @click="helpOpen = true">Help</button>
      <button class="load-button" :disabled="choosing || nativeBusy" @click="desktop ? loadNative() : storyPicker?.click()">Load story <span aria-hidden="true">↥</span></button>
      <input ref="storyPicker" type="file" accept=".z1,.z2,.z3,.z5" class="file-input" aria-label="Load story file" @change="selected($event, false)" />
    </header>

    <div class="console" :class="{ 'map-expanded': expanded }">
      <section class="briefing">
        <div class="panel-heading"><span><span class="led" :class="{ idle: !online }" /> SYSTEM / {{ phase }}</span><span>01</span></div>
        <div class="briefing-body">
          <p class="eyebrow">LONG-RANGE FICTION / LOCAL EXECUTION</p>
          <h2>Your next world.<br /><em>Waiting in the dark.</em></h2>
          <p class="intro">One story. An open channel. A map of everywhere you have been.</p>
          <div class="telemetry">
            <div><span>STORY CARTRIDGE</span><strong>{{ storyName || 'No story mounted' }}</strong></div>
            <div><span>POSITION FIX</span><strong>{{ room }}</strong></div>
            <div><span>ENGINE</span><strong>C / WEBASSEMBLY <small>{{ version ? `Z-MACHINE V${version}` : 'V1 — V3 / V5' }}</small></strong></div>
          </div>
          <div class="system-actions">
            <button @click="restarting = true" :disabled="!storyName || nativeBusy || choosing">Restart</button>
            <button @click="session.submit('save')" :disabled="!canCommand || nativeBusy || choosing">Save</button>
            <button @click="session.submit('restore')" :disabled="!canCommand || nativeBusy || choosing">Restore</button>
            <button @click="session.submit('', 17)" :disabled="!canCommand || nativeBusy || choosing">Undo</button>
            <button @click="session.stop" :disabled="!online || nativeBusy || choosing">Stop</button>
          </div>
          <p class="operation-note">Save / Restore send the story's own commands. {{ version === 5 ? 'V5 text mode: automatic mapping unavailable; undo requires story checkpoints.' : desktop ? 'Discoveries are stored locally per story, separately from game saves. Restart clears them.' : 'Discoveries stay in this session, not in your save file.' }} Alt+N / Alt+U: core restart / undo.</p>
          <details v-if="desktop" class="local-library">
            <summary>Local library / {{ recents.length }} recent stories</summary>
            <p class="operation-note">Opening starts a new game with retained discoveries. Restore a save to resume. No story copies or automatic game saves.</p>
            <button v-for="item in recents" :key="item.id" :title="item.path" :disabled="choosing || nativeBusy" @click="loadNative(item.id)">{{ item.name }}</button>
            <button :disabled="choosing || nativeBusy || !recents.length" @click="clearing = true">Clear local history and maps</button>
          </details>
          <div class="vent" aria-hidden="true"><i v-for="n in 12" :key="n" /></div>
        </div>
      </section>

      <RoomMap :map="map" :expanded="expanded" :supported="version !== 5" @toggle="expanded = !expanded" />

      <section class="transcript-panel" aria-label="Story terminal">
        <header class="panel-heading"><span><span class="led" :class="{ idle: !online }" /> STORY CHANNEL / {{ phase }}</span>
          <button @click="session.exportText" :disabled="!transcript || nativeBusy || choosing">Export transcript</button>
        </header>
        <div class="status-line" aria-label="Story status">{{ status || 'WEBFROTZ / INTERACTIVE FICTION LINK READY' }}</div>
        <pre v-if="upper" class="upper-window" aria-label="Story upper window">{{ upper }}</pre>
        <div ref="transcriptPanel" class="transcript" tabindex="0" role="log" aria-label="Story transcript" aria-live="polite" aria-relevant="additions text">
          <template v-if="!storyName">
            <p class="boot-line">FROTZ CORE ........ READY<br />PHOSPHOR DISPLAY ... ONLINE<br />NAVIGATION ........ STANDBY</p>
            <p>Mount a raw .z1, .z2, .z3 or .z5 story to begin.<br />Your story and commands stay on this device.</p>
            <p class="dim">No commercial stories are bundled. Use a story you are entitled to play.</p>
          </template>
          <pre v-else>{{ transcript }}</pre>
          <p v-if="state === 'ended'" class="dim">[Story ended. Restart or load another cartridge.]</p>
          <p v-if="state === 'offline' && storyName" class="dim">[Interpreter stopped. Restart to reconnect.]</p>
        </div>
        <div v-if="error" class="alert" role="alert">{{ error }} <button @click="error = ''" aria-label="Dismiss error">×</button></div>
        <div v-if="notice" class="notice" role="status">{{ notice }} <button @click="notice = ''" aria-label="Dismiss notice">×</button></div>
        <div v-if="request?.kind === 'restore'" class="restore-prompt" role="group" aria-label="Restore game">
          <span>SELECT A QUETZAL SAVE FILE</span>
          <button :disabled="nativeBusy || choosing" @click="desktop ? session.restoreDesktop() : restorePicker?.click()">Choose save file</button>
          <button v-if="desktop && hasLocalSave" :disabled="nativeBusy || choosing" @click="session.restoreDesktop(true)">Use last local save</button>
          <button :disabled="nativeBusy || choosing" @click="session.restore(null)">Cancel restore</button>
        </div>
        <input ref="restorePicker" type="file" accept=".qzl,.sav" class="file-input" aria-label="Restore save file" @change="selected($event, true)" />
        <form class="command-line" @submit.prevent="submit">
          <label for="command">{{ request?.kind === 'key' ? 'KEY' : 'CMD' }} <span aria-hidden="true">›</span></label>
          <input id="command" ref="input" v-model="command" :disabled="!request || request.kind === 'restore' || nativeBusy || choosing"
            :maxlength="request?.kind === 'key' ? 1 : request?.max || 255"
            :placeholder="request?.kind === 'key' ? 'Press a key to continue' : request ? 'Enter a command…' : 'Awaiting story channel…'"
            autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Story command" @keydown="inputKeyboard" />
          <button type="submit" :disabled="!request || request.kind === 'restore' || nativeBusy || choosing">Transmit <span aria-hidden="true">↵</span></button>
        </form>
      </section>
    </div>
    <footer class="hardware-footer">
      <span><span class="led" /> NO NETWORK REQUIRED DURING PLAY</span>
      <span>Frotz © Stefan Jokisch &amp; contributors · GPL-2.0-or-later · NO WARRANTY ·
        <button v-if="desktop" class="footer-link" @click="showLicense">License / source</button>
        <template v-else><a :href="`${importMetaBase}COPYING.txt`" target="_blank" rel="noopener">License</a> · <a href="https://github.com/chaynes89/WebFrotz" target="_blank" rel="noopener">Source</a></template>
      </span>
    </footer>
    <div class="screw bottom-left" aria-hidden="true" /><div class="screw bottom-right" aria-hidden="true" />
    <dialog ref="restartDialog" class="confirm-panel" aria-labelledby="restart-title" @cancel.prevent="restarting = false">
        <p class="eyebrow">SESSION RESET</p><h2 id="restart-title">Restart this story?</h2>
        <p>Unsaved progress, transcript and all map discoveries will be cleared.</p>
        <button @click="restarting = false" autofocus>Keep exploring</button>
        <button @click="restart">Restart story</button>
    </dialog>
    <CommandHelp :open="helpOpen" :story="storyData" :story-name="storyName" :version="version" @close="helpOpen = false" />
    <dialog v-if="desktop" ref="clearDialog" class="confirm-panel" aria-labelledby="clear-title" @cancel.prevent="clearing = false">
      <h2 id="clear-title">Clear local history and maps?</h2>
      <p>The current interpreter will stop. Recent paths, remembered save paths and discovered maps will be removed. Your story and save files remain untouched.</p>
      <button @click="clearing = false" autofocus>Keep exploring</button>
      <button @click="clearLocal">Clear local data</button>
    </dialog>
    <dialog v-if="desktop" ref="closeDialog" class="confirm-panel" aria-labelledby="close-title" @cancel.prevent="closing = false">
      <h2 id="close-title">Close WebFrotz?</h2>
      <p>Unsaved game progress and the transcript will be lost. Discovered maps are kept locally. Use Save before closing to keep game progress.</p>
      <p v-if="closeFailure" role="alert">{{ closeFailure }}</p>
      <button @click="closing = false" autofocus>Keep exploring</button>
      <button @click="closeApp">Close app</button>
      <button v-if="closeFailure" @click="closeWithoutMap">Close without saving discoveries</button>
    </dialog>
    <dialog v-if="desktop" ref="licenseDialog" class="confirm-panel help-panel" aria-labelledby="license-title" @cancel.prevent="licenseOpen = false; licenseDialog?.close()">
      <h2 id="license-title">License and corresponding source</h2>
      <button @click="licenseOpen = false; licenseDialog?.close()" autofocus>Close notices</button>
      <pre class="license-text">{{ licenseText }}</pre>
    </dialog>
  </main>
</template>

<script lang="ts">
const importMetaBase = import.meta.env.BASE_URL
</script>
