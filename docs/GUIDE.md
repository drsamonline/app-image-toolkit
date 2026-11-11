# Image Toolkit — user guide

**Version 1.3.2 · PolyForm Noncommercial 1.0.0**

Resize, crop, compress, convert and strip metadata from images — in the browser, with nothing
uploaded anywhere.

## What it does

| | |
|---|---|
| **Resize** | contain inside a box, aspect kept, never upscaled, never rounded to zero |
| **Crop and turn** | square, 4:3, 3:4, 16:9, 9:16; 90°/180°; mirror — and the **EXIF orientation is read before the strip**, so a portrait photo is not written out sideways |
| **Compress** | the highest quality that still fits a byte budget — a binary search, seven encoder calls at the very worst, drawn as a curve |
| **Convert** | JPEG, PNG, WebP, GIF and BMP in; JPEG, PNG or WebP out — or **Auto**, which encodes two and keeps the smaller (a source that may carry transparency is compared against WebP alone, because JPEG would flatten it) |
| **Strip** | EXIF, XMP, IPTC, JPEG comments; PNG `eXIf`/`tEXt`/`iTXt`/`zTXt` — the colour profile is kept unless you say otherwise, and "every metadata block" takes the maker notes too |
| **Check** | the **output bytes are read back**: "checked: nothing left" means the file that will be written really has nothing identifying in it |
| **Inspect** | before anything is removed, the queue shows what the file says about itself — camera, model, date, whether there is a GPS block |
| **Batch** | paste a screenshot in, queue as many as you like, give any one its own settings, leave with one ZIP, one A4 PDF, or a per-file report of exactly what was done |

The pixels are never touched by the strip: everything from the JPEG scan onwards is kept byte for
byte.

## The check is the feature

Most tools strip metadata and tell you they did. This one **reads the output back** and reports what
is actually in the bytes it is about to write. "Checked: nothing left" is a statement about your
file, not about the tool's intent.

That matters because a photo you post with GPS still in it has told the internet where you live, and
the strip you thought you ran is the only thing that was supposed to prevent it.

## What it refuses to do

- No upload, no endpoint, no `fetch`, no XHR — asserted across every shipped file, not promised in
  prose.
- No account, no sign-in, no analytics, no telemetry.
- No runtime dependency: `imgtool.js` is one file of plain JavaScript with no imports.
- No build step, no bundler, no framework.
- **No silent failure**: a file that is not an image is refused with the type it reported; a HEIC is
  named as something a browser cannot draw, with the way out; unreadable metadata is reported as
  unreadable; a download that cannot be written says so.
- A footer counter watches for any request that leaves this origin and stays at **zero**.

## Licence

PolyForm Noncommercial 1.0.0. See [LICENSE](../LICENSE).
