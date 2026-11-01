#!/usr/bin/env python3
"""icons.py — every icon this project needs, drawn from one SVG.

`assets/icon.svg` is the master. This rasterises it with headless Chromium —
the same browser the app runs in, so the mark looks like what it will look like
on screen — and writes the whole set:

  docs/play/icons/icon-16 … 512.png    the browser tab and the PWA
  docs/play/icons/icon-maskable-512.png  Android, content inside the 66 % safe zone
  docs/play/icons/app.ico                Windows, 16/32/48/256 in one file
  docs/icon.png                          the 512 the build kit uses for the EXE/APK

No image library, no image service, no dependency: an offline-first project must
not ask the network to draw its own face.

  python3 scripts/icons.py
PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
"""
import os
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, "assets", "icon.svg")
OUT = os.path.join(ROOT, "docs", "play", "icons")

SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512]
ICO_SIZES = [16, 32, 48, 256]

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}
svg,img{display:block;width:100vw;height:100vh}</style></head>
<body>%s</body></html>"""


def chromium():
    for name in ("chromium", "chromium-browser", "google-chrome"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("no chromium on PATH — this script rasterises with the browser")


def rasterise(svg_markup, size, workdir, tag):
    page = os.path.join(workdir, "icon-%s.html" % tag)
    png = os.path.join(workdir, "icon-%s-%d.png" % (tag, size))
    with open(page, "w", encoding="utf-8") as fh:
        fh.write(PAGE % svg_markup)
    subprocess.run([
        chromium(), "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--default-background-color=00000000",
        "--force-device-scale-factor=1",
        "--window-size=%d,%d" % (size, size),
        "--screenshot=" + png,
        "file://" + page,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    with open(png, "rb") as fh:
        return fh.read()


def maskable_source(master_svg):
    """The master, inset to 66 % of a full-bleed background.

    Android crops a maskable icon to whatever shape the launcher likes; content
    outside the middle 66 % is not guaranteed to survive. The background is
    painted edge to edge, so there are no transparent corners to fill in.
    """
    text = master_svg.strip()
    if not text.startswith("<svg"):
        raise SystemExit("assets/icon.svg must begin with <svg …> — no XML declaration, no comment above it")
    if "</svg>" not in text:
        raise SystemExit("assets/icon.svg has no closing tag")
    inner = text[text.index(">") + 1:text.rindex("</svg>")]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<rect width="512" height="512" fill="#17262b"/>'
        '<svg x="87" y="87" width="338" height="338" viewBox="0 0 512 512">%s</svg>'
        "</svg>" % inner
    )


def ico(images):
    """A multi-size .ico holding PNG entries, which every Windows since Vista reads."""
    header = struct.pack("<HHH", 0, 1, len(images))
    entries, blobs = b"", b""
    offset = 6 + 16 * len(images)
    for size, blob in images:
        side = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", side, side, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
        blobs += blob
    return header + entries + blobs


def main():
    if not os.path.exists(MASTER):
        raise SystemExit("no master at assets/icon.svg")
    with open(MASTER, encoding="utf-8") as fh:
        master = fh.read()
    os.makedirs(OUT, exist_ok=True)

    workdir = tempfile.mkdtemp(prefix="icons-")
    try:
        for size in SIZES:
            blob = rasterise(master, size, workdir, "app")
            path = os.path.join(OUT, "icon-%d.png" % size)
            with open(path, "wb") as fh:
                fh.write(blob)
            print("wrote %s (%d bytes)" % (os.path.relpath(path, ROOT), len(blob)))

        maskable = maskable_source(master)
        blob = rasterise(maskable, 512, workdir, "maskable")
        path = os.path.join(OUT, "icon-maskable-512.png")
        with open(path, "wb") as fh:
            fh.write(blob)
        print("wrote %s (%d bytes)" % (os.path.relpath(path, ROOT), len(blob)))

        images = []
        for size in ICO_SIZES:
            images.append((size, rasterise(master, size, workdir, "ico")))
        path = os.path.join(OUT, "app.ico")
        with open(path, "wb") as fh:
            fh.write(ico(images))
        print("wrote %s (%d bytes, %s)" % (os.path.relpath(path, ROOT), os.path.getsize(path),
                                           "/".join(str(s) for s in ICO_SIZES)))

        big = rasterise(master, 512, workdir, "kit")
        path = os.path.join(ROOT, "docs", "icon.png")
        with open(path, "wb") as fh:
            fh.write(big)
        print("wrote %s (%d bytes)" % (os.path.relpath(path, ROOT), len(big)))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
