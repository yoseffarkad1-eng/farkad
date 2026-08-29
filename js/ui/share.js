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

// The whole evening, or one site of it.
//
// One site, because the seder does not go to one group. It goes to the man driving to
// Herzliya, who needs to know who is with him tomorrow and does not need the other four
// sites - and sending him all of them is how somebody turns up at the wrong gate having
// read the wrong line.
function dayMessage(date, layer, styleKey, placeId) {
    const style = MESSAGE_STYLES.find(item => item.key === styleKey) || currentMessageStyle();
    const parsed = parseLocalDate(date);
    const only = placeId ? State.place(placeId) : null;
    const lines = [style.heading(parsed), ''];

    let any = false;
    State.activePlaces()
        .filter(place => !only || place.id === only.id)
        .forEach(place => {
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
                suffix = hours ? ` (${plusAmount(hours)} ש׳)` : ' (שעות נוספות)';
            }
            lines.push(style.worker(worker.name, suffix));
        });
        lines.push('');
    });

    // Who is away is a fact about the crew, not about a site, and the man driving to one
    // gate cannot act on it. A one-site message leaves it out.
    const absent = only ? [] : State.workersForDay(date, layer)
        .filter(worker => isAbsent(State.schedule, date, worker.id, layer));
    if (!only) {
        // The line is always there, "אין" included: its absence would be ambiguous
        // between nobody-absent and nobody-checked.
        lines.push(style.absent(absent.length > 0 ? absent.map(w => w.name).join(', ') : 'אין'));
    }

    if (!any && absent.length === 0) {
        return lines[0] + (only
            ? `\n\n${only.name}: אין שיבוצים ליום הזה.`
            : '\n\nאין שיבוצים ליום הזה.');
    }

    return lines.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}

// Which site the open message is about, or null for the whole day. Kept so that changing
// the wording does not quietly widen a one-site message back out to all five.
let sharePlaceId = null;

function showDayMessage(placeId) {
    sharePlaceId = placeId || null;
    renderMessageStyles();
    const box = document.getElementById('shareText');
    box.value = dayMessage(State.date, State.layer, undefined, sharePlaceId);
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
            box.value = dayMessage(State.date, State.layer, style.key, sharePlaceId);
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

// A cell a spreadsheet would run instead of read.
//
// Excel and Sheets treat a cell opening with = + - @ as a FORMULA, quoted or not, so a
// site named "-חדש" reaches the bookkeeper as #NAME? where its name should be. This is
// the CSV path, which is the one taken when the CDN holding SheetJS cannot be reached -
// on a building site, the usual case. The xlsx path is not affected: SheetJS types a
// string cell as a string.
//
// A leading apostrophe is how a spreadsheet is told "this is text". Excel does not
// display it; some other viewers do, which is why it is put in front of the cells that
// need it and nothing else: an ordinary payroll of Hebrew names and numbers comes out of
// here byte for byte as it did before.
//
// Numbers are left alone, and that exclusion is the point rather than an optimisation.
// Advances are exported negative - -1000 opens with a dangerous character and is not
// dangerous at all - and quoting one as text would break the bookkeeper's own totals,
// which is a worse thing to do to that file than the bug being fixed.
function csvCell(value) {
    const text = String(value === undefined || value === null ? '' : value);
    const risky = /^[=+\-@\t\r]/.test(text) && !(text.trim() !== '' && Number.isFinite(Number(text)));
    return `"${(risky ? "'" + text : text).replace(/"/g, '""')}"`;
}

// Excel needs a BOM to read a UTF-8 CSV as Hebrew rather than mojibake.
function downloadCsv(rows, filename) {
    const csv = rows
        .map(row => row.map(csvCell).join(','))
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
// The way back, and it is not the schedule alone.
//
// A restore point that carried only the week put somebody back where they started with
// the questions the migration had raised about it gone - answered by nobody, and gone
// from the only place they existed. The decisions travel in the entry beside it.
function pushUndoState(schedule) {
    const entry = JSON.stringify(schedule);
    const decisions = JSON.stringify(
        Array.isArray(State.migrationIssues) ? State.migrationIssues : []);

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

    stack.unshift({ at: new Date().toISOString(), schedule: entry, decisions,
        // Which schedule those questions were about, so restoring the pair can be shown
        // to be restoring a pair and not two things that happened to be stored together.
        forSchedule: fingerprintOf(entry) });
    const stacked = Store.setVerified(UNDO_STACK_KEY, JSON.stringify(stack.slice(0, UNDO_KEEP)));

    // The single slot stays, because it is what restoreLocalBackup has always read and
    // what an older build left behind. It carries the SCHEDULE ONLY.
    const slotted = Store.setVerified(UNDO_KEY, entry);

    // Either route home is enough - unless there are questions to carry, and then only
    // the stack entry can carry them. Returning true because the schedule-only slot
    // landed reported a way back that would come home with the week and without the
    // things nobody had answered about it, and the import that read that answer went
    // ahead on the strength of it.
    if (JSON.parse(decisions).length > 0) return stacked;
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

// The unanswered decisions stored beside a way back, or null when the entry predates
// them. Null is not "there were none" - an older entry simply cannot say - so the caller
// leaves whatever is on the device alone rather than clearing it on that entry's behalf.
function undoDecisionsFor(raw) {
    const entry = readUndoStack().find(item => item && item.schedule === raw);
    if (!entry || typeof entry.decisions !== 'string') return null;
    try {
        const parsed = JSON.parse(entry.decisions);
        return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
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
    // The handover FIRST, and the records read after it.
    //
    // The order is the whole of it. forgetLocalOrigin is what says "nothing on this
    // device is provably its own any more", and it writes that down - so a snapshot of
    // the provenance records taken BEFORE it still carried every "made here and never
    // left" claim the file was in the act of invalidating. Open that file on a second
    // phone and it hands back the very claims the export existed to retire, with a
    // permanent-delete button beside each of them.
    //
    // The same handover the ordinary backup makes, attempted - but never a reason to
    // stop. This file is the only way the unreadable bytes leave a phone, and refusing it
    // because a bookkeeping write failed would be trading the data for the bookkeeping.
    //
    // It is still READ, though, because the two outcomes are not the same phone
    // afterwards. This file carries the whole schedule, so anybody it reaches has every
    // worker on this device: from here on, "he was made here and has never left" is not
    // something this phone can say about anyone. When the record of that lands, the
    // generation moves and the old claims are dead. When it cannot land, the claim is not
    // quietly left standing - the device is marked uncertain for as long as it is open,
    // and a disk that refuses this write refuses the probe in canRecordProvenance too, so
    // the refusal survives the app being closed and opened again.
    // EVIDENCE FIRST, and the handover after it.
    //
    // The order below is about provenance, and it is right about provenance. What it did
    // not consider is that the handover write can take storage AWAY: forgetLocalOrigin
    // writes the generation, and a browser that answers a write with a SecurityError -
    // Safari private mode, a blocked frame, storage the browser has revoked - makes Store
    // decide there is no storage at all for the rest of the session. Every read after
    // that answers null, so the file came out with records:{} and called itself stable,
    // on a phone that still held every byte.
    //
    // So the bytes are captured before the attempt. They are EVIDENCE - what this device
    // was holding a moment ago - and nothing downstream may treat the provenance inside
    // them as a claim about what it is holding now.
    const evidence = Recovery.rawSnapshot();

    const recorded = typeof FarkadSync !== 'undefined' && FarkadSync.forgetLocalOrigin
        ? FarkadSync.forgetLocalOrigin()
        : true;
    if (!recorded && FarkadSync.noteHandoverUnrecorded) FarkadSync.noteHandoverUnrecorded();

    // And again afterwards, because the provenance records are the one part of the file
    // that must describe the phone AFTER the handover: a file carrying "made here and
    // never left" claims the export is in the act of retiring hands them straight back.
    const snapshot = Recovery.rawSnapshot();

    // Whichever reading is the fuller one is the reconstruction, with the provenance
    // taken from after the handover in either case. A disk that stopped answering during
    // the handover produces an empty second reading, and the first is then the only
    // record of what this phone held.
    const readable = Store.available;
    const records = Object.keys(snapshot.records).length >= Object.keys(evidence.records).length
        ? snapshot.records
        : Object.assign({}, evidence.records, snapshot.records);

    // Which keys the second reading could no longer see. Named, because "we could not
    // read these" is a different sentence from "these were not there".
    const unreadable = Object.keys(evidence.records)
        .filter(key => snapshot.records[key] === undefined)
        .sort();

    const payload = {
        kind: 'farkad-recovery',
        takenAt: new Date().toISOString(),
        appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,
        // Said in the file too, because whoever opens it will not have the banner.
        note: 'Raw records that could not be parsed. Nothing here was deleted from the device.',
        // Whether the device managed to write down that this file left it. Carried in the
        // file because the phone it is opened on cannot ask the phone it came from, and
        // "we could not record the handover" is exactly the thing that must not be lost
        // between the two.
        handoverRecorded: recorded,
        // Whether the disk was still answering when the file was built. False means the
        // records below are what this phone held a moment earlier, not what it holds.
        storageReadable: readable && snapshot.storageReadable !== false,
        unreadableKeys: unreadable,
        problems: Recovery.problems.map(problem => ({
            key: problem.key, copiedTo: problem.copy, message: problem.message
        })),
        // The schedule AS THE APP IS HOLDING IT, which on the device this file exists for
        // is not any record on the disk. When scheduleData:v2 will not parse the app
        // falls back to the old v1 record, migrates it, shows it - and deliberately does
        // not write it down, because writing would put pre-migration data over the newest
        // record there is. So the only complete, readable schedule on that phone lives in
        // memory, and a file carrying only the raw records carried the wreckage and left
        // the week the person was looking at behind.
        //
        // Marked as what it is. It is derived, not a record, and whoever opens this file
        // is told which of the two they are reading.
        liveSchedule: cloudDocument(State.schedule),
        // Whether the two readings of the device agreed - see Recovery.rawSnapshot. False
        // means another tab was writing while this ran, so the reconstruction on the far
        // side may be missing the last of it and must not be presented as complete.
        stable: snapshot.stable && evidence.stable && readable
            && unreadable.length === 0,
        // Every distinct reading taken, when they would not settle. On a device this file
        // exists for, the difference between two of them may be the evening somebody is
        // looking for, and keeping only the last one throws it away.
        captures: (snapshot.stable && evidence.stable && unreadable.length === 0)
            ? undefined
            : evidence.captures.concat(snapshot.captures)
                .filter((records, at, all) =>
                    all.findIndex(other => canonicalJson(other) === canonicalJson(records)) === at),
        // Same reason: the decisions the migration refused to guess are only on the disk
        // when the migration was allowed to write, and on a held device it never is.
        pendingDecisions: Array.isArray(State.migrationIssues) ? State.migrationIssues : [],
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

    // What is said afterwards, and what is carefully NOT said.
    //
    // A click on a link is not a file on a phone. On iOS the sheet can be dismissed, the
    // save can be cancelled, and the app is told nothing either way - so this never says
    // the file was saved, or that it is in Files, or that the data is now safe. It says
    // what actually happened, which is that the app handed the file over, and asks the
    // one person who can check to go and check.
    // The file name is Latin inside a Hebrew sentence, and the dialog writes textContent
    // only - so the LTR isolation travels in the string itself, U+2066 before and U+2069
    // after, or the bidi algorithm folds the date backwards.
    if (typeof askTell === 'function') {
        askTell({
            title: !snapshot.stable
                ? 'הקובץ נמסר, אבל נלקח בזמן שמשהו השתנה'
                : (recorded ? 'הקובץ נמסר לדפדפן' : 'הקובץ נמסר, אבל לא נרשם במכשיר'),
            message: recorded
                ? '\u2066' + name + '\u2069 - בדוק בהורדות או ב"קבצים" שהקובץ באמת נשמר, והעתק אותו למקום נוסף. ' +
                    'האפליקציה לא יכולה לדעת אם השמירה הצליחה. ' +
                    'הקובץ כולל את הרשומות הפגומות ואת המצב החי — שום דבר לא נמחק מהמכשיר.'
                : '\u2066' + name + '\u2069 - בדוק בהורדות או ב"קבצים" שהקובץ באמת נשמר. ' +
                    'לא הצלחנו לרשום במכשיר שהקובץ יצא ממנו, ולכן מחיקה לצמיתות תישאר חסומה ' +
                    'עד שיהיה מקום פנוי - הארכיון עובד כרגיל. ' +
                    'הקובץ כולל את הרשומות הפגומות ואת המצב החי — שום דבר לא נמחק מהמכשיר.'
        });
    }
}

// A backup file is a handover to another device.
//
// It is opened on a second phone, imported, and worked on - which makes it exactly the
// event the hard-delete rule is about, seen from the other end. The file leaving here
// means nothing inside it can still be "made here and never left" afterwards, and the
// device it left has no way of hearing what happens to it next.
//
// So the proof goes first and is read back, and the file is not handed over unless it
// landed. Refusing to export is a real cost, and it is the smaller one: the alternative
// is a worker who is on two phones with a delete button beside him on this one. The
// recovery export - the one that exists to rescue data that cannot be read - is not
// bound by this; see exportRecoveryData.
function exportBackup() {
    if (typeof FarkadSync !== 'undefined' && FarkadSync.forgetLocalOrigin
        && !FarkadSync.forgetLocalOrigin(cloudDocument(State.schedule))) {
        askTell({
            title: 'הגיבוי לא יוצא',
            message: 'לא הצלחנו לרשום במכשיר שהקובץ יצא ממנו, ולכן הגיבוי לא נוצר. ' +
                'פנה מקום במכשיר ונסה שוב - הרישום עצמו לא נפגע.'
        });
        return;
    }

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

    tellBackupHandedOver(name);
}

// What is said after the backup leaves, and what is carefully NOT said - the same rule
// the recovery export above already follows. A click on a link is not a file on a phone:
// on iOS the share sheet can be dismissed, the save can be cancelled, and the app is told
// nothing either way. So this never says the file was saved, or that it is in Files, or
// that the data is now safe. It says what happened - the browser has it - and asks the
// one person who can check to go and check.
//
// Until now this export said NOTHING, and the age line then read "גיבוי אחרון: היום."
// over a file that may never have reached anywhere. The line stays - a backup was taken
// today, that much is true - but the handover itself is no longer silent.
function tellBackupHandedOver(name) {
    if (typeof askConfirm !== 'function') return;

    // The second button runs the whole export again, for the person who looked in
    // "קבצים" and did not find the file. Only a real press counts: Escape and a tap on
    // the backdrop also resolve the dialog through its cancel path, and neither of them
    // is a request for another file. Watched in the CAPTURE phase on the document,
    // because the button's own onclick resolves the promise and the microtask that
    // follows it runs before a second listener on the same button ever would.
    let again = false;
    const wantAgain = event => {
        const target = event.target;
        if (target && target.closest && target.closest('#askCancel')) again = true;
    };
    // The test harness's document is a stub with no event methods; a dialog that cannot
    // be watched simply never re-runs the export.
    const watched = typeof document.addEventListener === 'function'
        && typeof document.removeEventListener === 'function';
    if (watched) document.addEventListener('click', wantAgain, true);

    // The file name is Latin inside a Hebrew sentence; askTell and askConfirm write
    // textContent only, so the isolation has to travel IN the string - U+2066 (LRI)
    // before, U+2069 (PDI) after - or the bidi algorithm folds the date backwards.
    askConfirm({
        title: 'קובץ הגיבוי נמסר לשמירה',
        message: 'שם הקובץ: \u2066' + name + '\u2069. ' +
            'הדפדפן קיבל את הקובץ — זה עדיין לא אומר שהוא ביישום "קבצים". ' +
            'פתח את "קבצים" וודא שהוא מופיע. ' +
            'הייצוא עובד גם בלי חיבור — הקובץ נוצר במכשיר.',
        ok: 'הבנתי',
        cancel: 'שמירה חוזרת'
    }).then(() => {
        if (watched) document.removeEventListener('click', wantAgain, true);
        if (again) exportBackup();
    });
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

// ---------------------------------------------------------------- room on the device
//
// Every message this app has about space arrives at the moment a write is refused, which
// is the moment there is nothing left to do but lose the tap. This is the same fact, said
// while it can still be acted on.
//
// What is measured is not "how full is the device" but "does another WHOLE COPY of the
// record still fit". That is what stops working first and stops working silently: every
// restore point and every way back is a full copy of the schedule, so once one no longer
// fits, the safety net is gone while ordinary recording carries on looking exactly as it
// did. Measured at thirty men and a working year, a copy is about 1.2 MiB and eight of
// them can be on the device at once - the live record, three restore points, the undo slot
// and three more in the stack. The album is thinned automatically long before that, but
// the arithmetic is why this warning exists at all.
//
// The size of a copy is read from the text that last landed on the disk rather than by
// serialising the schedule again: State.durableText is already that string, and
// JSON.stringify of four years of records is fourteen milliseconds that would be spent on
// every redraw of the sync line.
function copyBytes() {
    if (typeof State === 'undefined') return 0;
    if (typeof State.durableText === 'string') return State.durableText.length * 2;

    // Before the first save of this session there is nothing confirmed to measure, and
    // nothing yet worth protecting either.
    return 0;
}

// What Store.reclaim would be able to give back if a write ran out of room.
//
// Store must not decide what is expendable, so it asks the file that owns the disposable
// data - this one - and the answer has always been "the oldest restore point". Counting
// that here is what keeps the message honest: a device with three photographs still in
// the album has room for a way back, it just has to spend a photograph to get it, and
// telling somebody there is no room at all while the app can still make some would be a
// warning they would learn to ignore.
function reclaimableBytes() {
    return snapshotDates().reduce((bytes, date) => {
        const key = SNAPSHOT_PREFIX + date;
        const value = Store.get(key);
        return value === null ? bytes : bytes + (key.length + String(value).length) * 2;
    }, 0);
}

// 'ok' | 'tight' | 'critical'.
//
// tight     - room for one more copy, and not two. The restore points are on their way out.
// critical  - room for none. Recording still works; keeping a way back does not.
//
// A device the browser will not let this app write to at all is not a space problem, and
// updateSyncNotice says so far more directly. Not this function's business.
let capacityCache = { text: false, keys: -1, budget: -1, state: 'ok' };

function capacityState() {
    if (typeof Store === 'undefined' || !Store.available) return 'ok';

    const copy = copyBytes();
    if (copy === 0) return 'ok';

    // The sync line under the board is redrawn on every render, and adding up what is
    // stored means reading every value back - on this device the biggest of them is the
    // record itself. So the answer is kept until something that could change it does:
    // a save, which replaces durableText, or a key appearing or leaving.
    //
    // It is a threshold, not a ledger. A restore point swapped for another of much the
    // same size leaves both signals unchanged and the cached answer standing, which is
    // correct to within far less than the distance between the thresholds.
    //
    // The budget is in the key as well. It never moves in the app - it is a constant one
    // line up - but a cache that silently ignores one of its own inputs is a trap for
    // whoever changes that line next, and it cost nothing to close.
    //
    // A restore point taken or dropped moves the key count, so the reclaimable half of
    // the sum is covered by the same two signals.
    const keys = Store.keys().length;
    if (capacityCache.text === State.durableText
        && capacityCache.keys === keys
        && capacityCache.budget === Store.budget) {
        return capacityCache.state;
    }

    const free = Store.budget - Store.used() + reclaimableBytes();
    const state = free < copy ? 'critical' : (free < copy * 2 ? 'tight' : 'ok');

    capacityCache = { text: State.durableText, keys, budget: Store.budget, state };
    return state;
}

// The line in the מצב המכשיר group. It used to say nothing at all while there was room,
// which made the group read as broken and left the warning with no quiet state to be
// louder than - a line that only ever appears is a line nobody has learned to look at.
function renderStorageRoom() {
    const line = document.getElementById('storageRoom');
    if (!line) return;

    // A browser that will not let this app write at all is not a space problem, and
    // claiming free room over it would be a lie: the sync line says what is actually
    // wrong, and this one stays out of its way.
    if (typeof Store !== 'undefined' && !Store.available) {
        line.textContent = '';
        line.className = 'hint';
        return;
    }

    const state = capacityState();
    if (state === 'ok') {
        line.textContent = 'יש מקום פנוי במכשיר.';
        line.className = 'hint';
        return;
    }

    line.textContent = state === 'critical'
        ? 'אין מקום לשמור מצב קודם. הרישום נשמר כרגיל, אבל אין דרך חזרה - ייצא קובץ גיבוי ופנה מקום במכשיר.'
        : 'המקום במכשיר הולך ואוזל. שמור קובץ גיבוי - נקודות השחזור הן הראשונות שייעלמו.';
    line.className = 'hint hint-warn';
}

// What a backup file actually contains, decided before anything is replaced.
//
// A file saved by the OLD app passes a naive "has workers and places" check and then
// normalises to nothing, because its workers are bare names with no ids. The import would
// report success and leave an empty app. So an old file is recognised and put through the
// same migration the app runs on first load, and a file that loses everything in
// normalisation is refused rather than imported as an empty schedule.
// ---------------------------------------------------------------- the rescue file
//
// A recovery export is not a backup and must never be treated as one. A backup is a
// schedule somebody chose to keep; this is everything a broken phone was holding, raw
// bytes included, produced at the moment the app told its owner it could not read its
// own records. Three things follow, and all three are why this has its own door:
//
//   the file is a HANDOVER from a device that could not be trusted with its own data,
//   so nothing in it can still be "made here and never left" - the deletion provenance
//   it carries is invalidated on the way in, explicitly, rather than adopted;
//
//   the usable schedule inside it has to be FOUND, because the record the app normally
//   reads is the one that would not parse. The queue beside it holds edits that never
//   reached that record, and a rescue that dropped them would lose the last evening
//   somebody worked - which is the evening this file exists for;
//
//   and the raw records are evidence. They are reported, never imported: writing another
//   device's wreckage onto this one would put unreadable bytes under the keys this app
//   reads, and the next open would quarantine them and stop recording.
function looksLikeRecoveryFile(parsed) {
    return Boolean(parsed) && typeof parsed === 'object'
        && parsed.kind === 'farkad-recovery';
}

// The best schedule the rescue file can be made to yield, with the queue it was carrying
// replayed on top of it - which is what the phone would have shown at its next open.
//
// Every candidate is tried in order and the first one that passes the WHOLE document
// check wins. Nothing here repairs anything: a record that will not parse is skipped and
// named, never patched into something that looks plausible.
// The restore the person asked for, if the file carries one that can be acted on.
//
// A held device is exactly the device whose transaction has not finished. Its envelope is
// the state somebody was TOLD they now had, and the schedule record beside it is the one
// they asked to replace - so falling back to that record silently undoes the thing they
// pressed a button for. It used to be exported and then never looked at.
//
// Every phase gets an answer and none of them gets a guess:
//
//   prepared / local-stored   the replacement, carried out, fencing the queue by the
//                             operations it names
//   cancelled                 the transaction was called off; the disk record stands
//   legacy (v71)              the bare document an old build wrote. Applied only when
//                             its frozen v2 companion is there to say WHERE the boundary
//                             was - without that the queue cannot be fenced, and a
//                             restore that supersedes the wrong half of a journal is
//                             somebody's day either deleted or resurrected
//   unreadable                named, never repaired
function pendingReplacementIn(records, tried) {
    const read = key => {
        const raw = records[key];
        if (typeof raw !== 'string') return undefined;
        try {
            return JSON.parse(raw);
        } catch (error) {
            tried.push(`${key}: לא נקרא`);
            return null;
        }
    };

    const parsed = read('farkad:pendingReplace');
    if (parsed === undefined) return null;
    if (parsed === null) return null;

    const envelope = readReplacementRecord(parsed);
    if (envelope) {
        if (envelope.phase === 'cancelled') return null;
        const check = readReplacementDocument(envelope.document);
        if (!check.document) {
            tried.push(`farkad:pendingReplace: ${(check.problems || []).join(', ')}`);
            return null;
        }
        return { envelope, document: check.document, phase: envelope.phase };
    }

    if (isLegacyReplacement(parsed)) {
        const companion = read('farkad:pendingReplace:v71');
        const frozen = companion ? readReplacementRecord(companion) : null;

        // BOUND to the primary, by the same test the phone applies at boot - see
        // readFrozenLegacy in js/sync/sync.js. A companion is the frozen upgrade OF a
        // particular v71 record; one that describes a different restore is a record of
        // somebody else's transaction, and carrying it out here means restoring a week
        // nobody asked for. The rescue rebuild was reading it without asking, so a
        // primary holding one week and a companion holding another imported the
        // companion's, in silence, on a phone whose owner had just lost their data.
        if (frozen && frozen.phase !== 'cancelled'
            && replacementContent(frozen.document) !== replacementContent(parsed)) {
            tried.push('farkad:pendingReplace:v71: מלווה שחזור אחר - לא בוצע');
            return null;
        }

        if (!frozen || frozen.phase === 'cancelled') {
            // The document is real and the boundary is not known. Carrying it out would
            // mean choosing which half of the queue it supersedes, and choosing wrong in
            // either direction loses a day.
            tried.push('farkad:pendingReplace: שחזור ישן בלי גבול תור - לא בוצע');
            return null;
        }
        const check = readReplacementDocument(frozen.document);
        if (!check.document) {
            tried.push(`farkad:pendingReplace:v71: ${(check.problems || []).join(', ')}`);
            return null;
        }
        return { envelope: frozen, document: check.document, phase: frozen.phase };
    }

    tried.push('farkad:pendingReplace: לא נקרא כרשומת שחזור');
    return null;
}

function scheduleFromRecoveryRecords(records, fallback) {
    const tried = [];
    const parse = key => {
        const raw = records[key];
        if (typeof raw !== 'string') return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            tried.push(`${key}: לא נקרא`);
            return null;
        }
    };

    // Asked FIRST. Everything below is about the record the restore was replacing.
    const replacement = pendingReplacementIn(records, tried);

    // The live record first, then its quarantined copies oldest-first, then whatever an
    // older build left behind. A copy is bytes that were already refused once, so it is
    // only reached when the live record cannot be used at all.
    //
    // Skipped entirely when a restore is outstanding: the person asked for that document
    // to BE the record, and the one on the disk is what they asked to replace.
    const candidates = replacement ? [] : ['scheduleData:v2']
        .concat(Object.keys(records)
            .filter(key => key.indexOf('scheduleData:v2:damaged') === 0).sort());

    let document = replacement ? replacement.document : null;
    let from = replacement ? 'שחזור שממתין להסתיים' : null;
    let issues = [];
    for (let i = 0; i < candidates.length && !document; i += 1) {
        const parsed = parse(candidates[i]);
        if (!parsed) continue;
        const read = readReplacementDocument(parsed);
        if (!read.document) {
            tried.push(`${candidates[i]}: ${(read.problems || []).join(', ')}`);
            continue;
        }
        document = read.document;
        from = candidates[i];
    }

    // An old build's record, migrated the same way a first load migrates it.
    if (!document) {
        const legacy = parse('scheduleData');
        if (legacy) {
            const result = migrateV1(legacy);
            const read = readReplacementDocument(cloudDocument(result.schedule));
            if (read.document) {
                document = read.document;
                from = 'scheduleData';
                issues = result.issues || [];
            } else {
                tried.push(`scheduleData: ${(read.problems || []).join(', ')}`);
            }
        }
    }

    // Nothing on the disk could be read. What the app was HOLDING is the last thing
    // left, and on the device this file exists for it is usually the only complete
    // schedule that ever existed - see liveSchedule in exportRecoveryData. Reached last,
    // on purpose: a record is evidence and this is a derivation from one.
    if (!document && fallback) {
        const read = readReplacementDocument(fallback);
        if (read.document) {
            document = read.document;
            from = 'המצב שהיה על המסך';
        } else {
            tried.push(`liveSchedule: ${(read.problems || []).join(', ')}`);
        }
    }

    if (!document) {
        const error = new Error('no usable schedule in the rescue file');
        error.problems = tried.length > 0 ? tried
            : ['לא נמצאה בקובץ רשומה שאפשר לקרוא כלוח עבודה.'];
        throw error;
    }

    const schedule = normaliseSchedule(document);

    // The queue the broken phone was carrying, replayed through the SAME projector the
    // live queue uses - decodeQueue and projectQueue in js/sync/sync.js. Not a second
    // implementation: the version this replaced sorted storage keys lexically and threw
    // away opId and `after`, so which value a rescue file rebuilt depended on how two
    // random batch ids happened to sort, and the phone and its own file could disagree.
    //
    // These are edits that were made and confirmed to their owner and had not yet reached
    // the schedule record - the difference between "what was written last time" and "what
    // the phone was showing".
    const queueRecords = {};
    Object.keys(records).forEach(key => {
        if (typeof records[key] !== 'string') return;
        if (!FarkadSync.isQueueKey(key)) return;
        queueRecords[key] = records[key];
    });

    const decoded = decodeQueue(queueRecords);
    decoded.unreadable.forEach(key => tried.push(`${key}: לא נקרא`));

    // The restore fence goes to the PROJECTOR, exactly as it does on the phone - see
    // projectQueue. Filtering the answer afterwards could only remove the winner the
    // projection had already chosen, and could not promote the operation that winner was
    // hiding: a rescue file rebuilt one week and the phone it came from showed another.
    let replayed = 0;
    queueJournalEntries(decoded.operations, replacement && replacement.envelope)
        .forEach(([path, item]) => {
            applyJournalEntry(schedule, path, item.value);
            replayed += 1;
        });

    // Read again AFTER the replay. An entry that is sound on its own can still leave a
    // document this app would refuse - a day against a worker the schedule does not have
    // - and importing that would put a record on the device that nothing can repair.
    const after = readReplacementDocument(cloudDocument(schedule));
    if (!after.document) {
        const error = new Error('the rescued schedule does not hold together');
        error.problems = after.problems;
        throw error;
    }

    const rebuilt = normaliseSchedule(after.document);

    // Money that did not survive the read, named.
    //
    // Normalisation is deliberately forgiving - it has to be - and what it cannot place
    // it drops. That is right for a live boot and wrong for a rescue: an advance or a
    // ledger entry that fell out here is a number somebody wrote down about somebody's
    // pay, and a file that silently held one fewer of them than the phone did would be a
    // rescue that lost money without saying so. It stays in the file as raw bytes either
    // way; this is what makes the person told about it.
    const lostMoney = (label, before, went) => {
        Object.keys(before || {}).forEach(id => {
            if (!went || went[id] === undefined) tried.push(`${label} ${id}: לא נקרא`);
        });
    };
    // Against the SOURCE, not against a document re-derived from the rebuilt schedule -
    // anything already lost is gone from that one too, so comparing the two would compare
    // the answer with itself and always agree.
    lostMoney('מקדמה', (document || {}).advances, rebuilt.advances);
    lostMoney('רישום מקדמה', ((document || {}).ledger || {}).advances,
        (rebuilt.ledger || {}).advances);

    return {
        schedule: rebuilt,
        from, issues, replayed, tried,
        restorePhase: replacement ? replacement.phase : null
    };
}

// What the person on the RECEIVING phone is told once a rescue file has landed.
//
// Three things they cannot find out any other way. That permanent deletion is off here
// from now on, which is the price of a roster that arrived in a file. That part of the
// file could not be read, when part of it could not - a summary that stayed silent about
// it would let somebody believe they had recovered everything. And that the phone this
// came from could not write down that the file left it: on that device the same people
// still look deletable, and nothing in this file can fix that from here.
function rescueLoadedNotice(loaded) {
    let message = 'קובץ החילוץ נטען. מחיקה לצמיתות חסומה כאן מעכשיו - הארכיון עובד כרגיל.';
    if (loaded.handoverRecorded === false) {
        message += ' שים לב: במכשיר שממנו הגיע הקובץ לא נרשם שהקובץ יצא ממנו, '
            + 'ולכן שם עדיין ייתכן שעובדים ייראו כאילו לא נשלחו לשום מקום. '
            + 'אל תמחק שם אף אחד לצמיתות.';
    }
    if ((loaded.unread || []).length > 0) {
        message += ` ${loaded.unread.length} רשומות בקובץ לא נקראו ונשארות בקובץ בלבד.`;
    }
    if (loaded.stable === false) {
        message += ' הקובץ נלקח בזמן שמכשיר אחר כתב, ולכן ייתכן שחסרות בו עריכות אחרונות.';
    }
    return message;
}

function readRecoveryFile(parsed) {
    const records = parsed.records;
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
        throw new Error('not a farkad recovery file');
    }

    const found = scheduleFromRecoveryRecords(records, parsed.liveSchedule);

    // Decisions the migration refused to guess come from the file itself where the broken
    // phone had any, and from the migration this import just ran where it did not.
    // Read through the SAME parser that wrote it. The record is {forSchedule, issues};
    // this used to accept only a bare array, so every question a phone was holding was
    // dropped on the way through the one file that exists to carry them.
    //
    // The fingerprint is checked against the record the questions describe - the raw
    // scheduleData:v2 bytes in this file - so a list belonging to another week is not
    // attached to this one. A bare array from an older build cannot say which week it is
    // about; it is carried, and it is carried as UNBOUND rather than as evidence.
    let issues = found.issues;
    let issuesBound = true;
    if (typeof records['scheduleData:migrationIssues'] === 'string') {
        const read = parseIssuesRecord(records['scheduleData:migrationIssues'],
            typeof records['scheduleData:v2'] === 'string'
                ? fingerprintOf(records['scheduleData:v2']) : undefined);
        if (read.stale) {
            found.tried.push('scheduleData:migrationIssues: שייך ללוח אחר - לא נטען');
        } else if (read.issues.length > 0) {
            issues = read.issues;
            issuesBound = read.bound;
        }
    }
    // And the ones the broken phone never got to write down. A held device does not save
    // its migration, so the questions it raised exist only in the session that raised
    // them - which is the session that exported this file.
    if (issues.length === 0 && Array.isArray(parsed.pendingDecisions)
        && parsed.pendingDecisions.length > 0) {
        issues = parsed.pendingDecisions;
        // They came out of a session's memory, not off a disk, so nothing ties them to
        // the record they were about - which is exactly what a held device looks like.
        // An EMPTY list says nothing at all and is not a reason to mark anything unbound.
        issuesBound = false;
    }

    const counts = migrationTally(found.schedule);
    const damaged = Object.keys(records).filter(key => key.indexOf(':damaged') !== -1);

    return {
        rescue: true,
        schedule: found.schedule,
        issues,
        issuesBound,
        // Everything that could NOT be used, so the summary never implies the file was
        // read whole when part of it was unreadable.
        unread: found.tried,
        damagedKeys: damaged,
        // The file says whether the phone it came from managed to write down that it
        // left. Either way this device treats it as a handover; the flag is carried so
        // the person is told which of the two happened.
        // ONLY a file that says, in a boolean, that the handover was written down counts
        // as recorded. Missing, "false", 0, null, a word - every value that means "this
        // file cannot tell you" used to collapse to yes, and the receiving phone was
        // never warned. A file from a build before the field existed is exactly that
        // case, and it is the case the warning exists for.
        handoverRecorded: parsed.handoverRecorded === true,
        // Whether the export could take one consistent reading of the device. False means
        // another tab was writing while it ran and the file may be missing the last of it.
        stable: parsed.stable !== false,
        summary: `קובץ חילוץ ממכשיר אחר. נמצא לוח עבודה ב-\u2068${found.from}\u2069 עם `
            + `${found.schedule.workers.length} עובדים ו-${counts.workDays} ימי עבודה`
            + (found.replayed > 0 ? `, ועוד ${found.replayed} עריכות שלא הספיקו להישמר.` : '.')
            + (found.tried.length > 0
                ? ` ${found.tried.length} רשומות בקובץ לא נקראו והן נשארות בקובץ בלבד.`
                : '')
    };
}

function readBackupFile(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');

    // A rescue file, through its own door. It used to fall straight through to the check
    // below and be refused as "not a farkad backup" - which is true and useless: the
    // person holding it has just been told to export it, and the app that told them to
    // would not open it.
    if (looksLikeRecoveryFile(parsed)) return readRecoveryFile(parsed);

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
        // A rescue file says so, out loud, before anything is replaced. It is not a
        // backup somebody chose to keep - it is everything a phone was holding at the
        // moment it said it could not read its own records, and what comes out of it is
        // the best that could be RESCUED, not a state anybody saved.
        const go = await askConfirm(loaded.rescue
            ? {
                title: 'לטעון קובץ חילוץ?',
                message: `${loaded.summary}\n\nזה לא קובץ גיבוי רגיל: זה מה שהצלחנו לחלץ ממכשיר `
                    + 'שלא הצליח לקרוא את הנתונים שלו. הקובץ יחליף את כל הנתונים הקיימים כאן, '
                    + 'והמצב הנוכחי יישמר כגיבוי מקומי. הרשומות הפגומות שבקובץ נשארות בקובץ '
                    + 'ולא נכתבות למכשיר הזה, ומחיקה לצמיתות תישאר חסומה אחרי הטעינה.',
                ok: 'טען חילוץ'
            }
            : {
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

        // EXPLICITLY, and after the replacement rather than instead of it.
        //
        // replaceEverything invalidates this device's own claims on its way through, and
        // that is not the same statement. The roster that just arrived came out of a file
        // that has been on at least two phones - so nobody in it was made here and never
        // left, and the app must not offer to delete any of them for good on the strength
        // of a generation number that happens to line up. Said again here, in one place,
        // so that a reader of this file can see it is said at all.
        if (loaded.rescue && result.ok !== false) {
            if (FarkadSync.noteProvenanceUncertain) FarkadSync.noteProvenanceUncertain();
        }

        // WHICH failures actually put the schedule back, and which only left the
        // transaction unfinished. Only two of them roll anything back: 'prepare', where
        // nothing happened at all, and 'local', where the write was refused and the
        // previous state was restored. Every other stage means the incoming schedule is
        // ON THE DISK - the fence did not finish, or the cloud did not answer, or the
        // note could not be taken off - and treating those as a rollback put the OLD
        // file's questions back beside the NEW file's schedule. The schedule then
        // survived the app being closed and the unanswered decisions did not.
        const rolledBack = result.stage === 'prepare' || result.stage === 'local';
        if (!result.ok && rolledBack) {
            State.migrationIssues = previousIssues;
            render();
            tellRestoreResult(result, '');
            return;
        }

        // The schedule is durable, so the questions that belong to it have to be too -
        // and the answer is read, because a device that keeps the week and loses the
        // questions has lost the half nobody can reconstruct.
        // Built ONCE, and said on every branch out of here.
        //
        // The warnings used to live only in the last line, and two branches returned
        // before reaching it - both of them branches a rescue file takes. So a file that
        // brought questions with it never told anybody that the phone it came from could
        // not record the handover, or that it had been taken while something was moving.
        // The branch a person lands on is not a reason to tell them less.
        const opening = loaded.rescue ? rescueLoadedNotice(loaded) : 'הגיבוי נטען.';

        const decisionsKept = writeIssues(loaded.issues,
            { bound: loaded.issuesBound !== false });
        if (!decisionsKept && loaded.issues.length > 0) {
            State.migrationIssues = loaded.issues;
            render();
            await askTell({
                title: 'נטען, אבל ההחלטות לא נשמרו',
                message: `${opening}\n\n${loaded.issues.length} רישומים שממתינים ` +
                    'להחלטה לא הצליחו להישמר במכשיר, ולכן הם יימחקו כשתסגור את האפליקציה. ' +
                    'פנה מקום במכשיר וטען את הקובץ שוב, או ענה עליהם עכשיו.'
            });
            openMigrationModal();
            return;
        }

        if (loaded.issues.length > 0) {
            await askTell(`${opening} ${loaded.issues.length} רישומים ממתינים להחלטה שלך.`);
            openMigrationModal();
            if (!result.ok) askTell(replacementNotice(result.error));
            return;
        }
        tellRestoreResult(result, opening);
    };
    // A read that FAILS, which is not the same as a file that will not parse.
    //
    // The browser does this when the file has gone from under the picker - a photo
    // deleted while the sheet was open, a file on a share that dropped, a permission
    // withdrawn on iOS. Without this, onload simply never fires: nothing is replaced,
    // which is right, and nothing is SAID, which leaves somebody tapping the button
    // again on a screen where the last tap did nothing at all.
    reader.onerror = () => {
        console.error('Import failed: the file could not be read', reader.error);
        event.target.value = '';
        askTell({
            title: 'הקובץ לא נקרא',
            message: 'לא הצלחנו לקרוא את הקובץ מהמכשיר. הנתונים הקיימים לא השתנו. ' +
                'נסה לבחור אותו שוב, או להעתיק אותו למכשיר ולנסות מחדש.'
        });
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

    // Read BEFORE the replacement, because the entry is dropped once it succeeds.
    const decisions = undoDecisionsFor(raw);

    const result = await FarkadSync.replaceEverything(normaliseSchedule(document));

    // The questions that belonged to the state being restored, restored with it. A way
    // back that returned the week and left the previous week's unanswered questions
    // beside it would put a card on screen pointing at a day this record does not have.
    if (result.stage !== 'prepare' && result.stage !== 'local' && decisions !== null) {
        State.migrationIssues = decisions;
        writeIssues(decisions);
    }

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
