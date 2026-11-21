# Contract — «שכר שעה נוספת 50 ₪» and the undecided hourly stamp (track `hourly50`)

Base `dd9432b` (origin/main, v206 served). Branch `feat-hourly50`. Approved by the owner on
2026-11-20 in conversation: "حطلي سعر الساعه زياده عند كل العمال ٥٠ شيقل مع امكانيه للنغير",
after a man's four extra hours read «לא נכללו בסכום» because his day was stamped while his
hourly rate was 0. The js/model change below is approved for exactly this and nothing else.

## Goal

1. Every man can have an extra-hour rate of 50 ₪, still changeable per man:
   - a NEW man's form opens with «שכר לשעה נוספת» = 50;
   - ONE button on the crew screen, «שכר שעה נוספת 50 ₪ לכולם», gives 50 to every man
     (active and archived) whose hourly rate is 0 or missing, after askConfirm names how many.
     A man who has a rate keeps it. The button is drawn only while somebody still has none.
2. A day whose stamp says hourly 0 (or none) is read with the man's CURRENT hourly rate for its
   hourly part. A stamped daily rate is never changed; a stamped hourly rate above 0 is never
   changed. `currentRates` already says a rate that is 0 is "a rate that has not been decided";
   this extends that to the hourly half of a stamp.

## Out of scope

- No write of any day: the change is at READING time (ratesForDay). No stamp is rewritten.
- js/sync, js/state.js, js/store.js, js/recovery.js, firestore.rules, functions: untouched.
- A closed period: its frozen gross/basis/days are read as they were frozen (frozenPeriodFor),
  untouched.
- Build stamps, whatsnew, docs/releases.md, CLAUDE.md: the release's.

## Data

- Read: `ratesForDay` (js/model/money.js) is the one place a day's rates are read
  (payrollReport, workerDaysReport, daycheck).
- Written by the button: `worker.hourlyRate` per man, through `State.commitRoster()` - the worker
  form's own writer.

## Success criteria (tests/hourly50.test.mjs, tests/hourly50.browser.mjs)

1. A stamp {daily:1000, hourly:0} with 4 extra hours and a man at hourly 50: payrollReport 1200,
   no hoursUnpriced; workerDaysReport's day amount 1200.
2. A stamp {daily:1000, hourly:40}: hours at 40 whatever the roster says.
3. A stamp's daily rate is never the roster's.
4. A closed period's sheet (frozenPeriodFor's range) is byte for byte what it was.
5. No byte of the disk moves by reading.
6. The button: drawn only while a man has no hourly rate; askConfirm names N; confirmed, exactly
   those men get 50 and nobody else changes; cancelled, nothing written; a refused commit rolls
   memory back.
7. The new man's form opens at 50, and 0/empty can still be saved (he can change it).
8. The oracle (tests/oracle.mjs) learns the rule from this text and agrees on its seeded records;
   a mutant that reads the stamp's 0 goes red.
