# v115: weekly payroll completion

Base: c08ee78c9a52a1ba1d161a14ef5ec225b23ae081 (v114). Review date: 2026-10-01.

## Changes

- Intersect a worker's calendar period with the effective history segment on both sides.
  Returning to biweekly on 2026-09-25 opens a short 09-25..10-01 period, then rejoins
  the unchanged global fortnight grid on 10-02. No prior days are included twice.
- Persist the selected history when creating a worker, including after reopening.
- Re-read form choices, current history and closed periods after each asynchronous
  confirmation. Append to the latest history. Refuse an incompatible existing boundary
  on the same Friday, preserve the form's draft and explain the refusal in Hebrew.
- Register tests/paycycle.completion.test.mjs in npm test. It covers period partitioning,
  the missing 650 NIS advance deduction, transitional closure reopening, new-worker
  persistence/storage failure, and actual two-device sync while a confirmation is open.

## Reproduced before the fix

1. weekly 09-11; biweekly 09-25: querying 09-26 returned 09-18..09-24 and the next
   period did not advance. A 3000 advance, with 650 earned on each of 09-11, 09-18 and
   09-25, opened October owing 1700 rather than 1050.
2. The new-worker form closed successfully after selecting weekly but saved no history.
3. A waiting form overwrote a received boundary with its precomputed history. Both
   phones said synced. A newly received closure was also ignored on confirmation.

## Release and activation

All four shipped gates remain closed. No real worker is changed by this code.
The owner has not selected an effective Friday. Synthetic test dates are not an
instruction to migrate the four workers. Existing archived namesakes stay untouched.

A complete release run must identify its exact commit and runtime. The v114 release
log is historical evidence only. New run results are supplied separately with the
handoff, not copied into this document as if they applied to v115.

Publishing remains separate: verify the live rules and protocol/revision, preserve
backups/pending edits, and update all three phones before opening money/vehicle gates.
The existing rules workflow does not enforce Pages deployment ordering.
