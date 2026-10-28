# Image Toolkit

[![live](https://img.shields.io/badge/live-online-22c55e)](https://drsamonline.github.io/app-image-toolkit/)
[![license](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-informational)](LICENSE)

**Resize, compress, convert and strip the GPS out of a photo — on your device, with nothing uploaded.**

Every other "compress my image" page uploads the photo first. This one cannot: there
is no server, no account and no network request. The file is read into memory,
processed by the code in this repository, and written back out.

## What it does

| | |
|---|---|
| **Resize** | contain inside a box, aspect kept, never upscaled, never rounded to zero |
| **Compress** | the highest quality that still fits a byte budget — the search is six encoder calls, not a guess |
| **Convert** | JPEG, PNG, WebP, GIF and BMP in; JPEG, PNG or WebP out |
| **Strip** | EXIF, XMP, IPTC, JPEG comments; PNG `eXIf`/`tEXt`/`iTXt`/`zTXt` |
| **Say what happened** | before → after bytes, the percentage, the dimensions, and whether a GPS block was found and removed |

The pixels are never touched by the strip: everything from the JPEG scan onwards is
kept byte for byte, and the PNG colour and image chunks are copied whole.

## The done-means, as the spec states it

> A 4 MB photo is resized and compressed to under 500 KB without any network request.

`node test-node.js` proves the two halves separately and honestly: the budget search
is driven by a fake encoder whose output shrinks with quality (the way a real one
does), so "4 MB → under 500 KB" is a real assertion about the search; and the page is
checked to call no `fetch`, open no `XMLHttpRequest` and load nothing external. What
the test cannot prove is how a real browser's canvas encoder sizes a real photo — that
is the browser's answer, and the app reports the size it actually got.

## When things go wrong

- **Bad input** — a file that is not an image is refused with the type it reported; a
  photo whose EXIF cannot be read is still processed, and the app says the metadata
  could not be read, so nobody assumes the GPS was stripped.
- **No network** — nothing changes; the app never had one.
- **Storage full or the download refused** — the button says the file was not written
  and why; the image stays in memory.
- **Corrupt or truncated file** — the browser's decoder refuses it and the app says so
  rather than showing a smaller picture.
- **HEIC** — named as something a browser cannot draw, not silently skipped.

## Run it

    node test-node.js          # the proof: 73 assertions, no dependencies
    python3 -m http.server -d docs 8000   # then open http://localhost:8000/play/

There is no build step. `docs/play/` is the app.

## Layout

    docs/index.html        the landing page
    docs/play/index.html   the app
    docs/play/imgtool.js   the engine — sniff, dimensions, EXIF, strip, fit, budget
    docs/play/web-kit.js   vendored, unmodified
    docs/play/export-kit.js vendored, unmodified
    test-node.js           the proof

## Licence

PolyForm Noncommercial 1.0.0 — free for personal, hobby and educational use;
commercial use needs a paid licence. The engine file is MIT, as its header says.
© 2026 Dr Sohil Momin.
