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
        // ISOLATED, because the name starts the line and bidi reads the first strong
        // character to decide which way the whole line goes. «📍 הרצליה» is an RTL line;
        // «📍 Rothschild 12» was an LTR one, so its pin flipped to the left edge while
        // every other line in the message kept it on the right. The statement has
        // isolated its heading since it was written (workerStatementText); this did not.
        lines.push(style.site(isolate(place.name)));
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
            // Same reason, and this one also mixes: «• Dan Levi (‎+2 ש׳)» read as an
            // LTR line puts the Hebrew suffix on the wrong side of the name.
            lines.push(style.worker(isolate(worker.name), suffix));
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
        lines.push(style.absent(absent.length > 0
            ? absent.map(w => isolate(w.name)).join(', ')
            : 'אין'));
    }

    if (!any && absent.length === 0) {
        return lines[0] + (only
            ? `\n\n${isolate(only.name)}: אין שיבוצים ליום הזה.`
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

