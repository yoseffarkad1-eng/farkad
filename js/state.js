// The one place the schedule lives while the app is open, and the one place that decides
// when it is written down.
//
// v1 data is never modified. It is read, migrated into a new key, and left exactly where
// it was - so if anything about the migration turns out to be wrong, the original is
// still sitting there untouched.

const V1_KEY = 'scheduleData';
const V2_KEY = 'scheduleData:v2';

// THE STAMP OF THE LAST RECORD THIS DEVICE CONFIRMED, under a key no older build writes.
//
// G2 in features/stale-window/contract.md: a value this device has confirmed stays
// reconstructible until something newer for that field is confirmed - INCLUDING after the
// cloud has acknowledged the operation and the collector has taken it off the queue.
//
// A WHOLE SECOND COPY WAS THE FIRST ANSWER AND IT WAS THE WRONG ONE, measured rather than
// argued. It cost one copy of the record, permanently, and the capacity model has two
// guarantees that copy cannot coexist with: the reclaim ladder's only currency is restore
// points (tests/capacity.test.mjs, "a device with nowhere left refuses the edit rather
// than claiming it" - no snapshots there, so a shadow rung turns a refusal into a sale),
// and a device whose room is in its album must not be called critical
// (tests/data.test.mjs C1 - measured at 5,084 bytes used against a 2,793 budget, of which
// 848 were the copy, leaving 271 where a copy costs 798). Insurance that is spent by the
// ladder breaks the first; insurance the ladder cannot spend breaks the second.
//
// So what is kept is the STAMP, about sixty bytes: enough to KNOW the record went
// backwards. The recovery itself needs no second copy, because the collector's gate is
// `op.sent && the disk holds it` - and `op.sent` means the cloud has it. A device with no
// cloud configured never marks anything sent, so it never collects, so its journal still
// holds every edit; a device with a cloud has the collected ones in the cloud, and the
// next snapshot merge brings them back. The two cases cover each other, and neither costs
// a byte of the budget.
const STAMP_KEY = 'scheduleData:v2.stamp';
const ISSUES_KEY = 'scheduleData:migrationIssues';
// There was a lock key here. It is gone, and the reason is written out in full above
// recordOnDisk: a read followed by a write is not a test-and-set, so what it held was a
// belief rather than a lock. Nothing reads or writes this key any more; a value left
// under it by v162 is inert and is deliberately not deleted - this round removes no
// stored bytes of any kind.
// An unreadable v2 blob is handled by Recovery, which copies it to
// `scheduleData:v2:damaged` and leaves the original alone. A build before v67 put its
// copy under `scheduleData:v2damaged` - no colon - and then overwrote the original;
// nothing reads that key any more, and anything found under it on an old device is still
// a real copy worth keeping.

const State = {
    schedule: emptySchedule(),
    date: null,          // the day being viewed, YYYY-MM-DD
    // Always 'actual'. The seder is sent on WhatsApp and never lived comfortably in
    // here; the app records what HAPPENED, one thing only. The field itself stays -
    // the data model, the sync paths and old documents all still carry two layers,
    // and reading them must keep working.
    layer: 'actual',
    migrationIssues: [],

    load() {
        Recovery.restoreSnapshotWarnings();
        const result = this.loadRecord();

        // A restore performed with no cloud connected is a transaction like any other -
        // the schedule and the queue - and a crash between the two halves leaves the
        // second one owed. There is no connect() coming to finish it on a device that
        // has never had a cloud, so it is finished here, right after the disk has been
        // read and before anything new can be written over it.
        if (typeof FarkadSync !== 'undefined' && FarkadSync.finishLocalReplace) {
            FarkadSync.finishLocalReplace();
        }

        // Only now is the schedule this session will actually hold standing: disk read,
        // journal replayed, any unfinished restore completed. The advances on it are
        // mirrored into the ledger here, before the first render. The screens still
        // read the legacy field either way - the mirror exists so the ledger can be
        // JUDGED against it for a while before anything depends on the fold.
        this.migrateLedger();
        // The cold store (js/cold.js), last: what this record's indexes name and the
        // record itself does not hold is read from IndexedDB - asynchronously, so this
        // returns before it has. With the flag shut and no mark on the disk it opens
        // nothing and this line is the whole cost.
        if (typeof Cold !== 'undefined' && Cold.begin) {
            try { Cold.begin(); } catch (error) { console.warn('cold store did not begin:', error); }
        }
        return result;
    },

    loadRecord() {
        let damaged = false;
        // THE DISK, NOT THE SESSION CACHE - the same reading diskVerdict needs, and for
        // the same reason.
        //
        // Store.get answers from Store.memory first, which holds what THIS window last
        // wrote. At the first boot memory is empty and the two readings agree, so this
        // looked harmless; a window that reads the record again later - after a snapshot
        // was adopted and persisted, or any time a second window re-reads - was handed
        // its own older text and set `durableText` from it. durableText is the claim
        // "this is what the disk holds", every later comparison is made against it, and
        // a false one makes every edit afterwards look like somebody else's conflict.
        //
        // Falling back to memory keeps the one case the cache is right about: a disk that
        // cannot be read at all, where what this session wrote is all there is. What the
        // disk refused and memory still holds is not lost by preferring the disk - the
        // journal is replayed over it a few lines below, which is what the journal is for.
        const durable = Store.durableGet(V2_KEY);
        let v2 = durable === null || durable === undefined ? Store.get(V2_KEY) : durable;

        // A RECORD THAT WENT BACKWARDS IS NOTED, AND NOTHING IS OVERWRITTEN TO FIX IT.
        //
        // See recordRegressed and STAMP_KEY. The bytes under V2_KEY are older than the
        // last record this device confirmed, so a writer this build cannot refuse has
        // replaced it. They are left exactly where they are - law 10 is about losing a
        // record, and a readable stale one is still a record, and overwriting it is how a
        // repair destroys the thing it repairs. What was lost comes back the way it
        // always does: the journal replay below for everything the collector has not
        // taken, and the next snapshot merge for everything it has, because the
        // collector's gate requires the cloud to hold it first. The ⋯ panel says it
        // happened, because a recovery nobody is told about looks like nothing happened.
        if (this.recordRegressed()) {
            this.recordWasReplaced = true;
            // AND THE BOUNDED RING IS LAID BACK OVER IT, field by field.
            //
            // See KEPT_PREFIX in js/sync/sync.js. These are fields the collector has
            // already taken off the queue, so the journal replay below cannot bring them
            // back and before this there was nothing on the device that could. Applied
            // only where the record has gone backwards, and only to the record in memory -
            // the stale bytes on the disk are left exactly where they are, because
            // overwriting them is how a repair destroys the thing it repairs.
            //
            // BOUNDED, and the bound is the point: the last 32 collected field paths.
            // Anything older than that is not recoverable from the device, and the ⋯
            // panel's regression line says so rather than implying a complete rescue.
            this.recovered = [];
            try {
                const parsed = JSON.parse(v2);
                // THE SAME LIST recordRegressed answered from, so the trigger and the
                // repair can never be about different fields.
                this.lostFields().forEach(entry => {
                    applyJournalEntry(parsed, entry.path, entry.value);
                    this.recovered.push(entry.path);
                });
                if (this.recovered.length > 0) v2 = JSON.stringify(parsed);
            } catch (error) { this.recovered = []; }
        }

        if (v2) {
            try {
                // Parsing is not the question. A record that parses into
                // {"workers":[],"places":[]} is not an empty schedule - normaliseSchedule
                // would hand one back without a word, the app would draw a blank crew,
                // and the first ordinary save would write that blank over the last real
                // record this device had. So the raw content is checked BEFORE
                // normaliseSchedule is allowed near it.
                //
                // Compatibility-aware, and narrowly: a record from a build that predates
                // advances is a real record and still opens. Anything else missing is
                // damage, and damage is held, not filled in. See upgradeStoredSchedule.
                const upgraded = upgradeStoredSchedule(JSON.parse(v2));
                const problems = upgraded
                    ? storedScheduleProblems(upgraded)
                    : ['הרישום השמור אינו מסמך של לוח עבודה.'];
                if (problems.length > 0) throw new Error(problems[0]);

                this.coldNote(upgraded);
                this.schedule = normaliseSchedule(this.coldLaid(upgraded));
                this.durableText = v2;
                this.migrationIssues = readIssues();
                // Anything the journal is still holding goes back on top. This is the
                // whole point of the journal: an edit whose schedule write failed is
                // rebuilt here, on this device, with no cloud anywhere near it.
                this.replayJournal();
                return { migrated: false };
            } catch (error) {
                // The newest copy of the record that exists, and it will not parse -
                // almost always a truncated write, with the days inside it still plain
                // text somebody can read out.
                //
                // The old line here set it aside with `optional: true` and did not look
                // at whether that worked, and then fell through to a v1 migration ending
                // in save() - which writes to this very key. On a full device, which is
                // where a truncated write comes from, the copy failed and the save
                // succeeded: the recovery destroyed the thing it was recovering.
                //
                // Recovery keeps the original where it is, makes a copy it has read back,
                // and blocks writing. save() and persist() both ask before writing, so
                // nothing below this line - migration, a later edit, or somebody
                // re-typing the week over a blank screen - can reach V2_KEY.
                console.error('v2 schedule unreadable, holding it:', error);
                Recovery.damaged(V2_KEY, v2,
                    'הרישום השמור במכשיר לא נקרא: ' + String(error && error.message || error));
                damaged = true;
            }
        }

        const v1 = Store.get(V1_KEY);
        if (!v1) {
            this.schedule = emptySchedule();
            // A first run has no schedule and no v1, but it may have a journal - an edit
            // made after a schedule write failed on a device that had nothing yet.
            this.replayJournal();
            return { migrated: false, damaged };
        }

        let result;
        try {
            result = migrateV1(JSON.parse(v1));
        } catch (error) {
            // The v2 branch above copies the bytes, keeps the original and blocks
            // writing. This one used to do none of the three: a console line nobody on a
            // building site can open, and emptySchedule() - which is law 10's third verb,
            // treated as empty.
            //
            // What made it survivable was luck, not a guarantee. Nothing in the app
            // writes this key, so the bytes stayed and the export sweeps them up by name.
            // What was lost was anybody's chance of noticing after the one boot dialog,
            // on a blank screen that invites being re-typed - and re-typing the week onto
            // an empty schedule and saving it is the sequence the v2 branch was rewritten
            // to stop. The same sequence, one branch down, was still open.
            //
            // So: the same three things, and deliberately the same sentence the v2 branch
            // says. It is the same failure told to the same person, and there is no
            // reason for them to read two wordings of it. The load still reports `failed`
            // rather than `damaged`, so js/app.js says «לא הצלחנו לפתוח את הרישום» - the
            // dialog written for a screen that opens blank, which is what this one does.
            console.error('v1 schedule unreadable:', error);
            Recovery.damaged(V1_KEY, v1,
                'הרישום השמור במכשיר לא נקרא: ' + String(error && error.message || error));
            this.schedule = emptySchedule();
            return { migrated: false, failed: true, damaged };
        }

        this.schedule = result.schedule;
        this.migrationIssues = result.issues;
        this.replayJournal();
        // Shown, so the week is on screen and can be read - but not written down. Saving
        // it would put pre-migration data over the newest record there is.
        if (!damaged) {
            // The schedule FIRST, then the questions about it.
            //
            // Written the other way round, the fingerprint was taken before the record it
            // fingerprints existed - so it was the empty string, and the very next open
            // compared it against a real one and dropped every question the migration had
            // raised. The week came back and the things nobody had answered did not.
            this.save({ silent: true });
            writeIssues(result.issues);
        }

        return { migrated: true, issues: result.issues, damaged };
    },

    // Everything the journal is still holding, laid back over the schedule on the disk.
    //
    // Everything EXCEPT what an outstanding restore has superseded. Those entries
    // describe the state that restore is replacing, so replaying them puts back exactly
    // the days it removed - which is what a device looked like after a restore whose
    // queue prune had been refused: the restored schedule on the disk, the old journal
    // beside it, and the superseded days back on the screen at the next open.
    replayJournal() {
        if (typeof FarkadSync === 'undefined' || !FarkadSync.replayJournal) return;
        FarkadSync.replayJournal(this.schedule, FarkadSync.supersededFloor());
    },

    // ------------------------------------------------------------ the advances ledger
    //
    // The one write the closed ledger gate sanctions: every advance already on the
    // record, mirrored into a 'given' entry, once. It creates no new facts - the entries
    // say what schedule.advances already says, and that field is not touched - so the
    // day the writer opens, it opens over a ledger that has been agreeing with the
    // record for weeks. See the migration block in js/model/ledger.js.

    // The schedule OBJECT the mirror was last asked about. Identity, not content: an
    // ordinary edit mutates the schedule in place, so a landed write holding a DIFFERENT
    // object means the whole record was swapped out from under the app - a restore, off
    // one of share.js's four doors - and the question is open again. Asking it twice of
    // the same record is free: an advance that already has an entry is never given
    // another one.
    mirrored: null,

    // Committed the way every other edit is - journalled first, saved second, sent with
    // everything else - but NOT through commit(), because it must not share commit's
    // ending. A refused commit rolls back and says so out loud; nobody asked for this
    // write, so a refusal is not announced and not mourned: the entries come quietly
    // back out of memory, what is on the screen is exactly what it was, and the next
    // boot asks again.
    migrateLedger() {
        this.mirrored = this.schedule;
        // Quarantine and build mismatch. What is already saved stays saved and nothing
        // new is written - the migration least of all, being the one edit nobody made.
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return false;
        // A device whose storage refuses everything holds the record in memory only.
        // journalBatch answers true there (an ordinary edit IS allowed to stand in
        // memory), but a mirror that exists only until the tab closes is not a mirror,
        // and the save below would raise the "השינוי האחרון לא נשמר" banner at boot
        // over a change nobody made.
        if (typeof Store !== 'undefined' && !Store.available) return false;

        const result = migrateAdvancesToLedger(this.schedule, syncDeviceId());
        // Nothing to mirror, nothing written: a second boot leaves the disk alone.
        if (result.added.length === 0) return true;

        const entries = Object.keys(result.paths)
            .map(path => ({ path, value: result.paths[path] }));
        const journalled = this.journalBatch(entries);
        if (!journalled) {
            // Nowhere durable. The entries were only ever in memory - the legacy field
            // still holds every one of these advances, so nothing is lost by waiting.
            // Removed by the id each entry carries, not by parsing its path.
            entries.forEach(entry => {
                delete this.schedule.ledger.advances[entry.value.id];
            });
            return false;
        }

        // The mirror stays as silent as its comment promises: a blob write that fails
        // here will fail identically on the next real edit, and THAT one may honestly
        // raise the banner - a boot alarm about an edit nobody made teaches people to
        // ignore the banner that matters.
        const hadFailed = this.saveFailed;
        this.save();
        this.saveFailed = hadFailed;
        return true;
    },

    // Asked a moment later, not now. The swap that prompts this is noticed in the middle
    // of save(), inside a restore transaction that is still writing - and the mirror
    // commits through the very machinery that transaction is standing in.
    migrateTimer: null,
    migrateSoon() {
        if (this.migrateTimer) return;
        this.migrateTimer = setTimeout(() => {
            this.migrateTimer = null;
            this.migrateLedger();
        }, 0);
    },

    // For the settings screen: does the ledger say the same thing as the field every
    // phone still writes? Returns { agrees, missing, different } - ledger.js's
    // ledgerAgreesWithAdvances, over the live schedule.
    ledgerParity() {
        return ledgerAgreesWithAdvances(this.schedule);
    },

    // True only when the schedule is on the disk. Every caller that tells somebody
    // something happened needs to be able to find that out.
    // Set when loadRecord found the record had gone backwards and put the confirmation
    // back. Read by the ⋯ panel: a recovery nobody is told about is a recovery that looks
    // like nothing happened, and the stale bytes are left exactly where they are.
    recordWasReplaced: false,

    // The field paths the bounded ring put back at the last load, for the ⋯ panel. Empty
    // is not "nothing was lost": it is "nothing the ring still held was missing".
    recovered: [],

    saveFailed: false,

    // The schedule exactly as it was last CONFIRMED on the disk. What memory is put back
    // to when an edit turns out to have nowhere durable to live.
    durableText: null,

    // ANOTHER WINDOW OF THIS APP WROTE WHILE THIS ONE WAS LOOKING AWAY.
    //
    // save() writes the WHOLE schedule out of memory, and nothing in this app ever hears
    // that a second window wrote: there is no 'storage' listener anywhere in js/. So a
    // window that has been open since before somebody moved a man - backgrounded, its
    // listener dropped, or an older build still being served from the cache (law 7) -
    // still holds that man at his old site and lays it straight back over the disk on
    // its own next ordinary edit. That edit is somebody recording ANOTHER man, so
    // nothing on either screen looks like a conflict: the window that made the move
    // still shows it, the disk no longer has it, and a reopen produces the old site,
    // because the moving window's journal entry was acknowledged and collected long
    // before. What that produces is «I move him and a few seconds later he is back».
    //
    // Measured in tests/move.late.test.mjs, with two windows on one disk.
    //
    // The disk is compared with what THIS window last confirmed on it - see diskVerdict,
    // which is the one place that asks. That is one getItem beside the one setVerified
    // already pays on the same key, so it costs the same order as the write it guards.

    // What the disk holds right now, or null. Read once per rebase and handed to
    // rollback() as the new baseline - rollback restores durableText, which is THIS
    // window's own last confirmation, and restoring that is exactly the stale copy the
    // rebase exists to stop writing. The disk is the baseline because the disk is what
    // was confirmed there, whichever window confirmed it.
    adoptDiskBaseline(held) {
        if (typeof held !== 'string') return false;
        const previous = this.durableText;
        this.durableText = held;
        // A blob this app wrote and read back. If it will not parse, rollback says so
        // and nothing is changed: the baseline goes back and the write proceeds exactly
        // as it does today, which is the direction to be wrong in.
        if (this.rollback()) return true;
        this.durableText = previous;
        return false;
    },

    // The repair is one this file already had: re-read the disk and replay the journal
    // over it. Journal-first is what makes it safe - the edit being committed is in that
    // journal before this runs, so rebasing onto the other window's newer record cannot
    // lose it, and whatever that window queued and has not sent comes back too, because
    // on one phone the journal is one journal.
    //
    // Only for an edit the journal is holding: one with no path is not in it, and
    // rebasing would be a way to drop it. And only from commit() and commitMany() -
    // save() is also called by persist, by the restore doors and by the ledger mirror,
    // where there is no journalled edit to come back on.
    //
    // WHAT THIS WINDOW MAY DO WITH THE DISK, asked once before a write of the whole
    // schedule. Four answers, and both callers handle all four:
    //
    //   'clear'       the disk is what this window last confirmed; write as usual.
    //   'rebased'     the disk had moved; memory was rebuilt from it plus the journal.
    //   'unsafe'      the disk moved and there is NO journalled change to rebuild this
    //                 edit from, so a rebase would drop it and a write would put this
    //                 window's stale copy over the other one's record. Neither is
    //                 allowed. Defensive: every change that reaches commit() and
    //                 commitMany() today comes from a model function that returns a
    //                 field path, so this answer is not reachable from the shipped
    //                 screens - it is here because the alternative to an unreachable
    //                 branch is an unguarded write.
    //   'unreadable'  the disk holds something this build will not accept as a schedule.
    //                 It is quarantined, NOT adopted, and NOT written over - law 10.
    diskVerdict(journalled) {
        if (typeof Store === 'undefined' || !Store.available) return 'clear';
        // durableGet, NOT get. Store.get answers from Store.memory first, and memory holds
        // what THIS window last wrote - so for any window that has saved even once the
        // comparison below was its own text against its own text, and the verdict was
        // 'clear' every time. The guard protected only a window that had never written,
        // which is the one case it was not needed for. durableGet exists for exactly this
        // question - "what would the next session see" - and bypasses the cache without
        // changing what Store.get means for everybody else.
        const held = Store.durableGet(V2_KEY);
        if (typeof held !== 'string') return 'clear';   // nothing there to lose
        if (held === this.durableText) return 'clear';

        // THE SAME GATE loadRecord KEEPS, and for the same reason it keeps it.
        //
        // rollback() only parses and normalises, and normaliseSchedule answers with a
        // schedule-shaped object for very nearly anything - that is its job. So adopting
        // the disk through rollback() alone would take a damaged record into memory, and
        // the save after it would write that back over the only copy of the damage there
        // is. loadRecord refuses such a record and quarantines it; this must too, and
        // through the same two functions rather than a second opinion about what a
        // schedule is.
        let problems;
        try {
            const upgraded = upgradeStoredSchedule(JSON.parse(held));
            problems = upgraded
                ? storedScheduleProblems(upgraded)
                : ['הרישום השמור אינו מסמך של לוח עבודה.'];
        } catch (error) {
            problems = ['הרישום השמור במכשיר לא נקרא: '
                + String((error && error.message) || error)];
        }
        if (problems.length > 0) {
            // The original stays where it is and a copy is set aside. The caller refuses
            // on this answer rather than leaning on the write being blocked: whether the
            // hold stands depends on whether the copy could be made, and "the disk may
            // not be overwritten" must not depend on that.
            if (typeof Recovery !== 'undefined' && Recovery.damaged) {
                Recovery.damaged(V2_KEY, held,
                    'הרישום השמור במכשיר לא נקרא: ' + problems[0]);
            }
            return 'unreadable';
        }

        // NO BASE AT ALL IS NOT "NO CONFLICT IS POSSIBLE".
        //
        // This test used to be the first line of the function, and it answered 'clear' -
        // so a window that had never successfully read or written the record treated
        // every disk state as its own and wrote the whole schedule over it. That window
        // is not exotic: it is the second window of a new project, open before the first
        // record exists, and for as long as its own save never lands it has no base. Every
        // man the first window recorded was erased by its first ordinary edit, with no
        // hold, no refusal and nothing said. The journal did recover them - and the
        // journal is collected the moment the cloud has the operation and the disk holds
        // it, so that is not a guarantee. Measured in tests/codex3.probes.test.mjs, D1,
        // which asks the RECORD and not the reopen.
        //
        // "I have no base" means "I have not read this record", and the honest answer to
        // that is to read it: adopt the disk and replay this window's journal over it,
        // which is the same repair the rebase below makes and loses nothing, because
        // journal-first put the edit being committed there before any of this ran.
        if (typeof this.durableText !== 'string') {
            if (!this.adoptDiskBaseline(held)) return 'unsafe';
            return journalled ? 'rebased' : 'unsafe';
        }

        if (!journalled) return 'unsafe';

        // A FIELD BOTH WINDOWS HAVE CHANGED IS A CONFLICT, AND NOT THIS CODE'S TO SETTLE.
        //
        // The rebase adopts the disk and replays this window's journal over it. That is a
        // merge only where the two windows touched different fields. Where they touched
        // the SAME worker-day it is not a merge at all: the journal entry is the WHOLE
        // record for that field, so replaying it puts back a site the other window
        // deliberately removed and takes their edit off the disk with nobody told.
        //
        // The comparison is against what THIS window last agreed the disk held - the
        // version the person was looking at when they made their edit - and never against
        // the value just read off the disk. Reading a newer value is not the person
        // consenting to replace it.
        const contested = this.contestedPaths(held);
        if (contested.length > 0) {
            // Both sides are kept: theirs is what the disk already holds and is left
            // alone, ours stays in the journal and is marked held so that nothing sends
            // it behind the person's back. The ⋯ panel shows the pair and releases them
            // one at a time - the machinery that already exists for exactly this.
            //
            // The three sides go with it, apart: what the person was looking at, and
            // what the other writer had put there. Handing over only "mine" would leave
            // the panel asking somebody to decide against nothing, and a newer value on
            // the disk is not the person agreeing to be replaced by it.
            if (typeof FarkadSync !== 'undefined' && FarkadSync.holdHere) {
                let seenDoc = null;
                let diskDoc = null;
                try { seenDoc = JSON.parse(this.durableText); } catch (error) { seenDoc = null; }
                try { diskDoc = JSON.parse(held); } catch (error) { diskDoc = null; }
                const at = (document, path) => {
                    const parts = String(path).split('.');
                    let node = document;
                    for (let step = 0; step < parts.length; step += 1) {
                        if (!node || typeof node !== 'object') return undefined;
                        node = node[parts[step]];
                    }
                    return node;
                };
                contested.forEach(path => FarkadSync.holdHere(path, {
                    seen: at(seenDoc, path),
                    disk: at(diskDoc, path)
                }));
            }
            return 'contested';
        }

        // Readable, no field contested, and the journal can rebuild the edit. If the
        // rebase still fails - normaliseSchedule throwing on a record the two validators
        // passed - nothing was adopted and nothing may be written either.
        return this.adoptDiskBaseline(held) ? 'rebased' : 'unsafe';
    },

    // WHAT THIS PLATFORM CAN AND CANNOT GUARANTEE, AND WHAT IS CLAIMED HERE INSTEAD.
    //
    // There was a lock here, built from reading localStorage and then writing a token to
    // it. It was not a lock. Two windows can both read "free" before either writes, and
    // both then believe they hold it; a read followed by a write is not a test-and-set,
    // and localStorage offers no test-and-set, no transaction, and no compare-and-swap.
    // Widening the staleness bound or changing the token does not touch that - the flaw
    // is in the shape of the protocol, not in its constants. It has been removed rather
    // than tuned, because a guard that is believed and does not hold is worse than none.
    //
    // The platform DOES have one real primitive: navigator.locks, which is genuinely
    // exclusive across windows of one origin. It is ASYNCHRONOUS. Every write path in
    // this app is synchronous by construction - commit() returns a verdict that
    // editWithUndo branches on in the same tick, and the undo bar, the sheet's advance to
    // the next worker and the refusal dialog all read that answer. Making the write path
    // async is a different app, not a repair.
    //
    // SO THE GUARANTEE IS NOT EXCLUSION. It is this, and it is what the suites measure:
    //
    //   A committed edit is never lost. It is in the stored record, or it is in the
    //   journal and a reopen produces it.
    //
    // Three things hold that up:
    //
    //   1. OWNERSHIP BY KEY. Every operation is journalled under a key only its own
    //      writer writes (farkad:outbox:op:<id>). A single setItem is atomic, and two
    //      windows writing different keys never collide. The journal is the record; the
    //      schedule blob is a projection of it.
    //   2. VALIDATE, THEN RE-VALIDATE IMMEDIATELY BEFORE WRITING. diskVerdict reads the
    //      real disk and refuses a contested field. writeIfStillCurrent re-reads once
    //      more in the instruction before the write, so the gap between the reading a
    //      decision was made on and the write it authorises is as narrow as a synchronous
    //      language permits.
    //   3. THE COLLECTOR'S GATE. An operation is dropped only when the cloud has it AND
    //      the STORED schedule demonstrably holds its value. A write that was overwritten
    //      therefore cannot take its operation with it: the gate reads the disk at
    //      collection time, finds the value gone, and keeps the operation.
    //
    // WHAT IS LEFT, STATED AND NOT PAPERED OVER: between the last read and the setItem
    // that follows it, another window's setItem can land, and this one will overwrite it.
    // That window is irreducible without an atomic primitive. It is not a loss, because
    // of (1) and (3) - the overwritten window's operations are still under its own keys
    // and are not collectable while the record lacks them - and tests/codex2.probes
    // measures exactly that, by reading the worker's value back after a reopen rather
    // than by believing a save that returned true.
    //
    // The disk as it would be seen by the next session. One reading, one meaning.
    recordOnDisk() {
        if (typeof Store === 'undefined' || !Store.available) return null;
        return Store.durableGet(V2_KEY);
    },

    // Best effort, and it says so. A shadow that cannot be written costs the recovery of
    // G2 and nothing else: the record itself has already landed and been read back by the
    // line above this one, so no edit is at risk from this failing.
    // OPTIONAL, in Store's own sense of the word: a write the app can live without. It
    // never reclaims - buying room for a stamp by deleting somebody's restore points
    // would be the stamp costing more than it is worth - and it never raises `full`,
    // which is reserved for a write that actually mattered. About sixty bytes, which is
    // the whole point: see STAMP_KEY for what a full copy cost and why it is gone.
    rememberConfirmed(text) {
        if (typeof Store === 'undefined' || !Store.available) return false;
        let at = null;
        try { at = JSON.parse(text).updatedAt; } catch (error) { at = null; }
        if (typeof at !== 'string') return false;
        try { return Store.setVerified(STAMP_KEY, at, { optional: true }) === true; }
        catch (error) { return false; }
    },

    confirmedStamp() {
        if (typeof Store === 'undefined' || !Store.available) return null;
        try { return Store.durableGet(STAMP_KEY); } catch (error) { return null; }
    },

    // HAS SOMETHING OLDER REPLACED THE RECORD?
    //
    // ASKED OF WHAT IS MISSING, NOT OF A TIMESTAMP.
    //
    // THE TIMESTAMP VERSION OF THIS WAS DEAD ON THE ONE PATH IT EXISTED FOR, and the
    // review that found it was right. It asked `recordOnDisk().updatedAt < theStamp`,
    // reasoning that a writer carrying older bytes carries an older stamp. It does not:
    // `save` a few lines down sets updatedAt to `new Date()` on every write, and so does
    // every build this app has ever shipped. An older build writing its own stale memory
    // is RUNNING, so it stamps NOW - the comparison answered false exactly when it
    // mattered, and the three suites that covered it only passed because they forced an
    // old stamp into the bytes by hand, which nothing in the field does.
    //
    // The question that is actually answerable: does the record hold NOTHING where this
    // device has a confirmed value? The ring is the list of those (see KEPT_PREFIX), and
    // absence is the signal because it is the only one that cannot be confused with
    // somebody else's newer decision:
    //
    //   nothing there   - an older build's copy never had this field. A loss, and ours
    //                     to put back.
    //   something else  - another phone corrected it and a snapshot brought the
    //                     correction. NOT a loss, and re-applying the ring over it would
    //                     be this device overruling a decision somebody else made. The
    //                     timestamp version could not tell these apart either.
    //   nothing, and the ring says nothing too - a day somebody cleared on purpose, and
    //                     the clearing was itself confirmed. Nothing to put back.
    //
    // A Rima count is not asked at all: its clear is a deleted field, so "nothing there"
    // cannot tell an older build's copy from another phone's clear. See lostFields.
    //
    // The stamp is kept because `⋯` reads it, and because it is what tells a person WHEN
    // the record they are looking at was last confirmed by this device. It is no longer
    // the trigger.
    recordRegressed() {
        return this.lostFields().length > 0;
    },

    // The confirmed fields the record on the disk holds nothing at. The answer to
    // recordRegressed, and the list the recovery applies - asked once so the two can
    // never disagree about what was lost.
    lostFields() {
        const held = this.recordOnDisk();
        if (typeof held !== 'string') return [];
        if (typeof FarkadSync === 'undefined' || !FarkadSync.keptEntries) return [];
        let theirs = null;
        try { theirs = JSON.parse(held); } catch (error) { return []; }
        const nothing = value => value === undefined || value === null;
        const coldNamed = (typeof coldReaderActive === 'function' && coldReaderActive())
            ? coldUnitsNamed(theirs) : [];
        return FarkadSync.keptEntries().filter(entry => {
            if (nothing(entry.value)) return false;
            // A RIMA COUNT IS NEVER A LOSS TO PUT BACK (v166). Its clear is a deleted field
            // - the very absence read here as "an older build never had it" - so an entry
            // for one would lay a count somebody cleared back over the clear. The keep loop
            // no longer writes one (js/sync/sync.js); an entry already in the ring is
            // refused here, because this is where boot reads it.
            if (isRimaFieldPath(entry.path)) return false;
            // NOR IS A FIELD THE COLD STORE KEEPS (Phase 7). The record on the disk holds
            // nothing there by design - it is in a unit - and reading that as "an older
            // build's copy never had it" would call every boot a regression.
            if (coldNamed.some(unit => (unit.kind === 'month'
                    ? String(entry.path).indexOf('days.' + unit.month + '-') === 0
                    : unit.paths.some(path => entry.path === path || String(entry.path).indexOf(path + '.') === 0)))) {
                return false;
            }
            return nothing(readPath(theirs, entry.path));
        });
    },

    // Whether the record is still the one the decision above was made against. Asked in
    // the instruction before the write, which is the last moment anything can be asked.
    stillCurrent() {
        if (typeof Store === 'undefined' || !Store.available) return true;
        const held = this.recordOnDisk();
        if (typeof held !== 'string') return true;      // nothing there to lose
        // A window with no base has not read this record, so it is not current with it -
        // the same answer diskVerdict now gives, and for the same reason. Answering true
        // here was the other half of D1: the verdict was made to say 'clear' and then the
        // write was let through by the check that exists to catch exactly this.
        if (typeof this.durableText !== 'string') return false;
        return held === this.durableText;
    },

    // The field paths this window has queued that the disk ALSO moved since this window
    // last agreed with it. One entry here is a genuine two-window conflict over one
    // record; an empty answer means the two windows wrote about different things and the
    // rebase is a merge that loses nothing.
    contestedPaths(held) {
        if (typeof FarkadSync === 'undefined' || !FarkadSync.pendingPaths) return [];
        let base;
        let theirs;
        try {
            base = JSON.parse(this.durableText);
            theirs = JSON.parse(held);
        } catch (error) {
            // Unparseable is handled above this; answering "no conflict" here would be a
            // second opinion about the same bytes.
            return [];
        }
        const at = (document, path) => {
            const parts = String(path).split('.');
            let node = document;
            for (let step = 0; step < parts.length; step += 1) {
                if (!node || typeof node !== 'object') return undefined;
                node = node[parts[step]];
            }
            return node;
        };
        const same = (one, other) => {
            try { return JSON.stringify(one) === JSON.stringify(other); }
            catch (error) { return false; }
        };
        let pending;
        try { pending = FarkadSync.pendingPaths() || []; } catch (error) { return []; }

        // THREE SIDES, and all three are needed.
        //
        //   base   - the record as this window last agreed the disk held it: the version
        //            the person was looking at when they made their edit.
        //   theirs - what the disk holds now.
        //   mine   - what this window holds in memory, which is base plus what the person
        //            has just done.
        //
        // A field is contested only when BOTH have moved away from base. Where only
        // theirs moved, the other window is the only one with an opinion and the rebase
        // takes it. Where only mine moved, nobody is arguing.
        //
        // The queue cannot answer "is this mine": on one phone the journal is ONE journal,
        // shared by every window of the app, so the other window's own operations are in
        // it too. Asking the queue made every path the other window had touched look
        // contested. Memory is what distinguishes them, because memory is per window.
        return pending.filter(path => {
            const theirSide = at(theirs, path);
            if (same(at(base, path), theirSide)) return false;
            return !same(at(this.schedule, path), theirSide)
                && !same(at(this.schedule, path), at(base, path));
        });
    },

    save(options) {
        // Blocked: either the page and the scripts are from different builds, or a
        // damaged record is sitting under one of these keys. Either way what is already
        // saved stays saved and nothing new is written. See js/recovery.js.
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return false;

        // THE LAST DOOR, AND IT IS INSIDE THE FUNCTION THAT WRITES.
        //
        // guardedSave validates, writes and re-validates around this call, and that is
        // where the verdict a person is told about is decided. This is not a second
        // opinion on that verdict. It is here because `save` writes the WHOLE schedule
        // and was reachable WITHOUT the guard - the boot-time ledger mirror calls it
        // directly - so the only thing keeping a whole-record write off a record this
        // window had not read was every caller remembering to ask first. A guarantee that
        // rests on that is not a guarantee, and the independent review named `save`
        // alongside the three commits for exactly this reason.
        //
        // It also narrows the window the comment above recordOnDisk is honest about:
        // nothing at all happens between this reading and the setItem below.
        //
        // `whole` is the one declared exception, and it belongs to the transactions whose
        // PURPOSE is to replace the whole record: the restore, in js/sync/restore.js.
        // Refusing those here would break the one door the record is rebuilt through.
        if (!(options && options.whole) && !this.stillCurrent()) return false;

        this.schedule.updatedAt = new Date().toISOString();
        this.schedule.updatedBy = syncDeviceId();

        // Verified, not assumed. This is the record; a write that did not land is the
        // evening gone at the next reload, and the old line here could not tell the
        // difference between that and a save.
        const forDisk = this.coldForDisk();
        const text = JSON.stringify(forDisk);
        const landed = Store.setVerified(V2_KEY, text);
        this.saveFailed = !landed;
        if (landed) this.coldNote(forDisk);

        // DID OUR WRITE SURVIVE THE INSTANT AFTER IT?
        //
        // setVerified reads back immediately, which catches a disk that accepted the
        // write and stored something else. It cannot catch another window writing a
        // moment later - nothing synchronous can. This second reading is not a guarantee
        // and is not treated as one: it is the one place a clobber becomes VISIBLE
        // rather than silent, so the collector, the status line and the suites have a
        // fact to work from instead of an assumption. See recordOnDisk.
        this.lastWriteWon = landed && this.recordOnDisk() === text;

        if (landed) {
            this.durableText = text;
            this.rememberConfirmed(text);
            // Everything journalled up to now is inside the blob just written, so the
            // journal no longer has to hold the ones the cloud already has.
            if (typeof FarkadSync !== 'undefined' && FarkadSync.markSaved) FarkadSync.markSaved();
            // A different object than the mirror last saw means a restore just landed
            // here - every one of its doors ends in this save - carrying advances whose
            // entries its document may never have held. See migrateSoon.
            if (this.mirrored && this.mirrored !== this.schedule) this.migrateSoon();
        }

        // Only on success. Telling the sync layer that something changed here when
        // nothing was stored sends a bare timestamp for an edit that does not exist,
        // and moves the document's clock forward over work that was never recorded.
        if (landed && !(options && options.silent) && typeof FarkadSync !== 'undefined') {
            FarkadSync.onLocalChange(this.schedule);
        }
        if (!landed && typeof updateSyncNotice === 'function') updateSyncNotice();

        return landed;
    },

    // Back to the last state this device is known to hold, and then forward again through
    // the journal - which is exactly what a reopen would do. Used when an edit turns out
    // to have nowhere durable to live: the screen must not keep showing something the
    // device cannot produce again.
    rollback() {
        // NOTHING DURABLE BEHIND THE SCREEN IS A STATE, not a reason to do nothing.
        //
        // durableText is set by a successful save, a successful persist, or a load that
        // FOUND a readable schedule. The one session where none of those has happened is
        // the session that opened onto a damaged record - and that is exactly the session
        // where somebody re-types the week they can see is missing. Answering false here
        // left every refused edit standing on the screen under a dialog reading «השינוי
        // בוטל כדי שלא ייראה כאילו נרשם»: the next ordinary save carried those days to
        // the disk with no journal entry behind them, and the first snapshot from another
        // phone wrote over them with nothing able to put them back.
        //
        // What a reopen of this device would produce is the empty schedule with the
        // journal replayed onto it - which is what this function promises - so that is
        // what it does. Nothing is lost by it: durableText being unset means no save has
        // ever succeeded, so there is no recorded work in memory to throw away.
        const durable = typeof this.durableText === 'string' ? this.durableText : null;

        try {
            // (The units the cold store keeps are laid back BEFORE the record is
            // normalised, so that memory is what a phone holding everything in one place
            // would hold - from what the cold store handed this session, or from the
            // memory being replaced: a unit never changes. See coldLaid.)
            if (durable === null) {
                this.schedule = emptySchedule();
            } else {
                const parsed = JSON.parse(durable);
                this.coldNote(parsed);
                this.schedule = normaliseSchedule(this.coldLaid(parsed));
            }
        } catch (error) {
            return false;
        }
        if (typeof FarkadSync !== 'undefined' && FarkadSync.reloadJournal) {
            // Off the disk, not out of memory. The entries that failed to write are the
            // ones being rolled back, and replaying them would put the edit straight
            // back on the screen it was just removed from.
            FarkadSync.reloadJournal();
            FarkadSync.replayJournal(this.schedule, FarkadSync.supersededFloor());
        }
        // The fresh parse is a new object; without re-pinning, the next successful save
        // would read the identity change as "a restore landed" and fire an unasked-for
        // ledger mirror over an ordinary refused edit.
        this.mirrored = this.schedule;
        return true;
    },

    // A roster change: who exists, their rates, and the order they are read in. Saved and
    // SENT - a roster edit that only saved locally was overwritten by the next snapshot
    // from another phone, taking any days recorded against a new worker with it.
    // `removed` is passed straight through to editRoster: see the note there. It is how a
    // deletion reaches the other two phones on a device that has never had a snapshot.
    commitRoster(removed, changes) {
        const queued = typeof FarkadSync !== 'undefined' && FarkadSync.editRoster
            ? Boolean(FarkadSync.editRoster(this.schedule, removed, { changes }))
            : false;
        const journalled = queued || !Store.available;

        if (!journalled) return this.refuseEdit();

        // THE SAME GUARD AS THE OTHER TWO DOORS, and it was missing here.
        //
        // save() writes the WHOLE schedule, days included. A roster edit made in a window
        // that has gone out of date therefore carried that window's copy of every
        // recorded day back onto the disk - so renaming one man silently rewrote another
        // man's work. The roster edit itself is about names and rates and has nothing to
        // do with days, which is exactly why nobody would look for the loss there.
        //
        // `queued` is what the journal is holding: editRoster's own entries, which a
        // replay can rebuild this change from.
        if (!this.guardedSave(queued)) return false;
        return true;
    },

    // Every mutation goes through here: it writes locally and hands the sync layer the
    // single field path that changed, which is what keeps three people editing the same
    // evening from overwriting one another.
    // Returns whether the edit is now somewhere that survives the app being closed.
    //
    // The mutation has already happened in memory by the time this runs - the caller
    // changed the schedule and handed over the field path. What this decides is whether
    // that change is allowed to STAND, and it stands only if at least one durable record
    // holds it:
    //
    //   the schedule, written and read back;  or
    //   the journal, written and read back, which rebuilds it at the next boot with no
    //   cloud involved at all.
    //
    // If neither, memory goes back to what the device can actually produce again and the
    // person is told. An edit that is on the screen and nowhere else is the worst outcome
    // available here: it looks done, it reads back all evening, and it is gone in the
    // morning.
    commit(change) {
        // Whether the last commit that answered false was nonetheless KEPT in the journal
        // (v166) - see refuseEdit. Read by the controls that keep a one-step undo: an edit
        // that is owed to the cloud is an edit, and the step before it is not the last one.
        this.lastCommitKept = false;
        // A write the model refused. Nothing is saved and nothing is sent, and the reason
        // is said out loud - a refusal handled in silence looks exactly like a tap that
        // did not register, and the person taps again.
        if (change && change.refused) {
            if (typeof askTell === 'function') askTell(change.reason);
            return false;
        }
        if (this.refuseArchivedMonth([change])) return false;
        if (this.refuseColdMoney([change])) return false;

        // The journal first, and the schedule only if the journal took it.
        //
        // The journal is the smaller write by a long way - one field against the whole
        // record - so in practice it is the one that fits. Making it the gate rather than
        // one of two alternatives buys something the alternative version could not: every
        // committed edit is in the journal, always, so an arriving snapshot can always be
        // told what to put back on top of itself. The version where a schedule write
        // alone was enough left an edit on the disk that nothing would ever send and
        // nothing could re-apply - and the next older snapshot from another phone took it
        // off the device.
        //
        // Writing the schedule only afterwards is what keeps the disk from getting ahead
        // of the screen: a refused edit is never written anywhere.
        if (!this.journal(change)) return this.refuseEdit();

        // FROM HERE THE EDIT IS DURABLE. It is in the journal, it will be replayed at the
        // next open, and it is owed to the cloud - so nothing below may describe it as
        // cancelled. See refuseEdit's `kept`.
        return this.guardedSave(Boolean(change && change.path));
    },

    // The whole-schedule write, with the disk between two windows taken into account.
    // Shared by the three doors that reach save() with a journalled edit behind them.
    //
    // `journalled` says whether the journal is holding something a replay could rebuild
    // this edit from. The lock is taken FIRST, so the verdict's read and the write it
    // guards are one critical section rather than two steps with a gap between them.
    guardedSave(journalled) {
        // VALIDATE, RE-VALIDATE, WRITE - and go round again if the disk moved in between.
        //
        // The loop is what replaces the lock. Each pass reads the real disk, decides, and
        // then checks once more that the record is still the one it decided against; if
        // another window wrote in that gap the decision is stale and is made again rather
        // than acted on. Bounded, because an unbounded retry on the main thread is a hung
        // screen: after three passes the answer is that the record is too busy to write
        // into right now, which is true, and the edit stays in the journal.
        for (let pass = 0; pass < 3; pass += 1) {
            const verdict = this.diskVerdict(journalled);
            if (verdict !== 'clear' && verdict !== 'rebased') {
                return this.refuseEdit({ kept: journalled, verdict });
            }
            // The last thing asked before the write. A disk that moved since the verdict
            // invalidates it - including the case where the verdict was 'rebased' and the
            // baseline it adopted is already out of date.
            if (!this.stillCurrent()) continue;

            // A SCHEDULE WRITE THAT FAILS IS NOT A REFUSAL WHEN THE JOURNAL TOOK THE EDIT.
            //
            // save() answers false on a full or blocked device. The edit is still on this
            // disk - journal-first put it there before any of this - so a reopen rebuilds
            // it, and that is why it may stand on the screen: the screen and the device
            // agree. save() has already raised saveFailed and the notice that says the
            // record itself could not be written. Rolling back here would take a durable
            // edit off the screen and tell the person it did not happen, which is the
            // opposite of the truth and is pinned against in tests/data.test.mjs.
            //
            // With nothing journalled there is nothing to stand on, and the refusal is
            // the honest answer - EXCEPT in a browser that has no durable storage at all,
            // where an edit standing in memory is the deliberate behaviour and the app
            // says so in a permanent banner. That is what `journal` and `journalBatch`
            // mean by answering true when Store.available is false; commitRoster hands
            // over `queued` - what the journal is actually holding - which is false in
            // exactly that browser. Reading it as "nothing to stand on" took the added
            // worker back off the screen and told the person the device was full, in the
            // one browser where that is not what happened. Measured in tests/smoke.mjs,
            // in the sandboxed frame.
            const wrote = this.save();
            if (wrote) {
                render();
                return true;
            }
            // REFUSED BY THE RECORD MOVING, NOT BY THE DISK - so decide again.
            //
            // save() asks stillCurrent() once more in the instruction before its own
            // write, which is the narrowest the gap gets. When that is what refused it,
            // this pass was simply built on a record that is no longer there, and going
            // round produces a fresh verdict that can rebase onto what the other window
            // wrote and then land. Leaving it here instead would let the edit stand on
            // the screen with the record never written, which is exactly the quiet
            // divergence the whole round is about. Bounded by the same three passes.
            if (!this.stillCurrent()) continue;
            const nowhereDurable = typeof Store === 'undefined' || !Store.available;
            if (journalled || nowhereDurable) {
                render();
                return true;
            }
            return this.refuseEdit({ kept: false, verdict: 'unwritten' });
        }
        return this.refuseEdit({ kept: journalled, verdict: 'busy' });
    },

    // Puts one change in the journal. True when it is durably there - or when this
    // browser has no durable storage at all, which is a different situation and an
    // honest one: the app says so in a permanent banner, so an edit accepted here is not
    // being passed off as saved.
    journal(change) {
        if (!change || !change.path) return true;
        if (typeof FarkadSync === 'undefined') return !Store.available;
        return Boolean(FarkadSync.edit(change.path, change.value)) || !Store.available;
    },

    // The same, for several changes at once, as a single write.
    journalBatch(changes) {
        const entries = (changes || [])
            .filter(change => change && change.path)
            .map(change => ({ path: change.path, value: change.value }));
        if (entries.length === 0) return true;
        if (typeof FarkadSync === 'undefined') return !Store.available;

        const journalled = Boolean(FarkadSync.queueBatch(entries));
        if (journalled && FarkadSync.adapter) FarkadSync.scheduleFlush();
        return journalled || !Store.available;
    },

    // A DAY OF A MONTH THAT HAS LEFT THE LIVE DOCUMENT IS NOT EDITED (Phase 6).
    //
    // The month was closed and settled for every man in it and its days are in a month
    // document that is never rewritten; the server refuses any write to one of its dates.
    // So the edit is refused HERE, before the journal: nothing is queued, nothing is owed,
    // memory goes back to what the device holds (callers change memory before they
    // commit), and the person is told why and what to do instead. Refused whole - a batch
    // with one such path in it is not half-written. True when it refused.
    refuseArchivedMonth(changes) {
        if (typeof monthArchivedPath !== 'function') return false;
        const hit = (changes || []).some(change => change && change.path
            && monthArchivedPath(this.schedule, change.path));
        if (!hit) return false;
        this.rollback();
        if (typeof render === 'function') render();
        if (typeof askTell === 'function') {
            askTell({ title: MONTH_TEXT.refusedTitle, message: MONTH_TEXT.refused });
        }
        return true;
    },

    // ------------------------------------------------------------ the cold store (Phase 7)
    //
    // Memory holds the whole record. The localStorage record gives up what has left the
    // server's live document once the cold store (js/cold.js) has been READ BACK holding
    // it. Everything State needs to know about that is here.

    // What the localStorage record held when this window last read or wrote it: how many
    // days of each month, and which ledger and pay entries. A skeleton, never the
    // record - it answers one question, "does the disk hold this unit", without parsing
    // megabytes on every save.
    coldNote(record) {
        if (typeof coldReaderActive !== 'function' || !coldReaderActive()) { this.coldOnDisk = null; return; }
        const keysOf = map => {
            const out = {};
            if (map && typeof map === 'object') Object.keys(map).forEach(key => { out[key] = true; });
            return out;
        };
        this.coldOnDisk = {
            days: coldDayCounts(record),
            ledger: { advances: keysOf(record && record.ledger && record.ledger.advances) },
            pay: keysOf(record && record.pay)
        };
    },

    // WHAT A WRITE OF THE RECORD MAY LEAVE OUT. One rule:
    //
    //   - a unit this SESSION read back from the cold store with the right digest; or
    //   - a unit the localStorage record does not hold now.
    //
    // Never a unit on the strength of a mark alone: a mark says the cold store held it
    // once, and a browser may have evicted the cold store since. And never ADDS one: a
    // phone that refetched years of archive from the server must not try to put them
    // into five megabytes. A unit the record holds and nothing has read back stays in
    // the record - in both places is the safe side of every doubt.
    coldStripSet() {
        if (typeof coldReaderActive !== 'function' || !coldReaderActive()) return [];
        // No record under the key at all is a reading too: the disk holds none of it.
        const disk = this.coldOnDisk || (this.recordOnDisk() === null
            ? { days: {}, ledger: { advances: {} }, pay: {} } : null);
        const counts = coldDayCounts(this.schedule);
        return coldUnitsNamed(this.schedule).filter(unit => {
            if (Cold.verified[unit.key] === true) return true;
            // No reading of the disk at all (a first write): what memory holds is written.
            if (!disk) return false;
            const onDisk = unit.kind === 'month'
                ? (disk.days[unit.month] || 0) > 0
                : unit.paths.some(path => coldReadAt(disk, path) === true);
            if (onDisk) return false;
            // Not on the disk. Leaving it out changes nothing there - and if memory does
            // not hold it either there is nothing to leave out.
            return coldUnitHeld(this.schedule, unit, counts);
        }).map(unit => unit.key);
    },

    // The record as it is written to localStorage. The SAME OBJECT as memory when the
    // reader is not active, so that with the flag shut the bytes are today's bytes.
    coldForDisk() {
        if (typeof coldReaderActive !== 'function' || !coldReaderActive()) return this.schedule;
        return coldStrip(this.schedule, this.coldStripSet());
    },

    // A record just parsed off the disk, with every unit that can be produced laid back.
    coldLaid(raw) {
        if (typeof Cold === 'undefined' || !Cold.layInto) return raw;
        try { return Cold.layInto(raw, this.schedule); } catch (error) { return raw; }
    },

    // The units the indexes name that memory does not hold. Empty on every phone there
    // has ever been; while it is not, the record has a hole and SAYS so.
    coldMissing() {
        if (typeof coldUnitsNamed !== 'function') return [];
        const named = coldUnitsNamed(this.schedule);
        if (named.length === 0) return [];
        const counts = coldDayCounts(this.schedule);
        return named.filter(unit => !coldUnitHeld(this.schedule, unit, counts)).map(unit => unit.key);
    },

    // Null, or the sentence for why nothing computed over the archive may be shown.
    //
    // ALL of it, not only a range that touches a missing month: a missing closure makes
    // every advance read as never deducted and every closed period as open, in any range.
    coldRefusal() {
        const missing = this.coldMissing();
        if (missing.length === 0) return null;
        if (typeof Cold !== 'undefined' && Cold.state === 'loading') return COLD_TEXT.loading;
        const offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
        return COLD_TEXT.missing + (offline ? ' ' + COLD_TEXT.missingOffline : '');
    },

    // Is this day one the record cannot show - a day of an archived month whose copy is
    // not on this phone? An empty day would read as "nobody worked".
    coldMissingDay(date) {
        const month = String(date).slice(0, 7);
        return this.coldMissing().indexOf('m:' + month) !== -1;
    },

    // AN EDIT OF MONEY WHILE THE ARCHIVE IS NOT WHOLE. An advance, a repayment, a
    // correction, a closure: each is planned against folds that are missing entries, and
    // a closure of a period whose own closure is among the missing would be written under
    // an id the record already has on the server. Refused before the journal, like an
    // edit of an archived day. True when it refused.
    refuseColdMoney(changes) {
        const money = (changes || []).some(change => change && typeof change.path === 'string'
            && /^(ledger|advances|pay)\./.test(change.path));
        if (!money || this.coldMissing().length === 0) return false;
        this.rollback();
        if (typeof render === 'function') render();
        if (typeof askTell === 'function') {
            askTell({ title: COLD_TEXT.refusedTitle, message: COLD_TEXT.refusedMoney });
        }
        return true;
    },

    // The cold store finished reading (or a unit arrived late): if it produced anything
    // memory lacks, memory is rebuilt the way a reopen would build it - the disk, the
    // units, the journal. True when memory changed.
    coldRebuild() {
        if (typeof this.durableText !== 'string') return false;
        const missing = this.coldMissing();
        if (!missing.some(key => Cold.verified[key] === true)) return false;
        return this.rollback();
    },

    // Is a unit that was read back still in the localStorage record?
    coldDropOwed() {
        const disk = this.coldOnDisk;
        if (!disk || typeof coldUnitsNamed !== 'function') return false;
        return coldUnitsNamed(this.schedule).some(unit => Cold.verified[unit.key] === true
            && (unit.kind === 'month' ? (disk.days[unit.month] || 0) > 0
                : unit.paths.some(path => coldReadAt(disk, path) === true)));
    },

    // THE DROP: the record written again, now without what the cold store was read back
    // holding. Only onto the record this window last agreed with - a second window's
    // newer record is never written over for this; the next ordinary save drops instead.
    coldDrop() {
        if (!this.stillCurrent()) return false;
        this._coldDropping = true;
        try { return this.persist(); } finally { this._coldDropping = false; }
    },

    // The shared ending for a commit with nowhere to live.
    refuseEdit(options) {
        this.rollback();
        render();

        // AN EDIT THE JOURNAL IS HOLDING WAS NOT CANCELLED, AND MUST NOT BE CALLED
        // CANCELLED.
        //
        // The two sentences below were written for the one case this function originally
        // had: the journal itself would not take the edit, so nothing of it existed
        // anywhere and «השינוי בוטל כדי שלא ייראה כאילו נרשם» was exactly true. The disk
        // guard reaches here from the other side - the journal HAS taken the edit, it is
        // on this device, rollback() has just replayed it back onto the screen, and it is
        // still owed to the cloud. Telling the person it was cancelled is false about the
        // one thing they need to be able to trust, and it invites them to type the
        // evening again over a record that already holds it.
        //
        // Nothing is dropped from the queue here. The operation stays exactly where it
        // was; what changes is only what the person is told about it.
        if (options && options.kept) {
            this.lastCommitKept = true;
            if (typeof askTell === 'function') {
                askTell({
                    title: 'הרישום לא נכתב למכשיר',
                    message: 'השינוי נשמר ברשימת ההמתנה ולא אבד, אבל לא הצלחנו לכתוב ' +
                        'אותו לרישום שבמכשיר כרגע. מה שכבר שמור לא נפגע. נסה שוב בעוד ' +
                        'רגע, ואם זה חוזר - פתח את ⋯ כדי לראות מה ממתין.'
                });
            }
            return false;
        }

        // Two different refusals, and the dialog must name the right one. A held
        // transaction - quarantine, a build mismatch - is not a space problem, and
        // claiming "אין מקום" over it sends somebody to delete photos that will not
        // help; the banner at the top of the screen carries the real story.
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
            // The backup export still works in every held state (its own writes go
            // through paths the hold does not cover), and it is the way tonight's
            // roster continues from another phone - withholding it here withheld the
            // one working exit.
            if (typeof askConfirm === 'function' && typeof exportBackup === 'function') {
                askConfirm({
                    title: 'הרישום לא נשמר',
                    message: 'הרישום מושבת כרגע - הסיבה כתובה בהודעה שבראש המסך. השינוי ' +
                        'בוטל כדי שלא ייראה כאילו נרשם. מה שכבר שמור לא נפגע. ' +
                        'אפשר לייצא קובץ גיבוי ולהמשיך ממכשיר אחר.',
                    ok: 'ייצוא קובץ גיבוי',
                    cancel: 'סגור'
                }).then(wantsBackup => {
                    if (wantsBackup && typeof Blob !== 'undefined') exportBackup();
                });
            } else if (typeof askTell === 'function') {
                askTell({
                    title: 'הרישום לא נשמר',
                    message: 'הרישום מושבת כרגע - הסיבה כתובה בהודעה שבראש המסך. השינוי ' +
                        'בוטל כדי שלא ייראה כאילו נרשם. מה שכבר שמור לא נפגע.'
                });
            }
            return false;
        }
        // The board's dialog carries the way out as its primary action, not only as a
        // sentence: the backup is the one thing that still works on a full device.
        if (typeof askConfirm === 'function' && typeof exportBackup === 'function') {
            askConfirm({
                title: 'הרישום לא נשמר',
                message: 'אין מקום פנוי במכשיר, ולכן לא הצלחנו לשמור את השינוי - הוא בוטל ' +
                    'כדי שלא ייראה כאילו נרשם. מה שכבר שמור לא נפגע. פנה מקום במכשיר ' +
                    'או ייצא קובץ גיבוי, ונסה שוב.',
                ok: 'ייצוא קובץ גיבוי',
                cancel: 'סגור'
            }).then(wantsBackup => {
                // The test harness answers every dialog yes and has no Blob to export
                // with; a browser always has one. The guard is for the harness only.
                if (wantsBackup && typeof Blob !== 'undefined') exportBackup();
            });
        } else if (typeof askTell === 'function') {
            askTell({
                title: 'הרישום לא נשמר',
                message: 'אין מקום פנוי במכשיר, ולכן לא הצלחנו לשמור את השינוי - הוא בוטל ' +
                    'כדי שלא ייראה כאילו נרשם. מה שכבר שמור לא נפגע. פנה מקום במכשיר ' +
                    'או ייצא קובץ גיבוי, ונסה שוב.'
            });
        }
        return false;
    },

    // Writes what is in memory to the device WITHOUT re-stamping it. Used when a snapshot
    // that came from another device is adopted: stamping it here would relabel their work
    // as this device's, at this device's clock - and that stamp is what every later
    // comparison is made against.
    persist() {
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return false;
        const forDisk = this.coldForDisk();
        const text = JSON.stringify(forDisk);
        const landed = Store.setVerified(V2_KEY, text);
        this.saveFailed = !landed;
        if (landed) {
            this.coldNote(forDisk);
            // A snapshot that named something new as archived was just adopted: move it.
            if (typeof Cold !== 'undefined' && Cold.moveSoon && !this._coldDropping) Cold.moveSoon();
            this.durableText = text;
            this.rememberConfirmed(text);
            if (typeof FarkadSync !== 'undefined' && FarkadSync.markSaved) FarkadSync.markSaved();
            // Adopted, not restored: another phone's snapshot swaps the object here,
            // and that is not a moment to mirror. An advance arriving from a v79 phone
            // waits for the next boot, exactly as one recorded on this device does -
            // until the gate opens, the boots are where the ledger catches up.
            this.mirrored = this.schedule;
        }
        return landed;
    },

    // A bulk edit - copying a whole day across - saves once and renders once, but still
    // sends every path it touched. Saving alone only pushes a timestamp, so a copy that
    // skipped this landed on this device and nowhere else: the other two would keep
    // building the evening against a day they could not see.
    commitMany(changes) {
        // Said afresh by every commit, as commit() says it - see refuseEdit.
        this.lastCommitKept = false;
        // Copying a day across can meet the two-site cap partway through. The rest of the
        // copy still lands - refusing the whole thing over one worker would be a worse
        // answer - and what did not is named once rather than per row.
        const refused = (changes || []).filter(change => change && change.refused);
        const accepted = (changes || []).filter(change => change && !change.refused);

        // NOTHING ACCEPTED IS NOT A REASON TO WRITE.
        //
        // save() writes the WHOLE schedule out of memory, and journalBatch answers true
        // for an empty set - rightly, nothing is owed - so a call that accepted nothing
        // fell straight through to that write. With another window's newer record on the
        // disk, this window's entire copy of it went down on top, and there was no
        // journalled edit behind it for a rebase to rebuild from or for a refusal to be
        // about: a whole-record write with nothing to justify it. The ordinary way in is
        // an all-refused batch - copying a day across where every worker is already at
        // the two-site cap - so this is not a corner.
        //
        // The refusals are named in the same words as a partial batch, and the answer is
        // false, because nothing was recorded. Every caller already treats false as
        // "nothing happened": the two that pass the answer on refuse an empty list of
        // their own before they get here.
        if (accepted.length === 0) {
            if (refused.length > 0 && typeof askTell === 'function') {
                askTell(`${refused.length} רישומים לא נוספו: ${refused[0].reason}`);
            }
            return false;
        }
        if (this.refuseArchivedMonth(accepted)) return false;
        if (this.refuseColdMoney(accepted)) return false;

        // All or nothing, and ONE write. Journalling them one at a time was all-or-nothing
        // in what it reported and not in what it did: the first entry landed, the second
        // ran out of room, and the app said the copy had not happened while half of it sat
        // on the disk waiting to come back at the next open.
        if (!this.journalBatch(accepted)) return this.refuseEdit();

        // THE REBASE IS ASKED OF A CHANGE THE JOURNAL IS ACTUALLY HOLDING.
        //
        // journalBatch keeps only the changes that carry a path, so a batch can be
        // accepted with some paths and some not - and the first element is then not
        // necessarily one of the journalled ones. Asking the question of accepted[0] left
        // the whole batch unguarded whenever that first element had no path, which is the
        // one case the guarantee had to cover. It is explicit now: the first accepted
        // change WITH a path, which is the first thing a replay could rebuild, and
        // diskVerdict is told plainly when there is none.
        if (!this.guardedSave(accepted.some(change => change && change.path))) return false;

        if (refused.length > 0 && typeof askTell === 'function') {
            askTell(`${refused.length} רישומים לא נוספו: ${refused[0].reason}`);
        }
        return true;
    },

    // ------------------------------------------------------------ the pay book (v173)
    //
    // THE ONE DOOR BY WHICH A PAY ENTRY IS WRITTEN ON THIS PHONE: a plan's `changes`
    // (planClosure, planPayment and the rest of js/model/payroll.js) - the closure's
    // artifact, its `deducted` entries and the new `pay.<id>` entries - as ONE journal
    // batch, journal first, exactly as a copied day is.
    //
    // SHUT in the shipped build: paybookCommitPlan answers `gate` while
    // FARKAD_FLAGS.paybook is false, and nothing below it runs. No screen calls this yet.
    //
    // What it adds to commitMany is the question commitMany cannot ask. Every other
    // caller mutates the schedule and then hands over the path, and the journal takes
    // any (path, value): for a record that is never rewritten that is the wrong order
    // and the wrong trust. So here the record AS IT IS NOW is asked first
    // (paybookCommitPlan): a null, a path that is not an entry, or an id that already
    // says something different refuses the WHOLE batch before one byte of memory moves;
    // an id that already says the same thing is the same fact and is simply not written
    // again. Only then are the entries laid into memory - as own properties, never by a
    // bare assignment, see putKey - and committed.
    //
    // Returns { ok, reasons, written, same, kept }:
    //   ok       every entry of the batch is durable on this device (or was already)
    //   reasons  paybookCommitPlan's codes, or 'unwritten' when commitMany answered false
    //   kept     with 'unwritten': the journal HOLDS the batch and only the schedule
    //            write failed - commitMany has said so in its own words, the entries are
    //            on the screen and owed to the cloud, and the caller must not treat the
    //            closure as not having happened. See refuseEdit.
    //
    // A refused journal write rolls memory back and says so, through commitMany's own
    // refuseEdit - the entries laid in above are then gone from the screen, because
    // rollback() rebuilds the schedule from the disk and the journal.
    //
    // NOT YET WHAT A CLOSURE NEEDS ON THE WIRE. This makes the batch one fact on THIS
    // device. It is sent like any batch, and tests/paybook.sync.test.mjs measures what
    // that does and does not guarantee; "closed only if the server's transaction
    // committed" is the next phase's, and until it exists the gate stays shut.
    commitPaybook(changes) {
        const plan = paybookCommitPlan(this.schedule, changes);
        if (!plan.ok) {
            return { ok: false, reasons: plan.reasons, written: [], same: plan.same, kept: false };
        }
        if (plan.write.length === 0) {
            return { ok: true, reasons: [], written: [], same: plan.same, kept: false };
        }
        const own = (map, id, value) => Object.defineProperty(map, id, {
            value, writable: true, enumerable: true, configurable: true
        });
        // A copy per entry: the plan belongs to whoever drew it, and the record must not
        // share an object with something a caller may still be holding.
        const batch = plan.write.map(change => ({
            path: change.path, value: JSON.parse(JSON.stringify(change.value))
        }));
        batch.forEach(change => {
            const parts = change.path.split('.');
            if (parts[0] === 'pay') {
                if (!isPlainObject(this.schedule.pay)) this.schedule.pay = {};
                own(this.schedule.pay, parts[1], change.value);
                return;
            }
            this.schedule.ledger = this.schedule.ledger || { advances: {} };
            this.schedule.ledger.advances = this.schedule.ledger.advances || {};
            own(this.schedule.ledger.advances, parts[2], change.value);
        });
        const written = batch.map(change => change.path);
        if (this.commitMany(batch)) {
            return { ok: true, reasons: [], written, same: plan.same, kept: false };
        }
        return { ok: false, reasons: ['unwritten'], written: this.lastCommitKept ? written : [],
            same: plan.same, kept: this.lastCommitKept === true };
    },

    worker(id) {
        return this.schedule.workers.find(w => w.id === id) || null;
    },

    place(id) {
        return this.schedule.places.find(p => p.id === id) || null;
    },

    activeWorkers() {
        return this.schedule.workers.filter(w => w.active !== false);
    },

    activePlaces() {
        return this.schedule.places.filter(p => p.active !== false);
    },

    // Who to draw on a given day: the current crew, plus anyone archived who has
    // something recorded on that date. Otherwise the day somebody leaves, every past day
    // they worked loses their row - and with it any way to see or correct what they did,
    // while the payroll report keeps counting it.
    workersForDay(date, layer) {
        return this.schedule.workers.filter(worker => {
            if (worker.active !== false) return true;
            return isAbsent(this.schedule, date, worker.id, layer) ||
                entriesFor(this.schedule, date, worker.id, layer).length > 0;
        });
    },

    // Everyone with no entry and no absence on the current day. This is the number that
    // matters most on screen: a worker nobody recorded is a worker nobody pays.
    unrecorded() {
        return this.activeWorkers().filter(worker => {
            if (isAbsent(this.schedule, this.date, worker.id, this.layer)) return false;
            return entriesFor(this.schedule, this.date, worker.id, this.layer).length === 0;
        });
    },

    absentToday() {
        return this.activeWorkers()
            .filter(worker => isAbsent(this.schedule, this.date, worker.id, this.layer));
    },

    // Minted here, and written down as minted here.
    //
    // This is the ONLY door into the provenance record's `mine` set, which is what makes
    // a permanent deletion possible at all - see the provenance block in js/sync/sync.js.
    // A worker read out of a v78 schedule at upgrade, one that arrives in a backup file
    // and one that comes out of a restore all reach the roster without passing through
    // here, so none of them is ever provably local, and none of them can be destroyed.
    nextWorkerId() {
        const id = newEntityId('w');
        if (typeof FarkadSync !== 'undefined' && FarkadSync.markLocallyMinted) {
            FarkadSync.markLocallyMinted('workers', id);
        }
        return id;
    },

    nextPlaceId() {
        const id = newEntityId('p');
        if (typeof FarkadSync !== 'undefined' && FarkadSync.markLocallyMinted) {
            FarkadSync.markLocallyMinted('places', id);
        }
        return id;
    }
};

// Accepts anything shaped roughly right and fills in what is missing, so a document
// written by an older build - or a half-finished remote write - cannot crash the app.
// `hints` carries names this device already knows for ids the document itself no longer
// names - see reinstateReferenced. A phone holding a day for somebody who was deleted
// elsewhere is usually the last place his name still exists, and reinstating him as
// "עובד שנמחק" when the phone doing the reinstating can read his name off its own roster
// would be losing information it has in its hand.
function normaliseSchedule(raw, hints) {
    const schedule = emptySchedule();
    if (!raw || typeof raw !== 'object') return schedule;

    // Both shapes of the roster, merged rather than chosen between - see mergeRoster.
    // The arrays are what a device still on an older build writes and reads; the map
    // carries only the people who changed, so reading either one alone loses somebody.
    const roster = (raw.roster && typeof raw.roster === 'object') ? raw.roster : {};
    const rawWorkers = mergeRoster(raw.workers, roster.workers, roster.workerOrder);
    const rawPlaces = mergeRoster(raw.places, roster.places, roster.placeOrder);

    schedule.workers = (Array.isArray(rawWorkers) ? rawWorkers : [])
        .filter(w => w && w.id)
        .map(w => ({
            id: String(w.id),
            name: String(w.name || ''),
            idNumber: String(w.idNumber || ''),
            phone: String(w.phone || ''),
            // Pay rates. Stored as numbers so a blank stays 0 rather than becoming the
            // string "0" and quietly multiplying to nothing.
            dailyRate: Number(w.dailyRate) || 0,
            hourlyRate: Number(w.hourlyRate) || 0,
            // HOW OFTEN THIS MAN IS SETTLED - the ordered history of it, in one field.
            //
            // Empty means every second Thursday, which is what every worker was before
            // this existed, so a backup written last month opens cut the same way it was
            // cut when it was written. A history this reader cannot parse is kept BYTE FOR
            // BYTE rather than dropped: it is somebody's record of how a man is paid, and
            // law 10 says an unreadable record is still the only record there is. Every
            // reader that prices a day treats it as the default; the validator refuses it
            // and says so, which is how a person finds out.
            payCycles: formatPayCycles(payCycleHistory(w)) || String(w.payCycles || ''),
            active: w.active !== false
        }));

    schedule.places = (Array.isArray(rawPlaces) ? rawPlaces : [])
        .filter(p => p && p.id)
        .map(p => ({
            id: String(p.id),
            name: String(p.name || ''),
            active: p.active !== false
        }));

    // The vehicles, rebuilt field by field like everything else here - this function
    // starts from an empty schedule and copies across what it recognises, so a field it
    // has never heard of is a field that disappears at the next reopen. Which is what
    // happened to these the first time, and is why they were tested before they were
    // drawn.
    //
    // The rate history is the part worth being careful with: it is what stops a raise
    // repaying last month, so an entry without a date it applies from is dropped rather
    // than guessed at.
    // DORMANT. This build does not do vehicles - FARKAD_FLAGS in js/model/schema.js - and
    // that is a reason to draw nothing and charge nobody, not a reason to lose records.
    //
    // So the fields this app knows are read the way it knows them, and everything else on
    // the record is carried through untouched. This function starts from an empty
    // schedule and copies across what it recognises, so a field it does not name is a
    // field that disappears at the next save: a plate, a note, whatever the build that
    // wrote them called them. A rate entry with no date it applies from is kept beside
    // them rather than dropped - it earns nothing while this is off, and it is somebody's
    // record of a price.
    schedule.vehicles = (Array.isArray(raw.vehicles) ? raw.vehicles : [])
        .filter(v => v && v.id)
        .map(v => Object.assign({}, v, {
            id: String(v.id),
            name: String(v.name || ''),
            ownerId: String(v.ownerId || ''),
            active: v.active !== false,
            rates: (Array.isArray(v.rates) ? v.rates : []).map(entry =>
                (entry && typeof entry.from === 'string' && entry.from)
                    ? Object.assign({}, entry,
                        { from: String(entry.from), amount: Number(entry.amount) || 0 })
                    : entry)
        }));

    const days = (raw.days && typeof raw.days === 'object') ? raw.days : {};
    Object.keys(days).forEach(date => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const day = days[date] || {};
        schedule.days[date] = {
            plan: normaliseLayer(day.plan),
            actual: normaliseLayer(day.actual)
        };
        if (day.vehicleRuns !== undefined) {
            // Preserve every byte, including unfamiliar evidence; validation holds it
            // instead of normalisation silently discarding a future financial record.
            schedule.days[date].vehicleRuns = JSON.parse(JSON.stringify(day.vehicleRuns));
        }
        // Which vehicles stayed in the yard that evening. Carried through even though
        // this build does not do vehicles: it is a fact somebody recorded about a day,
        // this function keeps only what it names, and a field it does not name is a field
        // that disappears at the next reopen.
        if (Array.isArray(day.vehiclesOff)) {
            schedule.days[date].vehiclesOff = day.vehiclesOff
                .filter(id => typeof id === 'string').map(String);
        }
        // HOW MANY OF RIMA'S MEN were on each site (v166) - see the רימא section of
        // js/model/schema.js. This function keeps only what it names, so a layer it did
        // not name here would leave at the next save; that is exactly what v145 and v165
        // do with this one, on their own copy, and why it is named.
        //
        // Carried as it arrived, not filtered. A count this build cannot read is still
        // somebody's record of a day: the doors in front of this function refuse one
        // (dayProblems at the disk and at a restore, the sync layer's refusal at the
        // cloud), so filtering here would only ever hide what got past them. A poison
        // name is the exception - assigning it reparents the map - and it is quarantined
        // by poisonedContainers above. A null is a clear in flight, never a count.
        if (day.rima !== undefined && day.rima !== null) {
            if (isPlainObject(day.rima)) {
                const rima = {};
                Object.keys(day.rima).forEach(placeId => {
                    if (POISON_SEGMENTS.indexOf(placeId) !== -1) return;
                    if (day.rima[placeId] === null || day.rima[placeId] === undefined) return;
                    rima[placeId] = JSON.parse(JSON.stringify(day.rima[placeId]));
                });
                if (Object.keys(rima).length > 0) schedule.days[date].rima = rima;
            } else {
                schedule.days[date].rima = JSON.parse(JSON.stringify(day.rima));
            }
        }
    });

    // Advances arrive keyed by id. A null value is a deletion another device sent and
    // must not come back as a record; anything without a worker or a date cannot be
    // placed in an account and is dropped rather than counted against the wrong one.
    const advances = (raw.advances && typeof raw.advances === 'object') ? raw.advances : {};
    Object.keys(advances).forEach(id => {
        const item = advances[id];
        if (!item || typeof item !== 'object') return;
        // Never assigned under a poison name: `schedule.advances.__proto__ = advance`
        // reparents the map rather than adding to it. The map's bytes were reported and
        // quarantined above; here the name is simply not written.
        if (POISON_SEGMENTS.indexOf(String(id)) !== -1) return;
        if (!item.workerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) return;
        const advance = {
            id: String(id),
            workerId: String(item.workerId),
            date: String(item.date),
            amount: Number(item.amount) || 0,
            note: String(item.note || '')
        };
        // HOW it was paid. This function starts from an empty record and copies across
        // what it recognises, so a field it does not name is a field that disappears at
        // the next reopen - and this one had no name here. An advance handed over in cash
        // and one sent by transfer are different facts about somebody's money, and the
        // second reopen was quietly turning both of them into neither.
        //
        // Carried verbatim rather than checked against a list: a value written by a build
        // that does not exist yet is still what somebody chose, and replacing it with a
        // guess is worse than keeping a word this build does not draw.
        if (typeof item.method === 'string' && item.method) advance.method = item.method;
        schedule.advances[id] = advance;
    });

    // The ledger, carried through unchanged - and CARRIED, not filtered.
    //
    // This used to skip an entry it could not use, and the comment above it said the
    // entry was "DROPPED from the fold rather than repaired". It was not dropped from the
    // fold. The object being built here IS State.schedule, and save() serialises exactly
    // that - so the drop was from the RECORD. A ledger entry with no advanceId, arriving
    // from a partial sync write or a newer build, was read off the disk, left out of this
    // object, and then written over by the next save. The only copy of somebody's
    // correction, gone, with load() reporting clean, no quarantine, writes not blocked,
    // the parity check blessing the result, and the rescue export - which reads the disk -
    // unable to find it either.
    //
    // Now nothing is left out. An entry this build can fold goes where it always went; an
    // entry it cannot goes into `unreadable`, which the writer round-trips untouched and
    // nothing reads for arithmetic. The bytes survive and the fold ignores them.
    //
    // This comment used to say storedScheduleProblems refused such a record "in the first
    // place", so that this path was the second line rather than the only one. It did not,
    // and that sentence is why nobody went looking: a repayment whose amount was the
    // string "abc" passed every document gate in the app. The document is still not
    // refused - the rescue file has to be able to open it, which is the reasoning written
    // into storedScheduleProblems and it is right - but this path is now the real line,
    // and js/app.js stops the device WRITING while any of it is unreadable.
    // AND THE CONTAINER BEFORE THE ENTRIES, because there is not always a container.
    //
    // This line read `typeof raw.ledger === 'object'` and fell back to {} for anything
    // else. A `ledger` that arrived as a string was therefore dropped on the floor; one
    // that arrived as an array was read as a record with no advances. Either way the
    // schedule that came out carried an EMPTY history, load() reported clean, nothing was
    // blocked, and the first ordinary save wrote that emptiness over the only copy of
    // somebody's advances.
    //
    // The entry checks below could not catch it: there were no entries to check. So the
    // container is checked first, its bytes are carried on the schedule under a name
    // nothing reads for arithmetic, and Recovery is told under a key of its own - the
    // trouble is a different trouble from an unreadable entry and deserves its own
    // sentence and its own quarantine slot.
    // A NAME NOBODY CAN USE AS A KEY, in any map this app reads by id.
    //
    // Checked here because here is where every door meets, and BEFORE anything is copied
    // out of `raw`: assigning an own `__proto__` into an ordinary object either reparents
    // it or silently does nothing, and the silent nothing is what used to happen - the key
    // vanished, no problem was raised, the device went on writing, and the next save put
    // the emptied record over the one that had it.
    //
    // The bytes under the name are handed to Recovery, so the evidence is quarantined
    // exactly as it arrived rather than described - and ONLY those bytes, because they
    // are the sighting's identity: see poisonedContainers in js/model/schema.js. Writing is blocked for the same reason it is
    // blocked for an unreadable entry: what could not be read is somebody's day or
    // somebody's money, and this device must not write over it.
    // AND EVERY DAY UNDER A NAME THAT IS NOT A DATE, held the same way. The loop over
    // `days` further down adopts only YYYY-MM-DD keys and used to skip the rest without
    // a word: a whole day arriving under a key this app cannot read was simply gone,
    // with nothing reported and the device still writing.
    const poisoned = (typeof poisonedContainers === 'function'
        ? poisonedContainers(raw) : [])
        .concat(typeof unreadableDays === 'function' ? unreadableDays(raw) : []);
    // CARRIED ON THE SCHEDULE, under a name nothing reads for arithmetic, exactly as the
    // unreadable ledger entries are. The quarantined copy is on the disk either way, but
    // Recovery's problems live in one session's memory: without this the next boot found a
    // record with the poisoned key already gone, had nothing to report, and let the device
    // write again. The evidence has to be part of the record to outlive the session that
    // found it.
    //
    // Anything an earlier read held aside stays held: a second reading is not a licence to
    // drop it.
    // An own property, whatever the name is. `map[id] = value` for an id of `__proto__`
    // writes the PROTOTYPE and creates nothing - which is how the map that keeps
    // unreadable evidence lost it and came back reparented. See putKey in
    // js/model/ledger.js, which is the same rule for the merge.
    const keepUnder = (map, id, value) => {
        Object.defineProperty(map, id, {
            value, writable: true, enumerable: true, configurable: true
        });
    };

    const POISON_KEY = 'scheduleData:v2:poison:';
    const POISON_SAID = 'הגיע רישום עם שם שאי אפשר להשתמש בו כמפתח. שום דבר לא נמחק - '
        + 'הנתונים נשמרו כמו שהם - אבל אי אפשר לרשום עוד עד שתייצא גיבוי.';
    // Through Recovery.evidence, not Recovery.damaged: damaged is keyed and says one
    // trouble once per session, which for a map quarantined as it arrived meant that
    // DIFFERENT bytes under the same poisoned name, arriving after the person had
    // acknowledged the first sighting, were never copied and never mentioned. Here the
    // bytes are the evidence, so identical bytes are the same sighting and anything
    // else is a new one.
    if (typeof Recovery !== 'undefined') {
        poisoned.forEach(found => {
            Recovery.evidence(POISON_KEY + found.at, found.json, POISON_SAID);
        });
        // AND WHATEVER AN EARLIER SESSION ALREADY HELD ASIDE.
        //
        // The evidence cannot ride back on the schedule: Recovery.damaged blocks writing
        // the moment it is called, so the record carrying the marker is never saved - the
        // same ordering trap the ledger clash hit. What IS durable is the quarantined
        // copy, written by Recovery itself, so the next boot re-derives the hold from
        // that rather than from a field it was never allowed to store. Without this the
        // reopened device found a record whose poisoned key was already gone, had nothing
        // to report, and started writing again.
        const kept = typeof Store !== 'undefined' && typeof Store.keys === 'function'
            ? Store.keys().filter(key => String(key).indexOf(POISON_KEY) === 0) : [];
        kept.forEach(key => {
            const at = String(key).slice(POISON_KEY.length).replace(/:damaged.*$/, '');
            Recovery.evidence(POISON_KEY + at, Store.get(key), POISON_SAID);
        });
    }

    const containerProblem = typeof ledgerContainerProblem === 'function'
        ? ledgerContainerProblem(raw) : null;
    if (containerProblem) {
        schedule.ledger.unreadableContainer = raw.ledger;
        if (typeof Recovery !== 'undefined') {
            Recovery.damaged('scheduleData:v2:ledger:container',
                JSON.stringify(raw.ledger),
                'היסטוריית המקדמות ברישום אינה בצורה שאפשר לקרוא. שום דבר לא נמחק - '
                + 'הנתונים נשמרו כמו שהם - אבל אי אפשר לרשום עוד עד שתייצא גיבוי, '
                + 'כדי שלא ייכתב רישום ריק על ההיסטוריה.');
        }
    }
    // A container that could not be read has nothing this build may take entries out of.
    const ledger = (!containerProblem && isPlainObject(raw.ledger)) ? raw.ledger : {};
    const entries = isPlainObject(ledger.advances) ? ledger.advances : {};
    Object.keys(entries).forEach(id => {
        const entry = entries[id];
        // THE WHOLE CHECK, not a shape test.
        //
        // This asked only whether the entry had an advanceId and a kind. An entry that
        // had both and carried the string "abc" as its amount was therefore READABLE, and
        // went into the fold - where the arithmetic read it as nothing. A number nobody
        // can read, silently reinterpreted as zero, on a man's outstanding debt.
        //
        // ledgerEntryProblems is the same check the queue applies to an edit on its way
        // out. Applying it here means an entry that could never have been written by this
        // build cannot be READ by it either, whatever door it arrived through.
        // THE ENTRY AS IT ARRIVED, and the key it arrived under, asked separately.
        //
        // This used to validate `Object.assign({}, entry, { id: String(id) })` - the id
        // forced to agree with the key BEFORE the check that they agree - so an entry
        // stored under le_a claiming to be le_b was silently rewritten to le_a, folded as
        // money, and the evidence of the mismatch destroyed. An immutable identity is the
        // one field in this record nothing may invent: two phones that disagree about
        // which entry this is have to be told, not averaged.
        //
        // And the KEY is checked at all, which it never was. A key this build cannot
        // safely store - see isSafeId - would not have been stored: it would have
        // re-parented the map and taken the entry out of every reader at once.
        const readable = isSafeId(String(id))
            && entry && typeof entry === 'object'
            && ledgerEntryProblems(String(id), entry).length === 0;
        if (!readable) {
            // Under a key the read can see. An unsafe id cannot be used as the key of the
            // held-aside map either - it would vanish there for exactly the same reason -
            // so it is defined as an own property instead, which stores the bytes without
            // going through the prototype setter.
            Object.defineProperty(schedule.ledger.unreadable, id, {
                value: entry, writable: true, enumerable: true, configurable: true
            });
            return;
        }
        schedule.ledger.advances[id] = Object.assign({}, entry, { id: String(id) });
    });
    // A CLOSURE THAT CANNOT BE TRUE, held aside like anything else this build cannot use.
    //
    // The entry check above is about SHAPE, and every closure here has already passed it.
    // This is the other question: is it true against the record it claims to be about. A
    // closure deducting more than the advance had left, or more than the man earned, or
    // carrying a balance that is not what the arithmetic leaves, is a well-formed entry
    // that is a lie - and the amount and the balance are numbers somebody else's phone
    // computed, which this device has no reason to believe.
    //
    // Run after the entries are in, because judging one closure needs all the others.
    // Held aside rather than corrected: nothing here invents a number to replace it, and
    // the bytes stay exactly as they arrived.
    // Recover the worker (including cycle history) before judging a late closure.
    // Otherwise a valid weekly closure is judged against a missing, fortnightly worker.
    reinstateReferenced(schedule, rememberedEntities(raw, hints));
    // A CLOSURE THIS APP HELD ASIDE BY ITS OWN MISTAKE COMES BACK - that one, and no other.
    //
    // Up to v179 a close could take the wage ROUNDED to the agora off a wage it recorded
    // unrounded (630.63 off 630.625), and the judge then called its own closure
    // impossible: the deduction went under ledger.unreadable on the phone that wrote it,
    // and the rule just below - whatever an earlier read held aside stays held - kept it
    // there, re-reported at every open, for ever. v180 judges the wage to the agora
    // (closureProblems, js/model/ledger.js), so a copy still sitting in `advances` is
    // simply read. This is for the copy that is already under `unreadable` on the disk.
    //
    // Narrow on purpose. It takes back ONLY a deduction of that exact shape
    // (closureWithinRoundedWage), only one this build can read whole, only when the
    // record does not already hold different bytes under the same id, and only when
    // taking it back condemns nothing: a phone that carried on without the deduction
    // and closed a later fortnight wrote figures that do not include it, and bringing
    // it back would make THAT closure the impossible one. Then nothing moves and the
    // hold stands, exactly as before - a person has to look.
    //
    // The bytes are the ones that were held, unchanged; nothing is deleted (iron law 10):
    // the entry is where it was written to be, and the quarantined copy Recovery made
    // stays on the disk.
    const readmitted = {};
    if (typeof impossibleClosures === 'function'
        && typeof closureWithinRoundedWage === 'function') {
        const heldBefore = isPlainObject(ledger.unreadable) ? ledger.unreadable : {};
        const same = (one, two) => (typeof sameLedgerBytes === 'function'
            ? sameLedgerBytes(one, two)
            : JSON.stringify(one) === JSON.stringify(two));
        const has = id => Object.prototype.hasOwnProperty.call(schedule.ledger.advances, id);
        const candidates = Object.keys(heldBefore).filter(id => {
            const entry = heldBefore[id];
            return isSafeId(String(id)) && isPlainObject(entry)
                && ledgerEntryProblems(String(id), entry).length === 0
                && closureWithinRoundedWage(entry)
                && (!has(id) || same(schedule.ledger.advances[id], entry));
        });
        if (candidates.length > 0) {
            // Asked of two COPIES of the map, never by taking anything out of the record
            // being built: with the candidates, and without them. Nothing is admitted
            // unless every closure the first reading condemns, the second condemned too.
            const others = {};
            Object.keys(schedule.ledger.advances).forEach(id => {
                if (candidates.indexOf(id) === -1) others[id] = schedule.ledger.advances[id];
            });
            const taken = Object.assign({}, others);
            candidates.forEach(id => {
                taken[id] = Object.assign({}, heldBefore[id], { id: String(id) });
            });
            const reading = map => Object.assign({}, schedule,
                { ledger: Object.assign({}, schedule.ledger, { advances: map }) });
            const without = impossibleClosures(reading(others));
            const harmless = impossibleClosures(reading(taken))
                .every(id => without.indexOf(id) !== -1);
            if (harmless) {
                candidates.forEach(id => {
                    schedule.ledger.advances[id] = taken[id];
                    readmitted[id] = true;
                });
            }
        }
    }
    if (typeof impossibleClosures === 'function') {
        impossibleClosures(schedule).forEach(id => {
            keepUnder(schedule.ledger.unreadable, id, schedule.ledger.advances[id]);
            delete schedule.ledger.advances[id];
        });
    }

    // THE APPROVALS, which this function used to drop on the floor.
    //
    // Found by the emulator suite, and it was never a concurrency bug: `schedule.ledger`
    // is rebuilt here out of `advances` and `unreadable`, and `migrations` was simply not
    // copied across. Every route into this app goes through this function, so an approval
    // was durable on the disk and invisible to everything that read it back - the gate
    // shut itself on the next boot, and an approval made on another phone never arrived
    // at all, which is the one thing recordCarryApproval promises.
    //
    // Checked the same way an entry is, and held aside rather than coerced: an approval
    // this build cannot read is not an approval, and it is not an absence either. It goes
    // into a map of its own because its ids and an entry's ids share no namespace and
    // putting them in one map would make a collision decide which record survives.
    // emptySchedule() carries the two maps every build has always had. These two are
    // newer than some of the records this function will be handed, so they are made here
    // rather than assumed - a schedule read off an older disk has neither.
    schedule.ledger.migrations = schedule.ledger.migrations || {};
    schedule.ledger.unreadableMigrations = schedule.ledger.unreadableMigrations || {};
    const approvals = isPlainObject(ledger.migrations) ? ledger.migrations : {};
    Object.keys(approvals).forEach(id => {
        const approval = approvals[id];
        // THE APPROVAL AS IT ARRIVED, and the key it arrived under, asked separately -
        // the same rule the entries above take, and for a worse reason.
        //
        // This handed the validator `Object.assign({}, approval, { id: String(id) })`:
        // the body's id overwritten with the path's id BEFORE the check that the two
        // agree, so migrationApprovalProblems' own `value.id !== id` could never be
        // false. An approval stored under cm_carry with a body claiming cm_WRONG was
        // read as an approval of cm_carry, written back under that name, and the
        // disagreement destroyed.
        //
        // An approval is not a cosmetic id. carryMigrationApproved asks whether one
        // exists under THIS plan's id, and that answer is what opens
        // financialWritingEnabled - so an approval of something else, from a build that
        // named its migrations differently or a byte that flipped, restated every
        // account on three phones with nobody having approved anything.
        //
        // And the key is checked at all: an id this build cannot safely store would
        // re-parent the map on the way in, exactly as it would for an entry.
        const readable = isSafeId(String(id))
            && (typeof migrationApprovalProblems !== 'function'
                || migrationApprovalProblems(String(id), approval).length === 0);
        if (!readable) {
            keepUnder(schedule.ledger.unreadableMigrations, id, approval);
            return;
        }
        schedule.ledger.migrations[id] = Object.assign({}, approval, { id: String(id) });
    });

    // Anything an older or newer build left under ledger.unreadable stays there too.
    //
    // Asked as an OWN key, not with `map[id] === undefined`. For `__proto__` that lookup
    // reads Object.prototype off a plain object and is never undefined, so keepUnder
    // below never ran for the one id it was written for: the reopened schedule came
    // back without the entry, and the first ordinary save after the person acknowledged
    // wrote that record over the one that had the evidence. Measured: the quarantine
    // copy was the only trace left, and the sweep did not know its name either.
    const held = isPlainObject(ledger.unreadable) ? ledger.unreadable : {};
    Object.keys(held).forEach(id => {
        // Except the closure taken back above: it is in `advances` again, byte for byte,
        // and holding a second copy aside would go on blocking the phone over a record
        // it can now read.
        if (Object.prototype.hasOwnProperty.call(readmitted, id)) return;
        if (!Object.prototype.hasOwnProperty.call(schedule.ledger.unreadable, id)) {
            keepUnder(schedule.ledger.unreadable, id, held[id]);
        }
    });
    // And the approvals held aside on an earlier read: they were kept because nothing may
    // decide on this device's behalf what they meant, and a second read is not a licence
    // to drop them either.
    const heldApprovals = isPlainObject(ledger.unreadableMigrations)
        ? ledger.unreadableMigrations : {};
    Object.keys(heldApprovals).forEach(id => {
        if (schedule.ledger.unreadableMigrations[id] === undefined) {
            keepUnder(schedule.ledger.unreadableMigrations, id, heldApprovals[id]);
        }
    });

    // AND EVERY OTHER PART OF THE CONTAINER, verbatim, because this build owns four of
    // them and the record is not four of them.
    //
    // The object being built here IS State.schedule and save() serialises exactly that,
    // so a part of `ledger` this build does not name was read off the disk, left out, and
    // written over by the next ordinary save. That is the same deletion-by-reading the
    // block above this one exists to have stopped, one level up: it was fixed for an
    // ENTRY and left in place for the container's own fields.
    //
    // It is not hypothetical. `ledger.migrations` - a person's approval of a financial
    // migration, which decides whether their phones may write money at all - arrived one
    // build after this loop was first written, and three phones do not update together.
    // A phone without this loop, sharing the record, would have deleted that approval on
    // every save: silently, with the load reporting clean, nothing quarantined, and the
    // parity check blessing it. Naming `migrations` fixed the case that existed and left
    // the next one open; this carries whatever the next one is.
    //
    // Carried, not quarantined and not a reason to stop. "This build has no opinion about
    // it" is not "it cannot be read": a device that went into recovery over a field a
    // later build added is a device nobody can record a day on, and that is the failure
    // this app trades everything else to avoid.
    //
    // The four this build owns were each read above, on their own terms, and are not
    // carried again here - a second, unguarded copy of `migrations` would put an approval
    // the validator refused back beside the ones it accepted.
    Object.keys(ledger).forEach(key => {
        if (['advances', 'unreadable', 'migrations', 'unreadableMigrations']
            .indexOf(key) !== -1) return;
        // See normaliseLayer: a bare assignment under a poison name reparents the
        // container instead of carrying a field.
        if (POISON_SEGMENTS.indexOf(key) !== -1) return;
        if (schedule.ledger[key] === undefined) schedule.ledger[key] = ledger[key];
    });

    // THE PAY BOOK (v173), CARRIED WHERE IT LIES - every entry, readable or not.
    //
    // This function starts from an empty schedule and copies across what it names, so a
    // map it does not name leaves at the next save: that is what v167, v169 and v171 do
    // with `pay` on their own copy (measured, tests/paybook.oldbuilds.test.mjs), and it
    // is the whole of why this block exists.
    //
    // NOT SORTED INTO READABLE AND UNREADABLE, which is where this differs from the
    // ledger above, on purpose. The ledger moves an entry it cannot fold into
    // `ledger.unreadable`; a whole-document write from that phone then carries the entry
    // under a different name than the one every other phone reads it by. Here an entry
    // stays at `pay.<id>` whatever it is: the disk, the cloud path and the next build
    // all find it in the one place it was written, and nothing has to be moved back.
    // What keeps an unreadable one out of the arithmetic is the fold, which holds it by
    // id (paybookFold) - and what keeps this device from writing on top of money it
    // cannot read is Recovery, told further down, exactly as for the ledger.
    //
    // A poison name is the exception everywhere in this function: assigning it reparents
    // the map. It was reported by poisonedContainers above and is simply not written.
    // A CONTAINER THAT IS NOT A RECORD has nothing entries can be taken out of. Its bytes
    // are carried under a name nothing folds, so the hold outlives the session that
    // found it, and the book itself reads as empty rather than as those bytes.
    const payHeld = {};
    if (isPlainObject(raw.payUnreadableContainer)) {
        Object.keys(raw.payUnreadableContainer).forEach(key => {
            if (POISON_SEGMENTS.indexOf(key) === -1) payHeld[key] = raw.payUnreadableContainer[key];
        });
    }
    if (raw.pay !== undefined && raw.pay !== null && !isPlainObject(raw.pay)) {
        payHeld.pay = raw.pay;
    } else if (isPlainObject(raw.pay)) {
        Object.keys(raw.pay).forEach(id => {
            if (POISON_SEGMENTS.indexOf(id) !== -1) return;
            keepUnder(schedule.pay, id, raw.pay[id]);
        });
    }
    // The other side of a disagreement about an entry, kept beside it by paybookUnion.
    // Round-tripped verbatim: dropping it here would settle the disagreement in favour
    // of whichever copy happened to be standing, by a read, with nobody asked.
    if (raw.payConflicted !== undefined && raw.payConflicted !== null
        && !isPlainObject(raw.payConflicted)) {
        payHeld.payConflicted = raw.payConflicted;
    } else if (isPlainObject(raw.payConflicted)) {
        const beside = {};
        Object.keys(raw.payConflicted).forEach(id => {
            if (POISON_SEGMENTS.indexOf(id) !== -1) return;
            keepUnder(beside, id, raw.payConflicted[id]);
        });
        if (Object.keys(beside).length > 0) schedule.payConflicted = beside;
    }
    // THE INDEX OF WHAT HAS LEFT THE LIVE DOCUMENT (Phase 5), carried as it lies - every
    // row, readable or not. It is not named in emptySchedule, so that a record with no
    // row is byte for byte the record it was; and because this function copies across only
    // what it names, without this block the first save would drop the one thing that says
    // a closure's entries exist in a closed document. A row is never judged here: the
    // readers (paybookStoredIndex) skip one they cannot read, and it stays.
    if (raw.payIndex !== undefined && raw.payIndex !== null) {
        if (isPlainObject(raw.payIndex) && isPlainObject(raw.payIndex.rows)) {
            const rows = {};
            Object.keys(raw.payIndex.rows).forEach(id => {
                if (POISON_SEGMENTS.indexOf(id) !== -1) return;
                keepUnder(rows, id, raw.payIndex.rows[id]);
            });
            if (Object.keys(rows).length > 0) {
                schedule.payIndex = { v: raw.payIndex.v === undefined ? 1 : raw.payIndex.v, rows };
            }
        } else if (!(isPlainObject(raw.payIndex) && Object.keys(raw.payIndex).every(key => key === 'v'))) {
            payHeld.payIndex = raw.payIndex;
        }
    }
    if (Object.keys(payHeld).length > 0) schedule.payUnreadableContainer = payHeld;

    // THE INDEX OF THE MONTHS THAT HAVE LEFT THE LIVE DOCUMENT (Phase 6), carried exactly
    // as it lies - every row, readable or not, and the calendar dates beside them. It is
    // the only thing in the record that says which days may no longer be edited and which
    // a whole-document write must leave out; this function copies across only what it
    // names, so without this block the first save would drop it. Not named in
    // emptySchedule: a record with no month out is byte for byte the record it was.
    // Never judged here - monthStoredIndex reads it, and a row it cannot read is held as
    // broken at the gate, not repaired.
    if (raw.monthIndex !== undefined && raw.monthIndex !== null) {
        if (isPlainObject(raw.monthIndex)) {
            const kept = {};
            Object.keys(raw.monthIndex).forEach(key => {
                if (POISON_SEGMENTS.indexOf(key) === -1) kept[key] = JSON.parse(JSON.stringify(raw.monthIndex[key]));
            });
            const rows = isPlainObject(kept.rows) ? Object.keys(kept.rows).length : 0;
            const dates = Array.isArray(kept.dates) ? kept.dates.length : 0;
            if (rows > 0 || dates > 0 || Object.keys(kept).some(key => ['v', 'rows', 'dates'].indexOf(key) === -1)) {
                schedule.monthIndex = kept;
            }
        } else {
            schedule.monthIndex = raw.monthIndex;
        }
    }

    // AND SOMEBODY IS TOLD, from here, because here is the only place every door meets.
    //
    // A schedule reaches this function from boot, from a cloud snapshot, from a restore,
    // from a backup import, from the raw rescue import, from the migration and from a
    // whole-document replacement. Reporting at each of those is seven chances to forget
    // one; reporting here is none.
    //
    // Recovery is the right home and not an overreach: it quarantines rather than
    // deletes, it blocks WRITING rather than reading, and it leaves the rescue export
    // working - which is exactly the shape this needs. The document still opens, the
    // bytes are still there, the fold cannot see them, and the device will not record a
    // new day on top of financial history it cannot read. Recovery.damaged is keyed, so
    // arriving here twice with the same trouble says it once.
    // AND A DISPUTED ID, re-reported on every read for the same reason the unreadable
    // entries are: Recovery's hold lives for one session and is re-derived from what the
    // record says, so a device that boots onto two bodies under one id has to be told
    // again rather than carrying on because the last session already said it.
    if (typeof Recovery !== 'undefined'
        && isPlainObject(schedule.ledger.conflicted)
        && Object.keys(schedule.ledger.conflicted).length > 0) {
        Recovery.damaged('scheduleData:v2:ledger:conflict',
            JSON.stringify(schedule.ledger.conflicted),
            'יש רשומת מקדמה עם אותו מזהה ותוכן אחר. שתי הגרסאות נשמרו כמו שהן ולא נמחק '
            + 'דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי ותבדוק איזו מהן נכונה.');
    }

    if (typeof Recovery !== 'undefined'
        && (Object.keys(schedule.ledger.unreadable).length > 0
            || Object.keys(schedule.ledger.unreadableMigrations).length > 0)) {
        // BOTH FAMILIES, because either one alone can be the whole trouble.
        //
        // This passed schedule.ledger.unreadable and nothing else. A record whose only
        // damaged part was an APPROVAL therefore raised its problem with a payload of
        // "{}", Recovery quarantined "{}", and the rescue export - the one way those
        // bytes have of leaving the phone - carried an empty object where somebody's
        // approval of a money migration used to be. The person was told to export a
        // backup before they could carry on, and the backup did not contain the thing
        // that stopped them.
        //
        // Named rather than merged into one map: the two have separate id namespaces
        // and putting them in one object would let a collision decide which record
        // survives, which is the fault the two maps exist to prevent.
        Recovery.damaged('scheduleData:v2:ledger',
            JSON.stringify({
                unreadable: schedule.ledger.unreadable,
                unreadableMigrations: schedule.ledger.unreadableMigrations
            }),
            'חלק מהיסטוריית המקדמות לא נקרא. הנתונים נשמרו כמו שהם ולא נמחק דבר, '
            + 'אבל אי אפשר לרשום עוד עד שתייצא גיבוי - כדי שלא ייחשב סכום שלא הצלחנו לקרוא.');
    }

    // THE PAY BOOK, on the same terms (v173) - what cannot be READ. Iron law 10.
    //
    // Two troubles, two keys, as the ledger has: a container that is not a record, and
    // an entry inside a readable one that this build could not have written. Either is
    // somebody's closure or somebody's payment that no fold on this phone can count, so
    // the bytes are quarantined - the rescue file carries them under their own name even
    // if the record is later damaged - and writing stops until a person has been told.
    //
    // Through Recovery.evidence for the entries, where the BYTES are the sighting: the
    // entry stays on the record for ever by design, so the same bytes at the next
    // snapshot are the same trouble and say nothing, and a different unreadable entry
    // arriving after the person acknowledged the first is a new one and is told.
    //
    // A DISAGREEMENT IS NOT HERE, deliberately. `payConflicted` is two READABLE bodies
    // under one id; both are on the record, the fold counts the one the cloud holds and
    // names the other, and every pay planner refuses that man until a person has looked.
    // Stopping the whole phone for it - which is what a ledger disagreement does - would
    // stop somebody recording tonight's days over a question about last week's envelope.
    // The reasoning, and what it does not weaken, is in docs/payroll-closure.md.
    if (typeof Recovery !== 'undefined' && schedule.payUnreadableContainer !== undefined) {
        Recovery.damaged('scheduleData:v2:pay:container',
            JSON.stringify(schedule.payUnreadableContainer),
            'רישום סגירות החשבון אינו בצורה שאפשר לקרוא. שום דבר לא נמחק - '
            + 'הנתונים נשמרו כמו שהם - אבל אי אפשר לרשום עוד עד שתייצא גיבוי, '
            + 'כדי שלא ייכתב רישום ריק מעליו.');
    }
    if (typeof Recovery !== 'undefined' && typeof paybookUnreadable === 'function') {
        const unreadablePay = paybookUnreadable(schedule);
        if (Object.keys(unreadablePay).length > 0) {
            Recovery.evidence('scheduleData:v2:pay', JSON.stringify(unreadablePay),
                'חלק מרישום סגירות החשבון והתשלומים לא נקרא. הנתונים נשמרו כמו שהם ולא '
                + 'נמחק דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי - כדי שלא ייחשב סכום '
                + 'שלא הצלחנו לקרוא.');
        }
    }

    // The invariant, enforced here because here is where every route in meets: a
    // snapshot, a boot from disk, an imported file, a restored backup. Anything with a
    // day or an advance behind it gets an identity back - archived - rather than being
    // left as work belonging to nobody. See reinstateReferenced in js/model/schema.js.
    //
    // The names are looked up in the RAW roster before they are handed over, tombstones
    // included: a stale whole array that no longer grants membership still remembers
    // what the man was called, and a recovered row reading "עובד שנמחק" when the name is
    // sitting right there would be worse than useless to the person reading the report.
    reinstateReferenced(schedule, rememberedEntities(raw, hints));

    schedule.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
    schedule.updatedBy = typeof raw.updatedBy === 'string' ? raw.updatedBy : null;
    return schedule;
}

// Every RECORD the document still has for an id, in either form, membership aside.
//
// Not just the name: a reinstated man keeps his phone, his identity number and both his
// rates, and this is where they have to survive from. A stale whole array that no longer
// grants membership is still the last full copy of him anybody holds.
//
// Later sources overwrite earlier ones, so the order is deliberate: what the caller
// remembers first, then the document's array, then its keyed map - the most authoritative
// form last.
function rememberedEntities(raw, hints) {
    const out = { workers: {}, places: {} };
    // MERGED, not overwritten. Since v104 the keyed map can hold a FRAGMENT - what one
    // per-field write leaves on a document whose map had no entry for that man,
    // `{ phone: … }` and nothing else - and it is the most authoritative form, so it went
    // last and took his name, his identity number and both his rates off the copy the
    // array still had. This function exists so a reinstated man keeps all of that. Later
    // sources still win field by field, which is what "authoritative" was ever meant to
    // say; what they cannot do any more is win by being silent.
    const keep = (kind, id, item) => {
        if (!item || typeof item !== 'object') return;
        const key = String(id);
        const merged = {};
        [out[kind][key], item].forEach(source => {
            if (!source) return;
            Object.keys(source).forEach(field => {
                if (POISON_SEGMENTS.indexOf(field) !== -1) return;
                merged[field] = source[field];
            });
        });
        out[kind][key] = merged;
    };

    ['workers', 'places'].forEach(kind => {
        const given = (hints && hints[kind] && typeof hints[kind] === 'object') ? hints[kind] : {};
        Object.keys(given).forEach(id => keep(kind, id, given[id]));

        (Array.isArray(raw[kind]) ? raw[kind] : []).forEach(item => {
            if (item && item.id) keep(kind, item.id, item);
        });

        const map = (raw.roster && typeof raw.roster === 'object') ? raw.roster[kind] : null;
        if (!map || typeof map !== 'object') return;
        Object.keys(map).forEach(id => keep(kind, id, map[id]));
    });
    return out;
}

function normaliseLayer(side) {
    const out = {};
    if (!side || typeof side !== 'object') return out;

    Object.keys(side).forEach(workerId => {
        const record = side[workerId];
        if (!record || typeof record !== 'object') return;
        // NOT COPIED under a poison name. `out.__proto__ = kept` is not a copy - it
        // makes the poisoned record the layer's prototype, so `layer.entries` answers
        // that worker's entries and the row itself is nowhere. It did not show at the
        // first sighting, which Recovery holds before adoption; it showed when the
        // person acknowledged and the same document arrived again. The map's bytes are
        // reported and quarantined by poisonedContainers; this only refuses to write
        // the name into an ordinary object.
        if (POISON_SEGMENTS.indexOf(String(workerId)) !== -1) return;

        const entries = (Array.isArray(record.entries) ? record.entries : [])
            .filter(entry => entry && entry.placeId)
            .map(entry => makeEntry(entry.placeId, entry.rate, entry.extraHours));

        // The rate the day was recorded at travels with it. Dropping it here would send
        // every day back to being paid at whatever the roster says today, which is the
        // whole thing the stamp exists to prevent - and it would do it silently, on the
        // way in from a backup file or from another phone.
        const kept = record.absent ? { absent: true, entries: [] } : { entries };
        if (record.rates && typeof record.rates === 'object') {
            const daily = Number(record.rates.daily) || 0;
            const hourly = Number(record.rates.hourly) || 0;
            if (daily > 0 || hourly > 0) kept.rates = { daily, hourly };
        }
        out[workerId] = kept;
    });

    return out;
}

// A decision the migration refused to guess is a question about one cell in ONE schedule.
// It was stored as a bare list under a fixed key, so a list left by whatever was on the
// phone before survived an import and attached itself to the week that had just arrived -
// pointing at a worker and a date that record has never heard of.
//
// So the list carries the fingerprint of the schedule it describes, and a list that does
// not match the record on the disk is not adopted. An older build's bare array is still
// read: it is all there is, and refusing it would throw away questions somebody has not
// answered yet.
function fingerprintOf(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) {
        value = (Math.imul(value, 31) + text.charCodeAt(i)) | 0;
    }
    return (value >>> 0).toString(36) + ':' + text.length;
}

// Of the record the NEXT session would open, not of what is in memory: the questions have
// to belong to the schedule that survives the app being closed.
function scheduleFingerprint() {
    const raw = Store.durableGet(V2_KEY);
    return raw === null ? '' : fingerprintOf(raw);
}

// One reader for the record, and it says which of the three things it found.
//
//   bound      the list names the schedule it describes, and that schedule is here
//   unbound    a bare array, the way a build before the binding wrote one. It is all
//              there is, so it is carried - and it is NOT evidence about this week
//   stale      the list names a different schedule: not adopted
//   unreadable bytes that will not parse. NOT the same as "there were no questions",
//              which is what this answered before, in the same words it uses for a key
//              that is not there
//
// The version this replaced returned a bare array for all three, and its caller could not
// tell them apart.
//
// It stays a PARSER: nothing here quarantines and nothing here holds. Two callers read
// through it, and only one of them is reading this device's record - js/ui/backup.js
// reads a rescue file through it, and a report raised from in here would file another
// phone's bytes as damage found on this one. Recovery.collect's comment is about exactly
// that mistake. So the reading caller is told, and decides.
function parseIssuesRecord(raw, fingerprint) {
    if (!raw) return { issues: [], bound: true, found: false };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return { issues: [], bound: true, found: false, unreadable: true };
    }
    if (Array.isArray(parsed)) return { issues: parsed, bound: false, found: true };
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.issues)) {
        return { issues: [], bound: true, found: false };
    }
    if (typeof parsed.forSchedule !== 'string') {
        return { issues: parsed.issues, bound: false, found: true };
    }
    if (fingerprint !== undefined && parsed.forSchedule !== fingerprint) {
        return { issues: [], bound: false, found: true, stale: true };
    }
    return { issues: parsed.issues, bound: true, found: true };
}

// The record on THIS device, and law 10 applies to it like any other.
//
// An unreadable list used to come back as [] with nothing said: the migration screen drew
// "nothing left to decide", the banner said nothing, no copy was made, and the next
// writeIssues put an empty list over the only place those questions existed. They are not
// derivable from the schedule beside them - js/recovery.js calls them a question about
// somebody's day that is still waiting for a person - so losing them loses the half
// nobody can reconstruct.
//
// Reported the way every other damaged record on this device is: the bytes copied under
// their own name and read back, the original left where it is, the person told, and the
// device held until they are. The screen still opens, because the questions are not the
// record - what is refused is writing over them.
function readIssues() {
    const raw = Store.get(ISSUES_KEY);
    const read = parseIssuesRecord(raw, scheduleFingerprint());
    if (read.unreadable && typeof Recovery !== 'undefined' && Recovery && Recovery.damaged) {
        Recovery.damaged(ISSUES_KEY, raw,
            'רשימת הרישומים הממתינים להחלטה לא נקראה.');
    }
    return read.issues;
}

// Written and READ BACK, and the answer is returned. The caller used to ignore it, so an
// import could report success over a device holding the new schedule and none of the
// questions that came with it - and the questions were the half nobody could reconstruct.
//
// `bound` says whether the list can be shown to belong to the schedule on the disk. It is
// false for a list that arrived in a file written before the binding existed: those
// questions are still somebody's questions and are kept, but nothing here pretends to
// know which week they are about.
function writeIssues(issues, options) {
    // The same line State.save and State.persist carry, for the same reason. The record
    // under this key may BE the unreadable one, and a device that has not yet told
    // somebody about it must not write anything over it - least of all an empty list,
    // which is what a reader that could not parse it hands straight back.
    if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return false;

    const bound = !options || options.bound !== false;
    const record = { issues: issues || [] };
    if (bound) record.forSchedule = scheduleFingerprint();
    else record.bound = false;
    return Store.setVerified(ISSUES_KEY, JSON.stringify(record));
}

// By identity, not by position: the list is rebuilt on every render, and an index
// captured when the card was drawn can point at a different issue by the time an answer
// comes back from a dialog.
function dismissIssue(issue) {
    const index = State.migrationIssues.indexOf(issue);
    if (index === -1) return;
    State.migrationIssues.splice(index, 1);
    writeIssues(State.migrationIssues);
}
