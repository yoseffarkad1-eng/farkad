# The suites

Seven suites, three of which need no browser at all. From a clean clone:

    npm ci
    npm test                # build + data - seconds, no browser, run before every commit
    npm run test:all        # adds smoke, print, mobile, update (Chromium via Playwright)
    npm run test:rules      # firestore.rules against the local emulator (needs Java)

Any single suite runs on its own: `npm run test:build`, `node tests/data.test.mjs`,
and so on — each file's header says exactly how to invoke it and why it exists.
Node 20 or 22 (`engines` in package.json).

Green means EVERY check passes. The runner prints `N/N checks passed` and exits
non-zero on any failure; a `SETUP FAILED` from `given()` means a precondition of the
test broke, not the app — fix the setup before reading anything into the run. At the
commit this file was added, `npm test` is 18/18 (build) and 1857/1857 (data). The
counts grow with every guarantee; the release-time numbers per build are recorded in
`docs/releases.md`. (The count in the root README predates several waves of tests and
is stale — trust a run, not a prose number.)

## What each suite proves

| suite | file | proves |
|---|---|---|
| build | `build.test.mjs` | The build agrees with itself: the three version stamps (index.html meta, `APP_VERSION`, sw cache name) are one build; every asset the page or the runtime loads is in the service-worker shell; every shell entry exists; no cache is ever opened or searched across versions; a half-fetched install throws instead of activating. Pure file reads — no browser, no server. |
| data | `data.test.mjs` | Storage, sync, and the arithmetic that turns days into money. Every "device" is a V8 context with its own localStorage running the real app files; two devices side by side are two phones, and a close-and-reopen is carrying one device's storage into a fresh context. This is where the multi-device, multi-session failures live — offline edits, snapshot adoption, the restore transaction, provenance, the ledger mirror — none of which a browser test can reach deterministically. |
| smoke | `smoke.mjs` | The app in a real Chromium: boot, every screen, the dialogs, the service worker, the things only a real DOM can betray. Serves the app itself (`serve.mjs`) because a service worker does not register over `file://`. |
| print | `print.test.mjs` | What lands on paper. Half of it opens every overlay and inspects PRINT-media boxes; the other half prints a real multi-page PDF and READS it back (`pdf.mjs`) — page by page, fill by fill — because "the modal's computed display is none" is a claim about a stylesheet, not a page. |
| mobile | `mobile.test.mjs` | The phone, measured: facts about rectangles at four widths, portrait and landscape, both color schemes, with and without a home indicator, at doubled text size. 44px targets in both dimensions, bars cleared, no sideways scroll. Headless Chromium is the right tool for layout arithmetic and it is NOT an iPhone — nothing here is coverage of a real device, and the suite's header says so. |
| update | `update.test.mjs` | The road every fix travels: a served copy of the app has its three version stamps rewritten while a browser sits on the old build — which is what a deploy is — and the suite walks the banner, the handover, the re-offer after a restart, the mid-typing wait, and the manual check. Nothing stubbed. |
| rules | `rules.test.mjs` | The real `firestore.rules` against the Firestore emulator. The web config is public by design, so these rules are the only thing between the schedule and anyone with the URL. Never touches the real project. |

`shot.mjs` is not a suite: it takes one screenshot and asserts nothing, for the
question the suites cannot answer — whether the screen is worth looking at.
`embedded.html` hosts the app in a sandboxed iframe; `serve.py` is a threaded server
whose `?slow=N` holds a response N seconds, for testing stuck-network behavior.

## The harness idiom (`harness.mjs`)

The app is classic scripts sharing one global scope, so the data suite gives it the
scope it expects instead of importing anything:

    import { makeDevice, makeCloud, settle, deferred } from './harness.mjs';

    const phone = makeDevice();                      // a fresh V8 context + localStorage
    phone.State.load();
    phone.call('assignPlace', phone.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');

    const reopened = makeDevice({ storage: phone.dump() });   // "close the app, open it again"

`dump()` is the storage a session leaves behind; handing it to a new `makeDevice` IS
the reopen — three page lifetimes and two devices become something a test can simply
say. Reach globals through `device.call(name, ...)` / `device.global(name)`: top-level
`const` in a classic script creates a binding, not a `window` property, so the sandbox
object does not carry them. (The harness's own file-list comment says it mirrors
index.html's order; it actually loads `dates.js`/`dom.js` first and `state.js` before
`sync/sync.js` — both orders satisfy the real definition-time dependencies, and the
code is the one to trust.)

The rest of the kit, each modelled on a measured failure:

- `makeCloud()` — a fake Firestore that is faithful where it hurts: `update` rejects
  `not-found`, a null written by field path is STORED, not deleted (a kinder fake once
  reported a live resurrection bug as fixed), snapshots arrive asynchronously, and
  `hold`/`reject` let a test keep a write open or refuse it.
- Fault switches on the device: `setQuota` (a full disk), `corruptOnWrite` (a disk
  that stores something else), `blockRemoval`/`throwOnRemove`, `putRaw` (stage a
  damaged record), `setToday` (pin the calendar).
- `settle()` waits out the sync debounce (tests set `FarkadSync.pushDelayMs` low);
  `deferred()` is a promise somebody else decides — how "an older write still open"
  is spelled.
- `FARKAD_SEED=42 npm run test:data` makes every random id reproducible, so a failure
  that took nine hundred writes to produce can be produced again. Without it the ids
  are genuinely random, on purpose.

## A passing test is the spec

The suites pin exact user-facing Hebrew strings (`'ברוך הבא'`, `'גרסה חדשה'`,
`'רענן עכשיו'`, dialog titles, the status line's every state), exact arithmetic, and
exact rectangles. Those strings are product decisions — argued over, not
placeholder copy — so a pinned string is a guarantee that the person on the phone
still sees the words that were decided on. When your change breaks such a check,
first ask whether you have broken the guarantee; change the pinned expectation only
when the new behavior is the point, in the same commit as the code, with the reason
in the message. A test loosened to make a run green is a guarantee deleted.

## Playwright notes

Read the header of `smoke.mjs` before fighting the browser suites. The short version:

- `playwright` is pinned to an EXACT version in package.json, not a range: the browser
  build it downloads is tied to the package version, and a range downloads a build
  other than the one on the machine — "Executable doesn't exist".
- On your own machine, `npm run browsers` (once) downloads the matching Chromium.
- On a machine that already ships a Chromium — a CI image, an agent sandbox — do NOT
  run `playwright install`; it is a large download that the environment may block or
  already have. Point the suites at what is there instead:

      CHROME_PATH=/usr/bin/chromium node tests/smoke.mjs
      PLAYWRIGHT_MODULE=/path/to/playwright node tests/smoke.mjs

- The browser suites serve the app themselves. To reuse a server you already have
  running: `SMOKE_URL=http://127.0.0.1:8802 node tests/smoke.mjs` (also honored by
  the print and mobile suites; `update.test.mjs` always serves its own deployable
  copy, because rewriting the deploy is the test).
