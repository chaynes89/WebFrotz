"""Package an HTTP-served static site and its matching GPL source archive."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-ref", default="HEAD")
    args = parser.parse_args()
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit("Release packaging requires a normal semantic version.")
    commit = subprocess.check_output(
        ["git", "rev-parse", "--verify", f"{args.source_ref}^{{commit}}"],
        cwd=ROOT, text=True,
    ).strip()
    source_package = json.loads(subprocess.check_output(
        ["git", "show", f"{commit}:package.json"], cwd=ROOT, text=True,
    ))
    if source_package["version"] != version:
        raise SystemExit("Commit the version metadata before packaging its matching source.")

    dist = args.dist.resolve()
    for required in ["index.html", "COPYING.txt", "wasm/frotz.js", "wasm/frotz.wasm"]:
        if not (dist / required).is_file():
            raise SystemExit(f"Missing built release file: {required}")
    sdk = Path(os.environ.get("EMSDK", ROOT / ".build" / "emsdk")) / "upstream" / "emscripten"
    notices = {
        "licenses/vue-MIT.txt": ROOT / "node_modules" / "vue" / "LICENSE",
        "licenses/three-MIT.txt": ROOT / "node_modules" / "three" / "LICENSE",
        "licenses/emscripten.txt": sdk / "LICENSE",
        "licenses/musl.txt": sdk / "system" / "lib" / "libc" / "musl" / "COPYRIGHT",
        "licenses/libcxx.txt": sdk / "system" / "lib" / "libcxx" / "LICENSE.TXT",
        "licenses/libcxxabi.txt": sdk / "system" / "lib" / "libcxxabi" / "LICENSE.TXT",
    }
    for name in ["LICENSE", "PROVENANCE.md", "DEPENDENCIES.md", "README.md", "docs/webfrotz-1.0.png"]:
        notices[name] = ROOT / name
    for path in notices.values():
        if not path.is_file():
            raise SystemExit(f"Required distribution notice or documentation is missing: {path}")
    output = args.output.resolve()
    if output == dist or dist in output.parents:
        raise SystemExit("Release output must be outside the static-site directory.")
    output.mkdir(parents=True, exist_ok=True)
    source_name = f"webfrotz-{version}-source.zip"
    subprocess.run([
        "git", "archive", "--format=zip", f"--prefix=WebFrotz-{version}/",
        f"--output={output / source_name}", commit,
    ], cwd=ROOT, check=True)
    release_url = f"https://github.com/chaynes89/WebFrotz/releases/tag/v{version}"
    source_notice = (
        f"WebFrotz {version}\nSource commit: {commit}\n\n"
        "GPL-2.0-or-later; no warranty. Retain COPYING.txt and all notices.\n"
        f"Download the matching {source_name} alongside this static archive:\n{release_url}\n"
        f"Versioned source: https://github.com/chaynes89/WebFrotz/tree/{commit}\n\n"
        "README.md contains build instructions; DEPENDENCIES.md identifies runtime licenses and sources.\n"
        "Redistributors must provide corresponding source, not only the compiled application.\n"
        "Extract this archive and serve its root over HTTP(S); do not open index.html as a file.\n"
        "Only generated original fixture stories are included. No commercial games are bundled.\n"
    )
    static_name = f"webfrotz-{version}-static.zip"
    with ZipFile(output / static_name, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(dist.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(dist).as_posix())
        for name, path in notices.items():
            archive.write(path, name)
        archive.writestr("SOURCE.txt", source_notice)
    print(f"Packaged {static_name} and {source_name} from {commit}")


if __name__ == "__main__":
    main()
