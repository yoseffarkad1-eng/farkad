# v117 — separate advances and selected workers

Requested by Yosef on 2026-10-02 after installing v116:

- Advances have their own `מקדמות` tab. A worker's page shows the current recorded
  balance, money given, cash returned and confirmed wage deductions. Open advances
  come first; settled items and full immutable history remain available below.
- Payroll settlement asks how much to deduct, including zero. The preview is separate
  from confirmation: no ledger event is written by typing, printing or exporting.
  Confirmation freezes the selected deduction and pay, and leaves the remainder owed.
- Payroll reports accept a subset of workers without changing roster visibility.
  The filtered screen drives payroll and detail exports. A subset export does not
  attach the unfiltered client invoice. Empty selection means no workers.

Existing records and historical calculations are not migrated or rewritten. An
unclosed report still provides the existing provisional calculation until a manual
amount is previewed or the account is confirmed. The screen identifies this explicitly.
Preview choices and worker selections are session-local; confirmed accounts synchronize.

Manual amounts use existing `closed`/`deducted` ledger kinds and existing journal-first
atomic writes. A new period artifact carries its total `balanceAfter`, including
advances untouched by a partial deduction. Readers that predate v117 do not display
that total correctly for every partial account: update both active phones before use.
No new Firebase rules or live-data operation is part of this release.

Browser verification exposed an existing readiness bug: when the first financial
action changes an initially empty migration comparison, a later render can fall back
to legacy calculations. The UI now commits the original zero-row readiness decision
atomically with that action. An actual unresolved migration still blocks the action;
the approval is not inferred from ledger contents. A failed durable write rolls both
records back.

Targeted verification includes partial/zero/full deductions, reopening, remaining
balance on the next period, another device receiving the chosen amount, failed local
writes, report/export filtering, real repayment and correction clicks, and 320–430 px
layouts. Complete release results are recorded on the exact tested commit in the PR.
