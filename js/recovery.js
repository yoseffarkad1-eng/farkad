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
    'farkad:sendClaim'
];

function isFarkadRecordKey(key) {
    if (FARKAD_RECORD_KEYS.indexOf(key) !== -1) return true;
    if (key.indexOf('farkad:prov:') === 0) return true;
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
        target = key + ':damaged:' + n;
    }
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
