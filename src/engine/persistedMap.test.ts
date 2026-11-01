import { describe, expect, it } from 'vitest'
import { validatePersistedMap } from './persistedMap'

const sample = () => ({
  current: 1,
  rooms: [
    { object: 1, name: 'Hall', label: 'Hall (#1)', x: 0, y: 0, z: 0 },
    { object: 2, name: 'HALL', label: 'HALL (#2)', x: 0, y: 0, z: 1 },
  ],
  connections: [{ from: 0, to: 1, inferred: false, vertical: false }],
})

describe('persisted map boundary', () => {
  it('discards stale position and derives vertical links from coordinates', () => {
    const map = validatePersistedMap(sample())
    expect(map.current).toBe(-1)
    expect(map.connections[0].vertical).toBe(true)
    expect(map.rooms[0].name).toBe('Hall')
  })
  it('accepts cleared discoveries', () => {
    expect(validatePersistedMap({ rooms: [], connections: [] }).rooms).toEqual([])
  })
  it('rejects damaged and unbounded maps before calling WASM', () => {
    const bad: unknown[] = [null, {}, { rooms: [], connections: [{}] }]
    for (const change of [
      { object: 0 }, { object: 1.5 }, { name: 'a\0b' }, { name: 'a'.repeat(1025) },
      { x: NaN }, { x: 100001 }, { object: 2 }, { z: 1 },
    ]) {
      const map = sample()
      Object.assign(map.rooms[0], change)
      bad.push(map)
    }
    const duplicate = sample()
    duplicate.connections.push(duplicate.connections[0])
    bad.push(duplicate)
    for (const map of bad) expect(() => validatePersistedMap(map)).toThrow('Stored map is invalid')
  })
})
