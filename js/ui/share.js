// Getting the day out of the app and to the people who need it.
//
// The workers have no accounts and never will - the roster reaches them on WhatsApp. So
// the app's job is to produce a message worth pasting, not to host a page nobody opens.
// This is also what kills the double entry: the seder is written once, here, instead of
// once on paper and again in the app afterwards.

// The owner's three WhatsApp templates, character for character - he sent them, we
// copied them. Each style defines the four seams a message has: its heading, how a
// site is introduced, how a worker is bulleted, and how the absentee line reads.
// Everything between the seams is identical, so the styles can never drift apart.
const MESSAGE_STYLES = [
    {
        key: 'pin', label: '📅 קלאסי',
        heading: parsed => `📅 סידור עבודה – ${hebrewDayName(parsed)} ${formatFullDate(parsed)}`,
        site: name => `📍 ${name}`,
        worker: (name, suffix) => `• ${name}${suffix}`,
        absent: names => `🚫 נעדרים: ${names}`
    },
    {
        key: 'crane', label: '🏗️ אתרים',
        heading: parsed => `סידור עובדים ליום ${HEBREW_DAY_NAMES[parsed.getDay()]}, ${formatFullDate(parsed)}`,
        site: name => `🏗️ ${name}`,
        worker: (name, suffix) => `– ${name}${suffix}`,
        absent: names => `נעדרים: ${names}`
    },
    {
        key: 'morning', label: '👷 בוקר טוב',
        heading: parsed => `בוקר טוב,\nלהלן שיבוץ העבודה לתאריך ${formatFullDate(parsed)}:`,
        site: name => name,
        worker: (name, suffix) => `👷 ${name}${suffix}`,
        absent: names => `❌ נעדרים: ${names}`
    }
];

const MESSAGE_STYLE_KEY = 'farkadMessageStyle';

function currentMessageStyle() {
    const saved = Store.get(MESSAGE_STYLE_KEY);
    return MESSAGE_STYLES.find(style => style.key === saved) || MESSAGE_STYLES[0];
}

function dayMessage(date, layer, styleKey) {
    const style = MESSAGE_STYLES.find(item => item.key === styleKey) || currentMessageStyle();
    const parsed = parseLocalDate(date);
    const lines = [style.heading(parsed), ''];

    let any = false;
    State.activePlaces().forEach(place => {
        const workerIds = workersAtPlace(State.schedule, date, place.id, layer);
        if (workerIds.length === 0) return;

        any = true;
        lines.push(style.site(place.name));
        workerIds.forEach(workerId => {
            const worker = State.worker(workerId);
            if (!worker) return;

            const entry = entriesFor(State.schedule, date, workerId, layer)
                .find(e => e.placeId === place.id);

            // Not in the templates, but only shown when somebody actually set one -
            // a doubled day or extra hours is information the group needs.
            let suffix = '';
            const rate = entryRate(entry);
            if (rate === RATE_DOUBLE) suffix = ' (כפול)';
            else if (rate === RATE_EXTRA) {
                const hours = entryExtraHours(entry);
                suffix = hours ? ` (+${hours} ש׳)` : ' (שעות נוספות)';
            }
            lines.push(style.worker(worker.name, suffix));
        });
        lines.push('');
    });

    const absent = State.workersForDay(date, layer)
        .filter(worker => isAbsent(State.schedule, date, worker.id, layer));
    // The line is always there, "אין" included: its absence would be ambiguous
    // between nobody-absent and nobody-checked.
    lines.push(style.absent(absent.length > 0 ? absent.map(w => w.name).join(', ') : 'אין'));

    if (!any && absent.length === 0) {
        return lines[0] + '\n\nאין שיבוצים ליום הזה.';
    }

    return lines.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}

function showDayMessage() {
    renderMessageStyles();
    const box = document.getElementById('shareText');
    box.value = dayMessage(State.date, State.layer);
    renderShareWarning();
    document.getElementById('shareStatus').textContent = '';
    document.getElementById('shareModal').style.display = 'flex';
    // Deliberately NOT focused and select-all'd: on a phone that throws up the keyboard
    // and a page-wide highlight over a message nobody is going to edit. The send button
    // takes the text straight from the box.
}

// The seder is built from what is recorded, so anyone not recorded yet is simply absent
// from the message - no line, no gap, nothing to notice. That is the same failure the
// day screen's "not recorded" tray exists to prevent, undone at the moment the message
// leaves the app, and it is discovered the next morning by the man standing at the wrong
// gate. So the message says who is missing, above the send button.
function renderShareWarning() {
    const box = document.getElementById('shareWarning');
    if (!box) return;
    clear(box);

    const missing = State.unrecorded();
    if (missing.length === 0) { box.style.display = 'none'; return; }

    const names = missing.map(worker => worker.name).join(', ');
    // Named by day, not "today": the modal follows State.date and is opened on past
    // days too. And one missing man gets a sentence, not "1 עובדים".
    const day = `ב${hebrewDayName(parseLocalDate(State.date))}`;
    const head = missing.length === 1
        ? `עובד אחד עדיין לא נרשם ${day} ולא יופיע בהודעה`
        : `${missing.length} עובדים עדיין לא נרשמו ${day} ולא יופיעו בהודעה`;
    box.appendChild(el('span', null, `⚠️ ${head}: ${names}`));
    box.style.display = '';
}

// Chosen once, remembered for good: the group is used to ONE look, and hunting for
// the right chip every evening would be its own small chore.
function renderMessageStyles() {
    const bar = document.getElementById('shareStyles');
    if (!bar) return;
    clear(bar);

    const active = currentMessageStyle();
    MESSAGE_STYLES.forEach(style => {
        const chip = button(style.label, style.key === active.key ? 'chip-on' : 'chip-off', () => {
            Store.set(MESSAGE_STYLE_KEY, style.key);
            renderMessageStyles();
            const box = document.getElementById('shareText');
            box.value = dayMessage(State.date, State.layer);
        });
        chip.setAttribute('aria-pressed', style.key === active.key ? 'true' : 'false');
        bar.appendChild(chip);
    });
}

// Straight to WhatsApp. The old route was copy → leave the app → find WhatsApp → find
// the group → paste: five steps every evening, and the first one could fail silently.
//
// navigator.share is the native sheet, with WhatsApp in it and the group list one tap
// deeper. Where it does not exist, wa.me opens WhatsApp itself with the message already
// written. Both leave the app, so the modal closes behind them.
function sendDayMessage() {
    const text = document.getElementById('shareText').value;
    const status = document.getElementById('shareStatus');

    if (navigator.share) {
        navigator.share({ text }).then(closeShareModal, error => {
            // A cancelled sheet is not a failure and must not be reported as one.
            if (error && error.name === 'AbortError') return;
            // By the time this rejection lands, the user gesture is over - window.open
            // from here is popup-blocked, and the old fallback then closed the modal
            // over a message that had gone nowhere. Stay open and say so; the copy
            // button is right there and still works.
            status.textContent = '⚠️ השיתוף לא נפתח - השתמש בהעתק ושלח ידנית';
            setTimeout(() => { status.textContent = ''; }, 6000);
        });
        return;
    }

    // No share sheet at all (desktop): the wa.me link is opened inside the click,
    // where the browser still allows it.
    status.textContent = 'פותח וואטסאפ…';
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    closeShareModal();
}

// Kept for the machine with a keyboard and for pasting somewhere that is not WhatsApp.
// It now reports what actually happened: the old version called it copied either way,
// so on a browser that refused the clipboard the person switched apps, pasted whatever
// was there from before, and sent that.
function copyDayMessage() {
    const box = document.getElementById('shareText');
    const status = document.getElementById('shareStatus');

    const said = ok => {
        status.textContent = ok ? '✔️ הועתק' : '⚠️ ההעתקה נחסמה - סמן את הטקסט והעתק ידנית';
        setTimeout(() => { status.textContent = ''; }, ok ? 2000 : 6000);
    };

    // execCommand needs the selection; the async API does not, but selecting is harmless
    // and keeps the manual fallback one gesture away when both refuse.
    box.focus();
    box.select();

    // The async clipboard API needs a secure context, which a page opened from a file or
    // over plain http is not. execCommand still works there, so both paths stay - and
    // its return value is now read rather than assumed.
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(box.value).then(
            () => said(true),
            // This rejection handler is outside the user gesture, so execCommand will
            // usually be refused here too. Its result is reported, not invented.
            () => said(tryExecCopy())
        );
        return;
    }
    said(tryExecCopy());
}

function tryExecCopy() {
    try {
        return document.execCommand('copy') === true;
    } catch (error) {
        return false;
    }
}

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
}

// ---------------------------------------------------------------- csv

// Excel needs a BOM to read a UTF-8 CSV as Hebrew rather than mojibake.
function downloadCsv(rows, filename) {
    const csv = rows
        .map(row => row
            .map(value => `"${String(value === undefined || value === null ? '' : value).replace(/"/g, '""')}"`)
            .join(','))
        .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Revoking in the same tick can cancel the download before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- restore points

// A snapshot of the schedule as it was when the app opened, one per day, three kept.
//
// The single "state before the last import" slot only survives until the next import
// overwrites it, and the failures that actually lose a fortnight are quiet ones: a bad
// import noticed two days later, a sync that adopted something wrong, a run of edits made
// on the wrong date. Those need a copy from BEFORE the day they happened.
//
// Written at load, never during editing: it is a photograph of the last known-good state,
// and taking it mid-edit would preserve the mistake.
const SNAPSHOT_PREFIX = 'scheduleData:snap:';
const SNAPSHOT_KEEP = 3;

function snapshotDates() {
    return Store.keys()
        .filter(key => key.startsWith(SNAPSHOT_PREFIX))
        .map(key => key.slice(SNAPSHOT_PREFIX.length))
        .sort()
        .reverse();
}

// What Store is allowed to throw away when the device runs out of space: the oldest
// restore point, one at a time. Registered here because Store must not be the thing that
// decides which of the app's data is expendable.
Store.reclaim = function dropOldestSnapshot() {
    const dates = snapshotDates();
    if (dates.length === 0) return false;
    Store.remove(SNAPSHOT_PREFIX + dates[dates.length - 1]);
    return true;
};

function takeDailySnapshot() {
    // Nothing to photograph, and nothing worth keeping over a real one.
    if (State.schedule.workers.length === 0) return;

    const today = todayStr();
    if (snapshotDates().includes(today)) return;

    // A snapshot must never be the reason a real save fails, so it is written first and
    // its failure is ignored: Store.set already falls back to memory and says so. Marked
    // optional so that on a full device it cannot buy its own space by deleting the older
    // restore points - the reclaim hook below is the only thing Store can throw away, and
    // a new photograph is not worth the whole album.
    Store.set(SNAPSHOT_PREFIX + today, JSON.stringify(State.schedule), { optional: true });

    snapshotDates().slice(SNAPSHOT_KEEP).forEach(date => Store.remove(SNAPSHOT_PREFIX + date));
}

function renderRestorePoints() {
    const box = document.getElementById('restorePoints');
    if (!box) return;
    clear(box);

    const dates = snapshotDates();
    if (dates.length === 0) return;

    box.appendChild(el('span', 'restore-label', 'חזרה למצב של:'));
    dates.forEach(date => {
        const parsed = parseLocalDate(date);
        box.appendChild(button(formatFullDate(parsed), 'btn-secondary',
            () => restoreSnapshot(date), `שחזר את המצב מתחילת ${formatFullDate(parsed)}`));
    });
}

// The cloud copies. Unlike everything else on this screen these do not live on this
// phone, so they survive it being lost, wiped, or restored from a mistake - and unlike
// the schedule itself they cannot be changed by anyone once written.
function renderCloudRestorePoints() {
    const box = document.getElementById('cloudRestorePoints');
    if (!box) return;
    clear(box);

    if (typeof FarkadSync === 'undefined' || FarkadSync.status !== 'synced') return;

    FarkadSync.archiveDates().then(dates => {
        if (!dates || dates.length === 0) return;
        clear(box);
        box.appendChild(el('span', 'restore-label', '☁️ מהענן:'));
        // Ten is a fortnight and a bit - far enough back to cover a mistake noticed at
        // the end of an account, without turning this into a wall of dates.
        dates.slice(0, 10).forEach(date => {
            const parsed = parseLocalDate(date);
            if (!parsed) return;
            box.appendChild(button(formatFullDate(parsed), 'btn-secondary',
                () => restoreFromCloud(date),
                `שחזר את המצב מתחילת ${formatFullDate(parsed)} מהענן`));
        });
    });
}

// The gate every restore door goes through, before normaliseSchedule is allowed near
// the content.
//
// normaliseSchedule is forgiving on purpose - a half-finished remote write should be
// read for what is in it - so it turns {} and {"workers":[],"places":[]} into an empty
// schedule and says nothing. Down these four doors that is a whole-document replacement:
// the empty schedule goes on the screen, onto the disk and up to the other two phones.
//
// Returns the document to restore, or null after telling the person exactly what is
// wrong with the one they picked. Nothing is changed on the way to a null.
function acceptRestoreSource(raw, what) {
    const read = readReplacementDocument(raw);
    if (read.document) return read.document;

    askTell({
        title: 'לא בוצע שחזור',
        message: `${what} אינו רישום שלם של לוח עבודה, ולכן לא שינינו כלום. ` +
            `מה שכבר שמור לא נפגע.\n\n${read.problems.slice(0, 3).join(' ')}`
    });
    return null;
}

// The same, for a source that has to be parsed first. A restore point whose JSON will
// not parse used to throw out of the click handler: no dialog, no error, nothing on
// screen at all - the button simply did nothing.
function acceptRestoreText(text, what) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        askTell({
            title: 'לא בוצע שחזור',
            message: `${what} לא נקרא, ולכן לא שינינו כלום. מה שכבר שמור לא נפגע.`
        });
        return null;
    }
    return acceptRestoreSource(parsed, what);
}

async function restoreFromCloud(date) {
    const parsed = parseLocalDate(date);
    const go = await askConfirm({
        title: `לחזור למצב של ${formatFullDate(parsed)}?`,
        message: 'העותק הזה יוחלף בכל המכשירים. המצב הנוכחי יישמר כאן, כך שאפשר לחזור ממנו.',
        ok: 'שחזר'
    });
    if (!go) return;

    let raw;
    try {
        raw = await FarkadSync.archiveRead(date);
    } catch (error) {
        askTell('לא הצלחנו לקרוא את העותק מהענן. בדוק את החיבור ונסה שוב.');
        return;
    }
    if (!raw) {
        askTell('העותק הזה לא נמצא בענן.');
        return;
    }

    // Checked before the way back is written, let alone before anything is replaced.
    const document = acceptRestoreSource(raw, 'העותק מהענן');
    if (!document) return;

    // Confirmed BEFORE anything is replaced. The order is the guarantee: a close between
    // any two steps has to leave something readable, which is only true if the way back
    // is on the disk before the thing it is a way back from is gone.
    if (!pushUndoState(State.schedule)) {
        askTell(noWayBackNotice());
        return;
    }

    // One transaction, in the sync layer: write down the intent, store it HERE, mark it
    // stored, then send. Reproducing that ordering in four places is how one of them ends
    // up subtly different.
    tellRestoreResult(
        await FarkadSync.replaceEverything(normaliseSchedule(document)),
        'שוחזר מהענן.');
}

async function restoreSnapshot(date) {
    const raw = Store.get(SNAPSHOT_PREFIX + date);
    if (!raw) return;

    const parsed = parseLocalDate(date);
    const go = await askConfirm({
        title: `לחזור למצב של ${formatFullDate(parsed)}?`,
        message: 'כל מה שנרשם מאז יוחלף. המצב הנוכחי יישמר, כך שאפשר לחזור ממנו.',
        ok: 'שחזר'
    });
    if (!go) return;

    const document = acceptRestoreText(raw, 'העותק השמור');
    if (!document) return;

    if (!pushUndoState(State.schedule)) {
        askTell(noWayBackNotice());
        return;
    }

    tellRestoreResult(
        await FarkadSync.replaceEverything(normaliseSchedule(document)),
        'שוחזר.');
}

// The state a restore replaced, kept so the restore itself can be undone.
//
// There used to be one slot, which meant the second restore overwrote the way back from
// the first: after two wrong restores in a row there was no route to the state before
// either. It is a short stack now - three deep, newest first - and each entry is
// independent of the others.
const UNDO_KEY = 'scheduleData:v2backup';
const UNDO_STACK_KEY = 'scheduleData:undoStack';
const UNDO_KEEP = 3;

// Returns true only when the way back is on the disk and can be read again.
//
// The caller must not replace anything until it does. A restore that goes ahead without a
// confirmed way back leaves somebody with the state they restored, no route to the one
// they had, and no way to know that until they look for it.
function pushUndoState(schedule) {
    const entry = JSON.stringify(schedule);

    let stack;
    try {
        const raw = Store.get(UNDO_STACK_KEY);
        stack = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(stack)) stack = [];
    } catch (error) {
        // Unreadable is not empty, and this one is recoverable without ceremony: the
        // stack is a convenience over the single slot below, so it starts again rather
        // than taking the app down with it. The raw value is left where it is.
        stack = [];
    }

    stack.unshift({ at: new Date().toISOString(), schedule: entry });
    const stacked = Store.setVerified(UNDO_STACK_KEY, JSON.stringify(stack.slice(0, UNDO_KEEP)));

    // The single slot stays, because it is what restoreLocalBackup has always read and
    // what an older build left behind. Either route home is enough.
    const slotted = Store.setVerified(UNDO_KEY, entry);

    return stacked || slotted;
}

function readUndoStack() {
    try {
        const raw = Store.get(UNDO_STACK_KEY);
        const stack = raw ? JSON.parse(raw) : [];
        return Array.isArray(stack) ? stack : [];
    } catch (error) {
        return [];
    }
}

// The way back, WITHOUT taking it off the stack. Reading and consuming used to be the
// same call, so an entry that turned out to be unreadable was destroyed by the attempt
// that discovered it.
function peekUndoState() {
    const top = readUndoStack()[0];
    if (top && typeof top.schedule === 'string') return top.schedule;

    // Nothing on the stack: fall back to the single slot, which is where a restore made
    // by an older build put its way back.
    return Store.get(UNDO_KEY);
}

// Taken off, once the state it holds has been accepted. Matched on content so that a
// push which happened in between cannot cause the wrong entry to be dropped.
// Taken off, once the state it holds has been accepted - or once the restore it was
// written for has been abandoned. Matched on content so that a push which happened in
// between cannot cause the wrong entry to be dropped.
//
// Returns whether the entry is genuinely gone. The stack write is VERIFIED: an ignored
// write left the app believing an entry had been consumed while the disk still held it,
// which is the same class of lie as a tick over a save that did not happen.
//
// The single slot is rewritten rather than removed when the stack still has entries,
// because that slot is what an older build reads and what peekUndoState falls back to:
// leaving it pointing at a state that has just been consumed would hand the next press a
// way back the stack no longer offers.
function dropUndoState(raw) {
    const stack = readUndoStack();
    const at = stack.findIndex(entry => entry && entry.schedule === raw);

    let gone = true;
    if (at !== -1) {
        stack.splice(at, 1);
        gone = Store.setVerified(UNDO_STACK_KEY, JSON.stringify(stack));
    }

    if (Store.get(UNDO_KEY) === raw) {
        const next = stack.find(entry => entry && typeof entry.schedule === 'string');
        if (next) {
            if (!Store.setVerified(UNDO_KEY, next.schedule)) gone = false;
        } else {
            Store.remove(UNDO_KEY);
            if (Store.durableGet(UNDO_KEY) === raw) gone = false;
        }
    }

    return gone;
}

// One place decides what to say about a restore, so the four that perform one cannot
// drift apart. FarkadSync.replaceEverything does the ordering; this reads the stage it
// stopped at.
function tellRestoreResult(result, done) {
    if (result.ok) { askTell(done); return; }

    if (result.stage === 'invalid') { askTell(notAScheduleNotice()); return; }
    if (result.stage === 'prepare') { askTell(noRetryRecordNotice()); return; }
    if (result.stage === 'queue') { askTell(unfinishedRestoreNotice()); return; }
    if (result.stage === 'finalize') { askTell(unfinishedTransactionNotice()); return; }
    if (result.stage === 'local') {
        // A cancellation that could not be confirmed means the intent is still on the
        // disk and the next session will act on it. Saying "nothing changed" would be
        // the one answer that lets it surprise somebody later.
        askTell(result.cancelled === false ? stuckIntentNotice() : notStoredNotice());
        return;
    }
    askTell(replacementNotice(result.error));
}

// The replacement is on the device, but the queue of unsent edits could not be finished -
// so the next open would replay entries this restore replaces straight back on top of it.
// Not a success, and not a failure that undid anything either.
function unfinishedRestoreNotice() {
    return {
        title: 'השחזור לא הושלם',
        message: 'המצב המשוחזר נשמר במכשיר, אבל לא הצלחנו לסיים את תור השליחה, ולכן ' +
            'השחזור עדיין לא הסתיים ולא נשלח למכשירים האחרים. פנה מקום במכשיר - ' +
            'הוא ימשיך מעצמו.'
    };
}

// The sync layer refused the document itself. A door that skipped its own check would
// otherwise have replaced everything with whatever it was handed.
function notAScheduleNotice() {
    return {
        title: 'לא בוצע שחזור',
        message: 'המצב שביקשת לשחזר אינו רישום שלם של לוח עבודה, ולכן לא שינינו כלום. ' +
            'מה שכבר שמור לא נפגע.'
    };
}

// The restore itself is done and on the device - what could not be taken off the disk is
// the note saying one was owed. Nothing is lost and nothing will be undone: the note is
// replayed at the next open, and applying the same restore twice is applying it once.
// Still not a finished piece of work, so it is not reported as one.
function unfinishedTransactionNotice() {
    return {
        title: 'השחזור בוצע - לא הכול הסתיים',
        message: 'המצב המשוחזר נשמר במכשיר, אבל לא הצלחנו למחוק את הבקשה לשחזר. ' +
            'שום דבר לא ילך לאיבוד - הבקשה תיסגר מעצמה בפתיחה הבאה. ' +
            'פנה מקום במכשיר כדי שזה יקרה.'
    };
}

// The restore did not happen here, and the note saying it was wanted could not be taken
// off the device either.
function stuckIntentNotice() {
    return {
        title: 'השחזור לא בוצע - ויש מה לבדוק',
        message: 'לא הצלחנו לשמור את המצב המשוחזר, וגם לא הצלחנו למחוק את הבקשה לשחזר. ' +
            'הרישום הנוכחי לא השתנה, אבל ייתכן שהשחזור יתבצע בפתיחה הבאה. ' +
            'פנה מקום במכשיר ופתח מחדש כדי לראות מה המצב.'
    };
}

// Said, and the restore abandoned, when there is nowhere to write down the fact that a
// restore is owed.
//
// That record is what makes the whole thing recoverable: with it on the disk, a restore
// whose cloud write fails is re-sent by the next session. Without it, the restore exists
// only on this screen, and the next older snapshot from another phone finishes undoing
// it - which is precisely the state somebody performing a restore is trying to escape.
function noRetryRecordNotice() {
    return {
        title: 'לא בוצע שחזור',
        message: 'אין מקום במכשיר לרשום שהשחזור ממתין לשליחה, ובלי זה הוא היה עלול ' +
            'להיעלם ברגע שמכשיר אחר יתעדכן. לא שינינו כלום. פנה מקום במכשיר, ונסה שוב.'
    };
}

// Said, and the restore abandoned, when the RESTORED state could not be stored.
//
// The way back being written is only half of it. If the new state cannot be stored
// either, going ahead leaves the restored week on the screen and the old one on the disk
// - the person sees a restore that worked, closes the app, and opens it to find nothing
// happened. Worse, the cloud would then be sent a state this device does not hold.
function notStoredNotice() {
    return {
        title: 'לא בוצע שחזור',
        message: 'אין מקום במכשיר לשמור את המצב המשוחזר, ולכן לא שינינו כלום - הרישום ' +
            'שהיה כאן נשאר כמו שהוא. פנה מקום במכשיר או ייצא קובץ גיבוי, ונסה שוב.'
    };
}

// Said, and the replacement abandoned, when the way back could not be written.
//
// Going ahead anyway is the one thing that must not happen: the person ends up holding
// the state they restored, no route to the one they had, and nothing telling them so
// until they go looking for it.
function noWayBackNotice() {
    return {
        title: 'לא בוצע שחזור',
        message: 'אין מקום במכשיר לשמור את המצב הנוכחי לפני השחזור, ובלי זה אי אפשר יהיה ' +
            'לחזור ממנו. לא שינינו כלום. פנה מקום במכשיר, או ייצא קובץ גיבוי קודם, ונסה שוב.'
    };
}

// What to say when a replacement landed on this device but not in the cloud. Not a
// failure - the restore DID happen here, and it is written down and will go out - but
// not the unqualified "done" the app used to print over a write that never happened.
function replacementNotice(error) {
    return {
        title: 'שוחזר במכשיר הזה',
        message: 'השחזור בוצע ונשמר כאן, אבל עדיין לא הגיע לענן, כך שהמכשירים האחרים ' +
            'עדיין רואים את המצב הקודם. הוא יישלח כשהחיבור יחזור - אל תשחזר שוב.\n\n' +
            String((error && error.message) || error).slice(0, 120)
    };
}

// ---------------------------------------------------------------- backup file

const LAST_BACKUP_KEY = 'scheduleData:lastBackup';

// Everything Recovery is holding, as a file, exactly as it sits on the device.
//
// Not a schedule - a schedule is what this could not be turned into. It is the raw bytes,
// so that whatever is inside them leaves the phone before anything else happens to it,
// and so somebody can look at it later. JSON a parser refuses is usually a truncated
// write, and the days in it are plain text.
function exportRecoveryData() {
    const records = Recovery.rawRecords();
    const payload = {
        kind: 'farkad-recovery',
        takenAt: new Date().toISOString(),
        appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,
        // Said in the file too, because whoever opens it will not have the banner.
        note: 'Raw records that could not be parsed. Nothing here was deleted from the device.',
        problems: Recovery.problems.map(problem => ({
            key: problem.key, copiedTo: problem.copy, message: problem.message
        })),
        records
    };

    const name = `farkad-recovery-${todayStr()}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
    const name = `farkad-${todayStr()}.json`;
    const blob = new Blob([JSON.stringify(State.schedule, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    // Recorded on the click, not on a confirmed download - the browser never says whether
    // the file was actually kept. It is a reminder, and a reminder that is one day
    // optimistic is still worth far more than no reminder.
    Store.set(LAST_BACKUP_KEY, todayStr());
    renderBackupAge();
}

// How old the last backup is, in the one place a person can act on it.
//
// While sync is off this file is the only copy that survives losing the phone - and on an
// iPhone that has not been added to the home screen, the browser clears its storage after
// a week without a visit. So a fortnight of records can be one uninstalled browser away
// from gone, and nothing on screen would have said so.
function renderBackupAge() {
    const line = document.getElementById('backupAge');
    if (!line) return;

    const last = Store.get(LAST_BACKUP_KEY);
    const days = last ? daysBetween(last, todayStr()) : null;
    const synced = typeof FarkadSync !== 'undefined' && FarkadSync.status === 'synced';

    if (days === null) {
        line.textContent = 'עוד לא נשמר קובץ גיבוי.';
    } else if (days === 0) {
        line.textContent = 'גיבוי אחרון: היום.';
    } else if (days === 1) {
        line.textContent = 'גיבוי אחרון: אתמול.';
    } else {
        line.textContent = `גיבוי אחרון: לפני ${days} ימים.`;
    }

    // Not called a problem while the cloud holds a second copy.
    line.className = !synced && (days === null || days >= 7) ? 'hint hint-warn' : 'hint';
}

function daysBetween(from, to) {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    if (!start || !end) return 0;
    return Math.round((end - start) / 86400000);
}

// What a backup file actually contains, decided before anything is replaced.
//
// A file saved by the OLD app passes a naive "has workers and places" check and then
// normalises to nothing, because its workers are bare names with no ids. The import would
// report success and leave an empty app. So an old file is recognised and put through the
// same migration the app runs on first load, and a file that loses everything in
// normalisation is refused rather than imported as an empty schedule.
function readBackupFile(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    if (!Array.isArray(parsed.workers) || !Array.isArray(parsed.places)) {
        throw new Error('not a farkad backup');
    }

    const looksV1 = Array.isArray(parsed.assignments) || typeof parsed.weekStartDate === 'string';
    if (looksV1) {
        const result = migrateV1(parsed);
        const issues = result.issues || [];
        const counts = migrationTally(result.schedule);

        // The issues travel with the schedule, so anything the migration refused to guess
        // is still waiting for a decision after the import - not dropped on the floor.
        return {
            schedule: result.schedule,
            issues,
            summary: `הקובץ הוא מהגרסה הישנה. הועברו ${counts.workDays} ימי עבודה ו-${counts.absences} היעדרויות` +
                (issues.length > 0 ? `, ו-${issues.length} רישומים ממתינים להחלטה.` : '.')
        };
    }

    // Checked BEFORE anything is replaced, and never repaired. Two rows claiming the same
    // id is genuinely ambiguous - their days are already merged under that one id and
    // nothing here can tell which day belonged to whom. Renumbering one of them silently
    // would invent an answer and hide the question, so the file is refused instead and
    // the existing data is not touched.
    const problems = validateRosterIds(parsed);
    if (problems.length > 0) {
        const error = new Error('roster ids are not sound');
        error.problems = problems;
        throw error;
    }

    // The complete check, on the RAW file, before normaliseSchedule sees it. The
    // "did anybody survive" test below caught a file that emptied itself; it could not
    // catch one that was already empty in the wrong way, or one carrying a day against a
    // worker who is not in it, or an impossible date, or an id with a dot in it that
    // would write every edit for that man somewhere else in the document.
    const read = readReplacementDocument(parsed);
    if (!read.document) {
        const error = new Error('not a whole schedule');
        error.problems = read.problems;
        throw error;
    }

    const schedule = normaliseSchedule(read.document);
    if (parsed.workers.length > 0 && schedule.workers.length === 0) {
        throw new Error('no workers survived normalisation');
    }

    const counts = migrationTally(schedule);
    return {
        schedule,
        issues: [],
        summary: `בקובץ ${schedule.workers.length} עובדים, ${schedule.places.length} אתרים ו-${counts.workDays} ימי עבודה.`
    };
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
        let loaded;
        try {
            loaded = readBackupFile(JSON.parse(e.target.result));
        } catch (error) {
            // Validated before anything is replaced. The old version emptied the roster
            // first and only then discovered the file was unusable.
            console.error('Import failed:', error);
            // A roster problem is named. "Not a valid backup" is true and useless when
            // the file is perfectly readable and the trouble is two men sharing an id -
            // that is something the person can go and look at.
            if (error && error.problems) {
                askTell({
                    title: 'הקובץ לא נטען',
                    message: 'יש בעיה במזהי העובדים או האתרים, ולכן הקובץ לא נטען כדי לא ' +
                        'לערבב רישומים בין אנשים. הנתונים הקיימים לא השתנו.\n\n' +
                        error.problems.join('\n')
                });
            } else {
                askTell('הקובץ אינו קובץ גיבוי תקין. הנתונים הקיימים לא השתנו.');
            }
            event.target.value = '';
            return;
        }

        const incoming = loaded.schedule;
        const go = await askConfirm({
            title: 'לטעון את הגיבוי?',
            message: `${loaded.summary} הקובץ יחליף את כל הנתונים הקיימים, והמצב הנוכחי יישמר כגיבוי מקומי.`,
            ok: 'טען'
        });
        if (!go) {
            event.target.value = '';
            return;
        }

        // The current state becomes the local backup, so an import of the wrong file is
        // itself undoable - on its own entry, so importing twice does not lose the way
        // back to where this started. Confirmed before the file replaces anything.
        if (!pushUndoState(State.schedule)) {
            askTell(noWayBackNotice());
            event.target.value = '';
            return;
        }

        const previousIssues = State.migrationIssues;
        // Decisions the migration refused to guess at come with the file. Losing them
        // here would leave work in the old file that the app now claims to have imported.
        State.migrationIssues = loaded.issues;

        const result = await FarkadSync.replaceEverything(incoming);
        event.target.value = '';

        if (!result.ok && result.stage !== 'cloud') {
            // The schedule was put back by the transaction; the issues are this file's
            // business and go back with it.
            State.migrationIssues = previousIssues;
            render();
            tellRestoreResult(result, '');
            return;
        }
        writeIssues(loaded.issues);

        if (loaded.issues.length > 0) {
            await askTell(`הגיבוי נטען. ${loaded.issues.length} רישומים ממתינים להחלטה שלך.`);
            openMigrationModal();
            if (!result.ok) askTell(replacementNotice(result.error));
            return;
        }
        tellRestoreResult(result, 'הגיבוי נטען.');
    };
    reader.readAsText(file);
}

async function restoreLocalBackup() {
    const go = await askConfirm({
        title: 'לשחזר את המצב שלפני הטעינה האחרונה?',
        ok: 'שחזר'
    });
    if (!go) return;

    // READ, not popped. The entry only leaves the stack once it has been checked and
    // accepted: popping first meant a way back that would not parse, or that was not a
    // schedule, was consumed by the attempt that failed on it - so the button that could
    // not restore it also destroyed it, and the next press walked past it to an older
    // state without saying so.
    const raw = peekUndoState();
    if (!raw) {
        askTell('אין גיבוי מקומי.');
        return;
    }

    const document = acceptRestoreText(raw, 'הגיבוי המקומי');
    if (!document) return;

    // The state being left is itself pushed, so this is reversible in both directions.
    // It goes on FIRST, before anything is replaced: a close between any two steps has to
    // leave something readable.
    const leaving = JSON.stringify(State.schedule);
    if (!pushUndoState(State.schedule)) {
        askTell(noWayBackNotice());
        return;
    }

    const result = await FarkadSync.replaceEverything(normaliseSchedule(document));

    if (result.ok) {
        // Now, and only now. Dropping it before the transaction had proved itself meant
        // a restore the app correctly REFUSED still destroyed the state it was refusing
        // to restore: the entry left the stack, the single slot was overwritten with the
        // state that had not moved, and the way back was gone with nothing said about it.
        //
        // Dropped after the push above, so pressing the button twice walks further back
        // rather than flipping between the last two states forever.
        dropUndoState(raw);
    } else {
        // Nothing was replaced, so the way back that was written a moment ago is a way
        // back to a state nothing moved away from. Taken off again, so the stack is
        // exactly what it was and the next press reaches the same entry as this one.
        dropUndoState(leaving);
    }

    tellRestoreResult(result, 'שוחזר.');
}
