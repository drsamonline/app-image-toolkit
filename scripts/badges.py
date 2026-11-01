#!/usr/bin/env python3
"""badges.py — draw this repository's badges as local SVG files.

An offline-first app should not depend on an image service to describe itself,
and a page that breaks its own promise on the first screen is a bad joke. These
are drawn here, committed, and referenced by relative path — they render on
GitHub Pages, in the README, and from `file://` with no network at all.

The palette is the landing page's: warm paper, darkroom ink, safelight red.

  python3 scripts/badges.py
"""
import os
import re
import subprocess

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "assets")

INK = "#1b1915"        # darkroom ink
CREAM = "#f6f1e6"      # paper
TEAL = "#1f4b57"       # the demo band
GREEN = "#2f6b45"      # tests and build
SAFELIGHT = "#b5432c"  # licence

def test_count():
    """The number the suite actually prints — never a number typed from memory."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        out = subprocess.run(["node", "test-node.js"], cwd=root, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r"(\d+) passed, (\d+) failed", out.stdout)
    if not match or match.group(2) != "0":
        return None
    return int(match.group(1))


def runtime_deps():
    """Runtime dependencies, counted: external references plus a package manifest.

    An offline-first app that needs the network to describe itself has broken
    its own rule, so this number is computed from the files that ship.
    """
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    play = os.path.join(root, "docs", "play")
    count = 0
    for name in sorted(os.listdir(play)):
        if not name.endswith((".html", ".js", ".webmanifest")):
            continue
        with open(os.path.join(play, name), encoding="utf-8") as fh:
            text = fh.read()
        for url in re.findall(r"https?://[^\"'\s)]+", text):
            if re.search(r"w3\.org|schema\.org|ns\.adobe\.com|drsamonline\.github\.io|github\.com", url):
                continue          # namespaces and links, not loads
            count += 1
    if os.path.exists(os.path.join(root, "package.json")):
        count += 1
    return count


def main():
    os.makedirs(OUT, exist_ok=True)
    tests = test_count()
    deps = runtime_deps()
    badges = [
        ("live", "live", "online", TEAL),
        ("tests", "tests", "%d passing" % tests if tests else "see CI", GREEN),
        ("build", "build", "green", GREEN),
        ("licence", "licence", "PolyForm NC 1.0.0", SAFELIGHT),
        ("offline", "offline", "no network", INK),
        ("deps", "deps", "%d runtime" % deps, INK),
    ]
    for name, label, value, colour in badges:
        path = os.path.join(OUT, "badge-%s.svg" % name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(badge(label, value, colour))
        print("wrote", path, "->", value)

CH = 6.6  # approximate advance width at 11px in a monospace-ish sans


def badge(label, value, colour):
    lw = int(len(label) * CH) + 16
    vw = int(len(value) * CH) + 16
    total = lw + vw
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="22" role="img" '
        'aria-label="%s: %s">'
        '<title>%s: %s</title>'
        '<linearGradient id="s" x2="0" y2="100%%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/>'
        '<stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>'
        '<clipPath id="r"><rect width="%d" height="22" rx="4" fill="#fff"/></clipPath>'
        '<g clip-path="url(#r)">'
        '<rect width="%d" height="22" fill="%s"/>'
        '<rect x="%d" width="%d" height="22" fill="%s"/>'
        '<rect width="%d" height="22" fill="url(#s)"/>'
        "</g>"
        '<g fill="%s" font-family="ui-sans-serif,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" '
        'text-anchor="middle">'
        '<text x="%d" y="15">%s</text>'
        '<text x="%d" y="15">%s</text>'
        "</g></svg>"
    ) % (total, label, value, label, value, total, lw, INK, lw, vw, colour, total,
         CREAM, lw // 2, label, lw + vw // 2, value)


if __name__ == "__main__":
    main()
