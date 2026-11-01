#!/usr/bin/env python3
"""uitest.py — the app in a real browser, asserting what a user would notice.

`test-node.js` proves the engine. It cannot see the view at all, and every
user-facing defect this project has had lived in the view: a second run that
doubled the ZIP, a settings change that threw the results away, a drop zone that
opened the file picker twice, a picker no keyboard could reach. All four passed
the Node suite, because the Node suite never loads a page.

So this drives the real page in headless Chromium over the DevTools protocol —
the same harness as `scripts/shot.py`, standard library only — and asserts the
things a person would notice. No dependency, no test framework, no build.

  python3 scripts/uitest.py

Exit code is 0 when every check passes, 1 otherwise. Needs `chromium` (or
`google-chrome`) on PATH; skips with exit 0 and a notice if there is none, so it
is safe to run in CI.

PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
"""
import base64
import io
import json
import os
import shutil
import sys
import tempfile
import time
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shot as S  # noqa: E402  (the CDP client lives there)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")

passed, failed = 0, 0


def check(name, value, expected):
    global passed, failed
    if value == expected:
        passed += 1
        print("  ok   %s" % name)
    else:
        failed += 1
        print("  FAIL %s  <- got %r, wanted %r" % (name, value, expected))


def ok(name, condition, detail=""):
    check(name + (("  (" + detail + ")") if detail else ""), bool(condition), True)


def wait_for(cdp, expr, timeout=40, interval=0.25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if cdp.eval(expr):
                return True
        except RuntimeError:
            pass
        time.sleep(interval)
    return False


def main():
    browser = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    if not browser:
        print("no chromium on PATH — skipping the browser checks (they are not run, not passed)")
        return 0

    server = S.serve_dir(DOCS)
    port = server.server_address[1]
    profile = tempfile.mkdtemp(prefix="uitest-")
    proc = None
    try:
        proc, devtools = S.launch(browser, 1200, 1400, False, profile)
        cdp = S.CDP(S.WS(S.page_ws(devtools)))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Page.navigate", url="http://127.0.0.1:%d/play/index.html" % port)
        ok("the page loads", wait_for(cdp, "document.readyState === 'complete' && !!window.ImageToolkit"))

        print("\nreaching the file picker")
        check("the drop zone is a button, so it is in the tab order",
              cdp.eval("document.getElementById('drop').tagName"), "BUTTON")
        check("one click on it opens the picker once",
              cdp.eval("""(function () {
                var input = document.getElementById('files'), n = 0;
                input.addEventListener('click', function (e) { n++; e.preventDefault(); });
                document.getElementById('drop').click();
                return n;
              })()"""), 1)
        ok("nothing else is a label pointing at the input",
           cdp.eval("document.querySelectorAll('label[for=\"files\"]').length") == 0)

        print("\nrunning the sample")
        cdp.eval("window.ImageToolkit.demo('sample')")
        ok("the run finishes", wait_for(cdp, "document.querySelectorAll('[data-row]').length === 1", timeout=60))
        check("one result row", cdp.eval("document.querySelectorAll('[data-row]').length"), 1)
        ok("the result reports a before and an after",
           cdp.eval("(document.querySelector('[data-row] .meta') || {}).textContent || ''").find("→") >= 0)
        ok("it was checked, not just stripped",
           cdp.eval("""Array.prototype.some.call(document.querySelectorAll('[data-row] .badge'),
                       function (b) { return /checked|जाँचा|તપાસ્યું/i.test(b.textContent); })"""))
        ok("the status line says it finished",
           len(cdp.eval("document.getElementById('status').textContent") or "") > 0)

        print("\nthe results survive a settings change")
        cdp.eval("""(function () {
          var t = document.getElementById('target'); t.value = '120';
          t.dispatchEvent(new Event('change', { bubbles: true }));
        })()""")
        time.sleep(0.4)
        check("still one result row after changing the target",
              cdp.eval("document.querySelectorAll('[data-row]').length"), 1)
        cdp.eval("""(function () {
          var l = document.getElementById('lang'); l.value = 'hi';
          l.dispatchEvent(new Event('change'));
        })()""")
        time.sleep(0.4)
        check("and after switching language", cdp.eval("document.querySelectorAll('[data-row]').length"), 1)
        ok("the page is in Hindi", cdp.eval("document.documentElement.lang") == "hi")
        cdp.eval("""(function () {
          var l = document.getElementById('lang'); l.value = 'en';
          l.dispatchEvent(new Event('change'));
        })()""")

        print("\na second run does not double the batch")
        cdp.eval("window.__zip = null; window.__origBlob = Export.blob;")
        cdp.eval("""Export.blob = function (name, blob) {
          if (/zip$/.test(name)) {
            blob.arrayBuffer().then(function (b) {
              var d = new Uint8Array(b), s = '';
              for (var i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
              window.__zip = btoa(s);
            });
            return;
          }
          return window.__origBlob.apply(this, arguments);
        };""")
        cdp.eval("document.getElementById('run').click()")
        ok("the second run finishes", wait_for(cdp, "!document.getElementById('run').disabled", timeout=60))
        time.sleep(0.3)
        cdp.eval("document.getElementById('zipBtn').click()")
        ok("the zip is produced", wait_for(cdp, "!!window.__zip", timeout=20))
        raw = cdp.eval("window.__zip")
        if raw:
            archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(raw)))
            names = archive.namelist()
            check("one entry for one photo, after two runs", len(names), 1)
            ok("the entry is a readable jpeg", archive.read(names[0])[:2] == b"\xff\xd8")
            ok("every crc checks out", archive.testzip() is None)

        print("\nthe metadata panel")
        # Queue a photo without running it: the panel is a thing you read before
        # the work, so the queue is where it has to be.
        cdp.eval("""(async function () {
          var f = await Sample.photo();
          var dt = new DataTransfer(); dt.items.add(f);
          var input = document.getElementById('files');
          input.files = dt.files;
          input.dispatchEvent(new Event('change'));
        })()""")
        ok("the photo is queued", wait_for(cdp, "document.querySelectorAll('[data-queue]').length >= 1", timeout=60))
        ok("and the queue shows what is in it",
           wait_for(cdp, "!!document.querySelector('.meta-panel summary')", timeout=10))
        ok("and it names the GPS block",
           (cdp.eval("(document.querySelector('.meta-panel') || {}).textContent || ''") or "").find("GPS") >= 0)

        print("\nauto picks the smaller format")
        cdp.eval("""(function () {
          var f = document.getElementById('format'); f.value = 'auto';
          f.dispatchEvent(new Event('change', { bubbles: true }));
          var t = document.getElementById('target'); t.value = '0';
          t.dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('run').click();
        })()""")
        ok("the auto run finishes", wait_for(cdp, "!document.getElementById('run').disabled", timeout=90))
        time.sleep(0.4)
        chosen = cdp.eval("""Array.prototype.map.call(document.querySelectorAll('[data-row] .badge'),
                               function (b) { return b.textContent; }).join('|')""")
        ok("auto chose WebP, the smaller of the two", "WEBP" in (chosen or ""), chosen or "")
        ok("and it reports a result",
           "→" in (cdp.eval("(document.querySelector('[data-row] .meta') || {}).textContent || ''") or ""))

        print("\nimages into a pdf")
        cdp.eval("window.__pdf = null; window.__origBlob2 = Export.blob;")
        cdp.eval("""Export.blob = function (name, blob) {
          if (/\.pdf$/.test(name)) {
            blob.arrayBuffer().then(function (b) {
              var d = new Uint8Array(b), s = '';
              for (var i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
              window.__pdf = btoa(s);
            });
            return;
          }
          return window.__origBlob2.apply(this, arguments);
        };""")
        cdp.eval("document.getElementById('pdfBtn').click()")
        ok("the pdf is produced", wait_for(cdp, "!!window.__pdf", timeout=30))
        raw_pdf = cdp.eval("window.__pdf")
        if raw_pdf:
            doc = base64.b64decode(raw_pdf)
            check("it is a pdf", doc[:8], b"%PDF-1.4")
            ok("it ends properly", doc.rstrip().endswith(b"%%EOF"))
            ok("it embeds the jpeg as a jpeg", b"/DCTDecode" in doc)

        print("\ntransparency survives the right formats")
        cdp.eval("document.getElementById('clear').click()")
        cdp.eval("""(async function () {
          var c = document.createElement('canvas'); c.width = 400; c.height = 300;
          var g = c.getContext('2d'); g.fillStyle = '#00a000'; g.fillRect(120, 90, 160, 120);
          var blob = await new Promise(function (r) { c.toBlob(r, 'image/png'); });
          var f = new File([blob], 'alpha.png', { type: 'image/png' });
          var dt = new DataTransfer(); dt.items.add(f);
          var i = document.getElementById('files'); i.files = dt.files;
          i.dispatchEvent(new Event('change'));
        })()""")
        time.sleep(2)

        def run_alpha(fmt):
            cdp.eval("""(function () {
              var f = document.getElementById('format'); f.value = '%s';
              f.dispatchEvent(new Event('change', { bubbles: true }));
              var t = document.getElementById('target'); t.value = '0';
              t.dispatchEvent(new Event('change', { bubbles: true }));
              document.getElementById('run').click();
            })()""" % fmt)
            wait_for(cdp, "!document.getElementById('run').disabled", timeout=90)
            time.sleep(0.4)
            return cdp.eval("""(async function () {
              var img = document.querySelector('[data-row] .after');
              var c = document.createElement('canvas');
              c.width = img.naturalWidth; c.height = img.naturalHeight;
              var g = c.getContext('2d'); g.drawImage(img, 0, 0);
              var d = g.getImageData(2, 2, 1, 1).data;
              return d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3];
            })()""")

        check("a transparent corner becomes white in a JPEG, not black", run_alpha("jpeg"), "255,255,255,255")
        ok("auto keeps the transparency instead", run_alpha("auto").endswith(",0"))

        print("\nthe profile switch follows the strip")
        check("it is disabled when everything is being removed",
              cdp.eval("""(function () {
                var s = document.getElementById('stripAll');
                s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true }));
                var off = document.getElementById('keepColour').disabled;
                s.checked = false; s.dispatchEvent(new Event('change', { bubbles: true }));
                return off && !document.getElementById('keepColour').disabled;
              })()"""), True)

        print("\n%d passed, %d failed" % (passed, failed))
        return 1 if failed else 0
    finally:
        if proc is not None:
            proc.kill()
            proc.wait()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
