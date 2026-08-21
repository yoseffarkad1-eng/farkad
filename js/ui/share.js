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
    box.appendChild(el('span', null,
        `⚠️ ${missing.length} עובדים עדיין לא נרשמו היום ולא יופיעו בהודעה: ${names}`));
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
            openWhatsApp(text);
        });
        return;
    }

    status.textContent = 'פותח וואטסאפ…';
    openWhatsApp(text);
}

function openWhatsApp(text) {
    // No number in the link: it opens WhatsApp on the chat picker, so the group is
    // chosen the same way it always is.
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

    // The current state becomes the undo for the restore itself.
    Store.set('scheduleData:v2backup', JSON.stringify(State.schedule));

    State.schedule = normaliseSchedule(JSON.parse(raw));
    State.save();
    if (typeof FarkadSync !== 'undefined') FarkadSync.replaceAll(State.schedule);
    render();
    askTell('שוחזר.');
}

// ---------------------------------------------------------------- backup file

const LAST_BACKUP_KEY = 'scheduleData:lastBackup';

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

    const schedule = normaliseSchedule(parsed);
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
            askTell('הקובץ אינו קובץ גיבוי תקין. הנתונים הקיימים לא השתנו.');
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
        // itself undoable.
        Store.set('scheduleData:v2backup', JSON.stringify(State.schedule));

        State.schedule = incoming;
        // Decisions the migration refused to guess at come with the file. Losing them
        // here would leave work in the old file that the app now claims to have imported.
        State.migrationIssues = loaded.issues;
        writeIssues(loaded.issues);
        State.save();
        if (typeof FarkadSync !== 'undefined') FarkadSync.replaceAll(State.schedule);

        event.target.value = '';
        render();

        if (loaded.issues.length > 0) {
            await askTell(`הגיבוי נטען. ${loaded.issues.length} רישומים ממתינים להחלטה שלך.`);
            openMigrationModal();
            return;
        }
        askTell('הגיבוי נטען.');
    };
    reader.readAsText(file);
}

async function restoreLocalBackup() {
    const raw = Store.get('scheduleData:v2backup');
    if (!raw) {
        askTell('אין גיבוי מקומי.');
        return;
    }
    const go = await askConfirm({
        title: 'לשחזר את המצב שלפני הטעינה האחרונה?',
        ok: 'שחזר'
    });
    if (!go) return;

    const current = JSON.stringify(State.schedule);
    State.schedule = normaliseSchedule(JSON.parse(raw));
    Store.set('scheduleData:v2backup', current);
    State.save();
    if (typeof FarkadSync !== 'undefined') FarkadSync.replaceAll(State.schedule);
    render();
    askTell('שוחזר.');
}
