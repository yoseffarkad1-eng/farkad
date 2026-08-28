// The one place the schedule lives while the app is open, and the one place that decides
// when it is written down.
//
// v1 data is never modified. It is read, migrated into a new key, and left exactly where
// it was - so if anything about the migration turns out to be wrong, the original is
// still sitting there untouched.

const V1_KEY = 'scheduleData';
const V2_KEY = 'scheduleData:v2';
const ISSUES_KEY = 'scheduleData:migrationIssues';
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
        return result;
    },

    loadRecord() {
        let damaged = false;
        const v2 = Store.get(V2_KEY);
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

                this.schedule = normaliseSchedule(upgraded);
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
            console.error('v1 schedule unreadable:', error);
            this.schedule = emptySchedule();
            return { migrated: false, failed: true, damaged };
        }

        this.schedule = result.schedule;
        this.migrationIssues = result.issues;
        this.replayJournal();
        // Shown, so the week is on screen and can be read - but not written down. Saving
        // it would put pre-migration data over the newest record there is.
        if (!damaged) {
            writeIssues(result.issues);
            this.save({ silent: true });
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
    saveFailed: false,

    // The schedule exactly as it was last CONFIRMED on the disk. What memory is put back
    // to when an edit turns out to have nowhere durable to live.
    durableText: null,

    save(options) {
        // Blocked: either the page and the scripts are from different builds, or a
        // damaged record is sitting under one of these keys. Either way what is already
        // saved stays saved and nothing new is written. See js/recovery.js.
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return false;

        this.schedule.updatedAt = new Date().toISOString();
        this.schedule.updatedBy = syncDeviceId();

        // Verified, not assumed. This is the record; a write that did not land is the
        // evening gone at the next reload, and the old line here could not tell the
        // difference between that and a save.
        const text = JSON.stringify(this.schedule);
        const landed = Store.setVerified(V2_KEY, text);
        this.saveFailed = !landed;

        if (landed) {
            this.durableText = text;
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
        if (typeof this.durableText !== 'string') return false;

        try {
            this.schedule = normaliseSchedule(JSON.parse(this.durableText));
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
    commitRoster(removed) {
        const journalled = (typeof FarkadSync === 'undefined' || !FarkadSync.editRoster)
            ? !Store.available
            : Boolean(FarkadSync.editRoster(this.schedule, removed)) || !Store.available;

        if (!journalled) return this.refuseEdit();

        this.save();
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
        // A write the model refused. Nothing is saved and nothing is sent, and the reason
        // is said out loud - a refusal handled in silence looks exactly like a tap that
        // did not register, and the person taps again.
        if (change && change.refused) {
            if (typeof askTell === 'function') askTell(change.reason);
            return false;
        }

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

        this.save();
        render();
        return true;
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

    // The shared ending for a commit with nowhere to live.
    refuseEdit() {
        this.rollback();
        render();
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
        const text = JSON.stringify(this.schedule);
        const landed = Store.setVerified(V2_KEY, text);
        this.saveFailed = !landed;
        if (landed) {
            this.durableText = text;
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
        // Copying a day across can meet the two-site cap partway through. The rest of the
        // copy still lands - refusing the whole thing over one worker would be a worse
        // answer - and what did not is named once rather than per row.
        const refused = (changes || []).filter(change => change && change.refused);
        const accepted = (changes || []).filter(change => change && !change.refused);

        // All or nothing, and ONE write. Journalling them one at a time was all-or-nothing
        // in what it reported and not in what it did: the first entry landed, the second
        // ran out of room, and the app said the copy had not happened while half of it sat
        // on the disk waiting to come back at the next open.
        if (!this.journalBatch(accepted)) return this.refuseEdit();

        this.save();
        render();
        if (refused.length > 0 && typeof askTell === 'function') {
            askTell(`${refused.length} רישומים לא נוספו: ${refused[0].reason}`);
        }
        return true;
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
    },

    // Vehicles are minted the same way, and for the same reason: two phones adding one on
    // the same evening must not choose the same id. The first version counted the vehicles
    // already here and returned v_01, so both phones would have chosen v_01 and one would
    // have quietly overwritten the other's van.
    nextVehicleId() {
        const id = newEntityId('v');
        if (typeof FarkadSync !== 'undefined' && FarkadSync.markLocallyMinted) {
            FarkadSync.markLocallyMinted('vehicles', id);
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
    // Both shapes, merged rather than chosen between - the same as the roster above. The
    // array is what a phone still on an older build reads and writes; the map carries the
    // ones that changed, so reading either alone loses a vehicle.
    const rawVehicles = mergeRoster(raw.vehicles, roster.vehicles, roster.vehicleOrder);
    schedule.vehicles = (Array.isArray(rawVehicles) ? rawVehicles : [])
        .filter(v => v && v.id)
        .map(v => ({
            id: String(v.id),
            name: String(v.name || ''),
            ownerId: String(v.ownerId || ''),
            active: v.active !== false,
            rates: (Array.isArray(v.rates) ? v.rates : [])
                .filter(entry => entry && typeof entry.from === 'string' && entry.from)
                .map(entry => ({ from: String(entry.from), amount: Number(entry.amount) || 0 }))
        }));

    const days = (raw.days && typeof raw.days === 'object') ? raw.days : {};
    Object.keys(days).forEach(date => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const day = days[date] || {};
        schedule.days[date] = {
            plan: normaliseLayer(day.plan),
            actual: normaliseLayer(day.actual)
        };

        // The vehicles that stayed in the yard. Written since v83 and copied by nothing,
        // so it disappeared at the next open even once the validator stopped calling the
        // record damaged - this function builds a fresh schedule and keeps only what it
        // recognises. Stored only when there is an exception to store: the ordinary
        // evening writes nothing at all, and an empty list on every day of the record is
        // a field on every device's document forever.
        const off = Array.isArray(day.vehiclesOff)
            ? day.vehiclesOff.filter(id => id && typeof id === 'string').map(String)
            : [];
        if (off.length > 0) schedule.days[date].vehiclesOff = off;
    });

    // Advances arrive keyed by id. A null value is a deletion another device sent and
    // must not come back as a record; anything without a worker or a date cannot be
    // placed in an account and is dropped rather than counted against the wrong one.
    const advances = (raw.advances && typeof raw.advances === 'object') ? raw.advances : {};
    Object.keys(advances).forEach(id => {
        const item = advances[id];
        if (!item || typeof item !== 'object') return;
        if (!item.workerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) return;
        schedule.advances[id] = {
            id: String(id),
            workerId: String(item.workerId),
            date: String(item.date),
            amount: Number(item.amount) || 0,
            note: String(item.note || '')
        };
    });

    // The ledger, carried through unchanged. Entries are append-only and this is a
    // read: an entry that will not parse is DROPPED from the fold rather than repaired,
    // because a repaired entry is a claim about money that nobody made.
    const ledger = (raw.ledger && typeof raw.ledger === 'object') ? raw.ledger : {};
    const entries = (ledger.advances && typeof ledger.advances === 'object')
        ? ledger.advances : {};
    Object.keys(entries).forEach(id => {
        const entry = entries[id];
        if (!entry || typeof entry !== 'object') return;
        if (!entry.advanceId || !entry.kind) return;
        schedule.ledger.advances[id] = Object.assign({}, entry, { id: String(id) });
    });

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
    const keep = (kind, id, item) => {
        if (!item) return;
        out[kind][String(id)] = item;
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

function readIssues() {
    try {
        const raw = Store.get(ISSUES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function writeIssues(issues) {
    Store.set(ISSUES_KEY, JSON.stringify(issues || []));
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
