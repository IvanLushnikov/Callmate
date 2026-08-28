#!/usr/bin/env python3
"""Static UI + /api proxy for local dev (avoids CORS to callmate-api.onrender.com)."""

from __future__ import annotations

import http.server
import socketserver
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_UPSTREAM = "https://callmate-api.onrender.com"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def do_OPTIONS(self) -> None:
        if self.path.startswith("/api/"):
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        super().do_OPTIONS()

    def _proxy(self) -> None:
        url = API_UPSTREAM + self.path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        headers = {
            k: self.headers[k]
            for k in ("Content-Type", "Authorization", "Accept")
            if k in self.headers
        }
        req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
        ctx = ssl.create_default_context()
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                payload = resp.read()
                self.send_response(resp.status)
                self._cors()
                for key, val in resp.headers.items():
                    if key.lower() not in HOP_BY_HOP:
                        self.send_header(key, val)
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as err:
            payload = err.read()
            self.send_response(err.code)
            self._cors()
            ctype = err.headers.get("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Type", ctype)
            self.end_headers()
            self.wfile.write(payload)

    def _dispatch(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            super().do_GET()

    do_GET = _dispatch

    def do_POST(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            super().do_POST()

    def do_PUT(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            self.send_error(405)

    def do_PATCH(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            self.send_error(405)

    def do_DELETE(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            self.send_error(405)


class ReusableServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    with ReusableServer(("", PORT), DevHandler) as httpd:
        print(f"CallMate dev server: http://127.0.0.1:{PORT}/", file=sys.stderr)
        print(f"API proxy → {API_UPSTREAM}", file=sys.stderr)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
