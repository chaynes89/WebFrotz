"""Run the retained portable core/model regressions under Emscripten + Node."""
import shutil
from build_wasm import ROOT, compiler, run


def main():
    build = ROOT / ".build" / "regression"
    build.mkdir(parents=True, exist_ok=True)
    cc, cxx = compiler("emcc"), compiler("em++")
    objects = []
    for source in sorted((ROOT / "Generic").glob("*.c")):
        obj = build / (source.stem + ".o")
        run([cc, "-O2", "-std=c99", "-I", ROOT / "Generic",
             *(["-Dmain=frotz_main"] if source.name == "main.c" else []),
             "-c", source, "-o", obj])
        objects.append(obj)
    core = build / "core.cjs"
    run([cc, *objects, ROOT / "tests" / "CoreHostTests.c",
         "-I", ROOT / "Generic", "-O2", "-sENVIRONMENT=node", "-sNODERAWFS=1",
         "-o", core])
    model = build / "map.cjs"
    run([cxx, ROOT / "Frontend" / "AutoMap.cpp", ROOT / "tests" / "AutoMapTests.cpp",
         "-I", ROOT / "Frontend", "-std=c++14", "-O2", "-fexceptions",
         "-sENVIRONMENT=node", "-o", model])
    run(["python", ROOT / "tests" / "make_story.py", build / "stories"])
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required to run portable WASM regressions.")
    run([node, model])
    for version in (1, 2, 3, 5):
        run([node, core, build / "stories" / f"fixture.z{version}"])


if __name__ == "__main__":
    main()
