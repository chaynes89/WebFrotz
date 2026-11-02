import { describe, expect, it } from 'vitest'
import { rotate, storageMessage, trimTranscript, TRANSCRIPT_LIMIT, validateSlot, type ProgressSlot } from './browserLibrary'

const slot = (runId: string, savedAt = 1): ProgressSlot => ({
  format: 1, runId, savedAt, data: new Uint8Array(16), textBuffer: 100, tokenBuffer: 200,
  transcript: 'text', status: 'Room', upper: '', map: null,
})

describe('autosave rotation', () => {
  it('stores the first checkpoint as current', () => {
    expect(rotate(undefined, 's', slot('a'))).toEqual({ id: 's', current: slot('a') })
  })
  it('replaces the current checkpoint within one run and keeps the earlier run', () => {
    const record = { id: 's', current: slot('b', 2), previous: slot('a') }
    expect(rotate(record, 's', slot('b', 3))).toEqual({ id: 's', current: slot('b', 3), previous: slot('a') })
  })
  it('moves the current run to previous when a new run checkpoints', () => {
    const record = { id: 's', current: slot('b', 2), previous: slot('a') }
    expect(rotate(record, 's', slot('c', 4))).toEqual({ id: 's', current: slot('c', 4), previous: slot('b', 2) })
  })
  it('swaps runs when the earlier run is resumed', () => {
    const record = { id: 's', current: slot('b', 2), previous: slot('a') }
    expect(rotate(record, 's', slot('a', 5))).toEqual({ id: 's', current: slot('a', 5), previous: slot('b', 2) })
  })
  it('preserves newer progress of a resumed run instead of overwriting it', () => {
    const record = { id: 's', current: slot('a', 9), previous: slot('z') }
    expect(rotate(record, 's', slot('a', 10), 5)).toEqual({ id: 's', current: slot('a', 10), previous: slot('a', 9) })
    expect(rotate(record, 's', slot('a', 10), 9)).toEqual({ id: 's', current: slot('a', 10), previous: slot('z') })
  })
})

describe('autosave validation', () => {
  it('accepts a well-formed slot', () => {
    expect(validateSlot(slot('a'))).toEqual(slot('a'))
  })
  it.each([
    ['missing data', { ...slot('a'), data: undefined }],
    ['short data', { ...slot('a'), data: new Uint8Array(4) }],
    ['bad address', { ...slot('a'), textBuffer: 70000 }],
    ['wrong format', { ...slot('a'), format: 2 }],
    ['bad map', { ...slot('a'), map: { rooms: 'x' } }],
  ])('rejects %s', (_, value) => {
    expect(() => validateSlot(value)).toThrow(/damaged|invalid/i)
  })
})

describe('storage helpers', () => {
  it('keeps the most recent transcript text', () => {
    const text = 'a'.repeat(TRANSCRIPT_LIMIT) + 'tail'
    const trimmed = trimTranscript(text)
    expect(trimmed).toHaveLength(TRANSCRIPT_LIMIT)
    expect(trimmed.endsWith('tail')).toBe(true)
  })
  it('explains quota failures', () => {
    expect(storageMessage(new DOMException('x', 'QuotaExceededError'))).toMatch(/quota/)
  })
})
