"""Page locations and the homepage's one separate tablet fragment."""
from pathlib import Path
from html import escape
ROOT = Path(__file__).resolve().parents[1]
PAGES = ("home", "technology", "company", "careers", "product", "request-demo")
ASSET_ALIASES = ("models", "implements")
REDIRECTS = {"product.html": "/product/", "contact/index.html": "/request-demo/", "contact.html": "/request-demo/", "technology.html": "/technology/", "company.html": "/company/"}

def read_page(name):
    html = (ROOT / name / "index.html").read_text()
    if name == "home":
        html = html.replace("<!-- tablet-showcase -->", (ROOT / "home/tablet/index.html").read_text())
    if name == "product":
        startup = (ROOT / "assets/product-3d/prepaint.js").read_text()
        html = html.replace("<!-- rover-startup -->", f"<script>{startup}</script>")
    return html

def redirect_page(target):
    target = escape(target, quote=True)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AgMove Robotics</title><meta http-equiv="refresh" content="0;url={target}"><script defer src="/shared/script.js"></script></head><body><a id="redirect-target" href="{target}">Continue to AgMove</a></body></html>'''
