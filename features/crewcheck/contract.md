# Contract — «בדיקת הצוות»: the crew's housekeeping, asked for (track `crewcheck`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch `feat-crewcheck`,
worktree `/home/user/farkad/.claude/worktrees/feat-crewcheck`. Wave 2 of the 2026-11-19 program; the
integrator ships it with wave 1 (`status`, `payday`, `monthboard`, `yearsummary`) and v205 as v206 or
v207.

The crew screen already says three of these things, one row at a time: «בלי טלפון» on a man's meta
line, «שם כפול» and «מספר משותף» as badges (js/ui/roster.js:184/207/214). On a crew of forty they are
read by nobody - and three of the facts that cost the most are not on the row at all: a number that
is typed but will never open in WhatsApp (the row shows it like any other, "📞 03-5551234"), a man
with no daily rate (the row simply leaves «יומי» out), and a man or a site that stopped working weeks
ago and is still on the active list - in «לא נרשמו» every evening, a card on the day screen every
day (day.js:556). The judge rejected these as news on the status screen because they cry wolf; on the
crew screen, asked for, they are a checklist. This track is ONE button at the foot of the crew screen
and ONE dialog: what in the roster will cause trouble, each name or site with one door that only
navigates. It writes nothing - no record, no key, no preference.

Every number below was measured on this base by the probes in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/program/crewcheck/`
(`probe-rules.mjs` + `probe-rules.out` + `rules.json`: the thresholds; `probe-final.mjs` +
`probe-final.out` + `final.json`: the rules as written here, on the seeds and seasons, and the cost;
`probe-rules-lib.mjs`: the seeds and seasons; `probe-phones.mjs` + `.out`: the phone family;
`probe-entry.mjs` + `entry.json`, `probe-foot.mjs` + `foot.json`, `probe-foot2.mjs`, `probe-lead390.mjs`:
where the button fits; `probe-chromium-cost.mjs` + `.out`: the reading in Chromium). Revision 2 adds
`rev2/probe-rev2.mjs` + `.out` + `rev2.json` (revision 2's rules on the phone family, the four seeds,
the two screens.mjs entries, the evenings read as of themselves and on the whole record, the cost) and
`rev2/probe-entry-rev2.mjs` + `.out` + `entry-rev2.json` (the entry with this contract's own rules) and
`rev2/probe-plan.mjs`, `rev2/probe-plan2.mjs` + their `.out` (the turnover regulars' planned leave
against the record's run, in all and man by man; `rev2/lib-with-plan.mjs` is probe-rules-lib.mjs with the
plan returned), and cites the critic's probes in `critic/`. The seasons are models; their shares are true of the model, not
of anybody's real year.

## Goal

After this ships the owner scrolls to the end of «צוות» (or taps «אתרים ↓» and a little more), taps
«בדיקת הצוות», and reads:

1. under «כדאי לבדוק»: who has no daily rate; whose typed number will not open in WhatsApp; which
   number is on two active rows; which name is on two active rows; which active man and which active
   site had no work in the last 25 working days, each with the date of the last;
2. under «לידיעה», never counted: the men whose number was typed as another country's, the men
   working these days who have no number, the men with recorded days stamped with no daily rate
   (they stay without an amount whatever is typed now - iron law 2), the active men and sites with no
   day of work at all;
3. «✓ לא נמצא בצוות דבר שכדאי לבדוק.» when the first list is empty - and, while the record holds fewer
   than 25 working days, one line saying the long-idle rules have not run yet (revision 2);

and every name or site takes him, in one tap, to where it is mended - the man's own details form (a
rate, a number, a name) or the man's or the site's row (where «פעיל» and «עוד ⋯» already are; for the
stamped days, which nothing mends, his row and its «כרטיס עובד»). The dialog itself archives, edits,
renames and deletes nothing, and for 700 ms after a door the switches and the form's «שמור» under the
finger are held (revision 2).

## Out of scope

- Any write: archiving, renaming, editing, deleting, a "seen" or "ignore" mark, a per-phone dismiss.
  No Store key at all - none is needed.
- Anything on the crew screen beyond the one button: no count on it (its words never change), no new
  badge on a row, no change to «בלי טלפון», «שם כפול», «מספר משותף».
- Money: advances, debts, periods, payslips, the gate («מי חייב כסף», «שים לב» and «סגירת שבוע»
  own them; owes.js 'idle' already says «יש חוב ואין ימי עבודה בתקופה»). ONE money READER is called,
  for one fact and no figure (revision 2): `ratesForDay` (money.js:53), whether a recorded day's stamp
  has no daily rate - the day check's own call (daycheck.js:265). No amount is computed, summed or
  shown, and nothing that writes money is called.
- The day's facts: a man not recorded today, an empty site today, Rima left out, a day that will not
  price, extra hours with no hourly rate, «לא עבדו שבוע עבודה או יותר» (5-12 working days) - all are
  «בדיקת היום»'s (daycheck.js:34-51) and stay there. The one cross-day fact taken here is which active
  men have days whose STAMP has no daily rate (`zeroStamped`) - a fact of the roster's past that no
  single day's check can show, and that no rate typed today can change.
- Archived men and sites as subjects (they are on no line; their days still make working days and
  keep a site in use).
- Pay cycles, identity numbers, vehicles (retired), הסעות.
- Paper, the picture, a text door: it is a dialog (app.css:4147-4180), and nothing leaves the phone.
- `js/app.js`, `js/ui/offline.js` (v205), `js/ui/whatsnew.js`, docs, CLAUDE.md.

## Data — reads only

Nothing in this track writes the record, the outbox, the cloud, a backup, a restore point, the rescue
file or ANY Store key. Its only state is memory: the dialog's open flag and, revision 2, the moment the
slow second tap's hold ends (`crewCheckHoldUntil`, Entry and navigation) - nothing else (no reading is
kept - it costs single milliseconds; see the budget).

**The reading** - `crewCheckRead(schedule, today, layer, asOf)`, PURE in the house's sense (daycheck.js:117-120:
no DOM, no Store, no State, no clock; `today` and `layer` handed in), ONE forward pass over the sorted
day keys, then a binary search. `asOf` (revision 2) is optional: when it is given the pass stops at the
first key after it - the record as it stood that evening, days after it not yet written. THE APP PASSES
NOTHING (every key is read, so tomorrow's seder counts); criterion 7 passes each evening as its own
`asOf`, which costs one comparison in a sorted pass and no copy of the record:

| what | read from (file:line at the base) |
|---|---|
| the record, the layer, today | `State.schedule` (js/state.js:48), `State.layer` (:54, always `'actual'`), `todayStr()` (js/ui/dom.js:175) - handed in by the caller, never read inside |
| the day keys | `Object.keys(schedule.days).filter(isRealDate)` sorted (isRealDate, js/model/schema.js:277) |
| the working-day calendar W | every key `d <= today` with `dayCheckIsWorkingDay(schedule, d, layer)` (js/ui/daycheck.js:152): a day on which any man the record holds, archived included, has a site; absences alone, a Rima count alone, a יוסף גבס count alone are NOT working days; a Saturday with work IS one |
| a man's last day L(m) | the latest key (`<= asOf` when it is given, else ANY date - after today too, tomorrow's seder counts), with `dayCheckHasSite(schedule, d, m.id, layer)` (daycheck.js:138: a record, not absent, at least one entry) |
| a site's last day L(p) | the latest key (the same bound) on which a record that `dayCheckHasSite` accepts has an entry with `placeId === p.id`, or `rimaCount(schedule, d, p.id) > 0` (schema.js:3028), or `yosefGevesCount(schedule, d, p.id) > 0` (schema.js:3298) - a site Rima's men or יוסף גבס's men are counted on is in use |
| S, the window | `W[W.length - 25]` - the first of the last 25 working days; `null` when W has fewer than 25 (then nothing is idle) |
| idle(L) | `L !== null`, `L <= today`, and at least `CREW_CHECK_IDLE_DAYS` (25) days of W fall after L - i.e. `L < S` (one binary search in W) |
| a usable WhatsApp number | `sederWaNumber(phone)` (js/ui/seder.js:172), the seder's own rule: `''` = «אין מספר טלפון תקין» |
| a digit (revision 2) | `/[0-9٠-٩۰-۹]/` - exactly the digits `sederWaNumber` converts (ASCII, Arabic-Indic U+0660-0669 and Extended Arabic-Indic U+06F0-06F9, seder.js:174-175) |
| another country's number, as typed (revision 2) | the trimmed text with both Arabic-Indic sets read as `sederWaNumber` reads them and everything but digits and `+` taken off; it starts with `+` or `00`, and the digits after that prefix are non-empty and start with neither `972` nor `0` (no country code starts with 0: a `+0…` is a local number behind a stray plus) |
| one number on two rows | `normalisePhone(phone)` (schema.js:1336) - the comparison `samePhone` / `workersSharingPhone` make (schema.js:1363/1371); a group whose every number opens is regrouped by `sederWaNumber` (revision 2, see `sharedPhone`) |
| a day's stamp (revision 2) | `ratesForDay(schedule, d, id, worker)` (money.js:53), read for `stamped` and `daily` and nothing else - the day check's own call (daycheck.js:265); no amount is worked out |
| a man's fields | `id, name, phone, dailyRate, active` as js/state.js:1268-1296 normalises them |
| a site's fields | `id, name, active` |
| words for dates and names | `formatShortDate` (js/dates.js:272), `formatFullDate` / `hebrewDayName` (dom.js:169/165), `parseLocalDate` (dates.js:13), `isolate` / `isolateLtr` (dom.js:20/56) |

Returned: `{ today, since: S | null, counts: { men, sites }, check: { noRate: [who], badPhone: [who +
phone], sharedPhone: [{ number (the first man's, as typed), key (normalisePhone), men: [who] }], sameName: [{ name, men: [who] }], idle: [who + last],
idleSites: [{ id, name, last }] }, info: { otherPhone: [who + phone], noPhone: [who], zeroStamped: [who +
days], never: [who], neverSites: [{ id, name }] } }`, with `who = { id, name }`, every list in roster order
(the order every other screen reads in, roster.js:263-265). `counts` are the active men and active sites.
`since: null` is what draws the line «עדיין אין 25 ימי עבודה רשומים…» (The screen, 1a).

**The rules - exactly when** (active man = `worker.active !== false`; active site = `place.active !== false`):

| kind | tier | exactly when | chip | door |
|---|---|---|---|---|
| `noRate` | כדאי לבדוק | `(Number(worker.dailyRate) \|\| 0) <= 0` - '' / 0 / '0' / undefined / negative; hourly-only too (a day of his is stamped `daily: 0` - currentRates returns null only when both rates are 0, money.js:42, and setWorkerDay stamps the rest, :69-83 - and is never priced: those days are `zeroStamped`'s, below) | name | form → daily rate |
| `badPhone` | כדאי לבדוק | the phone field holds a digit (the table above), `sederWaNumber(phone) === ''`, and it is NOT another country's number as typed (the table above) - every number written as an Israeli one that will not open: a typo, a landline, a missing or extra digit, a dropped 0 or 05, two numbers in one field (revision 2: revision 1 also required `normalisePhone` to be `''` or start with `'0'`, and so put '8841930', '52884193', '5288419301', '5551234' and '528841930 / 541234567' - Israeli numbers gone wrong - under «לידיעה» as foreign) | name · the number as typed | form → phone |
| `sharedPhone` | כדאי לבדוק | one finding per number held by two or more ACTIVE men, grouped by a non-empty `normalisePhone(phone)`; a group in which EVERY man's `sederWaNumber` is non-empty is regrouped by `sederWaNumber` (the seder's own comparison, seder.js:141-144) and only sub-groups of two or more stand - so two numbers the seder reads as different are never one finding (revision 2: `normalisePhone` drops non-ASCII digits, schema.js:1337-1338, so '٠٥٢-884-1930' and '٠٥٣-884-1930' are both '8841930' there) | each man's name | form → phone |
| `sameName` | כדאי לבדוק | one finding per name held by two or more active men, compared exactly as `hasDuplicateName` (roster.js:732-735) compares | name · 1, name · 2 … (his place among them, roster order) | form → name |
| `idle` | כדאי לבדוק | L(m) not null and idle(L(m)) | name · his last day | his row |
| `idleSites` | כדאי לבדוק | L(p) not null and idle(L(p)) | site · its last day | the site's row |
| `otherPhone` | לידיעה | a digit typed, `sederWaNumber === ''`, and another country's number AS TYPED (the table above: a `+` or `00` and a country after it that is not 972) - true that it will not open from the app (the seder refuses it on purpose), and nothing to mend. Revision 2: only a prefix the owner typed makes a number foreign; a bare string of digits is an Israeli number gone wrong, `badPhone` | name · the number as typed | form → phone |
| `noPhone` | לידיעה | no digit typed at all (empty, spaces, «אין», a lone `+`) AND L(m) not null AND not idle - a man working these days, the one a message would be opened for | name | form → phone |
| `zeroStamped` (revision 2) | לידיעה | an active man with at least one key (`<= asOf` when given) on which `dayCheckHasSite` holds and `ratesForDay(schedule, d, id, worker)` returns `stamped: true` and `daily <= 0` - a day recorded while his roster had an hourly rate and no daily one. Its stamp was written at first write (money.js:76-83), survives every later edit (setWorkerDay keeps `previous.rates`, :76-80 - `clearWorkerDay` and `markAbsent` included, :186-192; `isEmptyWorkerRecord` keeps stamped rates as history, schema.js:1379) and is never priced (money.js:273-275): a daily rate typed now prices his days from then on and NOT these. «לידיעה» and not «כדאי לבדוק», because nothing on this screen or any other mends it (iron law 2) and a stamp is for ever - in the counted tier it would hold the calm line off on every opening for ever | name · how many such days (`יום אחד` / `${n} ימים`) | his row |
| `never` | לידיעה | L(m) null - no day of work recorded at all (absences only included) | name | his row |
| `neverSites` | לידיעה | L(p) null | site | the site's row |

A man may stand on more than one line (a pasted new man: «בלי שכר יומי» and «… בלי אף יום עבודה
רשום»; an hourly-only man who has worked: «בלי שכר יומי» under «כדאי לבדוק» - his days from now on -
and «ימים שנרשמו לו בלי שכר יומי…» under «לידיעה» - the days already stamped); each line is its own
fact, and the doors differ by what is mended.

**Agreements, pinned** - the dialog says what the row and the seder already say, never something else:
- an active man is in a `sameName` group ⇔ `hasDuplicateName(worker)` - the row's «שם כפול»;
- an active man is in a `sharedPhone` group ⇔ `workersSharingPhone(schedule, phone, id)` holds another
  ACTIVE man (the row's «מספר משותף» also counts an archived man: deliberate, see What it does NOT do) -
  EXCEPT where he and every such man have numbers that open and the seder reads as different
  (revision 2's regroup): the row still badges them, pre-existing, and the check names nobody;
- `badPhone ∪ otherPhone ∪ (no digit)` ⇔ `sederWaNumber(phone) === ''`, for every active man, the three
  disjoint - so an ACTIVE man on today's or a later day's `sederCrew` list (seder.js:102) with
  `number === ''` (he is then neither idle nor «never») is on exactly one of the three phone lines.
  sederCrew lists archived men too (seder.js:113 filters nothing but holes), and they are on no line;
- no digit typed ⊇ the row's «בלי טלפון» (`!worker.phone`, roster.js:180-185);
- `zeroStamped` ⇔ the man has a day that `payrollReport` (money.js:210) leaves unpriced while his roster
  carries a daily rate - checked on a copy with his `dailyRate` set to 1, never by new arithmetic;
- W equals `dayCheckIsWorkingDay` date for date (measured equal on all four seeds, probe-final.out and
  rev2/probe-rev2.out, every agreement above held on all four and on the revision-2 fixtures).

**The phone family, on tests/seder.test.mjs's own spellings** (seder.test.mjs:230-249; probe-phones.out;
revision 2 re-read every row and added the critic's, rev2/probe-rev2.out section A):

| typed | sederWaNumber | normalisePhone | here |
|---|---|---|---|
| every usable spelling (052-884-1930, +972 (0)52…, ٠٥٢٨٨٤١٩٣٠, …), and '۰۵۲۸۸۴۱۹۳۰' (Extended Arabic-Indic), '+0528841930' | 9725… | - | on no line |
| '1234', '03-1234567', '052-884-193', '052-884-19301', '0528841930 / 0541234567', '972-3-1234567', '528841930', '٠٥٢٨' | '' | '' or '0…' | `badPhone` |
| revision 2: '8841930' (05 dropped), '52884193' (0 and a digit dropped), '5288419301' (0 dropped, a digit extra), '5551234' (a landline without its area code), '528841930 / 541234567' (two numbers, no zeros), '۰۵۲۸', '+972 3-1234567', '00972 3 1234567', '+05288419', 'O528841930' | '' | anything | `badPhone` |
| '+970 59-123-4567', '+1 212 555 0100', '00970599123456', '+44 7700 900123', '(+970) 59-123-4567' | '' | '970…', '1212…', '44…' | `otherPhone` |
| '', '   ', null, undefined, 'אין', '+' | '' | '' | `noPhone` when he works these days, else nothing |
| KNOWN MISS: '00528841930' - a mobile without its 0 behind a doubled zero, which reads as +52 | '' | '0528841930' | `otherPhone` (pinned as it is) |

Why the split: the seder refuses a +970 number on purpose (pinned, seder.test.mjs:247), so a man who
has only such a number would be «כדאי לבדוק» on every opening with nothing the owner can do - the cry
of wolf this program was judged for. A typo'd Israeli number is the opposite: invisible on the row,
mended in one field. Revision 2: what makes a number foreign is a prefix the owner TYPED - `+` or `00`
and a country that is not 972 - and nothing else. Revision 1 read any normalised form not starting
with 0 as another country's, and `normalisePhone` returns any 7-8 or 10+ digits with no 0 and no 972
as they stand (schema.js:1353-1360), so a dropped 0 put an Israeli typo under «לידיעה», uncounted,
with the calm line standing. The one miss left goes the safe way: an Israeli typo under «לידיעה» -
where the seder's own row still says «אין מספר טלפון תקין» - never a foreign number in the counted tier.

**THE THRESHOLD, measured** (probe-rules.mjs; working days on record, never calendar days - a closure of
the whole business does not make everybody idle). The turnover model: 8 seasons 2026-01-01..11-19, 40 on
the roster - 26 regulars (spells of 1-5 days; 30% with one long leave of 10-35 working days, then back),
5 who leave for good and are never switched off, 4 occasional men (a day with probability 1/15), 2 who
join late, 3 who never work; 6 sites (two finish and stay active, one pauses 20-30 working days);
evenings to 20/09 so that two months of future say who came back. EACH EVENING IS READ AS OF ITSELF
(`asOf` = the evening: probe-rules.mjs's `until`, probe-final.mjs's fourth argument, rev2/probe-rev2.mjs's
`asOf` - all three give these numbers). Read on the whole record instead - the app's reading, right for
the app - a man who comes back later is never idle on an evening before he does, so "of them, a man who
worked again later" is 0.0% by construction (rev2/probe-rev2.out: 1.46 names an evening, 0.0%; the
critic's probe-vacuous.out: 2412 names, 0.0%) and measures nothing:

| threshold | names said idle per evening | of them, a man who worked again later | a man who left, first said (calendar days after his last day, median) | sites said idle that worked again later |
|---|---|---|---|---|
| 13 working days (the day check's 12, continued) | 3.35 | **48.6%** | 16 | 20.3% |
| 18 | 2.69 | 40.0% | 22 | 18.9% |
| **25 (chosen)** | 2.07 | **29.6%** | **31** (max 42) | 16.5% |
| 30 | 1.78 | 23.7% | 37 | 13.8% |
| 40 | 1.37 | 15.3% | 49 | 8.4% |
| 30 calendar days | 2.16 | 31.6% | 30 | 15.9% |

25 working days is "a month" honestly counted: with Saturdays off it is never less than 29 calendar
days, so «לא עבד ב-25 ימי העבודה האחרונים» is true however many holidays fell inside it. On the
turnover model, as of each evening (rev2/probe-rev2.out): of the 40 men who leave, the 33 whose last day
is at least 45 calendar days before the last evening are ALL said idle, at most 42 calendar days after it
(the other 7 left too close to 20/09 for the window to say anything; 2 of them are named anyway); of the
208 regulars, the 17 whose record holds a run of 25 or more working days without a site of theirs are
each said idle, and the 191 whose longest run is 24 or less never are (read off the record: the
generator's PLANNED leave is not the run - one planned leave of 21 is named, seven of 26-34 are not,
rev2/probe-plan.out). The day
check's own seasons (tests/daycheck.test.mjs season(), seeds 11-55, both habits, 898 evenings; no man
there ever leaves, three never work, a finished site stays active and is often opened again): no idle
man on any evening; the check tier empty on **92.0%** of evenings, the rest idle sites (0.08 an evening),
and **61.1%** of those names were sites the model opened again later - revision 1 called them "sites the
model closed and left active", which most of them were not: at 25 working days a site's long pause is
named as readily as its end, and the owner decides (open question 1). The three dormant
men are always and only under «לידיעה» (3.02 an evening). The time-season record (40 regular men, 277
day keys): every line empty. The four seeds at 25: the check tier empty on all four (tests/owes.seed.mjs
and tests/weeklyclose.seed.mjs's ג'מאל בשארה, who "stopped coming" on 22/10, is at 15 and 18 working
days - named at 13, not at 25).

What each seed shows (probe-final.out; the same under revision 2's rules, rev2/probe-rev2.out):
tests/screens.mjs's seed - calm, and (15 working days) the line «עדיין אין 25 ימי עבודה רשומים…»;
«לידיעה»: «בלי טלפון» חאלד סלאמה, נועם פרץ; «… בלי אף יום עבודה רשום» וליד זועבי, אבי דהן, ראמי חורי.
tests/owes.seed.mjs - calm; «בלי טלפון» all nine (that crew keeps no numbers). tests/weeklyclose.seed.mjs
- nothing at all but the line «עדיין אין 25…» (24 working days); the time-season record - nothing at all.

## Permissions and privacy

Every phone reads its own copy. The dialog shows names, and the typed numbers of `badPhone`,
`sharedPhone` and `otherPhone`, on the phone only - the same numbers the crew rows already print. It has
no text door, no picture and no print. Its doors open screens that keep their own rules (the form asks
its own questions at «שמור», roster.js:1110-1219; deletion keeps its blockers, :1376-1409). Synthetic
names and numbers in every suite.

## Entry and navigation

**Where the button is - measured** (dark; light gives the same boxes; the seeded crew of
tests/screens.mjs). How far the first man's row moves down for each place the button could take:

| place | 320 | 320 large | 375 | 375 large | 440 | 440 large | the 240 px lead tests/roster.browser.mjs:73 holds at 390x844 (base 237) |
|---|---|---|---|---|---|---|---|
| a third button in `.crew-tools` | +52 | +60 | +52 | +60 | +18 (two-line labels) | +19 | 289 - **fails** |
| a third in the header's `.crew-shortcuts` | +60 | +18 | +42 | +66 | +42 | +49 | 279 - **fails** |
| a row of its own under `.crew-tools` | +56 | +64 | +56 | +64 | +56 | +64 | 293 - **fails** |
| three on one line (`flex: 1 1 0`) | +18 | +24, every label three lines, 95 px | +18 | +19 | +18 | +19 | moves the two existing buttons' shape |
| at the foot of the men's list | 0 | 0 | 0 | 0 | 0 | 0 | the sites move +66 / +70 (measured with the day check's row; this contract's 20 px margin would make it +72 / +76) |
| **at the foot of the crew screen, after the sites (CHOSEN)** | **0** | **0** | **0** | **0** | **0** | **0** | nothing moves; the document +68 / +72 (revision 2, this contract's own rules) |

The first man stands 3 px inside the lead the crew list is held to, so nothing can go above him. At the
foot, MEASURED WITH THIS CONTRACT'S OWN RULES (revision 2, rev2/probe-entry-rev2.mjs + .out + entry-rev2.json:
`.crewcheck-row` and `.btn-secondary.crewcheck-entry` alone, the design.css block and the large.css
restatement below put into the page; revision 1's probes had borrowed `daycheck-row` and `daycheck-entry`,
whose 14 px margin and missing cap gave +62 / +66 and 1068 px at 1100): every node of `#rosterView`
before the row stands where it stood; the document grows by +68 (+72 with the mode) in both schemes;
the button is 296 x 48 at 320, 351 x 48 at 375, 366 x 48 at 390, 416 x 48 at 440 (x 52, 20/600 with the
mode), its words on one line at every width; at full scroll its bottom is 72-106 px clear of the tab bar
(93 / 94 / 72 off at 320 / 375 / 440; 106 / 105 / 106 with the mode) and `elementFromPoint` at its centre
is the button - tests/smoke.mjs:4548-4569's "the last button on the roster clears the tab bar and can be
pressed" then measures THIS button, and holds. At 1100x800 (two columns) the row spans both and the
button is capped: 520 x 48, measured. `[hidden]` with its rule takes no room.

- **The host**: a static, empty `<div class="crewcheck-row" id="crewCheckFoot" hidden></div>` in
  index.html inside `#rosterView`, directly after the `.roster-columns` element (closes at :234), with a
  comment. `js/ui/crewcheck.js`'s `renderCrewCheckEntry()` builds `button#crewCheckEntry.btn-secondary.crewcheck-entry`
  (words `CREW_CHECK_TEXT.entry`, `aria-haspopup="dialog"`, `onClick: openCrewCheck`) ONCE and keeps the
  same node across every later draw - so js/ui/modal.js's remembered opener (modal.js:143-162) is still
  on the page when a dialog it led to closes - and sets `host.hidden = State.schedule.workers.length === 0`
  (the empty crew keeps exactly «+ הוסף עובד», «📋 הדבק רשימה», «+ הוסף אתר», tests/polish.browser.mjs:209).
  `.crewcheck-row[hidden] { display: none }` is required: the row's own `display: flex` would beat the
  attribute (app.css:1812 says it for the search and the reorder button).
- **The hooks, in js/ui/roster.js only**: `renderRoster()` (roster.js:28-40) gains, after
  `renderVehicleList()`, `if (typeof renderCrewCheckEntry === 'function') renderCrewCheckEntry();` and
  `if (typeof renderCrewCheckIfOpen === 'function') renderCrewCheckIfOpen();`. NOT js/app.js: the dialog
  opens only from the crew screen and every door closes it, so while it is open the view is `'roster'`
  and `render()` reaches it through `renderRoster` (app.js:131) - a snapshot from another phone redraws
  it. A build without the file draws the crew screen exactly as before (criterion 10). And
  `renderPlaceList` gains `row.dataset.placeId = place.id;` after the row is made (roster.js:756) - the
  site door's way to find its row, the twin of `row.dataset.workerId` (:149); no rectangle changes.
- **The frame**: a static `.modal#crewCheckModal > .modal-content` in index.html directly after the
  `#dayCheckModal` frame (ends :957), its twin: `h3#crewCheckTitle[tabindex=-1]` first,
  `p#crewCheckContext.picker-context`, `div#crewCheckList.daycheck-list`, `p#crewCheckLead.daycheck-lead`,
  then `div.daycheck-foot > button#crewCheckClose.btn-secondary[onclick="closeCrewCheck()"]`. Words set by
  JS. `MODAL_CLOSERS.crewCheckModal: () => closeCrewCheck()` directly after the `dayCheckModal` row
  (js/ui/modal.js:40). The frame exists at boot (watchModals observes only the `.modal`s present then,
  modal.js:165-167).
- **The script**: `<script src="js/ui/crewcheck.js"></script>` directly after the `js/ui/daycheck.js` tag
  at index.html:1170, BEFORE the comment that opens at :1171 (the הסעות note, :1171-1174 - a tag put
  after :1171 lands inside that comment and never loads, and roster.js's `typeof` guards would hide it:
  revision 2 corrects revision 1's ":1171"), with a comment: after seder.js and daycheck.js because its borrowed words are read
  from their blocks at load; it runs nothing else at load; roster.js asks for it by name only when the crew
  screen is drawn. `'./js/ui/crewcheck.js'` in sw.js SHELL directly after `'./js/ui/daycheck.js'` (:105).
- **Open**: `openCrewCheck()` reads in the tap (single milliseconds - no placeholder, no after-paint),
  draws, shows the frame, forces layout and focuses `#crewCheckTitle` (openDayCheck's rule,
  daycheck.js:359-369). **Close**: `closeCrewCheck()` hides it and, one task later, gives the focus to
  `#crewCheckEntry` only if nothing else took it (closeDayCheck's rule, daycheck.js:371-390).
  **Redraw**: `renderCrewCheckIfOpen()` reads again, keeps `.modal-content.scrollTop`, and gives the
  focus back to the chip that had it, found by comparing `data-crewcheck-focus` (`kind:w:id` /
  `kind:p:id`) - never by a selector built from an id. Names are buttons only while the crew screen is
  the view (`currentView === 'roster'`), plain `.daycheck-plain` otherwise - for a later screen that
  embeds `renderCrewCheckInto` (daycheck.js:439-441's rule).
- **The doors** - each closes the dialog first; what follows depends on what the target is (modal.js
  gives the focus back to the opener at the microtask after the block that shut the last dialog,
  modal.js:143-162). None writes. A man or site no longer in the record when the chip is pressed: nothing
  opens (findGo's rule, find.js:290-291).

| door | for | kind | action |
|---|---|---|---|
| form | `noRate`, `badPhone`, `sharedPhone`, `sameName`, `otherPhone`, `noPhone` | a `.modal`: SAME task, focused by hand (modal.js never sees a moment with no dialog, so it does not enter the form - sitecard.js:507-519, find.js:304-309) | `closeCrewCheck(); editWorker(id)` (roster.js:1033 - the form «עריכת עובד» exactly as «עוד ⋯» ← «עריכת פרטים» opens it); for a number `#workerFormMore.open = true` (index.html:732 - the fold editWorker leaves shut for a man with no number, roster.js:1054-1055); the layout forced (`void modal.offsetHeight` - a field that was display:none a line ago cannot take the focus, openDayCheck's rule, daycheck.js:364-367); then `#workerFormDaily` (:728) / `#workerFormPhone` (:735) / `#workerFormName` (:726) `.focus({ preventScroll: true })` and `scrollIntoView({ block: 'nearest' })`. On iOS the keys rise for the field he came to mend - the point of the door. Nothing is written unless he presses «שמור» (saveWorkerForm, roster.js:1092, its own questions) - and a press of it inside the hold below is not his; «ביטול» writes nothing and modal.js then gives the focus to `#crewCheckEntry` |
| his row | `idle`, `never`, `zeroStamped` | not a dialog: ONE TASK LATER, `closeCrewCheck(); setTimeout(land, 0)` (whatsNewGo's rule, whatsnew.js:597-609) | if the crew search holds words and his row is not drawn, the field is emptied WITHOUT focus (`value = ''; renderWorkerList()` - never `clearRosterSearch`, which focuses it and raises the keys, roster.js:56-62); his `#workerList .roster-row` (found by `dataset.workerId`) `scrollIntoView({ block: 'center' })`, takes `.crewcheck-here` for 2,500 ms, and its «כרטיס עובד» (`.worker-card-open`, roster.js:160-166) - or «עוד ⋯» (`.crew-edit`, :239) on a build without workercard.js - takes the focus, `preventScroll`. NEVER the «פעיל» switch (:231-238): a press there is a write, and it is the archive action the owner is being taken to, not given - and the switches are HELD for a moment after landing (below) |
| the site's row | `idleSites`, `neverSites` | the same, one task later, and the same hold | its `#placeList .roster-row` (found by the new `dataset.placeId`), centred, `.crewcheck-here`, focus on «כרטיס אתר» (`.site-card-open`, roster.js:772-779) or «עוד ⋯» (:783), where «הסתרת האתר מהרשימה» is |

**THE SLOW SECOND TAP** (revision 2). The page's own rule spends a press that repeats the one before it
only under `WALK_BOUNCE_MS` (300 ms, sheet.js:113, :207-208). A second touch 300-700 ms after the chip
comes down on whatever the door put there: after a row or site door has scrolled the crew list, about 4-5%
of the glass is a «פעיל» switch (4.1% at 320x568, 4.9% with the mode, 4.4% at 375, 4.1% at 440 - the
critic's probe-landing2.mjs, its method checked: a 4 px grid of `elementFromPoint`), most of them OTHER
men's, and one press there archives a man with no question and no undo (`setWorkerArchived(id, true,
true)`, roster.js:232-235; the question only when `!quickToggle`, :1438; `commitRoster`, :1553). After a
form door, the same touch can land on the form's «שמור», which saves the row as the form reads it - a
roster commit (saveWorkerForm, roster.js:1092, :1252) with nothing asked for a man with no clash. So
`crewCheckGo(chip)`, for a row, site or form door, sets `crewCheckHoldUntil = (openPress() ? openPress().stamp
: sheetClock()) + DOUBLE_TAP_GUARD_MS` (sheet.js:231/123; day.js:117, 700 ms - the trays' window for "a
control of another kind"; every one of those names behind `typeof` - a page without js/ui/sheet.js or
js/ui/day.js, or a harness device, gets no hold and the doors are exactly revision 1's), and installs -
once each, lazily - the house's own guard
(`guardFingersOn`, sheet.js:291: capture on the surface; a finger's or a mouse's mousedown, mouseup and
click on a listed control stopped while held; a keyboard's click never):
`guardFingersOn(document.getElementById('rosterView'), '.worker-active-toggle', press => press.stamp < crewCheckHoldUntil)`
(«פעיל», and an archived row's «כבוי» restore, are both `.worker-active-toggle`, roster.js:232-235) and
`guardFingersOn(document.getElementById('workerFormModal'), 'button[onclick="saveWorkerForm()"]', press => press.stamp < crewCheckHoldUntil)`.
The predicate reads the PRESS's own time (`pressOf`, sheet.js:235 - the second touch's pointerdown), not
the clock at its click: a touch that comes down at 650 ms is released and clicked after 700, and a
clock-time test would let it through. Neither surface is guarded by anything else (`guardFingersOn` is
called only on the assign sheet and the two pickers, sheet.js:335/697/921), so the install is not a
no-op; a press that comes down later than 700 ms after a crew-check door's chip is what it always was.
Nothing in roster.js changes.

## The screen, section by section, in this order

PROPOSED words live in ONE frozen block `CREW_CHECK_TEXT` at the top of `js/ui/crewcheck.js`, pinned
word for word in tests/crewcheck.test.mjs; BORROWED words in `CREW_CHECK_REUSED`, each found verbatim in
its owner's source by the suite. A name is `isolate(name)`; a number `isolateLtr(typed.trim())`; a date
`formatShortDate` when its year is today's, else `formatFullDate`. The constant `CREW_CHECK_IDLE_DAYS = 25`
is one line with its measured comment. Never «נשלח», and never a word that says a man left («עזב»,
«עזבו», «סיים», «הפסיק»): the record says only that he did not work.

0. **Title** `CREW_CHECK_TEXT.title` = **«בדיקת הצוות»** (PROPOSED; also `.entry`, the button's words).
1. **Context** (`#crewCheckContext`): `` `${hebrewDayName(d)} ${formatFullDate(d)} · ${CREW_CHECK_TEXT.counts(men, sites)}` ``
   with `counts` = **`` `עובדים פעילים: ${men} · אתרים פעילים: ${sites}` ``** (PROPOSED) - e.g.
   «יום חמישי 19/11/2026 · עובדים פעילים: 40 · אתרים פעילים: 6».
1a. **Too few days** (revision 2), FIRST in the list and only when `since` is null (W holds fewer than
   `CREW_CHECK_IDLE_DAYS` working days - the first five weeks of every install, the tests/screens.mjs
   seed): `p.crewcheck-note` **`` `עדיין אין ${days} ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב.` ``**
   (PROPOSED; `days` = `CREW_CHECK_IDLE_DAYS`) = «עדיין אין 25 ימי עבודה רשומים, ולכן לא נבדקו עובדים
   ואתרים בלי עבודה זמן רב.» - so the calm line under it is not read as "nobody has been away".
2. **The calm line**, when «כדאי לבדוק» is empty: **«✓ לא נמצא בצוות דבר שכדאי לבדוק.»** (PROPOSED;
   `.daycheck-clean`).
3. **«כדאי לבדוק»** (BORROWED, `DAY_CHECK_TEXT.headCheck`) - each finding a sentence (`.daycheck-say`),
   then its chips (`.daycheck-chips`), in this order:
   - `noRate` (PROPOSED, revision 2): one **«בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר:»**, many
     **«בלי שכר יומי - ימי העבודה שלהם לא יחושבו בשכר:»** - true of the days already recorded and of
     the days to come, while he has no rate. (Revision 1's «ימים שיירשמו לו…» spoke of future days only:
     false for a man with no rate at all, whose recorded days are unpriced now and are priced once a rate
     is typed - money.js:53-67, the critic's probe-norate-fix.out: null, then 1350 - and silent about the
     hourly-only man's stamped days, which stay unpriced: those are `zeroStamped`'s line.)
   - `badPhone` (PROPOSED around the seder's words, `SEDER_TEXT.noPhone` BORROWED): one
     **`` `${SEDER_TEXT.noPhone} - המספר שנרשם לו לא ייפתח בוואטסאפ:` ``** = «אין מספר טלפון תקין - המספר
     שנרשם לו לא ייפתח בוואטסאפ:», many **«אין מספר טלפון תקין - המספרים שנרשמו להם לא ייפתחו בוואטסאפ:»**;
     chip **`` `${name} · ${number}` ``** (PROPOSED template).
   - `sharedPhone`, one finding per number (PROPOSED, with the row's «מספר משותף» BORROWED):
     **`` `מספר משותף - ${number} רשום אצל ${count} עובדים פעילים:` ``** (`number` = the first man's
     phone as he typed it, trimmed and LTR-isolated; the group is keyed by `normalisePhone`, so
     052-884-1930 and +972 52 884 1930 are one finding - and regrouped by the seder's number when every
     number of it opens, so '٠٥٢-884-1930' and '٠٥٣-884-1930' are none); chips: the names.
   - `sameName`, one finding per name (PROPOSED, with the row's «שם כפול» BORROWED):
     **`` `שם כפול - ${count} עובדים פעילים בשם ${name}:` ``**; chips **`` `${name} · ${n}` ``**.
   - `idle` (PROPOSED): one **`` `לא עבד ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל:` ``**,
     many **`` `לא עבדו ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים:` ``** (`days` =
     `CREW_CHECK_IDLE_DAYS`, `since` = S); chips **`` `${name} · ${lastDay}` ``**; under the chips, quiet
     (`p.crewcheck-note`), a PROPOSED condition and then the archive question's own sentence (BORROWED,
     roster.js:1442), one line: **«אם מכבים עובד בכפתור «פעיל»:»** (PROPOSED, `CREW_CHECK_TEXT.archiveIf`;
     «פעיל» is the switch's own word, roster.js:232) + ' ' + «הימים שכבר נרשמו יישמרו, והעובד לא יופיע
     ברשימה היומית.» (BORROWED, `CREW_CHECK_REUSED.archiveSays`) = «אם מכבים עובד בכפתור «פעיל»: הימים
     שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.» - the row he is taken to switches a man off with
     no question, so what that does is said before he gets there. Revision 2: alone, the borrowed sentence
     - the BODY of «להסתיר זמנית את X?» (roster.js:1439-1449) - read as a fact about the men listed above
     it («the check took them off the list»), and in the singular under a plural list; the condition makes
     it the answer to its own question, and the generic «עובד» fits one man or many.
   - `idleSites` (PROPOSED, revision 2 - the site named as the subject, as `neverSites` names it): one
     **`` `אתר שלא נרשמה בו עבודה ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל:` ``**,
     many **`` `אתרים שלא נרשמה בהם עבודה ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים:` ``**;
     chips **`` `${site} · ${lastDay}` ``** with `.daycheck-site`'s drawn square (never the site's colour).
     (Revision 1's «לא נרשמה בו…» had no antecedent for «בו»: the site appears only in the chips.)
4. **«לידיעה»** (BORROWED, `DAY_CHECK_TEXT.headInfo`), never counted:
   - `otherPhone` (PROPOSED, revision 2): one **«מספר שאינו נייד ישראלי - אי אפשר לפתוח לו הודעה בוואטסאפ:»**,
     many **«מספרים שאינם ניידים ישראליים - אי אפשר לפתוח להם הודעה בוואטסאפ:»**; chip
     `` `${name} · ${number}` ``. (Revision 1's «ההודעה לא תיפתח לו» named a message that is not there;
     the second half is now noPhone's own.)
   - `noPhone` (PROPOSED, with the row's «בלי טלפון» BORROWED): one **«בלי טלפון - אי אפשר לפתוח לו הודעה בוואטסאפ:»**,
     many **«בלי טלפון - אי אפשר לפתוח להם הודעה בוואטסאפ:»**; chips: names.
   - `zeroStamped` (PROPOSED, revision 2): one **«ימים שנרשמו לו בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר:»**,
     many **«ימים שנרשמו להם בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר:»**; chip **`` `${name} · יום אחד` ``**
     for one day, **`` `${name} · ${n} ימים` ``** for more (PROPOSED; the day check's `awayDays` template is
     not borrowed - it is never asked for one day, and «1 ימים» is not Hebrew). It promises nothing and
     asks for nothing: it is the reason the pay sheet (reports.js:2190-2194) and wave 1's «יום תשלום»
     can still say «בלי שכר יומי» about him after his rate is typed, for a period that holds those days
     (Interplay, below).
   - `never` (PROPOSED): one **«פעיל בלי אף יום עבודה רשום:»**, many **«פעילים בלי אף יום עבודה רשום:»**.
   - `neverSites` (PROPOSED): one **«אתר פעיל בלי אף יום עבודה רשום:»**, many **«אתרים פעילים בלי אף יום עבודה רשום:»**.
5. **The lead**, under the list (`#crewCheckLead`, BORROWED, `DAY_CHECK_TEXT.lead`): «הבדיקה רק מראה מה
   כדאי לבדוק. היא לא משנה ולא שומרת דבר.»
6. **«סגור»** (BORROWED, `DAY_CHECK_TEXT.close`) in the sticky foot.

Read aloud (`aria-label`, PROPOSED): a form door **`` `עריכת הפרטים של ${name}` ``**, a row door
(`idle`, `never`, `zeroStamped`) **`` `הצג את ${name} ברשימת העובדים` ``**, a site door
**`` `הצג את ${name} ברשימת האתרים` ``**; a chip
that says more than the name says the chip first (`` `${chip} - ${go}` ``, dayCheckWorkerChip's rule,
daycheck.js:501-509).

## Floors and looks

- 320x568, 375x667, 440x956 (and 1100x800 for the button's width); both schemes; «תצוגה גדולה» on and
  off; doubled text (`doubleEveryFontSize`, tests/mobile.test.mjs:755-842). No sideways scroll; the last
  chip and «סגור» reachable.
- App floors: 44 x 44 targets (the button 48 tall, a chip `.daycheck-go` 44 x 44), no letter under 14 px
  (context, heads, the lead and the note 14; sentences 15; chips 16; the button 16/600), 4.5:1 on the
  ground really painted. Large: ≥ 18 px, ≥ 500, 7:1, 52 x 52.
- **The dialog's body is the day check's look** - the same kind of thing gets the same look, and its
  sizes are already restated (large.css:701-709): `.daycheck-list/-clean/-group/-check/-info/-head/
  -finding/-say/-chips/-go/-site/-plain/-lead/-foot`. Safe to share: tests/daycheck.browser.mjs scopes
  every one of its queries to its own modal (:158-177, :484, :632-635). The ENTRY does not share
  `.daycheck-entry`: tests/largetext.browser.mjs:189 asks `document.querySelector('.daycheck-entry')`
  unscoped.
- **The new rules**: css/design.css, inside `@media screen`, ONE commented block directly after the day
  check's (after design.css:805): `.crewcheck-row { display: flex; margin: 20px 0 4px; }`,
  `.crewcheck-row[hidden] { display: none; }`, `.crewcheck-entry { flex: 1 1 auto; max-width: 520px;
  min-height: 48px; font-size: 16px; font-weight: 600; }`, `#crewCheckModal .modal-content { padding-bottom: 0; }`,
  `#crewCheckModal .modal-content > h3 { line-height: 1.3; margin: 0 0 4px; overflow-wrap: anywhere; }`,
  `.crewcheck-note { margin: 8px 0 0; color: var(--ink-2); font-size: 14px; line-height: 1.45; }` (the
  idle note and, revision 2, the too-few line - the list's first child, where the flex gap spaces it),
  `.crewcheck-here { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 8px; }` (no
  animation). css/large.css block 3, directly after large.css:709, one for one with the originals'
  importance: `.crewcheck-entry { font-size: 20px; font-weight: 600; }`, `#crewCheckModal .modal-content > h3 { line-height: 1.4; }`,
  `.crewcheck-note { font-size: 18px; line-height: 1.45; }`. No colour of its own; no `--site-N`.

## Performance budget

| what | budget | measured on this base | how measured |
|---|---|---|---|
| `crewCheckRead` on the time-season record (40 men, 277 day keys, 703 KiB) | ≤ 30 ms median of 25 | 8.9 ms (3.7 ms as a single pass without the day check's helpers); revision 2's reading, with `ratesForDay` on every record with a site: 11.0 ms (max 23.0) | Node, tests/crewcheck.test.mjs, printed |
| `crewCheckRead` on 60 men x 329 day keys (1,149 KiB) | ≤ 120 ms median of 15 | 40.6 ms; revision 2's reading 16.2 ms (max 25.2) - the container's load differs between the two runs, which is why the budget is a ceiling and not the number | Node, same suite |
| the same reading in Chromium, 40 men x 277 day keys | ≤ 60 ms median at CPU x4 | 1.8-2.2 ms unthrottled, 10.2-13.4 ms at x4 (revision 1's reading; revision 2's is not re-measured in Chromium - the builder's suite prints it) | browser, `Emulation.setCPUThrottlingRate` |
| tap → the dialog painted with its list, that record, CPU x4 | ≤ 300 ms | (the builder measures) | browser, `requestAnimationFrame` after the tap |
| a draw of the crew screen with the dialog shut | 0 calls to `crewCheckRead` over 10 draws; the entry the same node | - | spy |
| a draw with the dialog open | exactly 1 call | - | spy |

## Success criteria

New suites: `tests/crewcheck.test.mjs` (`test:crewcheck`, appended to `npm test`) and
`tests/crewcheck.browser.mjs` (`test:crewcheck-browser`, appended to `test:all`); rows in tests/README.md.
No new helper file (the seasons are copied into the Node suite, as the day check's are).

Node (harness devices from tests/harness.mjs, with js/ui/seder.js, js/ui/daycheck.js and
js/ui/crewcheck.js run into each device's context; synthetic names):
1. **Each rule** fires on the fixture made for it and is silent on its near miss: last on a site exactly
   25 working days back → idle, 24 → not; last site tomorrow → neither idle nor «never»; absences only →
   «never»; an archived man on no line, his days still working days, his site still in use; a site with
   only Rima counts, or only יוסף גבס counts, after S → not idle; Rima-only and YG-only dates are not
   working days; a nine-working-day closure moves S back by nine and makes nobody idle; a Saturday with
   work is a working day; fewer than 25 working days → S null and nothing idle; dailyRate 0, '', '0',
   undefined, -5 and hourly-only → `noRate`. Revision 2: `asOf` - a key after it changes nothing of the
   reading (L, W, `zeroStamped`), and without it a day tomorrow keeps a man from idle; `zeroStamped` - an
   hourly-only man with three recorded days → `noRate` AND `zeroStamped · 3 ימים`; his rate typed → `noRate`
   gone, `zeroStamped` still 3; a man with no rate at all and three days → `noRate` and no `zeroStamped`
   (his days carry no stamp); one such day → the chip says «יום אחד»; a stamped day later cleared
   (`clearWorkerDay`) or marked absent is no longer a day with a site and is not counted.
2. **The phone family** on tests/seder.test.mjs's spellings, the three of probe-phones.mjs and every
   row revision 2 added, exactly as the table above (rev2/probe-rev2.out section A) - '8841930',
   '52884193', '5288419301', '5551234' and '528841930 / 541234567' `badPhone`; '+44 7700 900123' and
   '(+970) 59-123-4567' `otherPhone`; '۰۵۲۸۸۴۱۹۳۰' (a full Extended Arabic-Indic mobile) on no line;
   '۰۵۲۸' `badPhone`; '+' no digit; '00528841930' `otherPhone`, pinned as the known miss.
3. **The agreements** on the four seeds (tests/screens.mjs's seed rebuilt in Node, tests/owes.seed.mjs,
   tests/weeklyclose.seed.mjs, the time-season record) and on fixtures with duplicates: `sameName` ⇔
   `hasDuplicateName`; `sharedPhone` ⇔ `workersSharingPhone ∩ active ≠ ∅`, but the regrouped exception
   ('٠٥٢-884-1930' and '٠٥٣-884-1930' on two active men: no finding, while `samePhone` says true -
   pinned both ways, and a third man on '٠٥٢-884-1930' makes ONE finding of the two who share it);
   `badPhone ∪ otherPhone ∪ no digit` ⇔ `sederWaNumber === ''`, and every ACTIVE man on today's and
   tomorrow's `sederCrew` with `number === ''` is on exactly one of the three phone lines - with its near
   miss: an archived man with no phone and a site tomorrow is on tomorrow's `sederCrew` with `number ''`
   and on no line (the critic's probe-seder-archived.out; rev2/probe-rev2.out); `zeroStamped` ⇔
   `payrollReport` unpriced over one of his days on a copy with his `dailyRate` set to 1; W ≡
   `dayCheckIsWorkingDay`.
4. **Tiers**: the calm line exactly when «כדאי לבדוק» is empty; «לידיעה» never counted; the too-few line
   drawn exactly when W has fewer than 25 days (`since === null`) - on the screens.mjs seed (15) and the
   weeklyclose seed (24), not on the owes seed (30); the order of the findings and of the chips (roster
   order); `crewCheckFindings(read, today)` - the flat list the dialog draws - equal to its documented
   shape.
5. **Words**: every PROPOSED string pinned word for word, each singular and plural - revision 2's among
   them: `tooFew`, `archiveIf` (and the note as one line: `archiveIf` + ' ' + `archiveSays`), the new
   `noRate`, `idleSites` and `otherPhone` pairs, the `zeroStamped` pair and its two chips («יום אחד», «${n}
   ימים»), and the «מה חדש» text handed to the integrator; every BORROWED found
   verbatim in js/ui/daycheck.js, js/ui/seder.js and js/ui/roster.js; names FSI…PDI, numbers LRI…PDI,
   dates dd/mm this year and dd/mm/yyyy otherwise; no «נשלח», «עזב», «עזבו», «סיים», «הפסיק» in the block;
   tests/reportnames.test.mjs's Hebrew-and-Arabic scan green over the new file.
6. **Nothing written**: the whole disk (`device.dump()`) byte for byte across `crewCheckRead`,
   `crewCheckFindings` and every door run against recording stubs; `State.commit`, `commitMany`,
   `commitRoster`, `save`, `Store.set`, `setVerified`, `remove` called 0 times.
7. **Quiet where nothing is wrong** - EVERY EVENING READ AS OF ITSELF, `crewCheckRead(schedule, evening,
   'actual', evening)` (revision 2: read on the whole record, the share below is 0.0% by construction and
   can fail on no threshold; never a deep copy of the record per evening): the day check's seasons (its
   generator copied, mulberry32, seeds 11-55, both habits) - no idle man on any evening, the check tier
   empty on ≥ 85% of evenings (measured 92.0%), the dormant men only under «לידיעה»; the time-season
   record - every line empty; the turnover model (8 seeds, evenings to 20/09) - of the names said idle at
   most 35% work again later (measured 29.6%); every man who left whose last day is at least 45 calendar
   days before the last evening is said idle, within 45 calendar days of it (measured: 33 of the 40, all
   33 said idle, max 42; the other 7 are out of the window's reach, and the suite counts them apart); no
   regular is ever said idle whose record holds no run of 25 or more working days without a site of his
   up to the last evening, and every regular whose record holds one is (measured: 17 of 208 said idle,
   each with such a run; the 191 others' longest run is 24) - the run counted on W, off the record, never
   off the generator's planned leave (rev2/probe-plan.out: the two differ). And the whole-record reading printed beside
   it (0.0%), so that the reason for `asOf` stays on the page. The measured shares printed.
8. **The cost** rows of the budget (Node), printed.
9. **Not in a draw** - on a DOM that holds nodes (revision 2: the harness's document answers null to
   every id, tests/harness.mjs:197-200, so `crewCheckIsOpen()` could never be true there and the entry
   never built, and "0 calls" would pass testing nothing): tests/moneydom.mjs's `makeDom()` with
   `#crewCheckFoot`, `#crewCheckModal`, `#crewCheckTitle`, `#crewCheckContext`, `#crewCheckList`,
   `#crewCheckLead` and `#crewCheckClose` registered (`dom.register`, the way tests/sitecard.test.mjs:33,
   :77-83 runs its card - the critic named tests/nodes.mjs, which has no registry), roster.js's own lists
   left unregistered so renderWorkerList and renderPlaceList take their null branch, and `crewCheckRead`
   wrapped by a counting spy in the device's context. `renderRoster()` 10 times with the dialog shut - 0
   calls, the entry the same node (`firstChild` identical), `host.hidden` false with men and true with
   none; open - exactly one call per draw. The same three facts once more in tests/crewcheck.browser.mjs,
   with a spy on `window.crewCheckRead` on the real page.

Browser (tests/crewcheck.browser.mjs: Chromium with touch, Asia/Jerusalem, the boilerplate of
tests/monthsummary.browser.mjs:19-33, a synthetic crew written through the model's writers - at least 45
working days, one man of every kind, an idle site and a never-used site):
10. **The entry**: `#crewCheckEntry` «בדיקת הצוות» in `#crewCheckFoot` after the sites, none with no men
    (the empty crew's buttons exactly as tests/polish.browser.mjs:209 holds them); at 320/375/440 x
    dark/light x mode off/on every other node of `#rosterView` has the same rectangle with the file and
    without it (`renderCrewCheckEntry = undefined`, host emptied); the document taller by the row only
    (≤ 80 px); the button ≥ 48 px (52 with the mode) with its words inside; at full scroll wholly above
    the tab bar and pressable (`elementFromPoint`); ≤ 520 px wide at 1100x800.
11. **The dialog**: entered at its title; Escape, the backdrop and «סגור» close it and give the focus to
    `#crewCheckEntry`; Tab stays inside; `midEdit()` true while open (v205 updates only when it is
    false), false after; the words on the glass are the too-few line when `since` is null, then
    `crewCheckFindings`'s, in order.
12. **Every door** lands where the table says: a form door opens `#workerFormModal` for that man
    (`#workerFormName`'s value is his name) with its field focused and on the glass («עוד פרטים» open for
    a number); a row door, one task after the dialog shut (a stub called in that task sees the dialog
    already shut), puts his row on the glass clear of both bars, his «כרטיס עובד» focused (never the
    switch), `.crewcheck-here` on the row - for `idle`, `never` and `zeroStamped` alike; a site door the
    same; with words in the crew search the row door empties the field (not focused) and lands; a man
    removed meanwhile opens nothing.
13. **Nothing written**: every localStorage key but `farkad:openBuilds` byte for byte (tests/census.mjs)
    and `JSON.stringify(State.schedule)` the same across opening, every door (the form left by «ביטול»)
    and closing; a DOUBLE TAP (touch) on a row door and on a form door changes no byte - the second press
    is the page's to spend (sheet.js `WALK_BOUNCE_MS`), and no «פעיל» switch turns. AND A SLOW ONE
    (revision 2): after a row door, a site door and a form door, a touch whose press comes down 350, 500
    and 650 ms after the chip's - at the chip's own point, and on the centre of a «פעיל» switch on the
    glass (the landed man's and another man's, each found with `elementFromPoint` before the touch, so the
    check cannot pass on a point where no switch is), and for the form door on «שמור» - turns no switch,
    leaves the form open and changes no byte. In a block of its own, a touch on a switch coming down
    `DOUBLE_TAP_GUARD_MS` + 100 ms after the chip is let through (the switch turns, and the block puts it
    back) - the hold is a window, not a lock; and a keyboard's Enter on a switch inside the window is let
    through too.
14. **A commit under the open dialog** (a roster from another phone adopted: a rate set, a man switched
    off) redraws the list: the line gone, the scroll kept, the focused chip kept while it stands.
15. **Floors** on both screens of tests/screens.mjs at every phone, scheme and mode and at doubled text
    (the ruler, `measureInPage`, tests/screens.mjs:567-843); no sideways scroll; nothing cut. Revision 2:
    between them the two entries now draw EVERY line, chip and class of the dialog - the too-few line and
    the idle note (`.crewcheck-note`), idle and idle-site chips, `neverSites`, `zeroStamped` - so
    tests/largetext.browser.mjs and the readability audit, which walk SCREENS only (:150-175), measure them
    all; the suite asserts that each `kind` and `.crewcheck-note` is on the glass in one entry or the other.
16. No uncaught error, no browser dialog.

## Existing suites touched

- `tests/screens.mjs`, two entries directly after 'crew - reorder' (:307-309), both opened through the
  app's own functions and closed back:
  `{ name: 'crew - «בדיקת הצוות», calm', scope: ['#crewCheckModal'], open: view('roster') then openCrewCheck(), close: closeCrewCheck() }`
  (the seed as it is, 15 working days: the too-few line, the calm line, «לידיעה» noPhone 2 + never 3) and
  `{ name: 'crew - «בדיקת הצוות», with findings', scope: ['#crewCheckModal'] }` - IN MEMORY ONLY, the
  owesRecord pattern (screens.mjs:198-226), every change by the model's own writers on the live
  schedule and nothing committed: keep `JSON.stringify({ workers, places })` on `window`; FIRST set w02's
  dailyRate 0 (before any day is added, so that the day below is stamped with it), then w03's phone
  '03-5551234', w05's phone to w01's, w04's phone '+970 59-123-4567', w13's name to w12's; push two
  in-memory sites, `p6` 'חדרה - בית הספר' and `p7` 'כפר סבא - מרכז'; and on the ELEVEN days from
  Sunday 11/10 to Thursday 22/10/2026, every day but Saturday 17/10 (keys the seed does not hold - it
  starts on 23/10) `assignPlace`: w14 on p6 on 11/10 only, w01 on p1 on the other ten, and w02 on p1 on 12/10
  (stamped `{ daily: 0, hourly: 50 }`). W is then 26 days, S = 12/10, and w14's one day and p6's lie
  before it. `render(); openCrewCheck()`; close: `closeCrewCheck()`, delete those eleven keys, put
  workers and places back, `render()`. (Revision 2: revision 1's seed drew neither `idle`, `idleSites`
  nor `neverSites` - S was null - so `.crewcheck-note` was never on the glass of the large display's
  gate. The critic's recipe, w14 working on ten added days, would not make him idle: with the seed's
  fifteen days after his last, 25 working days must follow it - hence eleven days and his on the first.)
  Expected, measured (rev2/probe-rev2.out, section B): «כדאי לבדוק» - noRate עלי חסן; badPhone מוחמד
  אבו ראס חוסיין · 03-5551234; sharedPhone (0520000010) דוד כהן + אחמד נסאר; sameName וליד זועבי · 1,
  וליד זועבי · 2; idle ראמי חורי · 11/10 («מאז 12/10») with its note; idleSites חדרה - בית הספר · 11/10.
  «לידיעה» - otherPhone יוסי מזרחי · +970 59-123-4567; noPhone חאלד סלאמה, נועם פרץ; zeroStamped עלי
  חסן · יום אחד; never וליד זועבי, וליד זועבי; neverSites כפר סבא - מרכז. Every kind of the dialog is
  drawn by one entry or the other.
- Stay green with no expectation moved: roster-browser (the 240 px lead, 125 px rows, 44 px at
  320/390/430/1100 and doubled), polish-browser, sitecard-browser (the data attribute moves no
  rectangle), workercard-browser, smoke (its last-button-on-the-roster checks now meet this button, and
  hold), mobile, design-browser, largetext + largetext-browser (BASE unchanged; the two new entries
  walked), daycheck + daycheck-browser, doubletap-browser, scroll-browser, seder, find, reportnames,
  nonassertions, isolation (no absolute paths in the new suites), gate-integrity (but its stamp section),
  build (but its stamp checks).

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-crewcheck`; worktree
  `/home/user/farkad/.claude/worktrees/feat-crewcheck`; `npm ci` there.
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the commit
  that moved the bytes» (and its sw.js line) and tests/gate.integrity.test.mjs §4.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`
  (or `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`); never `playwright install`; no
  emulator suites. Commit after every step; never `--amend`; every commit ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`. No push, no PR.

## Files

New: `js/ui/crewcheck.js`, `tests/crewcheck.test.mjs`, `tests/crewcheck.browser.mjs`.

Changed, and only as said: `index.html` (the host after :234, the frame after :957, the script after
:1170 - the daycheck.js tag - and before the comment at :1171), `sw.js` (SHELL after :105), `js/ui/roster.js` (renderRoster's two guarded lines; renderPlaceList's
one attribute), `js/ui/modal.js` (one MODAL_CLOSERS row after :40), `css/design.css` (one block after
:805), `css/large.css` (three restatements after :709), `tests/screens.mjs` (two entries after :309),
`package.json`, `tests/README.md`.

MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`, `js/recovery.js`,
`firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three stamps (index.html:109,
js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`, `js/ui/whatsnew.js`, `js/ui/offline.js`;
`js/app.js` (not needed); `js/ui/daycheck.js` and `js/ui/seder.js` (read and borrowed, never changed);
every wave-1 file (`js/ui/status.js`, `js/ui/payday.js`, `js/ui/monthboard.js`, `js/ui/yearsummary.js`,
`js/ui/owes.js`, `js/ui/week.js`, `js/ui/printout.js`, `js/ui/monthsummary.js`, `js/ui/backup.js`,
`js/ui/reports.js`, `tests/reports.speed.test.mjs`). In roster.js nothing but the three lines named.

## «מה חדש» (for the integrator; PROPOSED)

`{ title: 'בדיקת הצוות', text: 'בסוף מסך הצוות: מה כדאי לסדר בעובדים ובאתרים - שכר יומי חסר, טלפון שלא ייפתח בוואטסאפ, שם או מספר כפול, ועובדים ואתרים בלי עבודה ב-25 ימי העבודה האחרונים.', where: 'צוות ← בדיקת הצוות (בסוף המסך)', go: 'crewcheck' }`
(revision 2: revision 1's «ומי שלא עבד 25 ימי עבודה» lacked «האחרונים» and left the sites out)
- `go: 'crewcheck'` only navigates: `showView('roster')`, then one task later `#crewCheckEntry`
  scrolled to the middle and focused, never pressed (whatsNewGo's rule; with no men on the crew the
  screen alone). Its landing rule joins tests/whatsnew.browser.mjs:449-490 and the key list at :427.

## Interfaces

Provided (globals of `js/ui/crewcheck.js`): `CREW_CHECK_TEXT`, `CREW_CHECK_REUSED`,
`CREW_CHECK_IDLE_DAYS`; `crewCheckRead(schedule, today, layer, asOf)` (the shape under Data; `asOf`
optional, revision 2); `crewCheckFindings(read, today)` → `[{ kind, tier: 'check'|'info', say, note|null,
chips: [{ text, aria, door: 'form'|'row'|'site', workerId?|placeId?, field?: 'daily'|'phone'|'name' }] }]`
(kinds as the rules table, `zeroStamped` among them); `renderCrewCheckInto(container, today)` → the
number of findings drawn, the too-few line first when `since` is null (it is not a finding and is not
counted); `renderCrewCheckEntry()`, `openCrewCheck()` → boolean, `closeCrewCheck()`, `crewCheckIsOpen()`,
`renderCrewCheckIfOpen()`, `crewCheckGo(chip)` (which also arms the hold of the slow second tap).
Consumed, all existing globals and none of wave 1: `guardFingersOn`, `openPress`, `sheetClock`
(js/ui/sheet.js), `DOUBLE_TAP_GUARD_MS` (js/ui/day.js), `ratesForDay` (js/model/money.js), besides the
readers named under Data. No wave-1 track calls any of it; a later screen that embeds the check calls
`renderCrewCheckInto` behind `typeof` and adds its own render hook.

## Conflicts with wave 1, and how they resolve

Measured with `git diff -U0 6ab193d <branch>` on the branches as they stand (feat-status 3e661d0,
feat-payday 73ca0e0, feat-monthboard af099ca, feat-yearsummary 432f771, release-v205 bdaed5e) - the base
line each inserts after. RE-MEASURED for revision 2 on the heads of 2026-11-19 (feat-status 135bdb1,
feat-payday 96f8d88, feat-monthboard af099ca, feat-yearsummary eef8c88, release-v205 bdaed5e): every
base line below is unchanged, and this track's script line is 1170, not 1171 (the critic's trial merge
of every insertion against all five branches, critic/merge/, is clean either way):

| file | this track | wave 1 and v205 | resolution |
|---|---|---|---|
| index.html | 234, 957, 1170 | status 126-127/1017/1230; payday 942/1212; monthboard 1197; yearsummary 973/986/1189; v205 109/1042 | ≥ 15 untouched lines between any two (1170 to yearsummary's 1189: 18): a clean merge |
| sw.js | 105 | yearsummary 110, monthboard 112, payday 115, status 125, v205 24 | clean |
| js/ui/modal.js | 40 | payday 36, yearsummary 44, status 48 | 3-4 untouched lines between each: clean |
| css/design.css | 805 | monthboard 774, yearsummary 1094, payday 1639, status 79/106/131/1846 | the day check's block (775-805) stands between monthboard's and this: clean |
| css/large.css | 709 | monthboard 700/1267, yearsummary 792, payday 972/1278, status 176/1038, v205 1278 | 701-709 between: clean |
| tests/screens.mjs | 309 | payday 243/339, monthboard 289, yearsummary 416, status 458 | clean |
| js/ui/roster.js | 28-40, 756 | nobody | - |
| js/app.js | not touched | status, payday, yearsummary, v205 | - |
| package.json, tests/README.md | append | everybody | merged additively by the integrator, as for wave 1 |

The two screens.mjs entries carry their in-memory change inside their own open/close (no helper at
the file's top), so they touch no other track's helpers. The builder re-runs that `git diff -U0` before
the report and says if any line moved. Interplay in
meaning, not in text: `status`'s site word «שקט» (5 working days, its sites section) and this track's
idle site (25) read the same calendar (`dayCheckIsWorkingDay`) and ask different questions - a site can be
«שקט» there for weeks before it is named here; the release note says both numbers. `status` names this
program's "news" as rejected; nothing of this dialog is embedded there.

`payday` (feat-payday 96f8d88, js/ui/payday.js, `paydayChecks`) has two findings whose door is
«עובדים ואתרים» - `showView('roster')`, the screen this button is on (:340-345 and :379-385, both
`go: 'roster'`, carried out at :771-773); a door from there to the check is in neither track. What the
check answers when the owner arrives through them (revision 2):
- **c, «… בלי שכר יומי, ולכן הסכום חסר אותם»** (a row with a day of work and `amount === null`): if his
  roster has no daily rate, `noRate` names him and the form's door mends it - every day recorded with no
  stamp, and every day from then on, is priced at the rate typed; if his days were stamped with no daily
  rate (an hourly-only man), «לידיעה» `zeroStamped` names him with the number of those days, which stay
  without an amount whatever is typed (iron law 2) - so c will go on naming him for a period that holds
  them, and the check says why instead of falling silent. Revision 1 had no answer for that second man:
  its `noRate` line went quiet once the rate was typed, the calm line could stand, and c still pointed here.
- **f, «שעות נוספות בלי שכר שעה»** (a row with `hoursUnpriced`): this check reads no hourly rate and says
  nothing - the day check («שעות נוספות בלי שכר שעה - לא ייכללו בסכום», daycheck.js:103) and the sheet's
  star say it day by day. The stamp carries the day's hourly rate too (money.js:76-83), so an hourly rate
  typed in the form - his row's «עוד ⋯» ← «עריכת פרטים», «עוד פרטים» - prices only the extra hours recorded
  after it; that is payday's door's business to say, not this check's - the builder's report names it
  for the integrator, as a fact about c and f's door, and changes nothing of wave 1.

## What it does NOT do

- It does not archive, rename, edit or delete anybody, and does not mark anything seen: the next
  opening reads the record again and says what it says.
- It does not say a man LEFT - only that the record holds no work for him in 25 working days, and when
  his last one was. An occasional man is named while he is away that long (the model: 29.6% of the names
  come back); the owner decides.
- It names nobody archived. An active man whose number is shared only with an ARCHIVED man is not named
  (the row's «מספר משותף» still says it). A number typed WHOLLY in Arabic-Indic digits is never found
  shared (`normalisePhone` reads ASCII digits only - its existing behaviour, schema.js:1337-1338), though
  the seder accepts it. Revision 2 corrects revision 1 here, which said only that: a number typed PARTLY
  in them - an Arabic-Indic prefix, ASCII after it - is compared by `normalisePhone` on its ASCII digits
  alone, so '٠٥٢-884-1930' and '٠٥٣-884-1930', two usable and different numbers, are one number there
  (`samePhone` true, the critic's probe-phone-typos.out). The row's «מספר משותף» badges both
  (pre-existing, not changed here); this check regroups them by the seder's own number and names nobody.
- With fewer than 25 working days on the record, nobody and nothing is idle - and the dialog says so in
  one line above the calm line (revision 2; revision 1 drew the calm line alone, as if the idle rules had
  run).
- It does not check an hourly rate (extra hours are a day's fact: the day check's «שעות נוספות בלי שכר
  שעה», the sheet's star), pay cycles, identity numbers, advances. Nor does it promise what a rate
  typed through its door will price (iron law 2): every day recorded from then on, and his days
  recorded with no rate at all (they carry no stamp and take the roster's, money.js:53-67); NOT a day
  already stamped - the `daily: 0` stamp an hourly-only man's days carry stays unpriced whatever the
  roster later says. The sheet says those days as it always has, and since revision 2 so does this
  check, under «לידיעה» (`zeroStamped`), with how many they are - and nothing it can do about them.
- A crew that keeps no numbers sees «בלי טלפון» name every working man under «לידיעה» on every opening
  (tests/owes.seed.mjs: nine of nine) - never counted, the calm line still standing.
- The button carries no count and the screen no badge: the check costs nothing until it is asked.
- Not tried on a real phone; nobody far-sighted has looked at it.

## Open questions (a default stands until the owner rules)

1. The threshold - default 25 working days (≥ 29 calendar days). 18 names more men who come back (40% in
   the model); 40 names a man who left only after about seven weeks.
2. «בלי טלפון» under «לידיעה» on a crew that keeps no numbers - default: shown.
3. A number shared with an archived man - default: not named here.
4. PRE-EXISTING, not changed here (law 6): archiving a SITE asks with the button «כבה עובד»
   (togglePlaceActive, roster.js:1694) - the idle-site door leads to that very question («עוד ⋯» ←
   «הסתרת האתר מהרשימה»). For the owner and the integrator.
5. A duplicate identity number on two active rows - not checked (no badge or sentence exists for it).
6. (Revision 2) Days stamped with no daily rate - default: named under «לידיעה» for as long as the record
   holds them, which is for ever (a stamp is never restated). The owner may prefer them named only while
   they lie in a period nobody has closed; that needs the pay periods, which this check does not read.

## The report

Branch and final commit; every hook in an existing file with its line; the rules and the source of each;
every new string; the measured noise and cost re-run on the final commit (printed by the Node suite);
every suite's exit code and counts, one by one, on the final commit from a clean tree; the `git diff -U0`
conflict table re-measured; the release-entry text and the CLAUDE.md file-list line for the integrator
(`js/ui/crewcheck.js  «בדיקת הצוות» - a reading of the roster from one button at the foot of the crew
screen: no daily rate, a number that will not open, one number or one name on two active rows, 25
working days with no work (men and sites); the rest under «לידיעה», days stamped with no daily rate
among them; each name one door that only navigates, the «פעיל» switches and the form's «שמור» held for
700 ms after it; writes nothing; every Hebrew word in one block (proposed)`); the note on payday's c and
f doors (Interplay); screenshots (synthetic names, 440x956 dark, 320x568 with the mode, JPEG) in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-crewcheck/`; what
was not verified (not tried on a real phone); the open questions with their defaults.

## Revision 2

An adversarial critic raised fourteen issues against revision 1 (seven major, seven minor). Each was
checked against the code at the base and, where it carried a number, re-measured
(`rev2/probe-rev2.out`, `rev2/probe-entry-rev2.out`; the critic's own probes in `critic/` were read and
their methods checked). The critic was right on the substance of all fourteen. Where a detail of its fix
was wrong, the one line saying why is given here and next to the change.

1. **Criterion 7 could not fail** (major) - RIGHT. Read as specified (the whole record, L over any
   date), a man who comes back is never idle before he does, so "of the names said idle, a man who
   worked again later" is 0.0% by construction (measured: 1.46 names an evening, 0.0%; the critic: 2412
   names, 0.0%); revision 1's 29.6% came from probes that read each evening as of itself. CHANGED:
   `crewCheckRead` gains the optional `asOf` (the app passes nothing); criterion 7 reads every evening
   with `asOf` = the evening and prints the whole-record reading beside it; the leaver bound is scoped to
   the 33 of 40 leavers whose last day is 45+ calendar days before the last evening (all 33 said idle,
   max 42); the regulars' line is now "no regular without a run of 25+ working days with no site is
   ever said idle, and every one with such a run is" (17 of 208, measured, no exception either way). Not
   the critic's wording, "no regular without a leave of 25 or more working days": the generator's planned
   leave is not the record's run, and that criterion would fail - one regular with a planned leave of 21
   is said idle (away spells beside it lengthen the run) and seven with 26-34 are not (closures inside
   them, or 25 working days not yet past by 20/09; rev2/probe-plan.mjs + .out, and man by man
   rev2/probe-plan2.mjs + .out); the run is read off the
   record, where the rule reads it; the day-check-season evidence now says 61.1% of the idle-site names were sites that
   worked again later, not "sites the model closed". Taken: the fourth argument, not the critic's
   alternative of a shallow per-evening view - one comparison in the sorted pass, and the suite's
   evenings run the very code the app runs.
2. **The badPhone / otherPhone split** (major) - RIGHT: `normalisePhone` returns any 7-8 or 10+ digits
   with no 0 and no 972 as they stand (schema.js:1353-1360), so the five Israeli typos fell under
   «לידיעה» as foreign. CHANGED: `otherPhone` only for a typed `+` or `00` followed by a country that
   is not 972; every other unusable number is `badPhone`; the five spellings, '+44 7700 900123' and
   '(+970) 59-123-4567' join criterion 2. Refined beyond the critic: digits after the prefix that start
   with 0 are a local number (no country code starts with 0) - '+05288419' is `badPhone`; the one miss
   left, '00528841930' (a doubled zero read as +52), is pinned as it is, and it errs the safe way.
3. **The row door puts a one-tap write under the finger** (major) - RIGHT (the critic's 4.1-4.9% of the
   glass, its method checked). CHANGED: a 700 ms hold (`DOUBLE_TAP_GUARD_MS`) after a row, site OR FORM
   door; criterion 13 gains the slow second tap at 350 / 500 / 650 ms. Done with the house's own
   `guardFingersOn` (sheet.js:291) rather than a new capture listener: the same capture-on-the-surface
   spend the sheets and pickers use, keyboard clicks exempt. Two corrections to the critic's fix: the hold
   is judged on the PRESS's time (a touch down at 650 ms clicks after 700, and a clock test would let it
   through); and the form door has the same hole on «שמור» (a roster commit with nothing asked), found
   while verifying this one. The test is made non-vacuous: it presses a switch found on the glass with
   `elementFromPoint`, not only "the chip's point", where no switch may be.
4. **The borrowed note without its question** (major) - RIGHT (roster.js:1439-1449). CHANGED:
   «אם מכבים עובד בכפתור «פעיל»:» (PROPOSED) before the borrowed sentence, both pinned.
5. **The two screens.mjs entries never drew idle, idleSites or neverSites** (major) - RIGHT, so
   `.crewcheck-note` never reached the large display's gate. CHANGED: the critic's option (a) - the
   'with findings' entry adds in memory, by the model's writers, two sites and ELEVEN working days
   before the seed; it now draws every kind (expected lines measured). The critic's recipe as written
   ("ten or more days on which w14 works") would not make him idle - with the seed's fifteen days after
   his last, 25 must follow it - so he works on the first of eleven only.
6. **The noRate sentence and payday's c and f** (major) - RIGHT on both. CHANGED: «בלי שכר יומי - ימי
   העבודה שלו / שלהם לא יחושבו בשכר:»; a new «לידיעה» line, `zeroStamped`, names the men whose recorded
   days carry a stamp with no daily rate, with their number; the interplay section names payday's c and f
   doors and says what this check answers for each. Two details of the critic's proposal were wrong and
   were not taken: its condition, `ratesForDay(...).daily <= 0`, also holds for a no-rate man's
   UNSTAMPED days, which a rate typed now does price - the condition is `stamped && daily <= 0`; and its
   tier, «כדאי לבדוק», would hold the calm line off for ever, since a stamp is never restated and nothing
   on any screen mends it - so «לידיעה» (open question 6). The out-of-scope line "no money function is
   called" now names the one reader called, `ratesForDay`, for a fact and no figure.
7. **Criterion 3 and archived men on sederCrew** (minor) - RIGHT (seder.js:113). CHANGED: "every ACTIVE
   man"; the archived man is a pinned near miss.
8. **The digit set** (minor) - RIGHT (seder.js:174-175). CHANGED: a digit is `/[0-9٠-٩۰-۹]/`;
   '۰۵۲۸۸۴۱۹۳۰' is on no line and '۰۵۲۸' is `badPhone`, in criterion 2.
9. **Mixed Arabic-Indic numbers found shared** (minor) - RIGHT (schema.js:1337-1338; `samePhone` true for
   two different usable numbers). CHANGED: a group whose every number opens is regrouped by
   `sederWaNumber`; the agreement states the exception; revision 1's claim under What it does NOT do
   ("a number typed in Arabic-Indic digits is never found shared") is corrected. Regrouped rather than
   dropped, as the critic proposed: a three-man group in which two share the seder's number keeps that pair.
10. **The calm line with fewer than 25 working days** (minor) - RIGHT. CHANGED: the PROPOSED line
    «עדיין אין 25 ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב.» first in the list when
    `since` is null; criterion 4. Worded to cover the sites as well as the men (the critic's «מי לא עבד»
    named only men).
11. **The script tag after :1171** (minor) - RIGHT: :1171-1174 is one comment. CHANGED: after :1170,
    before that comment, in the entry, the Files section and the conflict table; the table re-measured on
    the branch heads of 2026-11-19 (unchanged but for 1170 and the hashes).
12. **The entry measured with the day check's classes** (minor) - RIGHT (probe-foot.mjs:22-23,
    probe-foot2.mjs:13-14). CHANGED: re-measured with this contract's rules - the document +68 / +72 (not
    +62 / +66), 296-416 x 48 (52), one line, 72-106 px clear of the tab bar, 520 px at 1100x800 (not 1068),
    nothing before the row moved; criterion 10's bounds stand.
13. **Three PROPOSED strings** (minor) - RIGHT. CHANGED, word for word as the critic proposed: the
    `idleSites` pair («אתר / אתרים שלא נרשמה בו / בהם עבודה…»), the `otherPhone` pair («… - אי אפשר לפתוח
    לו / להם הודעה בוואטסאפ:»), and the «מה חדש» text («… ועובדים ואתרים בלי עבודה ב-25 ימי העבודה
    האחרונים.»).
14. **Criterion 9 on the harness's null DOM** (minor) - RIGHT (tests/harness.mjs:197-200). CHANGED: run on
    tests/moneydom.mjs's `makeDom()` with the dialog's ids registered, as tests/sitecard.test.mjs does, and
    once more in the browser with a spy. The critic's pointer to tests/nodes.mjs was the wrong file: it has
    no id registry; the registering DOM sitecard.test.mjs uses is moneydom.mjs's.

Nothing in revision 2 touches js/model, js/sync, js/state.js, js/store.js, js/recovery.js, firestore.rules
or functions/, adds a field, a path or a writer of the record, writes a Store key, or works out a shekel:
the new reading (`ratesForDay`'s `stamped` and `daily`) and the new guard (`guardFingersOn`) are existing
functions, called from js/ui/crewcheck.js. The new PROPOSED strings are `tooFew`, `archiveIf`, the
`noRate`, `idleSites`, `otherPhone` and `zeroStamped` pairs, the two `zeroStamped` chips and the «מה חדש»
text; the borrowed archive sentence (roster.js:1442) keeps its words and is named
`CREW_CHECK_REUSED.archiveSays`.
