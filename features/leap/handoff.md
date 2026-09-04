# The quality leap — what was done, what it was measured on, and what it does not cover

Branch `claude/farkad-quality-leap`, tip **`013be50`** (CANDIDATE v104). Base: `main` at
v103 as served, `21c8e08`. Forty-one commits.

**Not merged, not served, on no phone.** The owner asked for the work and asked for it not
to be published. `docs/releases.md` carries the CANDIDATE entry.

## The gate, on `013be50`, this container, node v22.22.2

    npm run test:all      54 suites   6708/6708   EXIT=0   zero **FAIL** lines

Per suite, in gate order:

    isolation 18, blobs 15, build 36, poison 37, merge 28, contested 73, receipt 28,
    data 1974, recovery 81, adversarial 116, probes 35, capacity 48, concurrency 46,
    queuecost 18, exports 73, fence 35, fence-ingress 43, fence-legacy 21,
    money-history 9, money-units 21, money-cloud 17, money-display 4,
    snapshot-poison 82, samefact 37, wording 37, closure 122, closure-echo 79,
    correction 33, quarantine 82, approval 72, repayment 240, ledger-ingress 151,
    cas 88, status 37, money 40, money-ingress 206, method 51, restore 51,
    restore-ledger 24, upgrade 48, vehicles 61, xlsx 74, nonassertions 23, labels 23,
    labelcache 32                                                   (npm test = 4469)

    smoke 1141, print 78, mobile 843, update 30, forms 10, recovery-browser 25,
    handover 26, swrestart 31, swidentity 55                        (browser)

The seven suites `test:all` does not run, each measured separately on this same commit:

    sendclaim            43/43
    rules                59/59    port 8121
    rollout              17/17    port 8131
    bootstrap.rules      28/28    port 8132
    cas.emulator         24/24    port 8122
    bootstrap.emulator   23/23    port 8133
    money.concurrency    50/50    port 8134

    test:perf            48/48    (outside every gate, deliberately - tests/README.md)

Every emulator count is identical to what `tests/README.md` records for v103.

**Two things about how the emulator suites were run, because both cost a gate to learn.**
Each suite got its OWN port, never reused: an emulator does not release its port when
`firebase emulators:exec` returns, so running two suites through one config back-to-back
gives "Could not start Firestore Emulator, port taken" - which is what killed the first two
attempts. And `emulators:exec`'s exit code conflates a failing script with emulator
shutdown trouble: `rules` returned **2** on a run whose own output said 59/59 with no
failure markers. The authoritative signal is the suite's own count and its **FAIL** lines.
The exit codes above are the ones from the runs where they agreed.

## Comparison with v103's recorded gate

    v103 at 6011430     43 suites  4381/4381      59 suites  6817/6817
    v104 at 013be50     45 suites  4469/4469      54 suites  6708/6708  + 7 run separately

The node side gains two suites and 88 checks - the fail-first pins that came with the
fixes. The combined figure is LOWER because `test:all` no longer counts the six emulator
suites, which are now run one port at a time; it is not a loss of coverage, and the seven
separate counts above are the rest of it. Suite for suite: data 1949 -> 1974,
recovery 75 -> 81, capacity 44 -> 48, mobile 817 -> 843, smoke 1130 -> 1141, build 34 -> 36,
blobs 15 unchanged in count but with a whole-index section added.

## What was fixed

**The record and the money.**

- **O2** (`docs/data-safety-audit.md`, open since v100, no flag over it). A phone coming
  back online put its older copy of a man's day rate over a newer one and then sent the
  stale number to everybody else. Nothing was owed, nothing held, nothing said. Two
  carriers, both reproduced on the fake cloud before a line changed; the second was NOT the
  one a previous reviewer named, and that hypothesis was measured and reverted.
- **Five holes in iron law 10** - nothing unreadable is deleted, overwritten or treated as
  empty. Four reproduced, two of those twice. The worst destroyed the way back from a
  restore on a full phone and returned `true` saying it had not.
- **O1**: a restore removes no ledger entry on the phone doing it. The case it does not
  cover - an entry that exists only in the cloud - is reproduced, proved NOT to be a
  regression, and named in four places.

**Speed.** `placeLabelsIn` walks every day in the record and was being called per row, per
cell and per day: week grid on a season 36.1ms -> 2.5ms, day screen 12.5ms -> 1.8ms, call
counts 81 -> 1 and 27 -> 1. The outbox was decoded four times per edit: at 600 unsent
records one edit went 40.4ms -> 15.2ms, growth 8.8x -> 3.0x.

**The screen.** The bars go back to the bottom when iOS strands them. `--ink-3` lifted to a
measured 4.5:1 floor across 33 rules. The by-site day fits at twice the text. The days
drawer answers the keyboard and stops holding 26 buttons in the tab order while shut. The
keyboard comes back to the button that opened the three dialogs that focus a field.

**The tooling.** The six emulator suites read the port they are given, so they can run in
parallel. Four hygiene checks, each proved able to fail: no tracked symlink or submodule,
the vendored library byte-identical to its pinned release, no two scripts declaring the
same global, and `node_modules` ignored as a symlink.

## What this build is known NOT to cover

- **No row of `docs/iphone-acceptance.md` has been run**, and nothing here was seen on a
  phone. Chromium anchors `position: fixed` to the layout viewport; iOS anchors it to the
  visual viewport. The bars check MODELS that geometry and cannot be read as device
  coverage. The fix's assumption is named in `js/ui/bars.js` with the line to delete if it
  is ever false.
- **The journal still grows without bound while writes are refused.** The cost per edit was
  cut by about two thirds; the growth was not removed, and could not be honestly - every
  "has anything changed" signal available is tab-local, blind to an in-place rewrite, or
  best-effort. The remedy is deploying `firestore.rules`, which drains the queue and lets
  collection resume. That is the owner's action.
- **Ten error-path findings below P1** (`features/error-paths/findings.md`) and **eight
  accessibility findings below F4** (`features/accessibility/findings.md`) are recorded and
  not fixed.
- **`LEDGER_WRITES` and `carryAdvances` are both still `false`.** Neither was touched.
- The three phones' update, the rules deploy and the gate flips are the owner's and were
  not done.

## Three mistakes made in this round, kept because the shapes recur

1. A vendor check written with `check(name, true, 'SKIPPED…')` when a dependency was
   absent - a condition that is the literal `true` and cannot fail. It turned `npm test`
   red on the commit that added it and was found by another reader, not its author.
   `tests/nonassertions.test.mjs` exists for exactly that.
2. `features/restore-ledger/contract.md` claimed `tests/restore.test.mjs` R1/R2/R5 pinned
   the opposite of the rule it was specifying. They do not - those fixtures restore onto a
   device whose ledger is empty. The agent implementing it checked, said so, and wrote the
   correction into the contract rather than bending the code to fit the document.
3. An emulator runner reporting `tail`'s exit status as the suite's, then a second version
   trusting `emulators:exec`'s exit code, which conflates script failure with emulator
   shutdown. Both are the same error as (1): a signal that cannot go red.
