# Lokale server voor het dashboard. Net als "python -m http.server", maar de browser
# bewaart geen oude versies van app.js/style.css: na een wijziging zie je meteen de nieuwe.
#
# Daarnaast: /api/yt-live?ch=@naam,channel/UC...  ->  {"@naam": {"v": videoId, "n": kijkers}} voor kanalen die live zijn.
# De browser mag YouTube niet zelf uitlezen (CORS), dus de server kijkt op youtube.com/<kanaal>/live.
import http.server
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
CHANNEL = re.compile(r"^(channel/UC[\w-]{22}|@[\w.-]{1,100}|c/[\w.-]{1,100}|user/[\w.-]{1,100})$")
CACHE_SECONDS = 50
cache = {}  # kanaalpad -> (tijdstip, resultaat of None)


def yt_live(ch):
    hit = cache.get(ch)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    req = urllib.request.Request(f"https://www.youtube.com/{ch}/live", headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "SOCS=CAI",  # sla de cookie-toestemmingspagina over
    })
    try:
        html = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "replace")
    except Exception:
        return hit[1] if hit else None  # bij een fout de vorige stand houden
    # Live: de /live-pagina verwijst naar een video die nu live is (geen geplande stream)
    m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', html)
    res = None
    if m and '"isLive":true' in html:
        n = re.search(r'"originalViewCount":"(\d+)"', html)
        res = {"v": m.group(1), "n": int(n.group(1)) if n else None}
    cache[ch] = (time.time(), res)
    return res


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/api/yt-live":
            return super().do_GET()
        chans = [c for c in urllib.parse.parse_qs(url.query).get("ch", [""])[0].split(",") if CHANNEL.match(c)][:200]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = dict(zip(chans, pool.map(yt_live, chans)))
        body = json.dumps({c: r for c, r in results.items() if r}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # geen regel per verzoek in het venster


http.server.ThreadingHTTPServer.allow_reuse_address = True
try:
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"Dashboard draait op {url}  (sluit dit venster om te stoppen)")
        webbrowser.open(url)
        httpd.serve_forever()
except OSError:
    print(f"Poort {PORT} is al in gebruik. Draait het dashboard al? Open dan http://localhost:{PORT}")
    webbrowser.open(f"http://localhost:{PORT}")
    input("Druk op Enter om af te sluiten...")
