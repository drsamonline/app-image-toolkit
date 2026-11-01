#!/usr/bin/env python3
"""shot.py — screenshot a page after it has settled, with no dependencies.

Chromium's `--screenshot` flag fires at load, which is too early for a page
that paints a sample, runs a search and renders a result: the shot shows the
"Working…" state. Virtual time does not help, because the work is real.

So this drives Chromium over the DevTools protocol with nothing but the
standard library — a small WebSocket client, three protocol calls, and a
poll on a JavaScript predicate the caller supplies.

    python3 scripts/shot.py <url> <out.png> [--width 1280] [--wait "js"]
                            [--settle 0.6] [--full] [--dark]

`--wait` is a JavaScript expression that must become true before the shot is
 taken. `--full` captures the whole scroll height; otherwise the viewport is
 captured at the given width and 1000 px tall unless --height says otherwise.
`--serve DIR` serves that directory on a loopback port and treats the URL as a
 path inside it — needed for a page that frames the app, which file:// refuses.
`--js EXPR` runs one more expression just before the capture, which is how a
 sticky header is pinned down: in a full-page capture it would otherwise be
 drawn at its current viewport offset, floating in the middle of the page.
"""
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request


class WS:
    """The smallest WebSocket client that can talk to the DevTools endpoint."""

    def __init__(self, url, timeout=60):
        host_port, path = url[5:].split("/", 1)
        host, port = host_port.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            "GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\n"
            "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n" % (path, host_port, key)
        ).encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise IOError("the DevTools endpoint closed the handshake")
            buf += chunk
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def _take(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 16)
            if not chunk:
                raise IOError("the DevTools socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        data = text.encode()
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        self.sock.sendall(bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        payload = b""
        while True:
            b1, b2 = self._take(2)
            op, fin, n = b1 & 0x0F, b1 & 0x80, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._take(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._take(8))[0]
            data = self._take(n)
            if op == 0x8:
                raise IOError("the DevTools socket closed")
            if op == 0x9:
                continue
            payload += data
            if fin:
                return payload.decode()


class CDP:
    def __init__(self, ws):
        self.ws, self.n = ws, 0

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError("%s: %s" % (method, msg["error"].get("message")))
                return msg.get("result", {})

    def eval(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        return r.get("result", {}).get("value")


def launch(chromium, width, height, dark, profile):
    args = [
        chromium, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--disable-extensions", "--disable-background-networking", "--disable-sync",
        "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1",
        "--user-data-dir=" + profile, "--window-size=%d,%d" % (width, height),
        "--remote-debugging-port=0", "about:blank",
    ]
    if dark:
        args.insert(1, "--force-dark-mode")
        args.insert(1, "--blink-settings=preferredColorScheme=0")
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    port_file = os.path.join(profile, "DevToolsActivePort")
    for _ in range(200):
        if os.path.exists(port_file):
            with open(port_file) as fh:
                port = fh.read().split("\n")[0].strip()
            if port:
                return proc, int(port)
        time.sleep(0.1)
    proc.kill()
    raise RuntimeError("Chromium did not open a debugging port")


def page_ws(port):
    for _ in range(100):
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2) as r:
                for t in json.load(r):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        return t["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.1)
    raise RuntimeError("no page target on the debugging port")


def serve_dir(path):
    """Serve a directory on a loopback port, so a page that frames the app can
    actually frame it. file:// is not enough: a same-origin frame there is
    treated as opaque and the demo band falls back to its poster."""
    import functools
    import threading
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=path))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def shoot(url, out, width=1280, height=1000, wait=None, settle=0.6, full=False, dark=False, serve=None, js=None):
    chromium = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    if not chromium:
        raise SystemExit("no chromium on PATH")
    server = None
    if serve:
        server = serve_dir(serve)
        if not url.startswith(("http://", "https://", "file://")):
            url = "http://127.0.0.1:%d/%s" % (server.server_address[1], url.lstrip("/"))
    profile = tempfile.mkdtemp(prefix="shot-")
    proc, port = launch(chromium, width, height, dark, profile)
    try:
        cdp = CDP(WS(page_ws(port)))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=width, height=height,
                 deviceScaleFactor=1, mobile=width < 600)
        cdp.call("Page.navigate", url=url)
        deadline = time.time() + 90
        while time.time() < deadline:
            if cdp.eval("document.readyState === 'complete'"):
                break
            time.sleep(0.1)
        if wait:
            while time.time() < deadline:
                try:
                    if cdp.eval("!!(%s)" % wait):
                        break
                except RuntimeError:
                    pass
                time.sleep(0.15)
            else:
                print("warning: the wait predicate never became true", file=sys.stderr)
        time.sleep(settle)
        if js:
            cdp.eval(js)
            time.sleep(0.15)
        params = {"format": "png", "captureBeyondViewport": True, "fromSurface": True}
        if full:
            metrics = cdp.call("Page.getLayoutMetrics")
            size = metrics.get("cssContentSize") or metrics.get("contentSize")
            params["clip"] = {"x": 0, "y": 0, "width": width,
                              "height": min(6000, int(size["height"])), "scale": 1}
        data = cdp.call("Page.captureScreenshot", **params)["data"]
        with open(out, "wb") as fh:
            fh.write(base64.b64decode(data))
        print("wrote %s (%d bytes)" % (out, os.path.getsize(out)))
    finally:
        proc.kill()
        proc.wait()
        shutil.rmtree(profile, ignore_errors=True)
        if server:
            server.shutdown()


def main(argv):
    args, flags, i = [], {}, 1
    while i < len(argv):
        a = argv[i]
        if a.startswith("--"):
            key = a[2:]
            if key in ("full", "dark"):
                flags[key] = True
            else:
                i += 1
                flags[key] = argv[i]
        else:
            args.append(a)
        i += 1
    if len(args) < 2:
        raise SystemExit(__doc__)
    shoot(args[0], args[1],
          width=int(flags.get("width", 1280)),
          height=int(flags.get("height", 1000)),
          wait=flags.get("wait"),
          settle=float(flags.get("settle", 0.6)),
          full=bool(flags.get("full")),
          dark=bool(flags.get("dark")),
          serve=flags.get("serve"),
          js=flags.get("js"))


if __name__ == "__main__":
    main(sys.argv)
