# Contract — the core repairs after review (v94)

## Goal
The three phones can record, correct and reopen in every order the site imposes on them
— offline at open, two phones on one day, a lost answer, a poisoned document — and no
recorded day is ever replaced silently, no evidence is dropped, and no phone says
"מסונכרן" while holding something the cloud does not. Fifteen findings from the
adversarial review of the v91 repair commits (features/core-repairs/findings.md), each
reproduced against `c744d49` with the project's own harness, are closed by a failing test
first and a fix second.

## Out of scope
- No UI redesign; the compact day (v93) is not touched.
- No ledger writes: `LEDGER_WRITES` stays `false`.
- No change to pricing, rates or report arithmetic.
- No new dependency, build step or module script.
- No claim of physical-device coverage.

## Data
No schema change. The outbox operation record gains nothing new on disk unless a finding's
fix needs one field (a recorded `base` that can say "no snapshot heard" as distinct from
"the server held nothing"); if added it is optional, absent on old records, and read as
the old meaning when absent. Rollback: revert the merge commit; old records are untouched.

## Permissions
Unchanged. Nothing reads or writes anything the previous build did not.

## Privacy
Unchanged.

## Success criteria
1. P1 sync.js:1402 — an edit queued before the session's first snapshot, sent after the
   phone hears another device's newer value at that path, is HELD and reported, never
   accepted over the other phone's value; both phones never both say synced. Test in
   tests/contested.test.mjs (reopen → edit → hear → flush).
2. P2 sync.js:2892 — the "someone else wrote it" gate is per path; an unrelated own write
   does not release a contested path. Test: hold marker refused, own unrelated write,
   reopen, hear, flush → held.
3. P2 sync.js:2920 — a pre-send hold reports itself: status 'contested' and the contested
   status line on an otherwise idle phone.
4. P2 sync.js:2903 — a queued day with base null is held when the server now holds another
   device's value there (came-back-later timing), not only on the in-flight timing.
5. P2 sync.js:3242 — after a replayed (receipt-answered) write, the phone re-adopts the
   latest snapshot; local equals cloud.
6. P2 state.js:827 — evidence held under `__proto__` survives reopen and an acknowledged
   commit (own-key guard).
7. P2 state.js:754 — 21 reopens of a phone that once received a poisoned snapshot still
   acknowledge and release; the quarantine copy is registered, not re-made.
8. P3 schema.js:388 — a non-date own key in `days` is quarantined and reported, not dropped.
9. P3 state.js:959 — normaliseLayer never reparents; re-arrival of the same poison is
   re-reported.
10. P3 sync.js:4881 — a held-aside count after acknowledgement does not skip archiveDaily,
    the identity repairs, or the post-snapshot flush.
11. P3 share.js:495 — a restore file carrying a poisoned map is refused at the door with its
    own sentence; the device is not put into recovery hold by a file it only tried to read.
12. P3 sync.js:3266 — a replayed send that empties the queue ends 'synced', not 'error'.
13. P3 sync.js:3560 — the update after a lost create race is rebased/held like every other
    conflict, not surfaced as 'sync error (N pending)'.
14. P3 tests/README.md, docs/releases.md — counts are commit-scoped or removed; served
    builds v80–v86 have entries; v91/v93/v94 are described where they land.
15. Every new test fails on the base and passes on its fix commit (fail-first pairs), and
    `npm run test:release` is green on the merged SHA with the counts recorded verbatim in
    features/core-repairs/handoff.md.

## Base
- Branch: `cd-work` (published as `claude/farkad-mobile-design-review-odl8ue`).
- BASE SHA: the compact-day commit this contract is committed with (see handoff).
- Files that must not be touched: `js/model/ledger.js`, `firestore.rules`, anything under
  `vendor/`, `css/app.css`, `js/ui/day.js`.
