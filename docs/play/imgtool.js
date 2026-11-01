/* imgtool.js — the engine behind Image Toolkit.
 *
 * The five things people actually do to a photo before sending it — resize,
 * compress, convert, crop to a budget, and strip the metadata that carries GPS —
 * done on the device, on bytes, with no network and no dependency.
 *
 * Everything here is pure: bytes in, bytes (or a number) out. The page in
 * index.html is a view over these functions, so the tests in test-node.js test
 * what the app actually does.
 *
 * UMD so the same file runs in the browser and under `node test-node.js`.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ImgTool = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------------------------------------------------------- bytes */

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== "undefined" && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (Array.isArray(input)) return Uint8Array.from(input);
    throw new TypeError("expected bytes");
  }

  function ascii(b, from, to) {
    var s = "";
    for (var i = from; i < to && i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  function u16be(b, i) { return (b[i] << 8) | b[i + 1]; }
  function u16le(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32be(b, i) { return ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]); }
  function i32le(b, i) { return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24); }

  /* ---------------------------------------------------------------- sniff */

  // What the file IS, from its first bytes — never from its name, which lies.
  var FORMATS = [
    { format: "jpeg", mime: "image/jpeg", ext: "jpg", test: function (b) { return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF; } },
    { format: "png", mime: "image/png", ext: "png", test: function (b) { return b[0] === 0x89 && ascii(b, 1, 4) === "PNG"; } },
    { format: "gif", mime: "image/gif", ext: "gif", test: function (b) { return ascii(b, 0, 4) === "GIF8"; } },
    { format: "webp", mime: "image/webp", ext: "webp", test: function (b) { return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP"; } },
    { format: "bmp", mime: "image/bmp", ext: "bmp", test: function (b) { return b[0] === 0x42 && b[1] === 0x4D; } },
    { format: "avif", mime: "image/avif", ext: "avif", test: function (b) { return ascii(b, 4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(b, 8, 12)); } },
    // Recognised so the app can name it, refused because no browser can draw it.
    { format: "heic", mime: "image/heic", ext: "heic", supported: false, test: function (b) { return ascii(b, 4, 8) === "ftyp" && /^(heic|heix|mif1|msf1)$/.test(ascii(b, 8, 12)); } }
  ];

  function sniff(input) {
    var b = toBytes(input);
    if (b.length < 12) return null;
    for (var i = 0; i < FORMATS.length; i++) {
      if (FORMATS[i].test(b)) {
        return {
          format: FORMATS[i].format,
          mime: FORMATS[i].mime,
          ext: FORMATS[i].ext,
          supported: FORMATS[i].supported !== false
        };
      }
    }
    return null;
  }

  /* ----------------------------------------------------------- dimensions */

  // JPEG: walk the markers to the frame header. PNG/GIF/BMP: read the header.
  var SOF = { 0xC0: 1, 0xC1: 1, 0xC2: 1, 0xC3: 1, 0xC5: 1, 0xC6: 1, 0xC7: 1, 0xC9: 1, 0xCA: 1, 0xCB: 1, 0xCD: 1, 0xCE: 1, 0xCF: 1 };

  function dimensions(input) {
    var b = toBytes(input);
    var f = sniff(b);
    if (!f) return null;
    if (f.format === "png") {
      if (b.length < 24) return null;                  // no room for an IHDR
      return { width: u32be(b, 16), height: u32be(b, 20) };
    }
    if (f.format === "gif") return { width: u16le(b, 6), height: u16le(b, 8) };
    if (f.format === "bmp") return { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) };
    if (f.format === "webp") {
      var kind = ascii(b, 12, 16);
      if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (kind === "VP8 ") return { width: u16le(b, 26) & 0x3FFF, height: u16le(b, 28) & 0x3FFF };
      return null;
    }
    if (f.format === "jpeg") {
      var segs = jpegSegments(b);
      for (var i = 0; i < segs.length; i++) {
        if (SOF[segs[i].marker]) {
          return { width: u16be(b, segs[i].start + 7), height: u16be(b, segs[i].start + 5) };
        }
      }
      return null;
    }
    return null;
  }

  /* ------------------------------------------------------- jpeg segments */

  var MARKER_NAMES = {
    0xE0: "APP0", 0xE1: "APP1", 0xE2: "APP2", 0xE3: "APP3", 0xE4: "APP4", 0xE5: "APP5",
    0xE6: "APP6", 0xE7: "APP7", 0xE8: "APP8", 0xE9: "APP9", 0xEA: "APP10", 0xEB: "APP11",
    0xEC: "APP12", 0xED: "APP13", 0xEE: "APP14", 0xEF: "APP15", 0xFE: "COM", 0xDA: "SOS",
    0xDB: "DQT", 0xC4: "DHT", 0xDD: "DRI"
  };

  // The whole structure of a JPEG, in file order — not just the part before the
  // first scan.
  //
  // This matters for privacy. Metadata is not required to sit before the first
  // scan: Android and Samsung writers put MPF/SEF blocks after it, and a
  // multi-scan JPEG can carry an APPn between two scans. A walk that stops at
  // the first SOS therefore leaves an EXIF block in the file while the strip
  // reports it gone — a check that fails open, which is the worst kind.
  //
  // Returns pieces in file order: segments, and the entropy-coded runs between
  // them, so a caller can rebuild the file exactly, minus what it removes.
  // Inside a scan, 0xFF is only ever followed by 0x00 (stuffing), 0xD0–0xD7
  // (restart) or 0xFF (fill); anything else is a real marker.
  function jpegPieces(input) {
    var b = toBytes(input);
    var out = [];
    if (!(b[0] === 0xFF && b[1] === 0xD8)) return out;
    var i = 2, rawFrom = -1;

    function raw() { if (rawFrom < 0) rawFrom = i; }
    function flush(to) {
      if (rawFrom >= 0 && to > rawFrom) out.push({ kind: "raw", start: rawFrom, end: to });
      rawFrom = -1;
    }

    while (i < b.length - 1) {
      if (b[i] !== 0xFF) { raw(); i++; continue; }
      var m = b[i + 1];
      if (m === 0xFF || m === 0x00 || (m >= 0xD0 && m <= 0xD7) || m === 0xD8 || m === 0x01) {
        raw(); i += m === 0xFF ? 1 : 2; continue;      // fill, stuffed, restart, SOI, TEM
      }
      var len = u16be(b, i + 2);
      if (len < 2 || i + 2 + len > b.length) { raw(); i += 2; continue; }   // not a segment after all
      flush(i);
      out.push({
        kind: "segment",
        marker: m,
        name: MARKER_NAMES[m] || ("0x" + m.toString(16).toUpperCase()),
        start: i,
        length: len,
        dataStart: i + 4,
        dataLength: len - 2,
        payload: ascii(b, i + 4, Math.min(i + 4 + 16, b.length))
      });
      i += 2 + len;
      if (m === 0xD9) break;                          // end of image
    }
    flush(b.length);
    return out;
  }

  // The segments alone, for the callers that only want the structure.
  function jpegSegments(input) {
    return jpegPieces(input).filter(function (p) { return p.kind === "segment"; });
  }

  function segmentKind(b, seg) {
    if (seg.marker === 0xE1) {
      var p = ascii(b, seg.dataStart, seg.dataStart + 6);
      if (p === "Exif\u0000\u0000") return "exif";
      if (ascii(b, seg.dataStart, seg.dataStart + 28).indexOf("http://ns.adobe.com/xap") === 0) return "xmp";
      return "app1";
    }
    if (seg.marker === 0xED) return "iptc";
    if (seg.marker === 0xFE) return "comment";
    return null;
  }

  /* ------------------------------------------------------------- exif/gps */

  // A TIFF/EXIF block, in either byte order, read only as far as the tags.
  function tiffIfd(b, base) {
    var le;
    if (b[base] === 0x49 && b[base + 1] === 0x49) le = true;
    else if (b[base] === 0x4D && b[base + 1] === 0x4D) le = false;
    else return null;
    var u16 = le ? u16le : u16be;
    var u32 = le
      ? function (b2, i) { return (b2[i] | (b2[i + 1] << 8) | (b2[i + 2] << 16) | ((b2[i + 3] << 24) >>> 0)) >>> 0; }
      : u32be;
    var ifdOffset = u32(b, base + 4);
    var at = base + ifdOffset;
    if (at + 2 > b.length) return null;
    var count = u16(b, at);
    var tags = [];
    for (var i = 0; i < count; i++) {
      var e = at + 2 + i * 12;
      if (e + 12 > b.length) break;
      tags.push({ tag: u16(b, e), type: u16(b, e + 2), count: u32(b, e + 4), value: u32(b, e + 8), at: e });
    }
    return { tags: tags, u16: u16, u32: u32, base: base, le: le };
  }

  function exifBlock(b, f) {
    if (f.format === "jpeg") {
      var segs = jpegSegments(b);
      for (var i = 0; i < segs.length; i++) {
        if (segmentKind(b, segs[i]) === "exif") return segs[i].dataStart + 6;
      }
      return -1;
    }
    if (f.format === "png") {
      var chunks = pngChunks(b);
      for (var j = 0; j < chunks.length; j++) {
        if (chunks[j].type === "eXIf") return chunks[j].dataStart;
      }
    }
    return -1;
  }

  // True when the file carries a GPS block — not merely an EXIF block.
  function hasGps(input) {
    var b = toBytes(input);
    var f = sniff(b);
    if (!f) return false;
    var base = exifBlock(b, f);
    if (base < 0) return false;
    var ifd = tiffIfd(b, base);
    if (!ifd) return false;
    for (var i = 0; i < ifd.tags.length; i++) {
      if (ifd.tags[i].tag === 0x8825 && ifd.tags[i].value > 0) return true;   // GPS IFD pointer
    }
    return false;
  }

  // Every tag in IFD0, for the "what was in there" list.
  function exifTags(input) {
    var b = toBytes(input);
    var f = sniff(b);
    if (!f) return [];
    var base = exifBlock(b, f);
    if (base < 0) return [];
    var ifd = tiffIfd(b, base);
    if (!ifd) return [];
    return ifd.tags.map(function (t) { return t.tag; });
  }

  // The tag a camera uses to say which way up the photo was taken: 1 is
  // upright, 2 is mirrored, 6 means "rotate 90° clockwise to see it". It has to
  // be read BEFORE the strip, because the strip is what removes it — and a
  // browser handed a file without it will draw a portrait photo on its side.
  function orientation(input) {
    var b = toBytes(input);
    var f = sniff(b);
    if (!f) return 1;
    var base = exifBlock(b, f);
    if (base < 0) return 1;
    var ifd = tiffIfd(b, base);
    if (!ifd) return 1;
    for (var i = 0; i < ifd.tags.length; i++) {
      if (ifd.tags[i].tag === 0x0112) {
        // A SHORT sits in the first two bytes of the value field, either byte order.
        var v = ifd.tags[i].type === 3 ? ifd.u16(b, ifd.tags[i].at + 8) : ifd.tags[i].value;
        return v >= 1 && v <= 8 ? v : 1;
      }
    }
    return 1;
  }

  var TAG_NAMES = {
    0x010F: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0131: "Software",
    0x0132: "DateTime", 0x013B: "Artist", 0x829A: "Exposure", 0x829D: "Aperture",
    0x8827: "ISO", 0x920A: "Focal length", 0x9286: "User comment", 0xA002: "Width",
    0xA003: "Height", 0x8825: "GPS"
  };

  function tagText(b, ifd, t) {
    if (t.type === 2) {                                   // ASCII
      var at = t.count <= 4 ? t.at + 8 : ifd.base + t.value;
      var s = "";
      for (var i = 0; i < t.count && at + i < b.length; i++) {
        var c = b[at + i];
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s.replace(/[\u0000-\u001f]/g, "").trim();
    }
    if (t.type === 3) return String(ifd.u16(b, t.at + 8));
    if (t.type === 4) return String(t.value);
    if (t.type === 5) return "ratio";                     // rationals: named, not computed
    return "";
  }

  // What the file says about itself, in words a person can read. The app shows
  // this before it removes anything: a strip you can see is a strip you can
  // trust, and it is the one place a camera's make, model and date are useful.
  function exifSummary(input) {
    var b = toBytes(input);
    var f = sniff(b);
    var out = [];
    if (!f) return out;
    var base = exifBlock(b, f);
    if (base < 0) return out;
    var ifd = tiffIfd(b, base);
    if (!ifd) return out;
    for (var i = 0; i < ifd.tags.length; i++) {
      var t = ifd.tags[i];
      var name = TAG_NAMES[t.tag];
      if (!name) continue;
      if (t.tag === 0x8825) continue;               // the pointer, reported below
      out.push({ tag: t.tag, name: name, value: tagText(b, ifd, t) });
    }
    if (hasGps(b) && !out.some(function (e) { return e.tag === 0x8825; })) {
      out.push({ tag: 0x8825, name: "GPS", value: "present" });
    }
    return out;
  }

  // What identifying blocks are still in this file — asked of the OUTPUT, so
  // "the GPS is gone" is a check rather than a claim.
  function remaining(input) {
    var b = toBytes(input);
    var f = sniff(b);
    var out = [];
    if (!f) return out;
    if (f.format === "jpeg") {
      var pieces = jpegPieces(b);
      for (var i = 0; i < pieces.length; i++) {
        if (pieces[i].kind !== "segment") continue;
        var kind = segmentKind(b, pieces[i]);
        if (kind) out.push(pieces[i].name === "APP1" ? kind : pieces[i].name);
      }
    } else if (f.format === "png") {
      var chunks = pngChunks(b);
      for (var j = 0; j < chunks.length; j++) {
        if (PRIVACY_CHUNKS[chunks[j].type]) out.push(chunks[j].type);
      }
    }
    return out;
  }

  var SIGNATURES = [
    [0x45, 0x78, 0x69, 0x66, 0x00, 0x00],                     // "Exif\0\0"
    [0x68, 0x74, 0x74, 0x70, 0x3A, 0x2F, 0x2F, 0x6E, 0x73],   // the XMP namespace prefix
    [0x50, 0x68, 0x6F, 0x74, 0x6F, 0x73, 0x68, 0x6F, 0x70]    // "Photoshop"
  ];

  function contains(b, needle) {
    outer:
    for (var i = 0; i + needle.length <= b.length; i++) {
      for (var j = 0; j < needle.length; j++) {
        if (b[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  // The claim, checked twice: once by walking the structure, and once by
  // searching the bytes themselves for the signatures that structure is made
  // of. A check that shares the parser's blind spot cannot catch the parser's
  // mistakes — and this one has to fail closed, because the app puts a badge on
  // it.
  function isClean(input) {
    var b = toBytes(input);
    if (remaining(b).length) return false;
    if (hasGps(b)) return false;
    for (var i = 0; i < SIGNATURES.length; i++) {
      if (contains(b, SIGNATURES[i])) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ png chunks */

  function pngChunks(input) {
    var b = toBytes(input);
    var out = [];
    var f = sniff(b);
    if (!f || f.format !== "png") return out;
    var i = 8;
    while (i + 8 <= b.length) {
      var len = u32be(b, i);
      var type = ascii(b, i + 4, i + 8);
      // A chunk that claims more bytes than the file holds is not a chunk; stop
      // rather than slice past the end and hand back a corrupt file.
      if (i + 12 + len > b.length) break;
      out.push({ type: type, start: i, length: len, dataStart: i + 8, dataLength: len });
      i += 12 + len;
      if (type === "IEND") break;
    }
    return out;
  }

  /* --------------------------------------------------------- strip metadata */

  var PRIVACY_CHUNKS = { eXIf: 1, tEXt: 1, iTXt: 1, zTXt: 1 };

  // Removes what identifies a person or a place, and nothing else: the pixels,
  // the colour profile and the frame data are kept byte for byte.
  function stripMetadata(input, opts) {
    var b = toBytes(input);
    var f = sniff(b);
    var keepColour = !opts || opts.keepColour !== false;
    // "Everything, not just what identifies you." ExifTool's -all= removes every
    // APP segment except the JFIF one and Adobe's APP14, which some decoders
    // need to read the file at all — the same rule, applied here.
    var stripAll = !!(opts && opts.stripAll);
    if (!f) return { bytes: b, removed: [], format: null, changed: false };

    if (f.format === "jpeg") {
      var pieces = jpegPieces(b);
      var removed = [];
      var parts = [b.subarray(0, 2)];             // SOI
      for (var i = 0; i < pieces.length; i++) {
        var piece = pieces[i];
        if (piece.kind === "raw") {
          parts.push(b.subarray(piece.start, piece.end));    // entropy data, untouched
          continue;
        }
        var kind = segmentKind(b, piece);
        var everything = stripAll && piece.marker >= 0xE1 && piece.marker <= 0xEF && piece.marker !== 0xEE;
        if (kind === "exif" || kind === "xmp" || kind === "iptc" || kind === "comment") {
          removed.push(piece.name === "APP1" ? kind : piece.name);
        } else if (!keepColour && piece.marker === 0xE2) {
          removed.push("icc");            // the colour profile, only if asked
        } else if (everything) {
          removed.push(piece.marker === 0xE2 ? "icc" : piece.name);   // a maker note, an MPF index, anything
        } else {
          parts.push(b.subarray(piece.start, piece.start + 2 + piece.length));
        }
      }
      var out = concat(parts);
      return { bytes: out, removed: removed, format: "jpeg", changed: out.length !== b.length };
    }

    if (f.format === "png") {
      var chunks = pngChunks(b);
      var kept = [b.subarray(0, 8)];
      var gone = [];
      for (var j = 0; j < chunks.length; j++) {
        var c = chunks[j];
        var whole = b.subarray(c.start, c.start + 12 + c.length);
        if (PRIVACY_CHUNKS[c.type]) { gone.push(c.type); continue; }
        if (!keepColour && c.type === "iCCP") { gone.push("iCCP"); continue; }
        // "Everything" means every ancillary chunk, keeping only what the picture
        // needs to be drawn: the transparency table and, if asked, the profile.
        var ancillary = c.type.charCodeAt(0) >= 0x61 && c.type.charCodeAt(0) <= 0x7A;
        if (stripAll && ancillary && c.type !== "tRNS") { gone.push(c.type); continue; }
        kept.push(whole);
      }
      var png = concat(kept);
      return { bytes: png, removed: gone, format: "png", changed: png.length !== b.length };
    }

    return { bytes: b, removed: [], format: f.format, changed: false };
  }

  function concat(parts) {
    var total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), at = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
    return out;
  }

  /* ---------------------------------------------------- the demo exif block */

  function writeAscii(b, at, s) {
    for (var i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i) & 0x7F;
    b[at + s.length] = 0;
  }

  // A real TIFF/EXIF block carrying a real GPS IFD — 19°04'N 72°52'E, the same
  // coordinates the test fixture uses. The built-in sample photo is assembled
  // from this, so the demo shows a genuine strip: what is removed here is a
  // block laid out the way a camera lays one out, only shorter.
  function exifWithGps() {
    var tiff = new Uint8Array(175);
    var dv = new DataView(tiff.buffer);
    tiff[0] = 0x49; tiff[1] = 0x49;                       // "II", little endian
    dv.setUint16(2, 42, true);
    dv.setUint32(4, 8, true);                             // IFD0 at 8
    dv.setUint16(8, 3, true);                             // three entries
    dv.setUint16(10, 0x010F, true); dv.setUint16(12, 2, true); dv.setUint32(14, 13, true); dv.setUint32(18, 50, true);  // Make
    dv.setUint16(22, 0x0110, true); dv.setUint16(24, 2, true); dv.setUint32(26, 10, true); dv.setUint32(30, 63, true);  // Model
    dv.setUint16(34, 0x8825, true); dv.setUint16(36, 4, true); dv.setUint32(38, 1, true); dv.setUint32(42, 73, true);   // GPS IFD
    dv.setUint32(46, 0, true);                            // no next IFD
    writeAscii(tiff, 50, "ImageToolkit");                 // 12 chars + NUL = 13
    writeAscii(tiff, 63, "PocketCam");                    // 9 chars + NUL = 10
    dv.setUint16(73, 4, true);                            // GPS IFD, four entries
    dv.setUint16(75, 0x0001, true); dv.setUint16(77, 2, true); dv.setUint32(79, 2, true);
    tiff[83] = 0x4E;                                      // GPSLatitudeRef "N", inline
    dv.setUint16(87, 0x0002, true); dv.setUint16(89, 5, true); dv.setUint32(91, 3, true); dv.setUint32(95, 127, true);
    dv.setUint16(99, 0x0003, true); dv.setUint16(101, 2, true); dv.setUint32(103, 2, true);
    tiff[107] = 0x45;                                     // GPSLongitudeRef "E", inline
    dv.setUint16(111, 0x0004, true); dv.setUint16(113, 5, true); dv.setUint32(115, 3, true); dv.setUint32(119, 151, true);
    dv.setUint32(123, 0, true);                           // no next IFD
    var rats = [[127, 19], [135, 4], [143, 0], [151, 72], [159, 52], [167, 0]];
    for (var i = 0; i < rats.length; i++) {
      dv.setUint32(rats[i][0], rats[i][1], true);
      dv.setUint32(rats[i][0] + 4, 1, true);
    }
    var out = new Uint8Array(181);
    out[0] = 0x45; out[1] = 0x78; out[2] = 0x69; out[3] = 0x66;  // "Exif\0\0"
    out.set(tiff, 6);
    return out;
  }

  // Put an EXIF block into a JPEG that has none: one APP1 segment, right after
  // the start-of-image marker. The scan data is untouched, byte for byte.
  function attachExif(jpegInput, exifInput) {
    var jpeg = toBytes(jpegInput);
    var exif = toBytes(exifInput);
    if (!(jpeg[0] === 0xFF && jpeg[1] === 0xD8)) throw new TypeError("expected a JPEG");
    var len = exif.length + 2;
    if (len > 0xFFFF) throw new RangeError("the EXIF block is too large for one APP1 segment");
    var out = new Uint8Array(jpeg.length + 4 + exif.length);
    out[0] = 0xFF; out[1] = 0xD8;
    out[2] = 0xFF; out[3] = 0xE1;
    out[4] = (len >> 8) & 0xFF; out[5] = len & 0xFF;
    out.set(exif, 6);
    out.set(jpeg.subarray(2), 6 + exif.length);
    return out;
  }

  /* ---------------------------------------------------------------- resize */

  // Contain inside the box, never upscale, never round to zero.
  function fit(width, height, maxW, maxH) {
    if (!width || !height) return { width: 0, height: 0, scaled: false };
    var limits = [];
    if (maxW > 0 && width > maxW) limits.push(maxW / width);
    if (maxH > 0 && height > maxH) limits.push(maxH / height);
    if (!limits.length) return { width: width, height: height, scaled: false };
    var scale = Math.min.apply(null, limits);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      scaled: true
    };
  }

  /* -------------------------------------------------------- the byte budget */

  // Find the highest quality whose output still fits the budget. The encoder is
  // passed in, so this is testable without a canvas: it is a search, and a
  // search can be proved by a fake that behaves like a real encoder.
  function budget(targetBytes, encode, opts) {
    opts = opts || {};
    var lo = typeof opts.minQuality === "number" ? opts.minQuality : 0.40;
    var hi = typeof opts.maxQuality === "number" ? opts.maxQuality : 0.95;
    var steps = opts.steps || 6;
    var best = null;
    var tries = 0;
    var history = [];

    function sizeOf(out) { return out && typeof out.size === "number" ? out.size : out.length; }

    function step() {
      if (tries >= steps) return Promise.resolve();
      var q = Math.round(((lo + hi) / 2) * 1000) / 1000;
      tries++;
      return Promise.resolve(encode(q)).then(function (out) {
        var size = sizeOf(out);
        history.push({ quality: q, size: size });
        if (size <= targetBytes) {
          if (!best || size > best.size) best = { quality: q, size: size, out: out };
          lo = q;
        } else {
          hi = q;
        }
        return step();
      });
    }

    return step().then(function () {
      if (best) return { fits: true, quality: best.quality, size: best.size, out: best.out, tries: tries, history: history };
      return Promise.resolve(encode(lo)).then(function (out) {
        var size = sizeOf(out);
        history.push({ quality: lo, size: size });
        return { fits: size <= targetBytes, quality: lo, size: size, out: out, tries: tries + 1, history: history };
      });
    });
  }

  /* ------------------------------------------------------------------- zip */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    var str = String(s);
    if (typeof TextEncoder === "function") return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function dosStamp(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  // A store-only ZIP. The files going in are already compressed, so deflating
  // them again would cost time and save nothing — and a dependency for this
  // would be absurd. Written by hand: local headers, the central directory, the
  // end record.
  // A name a ZIP can hold twice without losing one of them: "a.jpg", "a (2).jpg".
  function uniqueName(taken, name) {
    if (!taken[name]) { taken[name] = 1; return name; }
    var dot = name.lastIndexOf(".");
    var stem = (dot > 0 ? name.slice(0, dot) : name).replace(/ \(\d+\)$/, "");
    var ext = dot > 0 ? name.slice(dot) : "";
    var n = 2, out;
    do { out = stem + " (" + n + ")" + ext; n++; } while (taken[out]);
    taken[out] = 1;
    return out;
  }

  function zip(entries, when) {
    var stamp = dosStamp(when || new Date(1980, 0, 1));
    var locals = [], central = [], offset = 0, total = 0, i, taken = {};

    // No zip64 here, so say so rather than write an archive that quietly wraps.
    if (entries.length > 0xFFFF) throw new RangeError("a ZIP cannot hold more than 65535 files without zip64");
    for (i = 0; i < entries.length; i++) {
      if (toBytes(entries[i].bytes).length + 46 > 0xFFFFFFFF) throw new RangeError("one file is too large for a ZIP without zip64");
    }

    for (i = 0; i < entries.length; i++) {
      var name = utf8(uniqueName(taken, String(entries[i].name)));
      var data = toBytes(entries[i].bytes);
      var crc = crc32(data);

      var lh = new Uint8Array(30 + name.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);            // version needed to extract
      dv.setUint16(6, 0x0800, true);        // names are UTF-8
      dv.setUint16(8, 0, true);             // stored, not deflated
      dv.setUint16(10, stamp.time, true);
      dv.setUint16(12, stamp.date, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      lh.set(name, 30);
      locals.push(lh, data);
      total += lh.length + data.length;

      var ch = new Uint8Array(46 + name.length);
      var cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);           // version made by
      cdv.setUint16(6, 20, true);           // version needed
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, stamp.time, true);
      cdv.setUint16(14, stamp.date, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, name.length, true);
      cdv.setUint32(42, offset, true);      // where this file's local header is
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    }

    if (total > 0xFFFFFFFF) throw new RangeError("this batch is over 4 GB, which needs zip64");

    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;

    var end = new Uint8Array(22);
    var edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, entries.length, true);
    edv.setUint16(10, entries.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);

    var all = locals.concat(central, [end]);
    var out = new Uint8Array(total + cdSize + 22), at = 0;
    for (i = 0; i < all.length; i++) { out.set(all[i], at); at += all[i].length; }
    return out;
  }

  /* ------------------------------------------------------------------- pdf */

  function latin1(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function colourSpace(jpeg) {
    var segs = jpegSegments(jpeg);
    for (var i = 0; i < segs.length; i++) {
      if (SOF[segs[i].marker]) {
        var n = jpeg[segs[i].dataStart + 5];
        if (n === 1) return "/DeviceGray";
        if (n === 4) return "/DeviceCMYK";
        return "/DeviceRGB";
      }
    }
    return "/DeviceRGB";
  }

  // Images into one A4 document, one page each, fitted and centred. A JPEG goes
  // in as it is — PDF has a filter for exactly that (DCTDecode), so the bytes
  // the app just encoded are the bytes in the file, not a second generation.
  function pdf(images, opts) {
    if (!images || !images.length) throw new TypeError("a pdf needs at least one image");
    var PAGE_W = 595.28, PAGE_H = 841.89;                 // A4, in points
    var margin = opts && typeof opts.margin === "number" ? opts.margin : 18;
    var parts = [], at = 0, offsets = {};

    function put(text) {
      var bytes = latin1(text);
      var from = at;
      parts.push(bytes);
      at += bytes.length;
      return from;
    }
    function putBytes(bytes) {
      var from = at;
      parts.push(bytes);
      at += bytes.length;
      return from;
    }

    put("%PDF-1.4\n");

    var kids = [];
    var pageObjs = [], imageObjs = [], contentObjs = [];
    for (var i = 0; i < images.length; i++) {
      pageObjs.push(4 + i * 3);
      imageObjs.push(5 + i * 3);
      contentObjs.push(6 + i * 3);
      kids.push((4 + i * 3) + " 0 R");
    }

    offsets[1] = put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offsets[2] = put("2 0 obj\n<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + images.length + " >>\nendobj\n");
    offsets[3] = put("3 0 obj\n<< /Producer (Image Toolkit) /Creator (Image Toolkit) >>\nendobj\n");

    for (i = 0; i < images.length; i++) {
      var jpeg = toBytes(images[i].bytes);
      var dim = dimensions(jpeg);
      if (!dim) throw new TypeError("pdf() takes JPEGs: image " + (i + 1) + " is not one");
      var w = dim.width, h = dim.height;
      var scale = Math.min((PAGE_W - margin * 2) / w, (PAGE_H - margin * 2) / h);
      var dw = (w * scale).toFixed(2), dh = (h * scale).toFixed(2);
      var x = ((PAGE_W - w * scale) / 2).toFixed(2), y = ((PAGE_H - h * scale) / 2).toFixed(2);

      offsets[pageObjs[i]] = put(
        pageObjs[i] + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "]" +
        " /Resources << /XObject << /Im0 " + imageObjs[i] + " 0 R >> >>" +
        " /Contents " + contentObjs[i] + " 0 R >>\nendobj\n");

      offsets[imageObjs[i]] = put(
        imageObjs[i] + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
        " /ColorSpace " + colourSpace(jpeg) + " /BitsPerComponent 8 /Filter /DCTDecode /Length " +
        jpeg.length + " >>\nstream\n");
      putBytes(jpeg);
      put("\nendstream\nendobj\n");

      var content = "q " + dw + " 0 0 " + dh + " " + x + " " + y + " cm /Im0 Do Q";
      offsets[contentObjs[i]] = put(
        contentObjs[i] + " 0 obj\n<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\nendobj\n");
    }

    var total = 3 + images.length * 3;
    var xref = at;
    var table = "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
    for (var n = 1; n <= total; n++) {
      var off = offsets[n] || 0;
      table += ("0000000000" + off).slice(-10) + " 00000 n \n";
    }
    put(table);
    put("trailer\n<< /Size " + (total + 1) + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");

    return concat(parts);
  }

  /* -------------------------------------------------------------- helpers */

  function formatBytes(n) {
    if (!n && n !== 0) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + " MB";
  }

  function outName(name, ext) {
    var base = String(name || "image").replace(/\.[^.]+$/, "");
    return base + "-min." + ext;
  }

  return {
    sniff: sniff,
    dimensions: dimensions,
    jpegSegments: jpegSegments,
    pngChunks: pngChunks,
    hasGps: hasGps,
    exifTags: exifTags,
    exifSummary: exifSummary,
    orientation: orientation,
    remaining: remaining,
    isClean: isClean,
    stripMetadata: stripMetadata,
    exifWithGps: exifWithGps,
    attachExif: attachExif,
    fit: fit,
    budget: budget,
    crc32: crc32,
    zip: zip,
    pdf: pdf,
    jpegPieces: jpegPieces,
    formatBytes: formatBytes,
    outName: outName
  };
}));
