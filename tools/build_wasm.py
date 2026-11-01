"""Build the unmodified Frotz core and browser adapter with Emscripten 4.0.18."""
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def compiler(name):
    executable = shutil.which(name)
    if executable:
        return executable
    sdk = Path(os.environ.get("EMSDK", ROOT / ".build" / "emsdk"))
    path = sdk / "upstream" / "emscripten" / (name + (".bat" if os.name == "nt" else ""))
    if not path.exists():
        raise SystemExit("Emscripten not found. Install/activate emsdk 4.0.18; see README.")
    return str(path)


def run(args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def main():
    build = ROOT / ".build" / "wasm"
    output = ROOT / "public" / "wasm"
    build.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "COPYING", ROOT / "public" / "COPYING.txt")
    cc, cxx = compiler("emcc"), compiler("em++")
    flags = ["-O2", "-I", ROOT / "Generic", "-I", ROOT / "Frontend"]
    objects = []
    for source in sorted((ROOT / "Generic").glob("*.c")):
        obj = build / (source.stem + ".o")
        definitions = ["-Dmain=frotz_main"] if source.name == "main.c" else []
        run([cc, *flags, "-std=c99", *definitions, "-c", source, "-o", obj])
        objects.append(obj)
    for source in [ROOT / "web" / "host.c", ROOT / "Frontend" / "AutoMap.cpp",
                   ROOT / "web" / "map_bridge.cpp"]:
        obj = build / (source.stem + ".o")
        run([cc if source.suffix == ".c" else cxx, *flags,
             "-std=gnu99" if source.suffix == ".c" else "-std=c++14",
             "-c", source, "-o", obj])
        objects.append(obj)
    run([cxx, *objects, "-O2", "-o", output / "frotz.js",
         "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sENVIRONMENT=worker",
         "-sASYNCIFY=1", "-sASYNCIFY_STACK_SIZE=131072",
         "-sALLOW_MEMORY_GROWTH=1", "-sMAXIMUM_MEMORY=268435456",
         "-sSTACK_SIZE=1048576", "-sFORCE_FILESYSTEM=1",
         "-sEXPORTED_FUNCTIONS=['_web_run','_web_map_import_room','_web_map_import_connection','_malloc','_free']",
         "-sEXPORTED_RUNTIME_METHODS=['FS','ccall','UTF8ToString']",
         "-sASSERTIONS=1", "-sEXIT_RUNTIME=0"])
    print("Built public/wasm/frotz.js and frotz.wasm")


if __name__ == "__main__":
    main()
