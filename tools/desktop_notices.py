"""Collect exact locked runtime notices into the embedded desktop frontend."""
import json
from pathlib import Path
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    dist = ROOT / ".build" / "desktop-dist"
    notices = dist / "licenses"
    notices.mkdir(parents=True, exist_ok=True)
    sdk = Path(os.environ.get("EMSDK", ROOT / ".build" / "emsdk")) / "upstream" / "emscripten"
    files = {
        "vue-MIT.txt": ROOT / "node_modules" / "vue" / "LICENSE",
        "three-MIT.txt": ROOT / "node_modules" / "three" / "LICENSE",
        "tauri-api.txt": ROOT / "docs" / "licenses" / "tauri-MIT.txt",
        "emscripten.txt": sdk / "LICENSE",
        "musl.txt": sdk / "system" / "lib" / "libc" / "musl" / "COPYRIGHT",
        "libcxx.txt": sdk / "system" / "lib" / "libcxx" / "LICENSE.TXT",
        "libcxxabi.txt": sdk / "system" / "lib" / "libcxxabi" / "LICENSE.TXT",
    }
    for name, source in files.items():
        shutil.copyfile(source, notices / name)
    for name in ["COPYING", "PROVENANCE.md", "DEPENDENCIES.md"]:
        shutil.copyfile(ROOT / name, dist / name)
    metadata = json.loads(subprocess.check_output([
        "cargo", "metadata", "--locked", "--format-version", "1",
        "--manifest-path", str(ROOT / "src-tauri" / "Cargo.toml"),
    ], cwd=ROOT, text=True))
    rows = ["# Locked Rust dependencies", "", "Exact packages and their declared licenses/source URLs.",
            "Original distributed license/notice files follow in the package directories.", ""]
    for package in metadata["packages"]:
        if not package["source"]:
            continue
        folder = Path(package["manifest_path"]).parent
        target = notices / "native" / f'{package["name"]}-{package["version"]}'
        target.mkdir(parents=True, exist_ok=True)
        rows.append(f'- {package["name"]} {package["version"]}: {package["license"] or package["license_file"]}; '
                    f'{package["repository"] or package["source"]}')
        for source in folder.rglob("*"):
            if source.is_file() and re.match(r"^(licen[sc]e|copying|notice|copyright)([._-]|$)", source.name, re.I):
                destination = target / source.relative_to(folder)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
        if package["license_file"]:
            source = folder / package["license_file"]
            shutil.copyfile(source, target / source.name)
    (notices / "native" / "DEPENDENCIES.md").write_text("\n".join(rows), encoding="utf-8")
    sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip())
    for source in (sysroot / "share" / "doc" / "rust").glob("*"):
        if source.is_file() and re.match(r"^(copyright|license)", source.name, re.I):
            shutil.copyfile(source, notices / f"rust-{source.name}")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT))
    (dist / "SOURCE.txt").write_text(
        "WebFrotz desktop - GPL-2.0-or-later, no warranty.\n"
        f"Source checkout {'base ' if dirty else ''}commit: {commit}\n"
        f"https://github.com/chaynes89/WebFrotz/tree/{commit}\n"
        + ("Local modifications are present. Do not redistribute without matching source.\n" if dirty else "")
        + "The CI Windows artifact includes the matching source zip. No new release tag is required.\n"
        "Redistributors must retain all notices and provide corresponding source under the GPL.\n"
        "Rust crate sources/versions are pinned by Cargo.lock and listed under licenses/native/.\n"
        "Rust standard library source: https://github.com/rust-lang/rust/tree/1.99.1\n"
        "Microsoft WebView2 is a separately licensed runtime; its signed offline installer is bundled.\n"
        "WebView2 terms: https://www.microsoft.com/en-us/legal/intellectualproperty/copyright\n"
        "NSIS installer source/license: https://nsis.sourceforge.io/License\n",
        encoding="utf-8",
    )
    print("Desktop notices and source availability embedded.")


if __name__ == "__main__":
    main()
