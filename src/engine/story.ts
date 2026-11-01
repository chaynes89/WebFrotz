export function validateStory(data: ArrayBuffer): number {
  if (data.byteLength < 64) throw new Error('Story is shorter than a Z-machine header.')
  const header = new DataView(data)
  const version = header.getUint8(0)
  if (![1, 2, 3, 5].includes(version))
    throw new Error('Load a raw Z-machine V1-V3 or V5 story (.z1, .z2, .z3, .z5). Blorb, Glulx, V4 and V6-V8 are not supported.')
  const maximum = version === 5 ? 256 : 128
  if (data.byteLength > maximum * 1024) throw new Error(`V${version} stories must be at most ${maximum} KiB.`)
  const declaredSize = header.getUint16(26) * (version === 5 ? 4 : 2)
  if (declaredSize && (declaredSize > data.byteLength || declaredSize < 64))
    throw new Error('Story is truncated or its declared length is invalid.')
  const size = declaredSize || data.byteLength
  const dynamic = header.getUint16(14)
  if (dynamic < 64 || dynamic >= size)
    throw new Error('Invalid dynamic memory boundary.')
  for (const offset of [4, 6, 8, 10, 12]) {
    const address = header.getUint16(offset)
    if (address < 64 || address >= size)
      throw new Error('Invalid story table or program address.')
  }
  if (header.getUint16(12) + 480 > dynamic)
    throw new Error('The global variable table does not fit in dynamic memory.')
  return version
}
