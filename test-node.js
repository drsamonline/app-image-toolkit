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
var crypto = require("crypto");
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
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QC0RXhpZgAATU0AKgAAAAgAAwEPAAIAAAAJAAAAMgEQAAIAAAAJAAAAPIglAAQAAAABAAAARgAAAABGb3JnZUNhbQAAVGVzdEJvZHkAAAAEAAEAAgAAAAJOAAAAAAIABQAAAAMAAAB8AAMAAgAAAAJFAAAAAAQABQAAAAMAAACUAAAAAAAAABMAAAABAAAABAAAAAEAAAAAAAAAAQAAAEgAAAABAAAANAAAAAEAAAAAAAAAAf/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIADAAQAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APmqCzz2rQgsM9q07SzzjituzsM44rsy/CfWrGNDHcvUwoNMzj5a0YNJz/DW4IUgIXZvf0Hb61PDbTynqVHovFenVwuBoS9k05z6qPT1e35vyPoMJjpPW9jMj0lFAL7VHqeKtx6fbqQCyn6DP8q1YtNiix5pCk9upq9Bbqf9XATx1bjn6Vy1Y0IPllShF9neT+6Nn959JhMa31MiOwtxjCs+fRen51fg0+E/8spP++R/jWulrIoUuY4h7Dr+dW4LYZBDzPn+7kY/lXNU9jGdpQivKyX3Jty/D8D6TC4x9zzzT7POOK2jAYIl2Ab24HHT3qzpdnnHFaKWnm3bcHC/KOPT/wCvmngMVOhgU6Xxzain27v7vxaP5soYu8tTMsdNGMkAAdSavRQu7bYBtTpuxyf8K0zal5BCn3F+9juaupbbf3UI+bozDt7D3qJV40YulSfLGOja3k/5Y/r+iWv0eFxd9WZUNlFAdpXc/wDdArQitZCu5iIo/b/HrmtGGyEG1EQNJ6HoKuRWYVv3gMkvHy+n+Fccq7pJwXupbpOyXk2tZP8Aur7kz6TC4u/UzLayXgQxZPqw4q9FbngFy2TnEQ6fjWmtqcAScn/nmnH51citioCnCf7KD5vz/wD1VxTxCp3S0S+S9LJpf+BNvy6H0uFxd7HB6XahYy5HCjJxV6xtPKgMm3JA4+tX7K1K2bkDtj8+K0Us8rDGAOTuPr/nrRQxThQpOO8YXXrJ8q/FXP5sw2LuzMtrTyIAVA3twvH61et7TyFVEX94wyOOg9a047UGZmb7kQx/j+Oat29qyrvI/eyHjjOKylXVNpQdlHRPslo2vOT0j8ux9HhcXczYLPb+6hHzdGYdvb61dt7QL8sW1VHBkP8AStKGy2jy0wEAy7D+VXIrUEKzKQg+4ncn1rgniOW3S2mmyXVJ9u73k9EfS4XF+ZmwWgVfkHlx5xvxyfpV63tNijC+Wp6cZY/4f55rTismB5wZOvsgq3Da/wAQJGerEfM30/z+Vcs8Q4Ptb5W79dLaXSa/vSb0PpcLi/M//9k=",
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
  section("the built-in sample carries a real GPS fix");

  var clean = T.stripMetadata(FIXTURE).bytes;
  ok("the fixture, stripped, has no GPS left", T.hasGps(clean) === false);
  var sample = T.attachExif(clean, T.exifWithGps());
  ok("the demo EXIF block gives a clean photo a GPS block", T.hasGps(sample) === true);
  var demoTags = T.exifTags(sample);
  ok("with the camera tags a camera writes", demoTags.indexOf(0x010F) >= 0 && demoTags.indexOf(0x0110) >= 0);
  ok("and the GPS IFD pointer among them", demoTags.indexOf(0x8825) >= 0);
  var delta = 4 + T.exifWithGps().length;
  ok("the block is exactly one APP1 segment", sample.length - clean.length === delta, sample.length - clean.length);
  ok("the pixels are untouched: every byte after the marker is the original",
    Buffer.from(sample.subarray(2 + delta)).equals(Buffer.from(clean.subarray(2))));
  var restripped = T.stripMetadata(sample);
  eq("stripping it again removes exactly that", restripped.removed, ["exif"]);
  ok("and leaves the file as it was before",
    restripped.bytes.length === clean.length && T.hasGps(restripped.bytes) === false);
  var refused = false;
  try { T.attachExif(Buffer.from("not a jpeg"), T.exifWithGps()); } catch (e) { refused = /JPEG/.test(e.message); }
  ok("attaching to something that is not a JPEG is refused", refused);
}).then(function () {
  /* ---------------------------------------------------------------- */
  section("the tag that says which way up the photo was");

  // A little-endian TIFF with one entry in IFD0: Orientation (0x0112), a SHORT.
  function exifWithOrientation(value) {
    var tiff = Buffer.alloc(26);
    tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(value, 18);
    tiff.writeUInt32LE(0, 22);
    return Buffer.concat([Buffer.from("Exif\u0000\u0000", "binary"), tiff]);
  }

  var bare = T.stripMetadata(FIXTURE).bytes;
  eq("a photo with no orientation tag is upright", T.orientation(bare), 1);
  var sideways = T.attachExif(bare, exifWithOrientation(6));
  eq("a photo the camera said to turn reads as 6", T.orientation(sideways), 6);
  var mirrored = T.attachExif(bare, exifWithOrientation(2));
  eq("and a mirrored one reads as 2", T.orientation(mirrored), 2);
  eq("the plan says so before any work", T.plan({ format: "jpeg", width: 100, orientation: 6 }, {}),
    ["turn the photo upright"]);
  ok("and the tag is still removed by the strip", T.orientation(T.stripMetadata(sideways).bytes) === 1);

  /* ---------------------------------------------------------------- */
  section("the claim, checked on the output, not the input");

  ok("the fixture is not clean", T.isClean(FIXTURE) === false);
  eq("and it says what is in there", T.remaining(FIXTURE), ["exif"]);
  ok("the stripped file is clean", T.isClean(T.stripMetadata(FIXTURE).bytes) === true);
  eq("with nothing left to name", T.remaining(T.stripMetadata(FIXTURE).bytes), []);

  /* ---------------------------------------------------------------- */
  section("the colour profile is kept, unless asked otherwise");

  function pngWith(type, data) {
    var sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1200, 0); ihdr.writeUInt32BE(800, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk(type, data),
      pngChunk("IDAT", Buffer.from("x", "ascii")), pngChunk("IEND", Buffer.alloc(0))]);
  }
  function hasChunk(bytes, type) {
    return T.pngChunks(bytes).some(function (c) { return c.type === type; });
  }

  var withIcc = pngWith("iCCP", Buffer.from("a colour profile", "ascii"));
  ok("an iCCP chunk survives the ordinary strip", hasChunk(T.stripMetadata(withIcc).bytes, "iCCP"));
  var dropped = T.stripMetadata(withIcc, { keepColour: false });
  ok("and goes when the colour is dropped too", hasChunk(dropped.bytes, "iCCP") === false);
  eq("and the strip names it", dropped.removed, ["iCCP"]);
  eq("a profile is not privacy, so it is not reported as removed", T.stripMetadata(withIcc).removed, []);

  /* ---------------------------------------------------------------- */
  section("the zip is a zip, not a pile of bytes");

  eq("crc32 of \"hello\" is the known value", T.crc32(Buffer.from("hello")).toString(16), "3610a686");
  var zipped = Buffer.from(T.zip([
    { name: "a.jpg", bytes: Buffer.from("hello") },
    { name: "b.txt", bytes: Buffer.from("world!") }
  ]));
  eq("the end record is where a reader looks for it", zipped.readUInt32LE(zipped.length - 22), 0x06054b50);
  eq("it holds two entries", zipped.readUInt16LE(zipped.length - 22 + 10), 2);
  eq("the first local header is a local header", zipped.readUInt32LE(0), 0x04034b50);
  ok("and both names are in it", zipped.toString("binary").indexOf("a.jpg") > 0 &&
    zipped.toString("binary").indexOf("b.txt") > 0);
  eq("the first entry is stored, not deflated", zipped.readUInt16LE(8), 0);

  /* ---------------------------------------------------------------- */
  section("the search, as a curve");

  return T.budget(500000, fakeEncoder(4000000), { steps: 6 }).then(function (r) {
    eq("every encoder call is reported", r.history.length, r.tries);
    ok("each one carrying its quality and its size", r.history.every(function (p) {
      return typeof p.quality === "number" && typeof p.size === "number";
    }));
    ok("the point it chose is in the curve", r.history.some(function (p) { return p.quality === r.quality; }));
  });
}).then(function () {
  /* ---------------------------------------------------------------- */
  section("what the page promises");

  var dir = path.join(__dirname, "docs", "play");
  ["index.html", "imgtool.js", "web-kit.js", "export-kit.js", "sample.js", "i18n.js", "version.js", "app.js", "sw.js", "manifest.webmanifest"].forEach(function (file) {
    ok("docs/play/" + file + " exists", fs.existsSync(path.join(dir, file)) && fs.statSync(path.join(dir, file)).size > 0);
  });
  var html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  ["imgtool.js", "web-kit.js", "export-kit.js", "sample.js", "i18n.js", "version.js", "app.js"].forEach(function (file) {
    ok("the page loads " + file, html.indexOf('src="' + file + '"') >= 0);
  });
  ["files", "maxw", "target", "format", "strip", "run", "results", "sample", "theme",
   "preset", "keepColour", "rotate", "crop", "zipBtn", "counter", "lang"].forEach(function (id) {
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
  var appSrc = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  ok("the page can be driven by name, for the landing page's demo", /ImageToolkit\s*=\s*\{/.test(appSrc) && /demo:\s*demo/.test(appSrc));
  ok("and it opens on the sample when asked", /sample=1/.test(appSrc));
  ok("the results area is announced, not just drawn", html.indexOf('aria-live="polite"') >= 0);
  ok("the app counts what leaves the page", appSrc.indexOf("externalRequests") >= 0);
  ok("a queued photo can carry its own settings", appSrc.indexOf("data-own") >= 0 && /item\.opts \|\| opts/.test(appSrc));
  ok("and the run uses them, not the panel's", /processOne\(row\.file, row\.opts\)/.test(appSrc));
  ok("the queue is offered the panel's settings back", appSrc.indexOf("data-copy") >= 0);
}).then(function () {
  /* ---------------------------------------------------------------- */
  section("the landing page is a page, not the app");

  var sitePath = path.join(__dirname, "docs", "index.html");
  ok("docs/index.html exists", fs.existsSync(sitePath) && fs.statSync(sitePath).size > 0);
  var page = fs.readFileSync(sitePath, "utf8");
  ok("it is not the app — the app is at docs/play/", page.indexOf("play/?sample=1") >= 0 && page.indexOf('id="results"') < 0);
  ok("it links to the app", page.indexOf('href="play/"') >= 0);
  ok("no badge comes from an image service", !/img\.shields\.io|badge\.fury|badgen\.net/.test(page));
  var wanted = page.match(/assets\/badge-[a-z]+\.svg/g) || [];
  ok("the page shows the badges", wanted.length >= 5, wanted.length + " references");
  eq("and every one of them exists on disk", wanted.filter(function (b) {
    return !fs.existsSync(path.join(__dirname, "docs", b));
  }), []);
  var fromNetwork = (page.match(/https?:\/\/[^"'\s)]+/g) || []).filter(function (u) {
    return !/drsamonline\.github\.io|github\.com|w3\.org|schema\.org|ns\.adobe\.com|localhost|127\.0\.0\.1/.test(u);
  });
  eq("the landing page loads nothing from the network either", fromNetwork, []);
  ok("the demo has a poster behind the frame", fs.existsSync(path.join(__dirname, "docs", "assets", "app-desktop.png")));
}).then(function () {
  /* ---------------------------------------------------------------- */
  section("the repository keeps the promise, not only the page");

  function walk(dir, out) {
    fs.readdirSync(dir).forEach(function (name) {
      var full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    });
    return out;
  }

  var shipped = walk(path.join(__dirname, "docs"), []).filter(function (f) {
    return /\.(html|js|css|webmanifest|json)$/.test(f);
  });
  var offenders = [];
  shipped.forEach(function (file) {
    var text = fs.readFileSync(file, "utf8");
    var name = path.basename(file);
    var urls = (text.match(/https?:\/\/[^"'\s)]+/g) || []).filter(function (u) {
      return !/drsamonline\.github\.io|github\.com|w3\.org|schema\.org|ns\.adobe\.com|localhost|127\.0\.0\.1/.test(u);
    });
    if (urls.length) offenders.push(name + ": " + urls.join(" "));
    if (/@import\s+url\(\s*["']?https?:/.test(text)) offenders.push(name + ": remote @import");
    // sw.js is the one file allowed to call fetch: it is the offline worker, and
    // it only ever answers from the cache it wrote itself.
    if (/\bfetch\s*\(/.test(text) && name !== "sw.js") offenders.push(name + ": fetch(");
    if (/XMLHttpRequest/.test(text)) offenders.push(name + ": XMLHttpRequest");
  });
  eq("nothing under docs/ reaches the network", offenders, []);

  section("the vendored kits are the ones NOTICE.md says they are");
  var notice = fs.readFileSync(path.join(__dirname, "NOTICE.md"), "utf8");
  ["web-kit.js", "export-kit.js"].forEach(function (name) {
    var digest = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(__dirname, "docs", "play", name))).digest("hex");
    ok(name + " matches the pinned hash", notice.indexOf(digest) >= 0, digest);
  });

  section("one version, in every place it is written");
  var appSrc = fs.readFileSync(path.join(__dirname, "docs", "play", "app.js"), "utf8");
  var playHtml = fs.readFileSync(path.join(__dirname, "docs", "play", "index.html"), "utf8");
  var version = fs.readFileSync(path.join(__dirname, "VERSION"), "utf8").trim();
  var versionJs = fs.readFileSync(path.join(__dirname, "docs", "play", "version.js"), "utf8");
  ok("version.js carries VERSION", versionJs.indexOf('"' + version + '"') >= 0, version);
  var worker = fs.readFileSync(path.join(__dirname, "docs", "play", "sw.js"), "utf8");
  ok("the cache name carries it too, so a release is visible",
    worker.indexOf("image-toolkit-v" + version) >= 0);
  ok("the app prints it in the footer", appSrc.indexOf('$("build")') >= 0);
  ok("and the page asks for the version before the app", playHtml.indexOf('src="version.js"') >= 0 &&
    playHtml.indexOf('src="version.js"') < playHtml.indexOf('src="app.js"'));

  section("it can be installed, and it stays installed");
  var manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "docs", "play", "manifest.webmanifest"), "utf8"));
  eq("the manifest starts at the app itself", manifest.start_url, "./");
  eq("and its scope is the app's own folder", manifest.scope, "./");
  manifest.icons.forEach(function (icon) {
    ok("the icon it names exists: " + icon.src, fs.existsSync(path.join(__dirname, "docs", "play", icon.src)));
  });
  ok("one icon is maskable", manifest.icons.some(function (i) { return /maskable/.test(i.purpose || ""); }));
  ok("the page registers the worker", appSrc.indexOf("serviceWorker.register") >= 0);
  ok("the worker serves the page network-first", /request\.mode === "navigate"[\s\S]{0,200}fetch\(request\)/.test(worker));
  ok("and bumps nothing but its own cache", worker.indexOf("caches.delete") >= 0);

  section("three languages, the same words");
  var tables = require(path.join(__dirname, "docs", "play", "i18n.js")).I18N.tables;
  var enKeys = Object.keys(tables.en).sort();
  ["hi", "gu"].forEach(function (lang) {
    var keys = Object.keys(tables[lang]).sort();
    eq(lang + " has every key the English table has", enKeys.filter(function (k) { return keys.indexOf(k) < 0; }), []);
    eq(lang + " invents no key English does not have", keys.filter(function (k) { return enKeys.indexOf(k) < 0; }), []);
  });
  var asked = (playHtml.match(/data-i18n="([^"]+)"/g) || []).map(function (m) { return m.slice(11, -1); });
  eq("the markup asks only for strings that exist", asked.filter(function (k) { return !(k in tables.en); }), []);

  section("the icon set is complete");
  ["icon-16.png", "icon-32.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "app.ico"].forEach(function (name) {
    var iconPath = path.join(__dirname, "docs", "play", "icons", name);
    ok(name + " exists", fs.existsSync(iconPath) && fs.statSync(iconPath).size > 0);
  });
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
