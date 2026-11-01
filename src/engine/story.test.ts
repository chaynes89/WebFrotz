import { describe, expect, it } from 'vitest'
import { validateStory } from './story'

function fixture() {
  const data = new ArrayBuffer(1536)
  const view = new DataView(data)
  view.setUint8(0, 3)
  for (const [address, value] of [[4, 1280], [6, 1280], [8, 1152], [10, 128], [12, 512], [14, 1280], [26, 768]])
    view.setUint16(address, value)
  return data
}
describe('raw story admission', () => {
  it('accepts classic versions', () => {
    for (const v of [1, 2, 3, 5]) {
      const data = fixture()
      new DataView(data).setUint8(0, v)
      if (v === 5) new DataView(data).setUint16(26, data.byteLength / 4)
      expect(validateStory(data)).toBe(v)
    }
  })
  it('rejects unsupported and truncated stories', () => {
    const data = fixture()
    new DataView(data).setUint8(0, 4)
    expect(() => validateStory(data)).toThrow('V4 and V6-V8')
    expect(() => validateStory(new ArrayBuffer(20))).toThrow('header')
    expect(() => validateStory(fixture().slice(0, 1000))).toThrow('truncated')
  })
  it('rejects invalid tables and oversized images', () => {
    const data = fixture()
    new DataView(data).setUint16(12, 1200)
    expect(() => validateStory(data)).toThrow('global variable')
    const oversized = new ArrayBuffer(128 * 1024 + 1)
    new DataView(oversized).setUint8(0, 3)
    expect(() => validateStory(oversized)).toThrow('128 KiB')
  })
  it('uses V5 length scaling and a 256 KiB ceiling', () => {
    const data = new ArrayBuffer(200 * 1024)
    new Uint8Array(data).set(new Uint8Array(fixture()))
    const view = new DataView(data)
    view.setUint8(0, 5)
    view.setUint16(26, data.byteLength / 4)
    expect(validateStory(data)).toBe(5)
    view.setUint16(26, 65535)
    expect(() => validateStory(data)).toThrow('truncated')
    const oversized = new ArrayBuffer(256 * 1024 + 1)
    new DataView(oversized).setUint8(0, 5)
    expect(() => validateStory(oversized)).toThrow('256 KiB')
  })
})
