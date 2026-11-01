<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { readVocabulary } from '../engine/vocabulary'

const props = defineProps<{ open: boolean; story?: ArrayBuffer; storyName: string; version: number }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const revealed = ref(false)
const words = ref<string[]>([])
const error = ref('')
const examples = [
  ['Explore', 'look · examine lamp · inventory (i)'],
  ['Move', 'north (n) · southwest (sw) · up · enter doorway'],
  ['Interact', 'take lamp · drop lamp · open door · unlock door with key'],
  ['Use objects', 'put coin in box · give coin to guard · turn on lamp'],
  ['Manage play', 'wait (z) · save · restore · restart'],
]
function reset() { revealed.value = false; words.value = []; error.value = '' }
function reveal() {
  if (!props.story) return
  revealed.value = true
  try { words.value = readVocabulary(props.story) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
watch(() => props.open, async open => {
  reset()
  await nextTick()
  if (open) dialog.value?.showModal()
  else dialog.value?.close()
})
watch(() => props.story, reset)
</script>

<template>
  <dialog ref="dialog" class="confirm-panel help-panel" aria-labelledby="help-title" @cancel.prevent="emit('close')">
    <header class="help-heading">
      <div><p class="eyebrow">OPERATOR REFERENCE</p><h2 id="help-title">Command help</h2></div>
      <button autofocus @click="emit('close')" aria-label="Close help">Close</button>
    </header>
    <p>Type a short phrase, then press Enter. These are common examples, not promises that this story accepts them. Replace object names with things described by the story.</p>
    <dl class="help-examples">
      <template v-for="[category, phrases] in examples" :key="category">
        <dt>{{ category }}</dt><dd>{{ phrases }}</dd>
      </template>
    </dl>
    <p>Read the story's instructions, try <code>help</code> or <code>about</code>, and use its descriptions as clues. Up/Down recalls commands. A single-key prompt expects one key rather than a phrase.</p>
    <section class="vocabulary-help" aria-labelledby="vocabulary-title">
      <h3 id="vocabulary-title">Loaded story vocabulary</h3>
      <p v-if="!story">Load a supported V1–V3 or V5 story to inspect its dictionary.</p>
      <template v-else>
        <p>{{ storyName }} / Z-machine V{{ version }}</p>
        <p class="spoiler-warning"><strong>Spoiler warning:</strong> Dictionary words may reveal unseen objects, characters, locations or puzzle answers.</p>
        <button v-if="!revealed" @click="reveal">Reveal story vocabulary (spoilers)</button>
        <template v-else>
          <button @click="reset">Hide story vocabulary</button>
          <p>Dictionary words do not guarantee a phrase works. This is the standard header dictionary from the originally loaded file, not a list of valid commands or currently available objects. Games may use other dictionaries, custom parsers or runtime changes.</p>
          <p>Words are encoded keys: V1–V3 store up to 6 Z-characters; V5 stores up to 9. Keys can be truncated, and shifts or accented characters use extra space. Duplicate decoded keys are shown once.</p>
          <p v-if="error" class="spoiler-warning" role="alert">Vocabulary unavailable: {{ error }} Gameplay is unchanged.</p>
          <template v-else>
            <p>{{ words.length }} unique dictionary keys. Decoding occurs locally; nothing is sent or saved.</p>
            <p v-if="!words.length">This story's standard dictionary contains no words. It may use a custom parser or another dictionary.</p>
            <ul v-else class="vocabulary-words" aria-label="Story dictionary keys">
              <li v-for="word in words" :key="word">{{ word }}</li>
            </ul>
          </template>
        </template>
      </template>
    </section>
  </dialog>
</template>
