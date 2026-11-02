import { describe, expect, it } from 'vitest'
import { readVocabulary } from './vocabulary'

function fixture(version: number, entries: number[][] = [[6, 7, 8]]) {
  const data = new ArrayBuffer(1536)
  const view = new DataView(data)
  view.setUint8(0, version)
  for (const [address, value] of [[4, 1280], [6, 1280], [8, 1152], [10, 128], [12, 512], [14, 1280], [26, 1536 / (version >= 4 ? 4 : 2)]])
    view.setUint16(address, value)
  const length = version === 5 ? 6 : 4
  view.setUint8(1153, length + 1)
  view.setInt16(1154, entries.length)
  entries.forEach((entry, index) => {
    const codes = [...entry]
    while (codes.length < length / 2 * 3) codes.push(5)
    for (let offset = 0; offset < length; offset += 2) {
      const z = offset / 2 * 3
      view.setUint16(1156 + index * (length + 1) + offset,
        (codes[z] << 10) | (codes[z + 1] << 5) | codes[z + 2] | (offset === length - 2 ? 0x8000 : 0))
    }
  })
  return data
}

describe('bounded story-file dictionary decoding', () => {
  it('reads actual keys in V1/V2/V3/V5 without interpreting game state', () => {
    for (const version of [1, 2, 3, 4, 5]) {
      const data = fixture(version)
      const before = new Uint8Array(data).slice()
      expect(readVocabulary(data)).toEqual(['abc'])
      expect(new Uint8Array(data)).toEqual(before)
    }
  })
  it('honors early shift/lock rules and later temporary shifts', () => {
    for (const version of [1, 2]) {
      expect(readVocabulary(fixture(version, [[2, 6, 7]]))).toEqual(['Ab'])
      expect(readVocabulary(fixture(version, [[4, 6, 7, 8]]))).toEqual(['ABC'])
    }
    expect(readVocabulary(fixture(3, [[4, 6, 7]]))).toEqual(['Ab'])
    expect(readVocabulary(fixture(1, [[3, 8]]))).toEqual(['1'])
    expect(readVocabulary(fixture(2, [[3, 8]]))).toEqual(['0'])
    expect(readVocabulary(fixture(5, [[5, 8]]))).toEqual(['0'])
  })
  it('reads unsigned/signed counts, removes duplicates, and accepts empty dictionaries', () => {
    const data = fixture(5, [[6], [6]])
    new DataView(data).setInt16(1154, -2)
    expect(readVocabulary(data)).toEqual(['a'])
    new DataView(data).setInt16(1154, 0)
    expect(readVocabulary(data)).toEqual([])
  })
  it('decodes standard and custom Unicode and V5 alphabets', () => {
    expect(readVocabulary(fixture(5, [[5, 6, 4, 27]]))).toEqual(['ä'])
    const unicode = fixture(5, [[5, 6, 4, 27]])
    const view = new DataView(unicode)
    view.setUint16(54, 768)
    view.setUint16(768, 3)
    view.setUint16(774, 784)
    view.setUint8(784, 1)
    view.setUint16(785, 0x3a9)
    expect(readVocabulary(unicode)).toEqual(['Ω'])
    const custom = fixture(5, [[6]])
    new DataView(custom).setUint16(52, 768)
    new DataView(custom).setUint8(768, 64)
    expect(readVocabulary(custom)).toEqual(['@'])
  })
  it('rejects malformed bounds, encodings and unsupported dictionary abbreviations explicitly', () => {
    const data = fixture(3)
    const view = new DataView(data)
    view.setInt16(1154, 32767)
    expect(() => readVocabulary(data)).toThrow('out-of-range')
    view.setInt16(1154, 1)
    view.setUint8(1153, 3)
    expect(() => readVocabulary(data)).toThrow('shorter')
    expect(() => readVocabulary(fixture(3, [[1, 6]]))).toThrow('Abbreviations')
    expect(() => readVocabulary(fixture(3, [[6, 6, 6, 6, 5, 6]]))).toThrow('incomplete')
    const unterminated = fixture(3)
    new DataView(unterminated).setUint16(1158, 0x14a5)
    expect(() => readVocabulary(unterminated)).toThrow('end marker')
  })
})
