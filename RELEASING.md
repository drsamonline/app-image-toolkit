# Releasing

Six steps, each one a command. The version is typed once, in `VERSION`.

```bash
# 1. the proof, and the count that goes in the changelog
node test-node.js

# 2. the version everywhere it is written (version.js, and the worker's cache name)
python3 scripts/version.py

# 3. the icons, from the one master
python3 scripts/icons.py

# 4. the badges — the test count and the dependency count are computed, not typed
python3 scripts/badges.py

# 5. the screenshots, of pages that have settled
python3 scripts/shot.py "play/index.html?sample=1" docs/assets/app-desktop.png --serve docs --width 1280 --full \
  --wait "document.querySelector('#results').innerText.indexOf('→')>=0"
python3 scripts/shot.py "index.html" docs/assets/landing-desktop.png --serve docs --width 1280 --full \
  --wait "document.getElementById('stage').classList.contains('live')" --settle 2.5 \
  --js "document.querySelector('header.bar').style.position='static'"

# 6. the one file, then the push that does the rest
python3 scripts/bundle.py
git add -A && git commit -m "release: v$(cat VERSION)"
git push origin main
```

The push is the release. `Build + deploy` builds the portable EXE, the APK and
the Linux binary from that commit, publishes them to the rolling `app-latest`
release, deploys `docs/` to Pages and re-shoots `docs/shot.png` from the live
demo — so the release, the demo and the screenshot can never disagree. There is
no separate tagging step and no hand-made release; the rolling release is the
estate's convention and the pipeline keeps it honest.

Then, in order:

- Wait for **Build + deploy** to go green and open the live `/play/` **on a
  phone**, not just on the desktop. The footer prints the version: if it does not
  say the new one, the service worker is the reason, and the cache name is the
  fix.
- Check the `app-latest` release carries the three binaries from that commit.
- Check the badges against the repo: the test count must be the number the suite
  printed, and `deps` must still read `0 runtime`.

## What must never happen

- A version bumped in one place and not the others — `node test-node.js` fails if
  `VERSION`, `version.js` and the cache name disagree.
- A badge typed by hand.
- A screenshot taken before the page has settled: it shows "Working…".
- A cache name left unchanged on a release. This one has already bitten.
