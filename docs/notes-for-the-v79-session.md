# Notes from the design-review session, for the session driving v79/main

Written 28 August 2026, from `claude/farkad-mobile-design-review-odl8ue` at the
merge that stamped v83. You took the design pass in at `f645751` — this file is
the return channel. Everything below is either already ON this branch (take it
by merging the branch; main is fully contained in it) or a question that is
yours to decide.

## What this branch adds on top of your v82

One commit of substance (`c6fc85d`, "What seven adversarial reviewers found,
fixed") plus the merge. The findings that touch YOUR domains:

1. **The ledger mirror now mints deterministic entry ids** — `le_mig_<advanceId>`
   (`js/model/ledger.js`, `appendLedgerEntry` honors a caller id). Before this,
   two phones booting off the same record minted two random-id `given` entries
   for one advance, `mergeLedgerInto` kept both, and the fold's winner was
   decided by which random id sorted later. With deterministic ids the union
   collapses to one entry. There is a two-device test pinning it
   (`tests/data.test.mjs`, "two phones mirror the same advance into the same
   entry").

2. **`ledgerAgreesWithAdvances` gained the reverse pass** — a `given` entry whose
   advance was later deleted from the legacy field is now reported in a new
   `orphaned` bucket and fails `agrees`. Before, the phantom stayed green, which
   is exactly the state the check exists to catch before the gate flips: on
   flip, `currentAdvances` would resurrect every deleted advance.

3. **Open doctrine question, deliberately NOT fixed here** — an advance *edited*
   in the legacy field after the mirror has run diverges forever: the migration
   skips known advance ids, so the `given` entry keeps the old amount and parity
   shows red with no repair path. Two options, both wire-safe, both yours:
   reconcile at boot (append a `corrected` entry when legacy disagrees with the
   fold — recency then also settles finding 1's residue), or accept the red
   parity line as the signal to investigate manually before the flip. We did not
   want to widen the migration's writes without your say.

4. **Wire-side validation gap in `advanceProblems`** — it checks id/workerId/
   date/amount but not `amount` finiteness on every path, and not `note` length.
   The advance form now validates client-side (whole shekels, `isRealDate`,
   note ≤ 120), but a hostile or corrupt peer can still send `amount: Infinity`
   which stringifies to `null` on the next full-document write and quarantines
   the record at reopen. A finite-and-bounded check in `advanceProblems`, and a
   note cap, would close it at the wire. Schema is your file; we stayed out.

5. **The `method` field** — the advance form writes an optional
   `method: 'cash' | 'transfer'` extra field on `advances.<id>`. It passes the
   current validator untouched (by design) and renders through an
   own-property-guarded label map. Flagging it so a future stricter validator
   does not reject records this branch already wrote.

## Versioning

The three stamps on this branch say **v83** (your rule: bump in the same commit
as any change to a cached file; the merge changed many). `docs/releases.md` was
left alone — it records what was served, and nothing was served from here.

## What this session is doing next (to avoid collisions)

A polish/gap wave on THIS branch only: bulk-row compression on the day screen,
a collapsed one-row header for landscape, the payroll card leading with the net,
a read-only advance-history view over the fold (gate stays closed), the worker
screen's history block, a full-screen reorder mode, internal organization of
reports.js and app.css (no behavior change), and a CLAUDE.md. If you are about
to work any of those areas on main, the operator can tell either of us to yield.

Merging this branch into main takes everything above; it is a superset of
`c942723`.
