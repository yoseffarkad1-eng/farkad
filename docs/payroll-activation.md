# Turning the pay book on — the runbook

**Nothing in this file has been done.** No rules were published, no build was served, the
real project was not touched. This is the order in which it is done, by whom, what each
person checks, and what to do when a check fails. The design it follows is in
[`docs/payroll-closure.md`](payroll-closure.md) (the release candidate and Phase 8 at the top;
Phases 1 to 7 under it). The build is **v187**, one commit on top of main at v186 (`9846d7f`). Everything stated as "measured" names the suite that measures it.

Two people act here:

- **the owner** — Yosef. Pastes the rules once, updates his two phones, reads one screen,
  presses one button.
- **the maintainer** — whoever serves builds. Runs the gates, serves the build, stands by.

## What turns it on, in five sentences

1. The build that is served has `paybook`, `months` and `cold` **false**, as every build
   before it. On a record nobody has turned on it is the app as it is today, plus one row
   in ⋯.
2. The pay book is turned on **for the record**, not for a phone: a person presses a
   button, and one entry — the opening, `pay.po_open`, "tracking begins on this day" — is
   written to the shared record by one server transaction.
3. That transaction is accepted only by the **new rules**. The app asks the server which
   rules it runs before it tries (a read), and if it tried anyway the old rules would
   refuse it whole.
4. Every phone that holds the record reads the same entry, so **all phones are on
   together** and none can be half on (`tests/activation.test.mjs`, V4).
5. From that moment a phone on a build from before the pay book **cannot write at all** —
   it shows a sync error and keeps its work until it is updated (`tests/activation.test.mjs`,
   V9b, on the real bytes of v180, v183, v184 and v186 against the fake rules;
   `tests/activation.emulator.test.mjs`, O, against the real ones). **One thing such a phone
   can still do, if it is on v186 and shares rides: seat a man.** The ride plans are documents
   of their own and the rule that stops its days does not look at them (measured, the same
   suite, R) - see [A phone on v186 that has not updated](#a-phone-on-v186-that-has-not-updated).

## The point of no return

**It is not the button. It is the first closure, payment or answer about an old closure
recorded through the pay book.**

Between the button and that first entry, this is everything the record has gained
(measured field for field, `tests/activation.test.mjs`, V5):

| | |
|---|---|
| `pay.po_open` | the opening: one entry, a date |
| `ledger.migrations.cm_carry` | the carry approval — only if the record did not already carry it. It is the entry the existing review in ⋯ writes |
| `schedules/current/closed/po_open` | the opening's create-once copy, a document beside the schedule |

No day, no wage, no advance, no ledger entry, no invoice line and no count is changed.
What changes on the screens is one thing: **what a man is said to owe**, for men who took
an advance in a period nobody closed (the one-debt ruling of 2026-11-10).

- **Before the first closure** there is a way back, and it loses nothing: the maintainer
  serves this same build with one line changed — `paybookActivation: false` in
  `js/model/schema.js`. Every phone that updates then reads the record exactly as it read
  before the button (measured: every figure, `tests/activation.test.mjs`, V6; on the
  emulator, W). The three entries above stay in the record and are ignored.
  **The rules are NOT rolled back** — see [Rolling back](#rolling-back).
- **After the first closure** there is no way back. A closure through the pay book writes
  a frozen payslip and deductions a person chose; a build that does not read the pay book
  would show that account as "closed, payment unknown" and would compute later debts by
  the old walk. Problems after that point are fixed forward.

## Part A — the maintainer, before the owner does anything

| # | do | check | if the check fails |
|---|---|---|---|
| A1 | On the exact commit to be served, from one clean detached worktree: `npm ci`, `npm test`, `npm run test:release`. **`test:release` includes the emulator suites - the only place the REAL rules are run**, among them `test:activation-emulator`. | Every check passes. Say which commit. | Stop. Nothing is served. An emulator suite that was "not run" is a stop, not a note. |
| A2 | On the same commit: `npm run test:gate-open`. | It ends with «what differs is exactly tests/gate-open.expected.mjs». | A NEW difference is a guarantee nobody has read with the pay book on. Read it, fix it or add it to the list with its reason. Do not serve until it is the list. |
| A3 | The ONE rules file to paste is `firestore.rules` at the commit that is served - the file every emulator suite of A1 ran with. See [The rules file](#the-rules-file). | `cmp` of the text handed to the owner against `git show <commit>:firestore.rules` says nothing. | Hand over the file again. Nothing typed, nothing merged by hand. |
| A4 | Firestore console → Indexes → Single field → exemptions. | There are exemptions for `days`, `ledger`, `pay`, `payIndex`, `monthIndex`, `roster`, `advances` — or the owner adds them. (Firestore also limits a document to 40,000 index entries; the emulator does not enforce it and no suite here can see it. Phase 6, open risk.) | Add them before step 5. Not adding them does not block activation today; it brings a wall closer that nobody can measure from here. |
| A5 | Serve the build (merge, Pages). **The merge also starts `.github/workflows/rules.yml`** - read [Merging starts the rules workflow](#merging-starts-the-rules-workflow) BEFORE merging. | The Pages deployment for that commit succeeded. The `rules` run is RED with «firestore.rules was NOT published» (no secret - expected), or green with a summary naming the commit and the file's sha256 (a secret was set: the rules ARE live, and step 2 below becomes a comparison only). | Do not ask the owner to do anything. A `rules` run that is green with no such summary, or red for any other reason, is read before anything else happens. |

## Merging starts the rules workflow

This commit changes `firestore.rules`. `.github/workflows/rules.yml` runs on every push to
main that changes that file, and tries to PUBLISH it to the real project with the secret
`FIREBASE_SERVICE_ACCOUNT`. The workflow is not changed by this build.

| the secret | what the merge does | then |
|---|---|---|
| **not set** (the state today: the v185 run went red at the key step and published nothing) | the run is **red**, «firestore.rules was NOT published», the live rules are whatever they were | the owner pastes the file by hand - step 2 of Part B |
| **set** (if the owner ever sets it) | **the merge itself publishes the new rules**, within minutes, at about the moment Pages starts serving the build; nothing orders the two | step 2 of Part B is only the comparison: what the console shows must be this commit's `firestore.rules` |

**Both are safe, and so is either order of "rules live" and "build on a phone" - while
nobody has pressed the button.** Measured, cell by cell
(`tests/activation.emulator.test.mjs`, on the emulator, each build's own bytes and adapter):

| the phone's build | the rules | the record | what happens |
|---|---|---|---|
| v180, v183, v184, v186 | live today | not on | records a day, synced - today's state (O, «under the rules LIVE TODAY») |
| v180, v183, v184, v186 | **new** | not on | records a day, restores a file, synced: every new rule is vacuous without a pay book (O, «BEFORE the record is on») |
| **v187** | live today | not on | records a day, shares rides, as v186 does. The button asks the server, is told the rules are the old ones, says so and writes nothing; sent anyway, the opening is refused whole (T) |
| **v187** | **new** | not on | as v186, plus the row in ⋯; the button works (N) |
| v180, v183, v184, v186 | **new** | **on** | every write to the record refused: a day, an old-style closure, a restore. The phone shows a sync error and keeps its work. v186's ride plans are still accepted (O, «AFTER»; R) |
| v180, v183, v184, v186 | live today | **on** | **the hazard**: its restore is accepted and the pay book is gone from the server (O, «the hazard») - cannot arise unless the new rules are taken back after the button |

So, of "the new rules live BEFORE this build reaches a phone":

- **it is not required** for anything a phone does before the button - a v187 phone under
  the rules of today is a v186 phone with one more row in ⋯;
- **it is required before the button**, and that is enforced twice without anybody
  remembering it: the app asks by reading and refuses with a sentence, and the rules of
  today refuse the opening whole if it were sent anyway;
- **it is preferred** only for tidiness: the owner then never meets the sentence «השרת
  עדיין עובד עם הכללים הישנים».

The order below - rules, then phones, then the button - is the one that needs no judgement.

### A phone on v186 that has not updated

After the button, on the new rules (measured, R, with v186's own adapter out of Git):

| it tries to | |
|---|---|
| record a day, clear one, change the roster, give an advance, close an account the old way, restore a file | **REFUSED.** Not on the server; the phone shows a sync error, not «מסונכרן», and keeps what was typed until it updates |
| seat a man, move him, change the list of vehicles (shared rides) | **ACCEPTED**, and the other phones draw it. A ride plan is a document of its own (`schedules/<doc>/transport/…`), carries no protocol, and is judged by its own block: who writes, its shape, the next revision |
| read the record | yes - it adopts what the others write, and still shows the OLD arithmetic for what a man owes |

This was not designed; it is what the two sets of rules do side by side, and it is left as
it is: a ride plan is not the record and no money is in it. What it means on the day: such a
phone seats men **from its own copy of the day**, which may hold days nobody else has
received. A plan that looks wrong on the others' phones after the button is the sign of a
phone that has not updated. Update it; its days go up by themselves.

## Part B — the owner

Each step is done on the phone named. **Do them in this order.**

### 1. Take a backup — the owner's main phone

⋯ → גיבוי → «שמור קובץ גיבוי». Send the file to yourself (WhatsApp to your own number, or
email).

- **Check:** the file is in הורדות / קבצים and is about the size it has been (around
  185 KB today). ⋯ shows the backup's age as today.
- **If it fails:** stop. Nothing else here is done without a backup from today.

A backup is the work record as it is before anything changes. It is also the only copy
that is not a mirror: sync copies a mistake to all three phones as faithfully as a
correction.

### 2. Publish the rules — once (owner, with the maintainer on the phone)

Firebase console → Firestore Database → Rules.

1. **Copy what is there now into a file and keep it.** The maintainer compares it with
   `docs/firestore.rules.before-paybook`, which is main's `firestore.rules` at v186: the
   rules of v184 plus the shared rides' block. They must be identical. **This is believed
   and has not been checked:** the owner reported pasting that file on 2026-11-10; nobody
   has read the console since. (The file of before the rides, v184's, WAS compared with the
   console, byte for byte, earlier that day.)
   - **If they differ: stop.** The file in this repository is not what is live, and
     nothing here was measured against what is live. The one difference with a known
     answer: the console still shows the rules WITHOUT the rides' block (`git show
     990f5b4:firestore.rules`) - then the paste of 2026-11-10 did not happen, the phones
     have been saying «עדיין לא משותף» under הסעות, and the file to paste is still the same
     one: it holds that block too.
   - If the `rules` workflow published at the merge (a secret was set), the console already
     shows the NEW file: compare it with `firestore.rules` of the served commit instead,
     keep it, and paste nothing.
2. Select everything in the editor, paste the new file, **Publish**.

- **Check, on any phone, still on the build it had:** the status line says «מסונכרן»;
  record a day and remove it again — both go through.
  Why it must: with no pay book on the record every new rule is vacuous. Asked of the real
  bytes of v180, v183, v184 and v186: each records a day (`tests/activation.test.mjs`, V9b) and,
  on the real rules, records a day and restores a file exactly as before
  (`tests/activation.emulator.test.mjs`, O, "BEFORE the record is on"). The same was
  measured for the rules of Phases 3 to 6 on v167, v171 and v172
  (`tests/months.emulator.test.mjs`, Y5). And הסעות goes on being shared: the rides' block is
  in the new file word for word (`tests/transport.emulator.test.mjs`, the whole suite, runs
  on the new file).
- **If a phone shows a sync error after publishing:** paste the saved text back and
  Publish. At this step that is completely safe — nothing has been written that the old
  rules do not know. Tell the maintainer what the phone said.

### 3. Update every phone — in this order

1. the owner's main phone, 2. the owner's second phone, 3. the other two people's phones.

On each: open the app, accept the update when it offers it (or ⋯ → עדכון → check), then
⋯ → the version line.

- **Check, on EACH phone, by looking — not by assuming:** the version is the one the
  maintainer named. ⋯ → כללי shows a new line: «פנקס שכר (סגירת חשבון, תשלומים וארכיון):
  עוד לא הופעל ברישום הזה.» with the button «פנקס שכר - הכנה והפעלה».
- **Check:** the «מקדמות» tab, the reports and the day screen are what they were.
  Nothing has changed yet.
- **If a phone cannot be updated today:** do not go on. From step 5 that phone cannot
  write a day until it is updated (it keeps what is typed on it, shows a sync error and
  sends it after the update) — and what it SHOWS a man owes is the old figure. It can
  still seat men in הסעות ([above](#a-phone-on-v186-that-has-not-updated)).
- No window of an older build stays open beside an updated one on the same phone.

### 4. Read the screen — the owner's main phone

⋯ → «פנקס שכר - הכנה והפעלה». **Reading it changes nothing**: it writes nothing to the
phone or the server and asks the server nothing (measured,
`tests/activation.browser.mjs`).

Read, in this order:

| on the screen | what to do with it |
|---|---|
| **«חוב מקדמות שיוצג אחרת»** — each man whose debt will read differently: «היום» and «אחרי ההפעלה» | This is the list that matters. Today the app assumes an advance from a period nobody closed already came off that period's wage. Afterwards it is a debt until somebody deducts it. **For each name: is the «אחרי ההפעלה» figure what he really owes?** If part of it was in fact settled by hand, note the man and the sum — after step 5 you record a «החזר» (repayment) for him on his advances page. Nothing is deleted either way. |
| **«סגירות ישנות»** — a number | Closures made before the pay book have no payment record. After step 5 they are on a list, «סגירות ישנות לבדיקה», and you answer each when convenient: paid / still owed / unknown. Nothing waits on it. |
| the carry line, if it appears | The record has no approval yet that an advance balance carries to the next account; the button gives it, once. (If it does not appear, the record already has it.) |
| **«גודל הרישום והארכיון»** | The record's size out of 1,024 KB, and what leaves it later: a closed and fully paid account after 14 days, a month closed for everybody after six months and only when asked. **A day in a month that has moved can no longer be changed** — not a wage day, not a רימא count, not a יוסף גבס count. |
| **«יום תחילת המעקב»** | The default is the first day of the fortnight that holds today. Every closure and payment from that day on is recorded in the pay book; what was closed before it does not change. Choose an earlier day only if you want to close an earlier period through the new screens. |

- **If a figure looks wrong:** stop here and send the maintainer a picture of the
  screen. Nothing has happened.

### 5. Press the button — the owner's main phone, with signal

«הפעל את פנקס השכר» → the dialog «להפעיל את פנקס השכר?» → «הפעל».

| the phone says | it means | do |
|---|---|---|
| «פנקס השכר הופעל.» and the «מקדמות» tab is now «חשבונות עובדים» | Done. The opening is on the server. | Go to step 6. |
| «השרת עדיין עובד עם הכללים הישנים. פנקס השכר לא הופעל ודבר לא נרשם…» | Step 2 was not done, or the paste was not published. | Do step 2, then press again. Nothing was written. |
| «אין חיבור לשרת…» | No signal, or the phone has not heard from the server yet. | Wait for signal; press again. Nothing was written. |
| «יש במכשיר הזה רישומים שעוד לא נשלחו לשרת…» | The phone still holds unsent work. | Wait until the status line says «מסונכרן»; press again. |
| «אישור המעבר נשמר במכשיר ועוד לא הגיע לשרת…» | The carry approval was written and is on its way. | Leave the screen open: it goes on by itself within seconds. If it does not, press again. |
| «הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב…» | The opening was sent and the answer was lost on the way. | **Do not press again.** Leave the app open with signal; it looks by itself and then says «…התקבל בשרת» or «…לא התקבל». |
| «פנקס השכר כבר הופעל מטלפון אחר…» | Somebody pressed it first. | Nothing; it is on. |

### 6. Look at the other phones

On each, with signal, without touching anything in the app: the «מקדמות» tab is now
«חשבונות עובדים», and ⋯ → כללי says «פנקס השכר פעיל ברישום הזה. יום תחילת המעקב: …».

- **A phone whose tab is still the old advances list** has not heard (no signal) or was
  not updated. With no signal it is on the old arithmetic for the whole record until it
  hears, then it changes by itself. A closure made on it the old way in the meantime is
  not lost and is not silent: it arrives on «סגירות ישנות לבדיקה» for you to answer
  (`tests/activation.test.mjs`, V8).
- **A phone that shows a sync error on every write** is on an old build. Update it.

### 7. Before the first closure — stop and look

This is the last moment the way back exists. On the accounts list:

- every man you noted in step 4 reads the debt you expect («חוב מקדמות»);
- nobody reads «לבדיקה» for a reason you do not understand («מה לבדוק?» on his row says
  why);
- the two phones show the same list.

If something is wrong: **close nothing**, tell the maintainer. The way back is one line
and one served build.

### 8. The first closure — one man, on purpose

Close one man's account whose numbers you know by heart: «סגירת חשבון ואיפוס» on his row,
read the page, «שולם הכול» or what was really paid, «אישור סגירה».

- **Check:** «היסטוריית סגירות חשבון» shows it with the figures you expect; the second
  phone shows the same within seconds.
- This is the point of no return. From here problems are fixed forward.

### 9. Afterwards

- «סגירות ישנות לבדיקה» — answer when convenient.
- A closed, fully paid account leaves the server's live record by itself 14 days later;
  «ארכיון סגירות» shows what is ready and what stays, with the reason.
- «ארכיון סגירות» → «ארכיון חודשים»: six months after a month is closed and paid for
  everybody it can be moved, and only when you press. The page shows first what would
  move.
- Take a backup again after the first week.

## What each of the three people sees

| | before step 5 | after step 5 |
|---|---|---|
| the day screen, the week, the crew, the seder, הסעות, the WhatsApp message | as today | **the same** |
| reports: pay, invoice, רימא, יוסף גבס | as today | the same wages, days and counts. A man's advance debt carried into an account can read higher (the ruling) — only for men on the list of step 4 |
| the «מקדמות» tab | the advances list | «חשבונות עובדים»: a row a man — his open period's wage, «יתרת שכר לתשלום», «חוב מקדמות», and for almost nobody «יתרת זכות». One man's advances page is the existing one, from the «מקדמות» button on his row |
| closing an account | the old dialog («סגור את החשבון») | the review page only: per-advance deduction, extra deductions, what was paid. **Needs signal** — a closure or payment with no connection is refused, in a sentence, and nothing is written |
| giving an advance, a repayment, «תיקון טעות» | as today | **the same forms**, with or without signal |
| ⋯ | one new line and button under כללי | the line says it is on, since which day; no button |
| a phone that was not updated | works | **every write to the record is refused**: sync error, not «מסונכרן», the work stays on the phone until it updates. Its shared ride plans still go through |

All three accounts may close and pay (the owner's rule 8). All three may press the button
of step 5 — it is in ⋯, behind a screen and a confirmation that says it cannot be turned
off. If only the owner should be able to, that is decision 72.

## The rules file

**One paste.** The file is `firestore.rules` at the commit that is served. For v187 the
exact text was also handed over beside the commit as `firebase-rules-v187.txt`, byte for
byte the same file.

Every difference from the file believed live today (`docs/firestore.rules.before-paybook`:
main's `firestore.rules` at v186, 396 lines, the shared rides' block in it) — and there is
no difference of any other kind: **not one line of today's rules is removed or changed; 380
lines are added**, and the file is 776 lines (pinned, `tests/activation.test.mjs`, V12; and
`diff` of the two files is five insertions - 290, 3, 16, 69 and 2 lines - and nothing
else). The pay book's three kinds of document (`closed/`, `months/`, `probe/`) are inserted
between the receipts block and the rides' `match /transport/{name}` - siblings under the
same `match /schedules/{docId}`, where order decides nothing. The rides' block is word for
word the live one (V12, and `tests/transport.emulator.test.mjs`, ADD).

| added | what it enforces | binds only when |
|---|---|---|
| `payGuard` (`touchesPay`, `speaksPaybook`, `payOnlyGrows`, `carriesClosed`) | the pay map only grows, only at protocol 2, only with its create-once closed copy in the same commit | a write changes `pay` |
| `indexGuard`, `archivesOne`, `payOnlyLeaves`, `indexedNeedsPaybook` | the index of archived closures only grows, one row a write, its closed document must exist; once there is an index only protocol 2 writes | a closure has been archived |
| `daysGuard`, `monthGuard`, `archivesMonth`, `monthsNeedPaybook` | no write of any shape touches a date of an archived month; the month index only grows, against an existing month document | a month has been archived |
| **`activatedNeedsPaybook`** (Phase 8) | once the document holds a pay book at all, a writer below protocol 2 may not write **the schedule document** | the record is on |
| `payGuardOnCreate`, `indexGuardOnCreate`, `monthGuardOnCreate` | a new project may not begin with a pay book without its closed copy, an index, or a month index | a document is created |
| `match /closed/{entryId}` | create-once, never updated or deleted, only in the commit that takes the schedule to the revision it names | — |
| `match /months/{monthId}` | the same, named by month and digest | — |
| **`match /probe/{generation}`** (Phase 8) | nothing is stored here: `get` of `probe/paybook-8` is allowed, which is how the app asks "are these the new rules" by reading | — |

Unchanged, to the letter: who may read and write (`allowed()`), the protocol envelope, the
receipts, the bootstrap, `history/`, the shared rides' block, and "everything else is
denied".

### How the one file was made

Main's file and the pay book's file each added to the rules of v184, in different places.
The file in this commit was **built, not typed**: `python3 tools/combine-rules.py <the pay
book's file> <the common base, 990f5b4> <main's file> <out>` takes the other side's change
only if it is ONE insertion right after the receipts block holding one `match` block and
declaring no function the pay book's file declares, inserts those lines after `probe/` and
before the brace that closes `match /schedules/{docId}`, and checks that every line of both
is in the result. It produced, on the merge, byte for byte the working file that was handed
over with Phase 8 (41,260 bytes).

**Both features were run on that one file**, on the emulator: the pay book's thirteen
suites and the shared rides' own (`test:transport-emulator`) - see the hand-over report of
the commit for the counts; a result belongs to a commit. The probe's name did not move for
the rides' block: no client refuses to run without it.

## Rolling back

| when | the build | the rules | what is lost |
|---|---|---|---|
| after step 2, before step 5 | nothing to do | paste the saved text back (the file WITH the rides' block - not an older one, or הסעות stops being shared). Safe. | nothing |
| after step 5, **before the first closure** | serve this build with `paybookActivation: false`. Every phone updates. | **leave the new rules.** | nothing: every figure reads as before the button; three inert entries stay in the record |
| after the first closure | — | **never.** | there is no way back; fix forward |

Why the rules are never rolled back once the record is on: under the rules published
today an older build's restore is **accepted and the pay book is gone from the server**.
Measured at Phase 3 on v167, v171 and v172 (`tests/paybook.split.emulator.test.mjs`, «the
hazard, on the real rules»), and asked again of v180, v183, v184 and v186
(`tests/activation.emulator.test.mjs`, O, the last section of each). Under the new rules the same restore is refused and nothing moves. And the
closed documents become unreadable to the app under rules that have no `closed/`.

**And the workflow can do it without anybody pasting:** if `FIREBASE_SERVICE_ACCOUNT` is
ever set, a later push to main that changes `firestore.rules` publishes that file. After
step 5 no commit that takes a line of the pay book's rules out may reach main.

If the new rules were ever replaced by mistake after step 5: paste the new file back at
once. Nothing is lost by the mistake itself unless an older build restored in between.

## What the maintainer watches for in the first week

- A phone reporting `error` on every write: it is on an old build. (The rules refuse it;
  the work is on that phone.)
- «לבדיקה» on a man: «מה לבדוק?» says which of three things it is — two phones recorded
  one entry differently, an entry that is not counted, or more was handed back than was
  given. **The first cannot be settled from the app yet** (decision 49; designed in
  `docs/payroll-closure.md`, Phase 8, not built). It cannot arise through the screens —
  every pay entry is one server transaction and the loser is told — only through a file
  restored from another state of the record.
- The size line on «ארכיון סגירות».
- ⋯ → מצב המכשיר: «ארכיון במכשיר: …» appears on a phone once something has left the live
  record (14 days after the first paid closure at the earliest).

## What was NOT verified, and stays open on the day

- **What is live in the console.** Believed to be main's file at v186 on the owner's
  report of 2026-11-10; step 2 is where it is read.
- **Whether the emulator suites - the only place the REAL rules are run - had been run on
  the served commit.** That is step A1, not an assumption; the hand-over report of the
  commit says which were run and what they said.
- **The `rules` workflow with a secret.** It has never published anything (both recorded
  green runs skipped the publish; the v185 run was red at the key step). What it does with
  a key is read from its text, not seen.

- **No real phone.** Every screen here was driven in Chromium with emulated touch. The
  keyboard over the review page, the date control in the iPhone's own locale, and a slow
  signal between the tap and the answer have not been seen on a device.
- **No real record.** The dry runs were read on synthetic records. Step 4 is the first
  time they are read on the real one — which is why it is a step.
- **The 40,000 index entries** (A4).
- **A real eviction of the phone's cold store** by iOS; and the first move of a large
  archive to it (decision 69) — neither arises before something has been archived.
