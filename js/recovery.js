// What happens when a record on this device will not parse.
//
// There are three of them - the schedule, the outbox, and a restore waiting to go out -
// and all three had the same shape of bug: put a copy aside with `optional: true`, ignore
// whether that copy was written, and carry on as if the record had been empty. Two things
// then followed. The first ordinary write overwrote the damaged original, and on the
// device where this is most likely to happen - a full one - the copy had failed too. So
// the one remaining trace of those edits was deleted by the recovery meant to save it.
//
// The rule here is the opposite one, and it has no exceptions:
//
//   THE DAMAGED ORIGINAL IS NEVER DELETED, NEVER OVERWRITTEN, AND NEVER TREATED AS EMPTY.
//
// A copy is made under a second key and READ BACK before it is believed. Until that copy
// is confirmed, and until the person has been told, the app does not write. A record that
// will not parse is still the only record of somebody's work: JSON that a parser refuses
// is usually a truncated write, and the days inside it are plain text that can be read out
// by hand or handed to somebody who can.
//
// Blocking writes is a real cost on a building site. It is a smaller cost than recording
// an evening on top of the last trace of the previous one.

const Recovery = {
    // { key, raw, copy, message, mustHold }
    //   copy     - where the raw bytes were safely put, or null if that failed
    //   mustHold - writes cannot be resumed for this one, at all
    problems: [],
    acknowledged: false,
    // True once js/app.js has drawn the app for the first time. Until then nothing in
    // here may call render(): the one caller that did, evidence(), is reached from
    // State.load, which boot() runs BEFORE its first render - see the note there.
    onScreen: false,
    // While a list sits here, damaged() and evidence() put their reports IN IT instead
    // of on this device - see collect(). Null between collections, which is always.
    collecting: null,

    // A raw record that would not parse. Returns the quarantine key, or null.
    //
    // `raw` is passed in rather than re-read: whoever found the damage has the bytes in
    // hand, and reading again could pick up something else.
    //
    // `alwaysHold` is for the records where a safe copy is not the question.
    //
    // Acknowledging normally means "I have the export, let me carry on recording", and
    // for most damaged records that is a fair trade: the bytes are safe, and the work
    // that follows is new work. For a record that describes an UNFINISHED TRANSACTION it
    // is not. Carrying on there means ordinary sends resume, an acknowledged entry inside
    // a written schedule is pruned, and the queue is emptied of exactly the edits that
    // transaction would have needed to replay once it could run again - so the day the
    // person recorded after the restore disappears from the screen, the disk and the
    // cloud, hours after they pressed the button that promised the opposite.
    damaged(key, raw, message, alwaysHold) {
        if (this.collecting) {
            this.collecting.push({ kind: 'damaged', key, raw, message, alwaysHold });
            return null;
        }
        const already = this.problems.find(problem => problem.key === key);
        if (already) return already.copy;

        const copy = quarantineRecord(key, raw);
        this.problems.push({
            key,
            raw,
            copy,
            message: message || `הרישום "\u2068${key}\u2069" לא נקרא.`,
            // A copy that could not be confirmed means the original is the only one there
            // is. Writing anywhere near it is not something to let somebody wave away.
            mustHold: !copy || alwaysHold === true
        });

        this.paint();
        return copy;
    },

    // The same trouble under the same key, where the BYTES are the identity.
    //
    // damaged() above is keyed: the second report of one trouble in one session says
    // nothing, which is right when two callers describe the same record in different
    // words. It is wrong for a map quarantined as it arrived - a poisoned layer from
    // the cloud - because there the bytes ARE the evidence. Measured: the person
    // acknowledged the first sighting, the same document arrived again with different
    // bytes under the poisoned name, damaged() answered from the first entry, and the
    // new bytes were never copied, never reported and never in the rescue file.
    //
    // Identical bytes are the same sighting and are answered from it. Different bytes
    // are a new problem: quarantined beside the earlier copy, never over it, and told -
    // an acknowledgement covers the problems the person was shown, not this one.
    evidence(key, raw, message) {
        if (this.collecting) {
            this.collecting.push({ kind: 'evidence', key, raw, message });
            return null;
        }
        const same = this.problems.find(problem => problem.key === key && problem.raw === raw);
        if (same) return same.copy;

        const copy = quarantineRecord(key, raw);
        this.problems.push({
            key,
            raw,
            copy,
            message: message || `הרישום "\u2068${key}\u2069" לא נקרא.`,
            mustHold: !copy
        });
        this.acknowledged = false;
        this.paint();
        // Redrawn only once the app is on screen. This is reached from State.load -
        // normaliseSchedule reports a poisoned map through it - and boot() runs
        // State.load before the app's first render. A redraw there drew every view
        // over a State that was half read, the schedule still the empty one from
        // definition time; and it ran inside loadRecord's try, so anything render()
        // threw while drawing that half-state was caught as "the stored record cannot
        // be read" - a readable record quarantined and the phone held for a fault in
        // the drawing. Before the first render the boot's own render shows the hold,
        // exactly as it does for damaged(); after it, the redraw is what makes a map
        // heard from the cloud worn by the whole screen the moment it is held.
        if (this.onScreen && typeof render === 'function') render();
        return copy;
    },

    // READING A FILE IS NOT FINDING DAMAGE ON THIS DEVICE.
    //
    // normaliseSchedule reports to Recovery from wherever it runs, on purpose - it is
    // the one place every door meets, and reporting there is the reason no door can
    // forget to. But two of the doors run it on a document that is NOT this device's
    // record: the import reads a backup or a rescue file to describe it in a dialog,
    // and the restore transaction normalises the replacement before it is written. A
    // report from either is about the FILE, and telling this device's Recovery at that
    // moment quarantined another phone's bytes here and blocked writing - before the
    // person had answered the dialog. Measured: cancel at "wrong file", and the phone
    // stayed held, re-held at every reopen from the copy on its disk, its own rescue
    // file carrying the other phone's evidence as its own. Confirm, and the replacement
    // was refused because writing was blocked, worded as a full disk.
    //
    // So a caller that is only READING collects. `fn` runs with every report it causes
    // put in a list instead of on this device - nothing quarantined, nothing blocked,
    // nothing painted - and the list comes back beside its answer. Once the document
    // has actually become this device's record, deliver() puts the reports where they
    // would have gone, in the same order, through the same two methods, so nothing is
    // said differently for having waited. A cancelled read delivers nothing: the bytes
    // stay in the file, which is where they were.
    //
    // Synchronous, and only ever around synchronous code: the sink is a device-wide
    // switch, and a report from anywhere else while it is up would be collected too.
    // Nested collections are honest - the inner list wins while it is up, the outer
    // one comes back afterwards.
    collect(fn) {
        const outer = this.collecting;
        const reports = [];
        this.collecting = reports;
        try {
            return { answer: fn(), reports };
        } finally {
            this.collecting = outer;
        }
    },

    // The reports a collection put aside, told now. Each goes through the method that
    // would have taken it, so a keyed report is still keyed and bytes are still the
    // identity - a report already on the list is answered from it, as it always was.
    deliver(reports) {
        (reports || []).forEach(report => {
            if (!report || typeof report.key !== 'string') return;
            if (report.kind === 'evidence') {
                this.evidence(report.key, report.raw, report.message);
            } else {
                this.damaged(report.key, report.raw, report.message, report.alwaysHold);
            }
        });
    },

    // A reason to stop writing that is not a damaged record - a build mismatch, where the
    // page and the scripts disagree. Not acknowledgeable: a reload is the fix.
    halt(id, message) {
        if (this.problems.some(problem => problem.key === id)) return;
        this.problems.push({ key: id, raw: null, copy: null, message, mustHold: true });
        this.paint();
        // The held state is worn by the whole screen (body class, dimming, the badge on
        // the progress row) and those are drawn by render - which already ran by the
        // time a boot-time halt lands. Without this, the block is invisible until the
        // person loses an edit to it.
        if (typeof render === 'function') render();
    },

    // True while nothing may be written to this device.
    blocked() {
        if (this.problems.length === 0) return false;
        if (!this.acknowledged) return true;
        // Acknowledging clears the ones whose bytes are safely copied. It cannot clear one
        // where the copy failed, because there the original is all that exists.
        return this.problems.some(problem => problem.mustHold);
    },

    // Everything worth getting off the device, for the export.
    //
    // The wreckage AND the live state. A file holding only the unreadable records is a
    // file nobody can use to carry on: what somebody in this situation actually needs is
    // the schedule as it stands and whatever queue is live, alongside the raw bytes of
    // whatever went wrong. Reading them through durableGet on purpose - the export is
    // about what is on the device, not what this session happens to be holding.
    rawRecords() {
        const out = {};

        this.problems.forEach(problem => {
            if (problem.raw !== null && problem.raw !== undefined) out[problem.key] = problem.raw;
            if (problem.copy) out[problem.copy] = Store.get(problem.copy);
        });

        const schedule = Store.durableGet('scheduleData:v2');
        if (schedule !== null) out['scheduleData:v2'] = schedule;

        // The record an old build wrote, and the decisions the migration off it refused
        // to guess. Neither is derivable from the schedule beside them: the v1 bytes are
        // the only copy of anything the migration could not carry across, and an issue is
        // a question about somebody's day that is still waiting for a person. A rescue
        // file that dropped them would hand over a schedule and quietly lose the part
        // nobody had answered yet.
        ['scheduleData', 'scheduleData:migrationIssues'].forEach(key => {
            const held = Store.durableGet(key);
            if (held !== null) out[key] = held;
        });

        // EVERY quarantine copy on the device, not only the ones this session put aside.
        // A copy made months ago, whose original has since been written over by an
        // ordinary save, is the only trace of those bytes left anywhere - and it was
        // being left behind by an export that walked this session's problem list.
        //
        // By ALLOWLIST, not by suffix. ":damaged" is a convention this app follows; it is
        // not a licence to copy anything on the origin whose name happens to contain it
        // into a file somebody is about to send over WhatsApp. A copy counts only when
        // the record it is a copy OF is one this app writes.
        Store.keys()
            .filter(isFarkadQuarantineKey)
            .sort()
            .forEach(key => {
                const held = Store.durableGet(key);
                if (held !== null) out[key] = held;
            });

        // The queue that is actually being written to, which after a damaged one is not
        // the key anybody would think to look under - and which is a FAMILY of keys, not
        // one record. Naming only the slot would put the sequence number in the file and
        // leave every unsent day out of it.
        if (typeof FarkadSync !== 'undefined' && FarkadSync.activeQueueKeys) {
            FarkadSync.activeQueueKeys().forEach(key => {
                const live = Store.durableGet(key);
                if (live !== null) out[key] = live;
            });
        }

        // The record that coordinates sending between windows, when it is unreadable.
        //
        // Ordinarily it needs no naming: a claim nobody can read is quarantined under the
        // :damaged suffix the sweep above already carries, and the live one is a lock
        // token of no interest to anybody. But the copy can fail, and the disk that
        // refuses it is the same disk whose full write left the record half finished in
        // the first place - so the shape where quarantine fails is the LIKELY one, and
        // there these bytes are the only copy in existence.
        //
        // Named, not swept, and only while unreadable: a readable claim is this session's
        // own lock and putting it in a file somebody sends over WhatsApp says nothing
        // about anybody's work.
        if (typeof FarkadSync !== 'undefined' && FarkadSync.unreadableSendClaim) {
            const claim = FarkadSync.unreadableSendClaim();
            if (claim !== null) out['farkad:sendClaim'] = claim;
        }

        // A restore that was asked for and has not finished, and the frozen upgrade of an
        // old one beside it. Neither is derivable from anything else in the file: they
        // describe work somebody was TOLD had happened, and a device held up by one of
        // them is exactly the device whose data is being exported.
        ['farkad:pendingReplace', 'farkad:pendingReplace:v71'].forEach(key => {
            const held = Store.durableGet(key);
            if (held !== null) out[key] = held;
        });

        // Where every worker and site on this device came from - the facts that decide
        // whether a man can be permanently deleted. Whoever opens this file has to be
        // able to work that out too: without them the record says what happened but not
        // what this device believed it was allowed to do, which is exactly the question
        // asked when somebody has gone missing from a roster.
        //
        // Written one key per fact, so they are enumerated rather than named - see the
        // provenance block in js/sync/sync.js.
        Store.keys()
            .filter(key => key === 'farkad:provenance:v1' || key.startsWith('farkad:prov:'))
            .sort()
            .forEach(key => {
                const held = Store.durableGet(key);
                if (held !== null) out[key] = held;
            });

        return out;
    },

    // ONE MOMENT OF THE DEVICE, or an honest admission that it could not be had.
    //
    // Taking the records twice and comparing them is an ABA check: it compares two
    // VALUES, so it cannot tell "nothing moved" from "moved and came back". A second tab
    // mid-fence removes a batch, the exporter reads, the fence fails and the batch
    // returns, the exporter reads again - two equal readings of a disk that was never in
    // that state, and a file that says it is stable while the phone still holds the days
    // it is missing.
    //
    // So the captures are bracketed by something only ever goes forward: Store's write
    // tick, which every durable write in every tab moves. Equal readings AND an unmoved
    // tick is one moment; anything else is not, and says so.
    //
    // Bounded, because this must never be a reason the raw bytes do not leave the phone.
    // When the readings will not settle the file is still made, it carries EVERY distinct
    // reading rather than the last one, and nothing downstream may present the
    // reconstruction as complete.
    rawSnapshot() {
        const captures = [];
        const keep = records => {
            const already = captures.some(seen => sameRecordMap(seen, records));
            if (!already) captures.push(records);
            return records;
        };

        // A window of another build, or one nothing can identify, is an UNFENCED WRITER.
        // It writes the records this file carries and moves no counter doing it, so no
        // reading of any counter can see it - and every phone in the field is such a
        // window for the length of a rollout. Asked once, before the readings, because the
        // answer cannot improve by being asked later.
        //
        // Three answers and the third is the point: true, false, and null for "nothing on
        // this device has ever reported". Null is NOT false. A device that has never been
        // told who is open cannot claim that nobody is.
        const foreign = Store.foreignWriterOpen();
        const alone = foreign === false;

        // And the fence is EXERCISED before it is trusted. A disk can have room for the
        // record and none for the evidence: the schedule write lands, the counter and the
        // broken mark are both refused, and a tab that did none of it reads a disk with no
        // trace and calls the file quiet. Writing our own counter and reading it back is
        // the difference between "nothing reported a problem" and "this works".
        const proven = Store.proveFence();

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const before = Store.fenceState();
            const first = keep(this.rawRecords());
            const second = keep(this.rawRecords());
            const after = Store.fenceState();

            // Quiet means: the WHOLE fence was readable at both ends and identical, no
            // window of another build is open, and nothing on this origin has reported the
            // fence broken.
            //
            // The fence is every tab's own counter, together. It used to be one shared
            // number, which a paused tab could put back - measured going 1 to 3 to 2 with
            // two equal readings around it - and comparing values could not see that. No
            // tab writes another's counter now and none ever lowers its own, so a set that
            // reads the same at both ends is a set nothing moved.
            const quiet = proven && alone && before !== null && after !== null
                && before === after && !Store.fenceBroken();
            if (quiet && sameRecordMap(first, second)) {
                return {
                    records: second,
                    stable: true,
                    unstableBecause: [],
                    storageReadable: Store.available,
                    captures: [second]
                };
            }
        }

        // The LAST reading taken, not the last DISTINCT one. `keep` deduplicates, so a
        // disk that went A, B, A leaves captures as [A, B] and the last of those is B -
        // an older state than the one the phone is actually in. The file then rebuilt a
        // schedule with one day in it while the device held two, and said stable:false
        // about it, which is honest and still not the record. One more reading, taken
        // last, is the closest this can get to "what the phone holds now"; every distinct
        // one is carried beside it, because on a device this file exists for, the
        // difference between two of them may be the evening somebody is looking for.
        const last = keep(this.rawRecords());

        return {
            records: last,
            stable: false,
            // Why it is not stable, so the sentence a person reads can say something more
            // useful than "something changed". These are facts about this device, not a
            // diagnosis: a rescue file is opened by whoever is holding the phone.
            unstableBecause: (foreign === true ? ['another build has a window open']
                : foreign === null ? ['this device cannot say which builds are open'] : [])
                .concat(Store.fenceBroken() ? ['the write fence is broken'] : [])
                .concat(Store.fenceState() === null ? ['the write fence cannot be read'] : [])
                .concat(proven ? [] : ['this device cannot record that a write happened']),
            storageReadable: Store.available,
            // Every reading, because on a device this file exists for the difference
            // between two of them may be the evening somebody is looking for.
            captures
        };
    },

    // Pressed only after the export. Resumes writing if every damaged record was copied.
    //
    // And resumes the cloud with it. A device that boots onto a damaged record never
    // starts the sync module at all - the import is skipped while writes are blocked -
    // and nothing used to start it afterwards. So the phone came back to life local-only
    // and stayed that way for the rest of the session: recording all evening, reporting
    // itself as an ordinary local app, with the other two phones seeing none of it, and
    // the queue growing behind a connection that was never going to be made.
    //
    // Idempotent on the other side of this call: starting the cloud twice in one session
    // must be no different from starting it once. And it happens only when the
    // acknowledgement actually released the device - a record whose bytes could not be
    // copied holds everything, and nothing about pressing a button changes that.
    acknowledge() {
        this.acknowledged = true;
        this.paint();
        const resumed = !this.blocked();
        // Both ways: a release must un-dim the screen it dimmed, and a refusal to
        // release (mustHold) must keep it visibly held.
        if (typeof render === 'function') render();
        if (!resumed) return false;

        if (typeof FarkadSync !== 'undefined' && FarkadSync.releaseRecoveryHold) {
            FarkadSync.releaseRecoveryHold();
        }
        // Defined in app.js, which the data suite does not load - and a guard that
        // silently answers "no" in the suite is not a guard, so what it does instead is
        // tested through the hook itself.
        if (typeof connectCloudLater === 'function') connectCloudLater();
        return true;
    },

    paint() {
        const banner = document.getElementById('recoveryBanner');
        if (!banner || typeof clear !== 'function') return;

        if (this.problems.length === 0 || (this.acknowledged && !this.blocked())) {
            banner.style.display = 'none';
            return;
        }

        clear(banner);
        const held = this.problems.some(problem => problem.mustHold);

        banner.appendChild(el('span', null,
            (held
                ? '⚠️ חלק מהנתונים במכשיר לא נקראים, ולא הצלחנו לשמור מהם עותק - אין מקום. '
                    + 'הרישום לא נמחק. כדי לא לכתוב מעליו, הרישום מושבת כרגע. '
                    + 'ייצא את הנתונים הגולמיים, פנה מקום במכשיר, ופתח מחדש.'
                : '⚠️ חלק מהנתונים במכשיר לא נקראים. עותק גולמי נשמר במכשיר ולא נמחק דבר. '
                    + 'ייצא אותו לפני שממשיכים לרשום.')
            + '\n' + this.problems.map(problem => problem.message).join(' ')));

        if (typeof exportRecoveryData === 'function') {
            banner.appendChild(button('💾 ייצא נתונים גולמיים', 'btn-secondary',
                () => exportRecoveryData()));
        }
        if (!held) {
            banner.appendChild(button('הבנתי, המשך לרשום', 'btn-secondary',
                () => this.acknowledge()));
        }
        banner.style.display = '';
    }
};

// Byte-for-byte, key for key. Not a JSON comparison of two objects built in different
// orders - the question is whether the disk moved between two readings.
function sameRecordMap(one, two) {
    const keys = Object.keys(one);
    if (keys.length !== Object.keys(two).length) return false;
    return keys.every(key => two[key] === one[key]);
}

// The records this app writes, by name. Everything the recovery export carries is one of
// these or a quarantine copy of one; nothing else on the origin is its business.
const FARKAD_RECORD_KEYS = [
    'scheduleData',
    'scheduleData:v2',
    'scheduleData:migrationIssues',
    'farkad:deviceId',
    'farkad:pendingReplace',
    'farkad:pendingReplace:v71',
    'farkad:provenance:v1',
    // The cross-tab right to send. The record itself is never in the rescue file - it is
    // coordination, it is worthless a second later, and fencing the snapshot on it made
    // every export unprovable while another tab was merely sending. A QUARANTINED copy of
    // it is a different thing: bytes nobody could read, kept because they are the only
    // account of why a send waited, and the file is where an account belongs.
    'farkad:sendClaim',
    // THE LEDGER'S QUARANTINE, and it is here for the same reason the send claim is.
    //
    // There is no live record under this name: js/state.js calls Recovery.damaged with it
    // when part of the advances history will not read, and what lands on the disk is
    // `scheduleData:v2:ledger:damaged`. This list is what isFarkadQuarantineKey checks the
    // BASE of - so without this line those copies are not recognised as quarantines of
    // anything this app writes, and the sweep that puts every wreck on the device into the
    // rescue file walked straight past them.
    //
    // The consequence, measured: a device that quarantined a damaged ledger, and later
    // quarantined a second one, exported a file containing the SECOND and not the first.
    // The second is in there only because this session's problem list names it; the first
    // was made in an earlier session, its original has since been written over by an
    // ordinary save, and the copy was the only trace of those bytes left anywhere. That is
    // the exact failure the sweep was added to prevent, on the one record that is money.
    'scheduleData:v2:ledger'
];

function isFarkadRecordKey(key) {
    if (FARKAD_RECORD_KEYS.indexOf(key) !== -1) return true;
    if (key.indexOf('farkad:prov:') === 0) return true;
    // THE POISON FAMILY, for the same reason the ledger's quarantine is on the list.
    //
    // js/state.js hands Recovery a map whose name it cannot use as a key under
    // scheduleData:v2:poison:<where>, and there is no live record by that name: only
    // the :damaged copies exist. A copy from an earlier session, whose original has
    // since been written over by an ordinary save, was the only trace of somebody's
    // day - and this predicate walked straight past it.
    if (key.indexOf('scheduleData:v2:poison:') === 0) return true;
    return typeof FarkadSync !== 'undefined' && FarkadSync.isQueueKey
        ? FarkadSync.isQueueKey(key)
        : false;
}

// The records the rescue FILE carries - which is not the same list as the records this
// app writes, and the difference is the whole point of having two.
//
// farkad:deviceId is the trap: it is in FARKAD_RECORD_KEYS, it is minted by the sync
// layer on any device that has lost it, and rawRecords does not put it in the file. So is
// farkad:sendClaim, which a second tab rewrites twice per send. A fence built on the
// wider list moves for both - and then a snapshot taken while another tab is merely
// sending burns every attempt and reports itself unprovable over a key the file does not
// contain, which tells somebody their rescue file is incomplete when it is not.
//
// Everything the file carries is here, and nothing else: the schedule and the record an
// older build wrote, the decisions the migration refused to guess, an unfinished restore
// and its frozen companion, the provenance, every key the queue is written across, and a
// quarantined copy of any of them.
const FARKAD_SNAPSHOT_KEYS = [
    'scheduleData',
    'scheduleData:v2',
    'scheduleData:migrationIssues',
    'farkad:pendingReplace',
    'farkad:pendingReplace:v71',
    'farkad:provenance:v1'
];

function isFarkadSnapshotKey(key) {
    const name = String(key);
    if (FARKAD_SNAPSHOT_KEYS.indexOf(name) !== -1) return true;
    if (name.indexOf('farkad:prov:') === 0) return true;
    if (isFarkadQuarantineKey(name)) return true;
    return typeof FarkadSync !== 'undefined' && FarkadSync.isQueueKey
        ? FarkadSync.isQueueKey(name)
        : false;
}

// <base>:damaged, or <base>:damaged:<n> - and only when <base> is a record this app
// writes. See quarantineRecord for where the suffix comes from.
function isFarkadQuarantineKey(key) {
    const at = key.lastIndexOf(':damaged');
    if (at <= 0) return false;
    const tail = key.slice(at + ':damaged'.length);
    if (tail !== '' && !/^:[0-9]+$/.test(tail)) return false;
    return isFarkadRecordKey(key.slice(0, at));
}

// Puts raw bytes somewhere they are safe, and does not believe it until it can read them
// back. Returns the key it used, or null.
//
// It never writes over an existing quarantine. Two damaged records under one key would
// mean the second recovery destroyed the evidence from the first, which is this whole
// file's mistake repeated one level up.
function quarantineRecord(key, raw) {
    if (raw === null || raw === undefined) return null;

    let target = key + ':damaged';
    // Bounded. A device with twenty damaged copies of one record has a different problem,
    // and an unbounded loop on a full disk would spin.
    for (let n = 2; Store.get(target) !== null && n <= 20; n += 1) {
        // A copy on the ladder that already holds these exact bytes IS the copy. It has
        // just been read back, which is the whole test a fresh one would have to pass.
        //
        // Without this, the hold that js/state.js re-derives at every boot from a
        // quarantined poisoned map - the same bytes, every session - minted one more
        // copy per open until the ladder ran out at twenty. From then on this answered
        // null, the problem was held with mustHold, acknowledging did nothing, and the
        // banner told the person there was no room for a copy while twenty identical
        // copies sat on the disk. Different bytes still go beside the earlier ones,
        // never over them.
        if (Store.get(target) === raw) return target;
        target = key + ':damaged:' + n;
    }
    if (Store.get(target) === raw) return target;
    if (Store.get(target) !== null) return null;

    // NOT optional. An optional write is one the app can live without, and this is the
    // only copy of somebody's work that exists. If there is no room, the reclaim ladder
    // inside Store is allowed to throw away restore points to make some - a restore point
    // is a copy of a state that parsed, and this is a state that did not.
    return Store.setVerified(target, raw) ? target : null;
}

// The one question everything that writes has to ask first.
//
// Defined here rather than in app.js because the data layer loads long before the UI, and
// because the test harness loads this file and not app.js - a guard that silently answers
// "no" in the suite is not a guard.
function farkadWritesBlocked() {
    return Recovery.blocked();
}
