"""Check page markup, local references and JavaScript syntax."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
import re
import subprocess
from common import ROOT, PAGES, REDIRECTS, ASSET_ALIASES, read_page

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.refs = []
        self.tags = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append(tag)
        if attrs.get("id"):
            if attrs["id"] in self.ids:
                self.errors.append(f'Duplicate id: {attrs["id"]}')
            self.ids.add(attrs["id"])
        self.refs.extend(attrs[key] for key in ("src", "href") if attrs.get(key))
        if tag == "img" and "alt" not in attrs:
            self.errors.append("Image missing alt attribute")

def check(root=ROOT):
    errors = []
    def reference(value, source):
        url = urlsplit(value)
        if url.scheme or url.netloc or not url.path:
            return
        path = unquote(url.path)
        target = root / path.lstrip("/") if path.startswith("/") else source.parent / path
        if path.lstrip("/") in REDIRECTS or path == "/":
            return
        if root == ROOT and path.startswith("/") and path.split("/")[1] in ASSET_ALIASES and (ROOT / "assets" / path.lstrip("/")).is_file():
            return
        if not target.exists():
            errors.append(f"{source.relative_to(root)}: missing {value}")
    for name in PAGES:
        path = root / name / "index.html"
        html = read_page(name) if root == ROOT else path.read_text()
        page = Page()
        page.feed(html)
        errors.extend(f"{name}: {error}" for error in page.errors)
        for tag in ("html", "head", "title", "main", "footer"):
            if page.tags.count(tag) != 1:
                errors.append(f"{name}: expected one {tag}")
        if "<!-- include:" in html or "<!-- tablet-showcase -->" in html:
            errors.append(f"{name}: unresolved HTML fragment")
        for ref in page.refs:
            reference(ref, path)
    for folder in (*PAGES, "shared"):
        for path in (root / folder).rglob("*"):
            if path.suffix == ".css":
                for ref in re.findall(r'url\([\s\"\']*([^\)\"\']+)', path.read_text()):
                    reference(ref.strip(), path)
            elif path.suffix == ".js":
                result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
                if result.returncode:
                    errors.append(result.stderr)
                for ref in re.findall(r'import\s+(?:[^;]*?from\s+)?[\"\']([^\"\']+)', path.read_text()):
                    reference(ref, path)
    if errors:
        raise ValueError("\n".join(errors))
    print(f"Checked all {len(PAGES)} pages, local references and JavaScript syntax")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--built", type=Path)
    args = parser.parse_args()
    check(args.built.resolve() if args.built else ROOT)
