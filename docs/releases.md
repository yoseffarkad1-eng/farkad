# What has actually been served

One line per build that reached `main`, newest first. `main` is what the live site
deploys, so a build is not released until it is here — a branch full of verified work is
not a release, it is a cost.

Each entry says what changed, what was checked before it went, and anything the build is
known NOT to cover. The last of those is the point of the file: a release note that lists
only what works is a sales page.

Every count below names the commit it was measured on. A count carried over from another
commit is worse than no count at all, so a build whose run was not written down at the
time says so rather than borrowing a neighbour's.

**`main` is at v102 (`2bae97f`).** Every build at the top of this file has reached `main`;
a candidate, when there is one, sits above them headed CANDIDATE. v91, v93 and v94 below were
never served on their own: each was the base the next was repaired from, and v95 is the
first of the line to reach `main`.

---

## CANDIDATE — v103 — the app put in order, and the panel that was already right

Not served. On `claude/farkad-mobile-design-review-odl8ue`, built on v102 as served
(`2bae97f`). **No number moved** — not a shekel on a report, not a day on a record, not a
byte on the wire.

**What it gives the crew that v102 does not**

- **The week screen tells an empty app what to do.** It said only «אין עובדים להצגה»; it now
  says «אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.» An empty week is the one moment a
  person cannot tell a fresh install from a broken app, and it is a screen a phone may open
  first.

That is the whole of what a person can see. Everything else in this build is for the people
who USE the documents and read the code.

**What it gives whoever runs the phones**

- **The Arabic guide caught up** with the site-card icons, the header that compacts on
  scroll, the Saturday arrows, the print that offers a picture when nothing opens, the export
  file names and the save dialog — each with the one tap that shows it working. And a new
  section on telling whether a phone is well in two lines, with the three reasons a sync
  error gives and their three different answers.
- **`docs/iphone-acceptance.md` has thirteen new rows** for v99–v103 and an Arabic block
  saying which order to run them in. **58 rows, none of them run**, and the count is at the
  top rather than left to be counted.
- **`docs/firebase-setup.md` states the rules deploy properly**: the exact command, the order
  (rules before any phone writes the new protocol), and why — measured by
  `tests/rollout.test.mjs` against a real legacy document, not asserted.

**What it fixes in the code that nobody can see**

`.btn-primary` matched no rule in the stylesheet at all: three money-form save buttons looked
right only because the base `button` rule already paints the primary style, and the name was
a lie to the next reader. `.btn-info` was byte-for-byte `.btn-secondary`. Both fixed as
removals or renames — a button that looks different after this build would be a bug in it.

**What was checked and deliberately NOT changed**

- **The ⋯ panel's order was already right** — cloud and sync, backup, restore, update and
  version, device state, the carry migration last behind its flag. Verified, not assumed, and
  not touched.
- **The rules review found no gap.** All three claims `docs/sync-protocol.md` says the rules
  enforce have checks in `tests/rules.test.mjs`, and the protocol now names which check
  answers which claim.

**What it is known NOT to cover**

- **No phone has run any of it**, and this build is largely FOR a phone: it extends an
  acceptance list that is 58 rows long and entirely NOT RUN. Nothing since v86 has been on a
  device.
- **`firestore.rules` is still not deployed.** This build documented the deploy; it did not
  perform it and cannot.
- The two findings v100's re-audit left OPEN are still open and untouched.
- Both money gates are shut.

**Checked before it was stamped**: both gates on `6011430` from one clean detached worktree,
run separately — `npm test` 43 suites 4381/4381, `npm run test:release` 59 suites 6817/6817,
both exit 0. Exactly one check more than v102, and it is the empty-state pin. Per suite and
verbatim in `features/organization/handoff.md`.

---

## v102 — 3 September 2026 — `2bae97f` (PR #14, the tree at `1e0aeb0`)

On `main` since 3 September 2026; whether any phone has taken the update is not known from
here. Built on v101 as served (`ee50ae4`).

**This build changes nothing a person can see or use.** Not a pixel, not a shekel, not a
byte on a disk or on the wire. It is the code moved into rooms it can be found in, and the
proof that it is only that is the gate: **43 suites 4380/4380 and 59 suites 6816/6816 —
the same numbers, check for check, as v101.** A refactor that changes what the gate says is
a refactor that changed something.

**What it gives whoever works on this next**

- `js/sync/sync.js` was 6,194 lines. It is 2,523, and the rest is in five files named for
  what they own: the restore transaction, the receive path, the send path, the connection
  and status line, and a two-line bootstrap that exists to be loaded last.
- `js/ui/share.js` was 2,093 and is 290 — the WhatsApp message and the CSV, which is what
  its name always meant. The snapshots, the backup file, the four restore doors and the
  rescue file are in `js/ui/backup.js`.
- `js/model/schema.js` was 2,928 and is 2,430; the arithmetic every paid and billed number
  comes out of is in `js/model/money.js`.
- `css/app.css` has a table of contents.
- Three functions that nothing called are gone, each named with the reason.

**What it deliberately did NOT do, with the numbers**

- **`js/ui/reports.js` is not split.** It was, and it was put back: 25 places in 13 suites
  read that file off the disk by name, and three of them are meta-tests — one pins the read
  itself as a string, two iterate hard-coded file lists. A split that missed any of the
  three would leave a suite quietly covering less than it claims.
- **`css/app.css` is not reordered.** That file documents four places where cascade order
  IS the mechanism, including a print rule that had been losing to a later block for months,
  silently — and what it lost was a warning about hours somebody was not paid for.

**What it is known NOT to cover**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **No phone has run any of it.** For a behaviour-neutral build that matters less than it
  did for v101, but "behaviour-neutral" is a claim held by 59 suites, not by a person using
  the app. Every row of `docs/iphone-acceptance.md` is still NOT RUN.
- The two findings v100's re-audit left OPEN are still open and untouched.
- `firestore.rules` has changed since v86 and is still not deployed — the owner's to run;
  `docs/rollout-checklist.md` has the steps.
- Both money gates are shut and nothing in this build goes near them.

**Checked before it was stamped**: both gates on `21bd9ba` from one clean detached worktree,
run separately. Per suite and verbatim in `features/code-order/handoff.md`, which also names
the one gate that came back EXIT=2 (a race in `tests/swrestart.test.mjs`, root-caused and
fixed) and the three killed by container restarts — none of whose counts is recorded as a
result anywhere.

---

## v101 — 2 September 2026 — `ee50ae4` (PR #13, the tree at `718ee6e`)

On `main` since 2 September 2026; whether any phone has taken the update is not known from
here. Built on v100 as served
(`e4aa66b`). One screen's chrome, three changes, nothing behind either money gate and
nothing touching the record, sync or the arithmetic. Both gates stay shut.

**What it gives the crew that v100 does not have**

- **The day header shrinks to one row as soon as the list is scrolled.** The day name, its
  date and the two arrows stay — halfway down a list of names, nothing else on screen says
  what day this is, and a day recorded against the wrong date is the one input error that
  actually costs money. Undo, redo, «היום», the switcher and the progress line's words go;
  the thin progress track stays. Scrolled, the chrome above the first name goes from 157
  pixels to about 57. **No bar moves** — that decision is v99's and this build does not
  reopen it.
- **The two buttons under every site card move onto its coloured heading**, as a ＋ and a
  💬. Five sites on a screen is five rows back for the names.
- **The «לפי עובדים / לפי אתרים» switcher no longer has a row of its own.** It is on the
  header now, which means it goes away with the header once the list is moving — something
  a row below the header could never do.

**What it does NOT give them, and this is measured, not estimated**

- **Moving the switcher into the header gives back three pixels, not a row.** A 44px
  segmented pair costs a 44px line wherever it is put; moving a line from below the header
  to inside it moves the line, it does not remove it. The chrome above the first name goes
  from 157px to 154px. The room in this build comes from the scroll behaviour and from the
  site cards — not from that move. `features/day-room/handoff.md` has the table.

**What it is known NOT to cover**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **No phone has run any of it, and this is the round where that matters most.** It is a
  round about how a screen feels under a thumb, and every measurement in it is headless
  Chromium. The scroll threshold's behaviour under iOS rubber-band scrolling and momentum
  is NOT covered — Chromium emulates neither, and a bounce past the top on a real iPhone is
  the first thing to look at. Every row of `docs/iphone-acceptance.md` is still NOT RUN.
- **The header's «בטל» is a flick away while the list is scrolled.** The undo BAR still
  appears at the moment of the edit and is untouched; the header's pair is for the mistake
  noticed a name or two later, and reaching it now costs a scroll back to the top. That is
  the trade this build makes on purpose.
- The two findings v100's re-audit left OPEN are still open and untouched here.
- `firestore.rules` has changed since v86 and is still not deployed. Unchanged by this
  build, still the owner's to run; `docs/rollout-checklist.md` has the steps.
- The mobile suite is Chromium, not Safari, and its 2× text pass is not Dynamic Type.

**Checked before it was stamped**: both gates on `991ced4` from one clean detached worktree,
run separately — `npm test` 43 suites 4380/4380 exit 0, `npm run test:release` 59 suites
6816/6816 exit 0. Per suite and verbatim in `features/day-room/handoff.md`, which also
records that three earlier attempts at the release gate were killed by container restarts
and that none of their partial counts is written down anywhere.

---

## v100 — 2 September 2026 — `e4aa66b` (PR #12, the tree at `a3d784b`)

On `main` since 2 September 2026; whether any phone has taken the update is not known from
here. Built on v98 as served
(`4a4d277`) and merged with the v99 that was served from this same branch while it was
being built (`5650235`). The four items v98 left open, closed, plus the two pins and the one product
change the same list asked for — and then a re-audit of the whole data-safety path, which
found five more and closed them. It carries v99 whole - the bottom bars and the reason
line - and adds to it. Both money gates stay shut.

**What it gives the crew that v99 does not have**

- **On the phone, today:** the WhatsApp message no longer turns a line round when a
  worker or a site has a Latin name. «📍 Rothschild 12» used to paint its pin on the left
  while every other line kept it on the right, and «• Dan Levi (‎+2 ש׳)» laid its Hebrew
  out on the wrong side of the name. Every name in the message is isolated now, the way
  the worker's own statement has always isolated its heading. The words are unchanged and
  the marks are invisible.
- **On the phone, today:** the week strip shows where it is cut off. At 390 and below the
  week is wider than the screen and Thursday sits off the left edge at rest; there is now
  a fade at that edge. The 48px pitch is unchanged — the week still has to be pushed, it
  just says so. At 430, where it fits, there is no fade.
- **Behind the carry gate, so nothing a phone can reach until somebody opens it:** a
  fortnight closed after the man has already repaid no longer puts the phone into
  recovery. This one needed no race and no clock skew — a repayment on the 24th and a
  close of the 07–20 fortnight on the 26th was enough — and it is the reason this build
  exists.
- **Behind the gate:** a phone whose clock is behind another's is told it cannot close
  yet, instead of quietly moving a payment into the next fortnight.
- **Behind the gate:** two phones that each approved the same carry plan and reach a
  project with no document both end synced. One of them used to hold the other's approval
  for ever and report a conflict about money that nobody was having.
- **On the phone, today — and this is the one that was costing money:** a closed
  fortnight was being applied to any report range that merely STARTED on its opening
  Friday, whatever it ended on. In any month whose first day is an account start, the
  ordinary «החודש» preset showed ten days and 5,000 where the crew had worked twenty for
  10,000 — while the invoice in the same workbook still billed all twenty. Read as two
  ranges that do not overlap, one day was priced in both. A closure now freezes the
  fortnight it names and no other range.
- **On the phone, today:** a phone whose pending restore will not parse no longer says
  «מסונכרן». It had stopped adopting anything the other two sent, permanently, while its
  own writes still went out — so all three screens looked healthy and only one of them
  was. It says «שגיאת סנכרון» now and names the one thing that clears it.
- **On the phone, today:** an edit the app refuses comes off the screen even when nothing
  durable stands behind it — which is exactly the session that opened onto a damaged
  record, and exactly when somebody re-types the week they can see is missing. Those
  re-typed days used to reach the disk with no journal behind them and the next snapshot
  deleted them.
- **On the phone, today:** the undo stack is quarantined rather than written over when it
  will not parse. It holds up to three whole schedules; it was the one record family
  exempt from law 10, by accident. And a restore no longer reports a way back that the
  next snapshot from another phone erases.

**What it is known NOT to cover**

- **Being on `main` is not being on a phone.** No phone is known to have taken it, and no
  phone has run any of it: nothing since v86 has, and every row of
  `docs/iphone-acceptance.md` is still NOT RUN.
- The two gates are still shut, so four of the six items above cannot be reached by any
  phone in the field. `features/gate-flip/contract.md` is what opening them requires; it
  is a checklist, not a decision, and the decision is the owner's.
- `firestore.rules` has changed since v86 and is still not deployed. That is unchanged by
  this build and is still the owner's to run.
- The emulator's own 1-in-28 flake is not proven gone by a deterministic reproduction.
  What was measured here is a defect with exactly that end state — one operation held at
  `ledger.migrations.<id>`, status `contested` — reproduced every time on the fake cloud
  and closed. Whether the emulator run that failed once took this path cannot be known
  from its log; `features/false-holds/handoff.md` records how many times the storm suite
  was run against the real emulator after the fix and what each run returned.
- **The re-audit left two findings OPEN, and this build does not fix them.** A restore is
  undone on the phone that did NOT ask for it, in the ledger only, with both phones
  reporting synced; and a roster edit made before the first snapshot arrives reverts
  another phone's rate change on all three devices, silently. Both have runnable
  reproductions in `docs/data-safety-audit.md`. Neither is a regression of this build —
  they predate it — and neither was fixed here, because each needs a rule about what a
  restore and a rosterless phone may do to somebody's pay, and that is not a rule to pick
  quietly inside a round. The first is behind the money gates; the second is not.

**Checked before it was stamped**: `features/false-holds/handoff.md`, with both gates'
output verbatim on the commit they ran on.

---

## v99 — 2 September 2026 — `cab12de` (PR #10, the tree at `f809c56`)

The second round answered from the iPhone: one screenshot on v98, the bottom bars gone
and the chip red. Served from `main` since 2 September 2026; whether any phone has taken
the update is not known from here.

**What it would give the crew that v98 does not have**

- The bottom bars come back. The app took a viewport measurement alone as "a keyboard is
  up" and hid both bars under it; on the home-screen app iOS can leave the two viewports
  disagreeing with no resize event — the share sheet, the print sheet, a keyboard
  dismissed while scrolled, backgrounding, rotation — and the bars stayed gone until the
  app was killed. A keyboard needs a focused editable now: nothing focused, no keyboard,
  whatever the viewport says; re-measured on focus, blur, return to the app, and on the
  first touch while the class stands (`js/ui/bars.js`).
- The ⋯ panel says WHY the cloud refused, under the line that says it did: «הענן מסרב
  לקבל רישומים מהמכשיר הזה. אם האפליקציה עודכנה זה עתה, כללי הענן עדיין לא פורסמו.» for
  a refusal, «הענן אינו מזהה את המכשיר הזה - התחבר שוב.» for a lost sign-in, «אין כרגע
  גישה לענן - הניסיון יחזור מעצמו.» for no reach, else the error's own message, with the
  code readable left to right. A dead listener's refusal is kept until a listener
  delivers again, so the reason survives the next write.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/bars-reason/handoff.md`. No number is copied here.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- No iPhone has run it: the bars fix is measured in Chromium with a stubbed viewport; the
  share-sheet and stale-viewport paths on a real home-screen iPhone are the acceptance the
  person's phone gives.
- Everything v98 lists, unchanged; the open items are `features/next/opus-closeout.md`.

---

## v98 — 2 September 2026 — `5dd5a83` (PR #8, the tree at `7603b45`)

The storm explained and closed (`features/storm/findings.md`). v97's release note said one
emulator suite had gone red once on its commit and nobody had explained the interleaving;
this build is the explanation and the fix. Served from `main` since 2 September 2026;
whether any phone has taken the update is not known from here.

**What it would give the crew that v97 does not have**

- Nothing they can see today: both money gates are shut, and the defect lives behind the
  carry gate. The day the gates open, a phone that closes a fortnight will no longer be
  held by its own closure when its write happens to land first — `closureFacts` no longer
  mints keys holding `undefined`, an appended entry is its own JSON round-trip, and the
  two comparators compare a record as it travels and rests.
- A closed fortnight's frozen day list carries the extra hours it was priced with.
- The by-site grid's date rows read «ראשון 23/08» — the weekday and dd/mm, no year — on
  paper and in the shared picture (the phone screen shows the section as bars); the year
  stays on the period line above and in the exported sheets, where a row is read out of
  context. Asked for from the phone, with a screenshot.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/storm/handoff.md`, with the storm suite run repeatedly under load beside it.
No number is copied here.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- Two things found on the way to the cause are written down and not fixed: a closure
  judged impossible under clock skew, and a refused approval write leaving a phone
  'contested' once in twenty-eight runs. Both behind the shut gates; each its own round.
- Everything v97 lists, unchanged: no iPhone has run any of it.

---

## v97 — 2 September 2026 — `4fe7c9a` (PR #6, the tree at `1853a03`)

The first round answered from an iPhone: one phone on v96, two screenshots, four
sentences (`features/iphone/findings.md`). Served from `main` since 2 September 2026;
whether any phone has taken the update is not known from here.

**What it would give the crew that v96 does not have**

- A print button that does something on the home-screen app. `window.print()` there has
  for years either opened nothing or an empty sheet; the button now prints where the
  sheet opens and, where nothing opened within a second and a half, offers the table as a
  picture through the share sheet. Beside it, always: «🖼️ שיתוף כתמונה» — the week grid
  or the report drawn exactly as the screen shows it, right to left in every viewer the
  phone has, which no spreadsheet flag can promise (`js/ui/printout.js`; law 12).
- The arrows step over an empty Saturday and land on one with a record.
- Two taps do not zoom the page; pinch still does.
- The chip beside the app's name says «שגיאת סנכרון» when the cloud refuses the queue,
  and «השליחה תקועה» when the claim is stuck, instead of counting the queue as if it
  were on its way.
- The export dialog tells the truth: the sheet is flagged right-to-left for Excel, the
  phone's own previews may lay it out from the left, and the picture is the door that
  reads right everywhere; a backdrop tap no longer writes a second file; the files are
  named ASCII-first so an RTL list does not swap their dates.
- A date range reads from→to left to right on every surface; the worker modal opens at
  its top; a by-site print no longer begins with a blank page.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/iphone/handoff.md` beside the commit it ran on. No number is copied here.
The gate was run twice on that commit: the first run was red in one emulator suite
(the money-concurrency storm, a path no shipped phone can take with the gates shut),
the second was green, and nine isolated runs of that suite were green; the handoff
says so in full.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **One emulator suite went red once on this commit**; it exercises two phones writing
  money with the gates OPEN through the test seam. Explained and closed in v98
  (`features/storm/findings.md`): a phone held by its own closure.
- **No iPhone has run it.** The print heuristic (does Safari fire `beforeprint` or the
  print-media change when its sheet opens?), the share sheet inside the offer, and the
  touch-action rule are argued from the platform and measured in Chromium with
  `window.print()` stubbed both ways. If Safari opens the sheet and fires neither event,
  the person gets one harmless offer behind it.
- **"Reversed" was not found in Chromium on any surface**, and every surface is identical
  to v86. What was found and fixed is the export path above. If the person's reversed
  table is the .xlsx in the Files preview or Numbers, that is those viewers ignoring the
  sheet's own flag — v86 did the same — and the picture is the answer.
- The 38 queued records on the reporting phone are a rollout fact, not a code one: the
  rules deploy (`firebase deploy --only firestore:rules`) is by hand, and the chip now
  says whether the cloud is refusing.
- Everything v96 lists, unchanged: both money gates shut; the create-race hold; the
  week strip at 390 shows five days and scrolls, by design.

---

## v96 — 2 September 2026 — `366e5ad` (PR #4, the tree at `dbbaa6e`)

v95 with the advances ledger merged onto it and the week grid at its pitch. Two branches,
each reviewed before it was taken: `d11ef3c` takes the ledger branch (`v96/ledger`, the
v92 branch Opus left with the note "must not be merged yet", brought onto the repaired
send path with BOTH money gates closed again at the merge - `LEDGER_WRITES` in
`js/model/ledger.js` and `carryAdvances` in `js/model/schema.js` are `false`, and the
suites that measure the open build open it through the harness seam); `ed9bede` takes
the week grid (`v96/weekpitch`). Served from `main` since 2 September 2026; whether any
phone has taken the update is not known from here.

**What it would give the crew that v95 does not have**

- The advances ledger as code, shut: entries, the fold, the approval boundary (a
  financial migration nobody has approved on THIS record is not read the new way), the
  frozen fortnight (a closed payslip reports the wage, the counts and the days it was
  closed on, whatever the live schedule does afterwards), a repayment or a correction
  dated into a closed period moving the live debt and not the payslip, and one fact
  written by two phones at once landing once. All of it behind the two gates: this
  build's phones still read and write advances exactly as v95 does. Flipping either gate
  is a person's decision, taken only once all three phones show v95 or later.
- A fortnight closed on a phone whose gate is open is frozen on a phone whose gate is
  still shut, so the two never print different money for one payday - pinned this round,
  not changed.
- The week grid at a 48px pitch in both directions, edge to edge inside its own
  scrolling strip: a 430 phone shows the names and all seven days with nothing to push,
  and the narrower phones keep the names pinned and scroll the days under them. Before
  this the columns came out 45px at 430 because the strip sat inside the page padding,
  and the test asked for the 44px floor rather than the pitch.
- A part of the ledger container this build does not name is carried through a load
  once, by one guarded loop, instead of twice by two - the two merges had each brought
  their own copy.

**Checked before it was stamped**: the ledger merge was measured at `f0cca08` and
reviewed; the week grid at `42097f8`; the release gate on the stamped commit is in
`features/ledger/handoff.md` beside the commit it ran on. No number is copied here.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **Both money gates are shut**, so nothing above the first bullet is exercised on a
  phone: no entry is appended, no migration approved, no fortnight closed. The suites
  that prove those open the gates through the harness seam; a phone cannot.
- The create-race hold (v95, finding R1) holds the loser's contested paths but does not
  ask the same-fact rule of them, so two phones writing the identical fact into a
  project with no document yet end in a hold that a person clears, not a silent merge -
  the safe direction, and still a tap somebody has to make.
- Everything v95 lists, unchanged: no iPhone has run it; `firestore.rules` is deployed
  by hand before any phone updates.

---

## v95 — 2 September 2026 — `109502c` (PR #3, the tree at `021254f`)

v94 reviewed a second time and repaired a second time: the seven findings of
`features/core-repairs/findings-round2.md` (one P1 - the create race's loser replacing the
winner's day on a project with no document yet - four P2, two P3), each a fail-first test
followed by its fix and each verified again before merging (`27549c5` the send path,
`6303660` the poison doors, `cabcb27` the chip and this file). Served from `main` since
2 September 2026; whether any phone has taken the update is not known from here, and
the rules file this build needs (`firestore.rules`) is deployed by hand, not by the merge -
see the rollout note under v91.

**What it would give the crew that v94 does not have**

- Two phones' first-ever evening on a new project, same worker, same day: the second
  phone's half is held and said, not written over the first's.
- A phone whose cloud listener has died never says «מסונכרן» on the strength of its own
  writes; it says so, resubscribes on its own ladder, and is synced only when a listener
  delivers again.
- A poisoned map in the cloud document is one sighting, not a new one at every sibling
  edit: the phone that acknowledged it keeps adopting the crew's work on that day.
- The rescue door reads a file without holding the phone for it; the hold is raised only
  once the person has confirmed and the rescue is on the disk.
- A poisoned snapshot acknowledged mid-session is adopted then and there, not at the next
  change in the cloud.
- The chip beside the app's name says «דורש הכרעה» for a held edit and «הסנכרון מושהה»
  for a suspended sync, instead of «ממתין לשליחה» for both.

**Checked before it was stamped**: the release gate ran on this commit; the counts, per
suite and verbatim, are in `features/core-repairs/handoff.md` beside the commit they were
measured on. No number is copied here.

**What this build is NOT known to do**: everything v94 lists below, unchanged - above all,
no iPhone has run it, and being on `main` does not change that.

---

## v94 — CANDIDATE, not served — `9f11abf`

The compact day of v93 with the core repaired underneath it: two review rounds, the
first fixed, the second found. Nothing on a phone runs it.

**What it would give the crew that v93 does not have**

The fifteen findings of `features/core-repairs/findings.md`, reviewed at `c744d49` and
each fixed as a fail-first test followed by the fix (`120c8a8` the send path, `6979fcf`
the receipt path, `958a21d` the poison doors, `e25cbcb` the documentation):

- An edit queued before the session heard the cloud - a phone opened offline - is no
  longer sent over another phone's newer value with both phones saying synced. Every
  `days.`/`ledger.` operation now carries what the device had seen at that path in the
  same verified write as the operation, and the pre-send question is asked per path,
  not of the whole document's last writer. Two phones recording the same worker on the
  same day offline, the second coming back later, end in a hold, not a silent replace.
- A hold decided before the send says so: status `contested` and its line, instead of
  «מחובר. יש רישומים שעדיין נשלחים.» for ever with nothing sending.
- A retry answered from its receipt re-adopts the snapshot, so a correction made
  meanwhile by another phone is taken; a replay that empties the queue says synced
  instead of keeping the last error; the loser of a create race whose snapshot arrived
  late merges without a sync error.
- Evidence of an unreadable record is kept under its own key: `__proto__` evidence
  survives a reopen, one quarantine copy is made rather than one per open (the device
  no longer becomes unwritable after twenty opens with a false "no room"), a non-date
  key in the `days` map is held and reported instead of dropped, a poisoned layer
  arriving again is not reparented, an acknowledged record is not an error on every
  snapshot, and a restore file carrying a poisoned map is refused at the door with its
  own sentence instead of putting the DEVICE into recovery hold. The rescue door still
  opens a held phone's own file; only a replacement is refused for it.

**Checked**, at `9f11abf`, the whole release gate from the `farkad-work` worktree on
Node v22.22.2 (`.gate-release.log` in that worktree, 00:06:59-00:22:19, exit 0):

| suite | |
|---|---|
| `npm test`, the 36 node suites | 3602/3602 |
| the 8 browser suites (smoke 1041, print 65, mobile 671, update 30, recovery-browser 25, handover 26, swrestart 31, swidentity 55) | 1944/1944 |
| sendclaim | 43/43 |
| the 5 emulator suites (rules 59, cas-emulator 24, rollout 17, bootstrap 23, bootstrap-rules 28) | 151/151 |
| the whole gate, 50 suites | 5740/5740 |

This is the first time the browser and emulator halves were run on the compact day; the
v93 entry below still says its browser half is unmeasured, and that is still true of
`10a40a5` itself.

**What this build is NOT known to do**

- **It is not on `main`.** No phone has it, and none of the above is a release.
- **The second review, at `9f11abf`, found seven things**
  (`features/core-repairs/findings-round2.md`), none refuted, and they are live at that
  commit - the 5740 above were measured WITH them: the loser of a create race whose
  document already exists sends its queued patch as an ordinary update without asking
  the pre-send question of the document it just read, so the winner's day is replaced
  on every phone with both synced (P1); a phone whose snapshot listener has died says
  «מסונכרן» after its next successful send (P2); a poison sighting's identity is the
  bytes of the whole map, so every sibling edit by any phone is a new sighting and the
  phone never adopts the other phones' work on that day (P2); the rescue door holds the
  READING phone for a file it only previewed, and on cancel it stays held (P2); a
  poisoned snapshot acknowledged mid-session is not re-adopted until the cloud changes
  again (P3); the chip beside the app's name reads the queue count before the sentence,
  so a contested hold is labelled «ממתין לשליחה», never «דורש הכרעה» (P2); and this
  file had no v94 entry (P3). The round-two fixes are NOT in the count above; each
  ships as its own fail-first pair and is measured where it lands.
- Everything in the v93 and v91 entries below that the fixes above do not name still
  holds - the vehicles gate, the ledger gate, the iPhone that has never run it.

## v93 — CANDIDATE, not served — `10a40a5`

The v91 core repair with the compact day on top of it; the base v94 was repaired from.
Nothing on a phone runs it.

**What it would give the crew that v91 does not have**

- The day screen stops spending the top third of a phone on chrome. On first open, with
  the account warning showing and both bottom bars in place, seven whole names fit at
  430×932, five at 390×844, three at 320×667; before, four names were what was left of a
  30-man crew at 430px and at 320px the first name started under the dock.
- The account warning folds to one strong line; the full sentences with the dates are one
  tap down and still in the DOM. The progress count "נרשמו X מתוך Y" is itself the way to
  the next unrecorded man, so the separate המשך row is gone. The bulk fold's button sits at
  the end of the switcher row. A sync chip beside the name repeats the status line's own
  words and never composes its own.
- The mobile suite "the list starts high" holds every piece of chrome to the height it was
  given, so the count of visible names cannot drift back down a pixel at a time.

No data, sync, ledger or pricing code is touched by the compact day; everything under it
is v91's.

**Checked**, at `10a40a5`, from the `fix/docs` worktree on Node v22.22.2:

| suite | |
|---|---|
| `npm test`, the 36 node suites | 3493/3493 |
| data, at seeds 1, 42 and 2026 | 1943/1943 every time |
| sendclaim | 43/43 |

The browser suites were re-pinned by the compact-day commit itself (two smoke taps on
"המשך (N)" now tap the count; the folded bulk row is measured at 0px) and their counts at
`10a40a5` were not written down in any commit. Until they are, treat the browser half of
this build as unmeasured, not as green.

**What this build is NOT known to do**

- Everything in the v91 entry below still holds; the compact day changes none of it.
- **It has never run on an iPhone.** The seven/five/three names were counted in headless
  Chromium at those viewports.

## v91 — CANDIDATE, not served — `cf8b9e5`, core repaired through `c744d49`

The core-repair line, built on v86. Between v86 and this stamp the branch carried v87
(`aca2abe`), v88 (`1ce31d5`) and v89 (`5fd4d1e`), none of which was served either; v90 and
v92 are the ledger-enable branch's numbers, skipped here deliberately so one number never
names two trees.

**What it would give the crew that v86 does not have**

- An update no longer mixes two builds in one window. `clients.claim()` used to take every
  window of the origin and hand a page still running the old scripts the new build's
  bytes for everything it asked for next - new sync layer, old page, one session. The
  worker now knows which windows it handed a page to, serves each its own build's cache,
  and reaps the old cache only when nothing is running it (v87).
- The workbook comes off this origin. SheetJS was fetched from a CDN at export time, and
  in the van at the end of a fortnight - offline all day - the bookkeeper got three CSVs
  under different names instead of one workbook. `vendor/xlsx-0.18.5.min.js` is in the
  service-worker shell now, 860K paid once per build (v88).
- A part of the ledger container this build has never heard of is carried, not written
  over by the next ordinary save (v89). The next build adds `ledger.migrations` - a
  person's approval of a financial migration - and a v86 phone sharing the record would
  have deleted that approval on every save.
- The sync protocol: `protocol`/`revision`/`lastOpId`, immutable receipts, a conflict that
  carries the authoritative document, rebase-if-uncontested and hold-if-contested. A write
  that lost a race is held on the disk until a person decides, and no trigger resends it.
  A receipt names the operation, not just the revision it reached. The bootstrap may not
  carry business data, and `firestore.rules` now says so. See `docs/sync-protocol.md`.
- A name that would land on a prototype - `__proto__`, `constructor`, `prototype` - is not
  a legal id through any door; the whole ledger container survives a snapshot; one
  immutable id arriving with two bodies is a disagreement a person is told about.
- The twelve suites written against v86 before any fix (`a63bc48`, 51 red checks) are
  green: the restore over an older build's queue, retirement by operation across two tabs,
  statements that say how the money moved, the write counter that only moves for keys the
  rescue file carries, לתשלום reconciling with נצבר less מקדמות, the advance's method
  recorded through the mirror, a restore stamped with another schema version caught, the
  retired identity scheme's orphans, and three assertions that could not fail.
- The way out of the assign sheet stays on the screen at 200% text, and the 200% pass now
  actually doubles the text it measures.
- Four gates shut: `permanentDeletion`, `vehicles`, `carryAdvances` and `LEDGER_WRITES`
  are all false. The vehicles feature of v83 is retired behind its flag because the owner
  cancelled it: nothing is drawn, nothing is computed, nothing is written, and every stored
  vehicle byte survives every door.

**Checked**

At `cf8b9e5`, from one clean detached worktree (`2f6b6dc` is the commit that wrote it
down): `npm test` 35 suites 3429/3429; `npm run test:release` 49 suites 5516/5516, zero
skipped; `data.test.mjs` at seeds 1, 42, 2026 and 42 again, 1943/1943 every time.

At `c744d49`, from a clean detached worktree on Node v22.22.2: `npm test` 36 suites
3493/3493; `npm run test:emulator` 5 suites 151/151. The 36th suite is
`tests/snapshot.poison.test.mjs`, which arrived with the poisoned-name repair.

**What this build is NOT known to do**

- **It is not on `main`.** No phone has it, and none of the above is a release.
- **The core review at `c744d49` found fifteen things, thirteen of them in code**, and
  they are live at that commit: an edit queued before the session's first snapshot
  records `base: null`, which the pre-send hold exempts, so a stale value can be accepted
  over another phone's newer one and both phones say synced (P1); "someone else wrote it"
  is decided on the whole document's `updatedBy`, not per path; a pre-send hold sets no
  status, so the line says «יש רישומים שעדיין נשלחים» indefinitely; a replayed write
  never re-adopts the snapshot it missed; evidence held under `__proto__` is dropped at
  reopen; twenty reopens of a device holding an unreadable record exhaust the quarantine
  slots and leave it unwritable with a false "no room". They are being fixed as pairs of
  commits, fail-first then fix, on top of this stamp.
- **It has never run on an iPhone.** The handover was proved between two real trees in
  Chromium; on iOS an installed app is resumed rather than reopened, which is where the
  handover is at its most awkward.
- **The catch-up runs in the window, and the window runs the OLD build.** No v91 can make
  a v86 page reload itself. A v86 window stays a coherent v86 session for the whole of
  its life and crosses on its next open; `tests/handover.test.mjs` says so instead of
  pretending.
- **The vendored SheetJS 0.18.5 carries CVE-2023-30533 in its parsing path.** The app
  never parses a workbook - `book_new`, `aoa_to_sheet`, `book_append_sheet`, `write` and
  nothing else - so the path is unreachable from anything a person can do here; it is
  written down so whoever raises the version knows which half the tests cover.
- **The device still fills up**, and CSV still cannot carry a direction.

---

## v86 — 28 August 2026 — `880d7bb`

One commit on `main`, on top of v85. The last build served.

**What the crew gets that v85 did not have**

- **A client's report leaves the crew out of it.** Both reports live in the document at
  once and the one not being looked at carried `.report-offscreen`, which was hidden under
  `@media screen` ONLY. So selecting a client's report and pressing print produced a
  two-page PDF: the client's page, and behind it the entire payroll - every name, every
  daily rate, the gross, the advances and the net - in a file that goes to the client.
  Measured, not reasoned about: a PDF built through the app's own route came back carrying
  both names and the daily rate 777. The rule is unconditional now, and the print block
  restates it by name.
- The privacy test that existed to catch exactly this had searched only the pages already
  classified as invoice pages, and the leaked page was a payroll page. The new one reads
  every page of the document and fails on a worker's name, the payroll's title, a daily
  rate, an advance, the totals wording, or the detail dialog that was open when print was
  pressed - in both directions.

**Checked before it went**, at `880d7bb`: build 18/18, data 1883/1883, smoke 1021/1021,
mobile 389/389, print 63/63, update 25/25. Putting the screen-only rule back turns five of
the print checks red.

**What this build is NOT known to do**

- **Firestore rules were not re-run for v80 through v86.** `firestore.rules` is byte-for-byte
  what v79 shipped with, and the 34/34 at `94d5a84` is the last run written down for a
  served build.
- **It has never run on an iPhone**, though one iPhone has been at it: the reorder scroll
  in v81 was found on a real phone, and every fix since was measured in Chromium.
- **What twelve suites written against it found**, at `a63bc48` on the repair branch,
  51 red checks before any fix: a restore leaves an older build's legacy item in the slot
  record; a restore goes out while another tab holds the right to send; statements and
  exports do not say how the money moved; a day at a site the roster has lost is not
  billed; the write counter moves for keys the recovery file does not carry, so a second
  tab makes every snapshot read unstable; the לתשלום column does not reconcile with נצבר
  less מקדמות, and a sub-shekel advance breaks the row it is on; the ledger mirror does not
  record how an advance was handed over; a restore stamped with another schema version is
  not caught; a v71 companion outlives its replacement; and renaming, archiving or marking
  a vehicle as stayed-in is not inert while the feature is off.
- **An update mixes two builds in one window.** Found at `aca2abe`: after the handover a
  window still executing the old scripts is served the new build's bytes for everything it
  asks for next. It has been so for every build in this file; the first fix is v87, not
  served.
- **The export needs a signal.** SheetJS is fetched from cdnjs at export time; offline,
  the bookkeeper gets three CSVs instead of one workbook. The first fix is v88, not served.
- **A part of the ledger container this build does not name is dropped on save**
  (`5fd4d1e`). Nothing writes such a part yet, so nothing has been lost yet.
- **Vehicles are live and their default moves money.** An evening with nothing said about
  vehicles means they all went out, so a silent Tuesday adds three hundred shekels to an
  owner's pay by itself. The owner has since cancelled the feature; the retirement is on
  the branch, not here.
- **The device still fills up**, and CSV still cannot carry a direction.

## v85 — 28 August 2026 — `03bf814`

Thirty-one commits from the design pass's third wave, merged onto `main`. Four conflicts,
none a disagreement: three were the build markers and the fourth was the data suite where
each side had appended its own block, needing the first block's closing brace written back.

**What the crew gets that v84 did not have**

- The site report answers the screen's question in bars, and paper keeps the grid.
- The v80 record - היסטוריה מלאה - is readable, and can be closed by hand.
- The worker's own screen says what the record holds against his name; an archived row says
  what he left with and one tap puts him back; the phone field says who already has that
  number while it is typed; the detail modal shows WHICH dates the count is made of; the pay
  card leads with נותר לתשלום on a phone.
- Reorder mode has a screen of its own, and an Escape that answered the question does not
  re-ask it.
- `docs/architecture.md` and `tests/README.md` arrive: the deeper walk, and what each suite
  proves.

**Checked before it went**, at `03bf814`: build 18/18, data 1883/1883, mobile 389/389,
smoke 1021/1021, print 54/54, update 25/25.

**What this build is NOT known to do**

- **Printing a client's report prints the payroll behind it.** Found and measured at
  `880d7bb`, the next build: the client's PDF carries every worker's name and rate on page
  two. This is true of v80 through v85.
- Everything listed under v86, apart from the print leak, which v86 fixes.

## v84 — 28 August 2026 — `9ef68fd`

One commit on `main`.

**What the crew gets that v83 did not have**

- The seder goes to the man driving to one site, not to everybody. The message went out as
  the whole evening - five sites, everybody - to a man who can act on one gate; sending him
  all of them is how somebody reads the wrong line and turns up at the wrong place. Each
  site card carries its own send button once there is somebody to name. Who is away is left
  out of a one-site message: an absence is a fact about the crew, not about a gate.
- The site the message is about is remembered while the dialog is open, so changing the
  wording cannot quietly widen a one-site message back out to five.

**Checked before it went**, at `9ef68fd`: build 18/18, data 1878/1878, smoke 969/969,
mobile 358/358, print 54/54, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v83 — 28 August 2026 — `7bf6860`

One commit on `main`.

**What the crew gets that v82 did not have**

- The crew's vehicles, and what they are owed for. A vehicle earns a flat three hundred for
  a day it went out, paid to whoever OWNS it, whether or not he was on a site himself. An
  ordinary evening writes nothing: the default is that they all went out, and only the
  exception is stored. The rate lives in a short history on the vehicle, each entry what it
  was worth from that date onward, so a raise does not repay last month, and a vehicle added
  today does not earn for months already closed.
- A day nobody worked is not a day five vehicles earned; the count follows real work.
- A man who worked nowhere but whose vehicle went out now has a row on the pay sheet.

**Checked before it went**, at `7bf6860`: build 18/18, data 1878/1878, smoke 963/963,
mobile 358/358, print 54/54, update 25/25. Firestore needed nothing: the rules ask `hasAll`,
not `hasOnly`, so the new field travels as it is - and they were not re-run.

**What this build is NOT known to do**

- **The silent default moves money.** The three-hundred-a-day default is the reason the
  feature was later retired rather than left running: a day nobody said anything about is a
  day somebody was paid. Known from the retirement on the branch, not at release.
- Everything listed under v85 and v86.

## v82 — 28 August 2026 — `c942723`

Three commits from the design pass, merged onto `main`. One conflict, not a disagreement.

**What the crew gets that v81 did not have**

- The week cell says its day once instead of twice.
- The ask dialog is held to the same 44px target floor as the rest.
- The day screen's header is one box rather than three stacked ones.

**Checked before it went**, at `c942723`: build 18/18, data 1852/1852, mobile 358/358,
print 54/54, smoke 948/948, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v81 — 28 August 2026 — `3560444`

One commit on `main`, from the first report off a real phone.

**What the crew gets that v80 did not have**

- A finger can scroll the list it is looking at. Reorder mode could not be scrolled past
  the fifth man of twenty-one on an iPhone: `touch-action: none` was on the whole row, and
  in this mode the rows ARE the screen. The handle carries the rule, the row never needed
  it. Invisible to every assertion in the repository and to a mouse, which is why it took a
  phone to find; there is now a check at every width that no row blocks panning, that the
  handle still does, and that the last man and the save button can be reached.

**Checked before it went**, at `3560444`: mobile 356/356, smoke 947/947, print 54/54,
build 18/18, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v80 — 28 August 2026 — `f645751`

Eleven commits from `claude/farkad-mobile-design-review-odl8ue` merged onto `main`, on top
of the ledger groundwork (`ee3e9ed`) and the adversarial round (`c6fc85d`). Three conflicts,
one of them a real disagreement: the design pass set the bottom bar's labels to 11px, under
the 12px floor that had gone in the day before. The bolder weight is kept; the size is not,
and the assertion that holds it is in the mobile suite at every width.

**What the crew gets that v79 did not have**

- **The advances ledger, read-only.** An advance used to be a record that every change
  MUTATED: corrected from 500 to 300 on the 12th, nothing anywhere said 500 was ever written
  down, or by whom, or when. Now there are entries - given, corrected, cancelled - never
  rewritten and never removed, and what the screens read is a fold over them. This build
  ships the READER and the MIGRATION and writes nothing new: `LEDGER_WRITES` is false
  because a v79 phone has never heard of an entry, and a v80 phone that stopped writing the
  old field would record money the other two cannot see. The boot mirrors every existing
  advance into the ledger once, with a deterministic id, and leaves `schedule.advances`
  byte-identical. Settings answers whether the ledger agrees with the field it was built
  from, in three registers: agreement, merely behind, genuine disagreement.
- The advance form validates to the wire's own standard. `Infinity` and a typed
  `2026-13-45` used to pass commit and quarantine the entire record on the next launch;
  amounts are whole shekels with Arabic-Indic digits normalised, and the date is clamped to
  the account containing TODAY - the viewed-range clamp filed live cash into a fortnight
  printed weeks ago.
- The copy-undo was dead code - the snapshot ran after the mutation - and now works.
- The totals stop asserting what they do not know: no equation over unpriced overtime, the
  money cell answers from the days' own stamps.
- The client's file carries the client's numbers and the pay sheet shows its working;
  הגדרות וכלים grows into six rooms; every state banner tells the truth in its own colour;
  one solid dock; a displaced ask dialog resolves as a dismissal instead of hanging its
  caller; the WhatsApp button is no longer the thing a quarantined phone had disabled.

**Checked before it went**, at `f645751`: build 18/18, data 1852/1852, mobile 350/350,
print 54/54, smoke 947/947, update 25/25.

**What this build is NOT known to do**

- **The ledger has been proved against no real data.** Whether the fold agrees with the
  old field on a live record after a few weeks is the question the parity line exists to
  answer, and it had not been asked when this went out.
- **Reorder mode cannot be scrolled past the fifth man** on a real iPhone. Found the same
  day; fixed in v81.
- Everything listed under v85 and v86.

---


## v79 — 28 August 2026 — `94d5a84`

Sixteen commits, fast-forwarded from `claude/farkad-mobile-workers-v79`, so what is on
`main` is exactly the tree that was verified. The previous build on `main` was v78
(`1dec586`).

**What the crew gets that v78 did not have**

- The phone screen rebuilt around the hand holding it: the day's work reachable with a
  thumb, 44px targets, the home indicator cleared, the sticky headers dropped on a short
  landscape screen where they used to cover the last man in the list.
- Printing that prints the report and nothing else. An open dialog used to print over the
  pay sheet and produce grey pages; now every overlay, bar and dock is excluded by
  default, without the person having to close anything first.
- A worker's history is proved before he can be deleted, and his lifecycle is safe across
  two phones editing at once.
- Nothing off this origin sits between a person and their own data: the export library is
  fetched after the app is running, never before it draws.
- The device says it is filling up while there is still room to act, instead of at the
  moment a tap is refused.
- The bookkeeper's file: a name opening with `=` or `-` is a name and not a formula, and
  the workbook opens right to left the way it reads.
- Zoom, which the app used to refuse, is the reader's to use.

**Checked before it went**, from a clean clone at `94d5a84` on Node v22.22.2:

| suite | |
|---|---|
| build | 18/18 |
| data | 1794/1794, and the same at seeds 1, 42, 2026 and 42 again |
| print / PDF | 54/54 |
| mobile layouts | 278/278 |
| smoke | 902/902, twice |
| update path | 25/25 |
| Firestore rules | 34/34, against a local emulator |

`git diff --check` clean, all 40 tracked JS/MJS files syntax-checked.

**What this build is NOT known to do**

- **It has never run on an iPhone.** Every layout, print and update assertion was measured
  in headless Chromium. That is the right tool for layout arithmetic and it is not a
  phone: an installed app on iOS is resumed rather than reopened, and the update handover
  is at its most awkward exactly there.
- **The update banner was proved against a real deploy, in Chromium.** If a phone sits on
  v78 without offering the banner, Settings has a manual check that asks the server
  directly.
- **The device still fills up.** It now warns first - at about two years of records for a
  crew of thirty - but the ceiling itself is not gone.
- **CSV cannot carry a direction.** The xlsx export opens right to left; the CSV fallback,
  used when the export library cannot be reached, is at the mercy of whatever opens it.
