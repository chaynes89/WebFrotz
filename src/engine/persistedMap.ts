import type { MapSnapshot } from './protocol'

export function validatePersistedMap(value: unknown): MapSnapshot {
  const invalid = () => { throw new Error('Stored map is invalid. Forget this story’s local data to discard it.') }
  if (typeof value !== 'object' || value === null) return invalid()
  const map = value as Record<string, unknown>
  if (!Array.isArray(map.rooms) || !Array.isArray(map.connections) ||
    map.rooms.length > 65535 || map.connections.length > 65535) return invalid()
  const ids = new Set<number>()
  const positions = new Set<string>()
  const coordinate = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && Math.abs(n) <= 100000
  const rooms = map.rooms.map((value: unknown) => {
    if (typeof value !== 'object' || value === null) return invalid()
    const r = value as Record<string, unknown>
    if (typeof r.object !== 'number' || !Number.isInteger(r.object) || r.object <= 0 ||
      r.object > 65535 || ids.has(r.object) || typeof r.name !== 'string' ||
      r.name.length > 1024 || r.name.includes('\0') ||
      !coordinate(r.x) || !coordinate(r.y) || !coordinate(r.z)) return invalid()
    const position = `${r.x},${r.y},${r.z}`
    if (positions.has(position)) return invalid()
    ids.add(r.object)
    positions.add(position)
    return { object: r.object, name: r.name, label: r.name, x: r.x, y: r.y, z: r.z }
  })
  const links = new Set<string>()
  const connections = map.connections.map((value: unknown) => {
    if (typeof value !== 'object' || value === null) return invalid()
    const c = value as Record<string, unknown>
    if (typeof c.from !== 'number' || !Number.isInteger(c.from) || c.from < 0 || c.from >= rooms.length ||
      typeof c.to !== 'number' || !Number.isInteger(c.to) || c.to < 0 || c.to >= rooms.length ||
      c.from === c.to || typeof c.inferred !== 'boolean') return invalid()
    const key = `${Math.min(c.from, c.to)},${Math.max(c.from, c.to)}`
    if (links.has(key)) return invalid()
    links.add(key)
    return { from: c.from, to: c.to, inferred: c.inferred, vertical: rooms[c.from].z !== rooms[c.to].z }
  })
  return { current: -1, rooms, connections }
}
