# Migration provenance and licensing

WebFrotz is a browser host and frontend for the real Frotz C interpreter.

- Imported from [chaynes89/Windows-Frotz-Automap](https://github.com/chaynes89/Windows-Frotz-Automap)
  at **909fa642e3989d788016566e63d8e038e1fc9b1f**, tagged **v0.1.0**.
- That fork derives from [DavidKinder/Windows-Frotz](https://github.com/DavidKinder/Windows-Frotz).
- `Generic/` retains the upstream C interpreter, source headers, host-event hooks
  and `guide.txt` verbatim. Frotz was originally written by Stefan Jokisch;
  Windows Frotz and subsequent contributors are acknowledged in those files.
- `Frontend/AutoMap.h` and `.cpp`, `tests/AutoMapTests.cpp`,
  `tests/CoreHostTests.c`, `tests/make_story.py` and `COPYING` are imported verbatim.
- `CMakeLists.txt` retains the portable build and tests; Windows resource/tooling
  tests were removed on **2026-11-01** because the Windows frontend is not included.
- `web/`, the Vue frontend, browser fixtures, build scripts and browser tests are
  new WebFrotz integration work dated **2026-11-01**, licensed
  **GPL-2.0-or-later**.

The C core has not been replaced with a JavaScript interpreter or a scripted
simulation. Only the generated fixture stories are original, minimal test
adventures. They are not commercial games and are not included as selectable
game cartridges in the application.

The retro industrial-terminal styling is original. No film stills, logos,
dialogue, commercial game assets, Windows UI/media libraries or native
application resources were copied into this repository.

See `COPYING` and `LICENSE` for GPL version 2. Distributions must retain notices
and provide corresponding source, including the browser host and build scripts.
The application links to its source repository and includes the license as
`COPYING.txt` in the static output. It is provided **without warranty**.
