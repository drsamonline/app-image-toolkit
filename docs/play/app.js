/* app.js — the view over imgtool.js.
 *
 * Everything that touches the DOM lives here, so the engine stays pure and the
 * tests can test what the app actually does. Nothing in this file fetches
 * anything: files come from the file picker, the drop zone or the clipboard,
 * and the sample photo is painted on a canvas.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var MIME = { jpeg: "image/jpeg", webp: "image/webp", png: "image/png" };
  var RATIOS = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16 };

  var state = {
    queue: [],          // { file, info, plan }
    results: [],        // finished rows
    urls: [],           // object URLs to revoke
    lang: "en",
    busy: false
  };

  function t(key, vars) { return I18N.t(state.lang, key, vars); }

  /* --------------------------------------------------------------- theme */

  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    $("theme").textContent = mode === "dark" ? t("theme.toLight") : t("theme.toDark");
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", mode === "dark" ? "#0f1115" : "#f7f5f1");
  }

  $("theme").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem("imgtool-theme", next); } catch (e) { /* private mode */ }
    setTheme(next);
  });

  /* ------------------------------------------------------------ language */

  function setLang(lang) {
    state.lang = I18N.langs.indexOf(lang) >= 0 ? lang : "en";
    document.documentElement.lang = state.lang;
    $("lang").value = state.lang;
    I18N.apply(document, state.lang);
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
    $("build").textContent = t("build", { v: (window.IMAGE_TOOLKIT && window.IMAGE_TOOLKIT.version) || "" });
    refreshCounter();
    renderQueue();
    renderResults();
  }

  $("lang").addEventListener("change", function () {
    try { localStorage.setItem("imgtool-lang", $("lang").value); } catch (e) { /* private mode */ }
    setLang($("lang").value);
  });

  /* ------------------------------------------------- the network counter */

  // The promise, made checkable: count every resource the page has loaded that
  // did not come from this origin. If this number is ever not zero, the app has
  // broken the thing it claims.
  function externalRequests() {
    var n = 0;
    try {
      var entries = performance.getEntriesByType("resource");
      for (var i = 0; i < entries.length; i++) {
        var name = entries[i].name || "";
        if (/^https?:/i.test(name) && name.indexOf(location.origin) !== 0) n++;
      }
    } catch (e) { n = 0; }
    return n;
  }

  function refreshCounter() {
    $("counter").textContent = t("counter", { n: externalRequests() });
  }

  /* -------------------------------------------------------------- presets */

  var PRESETS = {
    custom: null,
    web: { maxw: 1600, target: 300 },
    email: { maxw: 2000, target: 1024 },
    whatsapp: { maxw: 1600, target: 16384 },
    idphoto: { maxw: 600, target: 50 },
    none: { maxw: 0, target: 0 }
  };

  $("preset").addEventListener("change", function () {
    var p = PRESETS[$("preset").value];
    if (!p) return;
    $("maxw").value = p.maxw;
    $("target").value = p.target;
    refreshPlans();
  });

  ["maxw", "target", "format", "strip", "keepColour", "rotate", "crop"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      $("preset").value = "custom";
      refreshPlans();
    });
  });

  function readOpts() {
    return {
      maxW: Math.max(0, parseInt($("maxw").value, 10) || 0),
      targetBytes: Math.max(0, parseInt($("target").value, 10) || 0) * 1024,
      format: $("format").value,
      strip: $("strip").checked,
      keepColour: $("keepColour").checked,
      rotate: $("rotate").value,
      crop: $("crop").value
    };
  }

  /* ---------------------------------------------------------------- plans */

  function planSteps(info, opts) {
    var steps = [];
    if (!info) return [t("err.notimage", { type: "unknown" })];
    if (!info.supported) return [t("err.heic", { route: t("heic.route") })];
    if (info.orientation && info.orientation !== 1) steps.push(t("plan.upright"));
    if (opts.rotate && opts.rotate !== "auto" && opts.rotate !== "0") {
      steps.push(opts.rotate === "flip" ? t("rot.flip") : t("plan.rotate", { deg: opts.rotate }));
    }
    if (info.width && opts.maxW && info.width > opts.maxW) steps.push(t("plan.resize", { w: opts.maxW }));
    if (opts.crop && opts.crop !== "free") steps.push(t("plan.crop", { ratio: opts.crop }));
    if (opts.strip && info.hasGps) steps.push(t("plan.gps"));
    else if (opts.strip && info.hasExif) steps.push(t("plan.meta"));
    if (opts.targetBytes) steps.push(t("plan.compress", { kb: Math.round(opts.targetBytes / 1024) }));
    if (opts.format && opts.format !== "keep" && opts.format !== info.format) {
      steps.push(t("plan.convert", { from: info.format, to: opts.format }));
    }
    if (!steps.length) steps.push(t("plan.none"));
    return steps;
  }

  // The header of a file is enough to say what will happen to it: the format,
  // the dimensions and the EXIF block all sit near the front.
  function head(file) {
    var slice = file.slice ? file.slice(0, 1024 * 1024) : file;
    return slice.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var info = ImgTool.sniff(bytes);
      if (info) {
        var dim = ImgTool.dimensions(bytes);
        info.width = dim ? dim.width : 0;
        info.height = dim ? dim.height : 0;
        info.hasGps = ImgTool.hasGps(bytes);
        info.hasExif = ImgTool.exifTags(bytes).length > 0;
        info.orientation = ImgTool.orientation(bytes);
      }
      return info;
    });
  }

  function refreshPlans() {
    var panel = readOpts();
    state.queue.forEach(function (item) {
      item.plan = planSteps(item.info, item.opts || panel);
    });
    // Once there are results on screen, changing a setting must not replace them
    // with the queue again — the queue is still there, one run away.
    if (state.results.length && !state.busy) renderResults();
    else renderQueue();
  }

  /* ---------------------------------------------------------------- queue */

  function addFiles(list) {
    var added = [];
    for (var i = 0; i < list.length; i++) added.push(list[i]);
    if (!added.length) return;
    var opts = readOpts();
    state.queue = state.queue.concat(added.map(function (f) { return { file: f, info: null, plan: [] }; }));
    $("run").disabled = false;
    renderQueue();
    added.forEach(function (file, index) {
      var item = state.queue[state.queue.length - added.length + index];
      head(file).then(function (info) {
        item.info = info;
        item.plan = planSteps(info, opts);
        renderQueue();
      }).catch(function () {
        item.plan = [t("err.draw")];
        renderQueue();
      });
    });
  }

  function renderQueue() {
    if (state.busy) return;
    if (!state.queue.length) {
      $("results").innerHTML = '<p class="mut">' + esc(t("results.empty")) + "</p>";
      $("results").setAttribute("aria-busy", "false");
      return;
    }
    var panel = readOpts();
    $("results").innerHTML = state.queue.map(function (item, i) {
      return '<div class="item" data-queue="' + i + '">' +
        '<div class="name">' + esc(item.file.name) + "</div>" +
        '<div class="meta num">' + ImgTool.formatBytes(item.file.size) + "</div>" +
        planList(item.plan) +
        '<div class="qrow">' +
          '<button class="ghost tiny" type="button" data-own="' + i + '">' +
            esc(item.opts ? t("q.back") : t("q.own")) + "</button>" +
          '<span class="mut tiny" data-follows="' + i + '">' +
            esc(item.opts ? t("q.ownNote") : t("q.panel")) + "</span>" +
        "</div>" +
        rowOpts(item, i, item.opts || panel) +
        "</div>";
    }).join("");
    $("zipBtn").hidden = state.results.length === 0;
  }

  // The same controls as the panel, for one photo. A queue where every file
  // must share one setting is a queue that makes you run the app twice.
  function rowOpts(item, i, opts) {
    var open = item.open ? "" : " hidden";
    function field(name, label, control) {
      return "<div><label>" + esc(label) + "</label>" + control + "</div>";
    }
    function formatOptions() {
      return [["keep", t("fmt.keep")], ["jpeg", "JPEG"], ["webp", "WebP"], ["png", "PNG"]]
        .map(function (pair) {
          return '<option value="' + pair[0] + '"' + (opts.format === pair[0] ? " selected" : "") + ">" +
            esc(pair[1]) + "</option>";
        }).join("");
    }
    function cropOptions() {
      return [["free", t("crop.free")], ["1:1", t("crop.square")], ["4:3", "4:3"], ["3:4", "3:4"], ["16:9", "16:9"], ["9:16", "9:16"]]
        .map(function (pair) {
          return '<option value="' + pair[0] + '"' + (opts.crop === pair[0] ? " selected" : "") + ">" +
            esc(pair[1]) + "</option>";
        }).join("");
    }
    function rotateOptions() {
      return [["auto", t("rot.auto")], ["0", t("rot.0")], ["90", t("rot.90")], ["180", t("rot.180")], ["270", t("rot.270")], ["flip", t("rot.flip")]]
        .map(function (pair) {
          return '<option value="' + pair[0] + '"' + (opts.rotate === pair[0] ? " selected" : "") + ">" +
            esc(pair[1]) + "</option>";
        }).join("");
    }
    return '<div class="rowopts"' + open + ' data-opts="' + i + '">' +
      '<div class="grid">' +
        field("maxw", t("q.maxw"), '<input data-opt="maxw" type="number" min="0" step="50" inputmode="numeric" value="' + opts.maxW + '">') +
        field("target", t("q.target"), '<input data-opt="target" type="number" min="0" step="50" inputmode="numeric" value="' + Math.round(opts.targetBytes / 1024) + '">') +
        field("format", t("q.format"), '<select data-opt="format">' + formatOptions() + "</select>") +
        field("crop", t("q.crop"), '<select data-opt="crop">' + cropOptions() + "</select>") +
        field("rotate", t("q.rotate"), '<select data-opt="rotate">' + rotateOptions() + "</select>") +
        "<div>" +
          '<label style="font-size:12px">' + esc(t("q.strip")) + "</label>" +
          '<label style="font-size:14px;color:var(--ink)"><input data-opt="strip" type="checkbox"' + (opts.strip ? " checked" : "") + "> " + esc(t("opt.strip")) + "</label>" +
          '<label style="font-size:14px;color:var(--ink);margin-top:4px"><input data-opt="keepColour" type="checkbox"' + (opts.keepColour ? " checked" : "") + "> " + esc(t("opt.colour")) + "</label>" +
        "</div>" +
      "</div>" +
      '<div class="actions"><button class="ghost tiny" type="button" data-copy="' + i + '">' + esc(t("q.copy")) + "</button></div>" +
      "</div>";
  }

  function optsFromRow(row) {
    var q = function (name) { return row.querySelector('[data-opt="' + name + '"]'); };
    return {
      maxW: Math.max(0, parseInt(q("maxw").value, 10) || 0),
      targetBytes: Math.max(0, parseInt(q("target").value, 10) || 0) * 1024,
      format: q("format").value,
      strip: q("strip").checked,
      keepColour: q("keepColour").checked,
      rotate: q("rotate").value,
      crop: q("crop").value
    };
  }

  // One delegated listener for the queue: the rows are rebuilt often, and a
  // listener per row would have to be rebuilt with them.
  $("results").addEventListener("click", function (e) {
    var button = e.target.closest ? e.target.closest("[data-own],[data-copy]") : null;
    if (!button) return;
    var ownIndex = button.getAttribute("data-own");
    if (ownIndex !== null) {
      var item = state.queue[parseInt(ownIndex, 10)];
      if (!item) return;
      if (item.opts) { item.opts = null; item.open = false; }
      else { item.opts = readOpts(); item.open = true; }
      item.plan = planSteps(item.info, item.opts || readOpts());
      renderQueue();
      return;
    }
    var copyIndex = button.getAttribute("data-copy");
    if (copyIndex !== null) {
      var source = state.queue[parseInt(copyIndex, 10)];
      if (!source || !source.opts) return;
      $("maxw").value = source.opts.maxW;
      $("target").value = Math.round(source.opts.targetBytes / 1024);
      $("format").value = source.opts.format;
      $("strip").checked = source.opts.strip;
      $("keepColour").checked = source.opts.keepColour;
      $("rotate").value = source.opts.rotate;
      $("crop").value = source.opts.crop;
      $("preset").value = "custom";
      refreshPlans();
    }
  });

  $("results").addEventListener("change", function (e) {
    var row = e.target.closest ? e.target.closest("[data-opts]") : null;
    if (!row) return;
    var index = parseInt(row.getAttribute("data-opts"), 10);
    var item = state.queue[index];
    if (!item) return;
    item.opts = optsFromRow(row);
    item.plan = planSteps(item.info, item.opts);
    var host = $("results").querySelector('[data-queue="' + index + '"]');
    if (host) {
      var plan = host.querySelector(".plan");
      if (plan) plan.outerHTML = planList(item.plan);
      else host.insertAdjacentHTML("beforeend", planList(item.plan));
      var follows = host.querySelector('[data-follows="' + index + '"]');
      if (follows) follows.textContent = t("q.ownNote");
    }
  });

  function planList(steps) {
    if (!steps || !steps.length) return "";
    return '<ul class="plan"><li>' + steps.map(esc).join("</li><li>") + "</li></ul>";
  }

  $("files").addEventListener("change", function (e) { addFiles(e.target.files); });
  $("drop").addEventListener("click", function () { $("files").click(); });
  ["dragenter", "dragover"].forEach(function (ev) {
    $("drop").addEventListener(ev, function (e) { e.preventDefault(); $("drop").classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    $("drop").addEventListener(ev, function (e) { e.preventDefault(); $("drop").classList.remove("over"); });
  });
  $("drop").addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // A screenshot has to be saved to disk before a file picker can see it, which
  // is exactly the friction that sends people to an online tool.
  document.addEventListener("paste", function (e) {
    if (!e.clipboardData) return;
    var found = [];
    for (var i = 0; i < e.clipboardData.items.length; i++) {
      var item = e.clipboardData.items[i];
      if (item.kind === "file") {
        var f = item.getAsFile();
        if (f) found.push(f);
      }
    }
    if (found.length) { addFiles(found); e.preventDefault(); }
  });

  $("clear").addEventListener("click", function () {
    revokeUrls();
    state.queue = [];
    state.results = [];
    $("files").value = "";
    $("run").disabled = true;
    $("zipBtn").hidden = true;
    renderQueue();
  });

  function revokeUrls() {
    state.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* gone */ } });
    state.urls = [];
  }

  function urlFor(blob) {
    var u = URL.createObjectURL(blob);
    state.urls.push(u);
    return u;
  }

  /* ------------------------------------------------------------- drawing */

  function decode(blob) {
    // Orientation is handled here, from the tag read before the strip, so the
    // browser must not apply the tag a second time — and after a strip there is
    // no tag left to apply.
    if (typeof createImageBitmap === "function") {
      try { return createImageBitmap(blob, { imageOrientation: "none" }); } catch (e) { /* older browsers */ }
      try { return createImageBitmap(blob); } catch (e2) { /* fall through */ }
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("draw")); };
      img.src = url;
    });
  }

  function toBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error("encode:" + mime));
      }, mime, quality);
    });
  }

  // EXIF orientation, plus whatever the user asked for, as one rotation and one
  // mirror. The mapping is the standard one: 2 is mirrored, 3 is 180°, 6 means
  // "turn 90° clockwise to see it upright".
  function transformFor(exifOrientation, rotateChoice) {
    var rot = 0, flip = false;
    switch (exifOrientation) {
      case 2: flip = true; break;
      case 3: rot = 180; break;
      case 4: rot = 180; flip = true; break;
      case 5: rot = 90; flip = true; break;
      case 6: rot = 90; break;
      case 7: rot = 270; flip = true; break;
      case 8: rot = 270; break;
      default: break;
    }
    if (rotateChoice === "flip") flip = !flip;
    else if (rotateChoice && rotateChoice !== "auto" && rotateChoice !== "0") rot = (rot + parseInt(rotateChoice, 10)) % 360;
    return { rot: rot, flip: flip };
  }

  function cropRect(width, height, ratioName) {
    var ratio = RATIOS[ratioName];
    if (!ratio) return { x: 0, y: 0, w: width, h: height };
    var w = width, h = Math.round(width / ratio);
    if (h > height) { h = height; w = Math.round(height * ratio); }
    return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w: w, h: h };
  }

  // Draw the source once, rotated, mirrored, cropped and fitted — in that order,
  // on one canvas, so a photo is decoded and encoded exactly once.
  function render(img, srcW, srcH, opts, transform) {
    var crop = cropRect(srcW, srcH, opts.crop);
    var outW = transform.rot === 90 || transform.rot === 270 ? crop.h : crop.w;
    var outH = transform.rot === 90 || transform.rot === 270 ? crop.w : crop.h;
    var box = ImgTool.fit(outW, outH, opts.maxW, opts.maxW);
    var width = box.width || outW, height = box.height || outH;

    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";

    // A JPEG has no alpha; anything transparent would otherwise come out black.
    if (!opts.strip) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
    }
    var dw = transform.rot === 90 || transform.rot === 270 ? height : width;
    var dh = transform.rot === 90 || transform.rot === 270 ? width : height;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    if (transform.rot) ctx.rotate((transform.rot * Math.PI) / 180);
    if (transform.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    return { canvas: canvas, width: width, height: height };
  }

  /* ---------------------------------------------------------- processing */

  function processOne(file, opts) {
    var before = file.size;
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var info = ImgTool.sniff(bytes);
      if (!info) throw new Error("notimage:" + (file.type || "none"));
      if (!info.supported) throw new Error("heic");

      var dim = ImgTool.dimensions(bytes);
      var orientation = ImgTool.orientation(bytes);
      var gps = ImgTool.hasGps(bytes);
      var tags = ImgTool.exifTags(bytes);
      var cleaned = opts.strip
        ? ImgTool.stripMetadata(bytes, { keepColour: opts.keepColour })
        : { bytes: bytes, removed: [] };

      // The claim, checked: what is left in the bytes that will actually be
      // written, not what was asked for.
      var left = ImgTool.remaining(cleaned.bytes);
      var clean = left.length === 0 && !ImgTool.hasGps(cleaned.bytes);

      return decode(new Blob([cleaned.bytes], { type: info.mime })).then(function (img) {
        var w = img.width || (dim && dim.width) || 0;
        var h = img.height || (dim && dim.height) || 0;
        var transform = transformFor(orientation, opts.rotate);
        var drawn = render(img, w, h, opts, transform);

        var outFormat = opts.format === "keep" ? info.format : opts.format;
        if (outFormat !== "jpeg" && outFormat !== "webp" && outFormat !== "png") outFormat = "jpeg";
        var mime = MIME[outFormat];

        var encoded;
        if (outFormat === "png" || !opts.targetBytes) {
          encoded = toBlob(drawn.canvas, mime, 0.92).then(function (b) {
            return { blob: b, quality: null, fits: true, history: [] };
          });
        } else {
          encoded = ImgTool.budget(opts.targetBytes, function (q) {
            return toBlob(drawn.canvas, mime, q).then(function (b) { return { size: b.size, blob: b }; });
          }, { steps: 6 }).then(function (r) {
            return { blob: r.out.blob, quality: r.quality, fits: r.fits, history: r.history };
          });
        }

        return encoded.then(function (out) {
          return {
            name: file.name,
            before: before,
            after: out.blob.size,
            blob: out.blob,
            mime: mime,
            format: outFormat,
            sourceFormat: info.format,
            width: { width: drawn.width, height: drawn.height },
            gps: gps,
            tags: tags,
            removed: cleaned.removed,
            orientation: orientation,
            left: left,
            clean: clean,
            quality: out.quality,
            fits: out.fits !== false,
            history: out.history,
            beforeUrl: urlFor(file),
            afterUrl: urlFor(out.blob)
          };
        });
      });
    });
  }

  function run() {
    var opts = readOpts();
    var items = state.queue.slice();
    if (!items.length || state.busy) return;

    state.busy = true;
    $("run").disabled = true;
    $("run").textContent = t("btn.working");
    $("results").setAttribute("aria-busy", "true");
    $("results").innerHTML = '<p class="mut">' + esc(t("results.working")) + "</p>";
    $("zipBtn").hidden = true;

    var rows = items.map(function (item) {
      return { file: item.file, opts: item.opts || opts, status: "waiting" };
    });
    var chain = Promise.resolve();

    rows.forEach(function (row, i) {
      chain = chain.then(function () {
        row.status = "working";
        renderRows(rows);
        return processOne(row.file, row.opts).then(function (r) {
          row.status = "done";
          row.result = r;
          state.results.push(r);
        }).catch(function (err) {
          row.status = "error";
          row.error = describeError(err);
        }).then(function () { renderRows(rows); });
      });
    });

    return chain.then(function () {
      state.busy = false;
      $("run").disabled = false;
      $("run").textContent = t("btn.process");
      $("results").setAttribute("aria-busy", "false");
      $("zipBtn").hidden = state.results.length === 0;
      renderResults(rows);
      refreshCounter();
    });
  }

  function describeError(err) {
    var message = err && err.message ? err.message : String(err);
    if (message.indexOf("notimage:") === 0) return t("err.notimage", { type: message.split(":")[1] });
    if (message === "heic") return t("err.heic", { route: t("heic.route") });
    if (message.indexOf("encode:") === 0) return t("err.encode", { mime: message.split(":")[1] });
    if (message === "draw") return t("err.draw");
    return message;
  }

  /* ------------------------------------------------------------- results */

  function renderRows(rows) {
    var done = rows.filter(function (r) { return r.status === "done"; });
    $("results").innerHTML = rows.map(function (row) {
      var head = '<div class="name">' + esc(row.file.name) + "</div>";
      if (row.status === "waiting") return '<div class="item">' + head + '<div class="meta num">' + ImgTool.formatBytes(row.file.size) + "</div></div>";
      if (row.status === "working") return '<div class="item">' + head + '<div class="meta">' + esc(t("btn.working")) + "</div></div>";
      if (row.status === "error") return '<div class="item">' + head + '<div class="err">' + esc(row.error) + "</div></div>";
      return rowMarkup(row.result, done.indexOf(row));
    }).join("");
    wireRows(rows);
  }

  function renderResults(rows) {
    if (rows && rows.length) { renderRows(rows); return; }
    renderQueue();
  }

  function rowMarkup(r, index) {
    var saved = r.before > 0 ? Math.round((1 - r.after / r.before) * 100) : 0;
    var badges = "";

    if (r.gps) badges += '<span class="badge good">' + esc(t("badge.gps")) + "</span>";
    else if (r.removed.length) badges += '<span class="badge good">' + esc(t("badge.meta")) + "</span>";
    if (r.clean && (r.removed.length || r.gps)) badges += '<span class="badge good">' + esc(t("badge.clean")) + "</span>";
    if (r.gps === false && !r.tags.length && r.removed.length === 0 && r.sourceFormat === "jpeg") {
      badges += '<span class="badge warn">' + esc(t("badge.unverified")) + "</span>";
    }
    if (r.orientation && r.orientation !== 1) badges += '<span class="badge">' + esc(t("badge.upright")) + "</span>";
    if (r.quality !== null && r.quality !== undefined) badges += '<span class="badge">' + esc(t("badge.quality", { n: Math.round(r.quality * 100) })) + "</span>";
    if (r.fits === false) badges += '<span class="badge warn">' + esc(t("badge.notarget")) + "</span>";
    if (r.format === "png" && r.after >= r.before) badges += '<span class="badge warn">' + esc(t("badge.png")) + "</span>";

    var dim = r.width ? r.width.width + " × " + r.width.height : "";
    var meta = ImgTool.formatBytes(r.before) + " → " + ImgTool.formatBytes(r.after) +
      (saved > 0 ? "  (" + t("saved", { p: saved }) + ")" : "") + (dim ? "  ·  " + dim : "");

    return '<div class="item" data-row="' + index + '">' +
      '<div class="name">' + esc(r.name) + "</div>" +
      '<div class="meta num">' + esc(meta) + "</div>" +
      badges +
      '<div class="preview">' +
        '<img class="before" src="' + r.beforeUrl + '" alt="' + esc(r.name) + '">' +
        '<img class="after" src="' + r.afterUrl + '" alt="' + esc(r.name) + '">' +
        '<span class="tag l">' + esc(t("report.before")) + "</span>" +
        '<span class="tag r">' + esc(t("report.after")) + "</span>" +
        '<input type="range" min="0" max="100" value="50" step="1" aria-label="' + esc(t("report.compare")) + '" data-wipe="' + index + '">' +
      "</div>" +
      (r.history && r.history.length ? '<div class="chart"><canvas data-chart="' + index + '" width="680" height="220"></canvas></div>' : "") +
      '<div class="actions">' +
        '<button class="ghost" data-dl="' + index + '">' + esc(t("btn.download")) + "</button>" +
        '<button class="ghost" data-report="' + index + '">' + esc(t("btn.report")) + "</button>" +
      "</div>" +
      "</div>";
  }

  function wireRows(rows) {
    var finished = rows.filter(function (r) { return r.status === "done"; });

    Array.prototype.forEach.call($("results").querySelectorAll("[data-wipe]"), function (input) {
      var row = $("results").querySelector('[data-row="' + input.getAttribute("data-wipe") + '"]');
      var after = row && row.querySelector(".after");
      if (!after) return;
      var set = function () { after.style.clipPath = "inset(0 " + (100 - input.value) + "% 0 0)"; };
      input.addEventListener("input", set);
      set();
    });

    Array.prototype.forEach.call($("results").querySelectorAll("[data-chart]"), function (canvas) {
      var r = finished.filter(function (x) { return x.result; })[parseInt(canvas.getAttribute("data-chart"), 10)];
      if (r) drawChart(canvas, r.result);
    });

    Array.prototype.forEach.call($("results").querySelectorAll("[data-dl]"), function (btn) {
      btn.addEventListener("click", function () {
        var r = finished[parseInt(btn.getAttribute("data-dl"), 10)];
        if (!r || !r.result) return;
        try {
          var ext = r.result.format === "jpeg" ? "jpg" : r.result.format;
          Export.blob(ImgTool.outName(r.file.name, ext), r.result.blob, r.result.mime);
        } catch (e) {
          btn.textContent = t("btn.notwritten");
          btn.title = (e && e.message) || "the browser refused the download";
        }
      });
    });

    Array.prototype.forEach.call($("results").querySelectorAll("[data-report]"), function (btn) {
      btn.addEventListener("click", function () {
        var r = finished[parseInt(btn.getAttribute("data-report"), 10)];
        if (!r || !r.result) return;
        var text = reportFor(r.result);
        Export.blob(ImgTool.outName(r.file.name, "txt"), new Blob([text], { type: "text/plain;charset=utf-8" }), "text/plain");
      });
    });
  }

  /* --------------------------------------------------------------- chart */

  // The six encoder calls, drawn: this is what "the search, not a guess" looks
  // like. Quality across, bytes up, the budget as a line to stay under.
  function drawChart(canvas, r) {
    var points = r.history.slice().sort(function (a, b) { return a.quality - b.quality; });
    if (points.length < 2) return;
    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue("--ink").trim() || "#191713";
    var mut = css.getPropertyValue("--mut").trim() || "#6a645a";
    var line = css.getPropertyValue("--line").trim() || "#e3ded4";
    var acc = css.getPropertyValue("--acc").trim() || "#14724a";
    var warn = css.getPropertyValue("--warn").trim() || "#9a5b06";

    var w = 340, h = 110, padL = 38, padR = 8, padT = 12, padB = 20;
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);

    var maxSize = 0;
    points.forEach(function (p) { if (p.size > maxSize) maxSize = p.size; });
    if (r.history.length && r.fits) maxSize = Math.max(maxSize, points[0].size);
    maxSize = Math.max(maxSize, 1) * 1.1;
    var qs = points.map(function (p) { return p.quality; });
    var minQ = Math.min.apply(null, qs) - 0.02, maxQ = Math.max.apply(null, qs) + 0.02;

    function x(q) { return padL + ((q - minQ) / (maxQ - minQ || 1)) * (w - padL - padR); }
    function y(s) { return h - padB - (s / maxSize) * (h - padT - padB); }

    // axes
    g.strokeStyle = line;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(padL, padT);
    g.lineTo(padL, h - padB);
    g.lineTo(w - padR, h - padB);
    g.stroke();

    // the budget
    var target = Math.round(parseInt($("target").value, 10) || 0) * 1024;
    if (target > 0 && target < maxSize) {
      g.strokeStyle = warn;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.moveTo(padL, y(target));
      g.lineTo(w - padR, y(target));
      g.stroke();
      g.setLineDash([]);
    }

    // the curve
    g.strokeStyle = acc;
    g.lineWidth = 1.6;
    g.beginPath();
    points.forEach(function (p, i) { i ? g.lineTo(x(p.quality), y(p.size)) : g.moveTo(x(p.quality), y(p.size)); });
    g.stroke();

    points.forEach(function (p) {
      var fits = p.size <= target || !target;
      g.fillStyle = fits ? acc : mut;
      g.beginPath();
      g.arc(x(p.quality), y(p.size), 2.6, 0, Math.PI * 2);
      g.fill();
    });

    g.fillStyle = mut;
    g.font = "9px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText(Math.round(minQ * 100) + "%", padL, h - 6);
    g.textAlign = "right";
    g.fillText(Math.round(maxQ * 100) + "%", w - padR, h - 6);
    g.textAlign = "right";
    g.fillStyle = ink;
    g.fillText(ImgTool.formatBytes(Math.round(maxSize / 1.1)), padL - 5, padT + 4);
  }

  /* -------------------------------------------------------------- report */

  function reportFor(r) {
    var lines = [];
    lines.push(t("report.head"));
    lines.push("");
    lines.push(t("report.file") + ": " + r.name);
    lines.push(t("report.size") + ": " + ImgTool.formatBytes(r.before) + " → " + ImgTool.formatBytes(r.after));
    if (r.width) lines.push(t("report.dims") + ": " + r.width.width + " × " + r.width.height);
    lines.push(t("report.removed") + ": " + (r.removed.length ? r.removed.join(", ") : t("report.none")));
    lines.push(t("report.checked") + ": " + (r.clean ? t("report.clean") : t("report.dirty", { what: r.left.join(", ") || "gps" })));
    if (r.quality !== null && r.quality !== undefined) lines.push(t("report.quality") + ": " + Math.round(r.quality * 100));
    lines.push("");
    lines.push("Image Toolkit " + ((window.IMAGE_TOOLKIT && window.IMAGE_TOOLKIT.version) || "") + " · nothing left this device");
    return lines.join("\n") + "\n";
  }

  /* ----------------------------------------------------------------- zip */

  $("zipBtn").addEventListener("click", function () {
    var done = state.results.filter(function (r) { return r.blob; });
    if (!done.length) return;
    var btn = $("zipBtn");
    btn.disabled = true;
    Promise.all(done.map(function (r) {
      return r.blob.arrayBuffer().then(function (buf) {
        var ext = r.format === "jpeg" ? "jpg" : r.format;
        return { name: ImgTool.outName(r.name, ext), bytes: new Uint8Array(buf) };
      });
    })).then(function (entries) {
      var bytes = ImgTool.zip(entries);
      Export.blob("image-toolkit.zip", new Blob([bytes], { type: "application/zip" }), "application/zip");
    }).catch(function () {
      btn.textContent = t("btn.notwritten");
    }).then(function () {
      btn.disabled = false;
      refreshCounter();
    });
  });

  /* -------------------------------------------------------------- sample */

  var PRESET_MODES = {
    sample: { maxw: 1600, target: 300, format: "keep", strip: true },
    best: { maxw: 0, target: 0, format: "keep", strip: false },
    strip: { maxw: 0, target: 0, format: "keep", strip: true },
    webp: { maxw: 1600, target: 300, format: "webp", strip: true }
  };

  function demo(mode) {
    var p = PRESET_MODES[mode] || PRESET_MODES.sample;
    if (typeof Sample === "undefined" || !Sample.photo) return Promise.reject(new Error("sample"));
    $("maxw").value = p.maxw;
    $("target").value = p.target;
    $("format").value = p.format;
    $("strip").checked = p.strip;
    $("preset").value = "custom";
    revokeUrls();
    state.queue = [];
    state.results = [];
    $("results").innerHTML = '<p class="mut">' + esc(t("results.painting")) + "</p>";
    return Sample.photo().then(function (file) {
      state.queue = [{ file: file, info: null, plan: [] }];
      renderQueue();
      return run();
    });
  }

  $("sample").addEventListener("click", function () {
    var btn = $("sample");
    btn.disabled = true;
    demo("sample").catch(function (e) {
      $("results").innerHTML = '<p class="err">' + esc(e && e.message === "sample" ? t("err.sample") : String(e)) + "</p>";
    }).then(function () { btn.disabled = false; });
  });

  window.ImageToolkit = { demo: demo, presets: Object.keys(PRESET_MODES) };

  /* --------------------------------------------------------------- start */

  $("run").addEventListener("click", function () { run(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !$("run").disabled) run();
  });

  (function start() {
    var saved = null;
    try { saved = localStorage.getItem("imgtool-lang"); } catch (e) { saved = null; }
    var guess = (navigator.language || "en").slice(0, 2).toLowerCase();
    setLang(saved || (I18N.langs.indexOf(guess) >= 0 ? guess : "en"));

    var v = (window.IMAGE_TOOLKIT && window.IMAGE_TOOLKIT.version) || "";
    $("build").textContent = t("build", { v: v });

    refreshCounter();
    setInterval(refreshCounter, 2000);

    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        // Ask for the new worker on every load: a cache-first worker that is
        // never updated is a release nobody can see.
        if (reg && reg.update) reg.update();
      }).catch(function () { /* no worker is not a failure to load */ });
    }

    if (/[?&]sample=1/.test(location.search)) {
      window.addEventListener("load", function () { demo("sample"); });
    }
  }());

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
}());
