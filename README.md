# WebFrotz

A deep-space story terminal: ivory hardware, phosphor-green text, dark CRT
surfaces and an instrument-panel map. Built with **Vue 3, TypeScript, Vite and
Three.js**, executing the **actual Frotz C interpreter in WebAssembly**.

## Play

Load a raw Z-machine **V1, V2, V3 or V5** story (`.z1`, `.z2`, `.z3`, `.z5`) you are
entitled to play. No commercial games are bundled. Stories and commands are
processed locally; there is no backend, analytics or story upload.

- Type commands and press Enter. Up/Down recalls command history. Single-key
  prompts also work. The transcript is selectable, scrollable and exportable.
- **Help** opens common example phrases without issuing a command or changing
  the game. Story vocabulary stays hidden until you select **Reveal story
  vocabulary (spoilers)**. Opening Help again hides it by default. The spoiler
  warning explains that dictionary keys can expose unseen objects or puzzle clues.
  Keys come from the loaded file's actual standard header dictionary for V1-V3/V5,
  not a fabricated vocabulary or a list of guaranteed valid phrases. V1-V3 keys
  have at most 6 encoded Z-characters; V5 has 9, so displayed keys can be truncated.
  V5 custom alphabets and standard/custom ZSCII Unicode tables are supported.
  Alternate dictionaries, custom parser vocabulary and runtime dictionary changes
  are not inspected. Malformed tables, unsupported dictionary abbreviations or
  character encodings produce an explicit Help error without stopping gameplay.
  Extraction is read-only, local and performed only on explicit reveal; nothing
  is sent, saved, added to the transcript or passed back into the C interpreter.
- For **V1-V3**, rooms come from actual status-room events. Direction commands create map
  connections using the retained portable C++ model; dashed links indicate
  inferred movement. This is observation-based mapping, not a complete world model.
  **V5 does not provide these room events**: its story-defined upper window is
  displayed as text, and the map explicitly reports that automatic mapping is
  unavailable. No room identities are guessed from prose, globals or status text.
  Map title boxes fit each label's measured text with compact padding and a
  smaller font, rather than reserving a fixed-width panel for every room.
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
  In V5, undo depends on the story creating undo checkpoints; unavailable undo
  is reported by the core.
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

Browser tests run against the production build, load generated original V1-V3/V5
stories, and execute real Z-machine instructions through WASM. They cover text,
status score/moves, movement/map links, toggle, restart, save/restore/cancel,
undo, replacement, stop, narrow layouts, WebGL fallback, V5 length scaling,
V5 upper-window coordinates and explicit timed-input rejection. The fixture generator
is a tiny bytecode assembler, not the application's interpreter.
Screenshots are written to `test-results`.

To test an update without changing the static files served by an existing
unsaved preview, build into a separate directory and point browser tests at it:

```powershell
npx vue-tsc --noEmit
node .\node_modules\vite\bin\vite.js build --outDir .build\help-preview
$env:WEBFROTZ_TEST_DIST = ".build\help-preview"
npm run test:browser
```

The test server uses port 4173, separate from the optional local preview on 4175.

Native portable regressions need CMake 3.20+, Python and a C/C++ compiler:

```powershell
cmake -S . -B .build\portable -DBUILD_TESTING=ON
cmake --build .build\portable --config Debug
ctest --test-dir .build\portable -C Debug --output-on-failure
```

CI runs native core/model regressions on Linux plus Emscripten/Node regressions
and Chromium gameplay tests. The retained core suite covers V1/V2/V3/**V5**,
including host events, saves/restores, undo and playback. Browser V5 support is
text-oriented and narrower than the core's full capabilities.

### Optional private story smoke tests

With a local production preview running (default port 4175):

```powershell
$env:WEBFROTZ_LOCAL_STORIES = "D:\Stories"
node tools\test_local_stories.mjs
```

Set `WEBFROTZ_PREVIEW_URL` if your local preview uses another URL. This opt-in
script reads authorized local files directly into the local browser, checks
load/look/inventory/north/look, and checks Quetzal save/restore for V5. It writes
no story files, transcript, screenshots, trace or video, and never runs in CI.
Only filenames, header versions and success/unsupported/failure metadata are logged.

Local smoke testing on 2026-11-01:

| Local filename | Actual header | Result |
| --- | --- | --- |
| `ADVENT.Z5` | V5 | Text commands and Quetzal save/restore passed |
| `FREEFALL.Z5` | V5 | Requires timed input; explicitly unsupported |
| `hhgg.z5`, `planetfall.z5` | V3 | Text command smoke checks passed |
| `zork_1.z5`, `zork_2.z5` | V2 | Text command smoke checks passed |

The header, not the extension, determines the version. These are initial smoke
checks, not full-game walkthroughs or a guarantee of complete compatibility.
No user-owned story bytes or story text are distributed here.

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

The browser supports **raw, text-oriented V1-V3 adventures** (maximum
128 KiB) and **V5** (maximum 256 KiB, four-byte header length units).
V4, V6-V8, Blorb, Glulx, pictures, sampled sound/music, timed input,
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
V5 timed-input requests fail with a specific capability error; a real-time story
such as Freefall is not currently playable. Full timed-input support needs an
asynchronous timeout/interrupt bridge, not a fabricated immediate key or disabled timer.
Broader compatibility beyond the private smoke checks above requires further
testing with legitimately obtained stories.

## Attribution

Migrated from `chaynes89/Windows-Frotz-Automap` v0.1.0,
commit `909fa642e3989d788016566e63d8e038e1fc9b1f`, derived from
David Kinder's Windows Frotz and Stefan Jokisch's Frotz.
The portable core/model and their headers are retained; Windows resources and
media dependencies are not part of this migration.
See [PROVENANCE.md](PROVENANCE.md), [COPYING](COPYING) and [LICENSE](LICENSE).
**GPL-2.0-or-later; no warranty.**

The interpreter's GPL does not license separately copyrighted story files.
Ownership of a game copy does not normally grant redistribution rights.
Do not add commercial/unauthorized stories; redistribute a story only with
explicit permission or verified public-domain status and its required notices.
