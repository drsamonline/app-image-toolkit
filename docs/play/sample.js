/* sample.js — the photo the app demos with, drawn here, offline.
 *
 * A visitor with no photo of their own could not see the tool work, and the
 * honest answer to that is not a stock image fetched from somewhere. So the
 * sample is painted on a canvas at the moment it is asked for, encoded by the
 * browser, and given a real EXIF block with a real GPS fix by imgtool.js.
 *
 * Nothing here touches the network, and nothing is bundled as bytes: the file
 * a 3 MB photo would be is made from code, every time it is needed.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function (root) {
  "use strict";

  var W = 3200, H = 2400;

  // Two frames, so the "painting the sample" line is on screen before the work
  // starts rather than after it.
  function frame() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame !== "function") { setTimeout(resolve, 16); return; }
      requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(); }); });
    });
  }

  // Film grain, at the full resolution of the frame. A smooth drawing encodes
  // to a small file and would make the sample a dishonest test of the budget
  // search; a photo has detail in every pixel, so this one gets it too.
  //
  // 7.7 million pixels of it, though, is a second and a half of frozen main
  // thread on a desktop and worse on a phone. So it runs in slices: the page
  // stays answerable while the grain goes in.
  var SLICE = 400000 * 4;                 // bytes of ImageData per task

  function addGrain(canvas) {
    var g = canvas.getContext("2d");
    var img = g.getImageData(0, 0, canvas.width, canvas.height);
    var d = img.data;
    var at = 0;
    return new Promise(function (resolve) {
      function slice() {
        var to = Math.min(d.length, at + SLICE);
        for (; at < to; at += 4) {
          var n = ((Math.random() * 35) | 0) - 17;
          d[at] += n; d[at + 1] += n; d[at + 2] += n;
        }
        if (at < d.length) setTimeout(slice, 0);
        else { g.putImageData(img, 0, 0); resolve(canvas); }
      }
      slice();
    });
  }

  function hills(g, baseY, amp, colour, phase) {
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, baseY);
    for (var x = 0; x <= W; x += 40) {
      var y = baseY + Math.sin((x / W) * Math.PI * (1.6 + phase) + phase) * amp
        + Math.sin((x / W) * Math.PI * 5.3 + phase * 2) * amp * 0.22;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = colour;
    g.fill();
  }

  function paint() {
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");

    // The sky, from dusk-blue at the top to a warm horizon.
    var sky = g.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0, "#16232f");
    sky.addColorStop(0.38, "#3f6076");
    sky.addColorStop(0.66, "#d7a273");
    sky.addColorStop(1, "#e3bd8b");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H * 0.72);

    // A low sun and its haze.
    var sx = W * 0.71, sy = H * 0.46;
    var halo = g.createRadialGradient(sx, sy, 0, sx, sy, W * 0.42);
    halo.addColorStop(0, "rgba(255,236,196,.95)");
    halo.addColorStop(0.16, "rgba(255,206,140,.55)");
    halo.addColorStop(0.5, "rgba(240,170,110,.16)");
    halo.addColorStop(1, "rgba(240,170,110,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H * 0.72);
    g.beginPath();
    g.arc(sx, sy, W * 0.045, 0, Math.PI * 2);
    g.fillStyle = "#fff3d6";
    g.fill();

    // Three ridges, each cooler and lighter than the one in front of it.
    hills(g, H * 0.60, H * 0.055, "#6f7f8c", 0.4);
    hills(g, H * 0.66, H * 0.045, "#4e606d", 1.7);
    hills(g, H * 0.72, H * 0.035, "#33424d", 3.1);

    // The near ground, with a track running into the light.
    var ground = g.createLinearGradient(0, H * 0.72, 0, H);
    ground.addColorStop(0, "#26313a");
    ground.addColorStop(1, "#141b21");
    g.fillStyle = ground;
    g.fillRect(0, H * 0.72, W, H * 0.28);

    g.beginPath();
    g.moveTo(W * 0.46, H * 0.735);
    g.lineTo(W * 0.55, H * 0.735);
    g.lineTo(W * 0.86, H);
    g.lineTo(W * 0.10, H);
    g.closePath();
    g.fillStyle = "rgba(198,170,132,.30)";
    g.fill();

    // Scattered trees on the ridge line, for detail the encoder must work on.
    for (var i = 0; i < 90; i++) {
      var tx = Math.random() * W;
      var ty = H * 0.735 + Math.random() * H * 0.04;
      var th = 18 + Math.random() * 46;
      g.beginPath();
      g.moveTo(tx, ty - th);
      g.lineTo(tx - th * 0.34, ty);
      g.lineTo(tx + th * 0.34, ty);
      g.closePath();
      g.fillStyle = "rgba(12,18,22,.82)";
      g.fill();
    }

    return addGrain(c).then(function () { return c; });
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error("the browser could not encode the sample"));
      }, "image/jpeg", 0.94);
    });
  }

  // A File the page can feed through exactly the path a dropped photo takes.
  function photo() {
    return frame().then(paint).then(toBlob).then(function (blob) {
      return blob.arrayBuffer();
    }).then(function (buf) {
      var bytes = root.ImgTool.attachExif(new Uint8Array(buf), root.ImgTool.exifWithGps());
      return new File([bytes], "IMG_4021.jpg", { type: "image/jpeg", lastModified: Date.UTC(2026, 9, 24, 17, 12) });
    });
  }

  root.Sample = { photo: photo, width: W, height: H };
}(typeof self !== "undefined" ? self : this));
