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
    for (const v of [1, 2, 3]) {
      const data = fixture()
      new DataView(data).setUint8(0, v)
      expect(validateStory(data)).toBe(v)
    }
  })
  it('rejects unsupported and truncated stories', () => {
    const data = fixture()
    new DataView(data).setUint8(0, 5)
    expect(() => validateStory(data)).toThrow('V4-V8')
    expect(() => validateStory(new ArrayBuffer(20))).toThrow('header')
    expect(() => validateStory(fixture().slice(0, 1000))).toThrow('truncated')
  })
  it('rejects invalid tables and oversized images', () => {
    const data = fixture()
    new DataView(data).setUint16(12, 1200)
    expect(() => validateStory(data)).toThrow('global variable')
    expect(() => validateStory(new ArrayBuffer(128 * 1024 + 1))).toThrow('128 KiB')
  })
})
