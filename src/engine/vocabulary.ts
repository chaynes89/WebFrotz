import { validateStory } from './story'

const defaultUnicode = 'äöüÄÖÜß»«ëïÿËÏáéíóúýÁÉÍÓÚÝàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛåÅøØãñõÃÑÕæÆçÇþðÞÐ£œŒ¡¿'

export function readVocabulary(data: ArrayBuffer): string[] {
  const version = validateStory(data)
  const view = new DataView(data)
  const size = view.getUint16(26) * (version >= 4 ? 4 : 2) || data.byteLength
  function range(address: number, length: number) {
    if (!Number.isInteger(address) || address < 64 || address + length > size)
      throw new Error('Story vocabulary contains an out-of-range table.')
  }
  let unicodeTable = 0
  if (version === 5) {
    const extension = view.getUint16(54)
    if (extension) {
      range(extension, 2)
      const words = view.getUint16(extension)
      range(extension, 2 + words * 2)
      if (words >= 3) unicodeTable = view.getUint16(extension + 6)
      if (unicodeTable) {
        range(unicodeTable, 1)
        range(unicodeTable, 1 + view.getUint8(unicodeTable) * 2)
      }
    }
  }
  function zscii(code: number): string {
    if (code === 13) return '\n'
    if (code >= 32 && code <= 126) return String.fromCharCode(code)
    if (code >= 155 && code <= 251) {
      const index = code - 155
      if (unicodeTable && index < view.getUint8(unicodeTable)) {
        const character = view.getUint16(unicodeTable + 1 + index * 2)
        if (character >= 32 && !(character >= 0xd800 && character <= 0xdfff))
          return String.fromCharCode(character)
      } else if (!unicodeTable && index < defaultUnicode.length) return defaultUnicode[index]
    }
    throw new Error('Story vocabulary contains an unsupported ZSCII character.')
  }
  const customAlphabet = version === 5 ? view.getUint16(52) : 0
  if (customAlphabet) range(customAlphabet, 78)
  const alphabets = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    version === 1 ? ' 0123456789.,!?_#\'"/\\<-:()' : ' \n0123456789.,!?_#\'"/\\-:()']
  function alphabet(set: number, index: number): string {
    if (version > 1 && set === 2 && index === 1) return '\n'
    return customAlphabet ? zscii(view.getUint8(customAlphabet + set * 26 + index)) : alphabets[set][index]
  }
  const dictionary = view.getUint16(8)
  range(dictionary, 1)
  const separators = view.getUint8(dictionary)
  range(dictionary, 1 + separators + 3)
  const header = dictionary + 1 + separators
  const entryLength = view.getUint8(header)
  const count = Math.abs(view.getInt16(header + 1))
  const encodedLength = version === 5 ? 6 : 4
  if (entryLength < encodedLength) throw new Error('Story dictionary entries are shorter than their encoded words.')
  const entries = header + 3
  range(entries, count * entryLength)
  const words = new Set<string>()
  for (let entry = 0; entry < count; entry++) {
    const codes: number[] = []
    let terminated = false
    for (let byte = 0; byte < encodedLength; byte += 2) {
      const packed = view.getUint16(entries + entry * entryLength + byte)
      codes.push((packed >> 10) & 31, (packed >> 5) & 31, packed & 31)
      if (packed & 0x8000) { terminated = true; break }
    }
    if (!terminated) throw new Error('Story dictionary word is missing its end marker.')
    let word = ''
    let shift = 0
    let lock = 0
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index]
      if (shift === 2 && code === 6) {
        if (index + 2 >= codes.length) throw new Error('Story dictionary contains an incomplete ZSCII escape.')
        word += zscii((codes[++index] << 5) | codes[++index])
      } else if (version === 1 && code === 1) word += '\n'
      else if (code >= 6) word += alphabet(shift, code - 6)
      else if (code === 0) word += ' '
      else if ((version >= 2 && code === 1) || (version >= 3 && code <= 3))
        throw new Error('Abbreviations in dictionary entries are not supported by vocabulary help.')
      else {
        shift = (lock + (code & 1) + 1) % 3
        if (version <= 2 && code >= 4) lock = shift
        continue
      }
      shift = lock
    }
    if (word.length) words.add(word)
  }
  return [...words].sort()
}
