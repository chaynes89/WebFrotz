# WebFrotz

A deep-space story terminal: ivory hardware, phosphor-green text, dark CRT
surfaces and an instrument-panel map. Built with **Vue 3, TypeScript, Vite and
Three.js**, executing the **actual Frotz C interpreter in WebAssembly**.

## Play

Load a raw Z-machine **V1, V2 or V3** story (`.z1`, `.z2`, `.z3`) you are
entitled to play. No commercial games are bundled. Stories and commands are
processed locally; there is no backend, analytics or story upload.

- Type commands and press Enter. Up/Down recalls command history. Single-key
  prompts also work. The transcript is selectable, scrollable and exportable.
- Rooms come from actual status-room events. Direction commands create map
  connections using the retained portable C++ model; dashed links indicate
  inferred movement. This is observation-based mapping, not a complete world model.
- **Ctrl+M** or **Expand map** toggles the upper-right docked map and expanded
  view. The transcript remains full width below it. Drag to rotate, right-drag
  to pan and wheel to zoom. Focus the map for arrow-key panning; buttons provide
  rotation, zoom and centering. The room directory remains usable without WebGL.
- **Restart** confirms before replacing the worker and clearing progress,
  transcript and discoveries. **Stop** terminates even a busy/pending interpreter.
  Loading another story creates a fresh worker.
- **Save / Restore** send `save` / `restore` to the story's parser. Successful
  saves download real Quetzal `.qzl` files. Restore asks you to choose a file
  (or cancel); the interpreter checks story identity. Some games have their own
  prompts or different command vocabulary. Follow their prompts as usual.
- **Undo** uses the core's existing hot-key undo at a line-input boundary.
  With the command field focused, **Alt+U** invokes undo and **Alt+N** invokes
  the core's restart confirmation (answer its single-key y/n prompt). Core
  restart retains transcript history, unlike the toolbar's full session reset.
  Successful restore/undo retains discovered rooms but discards pending traversal.
  **Maps are session-only and are not included in saves.** Reloading the page
  discards them; keep downloaded saves to retain game progress.

## Build and develop

Use Node.js **24 LTS** (24.0 or later), Python **3.10+**, and Emscripten
**4.0.18**. Node 22.12+ is also supported by the frontend tooling.
Dependencies are pinned in `package-lock.json`; the SDK version is pinned in CI.

Install Emscripten using its official [emsdk](https://emscripten.org/docs/getting_started/downloads.html).
For a workspace-local Windows installation, from this repository:

```powershell
git clone --depth 1 https://github.com/emscripten-core/emsdk.git .build\emsdk
.\.build\emsdk\emsdk.bat install 4.0.18
.\.build\emsdk\emsdk.bat activate 4.0.18
npm ci
npm run build:wasm
npm run dev
```

The Python builder detects Emscripten on PATH, under `EMSDK`, or in
`.build\emsdk`. It compiles the C99 core separately from the C++14 map model,
renames only the core entry point, and links a worker-only ES module with Asyncify.
The browser adapter uses GNU C99 because Emscripten's `EM_ASM` requires it;
the core remains C99. Generated `public\wasm` artifacts are intentionally ignored.
The SDK itself is workspace-local and ignored; no system-wide activation is required.

On Linux/macOS, activate emsdk in the current shell before the same npm commands.
The Python scripts handle platform-specific paths.

```powershell
npm run build:wasm
npm run build
npm run preview
```

Serve `dist` over HTTP(S), with `.wasm` served as `application/wasm`.
Do not open `index.html` directly as a file. No SharedArrayBuffer, cross-origin
isolation headers or threading are required. The app must fetch its worker and
WASM module when a story starts, so this is not an offline-installed PWA.
Once loaded, play does not require network requests.

For hosting below a URL prefix, set `WEBFROTZ_BASE` before building:

```powershell
$env:WEBFROTZ_BASE = "/WebFrotz/"
npm run build
```

CI produces a `webfrotz-static-site` artifact. No hosted deployment, release or
Pages configuration is assumed.

## Verification

```powershell
npm run fixtures
npm test
npm run test:portable:wasm
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests run against the production build, load generated original V1-V3
stories, and execute real Z-machine instructions through WASM. They cover text,
status score/moves, movement/map links, toggle, restart, save/restore/cancel,
undo, replacement, stop, narrow layouts and WebGL fallback. The fixture generator
is a tiny bytecode assembler, not the application's interpreter.
Screenshots are written to `test-results`.

Native portable regressions need CMake 3.20+, Python and a C/C++ compiler:

```powershell
cmake -S . -B .build\portable -DBUILD_TESTING=ON
cmake --build .build\portable --config Debug
ctest --test-dir .build\portable -C Debug --output-on-failure
```

CI runs native core/model regressions on Linux plus Emscripten/Node regressions
and Chromium gameplay tests. The retained core suite covers V1/V2/V3/**V5**,
including host events, saves/restores, undo and playback; V5 regression coverage
does **not** mean the browser host supports V5.

## Boundaries and current limitations

| Layer | Responsibility |
| --- | --- |
| `Generic/` | Upstream C interpreter and neutral `os_*` / `host_events.h` interface |
| `web/host.c` | Browser display/file/input adapter; Asyncify suspends blocking input |
| `Frontend/AutoMap.*` + `web/map_bridge.cpp` | Retained map semantics plus a small browser ABI |
| `src/engine/` | Typed worker protocol, session lifecycle and filesystem/download bridge |
| `src/components/RoomMap.vue` | Three.js rendering and camera interaction only |
| `src/App.vue` | Vue terminal and hardware-themed controls |

Host notifications are synchronous and never re-enter the interpreter. Borrowed
UTF-16 commands are copied immediately. Only asynchronous host input/file waits
resume execution. Periodic worker yields allow responsiveness; stopping/replacing
uses worker termination instead of trying to interrupt/re-enter the C core.

Initial browser target is **raw, text-oriented V1-V3 adventures** (maximum
128 KiB). V4-V8, Blorb, Glulx, pictures, sampled sound/music, timed input,
mouse opcodes, story menus, auxiliary files, command recording/playback and
interpreter-managed script files are not supported. Relevant unavailable
operations report an error or notice rather than pretending to work.

The host uses an **80-column / 30-row** logical screen, a reflowing lower
transcript and a cursor-addressed plain-text upper window. Fonts, text styles and
story-selected colours are not reproduced; the readable retro theme is fixed.
Unusual screen tricks can differ from desktop presentation. WebGL failure
degrades to the accessible room directory; losing its context requires a reload
to recover graphics. Reduced-motion disables scanline/glow effects; the map has
no idle animation.

Header validation rejects unsupported/truncated images, but it is not a complete
validator for malicious Z-machine bytecode. Load trusted stories. The interpreter
runs inside browser WebAssembly memory, not as a native executable.
The transcript and map remain in memory for the session, not persisted storage.
Commercial-game compatibility beyond generated fixtures requires additional
testing with legitimately obtained stories.

## Attribution

Migrated from `chaynes89/Windows-Frotz-Automap` v0.1.0,
commit `909fa642e3989d788016566e63d8e038e1fc9b1f`, derived from
David Kinder's Windows Frotz and Stefan Jokisch's Frotz.
The portable core/model and their headers are retained; Windows resources and
media dependencies are not part of this migration.
See [PROVENANCE.md](PROVENANCE.md), [COPYING](COPYING) and [LICENSE](LICENSE).
**GPL-2.0-or-later; no warranty.**
