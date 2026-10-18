"""Local dev server for Starbolt: static files with caching disabled so edits show on reload."""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        # Dev only: save a canvas capture (raw JPEG body) to shots/<name>.jpg for review.
        name = os.path.basename(self.path.split("?")[0]) or "shot"
        if not self.path.startswith("/shot/") or not name.replace("-", "").replace("_", "").isalnum():
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        os.makedirs("shots", exist_ok=True)
        with open(os.path.join("shots", name + ".jpg"), "wb") as f:
            f.write(body)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
