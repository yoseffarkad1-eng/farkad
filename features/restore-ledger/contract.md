# A restore puts the work back. It does not put the money back.

This contract exists because `docs/data-safety-audit.md` finding **O1** was reproducible and
deliberately left unfixed: two rules would both have closed it and they disagreed about
somebody's pay, so the audit refused to pick one silently and asked for a person's answer.

The answer was given. It is written here so that nobody has to reconstruct it from a diff.

## The failure this prevents

Two phones, both online, nothing failing.

    A takes a backup.
    B records a repayment of 500. It reaches the cloud and it reaches A.
    A restores the backup through the ordinary door.

    A: left 5000      B: left 4500      cloud: left 5000

Both phones say `synced`. B never sends the repayment back. Reopening B keeps 4500. Only the
ledger diverges — days, advances, workers and places all converge. A man handed 500 back and
one phone has forgotten it, permanently, while telling the person holding it that everything
is in agreement.

That is the failure. Not a crash: a record that quietly says something different from what
was done, which is the only kind of failure this repository treats as fatal.

## The decision

**An ordinary restore never erases a financial event, on any device.**

Restoring is how a person puts back a schedule they wrecked — days, workers, sites, order,
names. It was never how a person un-pays a man. Those two acts got the same button because
they lived in the same document, and that is the whole of the bug.

Concretely:

1. **The schedule is replaced. The ledger is not.** The restored document supplies days,
   workers, places and ordering. Ledger entries are merged by union — on the restoring
   device exactly as on every device that later adopts the snapshot. This is law 1 read
   without an exception carved into it: *entries are never edited, never deleted, and merged
   by union.* The restoring device is not special; it was only ever special by accident.

2. **The submitted backup survives as it arrived.** What the person handed in is kept
   verbatim and stays distinguishable from the merge result. A person who restores must be
   able to see what was in their file, not only what the app decided to do with it.

3. **One outcome everywhere.** After the restore settles, the restoring device, every other
   device and the cloud agree on the same set of financial facts. A device may not say
   `synced` while it holds a different set from another device that also says `synced`.

4. **A conflict keeps both sides and stops.** If two financial facts cannot both be true,
   the app holds both, records nothing further against that account, and says so in words.
   It does not choose an amount. An account under review deducts nothing until a person has
   looked — the same shape already used for `overpaidAdvances` in `js/model/ledger.js`.

5. **There is no destructive financial rollback behind this button.** Erasing a financial
   event is a different operation with a different confirmation and a different name, and it
   is **not available in this build**. Wanting it is not the same as having decided it.

## What this costs, said out loud

A person who restores a backup expecting the ledger to go back with it will not get that.
If they recorded an advance by mistake and hoped a restore would remove it, it will still be
there afterwards. The app must therefore tell them so at the moment they confirm — see
"the sentence" below — and the correct tool for a wrong entry stays what it already is: a
correction of the opposite sign, with a reason, both rows left on the screen
(`openReversalForm` in `js/ui/reports.js`).

This cost was accepted on purpose. Money that leaves a ledger without a row explaining it is
the one thing this app may not do, and a restore is not an explanation.

## The sentence

The restore confirmation currently promises to replace what is on the phone. Under this
contract that promise is no longer true of the ledger, so the words change with the
behaviour, in the same commit, and the pinned string moves with them (law 6).

The confirmation must say, in Hebrew, that the work record will be replaced and that the
advances history is kept. The exact string is pinned by the test that ships with this
change; it is not restated here, because two copies of a pinned string is how they drift.

## Why not the other rule

The rejected rule was: a restore's snapshot replaces the ledger on every phone that adopts
it. It is the more intuitive reading of the word "restore", and it makes the three balances
agree.

It was rejected because it makes a backup a weapon. Any phone holding an old file could
delete a repayment recorded on another phone, silently, at any time, with no row anywhere
saying who did it or why — and it would do so while both phones reported `synced`. The rule
that fixes a divergence by destroying the newer of the two facts is not a fix.

## What must be true when this is done

- The scenario at the top ends with all three holding the same balance, and no repayment lost.
- The restoring device's own ledger is not emptied by its own restore.
- A third device adopting the restored snapshot loses no entry either.
- Retrying the same restore does not double any event.
- A device that says `synced` agrees with every other device that says `synced`, on facts and
  on balances.
- No stamped day is repriced by any of this (law 2).
- Both money gates stay shut in the shipped build. Readiness is not permission.
