# Changelog

Every entry names what changed and the assertion count at that tag. The count is
the number `node test-node.js` printed, not an estimate.

## 1.3.1 — 2026-11-01

The final audit of the code the last three releases added — the PDF writer, the
"everything" strip, the halving resize, the row-by-row repaint, auto format.

**A bug that had been there since the first release**

- A transparent PNG converted to JPEG came out with a **black** background. The
  canvas starts black, and the white fill was applied only when the metadata was
  *not* being stripped — the fill belongs to the output format, not to the strip.
  It is now keyed to the format, so a logo keeps a white background and a
  screenshot stops turning into a black box.

**Auto, and transparency**

- Auto compares JPEG and WebP — but JPEG has no alpha, and quietly turning a
  logo's background black to win a few kilobytes is not a trade the app should
  make on the user's behalf. A source that may carry transparency is compared
  against WebP alone, which keeps it.

**A switch that promised something it could not keep**

- "Keep the colour profile" is disabled while "remove every metadata block" is
  on, because that switch takes the profile too. The per-photo form does the
  same.

**Verified in the final pass**

- A batch of three where two files are not images: one result, two named
  failures, and the status line says "1 done, 2 failed".
- PNG with "everything" stripped keeps its alpha and still opens in a real
  decoder; the chunks left are IHDR, IDAT and IEND.
- A PDF built from a WebP result re-encodes it once on the way in and reads back
  as a valid page with one image.
- 206 assertions, 30 browser checks.

## 1.3.0 — 2026-11-01

The rest of the audit, and the best of what the other image tools do — taken as
ideas, not as dependencies. Nothing here adds a library, a network call or a
build step.

**From Squoosh**
- **Halving resize.** Shrinking by more than half in one `drawImage` throws away
  detail the sampler never sees; the app now halves repeatedly and draws the last
  step. Same trick pica and Squoosh use, no codec library.
- **Auto format.** Encodes JPEG and WebP against the same budget and keeps the
  smaller that fits. Squoosh's "compare the codecs" lesson, done without asking.

**From ExifTool**
- **"Every metadata block", not just the identifying ones.** Its `-all=`
  behaviour, matched: every APP segment goes except JFIF's APP0 and Adobe's
  APP14, which some decoders need to read the file at all. Maker notes and MPF
  indexes included.
- **The orientation nuance.** ExifTool has to restore `Orientation` after
  stripping because removing it turns the photo. This app applies the tag to the
  pixels first, so the file comes out upright without needing the tag back.
- **A metadata reader.** Make, model, date, software, artist, GPS — shown in the
  queue before anything is removed.

**From every image-to-PDF tool on the web**
- **Images into one A4 PDF.** The JPEG goes in as a JPEG — PDF has a filter for
  exactly that — so the bytes the app encoded are the bytes in the document, with
  no second generation. Written by hand: objects, xref table, trailer.

**The last of the audit**
- The list repaints one row at a time instead of all of them, so a batch no
  longer re-decodes every preview on every transition.
- An unrecognised APP1 block is named in words instead of a code, so "still
  there: an APP1 block we do not recognise" is what the badge says.
- The engine's `plan()` is gone — the view had its own localised version, and two
  implementations of one idea is one too many.

206 assertions, and 27 browser checks.

## 1.2.0 — 2026-11-01

The audit, answered. Every finding in `AUDIT` terms was either fixed or
deliberately kept, and the fixes have tests.

**The one that mattered**

- The strip now walks the whole JPEG — past every scan — instead of stopping at
  the first. Metadata is not required to sit before the first SOS: Android and
  Samsung writers put MPF/SEF blocks after it, and a walk that stopped early left
  the location in the file while the strip reported it gone.
- And the check no longer trusts the walk. `isClean()` searches the bytes for the
  EXIF, XMP and IPTC signatures themselves, wherever they sit, so a parser blind
  spot can no longer produce a "checked: nothing left" badge on a file that still
  carries the coordinates. It fails closed.

**The view — four defects no test could see, because there were no tests for it**

- A second run duplicated the results, so "Download all as ZIP" produced two
  entries with one name. A run now starts from nothing, and releases the object
  URLs the last one held.
- Changing a setting after a run replaced the results with the queue — the
  opposite of what the comment said, and of what 1.1.0 claimed. The results now
  stay, through a settings change and a language change.
- The drop zone was a `<label for>` with a click handler, so it opened the file
  picker twice. It is a real button now, and one thing opens the picker.
- That same change puts the file picker in the tab order, where it was not: a
  keyboard user could not add a photo at all.

**Smaller**

- The service worker no longer caches 404s and 500s, and no longer stores the
  page under its query string.
- The sample photo no longer freezes the page: the grain goes in slices, and the
  "painting" line gets a frame to appear before the work starts (1.7 s of frozen
  main thread before).
- ZIP entries are de-duplicated (`a.jpg`, `a (2).jpg`), and a batch too large for
  a non-zip64 archive is refused instead of silently corrupted.
- The EXIF-orientation fallback no longer double-rotates on browsers that apply
  the tag themselves.
- "Seven encoder calls, at the very worst" — the copy said six, and the code does
  seven when the budget cannot be reached.
- `NOTICE.md` and the README said the engine was MIT. It never was: it carries
  the project's PolyForm Noncommercial licence, and both documents now say so.
- A malformed PNG is refused rather than mangled; `bundle.py` fails instead of
  shipping a single file with a dangling reference; `icons.py` validates the
  master instead of slicing it; the three scripts that had no licence header have
  one.

**The proof**

- 191 assertions in `test-node.js`, including a real progressive JPEG from a real
  encoder — ten scans, restart markers — and a file with metadata after the scan.
- `scripts/uitest.py`: the app in headless Chromium, 17 checks, standard library
  only — the picker, the run, the ZIP, the language switch. The view has tests
  now, and they run in CI.

## 1.1.0 — 2026-11-01

**The queue**
- Every photo in the queue can carry its own settings — longest side, target
  size, format, crop, turn, strip and the colour profile — while the panel above
  stays the default for everything that follows it. A queue where every file had
  to share one setting was a queue that made you run the app twice.
- "Copy to the panel" lifts one photo's settings up to the rest.
- Changing a setting no longer replaces the results on screen with the queue
  again; the queue is still there, one run away.
- The budget chart's axis label is no longer clipped at the edge of its canvas.

165 assertions.

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
