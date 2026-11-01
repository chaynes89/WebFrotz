<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RoomMap from './components/RoomMap.vue'
import CommandHelp from './components/CommandHelp.vue'
import { download, useSession } from './engine/session'
import { version as appVersion } from '../package.json'

const session = useSession()
const { map, transcript, status, upper, request, state, error, notice, storyName, version, storyData, canCommand } = session
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
  if (helpOpen.value || restarting.value) return
  if (event.ctrlKey && event.key.toLowerCase() === 'm') {
    event.preventDefault()
    expanded.value = !expanded.value
  }
  if (event.key === 'Escape') expanded.value = false
}
function inputKeyboard(event: KeyboardEvent) {
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
  if (!request.value || request.value.kind === 'restore') return
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
watch(restarting, async active => {
  await nextTick()
  if (active) restartDialog.value?.showModal()
  else restartDialog.value?.close()
})
watch(transcript, async (_, old) => {
  const panel = transcriptPanel.value
  if (!panel) return
  const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100 || !old
  await nextTick()
  if (nearBottom) panel.scrollTop = panel.scrollHeight
})
onMounted(() => window.addEventListener('keydown', keyboard))
onBeforeUnmount(() => window.removeEventListener('keydown', keyboard))
</script>

<template>
  <main class="hardware">
    <div class="screw top-left" aria-hidden="true" /><div class="screw top-right" aria-hidden="true" />
    <header class="hardware-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true">W/F</span><div><h1>WEBFROTZ</h1><p>DEEP-SPACE STORY TERMINAL</p></div></div>
      <div class="serial">PERSONAL EXPLORATION SYSTEM<br /><span>MODEL II / C · V{{ appVersion }}</span></div>
      <button class="help-button" @click="helpOpen = true">Help</button>
      <button class="load-button" @click="storyPicker?.click()">Load story <span aria-hidden="true">↥</span></button>
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
            <button @click="restarting = true" :disabled="!storyName">Restart</button>
            <button @click="session.submit('save')" :disabled="!canCommand">Save</button>
            <button @click="session.submit('restore')" :disabled="!canCommand">Restore</button>
            <button @click="session.submit('', 17)" :disabled="!canCommand">Undo</button>
            <button @click="session.stop" :disabled="!online">Stop</button>
          </div>
          <p class="operation-note">Save / Restore send the story's own commands. {{ version === 5 ? 'V5 text mode: automatic mapping unavailable; undo requires story checkpoints.' : 'Discoveries stay in this session, not in your save file.' }} Alt+N / Alt+U: core restart / undo.</p>
          <div class="vent" aria-hidden="true"><i v-for="n in 12" :key="n" /></div>
        </div>
      </section>

      <RoomMap :map="map" :expanded="expanded" :supported="version !== 5" @toggle="expanded = !expanded" />

      <section class="transcript-panel" aria-label="Story terminal">
        <header class="panel-heading"><span><span class="led" :class="{ idle: !online }" /> STORY CHANNEL / {{ phase }}</span>
          <button @click="download(transcript, 'webfrotz-transcript.txt', 'text/plain')" :disabled="!transcript">Export transcript</button>
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
          <button @click="restorePicker?.click()">Choose save file</button>
          <button @click="session.restore(null)">Cancel restore</button>
        </div>
        <input ref="restorePicker" type="file" accept=".qzl,.sav" class="file-input" aria-label="Restore save file" @change="selected($event, true)" />
        <form class="command-line" @submit.prevent="submit">
          <label for="command">{{ request?.kind === 'key' ? 'KEY' : 'CMD' }} <span aria-hidden="true">›</span></label>
          <input id="command" ref="input" v-model="command" :disabled="!request || request.kind === 'restore'"
            :maxlength="request?.kind === 'key' ? 1 : request?.max || 255"
            :placeholder="request?.kind === 'key' ? 'Press a key to continue' : request ? 'Enter a command…' : 'Awaiting story channel…'"
            autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Story command" @keydown="inputKeyboard" />
          <button type="submit" :disabled="!request || request.kind === 'restore'">Transmit <span aria-hidden="true">↵</span></button>
        </form>
      </section>
    </div>
    <footer class="hardware-footer">
      <span><span class="led" /> NO NETWORK REQUIRED DURING PLAY</span>
      <span>Frotz © Stefan Jokisch &amp; contributors · GPL-2.0-or-later · NO WARRANTY · <a :href="`${importMetaBase}COPYING.txt`" target="_blank" rel="noopener">License</a> · <a href="https://github.com/chaynes89/WebFrotz" target="_blank" rel="noopener">Source</a></span>
    </footer>
    <div class="screw bottom-left" aria-hidden="true" /><div class="screw bottom-right" aria-hidden="true" />
    <dialog ref="restartDialog" class="confirm-panel" aria-labelledby="restart-title" @cancel.prevent="restarting = false">
        <p class="eyebrow">SESSION RESET</p><h2 id="restart-title">Restart this story?</h2>
        <p>Unsaved progress, transcript and all map discoveries will be cleared.</p>
        <button @click="restarting = false" autofocus>Keep exploring</button>
        <button @click="restart">Restart story</button>
    </dialog>
    <CommandHelp :open="helpOpen" :story="storyData" :story-name="storyName" :version="version" @close="helpOpen = false" />
  </main>
</template>

<script lang="ts">
const importMetaBase = import.meta.env.BASE_URL
</script>
