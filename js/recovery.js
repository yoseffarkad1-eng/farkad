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
    damaged(key, raw, message) {
        const already = this.problems.find(problem => problem.key === key);
        if (already) return already.copy;

        const copy = quarantineRecord(key, raw);
        this.problems.push({
            key,
            raw,
            copy,
            message: message || `הרישום "${key}" לא נקרא.`,
            // A copy that could not be confirmed means the original is the only one there
            // is. Writing anywhere near it is not something to let somebody wave away.
            mustHold: !copy
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

        // The queue that is actually being written to, which after a damaged one is not
        // the key anybody would think to look under.
        if (typeof FarkadSync !== 'undefined' && FarkadSync.activeOutboxKey) {
            const key = FarkadSync.activeOutboxKey();
            const live = Store.durableGet(key);
            if (live !== null) out[key] = live;
        }

        // A restore that was asked for and has not finished, and the frozen upgrade of an
        // old one beside it. Neither is derivable from anything else in the file: they
        // describe work somebody was TOLD had happened, and a device held up by one of
        // them is exactly the device whose data is being exported.
        ['farkad:pendingReplace', 'farkad:pendingReplace:v71'].forEach(key => {
            const held = Store.durableGet(key);
            if (held !== null) out[key] = held;
        });

        return out;
    },

    // Pressed only after the export. Resumes writing if every damaged record was copied.
    acknowledge() {
        this.acknowledged = true;
        this.paint();
        return !this.blocked();
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
