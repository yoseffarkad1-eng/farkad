# v116 — worker controls and financial activation candidate

Yosef requested these changes on 2026-10-02. This is a local release candidate.
It has not been pushed, merged, deployed or used to modify any live schedule.
The configured GitHub connection currently reports pull=true, push=false.

## Behavior

- The ledger writer and advance carry ship enabled together, as explicitly requested.
  Existing per-record carry migration review is retained. Repayments and corrections
  append history; they do not erase the original advance.
- New-worker forms require weekly or fortnightly payment frequency. Opening the form
  clears another worker's draft and suggests the Friday of the current week. Existing
  workers retain their history; a change still adds a dated boundary.
- Reports label both homogeneous and mixed pay cycles. CSV/Excel append a payment
  frequency column without moving existing numeric columns. Weekly report buttons
  select Friday–Thursday for the current or previous week. Worker-specific account
  warnings and deduction labels now use the worker's cycle.
- Advance and repayment forms use that worker's current account dates.
- Worker rows have an accessible green/gray switch using the existing synchronized
  active field. Inactive workers remain visible in the roster for reactivation. Work,
  rates, advances and historical payroll remain intact. Reactivation still checks
  duplicate names and phone numbers. Explicit hiding from the worker form still asks
  for confirmation; the reversible row switch does not.
- “הכל חופש” records UNPAID absence on the selected date for active workers without
  a record. Confirmation names the date and unpaid meaning. Existing work, absences,
  inactive workers and closed accounts are preserved. After confirmation it rechecks
  the original crew against current data. The batch uses the durable journal.

## Tests

`tests/crew-controls.test.mjs` covers default-enabled money, repayment/correction
reopening, explicit frequency choice, resetting stale drafts, reporting, visibility
sync and history preservation, holiday races/date navigation, cancellation, closed
periods and storage failure. Real mobile interactions are in `tests/forms.browser.mjs`.
Existing tests retain explicit older-client scenarios with both financial gates off.
Export expectations were updated for the added frequency column; financial assertions
remain in place. The final release run must name its exact commit in the delivery logs.

The original October 2 backup is only read in isolated local validation. It is never
connected to a cloud, included in Git, or changed. Validation logs belong to the
handoff, not the production shell.

## Deployment hold

Enabling source flags is not a cloud rollout. Before production:

1. Obtain authorized evidence of the live Firestore rules and protocol/revision.
2. Follow the measured rules-first cutover sequence in docs/rollout-checklist.md;
   confirm all three devices run the compatible build before recording repayments.
3. Resolve any per-record migration review or queued conflicts visibly.
4. Obtain repository write access through the owner's normal GitHub connection.

No real worker's cycle has been modified. The four active workers selected by Yosef
are to start weekly on Friday 2026-10-02, first payday Thursday 2026-10-08. Archived
namesakes stay unchanged. This instruction is not an automatic name-based migration.
Vehicles and permanent deletion remain disabled.
