import { emptyMap, type FromEngine, type InputRequest, type MapSnapshot, type ToEngine } from './protocol'
import { validateStory } from './story'

interface FrotzModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void
    readFile(path: string): Uint8Array
    unlink(path: string): void
    analyzePath(path: string): { exists: boolean }
  }
  ccall(name: string, result: string, args: string[], values: unknown[], options: { async: true }): Promise<number>
}
type Factory = (options: Record<string, unknown>) => Promise<FrotzModule>

const send = (message: FromEngine) => self.postMessage(message)
let engine: FrotzModule | undefined
let started = false
let sequence = 0
let pending: { request: InputRequest; resolve: (value: { text: string; key: number }) => void } | undefined
let output = ''
let status = Array<string>(80).fill(' ')
let upper = Array.from({ length: 30 }, () => Array<string>(80).fill(' '))
let upperHeight = 0
let row = 1
let column = 1
let dirtyScreen = true
let savePending = false
let snapshot: MapSnapshot = emptyMap()

function flush() {
  if (output) { send({ type: 'output', text: output }); output = '' }
  if (dirtyScreen) {
    send({ type: 'screen', status: status.join('').trim(), upper: upper.slice(0, upperHeight).map(line => line.join('').trimEnd()).join('\n') })
    dirtyScreen = false
  }
}

function wait(kind: InputRequest['kind'], max: number) {
  flush()
  if (pending) throw new Error('Interpreter attempted overlapping input requests.')
  const request: InputRequest = { id: ++sequence, kind, max }
  return new Promise<{ text: string; key: number }>(resolve => {
    pending = { request, resolve }
    send({ type: 'input', request })
  })
}

function fail(error: unknown) {
  flush()
  send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
}

const host = {
  flush,
  input: (kind: 'key' | 'line', max: number) => wait(kind, max),
  echo(text: string) { output += text },
  char(code: number, window: number) {
    const character = code === 9 || code === 11 ? '   ' : String.fromCharCode(code)
    if (window === 7) {
      if (column >= 1 && column <= 80) status[column - 1] = character
      column += character.length
      dirtyScreen = true
    } else if (window === 1) {
      if (code === 10) { row++; column = 1 }
      else {
        if (row >= 2 && row <= 30 && column >= 1 && column <= 80) upper[row - 2][column - 1] = character
        column += character.length
      }
      dirtyScreen = true
    } else {
      output += character
      if (output.length >= 4096) flush()
    }
  },
  cursor(y: number, x: number) { row = y; column = x },
  erase(top: number, left: number, bottom: number, right: number) {
    for (let y = Math.max(2, top); y <= Math.min(30, bottom); y++)
      for (let x = Math.max(1, left); x <= Math.min(80, right); x++)
        upper[y - 2][x - 1] = ' '
    if (top === 1) status = Array<string>(80).fill(' ')
    dirtyScreen = true
  },
  windowHeight(window: number, height: number) {
    if (window === 1) { upperHeight = Math.max(0, Math.min(29, height)); dirtyScreen = true }
  },
  beginMap(current: number) { snapshot = { current, rooms: [], connections: [] } },
  room(object: number, label: string, x: number, y: number, z: number) { snapshot.rooms.push({ object, label, x, y, z }) },
  connection(from: number, to: number, vertical: boolean, inferred: boolean) { snapshot.connections.push({ from, to, vertical, inferred }) },
  endMap() { send({ type: 'map', map: snapshot }) },
  state(reason: number) {
    if (reason === 1) {
      status = Array<string>(80).fill(' ')
      upper = Array.from({ length: 30 }, () => Array<string>(80).fill(' '))
      upperHeight = 0
      dirtyScreen = true
    }
    send({ type: 'state', reason })
  },
  warning(message: string) { send({ type: 'warning', message }) },
  fatal(message: string) { send({ type: 'error', message }) },
  async file(mode: number) {
    if (!engine) throw new Error('Interpreter filesystem is unavailable.')
    if (mode === 1) {
      if (engine.FS.analyzePath('/save.qzl').exists) engine.FS.unlink('/save.qzl')
      savePending = true
      return 1
    }
    const result = await wait('restore', 0)
    return result.key
  },
  checkSave() {
    if (!savePending || !engine) return
    savePending = false
    if (!engine.FS.analyzePath('/save.qzl').exists) {
      send({ type: 'error', message: 'The interpreter could not create the save file.' })
      return
    }
    const data = engine.FS.readFile('/save.qzl')
    if (!data.length) {
      send({ type: 'error', message: 'The interpreter produced an empty save file.' })
      return
    }
    send({ type: 'save', data })
  },
}

self.onmessage = async (event: MessageEvent<ToEngine>) => {
  const message = event.data
  try {
    if (message.type === 'start') {
      if (started) throw new Error('Use a new worker to replace or restart a story.')
      started = true
      validateStory(message.story)
      const url = `${message.wasmBase}frotz.js`
      const imported = await import(/* @vite-ignore */ url) as { default: Factory }
      engine = await imported.default({
        host,
        locateFile: (path: string) => `${message.wasmBase}${path}`,
        print: (text: string) => { output += `${text}\n` },
        printErr: (text: string) => send({ type: 'warning', message: text }),
        onAbort: (message: unknown) => fail(message),
      })
      engine.FS.writeFile('/story.z', new Uint8Array(message.story))
      await engine.ccall('web_run', 'number', [], [], { async: true })
      flush()
      send({ type: 'ended' })
    } else if (pending && pending.request.id === message.id) {
      if (message.type === 'restore' && pending.request.kind === 'restore') {
        if (message.data && message.data.byteLength > 8 * 1024 * 1024)
          throw new Error('Restore files must be at most 8 MiB.')
        if (message.data) engine!.FS.writeFile('/restore.qzl', new Uint8Array(message.data))
        const resolve = pending.resolve
        pending = undefined
        resolve({ text: '', key: message.data ? 1 : 0 })
      } else if (message.type === 'input' && pending.request.kind !== 'restore') {
        if (message.text.length > pending.request.max)
          throw new Error('Input exceeds the story input buffer.')
        const resolve = pending.resolve
        pending = undefined
        resolve({ text: message.text, key: message.key })
      }
    }
  } catch (error) { fail(error) }
}
