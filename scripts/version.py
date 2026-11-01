#!/usr/bin/env python3
"""version.py — one version, written everywhere it appears.

`VERSION` at the repository root is the only place a version number is typed.
This writes it into the two files that have to carry it — the app's
`version.js`, which the footer prints, and the cache name in `sw.js`, which has
to change or a returning reader keeps the old page — and prints what it did.

  python3 scripts/version.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAY = os.path.join(ROOT, "docs", "play")


def main():
    with open(os.path.join(ROOT, "VERSION"), encoding="utf-8") as fh:
        version = fh.read().strip()
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        raise SystemExit("VERSION must look like 1.2.3, not %r" % version)

    target = os.path.join(PLAY, "version.js")
    with open(target, "w", encoding="utf-8") as fh:
        fh.write(
            "/* version.js — written by scripts/version.py from VERSION. Do not edit. */\n"
            'self.IMAGE_TOOLKIT = { version: "%s" };\n' % version
        )
    print("wrote", os.path.relpath(target, ROOT), "->", version)

    worker = os.path.join(PLAY, "sw.js")
    with open(worker, encoding="utf-8") as fh:
        source = fh.read()
    updated = re.sub(r'var CACHE = "[^"]*";', 'var CACHE = "image-toolkit-v%s";' % version, source, count=1)
    if updated != source:
        with open(worker, "w", encoding="utf-8") as fh:
            fh.write(updated)
        print("bumped the cache name in", os.path.relpath(worker, ROOT), "->", version)
    else:
        print("cache name already at", version)

    manifest = os.path.join(PLAY, "manifest.webmanifest")
    if os.path.exists(manifest):
        print("manifest is unchanged by a version bump (it carries no version)")


if __name__ == "__main__":
    sys.exit(main())
