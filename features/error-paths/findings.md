# Error paths and failure handling — an audit, and five holes in law 10

Read at `b36f6c8`. The line numbers below are that commit's; `js/state.js`, `js/store.js`,
`js/recovery.js` and `js/ui/backup.js` — where every finding lives — are untouched by the
commits after it, so they still hold at the branch tip. The audit began at `2509cbf` and
was re-run against `b36f6c8` after five commits landed under it, including the split of
`js/ui/reports.js` into three; no line number was carried across.

**No gate was run for this document.** Nothing here reports a suite count. What is marked
PROVED was produced by throwaway Node scripts against `tests/harness.mjs`; each
reproduction is inlined so it can be re-run. What is marked SUSPECTED was read out of the
code and says so.

**E1 and E2 were re-run independently by the integrator before this file was committed**,
from scratch, and both reproduce exactly. Their output is recorded under each finding.

The question asked of every path: **when this fails, does the person find out, and is the
record still true?**

## The findings, ranked by whether a record can end up quietly wrong

| # | sev | where | what happens | proved? |
|---|---|---|---|---|
| E1 | P1 | `js/ui/backup.js:324` | The damaged undo stack — up to three whole schedules — is overwritten by the write four lines after the quarantine that failed to copy it. Law 10. | PROVED ×2 |
| E2 | P1 | `js/state.js:1156`, `:1185` | An unreadable `scheduleData:migrationIssues` is read as "there were no questions" — silently — and the next `writeIssues` puts an empty list over it. Law 10. | PROVED ×2 |
| E3 | P2 | `js/ui/backup.js:47` ← `js/store.js:580` | The reclaim ladder deletes restore points oldest-first without ever reading one, so an unreadable restore point is deleted rather than quarantined. Law 10. | PROVED |
| E4 | P2 | `js/ui/backup.js:54` at `js/app.js:295` | On a boot that quarantined the v2 record, today's restore point is written from a v1 migration the app deliberately refused to save, and the oldest good restore point is evicted — while the dialog on screen tells the person to check the restore points. | PROVED |
| E5 | P3 | `js/state.js:111` | A v1 record that will not parse is `console.error` + `emptySchedule()`: no quarantine copy, no `:damaged` key, no write block. The v2 path two branches up does all three. | PROVED (the asymmetry); mitigated |
| E6 | P3 | `js/app.js:54` | The one `.catch(() => {})` on a user tap. The only place that can swallow a real programming error out of an `onclick`. | **PROVED in Chromium; FIXED** |
| E7 | P3 | `js/ui/roster.js:241` | `closeReorder()` leaves `reorderDragging`, its 16ms autoscroll interval and three document pointer listeners standing — and the autoscroll's direction is captured in the interval's closure, so a drag that crosses the panel scrolls the wrong way. | **PROVED in Chromium; FIXED** |
| E8 | P4 | `js/ui/backup.js:356`, `:401` | `readUndoStack()` answers `[]` for a stack it cannot parse, and `dropUndoState` then reports `gone: true` about an entry it could not see. | PROVED by reading; no record moves |
| E9 | P4 | `js/app.js:325` + `:345` | A damaged boot that also migrates raises «הנתונים הועברו לגרסה החדשה» over a migration `js/state.js:122` deliberately did not write down — then displaces it in the same tick, and the displaced dialog OPENS the migration questions over the damage notice. | **PROVED in Chromium; FIXED** |
| E10 | P4 | `js/state.js:404` | `refuseEdit()` ignores `rollback()`'s verdict, so on the one path where the rollback fails the dialog still says «השינוי בוטל כדי שלא ייראה כאילו נרשם». | SUSPECTED, likely unreachable |

## E1 — the damaged undo stack is overwritten by the recovery meant to save it

**Where.** `js/ui/backup.js:296-324`, in `pushUndoState`.

**The sequence.** A restore is asked for. `pushUndoState` reads `scheduleData:undoStack`, the
JSON will not parse, and the catch at `:301` does the right thing: it hands the raw bytes to
`Recovery.damaged` (`:313-316`), which calls `quarantineRecord` (`js/recovery.js:567`). On a
device with no room the copy is refused — `quarantineRecord` returns `null`, the problem is
filed with `mustHold: true`, and `Recovery.blocked()` is true from that instant. Execution
then falls out of the catch to `:324`:

    const stacked = Store.setVerified(UNDO_STACK_KEY, JSON.stringify(stack.slice(0, UNDO_KEEP)));

There is no `farkadWritesBlocked()` check on this path, and the replacement is roughly a third
the size of what it replaces — one whole schedule against up to three — so a disk that had no
room for the copy can still have room for the write. The original is gone.

**What the person sees.** The recovery banner, correctly, saying the bytes could not be copied
and the device is held. It is describing bytes that no longer exist. And `pushUndoState`
returns **true**, so the caller believes there is a confirmed way back and the restore
proceeds. That second half makes this a law 3 problem as well as a law 10 one: it is a claim
that a way back exists, made at the moment it was destroyed.

**Could a record end up wrong.** Not the schedule — but the up-to-three whole schedules that
were the way back are on no device afterwards, which is the exact loss law 10 exists for and
the exact loss the comment at `:302-307` says was fixed. That fix put a copy first; it did not
cover the case where the copy fails, which `js/recovery.js:1-8` names as the likely one: "on
the device where this is most likely to happen - a full one - the copy had failed too".

**Already pinned?** No. `tests/data.test.mjs:10141` («an undo stack that will not parse is held,
not written over») covers the case where the copy SUCCEEDS. `tests/quarantine.test.mjs:331` has
the four-way copy-failure matrix but runs it on the ledger, not on this record.

**Reproduction** (the harness quota is by SIZE and names no key):

    const phone = makeDevice();
    phone.State.load();
    phone.putRaw('scheduleData:undoStack',
        '[{"at":"2026-07-01T00:00:00.000Z","schedule":"{\\"marker\\":\\"JULY-WAY-BACK\\"' + 'x'.repeat(900));
    phone.setQuota((key, value) => String(value).length > 500);   // room for a small write only
    phone.call('pushUndoState', phone.State.schedule);

Measured twice, by the auditor and again independently by the integrator:

    pushUndoState returned            : true
    the damaged bytes survive anywhere: false
    Recovery problems                 : [{"key":"scheduleData:undoStack","copy":null,"mustHold":true}]
    writes blocked                    : true

`copy: null` and `writes blocked: true` are the device saying it could not save the bytes and
has stopped writing. The write went out anyway, four lines later.

**Shape of a fix.** `pushUndoState` returns false and writes nothing when the quarantine did not
land — the caller already has `noWayBackNotice()` for a device with nowhere to put a way back
(`js/ui/backup.js:346-348`), which is exactly what this device is. A pin beside
`tests/data.test.mjs:10141` with the copy refused.

## E2 — the migration's unanswered questions are read as "there were none"

**Where.** `js/state.js:1151-1158` (`parseIssuesRecord`), reached from `readIssues` (`:1172`)
at every load.

    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return { issues: [], bound: true, found: false };
    }

No console line, no `Recovery.damaged`, no `:damaged` copy, no hold. The record is then
overwritable by `writeIssues` (`js/state.js:1185-1190`), reached from a local restore
(`js/ui/backup.js:1794`) and from an import (`js/ui/backup.js:1704`).

**Why this record matters.** `js/recovery.js:211-220` says it in its own words: the migration
decisions are "a question about somebody's day that is still waiting for a person", they are
"not derivable from the schedule beside them", and "a rescue file that dropped them would hand
over a schedule and quietly lose the part nobody had answered yet." The key is in
`FARKAD_RECORD_KEYS` (`js/recovery.js:473`) and in `FARKAD_SNAPSHOT_KEYS` (`:535`) — the app
treats these bytes as bytes that matter. The rescue file carries them, but only while they
still exist.

**What the person sees.** Nothing at all. The migration screen shows no open questions and
`js/ui/migration.js:38` renders the "nothing left to decide" state. The `:damaged` sweep in
`Recovery.rawRecords` finds no copy, because none was made.

**Already pinned?** No suite stages a damaged `scheduleData:migrationIssues`.

**Reproduction:**

    const phone = makeDevice(); phone.State.load();
    phone.putRaw('scheduleData:migrationIssues',
        '{"issues":[{"kind":"unknown-place","value":"MARCH-CELL-NOBODY-ANSWERED"');
    const reopened = makeDevice({ storage: phone.dump() });
    reopened.State.load();
    reopened.call('writeIssues', []);

Measured twice, by the auditor and again independently by the integrator:

    issues in memory after the reopen : []
    Recovery problems                 : []
    writes blocked                    : false
    the record after writeIssues([])  : {"issues":[],"forSchedule":""}
    the March cell survives anywhere  : false

**Shape of a fix.** `parseIssuesRecord` reports through `Recovery.damaged` the way `loadRecord`
does at `js/state.js:93` — bytes copied, original kept, person told. It need not hold the
device: these are questions, not the record. But it must not be silent and it must not be
written over.

## E3 — the reclaim ladder deletes a restore point it never read

**Where.** `Store.reclaim = dropOldestSnapshot` (`js/ui/backup.js:47-52`), called from the
ladder in `js/store.js:580`. It lists snapshot keys by prefix and removes the oldest. It never
reads one.

`js/recovery.js:590-593` states the justification: "the reclaim ladder inside Store is allowed
to throw away restore points to make some — a restore point is a copy of a state that parsed,
and this is a state that did not." **That premise is the defect**: a restore point is written
with `{ optional: true }` (`js/ui/backup.js:66`) onto a disk this app never otherwise trusts,
and `tests/data.test.mjs:10096` already assumes one can be truncated. The read path leaves such
a snapshot alone. The ladder does not.

**What the person sees.** If the ladder eventually pays for the write: nothing. If it does not:
`Store.full = true` and the top banner «אין מקום פנוי במכשיר והשינוי האחרון לא נשמר…»
(`js/sync/status.js:400-405`). So the end of the ladder IS reported — but nothing says restore
points were spent, let alone an unreadable one.

**Reproduction:**

    phone.putRaw('scheduleData:snap:2026-08-01',
        '{"schemaVersion":2,"workers":[{"id":"w_01","name":"AUGUST-ONLY-COPY"');   // truncated
    phone.putRaw('scheduleData:snap:2026-08-02', '{"schemaVersion":2,"workers":[]}');
    phone.setQuota((key, value) => String(value).length > 20 && key === 'scheduleData:v2');
    phone.Store.set('scheduleData:v2', '{"a":' + '1'.repeat(60) + '}');

    the write landed                                  : false
    the unreadable oldest restore point is still there: false
    remaining snapshots                               : []
    the bytes survive anywhere                        : false

**Shape of a fix.** `dropOldestSnapshot` skips a snapshot that does not parse — or quarantines
it before removing it. A pin beside `tests/capacity.test.mjs:263`.

## E4 — the boot that says "check your restore points" writes a false one and deletes the oldest

**Where.** `takeDailySnapshot` (`js/ui/backup.js:54-69`), called at `js/app.js:295`,
immediately after `State.load()` and before the first `render()`.

**The sequence.** The v2 record will not parse. `loadRecord` quarantines it
(`js/state.js:93`), sets `damaged = true`, falls through to the v1 record, migrates it into
memory, and deliberately does **not** save it — `js/state.js:120-122`: "Shown, so the week is
on screen and can be read - but not written down. Saving it would put pre-migration data over
the newest record there is." Right.

Then `js/app.js:295` runs `takeDailySnapshot()`, which has no `farkadWritesBlocked()` check
and photographs `State.schedule` — the very state that was deliberately not written down —
under today's date, and then evicts everything past the third.

Two lines later the person is told: «לא הצלחנו לקרוא את הרישום האחרון… בדוק את הימים האחרונים
מול נקודות השחזור לפני שממשיכים לרשום.» They are sent to the restore points. One is now
labelled today and holds pre-migration data; the furthest-back one was deleted by the boot
that gave the instruction.

**Could a record end up wrong.** Yes, by the person's own hand: restoring "today" puts the
v1-era state over the device, and nothing on that row says it is not a photograph of the record.

**Reproduction** (three good restore points, a truncated v2, a v1 record beneath it):

    load result        : {"migrated":true,"issues":[],"damaged":true}
    restore points now : ['…snap:2026-08-31', '…snap:2026-09-01', '…snap:2026-09-03']
       …snap:2026-09-03 -> the PRE-MIGRATION v1 data      <- written on a held boot
    blocked            : true
    problems           : ['scheduleData:v2']

`…snap:2026-08-30` is gone.

**Already pinned?** No. Seven call sites of `takeDailySnapshot` in `tests/`, none on a boot
where `result.damaged` is true.

**Shape of a fix.** `takeDailySnapshot` returns early when `farkadWritesBlocked()` — the same
guard `State.save` (`js/state.js:240`) and `State.persist` (`:467`) already carry. One line.

## E5 — an unreadable v1 record is treated as empty, but is not quarantined and does not hold

**Where.** `js/state.js:108-115`. The v2 catch two branches up (`js/state.js:77-96`) copies the
bytes through `Recovery.damaged`, keeps the original and blocks writing. This one does none of
the three.

**What saves it.** The person IS told (`js/app.js:352-357`), and nothing in the app ever writes
`scheduleData` — one read, the rescue-file sweep, two allowlist entries. So the bytes survive
on the disk and leave in the rescue file.

**What is still wrong.** No `:damaged` copy exists, so the sweep that carries "EVERY quarantine
copy on the device" has nothing to carry for this record; and writes are not blocked, so an
evening can be recorded on top with the app never mentioning it again after that one boot
dialog. It is the only unreadable record family in the app that gets neither a copy nor a hold.

## E6 — the one empty catch on a user tap

**Reproduced in real Chromium, and fixed.** `js/app.js:47-56`, in `showView`.
`watchForCrashes` installs an `unhandledrejection` listener (`js/app.js:250`), so a
rejection out of an async click handler normally becomes the crash banner. This
`.catch(() => {})` was the one place on a user tap where that net was cut, and it sat on
the view switcher — the most-tapped control in the app.

**What the person does.** One row moved in the reorder panel, then a tab tapped. The
door asks its three-answer question, they choose «שמירה ויציאה», and `saveReorder`
throws. Measured with the throw induced — `State.commitRoster` replaced by a `TypeError`,
which is the shape `tests/forms.browser.mjs` was written for, one screen along:

    {
      "asked": ["שמירה ויציאה", "יציאה בלי לשמור", "הישארות"],
      "bannerBefore": "none",
      "bannerDisplay": "none",
      "bannerText": "",
      "view": "roster",
      "panelOpen": true,
      "draftStanding": true
    }
    pageerrors: []

Nothing. The view does not change, the panel will not close, the crash banner is empty
and hidden — and `pageerrors: []` is the part that matters most: the catch swallowed the
rejection before Playwright itself could see a page error, so this failure was invisible
even to a browser suite that fails on any page error.

**The check that would have caught it**, red on `6155243` with `js/app.js` untouched:

    a save that throws under a tab tap reaches the person
    **FAIL**  the crash banner is raised rather than the tap doing nothing at all  — false
    **FAIL**  and it carries the message, not just «something went wrong»  — ""
    **FAIL**  the throw reached the page as an error rather than being swallowed  — []

**The fix.** The catch is gone, not replaced. Nothing on this path rejects in the
ordinary course — `confirmReorderExit` answers true or false, and `askChoice` resolves
`null` when it is displaced rather than rejecting — so a rejection here IS a programming
error, and the app already has exactly one place to put those. Afterwards the same tap
raises «⚠️ משהו השתבש במסך…» with `nope is not a function` under it and the reload
button beside it, and Playwright sees the page error.

**The other five empty catches are justified and none is on a tap**: `js/ui/bars.js:289`
(a late font), `js/ui/offline.js:45` (a background update check), `js/sync/receive.js:361`
and `js/sync/send.js:75` (a reread whose absence the caller handles), and
`js/sync/restore.js:275`, where the inner chain has already called `this.fail(error)`
before rethrowing.

## E7 — `closeReorder` leaves the drag armed, and the autoscroll goes the wrong way

**Both halves reproduced in real Chromium, through the shipped functions, and both are
fixed.** `tests/reorder.browser.mjs` is the suite; it is new, because the node harness
loads `js/ui/roster.js` against a document of nulls and so had never once executed
`startReorderDrag`, `onReorderDrag`, `autoScrollWhileDragging` or `endReorderDrag`.

**The armed drag.** `startReorderDrag` (`js/ui/roster.js:547`) sets `reorderDragging`,
attaches three document pointer listeners, and may start a 16ms interval. All are torn
down in `endReorderDrag` — and `closeReorder` tore down none of them. Three doors end
there without a `pointerup`: Escape under a held finger, a tab tapped mid-sort, and the
foot's own «יציאה בלי לשמור». The audit called it self-healing at the next `pointerup`,
which is true and is not the harm. The harm is the NEXT open of the panel: the foot reads
`save.disabled = Boolean(reorderDragging)`, so it opens with the save button dead — the
exact failure the comment at `:560-562` was written about, through a door it does not
cover.

Measured with the drag armed on the handle, the finger held against the bottom band, the
exit taken through the dialog's own «יציאה בלי לשמור» (pressed, not tapped, so no
`pointerup` reaches the document), and the interval's ticks COUNTED — the panel's list is
emptied on close, which clamps `scrollTop` to zero, so the scroll position can no longer
say whether the timer is running:

    **FAIL**  the drag is not left standing when the mode closes under it  — false
    **FAIL**  the autoscroll interval is not still ticking after the panel is gone  — 16
    **FAIL**  and the body no longer wears the class that paints the drag bands  — true
    **FAIL**  the save button on the next open of the panel is pressable  — {"found":true,"disabled":true}

**The direction, which the audit did not find.** `autoScrollWhileDragging` closed over
`step`, and it early-returns whenever an interval is already running — so the direction
was decided by the first sample that landed in a band and never revised. A finger that
goes from the top band to the bottom one with no sample in the dead zone between them
leaves the list running UP while it is held against the bottom edge, and only a sample in
the middle can stop it. Not exotic: `pointermove` is delivered once a frame at best and
the browser coalesces the rest, so a flick down the length of the panel IS two samples —
and on a panel shorter than the two 90px bands there is no dead zone to land in at all.
Parked halfway down a list of forty, one sample at the top edge, then one at the bottom:

    **FAIL**  a finger that has moved to the bottom edge scrolls the list down  — {"room":4305,"parked":2153,"atTop":2027,"atBottom":1747,"height":631}

2,153 → 2,027 is the list scrolling up, correctly, for the finger at the top. 2,027 →
1,747 is it still scrolling up while the finger holds the bottom edge.

**The fix.** `closeReorder` calls `endReorderDrag()` — the teardown itself, not a second
copy of it that can drift — after the draft is cleared, so the render at the end of it
takes its null branch. `autoScrollWhileDragging` keeps the step on `reorderDragging` and
the interval reads it at every tick, so crossing to the other band turns the scroll
around on the next tick instead of never.

## E8 and E10

E8: `readUndoStack` answers `[]` for a stack it cannot read, so `dropUndoState` reports
`gone: true` about an entry it never saw. Nothing moves on the disk. Worth the same
`found`/`unreadable` distinction `parseIssuesRecord` already draws.

E10: `refuseEdit` ignores `rollback()`'s verdict. Likely unreachable — `durableText` only ever
holds text `State` produced or a v2 record that already parsed — but the whole point of
`js/state.js:279-293` is that this dialog's sentence must be true.

## E9 — the boot that claims a migration it refused to write down

**Reproduced in real Chromium, and fixed.** `tests/boot.browser.mjs` is the suite; it is
new, because `boot()` is not reachable from `tests/harness.mjs` at all — the harness does
not load `js/app.js` and could not run it if it did.

**The instrument** is `watchStatus` from `tests/status.test.mjs`, moved to the one
function the boot speaks through: `askTell` is wrapped and every call recorded IN ORDER.
A final-state check cannot see this defect, because the app's dialogs displace one another
— `askResetExtras` resolves the question it is covering as a dismissal — so the false
sentence leaves no trace on the screen. The wrapper is installed from a `DOMContentLoaded`
listener registered in a Playwright init script, which runs before `js/app.js` registers
its own listener for the same event; it cannot go any earlier, because `askTell` is a
function declaration in a classic script and does not exist until `js/ui/ask.js` has been
evaluated.

**Measured**, on the same fixture `tests/data.test.mjs` stages for this boot — a truncated
v2 record with a v1 record under it, two sites sharing a name so the migration raises
questions:

    "said": ["הנתונים הועברו לגרסה החדשה", "הקובץ השמור נפגם"],
    "onScreen": "הקובץ השמור נפגם",
    "migrationModal": "flex",
    "blocked": true,
    "v2Intact": "{\"schemaVersion\":2,\"workers\":[{\"id\":\"w_01\",\"name\":\"דו"

Both branches fire, in that order, in the same tick, off one `result`. And
`migrationModal: "flex"` is the half the audit did not reach: the `count > 0` arm chains
`openMigrationModal` onto its own dialog, a displaced dialog RESOLVES, so the questions
modal opened by itself over the damage notice. A device holding its writes, asking
somebody to answer questions about a migration it never recorded and could not record the
answers to.

**The checks that would have caught it**, red on `2611cac` with `js/app.js` untouched:

    a boot that migrates because it is damaged says only the true half
    **FAIL**  the boot does not claim a migration it deliberately did not write down  — ["הנתונים הועברו לגרסה החדשה","הקובץ השמור נפגם"]
    **FAIL**  it says one thing, and it is that the record is damaged  — ["הנתונים הועברו לגרסה החדשה","הקובץ השמור נפגם"]
      PASS  and the damage notice is the sentence left on the screen  — "הקובץ השמור נפגם"
    **FAIL**  and it does not open questions the device could not record the answers to  — "flex"
    **FAIL**  nor when the damage notice itself is read and closed  — {"migrationModal":"flex","onScreen":"הקובץ השמור נפגם"}

    an ordinary migration still says so, and still asks its questions
      PASS  the boot says the data was moved to the new version  — ["הנתונים הועברו לגרסה החדשה"]
      PASS  and puts the unanswered questions in front of the person who read that  — {"migrationModal":"flex","onScreen":"הנתונים הועברו לגרסה החדשה"}

The third line is the point of the whole file: «the damage notice is the sentence left on
the screen» PASSED throughout. A final-state check reads this boot as correct.

**The fix.** `if (result.migrated && !result.damaged)`. No Hebrew string moved — the damage
notice already says «מה שרואים כרגע הוא המצב הישן יותר», which is exactly what a shown-but-
unsaved migration is. Nothing is lost by staying quiet: the migration was not written down
and neither were its questions, so the next boot that reads a healthy record raises both
again from the top. The second suite in that file is the control — a guard that silenced
the honest migration too would have passed every check above.

## What was checked and found sound

**Law 3 — nothing claims saved before a durable commit. No violation found**, other than E1's
`return true`. `State.commit` is journal-first and the journal is the gate; `State.save` and
`State.persist` both go through `Store.setVerified`, set `saveFailed` and call
`updateSyncNotice()` on failure; `refuseEdit` rolls memory back and names the right one of two
refusals; every money form reads the commit's verdict before saying anything — the advance, the
repayment, the correction, the reversal, the closure, the carry approval; and `honestStatusFor`
is the single door for «מסונכרן» and only ever demotes. The roster calls that ignore
`commitRoster()`'s return are safe: its failure path already rolls back and raises the dialog,
and none of those callers says anything afterwards. The two unverified writes that touch a
claim are documented and fail in the safe direction.

**`JSON.parse` — all 32.** Every one is inside a `try`, except six `JSON.parse(JSON.stringify(x))`
deep-copies of an object already in memory. Of the guarded ones, only two treat a parse failure
as empty rather than as damage: E2 and E8. The rest return a fail-safe `null` the caller reads
as "unknown".

**The catches — 91 clauses.** Store 25, sync 11, backup 9, send 9, restore 9, offline 6, state
4, printout 3, receive 3, app 3, adapter 2, and one each in share, settings, reports-statement,
reports-export, day, bars, status. Fifteen are deliberately silent WITH a comment saying why
and are listed in this file so nobody re-audits them. The rest either tell the person or set a
state a person reads.

**Promise rejections.** `watchForCrashes` listens for both `error` and `unhandledrejection`, so
an async `onclick` that throws is not a silent no-op — with the single exception of E6, which
is now closed and has a check standing on it. Every long chain terminates in a `.catch`.

**Disk-full and the reclaim ladder.** `isQuotaError` and the `available`/`full` split hold; the
load-time probe deliberately does not declare a full disk unavailable; `set` reclaims only for a
required write, takes an optional write back out of memory when refused, and **reports the end
of the ladder**. What the ladder can delete is E3.

**The sync error paths.** A send that loses a race is held on the disk and kept out of the
payload even when the marker will not write; a receipt that never arrives is answered from the
server's receipt on resend; a snapshot that will not parse or carries poison is quarantined
without touching the local record or the queue; a ledger clash keeps both bodies and holds.
Each has its suite.

**Laws 11 and 12 hold.** The only `prompt(` in the tree is `deferredInstall.prompt()`, the
`beforeinstallprompt` API. `window.print()` appears once, inside `printWithFallback`, wrapped
in a try with both listeners attached first and the 1.5s picture fallback behind it.

**Timers and listeners.** The send claim's heartbeat is cleared on every exit including both
arms of the flush wrapper, and is `unref`'d. `disconnect()` clears the flush, retry and
relisten timers. `scheduleRetry` and `scheduleRelisten` each clear before setting.
`catchUpWhenSafe` re-arms with no give-up branch, which is deliberate and stated. The one gap
is E7, which is now closed and has a check standing on it - the interval's ticks are counted.

## What was not done, when this document was first written

No gate was run for this document, no browser suite was driven, `tests/` was not modified, and
E6, E7, E9 and E10 were read out of the code rather than reproduced.

That paragraph is kept as it was written, because it is the honest record of what the audit
itself covered. E6-E10 were taken up afterwards, one commit each, and each of those five
sections above now says what was MEASURED rather than what was read: the reproduction, the
verbatim red output of the check that would have caught it, and either the fix or the reason
there is none. A finding that turned out not to be reachable is recorded as not reachable and
is not fixed - the evidence for that is worth as much as a fix, and pretending otherwise is
how a defect list grows things nobody can point at.
