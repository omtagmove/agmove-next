"""Build only runtime files into dist, with inline tablet and Product startup."""
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import json
from common import ROOT, PAGES, REDIRECTS, ASSET_ALIASES, read_page, redirect_page
MARKER = ".agmove-build.json"

def build(output=None):
    output = Path(output or ROOT / "dist")
    if output.is_symlink():
        raise ValueError("Build output must not be a symlink")
    output = output.resolve()
    if output == ROOT or output in ROOT.parents or ROOT in output.parents and output != ROOT / "dist":
        raise ValueError("Build output must not replace source folders")
    if output.exists() and (not output.is_dir() or any(output.iterdir()) and not (output / MARKER).is_file()):
        raise ValueError("Refusing to replace a non-generated directory")
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".agmove-build-", dir=output.parent) as temp:
        stage = Path(temp) / "site"
        stage.mkdir()
        # Publish only browser files. Source components, tools, raw images and
        # build metadata can never enter dist through a recursive page copy.
        runtime = [f"{page}/{file}" for page in PAGES for file in ("style.css", "script.js")]
        runtime += ["shared/style.css", "shared/script.js", "home/tablet/style.css",
                    "home/tablet/script.js", "technology/autonomy.css",
                    "technology/autonomy.js", "product/rover/style.css"]
        for name in runtime:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        for source in (ROOT / "assets").rglob("*"):
            relative = source.relative_to(ROOT / "assets")
            if not source.is_file() or relative.parts[0] == "product-3d":
                continue
            if relative.parts[0] == "models":
                if str(relative) not in ("models/rover.glb", "models/rover-assets.json"):
                    continue
            elif source.suffix.lower() not in (".css", ".js", ".svg", ".png", ".jpg", ".webp", ".woff2", ".txt"):
                continue
            target = stage / relative if relative.parts[0] in ASSET_ALIASES else stage / "assets" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        # The bundler's manifest is the sole authority for generated JS/chunks
        # and their license notices. The startup script is already in the head.
        outputs = json.loads((ROOT / "assets/product-3d/build-report.json").read_text())
        for item in outputs:
            relative = Path(item["file"])
            if relative.is_absolute() or ".." in relative.parts or relative.parts[:2] != ("assets", "product-3d"):
                raise ValueError("Invalid Product bundle path")
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        for name in PAGES:
            (stage / name / "index.html").write_text(read_page(name))
        (stage / "index.html").write_text(read_page("home"))
        for name, target in REDIRECTS.items():
            (stage / name).parent.mkdir(parents=True, exist_ok=True)
            (stage / name).write_text(redirect_page(target))
        (stage / MARKER).write_text('{"generator":"agmove-static"}\n')
        previous = Path(temp) / "previous"
        if output.exists():
            output.rename(previous)
        try:
            stage.rename(output)
        except OSError:
            if previous.exists():
                previous.rename(output)
            raise
    return output

if __name__ == "__main__":
    build()
    print(f"Built {len(PAGES)} pages and {len(REDIRECTS)} compatibility routes into dist/")
