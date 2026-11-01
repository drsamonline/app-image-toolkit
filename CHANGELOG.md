# Changelog

Every entry names what changed and the assertion count at that tag. The count is
the number `node test-node.js` printed, not an estimate.

## 1.0.0 — 2026-11-01

The first release: the app, the landing page, and the proof.

**The work**
- Resize to a box, compress to a byte budget, convert, crop, rotate, mirror.
- The EXIF orientation tag is read **before** the strip and applied to the
  pixels — a portrait photo no longer comes out on its side, which was the one
  case where removing metadata visibly changed the picture.
- The strip is verified on the **output** bytes, not just described from the
  input: the app shows "checked: nothing left" only when the written file really
  has no EXIF, XMP, IPTC, comment, `eXIf`, `tEXt`, `iTXt` or `zTXt` left in it.
- The colour profile is kept by default and can be dropped on request.
- A batch can be exported as one store-only ZIP, written by hand in the engine.
- A per-file report can be saved next to the image: what was removed, what was
  checked, the quality chosen.
- Paste a screenshot straight in with Ctrl/⌘+V.
- A before/after wipe, and a curve of the six encoder calls the budget search
  actually made.

**The promises, made checkable**
- A live counter in the footer: network requests from anywhere but this origin,
  and zero bytes leaving the page.
- 162 assertions, including a scan of every shipped file for an external
  reference, a `fetch(`, an XHR or a remote `@import`; the vendored kits hashed
  against `NOTICE.md`; and one version number in `VERSION`, `version.js` and the
  service worker's cache name.

**The surface**
- Installable: a manifest, a generated icon set (16 → 512, maskable, `.ico`), and
  a service worker that serves the page network-first and bumps its cache on
  every release.
- English, Hindi and Gujarati, from one string table.
- Light and dark, following the system preference, with a remembered override.
- One-file build: `python3 scripts/bundle.py` writes the whole app as a single
  HTML file that runs from a USB stick.

**The presentation**
- A landing page designed for this project, with the real app framed inside it
  and four guided cases driving it.
- A sample photo painted on a canvas — 3200 × 2400, grained, with a real EXIF
  block and a real GPS fix — so a first visit with no photo can still see the
  tool work. Nothing bundled, nothing fetched.
- Badges drawn locally, with the test count and the dependency count computed
  rather than typed.
