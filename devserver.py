"""Local dev server — serves PlanetaryPulse with no-cache headers so every
browser refresh always gets the latest file off disk. Run: python devserver.py"""
import http.server, socketserver, os

PORT = 3001
ROOT = os.path.dirname(os.path.abspath(__file__))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # suppress request noise

print(f"EarthPulse dev server -> http://localhost:{PORT}")
print("Normal refresh (F5) is enough — caching is disabled.")
print("Ctrl+C to stop.\n")
with socketserver.TCPServer(("", PORT), NoCacheHandler) as srv:
    srv.serve_forever()
