"""Local preview: python3 tools/serve.py --port 4173."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote
from io import BytesIO
import argparse
from common import ROOT, ASSET_ALIASES, REDIRECTS, read_page, redirect_page

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        path = urlsplit(self.path).path
        public = (ROOT / "assets" / unquote(path).lstrip("/")).resolve()
        if path.split("/")[1] in ASSET_ALIASES and public.is_relative_to(ROOT / "assets") and public.is_file():
            data = public.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(public)))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return BytesIO(data)
        if path in ("/", "/index.html", "/home/", "/home/index.html"):
            html = read_page("home")
        elif path in ("/product/", "/product/index.html", "/product"):
            html = read_page("product")
        elif path.rstrip("/") == "/contact":
            html = redirect_page("/request-demo/")
        elif path.lstrip("/") in REDIRECTS:
            html = redirect_page(REDIRECTS[path.lstrip("/")])
        else:
            return super().send_head()
        data = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        return BytesIO(data)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        print(f"Open http://127.0.0.1:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
