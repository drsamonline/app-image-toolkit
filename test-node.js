#!/usr/bin/env node
/* test-node.js — the proof for Image Toolkit.
 *
 * docs/play/imgtool.js is the engine and docs/play/index.html is a view over it,
 * so testing the engine tests what the app actually does. The fixture is a real
 * JPEG written by a camera-like encoder, carrying a real GPS block — the strip
 * and the GPS check are proved on actual EXIF, not on a description of it.
 *
 *     node test-node.js
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var zlib = require("zlib");
var T = require("./docs/play/imgtool.js");

var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (detail ? "  <- " + detail : "")); }
}
function eq(name, actual, expected) {
  ok(name + " = " + JSON.stringify(expected), JSON.stringify(actual) === JSON.stringify(expected),
    "got " + JSON.stringify(actual));
}
function section(t) { console.log("\n" + t); }

/* ---------------------------------------------------------------- fixtures */

// 64x48, quality 80, Make=ForgeCam Model=TestBody, GPS 19°4'N 72°52'E.
var FIXTURE = Buffer.from(
  "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",
  "base64");

function pngChunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

// A tiny but structurally real TIFF/EXIF block, little-endian, with a GPS IFD.
function exifBlockWithGps() {
  var tiff = Buffer.alloc(64);
  tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);                    // IFD0, two entries
  tiff.writeUInt16LE(0x010F, 10); tiff.writeUInt16LE(2, 12); tiff.writeUInt32LE(1, 16); // Make
  tiff.writeUInt16LE(0x8825, 22); tiff.writeUInt16LE(4, 24); tiff.writeUInt32LE(1, 26); tiff.writeUInt32LE(40, 30); // GPS IFD
  tiff.writeUInt32LE(0, 34);                   // no next IFD
  tiff.writeUInt16LE(1, 40);                   // GPS IFD, one entry
  tiff.writeUInt16LE(0x0001, 42); tiff.writeUInt16LE(2, 44); tiff.writeUInt32LE(2, 46); // GPSLatitudeRef
  tiff.writeUInt32LE(0, 54);
  return Buffer.concat([Buffer.from("Exif\u0000\u0000", "binary"), tiff]);
}

function buildPng(withExif) {
  var sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1200, 0); ihdr.writeUInt32BE(800, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  var chunks = [sig, pngChunk("IHDR", ihdr)];
  if (withExif) chunks.push(pngChunk("eXIf", exifBlockWithGps().subarray(6)));
  chunks.push(pngChunk("tEXt", Buffer.from("Author\u0000Dr Sohil Momin", "binary")));
  chunks.push(pngChunk("IDAT", Buffer.from("not really compressed pixels", "ascii")));
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

/* ------------------------------------------------------------------ */
section("what the file is — from its bytes, not its name");

var f = T.sniff(FIXTURE);
eq("the fixture is a jpeg", f && f.format, "jpeg");
eq("its mime type", f && f.mime, "image/jpeg");
var png = buildPng(true);
eq("a png is a png", T.sniff(png).format, "png");
eq("a gif", T.sniff(Buffer.from("GIF89a" + "\u0000".repeat(20), "binary")).format, "gif");
eq("a webp", T.sniff(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(20)])).format, "webp");
eq("a bmp", T.sniff(Buffer.concat([Buffer.from("BM"), Buffer.alloc(30)])).format, "bmp");
eq("plain text is not an image", T.sniff(Buffer.from("this is a text file, not a photo at all")), null);
eq("a two-byte stub is not an image", T.sniff(Buffer.from([0xFF, 0xD8])), null);

/* ------------------------------------------------------------------ */
section("the size of the picture, read from the header");

eq("the fixture is 64 x 48", T.dimensions(FIXTURE), { width: 64, height: 48 });
eq("the png is 1200 x 800", T.dimensions(png), { width: 1200, height: 800 });
var gif = Buffer.alloc(32); gif.write("GIF89a", 0, "ascii"); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(200, 8);
eq("the gif is 320 x 200", T.dimensions(gif), { width: 320, height: 200 });
var bmp = Buffer.alloc(40); bmp.write("BM", 0, "ascii"); bmp.writeInt32LE(640, 18); bmp.writeInt32LE(480, 22);
eq("the bmp is 640 x 480", T.dimensions(bmp), { width: 640, height: 480 });

/* ------------------------------------------------------------------ */
section("the JPEG structure — up to the scan, and no further");

var segs = T.jpegSegments(FIXTURE);
var names = segs.map(function (s) { return s.name; });
ok("there is an APP1 (EXIF) segment", names.indexOf("APP1") >= 0);
ok("there is a frame header", names.indexOf("0xC0") >= 0 || names.some(function (n) { return /^0xC[0-3]$/.test(n); }));
eq("the walk stops at the scan", names[names.length - 1], "SOS");
ok("the JFIF APP0 is kept", names.indexOf("APP0") === 0);

/* ------------------------------------------------------------------ */
section("the GPS block — found, then gone");

ok("the fixture really does carry GPS", T.hasGps(FIXTURE));
var stripped = T.stripMetadata(FIXTURE);
ok("after stripping there is no GPS left", !T.hasGps(stripped.bytes));
ok("the strip reports what it removed", stripped.removed.indexOf("exif") >= 0, JSON.stringify(stripped.removed));
ok("the file got smaller", stripped.bytes.length < FIXTURE.length,
  FIXTURE.length + " -> " + stripped.bytes.length);
eq("the image starts with SOI", [stripped.bytes[0], stripped.bytes[1]], [0xFF, 0xD8]);
eq("the image still ends with EOI", [stripped.bytes[stripped.bytes.length - 2], stripped.bytes[stripped.bytes.length - 1]], [0xFF, 0xD9]);

// The pixels are untouched: everything from the scan onwards is byte-identical.
var scanBefore = FIXTURE.indexOf(Buffer.from([0xFF, 0xDA]));
var scanAfter = Buffer.from(stripped.bytes).indexOf(Buffer.from([0xFF, 0xDA]));
ok("the scan is byte-for-byte identical",
  Buffer.compare(FIXTURE.subarray(scanBefore), Buffer.from(stripped.bytes).subarray(scanAfter)) === 0);
ok("the stripped file still reads as a jpeg", T.sniff(stripped.bytes).format === "jpeg");
eq("the JFIF header survived", T.jpegSegments(stripped.bytes)[0].name, "APP0");
ok("stripping twice changes nothing", T.stripMetadata(stripped.bytes).bytes.length === stripped.bytes.length);

/* ------------------------------------------------------------------ */
section("the PNG path — the same promise for eXIf and tEXt");

ok("the png carries GPS in its eXIf chunk", T.hasGps(png));
var pngStripped = T.stripMetadata(png);
ok("the png has no GPS after stripping", !T.hasGps(pngStripped.bytes));
ok("the eXIf chunk is gone", pngStripped.removed.indexOf("eXIf") >= 0);
ok("the tEXt chunk is gone too", pngStripped.removed.indexOf("tEXt") >= 0);
var kept = T.pngChunks(pngStripped.bytes).map(function (c) { return c.type; });
eq("the pixels are kept", kept, ["IHDR", "IDAT", "IEND"]);
var idatBefore = png.indexOf(Buffer.from("IDAT"));
var idatAfter = Buffer.from(pngStripped.bytes).indexOf(Buffer.from("IDAT"));
ok("the IDAT payload is untouched",
  Buffer.compare(png.subarray(idatBefore, idatBefore + 40), Buffer.from(pngStripped.bytes).subarray(idatAfter, idatAfter + 40)) === 0);

/* ------------------------------------------------------------------ */
section("resize — contain, never upscale, never zero");

eq("4000x3000 into 1600 wide", T.fit(4000, 3000, 1600, 0), { width: 1600, height: 1200, scaled: true });
eq("800x600 into 1600 is left alone", T.fit(800, 600, 1600, 0), { width: 800, height: 600, scaled: false });
eq("a tall photo into a square box", T.fit(1000, 4000, 1600, 1200), { width: 300, height: 1200, scaled: true });
eq("a 1px wide strip never becomes 0", T.fit(4000, 1, 10, 0), { width: 10, height: 1, scaled: true });
eq("no box means no change", T.fit(300, 200, 0, 0), { width: 300, height: 200, scaled: false });

/* ------------------------------------------------------------------ */
section("the budget search — the done-means, made checkable");

// An encoder whose output shrinks as quality rises, the way a real one does.
function fakeEncoder(peak) {
  return function (q) { return { size: Math.round(peak * Math.pow(q, 4)) + 20000, quality: q }; };
}

var calls = 0;
var enc = fakeEncoder(4000000);
var res = T.budget(500000, function (q) { calls++; return enc(q); }, { steps: 6 }).then(function (r) {
  ok("a 4 MB photo reaches under 500 KB", r.fits && r.size <= 500000, "size " + r.size);
  ok("and it is close to the budget, not far under it", r.size > 400000, "size " + r.size);
  ok("the quality it chose is inside the range", r.quality >= 0.40 && r.quality <= 0.95, "q " + r.quality);
  ok("the search is bounded", calls <= 7, calls + " encoder calls");

  return T.budget(50000, enc, { steps: 6 }).then(function (small) {
    ok("an impossible budget is refused, not faked", small.fits === false, JSON.stringify(small.size));
    ok("and the smallest size is reported honestly", small.size > 50000, "size " + small.size);

    return T.budget(1000000, function (q) { return { size: 900000 }; }).then(function (flat) {
      ok("an encoder that always fits returns fits", flat.fits === true && flat.size === 900000);
      return T.budget(10, function (q) { return { size: 999999 }; }).then(function (never) {
        ok("an encoder that never fits says so", never.fits === false && never.size === 999999);
      });
    });
  });
}).then(function () {
  /* ---------------------------------------------------------------- */
  section("what the page promises");

  var dir = path.join(__dirname, "docs", "play");
  ["index.html", "imgtool.js", "web-kit.js", "export-kit.js"].forEach(function (file) {
    ok("docs/play/" + file + " exists", fs.existsSync(path.join(dir, file)) && fs.statSync(path.join(dir, file)).size > 0);
  });
  var html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  ["imgtool.js", "web-kit.js", "export-kit.js"].forEach(function (file) {
    ok("the page loads " + file, html.indexOf('src="' + file + '"') >= 0);
  });
  ["files", "maxw", "target", "format", "strip", "run", "results"].forEach(function (id) {
    ok("the page has the " + id + " control", html.indexOf('id="' + id + '"') >= 0);
  });
  ok("the page works on a phone", html.indexOf('name="viewport"') >= 0);
  ok("the page never calls fetch", html.indexOf("fetch(") < 0);
  ok("the page never opens an XHR", !/XMLHttpRequest/.test(html));
  var external = (html.match(/https?:\/\/[^"'\s)]+/g) || []).filter(function (u) {
    return !/w3\.org|schema\.org/.test(u);
  });
  eq("the page loads nothing from the network", external, []);
  ok("the page says the photos never leave the device", /never leaves|stays on (your|the) device|nothing is uploaded/i.test(html));
}).then(function () {
  /* ---------------------------------------------------------------- */
  section("the numbers the user reads");
  eq("512 bytes", T.formatBytes(512), "512 B");
  eq("2 KB", T.formatBytes(2048), "2.0 KB");
  eq("48 KB", T.formatBytes(49152), "48 KB");
  eq("4 MB", T.formatBytes(4 * 1024 * 1024), "4.00 MB");
  eq("12 MB", T.formatBytes(12 * 1024 * 1024), "12.0 MB");
  eq("a new name", T.outName("IMG_4021.JPG", "webp"), "IMG_4021-min.webp");

  section("the plan the page shows before it works");
  eq("a phone photo with GPS and a budget", T.plan({ format: "jpeg", width: 4000, hasGps: true, hasExif: true }, { maxW: 1600, targetKB: 500 }),
    ["resize to 1600 px wide", "remove the GPS location", "compress to under 500 KB"]);
  eq("a file with nothing to do", T.plan({ format: "jpeg", width: 800, hasGps: false, hasExif: false }, { maxW: 1600 }),
    ["nothing to change"]);
  eq("a HEIC is named as undrawable", T.plan({ format: "heic", width: 4000 }, { maxW: 1600 }),
    ["HEIC cannot be drawn by a browser, so it cannot be converted here"]);
}).then(function () {
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}).catch(function (err) {
  console.error(err && err.stack || err);
  process.exit(1);
});
