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
    if (f.format === "png") return { width: u32be(b, 16), height: u32be(b, 20) };
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

  // The structure of a JPEG, up to the scan. Nothing after SOS is parsed: that
  // is entropy-coded image data and touching it would corrupt the picture.
  function jpegSegments(input) {
    var b = toBytes(input);
    var out = [];
    if (!(b[0] === 0xFF && b[1] === 0xD8)) return out;
    var i = 2;
    while (i < b.length - 1) {
      if (b[i] !== 0xFF) break;
      var m = b[i + 1];
      if (m === 0xFF) { i++; continue; }            // fill byte
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      var len = u16be(b, i + 2);
      if (len < 2) break;
      out.push({
        marker: m,
        name: MARKER_NAMES[m] || ("0x" + m.toString(16).toUpperCase()),
        start: i,
        length: len,
        dataStart: i + 4,
        dataLength: len - 2,
        payload: ascii(b, i + 4, Math.min(i + 4 + 16, b.length))
      });
      i += 2 + len;
      if (m === 0xDA) break;                        // scan data follows
    }
    return out;
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
      tags.push({ tag: u16(b, e), type: u16(b, e + 2), value: u32(b, e + 8) });
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

  /* ------------------------------------------------------------ png chunks */

  function pngChunks(input) {
    var b = toBytes(input);
    var out = [];
    if (sniff(b) === null || sniff(b).format !== "png") return out;
    var i = 8;
    while (i + 8 <= b.length) {
      var len = u32be(b, i);
      var type = ascii(b, i + 4, i + 8);
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
  function stripMetadata(input) {
    var b = toBytes(input);
    var f = sniff(b);
    if (!f) return { bytes: b, removed: [], format: null, changed: false };

    if (f.format === "jpeg") {
      var segs = jpegSegments(b);
      var removed = [];
      var parts = [b.subarray(0, 2)];             // SOI
      var scanFrom = b.length;
      var cursor = 2;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (s.marker === 0xDA) { scanFrom = s.start; break; }
        var kind = segmentKind(b, s);
        if (kind === "exif" || kind === "xmp" || kind === "iptc" || kind === "comment") {
          removed.push(s.name === "APP1" ? kind : s.name);
        } else {
          parts.push(b.subarray(s.start, s.start + 2 + s.length));
        }
        cursor = s.start + 2 + s.length;
        scanFrom = cursor;
      }
      if (scanFrom >= b.length) scanFrom = b.length;
      parts.push(b.subarray(scanFrom));
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

    function sizeOf(out) { return out && typeof out.size === "number" ? out.size : out.length; }

    function step() {
      if (tries >= steps) return Promise.resolve();
      var q = Math.round(((lo + hi) / 2) * 1000) / 1000;
      tries++;
      return Promise.resolve(encode(q)).then(function (out) {
        var size = sizeOf(out);
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
      if (best) return { fits: true, quality: best.quality, size: best.size, out: best.out, tries: tries };
      return Promise.resolve(encode(lo)).then(function (out) {
        var size = sizeOf(out);
        return { fits: size <= targetBytes, quality: lo, size: size, out: out, tries: tries + 1 };
      });
    });
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

  // The list the page shows, so the user sees the plan before the work.
  function plan(info, opts) {
    opts = opts || {};
    var steps = [];
    if (!info) return ["this file is not an image"];
    if (info.format === "heic") return ["HEIC cannot be drawn by a browser, so it cannot be converted here"];
    if (info.width && opts.maxW && info.width > opts.maxW) steps.push("resize to " + opts.maxW + " px wide");
    if (info.hasGps) steps.push("remove the GPS location");
    else if (info.hasExif) steps.push("remove the metadata");
    if (opts.targetKB) steps.push("compress to under " + opts.targetKB + " KB");
    if (opts.format && opts.format !== info.format) steps.push("convert " + info.format + " to " + opts.format);
    if (!steps.length) steps.push("nothing to change");
    return steps;
  }

  return {
    sniff: sniff,
    dimensions: dimensions,
    jpegSegments: jpegSegments,
    pngChunks: pngChunks,
    hasGps: hasGps,
    exifTags: exifTags,
    stripMetadata: stripMetadata,
    fit: fit,
    budget: budget,
    formatBytes: formatBytes,
    outName: outName,
    plan: plan
  };
}));
