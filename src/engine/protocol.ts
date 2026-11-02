export interface MapRoom {
  object: number
  label: string
  name?: string
  x: number
  y: number
  z: number
}
export interface MapConnection {
  from: number
  to: number
  vertical: boolean
  inferred: boolean
}
export interface MapSnapshot {
  current: number
  rooms: MapRoom[]
  connections: MapConnection[]
}
export interface InputRequest {
  id: number
  kind: 'line' | 'key' | 'restore'
  max: number
}
export interface ResumeCheckpoint {
  data: ArrayBuffer
  textBuffer: number
  tokenBuffer: number
  status: string
  upper: string
}
export type ToEngine =
  | { type: 'start'; story: ArrayBuffer; wasmBase: string; map?: MapSnapshot; autosave?: boolean; resume?: ResumeCheckpoint }
  | { type: 'input'; id: number; text: string; key: number }
  | { type: 'restore'; id: number; data: ArrayBuffer | null }

export type FromEngine =
  | { type: 'output'; text: string }
  | { type: 'screen'; status: string; upper: string }
  | { type: 'map'; map: MapSnapshot }
  | { type: 'input'; request: InputRequest }
  | { type: 'state'; reason: number }
  | { type: 'save'; data: Uint8Array }
  | { type: 'checkpoint'; data: Uint8Array; textBuffer: number; tokenBuffer: number }
  | { type: 'checkpoint-failed' }
  | { type: 'resumed' }
  | { type: 'warning' | 'error'; message: string }
  | { type: 'ended' }

export const emptyMap = (): MapSnapshot => ({ current: -1, rooms: [], connections: [] })
