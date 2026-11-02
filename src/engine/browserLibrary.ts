import type { MapSnapshot } from './protocol'
import { validatePersistedMap } from './persistedMap'

/* Browser-local story library and autosave checkpoints. Nothing here is sent over the network. */
export interface ProgressSlot {
  format: 1
  runId: string
  savedAt: number
  data: Uint8Array
  textBuffer: number
  tokenBuffer: number
  transcript: string
  status: string
  upper: string
  map: MapSnapshot | null
}
export interface ProgressRecord { id: string; current?: ProgressSlot; previous?: ProgressSlot }
export interface StoredStory { id: string; name: string; version: number; data: ArrayBuffer; addedAt: number; openedAt: number }
export interface LibraryEntry {
  id: string
  name: string
  version: number
  size: number
  openedAt: number
  progressAt?: number
  previousAt?: number
}

export const TRANSCRIPT_LIMIT = 256 * 1024
const DB = 'webfrotz'
const STORIES = 'stories'
const PROGRESS = 'progress'

export function storageMessage(cause: unknown) {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'QuotaExceededError')
    return 'browser storage is full or over its quota for this site'
  return cause instanceof Error ? cause.message || cause.name : String(cause)
}

export async function storyIdentity(data: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) throw new Error('secure-context hashing (crypto.subtle) is unavailable on this page')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Keep the latest checkpoint and one checkpoint from an earlier run.
 * `base` is the savedAt a resumed run started from; a newer stored checkpoint of that run is preserved, not overwritten. */
export function rotate(record: ProgressRecord | undefined, id: string, slot: ProgressSlot, base?: number): ProgressRecord {
  const current = record?.current
  const diverged = current && current.runId === slot.runId && base !== undefined && current.savedAt !== base
  const previous = current && (current.runId !== slot.runId || diverged) ? current :
    record?.previous?.runId === slot.runId ? undefined : record?.previous
  return previous ? { id, current: slot, previous } : { id, current: slot }
}

export function trimTranscript(text: string) {
  return text.length <= TRANSCRIPT_LIMIT ? text : text.slice(text.length - TRANSCRIPT_LIMIT)
}

const address = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffff

export function validateSlot(value: unknown): ProgressSlot {
  const invalid = () => { throw new Error('Stored autosave is damaged. Forget this story’s browser data to discard it.') }
  if (typeof value !== 'object' || value === null) return invalid()
  const s = value as Record<string, unknown>
  if (s.format !== 1 || typeof s.runId !== 'string' || typeof s.savedAt !== 'number' ||
    !(s.data instanceof Uint8Array) || s.data.byteLength < 12 || s.data.byteLength > 8 * 1024 * 1024 ||
    !address(s.textBuffer) || !address(s.tokenBuffer) || typeof s.transcript !== 'string' ||
    typeof s.status !== 'string' || typeof s.upper !== 'string') return invalid()
  return { ...(s as unknown as ProgressSlot), map: s.map === null || s.map === undefined ? null : validatePersistedMap(s.map) }
}

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
function done(t: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('storage transaction aborted'))
  })
}

let opened: Promise<IDBDatabase> | undefined
function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable in this browser mode'))
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => {
      open.result.createObjectStore(STORIES, { keyPath: 'id' })
      open.result.createObjectStore(PROGRESS, { keyPath: 'id' })
    }
    open.onsuccess = () => {
      open.result.onversionchange = () => { open.result.close(); opened = undefined }
      resolve(open.result)
    }
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('storage is blocked by another WebFrotz tab'))
  })
  opened.catch(() => { opened = undefined })
  return opened
}

export async function putStory(story: StoredStory) {
  const db = await database()
  const t = db.transaction(STORIES, 'readwrite')
  const store = t.objectStore(STORIES)
  const existing = await request(store.get(story.id)) as StoredStory | undefined
  store.put({ ...story, addedAt: existing?.addedAt ?? story.addedAt })
  await done(t)
}

export async function getStory(id: string) {
  const db = await database()
  const story = await request(db.transaction(STORIES).objectStore(STORIES).get(id)) as StoredStory | undefined
  if (!story) throw new Error('This story is no longer stored in the browser library.')
  return story
}

export async function getProgress(id: string) {
  const db = await database()
  const record = await request(db.transaction(PROGRESS).objectStore(PROGRESS).get(id)) as ProgressRecord | undefined
  return record ? {
    id,
    current: record.current && validateSlot(record.current),
    previous: record.previous && validateSlot(record.previous),
  } : undefined
}

export async function putCheckpoint(id: string, slot: ProgressSlot, base?: number) {
  const db = await database()
  const t = db.transaction(PROGRESS, 'readwrite')
  const store = t.objectStore(PROGRESS)
  const record = await request(store.get(id)) as ProgressRecord | undefined
  store.put(rotate(record, id, slot, base))
  await done(t)
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const db = await database()
  const t = db.transaction([STORIES, PROGRESS])
  const [stories, progress] = await Promise.all([
    request(t.objectStore(STORIES).getAll()) as Promise<StoredStory[]>,
    request(t.objectStore(PROGRESS).getAll()) as Promise<ProgressRecord[]>,
  ])
  const saves = new Map(progress.map(record => [record.id, record]))
  return stories.map(story => ({
    id: story.id, name: story.name, version: story.version, size: story.data.byteLength, openedAt: story.openedAt,
    progressAt: saves.get(story.id)?.current?.savedAt, previousAt: saves.get(story.id)?.previous?.savedAt,
  })).sort((a, b) => b.openedAt - a.openedAt)
}

export async function forgetStory(id: string) {
  const db = await database()
  const t = db.transaction([STORIES, PROGRESS], 'readwrite')
  t.objectStore(STORIES).delete(id)
  t.objectStore(PROGRESS).delete(id)
  await done(t)
}

/** Hold a per-story lock so two tabs cannot alternate overwriting one autosave. */
export function lockStory(id: string): Promise<{ granted: boolean; release: () => void }> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks) return Promise.resolve({ granted: true, release: () => undefined })
  return new Promise(resolve => {
    let release = () => undefined as void
    const held = new Promise<void>(r => { release = r })
    locks.request(`webfrotz-progress:${id}`, { ifAvailable: true }, lock => {
      if (!lock) { resolve({ granted: false, release: () => undefined }); return undefined }
      resolve({ granted: true, release })
      return held
    }).catch(() => resolve({ granted: false, release: () => undefined }))
  })
}
