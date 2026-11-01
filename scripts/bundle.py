#!/usr/bin/env python3
"""bundle.py — fold the app into one file that runs from anywhere.

`docs/play/` is already buildless: six scripts and a page. This writes the same
app as a single `dist/image-toolkit.html` with every script inlined, which is
the strongest form of "no internet" there is — it opens from a USB stick, from
an email attachment, from a phone's Downloads folder, with no server at all.

  python3 scripts/bundle.py            # -> dist/image-toolkit.html
  python3 scripts/bundle.py out.html

PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAY = os.path.join(ROOT, "docs", "play")


def inline(html, play):
    missing = []

    def script(match):
        src = match.group(1)
        path = os.path.join(play, src)
        if not os.path.exists(path):
            missing.append(src)
            return match.group(0)
        with open(path, encoding="utf-8") as fh:
            code = fh.read()
        if "</script" in code.lower():
            raise SystemExit("%s contains a closing script tag; it cannot be inlined" % src)
        return "<script>\n/* ---- %s ---- */\n%s\n</script>" % (src, code)

    html = re.sub(r'<script src="([^"]+)"></script>', script, html)

    # A single file has no siblings, so the links that point at them go.
    for pattern in (r'<link rel="manifest"[^>]*>\s*',
                    r'<link rel="icon"[^>]*>\s*',
                    r'<link rel="apple-touch-icon"[^>]*>\s*'):
        html = re.sub(pattern, "", html)

    if missing:
        raise SystemExit("could not find: " + ", ".join(missing))
    return html


def main(argv):
    out = argv[1] if len(argv) > 1 else os.path.join(ROOT, "dist", "image-toolkit.html")
    page = os.path.join(PLAY, "index.html")
    with open(page, encoding="utf-8") as fh:
        html = fh.read()

    html = inline(html, PLAY)
    html = html.replace("<title>", "<!-- Image Toolkit, one file. Nothing here loads anything. -->\n<title>", 1)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("wrote %s (%d KB, %d external references left)" % (
        os.path.relpath(out, ROOT), len(html) // 1024,
        len(re.findall(r'(?:src|href)="(?:https?:)?//', html))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
