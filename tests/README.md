# The suites

Fifty suites, thirty-five of which need no browser at all. From a clean clone:

    npm ci
    npm test                # the DEVELOPMENT gate: node suites, no browser, run before every commit
    npm run test:all        # adds smoke, print, mobile, update, recovery-browser, handover,
                            #   swrestart, swidentity
    npm run test:release    # the RELEASE gate: test:all plus sendclaim and the emulator suites
    npm run test:emulator   # rules, the adapter's CAS, the rollout, the cutover (needs Java)

`npm test` and `npm run test:all` are DEVELOPMENT gates. Neither one is permission to
ship, and a green run of either must never be reported as a release gate.

`npm run test:release` is the release gate. It adds `test:sendclaim` and the three
emulator suites, and at the commit this line was written it is GREEN.

It was not. This paragraph used to say the gate was red on purpose: `test:sendclaim`
stood at 41 of 66, and the 25 failures were committed reproductions of the ordering
defects — a backgrounded owner losing the send claim while its request was still open,
another tab sending while the first request might still land, the cloud keeping the
value that was corrected, a whole-document restore leaving after ownership moved. They
were evidence, and the note said they would stay red until the ordering protocol that
fixes them existed.

That protocol exists — `protocol`/`revision`/`lastOpId`, immutable receipts,
conflict-carries-the-document, rebase-if-uncontested and hold-if-contested; see
`docs/sync-protocol.md`. The suite was rewritten around it rather than weakened, and
none of the reproductions was closed by softening what it asserts. It is 43 checks and
all 43 pass. `npm run test:sendclaim` still runs it directly and still exits non-zero on
any failure; nothing anywhere may catch that exit code and print success.

A green sendclaim is not the same as a green protocol. The client half is measured in
`tests/cas.test.mjs` against the harness, and a harness-only green would prove only that
the harness and the client agree with each other — so the PRODUCTION adapter is measured
against the real Firestore emulator in `tests/cas.emulator.test.mjs`, and the rollout
that has to publish it in `tests/rollout.test.mjs`. Both are in `test:release`. A manual
emulator run on the side is not the gate.

Any single suite runs on its own: `npm run test:build`, `node tests/data.test.mjs`,
and so on — each file's header says exactly how to invoke it and why it exists.
Node 20 or 22 (`engines` in package.json).

Green means EVERY check passes. The runner prints `N/N checks passed` and exits
non-zero on any failure; a `SETUP FAILED` from `given()` means a precondition of the
test broke, not the app — fix the setup before reading anything into the run.

MEASURED AT THIS COMMIT, from one clean detached worktree, and copied from no other:

    NOT YET MEASURED ON THIS COMMIT.

This branch has just taken the core candidate's repairs by merge, which brought five new
suites with it and changed several existing ones. Both of the counts that used to stand
here - this branch's 45/5512 and the core branch's 49/5516 - were measured on trees that
no longer exist, and neither describes what is in this working tree. Copying either of
them across would be exactly the fault the paragraph below warns about, so they are
gone rather than adjusted, and the numbers are re-measured at this branch's final commit.

The counts grow with every guarantee, and a count taken from a different commit is
worse than no count at all — trust a run, not a prose number. The release-time numbers
per build are recorded in `docs/releases.md`. (The count in the root README predates
several waves of tests and is stale.)

## What each suite proves

| suite | file | proves |
|---|---|---|
| build | `build.test.mjs` | The build agrees with itself: the three version stamps (index.html meta, `APP_VERSION`, sw cache name) are one build; every asset the page or the runtime loads is in the service-worker shell; every shell entry exists; no cache is ever opened or searched across versions; a half-fetched install throws instead of activating. Pure file reads — no browser, no server. |
| data | `data.test.mjs` | Storage, sync, and the arithmetic that turns days into money. Every "device" is a V8 context with its own localStorage running the real app files; two devices side by side are two phones, and a close-and-reopen is carrying one device's storage into a fresh context. This is where the multi-device, multi-session failures live — offline edits, snapshot adoption, the restore transaction, provenance, the ledger mirror — none of which a browser test can reach deterministically. |
| smoke | `smoke.mjs` | The app in a real Chromium: boot, every screen, the dialogs, the service worker, the things only a real DOM can betray. Serves the app itself (`serve.mjs`) because a service worker does not register over `file://`. |
| print | `print.test.mjs` | What lands on paper. Half of it opens every overlay and inspects PRINT-media boxes; the other half prints a real multi-page PDF and READS it back (`pdf.mjs`) — page by page, fill by fill — because "the modal's computed display is none" is a claim about a stylesheet, not a page. |
| mobile | `mobile.test.mjs` | The phone, measured: facts about rectangles at four widths, portrait and landscape, both color schemes, with and without a home indicator, at doubled text size. 44px targets in both dimensions, bars cleared, no sideways scroll. Headless Chromium is the right tool for layout arithmetic and it is NOT an iPhone — nothing here is coverage of a real device, and the suite's header says so. |
| update | `update.test.mjs` | The road every fix travels: a served copy of the app has its three version stamps rewritten while a browser sits on the old build — which is what a deploy is — and the suite walks the banner, the handover, the re-offer after a restart, the mid-typing wait, and the manual check. Nothing stubbed. |
| recovery | `recovery.test.mjs` | What the app does with a record it cannot read: quarantine, the raw snapshot, and the export that is the only thing left when a phone will not open. Nothing unreadable is deleted, overwritten, or treated as empty. |
| adversarial | `adversarial.test.mjs` | The twenty-item matrix a correctness pass was written against: a hidden loser that must never resurrect, legacy operations converging, restore fencing, the mutation fence under an export, and the vehicle feature's future contract. |
| probes | `probes.test.mjs` | Two tabs of one app on one disk, interleaved at the write. Whoever loses a race loses it durably, and neither tab ever reports work it did not do. |
| capacity | `capacity.test.mjs` | A season of days on a disk that fills up, and a restore over the queue an older build left behind. |
| concurrency | `concurrency.test.mjs` | The cross-tab hazards named C1-C5: retirement by operation and not by path, an acknowledgement one tab wrote and the other reads, the right to send against a restore, the ABA fence, and a removal the disk refused. |
| exports | `exports.test.mjs` | The three files that leave the phone, read back off the browser: the pay sheet, the invoice sheet, the detail sheet, and the message a worker himself receives. |
| fence | `fence.test.mjs` | The write counter that lets a rescue file claim its readings were one moment - what moves it, what must not, and what it costs per edit. |
| method | `method.test.mjs` | How an advance was handed over, through all four doors and the ledger mirror, the fold and the overlay. |
| money | `money.test.mjs` | The same literal shekels on the far side of four real doors: a reopen, a second phone, an export, and a restore. |
| nonassertions | `nonassertions.test.mjs` | A test that fails when a test stops testing: every assertion in `tests/` is scanned for the shapes that cannot fail, and the scanner is itself proved against written offenders and written near-misses. |
| restore | `restore.test.mjs` | A device holding only part of a restore is caught, subtree by subtree, and a frozen v71 companion is bound to the primary it belongs to. |
| upgrade | `upgrade.test.mjs` | A v86 disk opened by this build: the retired identity scheme's marks, a restore over an older queue, a v71 companion, and an undo entry that cannot speak for the questions it left. |
| vehicles | `vehicles.test.mjs` | The retired feature, from both sides: nothing writes a vehicle record while the flag is off, and with the gate open the arithmetic that was argued over is still there. |
| xlsx | `xlsx.test.mjs` | The same arithmetic proved through a real `.xlsx`, read back out of the zip. Needs the `xlsx` devDependency, pinned at the version the app loads from the CDN. |
| recovery-browser | `recovery.browser.mjs` | The rescue export driven through the real button in a real Chromium, with the actual Blob captured off `URL.createObjectURL`. |
| handover | `handover.test.mjs` | The v86 -> v87 handover between two REAL trees - a released commit and the working tree - one origin serving whichever it is pointed at. Every assertion is a SHA-256 of bytes a browser actually holds or an answer from a production function. It does not run while both trees carry the same build, and says so rather than pretending. |
| rules | `rules.test.mjs` | The real `firestore.rules` against the Firestore emulator. The web config is public by design, so these rules are the only thing between the schedule and anyone with the URL. Never touches the real project. |
| cas-emulator | `cas.emulator.test.mjs` | The PRODUCTION adapter's write path against the real emulator, not the harness: a conflict carries the authoritative document, disjoint field edits still merge, a receipt makes a retry idempotent, and the harness and the adapter refuse in the same shape. The client half alone is `cas.test.mjs`; a green harness-only run would prove only that the harness and the client agree with each other. |
| bootstrap | `bootstrap.emulator.test.mjs` | THE CUTOVER, through the production write path. The real js/sync/sync.js against the real js/sync/firebase-adapter.js against the emulator, asking what `rollout` and `cas.emulator` fall between: the live document is legacy and holds a day another phone corrected, and this phone has an older value for that same day in its outbox. Before it, the queued value won at revision 1 with nothing refused and nothing said. Five scenarios: the reproduction, the bootstrap touching five fields and no other, a disjoint edit still merging, two phones racing to exactly one revision-1 receipt, and process death mid-flight. |
| money-concurrency | `money.concurrency.test.mjs` | TWO PHONES WRITING MONEY AT ONCE, through the production write path. Two devices, each with the real js/sync/sync.js talking to the real js/sync/firebase-adapter.js against the emulator, both recording against one man's advance at the same moment. tests/concurrency.test.mjs races two tabs over one disk and tests/repayment.test.mjs merges two in-memory copies by hand; neither is two phones. Seven races - two repayments, two that over-settle, a repayment against the closure, two closures, two corrections, the migration approval against a day, and a close-and-reopen on the phone that lost - each asking the same three things: every immutable event survives, an over-settled advance is surfaced rather than clamped, and both phones end up holding the same record. It found the dropped migration approval, the sync layer's blindness to `ledger.migrations.<id>`, and the honest closure a late repayment turned into a lie. |
| status | `status.test.mjs` | What the line is ALLOWED to say. Asserts transitions rather than final states, because a claim made and withdrawn is invisible to a final-state check and that claim is the defect: it wraps setStatus and records what was asked for, what was said, and what was owed at that moment. A queue larger than one write, a restore the cloud will not take, a record Recovery could not read, and a close-and-reopen. |
| rollout | `rollout.test.mjs` | Publishing the rules, from a GENUINE legacy document — roster, days and an advance, no `protocol`, no `revision`, no receipt. The first protocol write preserves every legacy byte; a bootstrap without its receipt is refused; two phones racing produce exactly one bootstrap and the loser rebases; the exception is one write wide; an un-updated phone works before cutover and is refused after; and a missing document is a different road from a legacy one. |
| ledger-ingress | `ledger.ingress.test.mjs` | Thirteen shapes of malformed ledger data through every door — boot, load, cloud snapshot, restore, JSON import, raw recovery, migration, full replacement. Each is named by the check that catches it, held aside rather than folded, never normalised or coerced to zero; the record still opens, the bytes are kept, the person is told, writes are blocked, and the rescue export still carries the bytes. |
| repayment | `repayment.test.mjs` | The advance that outlives its fortnight: the carry, dated cash repayments, the two labels that never swap, the reversal that compensates instead of deleting, the surplus that is named rather than clamped, and the closure that is identified by the period it closes. |
| poison | `poison.test.mjs` | A ledger id that would land on a prototype — `__proto__`, `prototype`, `constructor` — through every door and every writer. The fixtures are built with `JSON.parse` so the key is a real own property and not a setter; the entry is refused before memory, disk or outbox move; a raw entry is judged before it is normalised; an entry whose `id` disagrees with its map key is not silently re-pointed; and nothing reparents the map it was aimed at. |
| merge | `merge.test.mjs` | What adopting somebody else's document takes off this one. All four append-only families survive a snapshot that has never heard of them, so do parts of the container this build does not name; existence is asked with an own-key check, so an entry legitimately named `toString` is not dropped; and one immutable id arriving with two different bodies is a disagreement a person is told about, not a winner picked at random. Driven through `Sync.receive()`, a commit and a reopen — not through the helper. |
| contested | `contested.test.mjs` | The write that lost a race, and every trigger that must not resend it: the winner's snapshot, the retry timer, `scheduleFlush()`, `flush()`, coming back online, a recreated adapter, and a close-and-reopen. The losing bytes stay durable and still owed, the cloud keeps the winner's value, the line never says synced, an unrelated edit in its own batch still leaves the phone, and the way out is a fresh explicit edit by a person. |
| receipt | `receipt.test.mjs` | A receipt names the OPERATION, not just the revision it reached. The schedule and its receipt carry the same fingerprint; an honest replay of identical bytes is still answered from the receipt; a request wearing a landed operation's name while doing something else is refused as `receipt-mismatch`, never acknowledged and never pruned; and a batch's own name changes when its value changes. |
| bootstrap-rules | `bootstrap.rules.test.mjs` | The SERVER's answer to a bootstrap that carries business data. Nineteen smuggling attempts — days, advances, ledger entries, workers, places, roster, `schemaVersion`, unknown fields, each alone and in combination — against the local emulator, plus the acceptance list of what a bootstrap may legitimately touch. Every row reports: the helper returns a verdict rather than throwing, so one refusal does not hide the eighteen behind it. |

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
