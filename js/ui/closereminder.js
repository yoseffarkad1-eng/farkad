// «תזכורת לסגירת חשבונות» - the in-app reminder that accounts are still open.
//
// The owner, 2026-11-17: "a reminder - on Thursday, 'there are 4 men whose account is still
// not closed', so I don't forget to close accounts". The app has no server of its own and a
// phone that is shut hears nothing from it, so this is not a notification: it is ONE quiet
// line in the banner area, the way «מה חדש» puts its own (js/ui/whatsnew.js), with one
// button that opens «סגירת שבוע» (js/ui/weeklyclose.js) and a ✕.
//
// IT IS A READING, AND IT WRITES NOTHING TO THE RECORD. The count is «סגירת שבוע»'s own list,
// asked the same question the dialog asks (weeklyCloseRead, with today and this moment):
// the men it would OFFER - his last finished period open, a day of work in it, and nothing
// that holds him (`held` null). A man the dialog would show as held («לא ייסגר»: his period
// ends today and today is not recorded for him, an earlier period with work left open, any
// reason the per-man box refuses) is not counted, because the button would not let him be
// closed. Its gate is the dialog's gate: on a record nobody approved, or a build whose writer
// is shut (financialWritingEnabled false), the list is empty and there is no line.
//
// WHICH DAYS, decided and pinned (tests/closereminder.test.mjs). There is no calendar rule of
// this file's own: the dialog's list already IS the rule, because a man's target is "his last
// finished period" (weeklyCloseTarget):
//
//   - THURSDAY, the last day of the Friday-Thursday week (js/dates.js): a weekly man's week -
//     and, every other week, a fortnightly man's fortnight - ends today, and it counts from
//     the moment today is recorded for him. Before that the dialog holds him («התקופה שלו
//     נגמרת היום, והיום עוד לא נרשם לו») and the line does not count him. So the line comes
//     up on Thursday once the day is written, not at dawn.
//   - FRIDAY TO WEDNESDAY: his last finished period is the one that ended on a Thursday
//     before today. If it is still open, that is a close that was forgotten, and the line
//     says so on every day until it is closed. If nothing is open, the list is empty and
//     there is nothing to say - which is every day before Thursday of a week whose accounts
//     were closed.
//
// WHEN IT IS NOT PUT UP: the switch in ⋯ is off; the ✕ was pressed today; the phone has no
// crew (a first install says nothing); the count is 0; the reading threw (a reading that
// cannot be read says nothing - the dialog itself is one tap away in «דוחות»). And never
// under somebody's hands: while something is being typed or a dialog is open (midEdit,
// js/ui/offline.js) it waits, exactly as «מה חדש» waits.
//
// IT DOES NOT ASK WHETHER THIS PHONE IS «מסונכרן בין המכשירים». The line only reminds; the
// dialog it opens refuses a phone that is not synced, in its own sentence (D4). A reminder
// that went quiet whenever the signal did would be quiet on the building site, which is
// where it is read.
//
// WHAT IT COSTS. weeklyCloseRead walks every man's history and plans his close: on a season
// of fourteen men it is the better part of a second in Node and more on a slow phone. So:
//   - it is NEVER read before the first paint, and never inside a draw: at boot after the
//     frame that paints the page, and after a draw only once the draws have stopped for
//     CLOSE_REMINDER_QUIET_MS;
//   - a reading is KEPT under the record itself (owesKey, js/ui/owes.js: the write tick,
//     today, both gates and the record as text), so a draw of a record that did not move
//     reads nothing;
//   - ON THE DAY SCREEN, where a foreman taps man after man, a write does not make it read
//     again, except on a day that ends somebody's period (the one day a write to TODAY can
//     change the count). Elsewhere - «דוחות», «מקדמות», where accounts are closed - every
//     settled draw of a moved record reads again. The other reasons to read are a start,
//     a return to the app, a new calendar day, a change of screen and the switch turned on.
//     The price, said: a past day typed on the day screen between Friday and Wednesday can
//     leave the count behind until one of those happens.
//   - with the switch off, or ✕ pressed today, nothing is read at all.
//
// IT IS A PREFERENCE OF THIS PHONE, two keys through Store, written optional: never the
// record, the outbox, the cloud, a backup, a restore point or the rescue file
// (tests/closereminder.test.mjs). `farkadCloseReminder:off` is exactly '1' when it is off -
// absent, damaged or unreadable is ON, the owner's default. `farkadCloseReminder:dismissed`
// is the local date the ✕ was pressed; anything that is not today is not dismissed.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FILE ADDS, AND NOTHING ELSE, IN ONE BLOCK. The line's sentence is
// the owner's own («יש 4 עובדים שהחשבון שלהם עוד לא נסגר»); every other word is PROPOSED,
// not approved: the owner corrects on sight. Pinned word for word in
// tests/closereminder.test.mjs (CLAUDE.md, law 6). «סגירת שבוע» is that dialog's own name.
const CLOSE_REMINDER_TEXT = Object.freeze({
    // --- the quiet line
    line: count => (count === 1
        ? 'יש עובד אחד שהחשבון שלו עוד לא נסגר'
        : `יש ${count} עובדים שהחשבון שלהם עוד לא נסגר`),
    open: 'לסגירת שבוע',
    dismiss: 'הסתר עד מחר',
    // --- the row in ⋯
    title: 'תזכורת לסגירת חשבונות',
    sub: 'שורה כשיש חשבונות שלא נסגרו',
    lead: 'מיום חמישי, כשהשבוע נגמר, ועד שהחשבונות נסגרים, מופיעה למעלה שורה עם מספר העובדים שהחשבון שלהם עוד לא נסגר. ✕ מסתיר אותה עד מחר. פועל במכשיר הזה בלבד.',
    stateOn: 'מופעלת במכשיר הזה',
    stateOff: 'כבויה במכשיר הזה',
    switchOn: 'הפעלת התזכורת במכשיר הזה',
    switchOff: 'כיבוי התזכורת במכשיר הזה'
});

const CLOSE_REMINDER_OFF_KEY = 'farkadCloseReminder:off';
const CLOSE_REMINDER_DISMISSED_KEY = 'farkadCloseReminder:dismissed';
// How long the draws must have stopped before a moved record is read again.
const CLOSE_REMINDER_QUIET_MS = 1500;
// How often a line that waits for somebody to stop typing asks again («מה חדש»'s own pace).
const CLOSE_REMINDER_BUSY_MS = 1500;

// ================================================================== the readings (pure)

// How many men «סגירת שבוע» would offer, from its own reading. 0 for no reading, a shut gate,
// or nobody.
function closeReminderCount(read) {
    if (!read || read.gate !== true || !Array.isArray(read.men)) return 0;
    return read.men.filter(man => man && !man.held).length;
}

// The decision, from plain facts: { show, count }.
function closeReminderDecide(facts) {
    const f = facts || {};
    const count = Number.isInteger(f.count) && f.count > 0 ? f.count : 0;
    const show = f.off !== true && !(typeof f.dismissed === 'string' && f.dismissed === f.today)
        && f.hasCrew === true && count > 0;
    return { show, count: show ? count : 0 };
}

// Does a period of anybody's end on `today`? The one day a write to today can move the count.
function closeReminderPeriodEnds(schedule, today) {
    if (typeof periodRangeFor !== 'function') return false;
    return ((schedule && schedule.workers) || []).some(worker => {
        if (!worker || !worker.id) return false;
        try { return periodRangeFor(worker, today).to === today; } catch (error) { return false; }
    });
}

// The count on this record at this moment. A reading that throws is no line, never a crash.
function closeReminderReadCount(schedule, today, at) {
    if (typeof weeklyCloseRead !== 'function') return 0;
    try {
        return closeReminderCount(weeklyCloseRead(schedule, today, at));
    } catch (error) {
        if (typeof console !== 'undefined' && console.warn) console.warn('closereminder: not read', error);
        return 0;
    }
}

// ================================================================== the two preferences

function closeReminderGet(key) {
    try { return typeof Store !== 'undefined' && Store ? Store.get(key) : null; } catch (error) { return null; }
}

// Exactly '1' is off; everything else - the owner's default - is on.
function closeReminderOff() {
    return closeReminderGet(CLOSE_REMINDER_OFF_KEY) === '1';
}

function closeReminderDismissed() {
    const raw = closeReminderGet(CLOSE_REMINDER_DISMISSED_KEY);
    return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function closeReminderHasCrew() {
    return typeof State !== 'undefined' && Boolean(State.schedule) && Array.isArray(State.schedule.workers)
        && State.schedule.workers.length > 0;
}

// ✕: not again today. Optional - a preference never reclaims a restore point to make room for
// itself; a disk that refuses it costs the line coming back at the next start, nothing else.
function closeReminderDismiss() {
    const today = todayStr();
    CLOSE_REMINDER_DISMISSED_MEMORY = today;
    try { Store.set(CLOSE_REMINDER_DISMISSED_KEY, today, { optional: true }); } catch (error) { /* the line is down now either way */ }
    closeReminderHide();
    return true;
}

// The switch in ⋯. Off writes the one byte; on removes the key.
function closeReminderSetOff(off) {
    try {
        if (off) Store.setVerified(CLOSE_REMINDER_OFF_KEY, '1', { optional: true });
        else Store.remove(CLOSE_REMINDER_OFF_KEY);
    } catch (error) { /* the switch is drawn from what the disk says */ }
    closeReminderRenderSwitch();
    if (off) closeReminderHide();
    else closeReminderLater('switch');
    return true;
}

// ================================================================== what was read, kept

// { key, today, count } - the last reading, under the record it was read from.
let CLOSE_REMINDER_KEPT = null;
let CLOSE_REMINDER_DISMISSED_MEMORY = null;   // a ✕ a refusing disk did not keep
let closeReminderQuiet = null;                // the wait for the draws to stop
let closeReminderBusyWait = null;             // the wait for nobody to be typing
let closeReminderSoon = false;                // a reading already asked for after a paint
let closeReminderViewRead = null;             // the screen the last reading was made on
let closeReminderShown = null;                // the count the line on the glass says, or null

function closeReminderKey(schedule, today) {
    if (typeof owesKey === 'function') return owesKey(schedule, today);
    return `${typeof Store === 'object' && Store ? Store.tick : 0}|${today}|${JSON.stringify(schedule)}`;
}

function closeReminderView() {
    return typeof currentView === 'string' ? currentView : null;
}

// Whether the line is wanted at all now, before anything is read.
function closeReminderWanted(today) {
    if (closeReminderOff()) return false;
    if (closeReminderDismissed() === today || CLOSE_REMINDER_DISMISSED_MEMORY === today) return false;
    return closeReminderHasCrew();
}

// THE ONE PLACE A READING IS MADE, and the line put up or taken down from it. `reason`:
// 'boot', 'return', 'switch' - read if the record moved; 'draw' - the same, except on the
// day screen as the top of this file says. Answers the decision.
function closeReminderRefresh(reason) {
    const today = todayStr();
    if (!closeReminderWanted(today)) { closeReminderHide(); return { show: false, count: 0 }; }
    if (closeReminderBusy()) {
        if (!closeReminderBusyWait) {
            closeReminderBusyWait = setTimeout(() => { closeReminderBusyWait = null; closeReminderRefresh(reason); },
                CLOSE_REMINDER_BUSY_MS);
        }
        return { show: false, count: 0, waiting: true };
    }
    const key = closeReminderKey(State.schedule, today);
    const view = closeReminderView();
    let count;
    if (CLOSE_REMINDER_KEPT && CLOSE_REMINDER_KEPT.key === key) {
        count = CLOSE_REMINDER_KEPT.count;
    } else if (reason === 'draw' && CLOSE_REMINDER_KEPT && CLOSE_REMINDER_KEPT.today === today
        && view === 'day' && closeReminderViewRead === 'day' && !closeReminderPeriodEnds(State.schedule, today)) {
        // A write on the day screen on a day that ends nobody's period: not read again.
        count = CLOSE_REMINDER_KEPT.count;
    } else {
        count = closeReminderReadCount(State.schedule, today, new Date().toISOString());
        CLOSE_REMINDER_KEPT = { key, today, count };
        closeReminderViewRead = view;
    }
    const decision = closeReminderDecide({ off: false, dismissed: null, today, hasCrew: true, count });
    if (decision.show) closeReminderShow(decision.count); else closeReminderHide();
    return decision;
}

function closeReminderBusy() {
    return typeof midEdit === 'function' ? Boolean(midEdit()) : false;
}

// After the frame that paints the page, never in it - and a timer beside it for a window
// that is given no frame (owesAfterPaint's own pair, js/ui/owes.js). Where there is no frame
// at all (the suites' devices in Node) it is read in place.
function closeReminderLater(reason) {
    if (typeof requestAnimationFrame !== 'function') return closeReminderRefresh(reason);
    if (closeReminderSoon) return null;
    closeReminderSoon = true;
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        closeReminderSoon = false;
        closeReminderRefresh(reason);
    };
    requestAnimationFrame(() => setTimeout(run, 0));
    setTimeout(run, 400);
    return null;
}

// At the end of every draw (render, js/app.js). Costs nothing now: the line is taken down at
// once if it is no longer wanted, and otherwise a reading is asked for once the draws stop.
function closeReminderAfterRender() {
    try {
        const today = todayStr();
        if (!closeReminderWanted(today)) { closeReminderHide(); return; }
        if (closeReminderQuiet) clearTimeout(closeReminderQuiet);
        // A new calendar day or another screen is a reason of its own, not a write.
        const reason = (CLOSE_REMINDER_KEPT && CLOSE_REMINDER_KEPT.today !== today)
            || closeReminderView() !== closeReminderViewRead ? 'return' : 'draw';
        closeReminderQuiet = setTimeout(() => { closeReminderQuiet = null; closeReminderRefresh(reason); },
            CLOSE_REMINDER_QUIET_MS);
    } catch (error) {
        if (typeof console !== 'undefined' && console.warn) console.warn('closereminder: after a draw', error);
    }
}

// At boot (js/app.js), after «מה חדש» decided: read after the first paint.
function closeReminderBoot() {
    try {
        if (!closeReminderWanted(todayStr())) return 'none';
        closeReminderLater('boot');
        return 'later';
    } catch (error) {
        return 'none';
    }
}

// ================================================================== the line

function closeReminderBanner() {
    return typeof document !== 'undefined' && document.getElementById ? document.getElementById('closeReminderBanner') : null;
}

function closeReminderShow(count) {
    const banner = closeReminderBanner();
    if (!banner) return false;
    if (closeReminderShown === count && banner.style.display !== 'none') return true;
    const T = CLOSE_REMINDER_TEXT;
    clear(banner);
    const words = el('span', null, T.line(count));
    words.id = 'closeReminderLine';
    banner.appendChild(words);
    // The two buttons are one group: where the line has to wrap they go under the sentence
    // TOGETHER, never the ✕ alone on a row of its own (css/design.css).
    const acts = el('div', 'close-reminder-acts');
    const open = button(T.open, 'btn-secondary', () => closeReminderOpen());
    open.id = 'closeReminderOpen';
    acts.appendChild(open);
    const away = button('✕', 'btn-icon', () => closeReminderDismiss(), T.dismiss);
    away.id = 'closeReminderDismiss';
    acts.appendChild(away);
    banner.appendChild(acts);
    banner.style.display = '';
    closeReminderShown = count;
    if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
    return true;
}

function closeReminderHide() {
    if (closeReminderBusyWait) { clearTimeout(closeReminderBusyWait); closeReminderBusyWait = null; }
    const banner = closeReminderBanner();
    closeReminderShown = null;
    if (!banner || banner.style.display === 'none') return;
    banner.style.display = 'none';
    clear(banner);
    if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
}

// The button: the dialog «דוחות» and «מקדמות» open (weeklyCloseEntryButton), over whatever
// screen is showing. It reads its own list and refuses what it refuses; nothing here writes.
function closeReminderOpen() {
    if (typeof openWeeklyClose !== 'function') return false;
    return openWeeklyClose();
}

// ================================================================== the row in ⋯
//
// In «כללי», straight BEFORE «תזכורות בטלפון» - the other reminder - so that «תצוגה גדולה»
// still stands between the reminders and «הסעות», where its own suite pins it
// (tests/largetext.browser.mjs), and «הסעות» is still the last row. The same kind of row as every other of that sheet (v172) - a <details> shut when the sheet
// opens, opened by a tap and by nothing else (settingsFoldReasons names no reason for it).

function closeReminderCardIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const box = document.createElement('span');
    box.className = 'settings-card-icon';
    box.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(NS, 'svg');
    [['viewBox', '0 0 24 24'], ['width', '24'], ['height', '24'], ['fill', 'none'], ['stroke', 'currentColor'],
        ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]
        .forEach(([name, value]) => svg.setAttribute(name, value));
    ['M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', 'M8 3v4M16 3v4M4 10h16', 'm9 15 2 2 4-4']
        .forEach(d => {
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        });
    box.appendChild(svg);
    return box;
}

function closeReminderInstallSwitch() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const host = document.getElementById('settingsDailySection');
    if (!host || document.getElementById('closeReminderCard')) return;
    if (typeof el !== 'function' || typeof button !== 'function') return;
    const T = CLOSE_REMINDER_TEXT;
    const card = el('details', 'settings-group settings-fold close-reminder-switch');
    card.id = 'closeReminderCard';
    const head = el('summary', 'settings-card-head');
    head.appendChild(closeReminderCardIcon());
    const titles = el('div');
    titles.appendChild(el('h3', null, T.title));
    titles.appendChild(el('p', 'hint', T.sub));
    head.appendChild(titles);
    card.appendChild(head);
    const body = el('div', 'settings-fold-body');
    const lead = el('p', 'hint', T.lead);
    lead.id = 'closeReminderLead';
    body.appendChild(lead);
    const state = el('p', 'hint settings-status');
    state.id = 'closeReminderState';
    body.appendChild(state);
    const toggle = button('', 'btn-secondary', () => closeReminderSetOff(!closeReminderOff()));
    toggle.id = 'closeReminderSwitch';
    body.appendChild(toggle);
    card.appendChild(body);
    // Before «תזכורות בטלפון», else before «תצוגה גדולה» or «הסעות», else at the end.
    const next = ['settingsFoldReminders', 'displayLargeCard', 'transportSwitchCard'].map(id => document.getElementById(id))
        .filter(node => node && node.parentNode === host)[0];
    if (next) host.insertBefore(card, next);
    else host.appendChild(card);
    closeReminderRenderSwitch();
}

function closeReminderRenderSwitch() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const toggle = document.getElementById('closeReminderSwitch');
    const state = document.getElementById('closeReminderState');
    if (!toggle || !state) return;
    const on = !closeReminderOff();
    toggle.textContent = on ? CLOSE_REMINDER_TEXT.switchOff : CLOSE_REMINDER_TEXT.switchOn;
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    state.textContent = on ? CLOSE_REMINDER_TEXT.stateOn : CLOSE_REMINDER_TEXT.stateOff;
}

// ================================================================== at load
//
// Runs nothing that reads the record: the row waits for the document (after «תצוגה גדולה»'s
// own, which was asked for first, from the head), and a return to the app asks for a reading
// after its paint. Never allowed to throw into the boot.
try {
    if (typeof document !== 'undefined' && document.addEventListener) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', closeReminderInstallSwitch);
        else closeReminderInstallSwitch();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            try { if (closeReminderWanted(todayStr())) closeReminderLater('return'); else closeReminderHide(); } catch (error) { /* nothing shown */ }
        });
    }
} catch (error) {
    if (typeof console !== 'undefined' && console.warn) console.warn('closereminder: not installed', error);
}
