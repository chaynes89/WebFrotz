# Runtime dependencies and source availability

WebFrotz's own interpreter integration, frontend, generated fixtures, build
scripts and original screenshot are GPL-2.0-or-later. Frotz copyright notices
remain in `Generic/`; see `COPYING`, `LICENSE` and `PROVENANCE.md`.

The release's static archive includes the following third-party notices in
`licenses/`. These permissive components retain their own licenses:

| Component | Version | License | Source |
| --- | --- | --- | --- |
| Vue and its runtime packages | 3.5.44 | MIT | [vuejs/core v3.5.44](https://github.com/vuejs/core/tree/v3.5.44) |
| Three.js, including OrbitControls | 0.180.0 | MIT | [mrdoob/three.js r180](https://github.com/mrdoob/three.js/tree/r180) |
| Tauri JavaScript API (desktop detection/IPC) | 2.12.4 | MIT (chosen from Apache-2.0 OR MIT) | [tauri-apps/tauri](https://github.com/tauri-apps/tauri) |
| Emscripten-generated JavaScript runtime | 4.0.18 | MIT / NCSA | [emscripten-core/emscripten 4.0.18](https://github.com/emscripten-core/emscripten/tree/4.0.18) |
| musl C library supplied by Emscripten | SDK 4.0.18 | MIT and notices in COPYRIGHT | [SDK musl source](https://github.com/emscripten-core/emscripten/tree/4.0.18/system/lib/libc/musl) |
| libc++ / libc++abi supplied by Emscripten | SDK 4.0.18 | Apache-2.0 with LLVM exception and legacy notices | [SDK system libraries](https://github.com/emscripten-core/emscripten/tree/4.0.18/system/lib) |

`package-lock.json` pins the frontend packages and hashes. Emscripten 4.0.18
is pinned in the build instructions and CI. Build-time tooling has its own
licenses; it is not shipped as a native executable in the static-site archive.

Each release includes a matching WebFrotz source archive, with all imported C/C++
sources, the host, frontend, tests, original fixture generator and build scripts.
The matching GitHub tag also provides source downloads. The links above identify
the corresponding dependency sources; Emscripten's standard compiler libraries
come with the pinned SDK. See the README for reproducible build commands.

When redistributing the compiled application, retain the notices and provide
the corresponding source under the GPL, not just the compiled static files.
No commercial story content is part of either archive.

## Optional native desktop

`src-tauri/Cargo.lock` pins the exact Tauri 2, rfd native-dialog, SHA-256 and
transitive Rust crate sources. `tools/desktop_notices.py` embeds their distributed
license/COPYING/NOTICE files, declared SPDX expressions and source URLs under
`licenses/native/` in the executable, together with the Vue, Three.js, Tauri API,
Emscripten, musl and C++ runtime notices. Rust standard-library notices and source
availability are also included; the Rust toolchain is pinned by
`rust-toolchain.toml`. WebFrotz selects the MIT option for dual-licensed Tauri;
the authoritative notice is retained in `docs/licenses/tauri-MIT.txt` (Tauri Apps
Contributors' upstream `LICENSE-MIT`).

The NSIS installer embeds a separately signed Microsoft WebView2 Evergreen
offline installer. WebView2 is proprietary Microsoft software, not GPL WebFrotz
source; its own installer/runtime terms apply. NSIS is separately licensed;
see [NSIS license and source](https://nsis.sourceforge.io/License) and
[WebView2 distribution](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution).
The per-commit Windows CI artifact includes WebFrotz's matching corresponding
source zip and notices. It does not create or repoint a version/release tag.
