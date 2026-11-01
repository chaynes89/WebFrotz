import { invoke, isTauri } from '@tauri-apps/api/core'
import type { MapSnapshot } from './engine/protocol'

export const desktop = isTauri()
export interface RecentStory {
  id: string
  name: string
  path: string
  savePath: string | null
}
export interface DesktopStory {
  id: string
  name: string
  data: number[]
  map: unknown
  hasSave: boolean
}
export const pickStory = () => invoke<DesktopStory | null>('pick_story')
export const recentStories = () => invoke<RecentStory[]>('recent_stories')
export const openRecent = (id: string) => invoke<DesktopStory>('open_recent', { id })
export const persistMap = (id: string, map: MapSnapshot) => invoke<void>('persist_map', { id, map })
export const saveGame = (id: string, data: Uint8Array) =>
  invoke<boolean>('save_game', { id, data: Array.from(data) })
export const restoreGame = (id: string, latest = false) =>
  invoke<number[] | null>('restore_game', { id, latest })
export const exportTranscript = (text: string) => invoke<boolean>('export_transcript', { text })
export const forgetLibrary = () => invoke<void>('forget_library')
