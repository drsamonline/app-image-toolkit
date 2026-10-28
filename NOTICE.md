# NOTICE

## Image Toolkit

Copyright (c) 2026 Sohil Anwarbhai Momin. Dual-licensed — see `LICENSE`.
Free for personal, hobby, educational and other non-commercial use; commercial
use requires a paid licence.

## The engine

`docs/play/imgtool.js` is the whole app: it sniffs the format from the file's own
bytes (never its name), reads the dimensions from the header, walks the JPEG
segments to the scan, reads the EXIF/TIFF directory to find the GPS block, removes
the identifying segments and chunks, computes the contain-fit and searches for the
highest quality that still fits a byte budget. It has no dependencies, no network
call and no build step. It is MIT, as its header says.

Two honest limits, stated because the app says them too:

- **A browser cannot draw HEIC/HEIF.** The file is recognised and named, and the
  app refuses it with the reason instead of pretending the conversion happened.
- **The encoder is the browser's own.** `budget()` searches quality; how small a
  file gets at a given quality is the canvas encoder's answer, not ours.

## The kits it vendors

`docs/play/web-kit.js` and `docs/play/export-kit.js` are copied in from
`drsamonline/web-kit` and `drsamonline/export-kit` so the app runs offline as
plain files. They are MIT; the copies here are unmodified.

## The data

None. There is no dataset, no model and no API key. A photo is read into memory,
processed, and written back out — nothing is stored and nothing is sent.
