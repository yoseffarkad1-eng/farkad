// ---------------------------------------------------------------- הגדרות וכלים
//
// Everything that is not "who worked where": the backup file, the restore points, the
// cloud account, which build is running, and the way to get a damaged device's raw
// records off it.
//
// A named header button opens one sheet. Jump buttons make backup and help reachable
// without scrolling past every card; held records remain visible in the first section.

let settingsOpen = false;

function openSettings() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    settingsOpen = true;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    // What is on it depends on the device: the restore points, the backup age, the
    // version, and whether there is a cloud account at all.
    renderSettings();
    panel.querySelector('.settings-body').scrollTop = 0;
    document.addEventListener('keydown', settingsKeydown);
    // The heading, not the first button: a screen reader should say where it has arrived
    // before it starts naming controls, and the first control here is a file dialog.
    const title = document.getElementById('settingsTitle');
    if (title && title.focus) title.focus();
}

// Navigation only: never changes the URL, the data, or the selected main screen.
// Focus follows the scroll so the next Tab enters the requested section's controls.
function settingsJump(id) {
    if (!['settingsDaily', 'settingsBackups', 'settingsHelp'].includes(id)) return;
    const heading = document.getElementById(id);
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function closeSettings() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    settingsOpen = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', settingsKeydown);
    const opener = document.getElementById('settingsBtn');
    if (opener && opener.focus) opener.focus();
}

function settingsKeydown(event) {
    if (event.key === 'Escape') { closeSettings(); return; }
    if (event.key !== 'Tab') return;

    // Focus stays inside the sheet while it is open. Without this, tabbing walks out into
    // the day list behind it - which is still on screen, still tappable, and about to be
    // covered by whatever the sheet does next.
    const panel = document.getElementById('settingsPanel');
    const focusable = [...panel.querySelectorAll('button, input, select, textarea, a[href]')]
        .filter(node => node.offsetParent !== null && !node.disabled);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

// Redrawn with the rest of the app while it is open: the backup age, the restore points
// and the sync state all change from under this sheet - a cloud copy arrives, a backup is
// taken, a restore lands - and a panel showing yesterday's answer is worse than no panel.
function renderSettingsIfOpen() {
    if (settingsOpen) renderSettings();
}

// Redrawn every time it opens, and again after anything on it changes something.
function renderSettings() {
    renderSettingsSyncLine();
    renderHeldRecords();
    if (typeof renderRestorePoints === 'function') renderRestorePoints();
    if (typeof renderCloudRestorePoints === 'function') renderCloudRestorePoints();
    if (typeof renderBackupAge === 'function') renderBackupAge();
    if (typeof renderStorageRoom === 'function') renderStorageRoom();
    if (typeof renderAppVersion === 'function') renderAppVersion();
    renderInstallState();
    renderLedgerParity();
    // The numbers a person can read out or paste when the screen itself looks wrong. See
    // the block at the foot of this file for what it may and may not carry.
    renderDiagnostic();
    renderCarryMigration();
}

// These are public, data-free calendar subscriptions. Opening Calendar is not proof
// of subscribing or granting alerts; never store or display a claimed enabled state.
function updateCalendarReminderLinks() {
    const choice = document.getElementById('calendarReminderDays');
    if (!choice) return;
    const days = ['workdays', 'friday', 'everyday'].includes(choice.value) ? choice.value : 'workdays';
    const path = `calendars/daily-${days}-1800.ics`;
    const address = `https://yoseffarkad1-eng.github.io/farkad/${path}`;
    document.getElementById('calendarReminderOpen').href = address.replace('https:', 'webcal:');
    document.getElementById('calendarReminderDownload').href = path;
    document.getElementById('calendarReminderAddress').value = address;
    document.getElementById('calendarReminderStatus').textContent =
        'יש לאשר ביומן ולהפעיל התראות. לפני הוספת ימים אחרים, הסר את יומן פרקד הקודם כדי למנוע כפילות.';
}

function calendarReminderOpened() {
    document.getElementById('calendarReminderStatus').textContent =
        'אשר את ההוספה ביומן והפעל התראות לאירועים. אם לא נפתח יומן, פתח את הוראות ההפעלה שמתחת.';
}

async function copyCalendarReminderAddress() {
    const field = document.getElementById('calendarReminderAddress');
    const status = document.getElementById('calendarReminderStatus');
    try {
        await navigator.clipboard.writeText(field.value);
        status.textContent = 'הכתובת הועתקה. אפשר להדביק אותה בהרשמה ליומן ב־iPhone.';
    } catch (error) {
        field.focus();
        field.select();
        status.textContent = 'ההעתקה לא הושלמה. לחץ לחיצה ממושכת על הכתובת המסומנת ובחר העתקה.';
    }
}

// THE MIGRATION REVIEW, and the only screen in this app built to be READ before a button
// is pressed.
//
// Switching the carry on restates accounts. planAdvanceCarry has always been able to say
// which ones and by how much, and nothing called it - so the switch was a constant in a
// file, and flipping it would have moved fortnights that had already been printed and
// paid, silently, on every phone, at the next open.
//
// v88 wrote no closure records, which is the whole difficulty: this app cannot tell a
// fortnight that was settled and paid from one that merely has no closure entry, because
// before v89 nothing wrote one either way. It must not guess. So every row that would move
// is laid out with the number as it reads TODAY beside the number it would read
// AFTERWARDS, each row says whether a closure was actually recorded for it, and a person
// decides.
//
// Nothing here writes until the confirmation is answered, and financial writing stays shut
// until the approval is on the record - see financialWritingEnabled in js/model/ledger.js.
function renderCarryMigration() {
    const box = document.getElementById('carryMigrationBox');
    if (!box) return;
    const lead = document.getElementById('carryMigrationLead');
    const rows = document.getElementById('carryMigrationRows');
    const actions = document.getElementById('carryMigrationActions');

    const quiet = () => { box.style.display = 'none'; };
    if (typeof planCarryMigration !== 'function' || typeof State === 'undefined'
        || !State.schedule) { quiet(); return; }
    // Only where the build could actually write. With the gates shut there is nothing to
    // approve FOR, and a screen asking somebody to sign off on a change that cannot happen
    // is a screen that teaches them to sign without reading.
    if (typeof ledgerWritesEnabled !== 'function' || !ledgerWritesEnabled()
        || typeof advanceCarryEnabled !== 'function' || !advanceCarryEnabled()) {
        quiet(); return;
    }

    const plan = planCarryMigration(State.schedule);
    if (!plan.needed) { quiet(); return; }

    box.style.display = '';
    clear(rows);
    clear(actions);

    const approved = carryMigrationApproved(State.schedule, plan);
    if (approved) {
        lead.textContent = 'ההעברה אושרה. המספרים למטה הם מה שהשתנה, והם לא ישתנו שוב.';
    } else {
        lead.textContent = 'לפני שאפשר לרשום החזרים, תיקונים או סגירת חשבון, צריך לאשר '
            + 'את המעבר. הרשימה למטה היא כל שורה שתזוז: מה שכתוב היום, ומה שיהיה כתוב '
            + 'אחרי. שום דבר לא ישתנה עד שתלחץ אשר.';
    }

    plan.rows.forEach(row => {
        const worker = State.worker(row.workerId);
        const line = el('div', 'wday');
        line.appendChild(el('div', 'wday-date',
            // One left-to-right run, like every other range on a screen - see dateRange
            // in js/ui/dom.js: bare, the later date paints on the left.
            dateRange(formatFullDate(parseLocalDate(row.from)), formatFullDate(parseLocalDate(row.to)))));
        const what = el('div', 'wday-what');
        what.appendChild(el('span', null, worker ? worker.name : row.workerId));
        what.appendChild(el('span', 'wday-note',
            `היום ${moneyText(row.now)} ₪ · אחרי ${moneyText(row.after)} ₪`));
        if (row.carriedOut > 0) {
            what.appendChild(el('span', 'wday-note',
                `${moneyText(row.carriedOut)} ₪ יעברו לחשבון הבא`));
        }
        // SAID OUT LOUD, per row. A period with no closure entry is not a period nobody
        // paid - v88 recorded none either way - and the person reading this is the only
        // one who knows which it was.
        if (!row.closureRecorded) {
            what.appendChild(el('span', 'wday-note wday-review',
                'אין רישום סגירה לתקופה הזו. אם היא כבר שולמה, המספר על הנייר לא ישתנה - '
                + 'אבל המסך יראה אחרת.'));
        }
        line.appendChild(what);
        line.appendChild(el('div', 'wday-money', bidiAmount(moneyText(row.after))));
        rows.appendChild(line);
    });

    if (approved) return;
    actions.appendChild(button('אשר את המעבר', 'btn-secondary',
        () => approveCarryMigration(plan), 'אישור העברת המקדמות לחשבון נמשך'));
}

// Every number the review screen showed, in one comparable string. The rows come out of
// planAdvanceCarry in worker order with a fixed shape, so two plans drawn from the same
// record produce the same text and any difference at all is a difference the person has
// not seen.
function carryPlanFingerprint(plan) {
    return JSON.stringify((plan && plan.rows ? plan.rows : []).map(row => [
        row.workerId, row.from, row.to, row.now, row.deducted,
        row.carriedIn, row.carriedOut, row.closureRecorded
    ]));
}

async function approveCarryMigration(plan) {
    const ok = await askConfirm({
        title: 'לאשר את המעבר?',
        message: `${plan.rows.length} שורות ישתנו. אחרי האישור המסכים יראו את המספרים `
            + 'החדשים, ואפשר יהיה לרשום החזרים ותיקונים. האישור נשמר ברישום ומגיע לשאר '
            + 'המכשירים - הם לא יתבקשו לאשר שוב.',
        ok: 'אשר'
    });
    if (!ok) return;

    // Re-planned against the record as it is NOW, not against the plan this screen was
    // drawn from: another phone may have approved it, or a day may have been recorded,
    // while the dialog was open. Approving a plan somebody is no longer looking at is
    // approving numbers they never saw.
    const live = planCarryMigration(State.schedule);
    // The ROWS, not the id: the id names one decision and never moves, so comparing it
    // compares nothing. What moves while a dialog is open is what the decision is ABOUT -
    // and not only how many rows there are: another phone recording a repayment leaves the
    // same row carrying a different number, which is the case a count would wave through.
    if (carryPlanFingerprint(live) !== carryPlanFingerprint(plan)) {
        renderCarryMigration();
        if (typeof askTell === 'function') {
            await askTell('הרישום השתנה בזמן שהחלון היה פתוח. בדוק את הרשימה שוב ואשר.');
        }
        return;
    }
    const change = recordCarryApproval(State.schedule, live,
        new Date().toISOString(), syncDeviceId());
    // A refused write leaves the review exactly as it was: nothing approved, the rows
    // still on the screen, and the button still there to press again.
    if (!State.commit(change)) { renderCarryMigration(); return; }
    renderCarryMigration();
}

// The sync state, inside the ענן וסנכרון group. updateSyncNotice (js/sync/sync.js) owns
// the words and writes them into #storageNotice at the foot of every screen; this copies
// whatever is there rather than composing a second version that could drift apart from
// the first. The panel re-renders while open, so the mirror stays as live as the foot.
function renderSettingsSyncLine() {
    const line = document.getElementById('settingsSyncStatus');
    if (!line) return;
    const foot = document.getElementById('storageNotice');
    line.textContent = foot ? foot.textContent : '';
    renderSettingsSyncReason();
}

// WHY the line above says the sync failed - the one thing it does not say.
//
// The person's phone, v98, on the home screen: the chip read «שגיאת סנכרון» and this
// panel read «שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (38 ממתינים לשליחה)», and
// nothing on the screen said whether the tunnel had gone or the cloud was refusing them.
// Those are different evenings. A dead network is wait; a refusal is a rules deploy
// that has not happened (docs/releases.md, the v91 rollout note - the rules go out by
// hand, after the app has updated itself) or a sign-in that has lapsed, and neither is
// done by anyone while the screen names neither. fail() (js/sync/sync.js) has kept the
// answer in FarkadSync.lastError all along; this reads it.
//
// The sentences are the app's own, one each, and pinned (tests/smoke.mjs,
// tests/status.test.mjs). The code the cloud used stays on the line after the Hebrew,
// as its own left-to-right run, because it is what the person reads out over the phone
// to whoever deploys the rules - and an English message the app has no sentence for is
// shown as itself, isolated, rather than swallowed.
const SYNC_REASON_REFUSED = 'הענן מסרב לקבל רישומים מהמכשיר הזה. '
    + 'אם האפליקציה עודכנה זה עתה, כללי הענן עדיין לא פורסמו.';
const SYNC_REASON_SIGNIN = 'הענן אינו מזהה את המכשיר הזה - התחבר שוב.';
const SYNC_REASON_UNREACHABLE = 'אין כרגע גישה לענן - הניסיון יחזור מעצמו.';
const SYNC_REASON_DEAF = 'החיבור לענן נותק - מנסה להאזין מחדש.';
const SYNC_REASON_UNRECORDED = 'הסיבה לא נרשמה.';
// A pending restore this device cannot read. The connection is fine; the phone is the
// problem, and it will not adopt anything the other two write until the record is
// replaced. Says the one thing that fixes it - load a backup, which writes a new pending
// record over the unreadable one - rather than "try again", which never will.
const SYNC_REASON_BLIND = 'שחזור שממתין במכשיר הזה אינו קריא, ולכן המכשיר אינו קולט '
    + 'עדכונים מהטלפונים האחרים. מה שנרשם כאן נשלח כרגיל. טען קובץ גיבוי דרך ⋯ ← שחזור '
    + 'כדי לצאת מהמצב הזה.';
const SYNC_REASON_MESSAGE_MAX = 100;

// The sentence for a sync object's state, or '' when the state is not a failure. Pure,
// over the fields it names, so the harness can ask it without a screen.
function syncFailureReason(sync) {
    if (!sync) return '';
    if (sync.status !== 'error' && sync.status !== 'claimstuck') return '';
    // lastError is written by every setStatus, and a dead listener outlives several of
    // them: the refusal it died on is the reason that stands until it hears again.
    // ASKED FIRST, because this one is not a failure of the connection and has its own
    // way out. A phone held on an unreadable pending restore reports 'error' with no
    // error object at all - honestStatusFor decides it from the flag - so without this it
    // would read «הסיבה לא נרשמה», which is the least useful true sentence available.
    if (sync.replaceDamaged) return SYNC_REASON_BLIND;
    const error = sync.lastError || (sync._listenerDead ? sync._listenerError : null);
    if (!error) {
        return sync._listenerDead ? SYNC_REASON_DEAF : SYNC_REASON_UNRECORDED;
    }
    const code = typeof error.code === 'string' ? error.code : '';
    // The message as a string or nothing: a bare object here read "[object Object]"
    // on the line that exists to be read aloud.
    const message = (typeof error === 'string' ? error
        : typeof error.message === 'string' ? error.message : '').trim();
    // A stuck claim is already explained by the line above this one, in Hebrew; its
    // error is an internal sentence about windows, and only a cloud code adds anything.
    if (sync.status === 'claimstuck' && code !== 'permission-denied'
        && code !== 'unauthenticated') return '';
    const suffix = code ? ` ${isolateLtr(`(${code})`)}` : '';

    if (code === 'permission-denied') return SYNC_REASON_REFUSED + suffix;
    if (code === 'unauthenticated') return SYNC_REASON_SIGNIN + suffix;
    // The SDK's word for a cloud it cannot reach, and the browser's: a failed fetch
    // is a TypeError whose message names the network and carries no code at all.
    const unreachable = code === 'unavailable' || code === 'deadline-exceeded'
        || code === 'auth/network-request-failed'
        || error.name === 'TypeError'
        || /network|fetch|load failed|offline|connection|timed out/i.test(message);
    if (unreachable) return SYNC_REASON_UNREACHABLE + suffix;

    if (!message) return SYNC_REASON_UNRECORDED + suffix;
    const shown = message.length > SYNC_REASON_MESSAGE_MAX
        ? message.slice(0, SYNC_REASON_MESSAGE_MAX - 1) + '…'
        : message;
    return `הודעת השגיאה: ${isolateLtr(shown)}${suffix}`;
}

function renderSettingsSyncReason() {
    const line = document.getElementById('settingsSyncReason');
    if (!line) return;
    let reason = '';
    if (typeof FarkadSync !== 'undefined') {
        // The same precedence as the foot: the browser's offline word, and a save that
        // failed on the disk, both replace the error sentence up there - and a reason for
        // a sentence that is not on the screen is a reason for nothing.
        const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
        const diskFailed = typeof State !== 'undefined' && Boolean(State.saveFailed);
        reason = offlineNow || diskFailed ? '' : syncFailureReason(FarkadSync);
    }
    line.textContent = reason;
    line.hidden = reason === '';
}

// THE HELD RECORDS, with both sides, and a decision per row.
//
// A hold is the sync layer refusing to decide: somebody else changed the same record
// while this phone was away (HOLD_MARK, js/sync/sync.js), so this phone's own value is
// kept on its disk, sent by nothing, and counted in «(6 ממתינים לשליחה)». The sentence
// under that count said: refresh, look at the screen, confirm again. But the screen shows
// THIS phone's value laid over the snapshot - the held operation is still current on the
// disk - so the person could not see what the other phone had recorded, and re-recording
// the cell as told would have sent their own value over it, blind. The owner's phone
// held six cells of one Thursday for a day before a rescue export named them.
//
// So every held record is laid out here: the day and the person, what this device
// recorded, what the cloud was last heard to hold, and two buttons that are the two
// honest answers. Both go through State.commit on the same path - a fresh explicit edit
// is the one sanctioned way out of a hold (tests/contested.test.mjs), and nothing here
// invents a third door. Taking the cloud's value discards this phone's record of a day
// somebody worked, so that one is confirmed first, with both sides in the question;
// keeping this phone's value is what the screen already shows.
//
// A row whose other side has not been heard - an open with no signal - is listed with
// no buttons: a decision offered without the thing to decide against is a coin toss.
// A held record that is not a worker's day (a roster record, an advance) is listed so
// that nothing held is invisible, and says where its way out is.
//
// The sentences are pinned (tests/held.test.mjs, tests/smoke.mjs). The sides are read
// in the day screen's own words - site names, «נעדר», «טרם נרשם» - and never as JSON.
const HELD_LEAD = 'רישומים שמכשיר אחר שינה בזמן שהטלפון הזה היה מנותק. '
    + 'כל שורה שמורה כאן ואינה נשלחת עד שתחליט.';
const HELD_MINE = 'במכשיר הזה:';
const HELD_CLOUD = 'בענן:';
const HELD_KEEP = 'להשאיר את שלי';
const HELD_TAKE = 'לקחת מהענן';
const HELD_UNHEARD = 'הענן טרם ענה - ההשוואה תוצג כשיענה.';
const HELD_ELSEWHERE = 'לשחרור: ערוך את הרישום הזה שוב מהמסך שלו.';
const HELD_NOTHING = 'אין רישום';
const HELD_ABSENT = 'נעדר';
const HELD_EMPTY = 'טרם נרשם';
const HELD_SAME = '(הענן כבר מחזיק את אותו רישום)';
const HELD_UNSEEN = '(ההבדל בפרט שאינו מוצג כאן)';
const HELD_UNREADABLE = 'הרישום שבענן אינו קריא במכשיר הזה, ולכן לא הועתק. '
    + 'הרישום של המכשיר הזה נשאר כפי שהוא.';
// The cloud moved while the question was open. The row is what the base document held
// when the panel was drawn, and the answer the person gives is to the sentence they
// read - so a snapshot that arrives in between makes the answer an answer to nothing,
// and the value from the row would go out over the other phone's newer correction (the
// sync layer lets it: `seen` is stamped at commit time with the new base). The carry
// approval on this same sheet refuses the same race the same way.
const HELD_MOVED = 'הרישום בענן השתנה בזמן שהחלון היה פתוח. ההשוואה עודכנה - בדוק שוב והחלט.';
// A held ledger entry has no fresh-edit way out: the ledger is append-only and its ids
// are deterministic, so "edit it again from its screen" would be a lie.
const HELD_LEDGER = 'רישום כספי שהענן מחזיק אחרת. נשמר כאן ואינו נשלח; אין לו פתרון מהמסך הזה.';
const HELD_LIST_UNREADABLE = 'רשימת הרישומים המוחזקים לא נקראה במכשיר הזה.';
const HELD_UNLISTED_WORKER = 'עובד שאינו ברשימה';

// A worker's day record, in the words the day screen uses for the same record.
function describeDayValue(value, schedule) {
    if (value === undefined || value === null || typeof value !== 'object') return HELD_NOTHING;
    if (value.absent === true) return HELD_ABSENT;
    const entries = Array.isArray(value.entries) ? value.entries : [];
    if (entries.length === 0) return HELD_EMPTY;
    const labels = placeLabelsIn(schedule);
    return entries.map(entry => {
        let said = isolate(placeLabelFrom(labels, entry && entry.placeId));
        const rate = entryRate(entry);
        if (rate === RATE_DOUBLE) said += ' (כפול)';
        else if (rate === RATE_EXTRA) {
            const hours = entryExtraHours(entry);
            said += hours ? ` (נוספות ${plusAmount(hours)})` : ' (נוספות)';
        }
        return said;
    }).join(' + ');
}

// The two records as bytes, the way the queue compares them - so a row that says "the
// same" says it on the same evidence the hold was decided on.
function sameHeldBytes(one, other) {
    const spell = typeof canonicalJson === 'function' ? canonicalJson : JSON.stringify;
    return spell(one === undefined ? null : one) === spell(other === undefined ? null : other);
}

// What a held row says: a title, the two sides, and whether a decision is offered.
// Pure over the row and the schedule, so the harness can ask it without a screen.
function describeHeldRecord(row, schedule) {
    const parts = String(row && row.path).split('.');
    const roster = schedule || {};
    if (parts[0] === 'days' && parts.length === 4 && parts[2] === 'vehicleRuns') {
        const record = row.mine || row.cloud || {};
        const vehicle = (roster.vehicles || []).find(item => item.id === parts[3]);
        const describe = value => {
            if (value === null || value === undefined) return HELD_NOTHING;
            if (vehicleRunProblems(value).length) return HELD_UNREADABLE;
            const owner = (roster.workers || []).find(item => item.id === value.ownerId);
            const sites = value.siteIds.map(id => isolate(placeLabelFrom(placeLabelsIn(roster), id))).join(' + ');
            return `${value.out ? 'יצא' : 'לא יצא'} · ${value.amount} ₪ · `
                + `${isolate(owner ? owner.name : 'בעל רכב שאינו ברשימה')}${sites ? ' · ' + sites : ''}`;
        };
        const readable = [row.mine, row.cloud].every(value => value == null || vehicleRunProblems(value).length === 0);
        const closed = [row.mine, row.cloud].some(value => value && vehicleDateClosed(roster, value.ownerId, parts[1]));
        const decidable = vehiclesEnabled() && isRealDate(parts[1]) && row.heard === true && readable && !closed;
        return { kind: 'vehicle', title: `${parts[1]} · ${isolate(record.name || (vehicle && vehicle.name) || 'רכב')}`,
            mine: describe(row.mine), cloud: row.heard ? describe(row.cloud) : HELD_UNHEARD,
            note: closed ? 'החשבון נסגר. רישום הרכב נשמר לבדיקה ולא ישתנה כאן.' : !vehiclesEnabled() ? HELD_ELSEWHERE : '',
            decidable, takeable: decidable && !sameHeldBytes(row.mine, row.cloud) };
    }
    if (parts[0] !== 'days' || parts.length !== 4) {
        let title = isolateLtr(parts.join('.'));
        const named = kind => {
            const own = row && row[kind];
            return own && typeof own === 'object' && typeof own.name === 'string' ? own.name : '';
        };
        if (parts[0] === 'roster' && parts[1] === 'workers' && parts.length === 3) {
            title = `עובד: ${isolate(named('mine') || named('cloud') || parts[2])}`;
        } else if (parts[0] === 'roster' && parts[1] === 'places' && parts.length === 3) {
            title = `אתר: ${isolate(named('mine') || named('cloud') || parts[2])}`;
        } else if (parts[0] === 'roster' && parts[1] === 'workerOrder') title = 'סדר העובדים';
        else if (parts[0] === 'roster' && parts[1] === 'placeOrder') title = 'סדר האתרים';
        else if (parts[0] === 'roster' && parts[1] === 'workers') title = 'רשימת העובדים';
        else if (parts[0] === 'roster' && parts[1] === 'places') title = 'רשימת האתרים';
        else if (parts[0] === 'advances') {
            // The person, the day and the sum, from whichever side carries them - two
            // held advances read as one line each otherwise.
            const record = (row && row.mine && typeof row.mine === 'object') ? row.mine
                : ((row && row.cloud && typeof row.cloud === 'object') ? row.cloud : {});
            const worker = (roster.workers || []).find(item => item && item.id === record.workerId);
            const who = worker && typeof worker.name === 'string' ? worker.name : HELD_UNLISTED_WORKER;
            const when = typeof record.date === 'string' && typeof isRealDate === 'function'
                && isRealDate(record.date) ? ` · ${formatShortDate(parseLocalDate(record.date))}` : '';
            const sum = Number.isFinite(Number(record.amount))
                ? ` · ${typeof moneyText === 'function' ? moneyText(Number(record.amount)) : Number(record.amount)} ₪`
                : '';
            title = `מקדמה: ${isolate(who)}${when}${sum}`;
        } else if (parts[0] === 'ledger') {
            return { kind: 'other', title: 'רישום כספי', mine: '', cloud: '', note: HELD_LEDGER,
                decidable: false, takeable: false };
        }
        return { kind: 'other', title, mine: '', cloud: '', note: HELD_ELSEWHERE,
            decidable: false, takeable: false };
    }
    const parsed = parseLocalDate(parts[1]);
    const worker = (roster.workers || []).find(item => item && item.id === parts[3]);
    const who = worker && typeof worker.name === 'string' ? worker.name : HELD_UNLISTED_WORKER;
    const layer = parts[2] === 'plan' ? ' (תכנון)' : '';
    const title = `${hebrewDayName(parsed)} ${formatShortDate(parsed)} · ${isolate(who)}${layer}`;
    const heard = Boolean(row && row.heard);
    // A day record the queue would never have accepted is not one to re-issue on a tap:
    // listed, with no decision. The queue validates every day value on its way in, so
    // this is a guard on the shape of the row, not a state the app produces.
    const readable = Boolean(row && row.mine && typeof row.mine === 'object');
    let mine = describeDayValue(row.mine, roster);
    let cloud = heard ? describeDayValue(row.cloud, roster) : HELD_UNHEARD;
    let takeable = heard && readable;
    // The stamped rate is said whenever the two stamps differ, whatever the sites say:
    // taking the cloud's record adopts its stamp, and a dialog that names the site and
    // not the number omits the one figure that changes somebody's pay.
    const stamp = value => (value && value.rates && Number.isFinite(Number(value.rates.daily))
        ? ` · תעריף ${Number(value.rates.daily)}` : '');
    const stampsDiffer = heard && stamp(row.mine) !== stamp(row.cloud);
    if (heard && sameHeldBytes(row.mine, row.cloud)) {
        // The cloud caught up with this value after the hold was written. There is
        // nothing to take; keeping this one sends it, changes nothing, and clears the row.
        cloud += ' ' + HELD_SAME;
        takeable = false;
    } else if (stampsDiffer) {
        mine += stamp(row.mine);
        cloud += stamp(row.cloud);
    } else if (heard && mine === cloud) {
        // The same sites and the same stamp, different bytes: a field this line does not
        // show. Said, rather than two identical lines with a decision under them.
        cloud += ' ' + HELD_UNSEEN;
    }
    return { kind: 'day', title, mine, cloud, note: '', decidable: heard && readable, takeable };
}

// One row's decision. Resolves to true when a commit was made, false when nothing was.
//
// Keeping this device's value re-issues the SAME BYTES as a new operation - one that
// names the held one in `after` and has seen the cloud's value - so the pre-send pass
// reads the person's decision rather than the stale race, and the held operation is
// collected as superseded. Taking the cloud's writes the cloud's record exactly, stamp
// and all: it is the other phone's record of that day, adopted whole, the way a snapshot
// would have been adopted had this phone had nothing queued. A cloud that holds nothing
// at the path is a side too - the other phone cleared the day - and taking it clears the
// day here the way the ✕ on the day screen does, which keeps the stamp on the record.
function resolveHeldRecord(row, takeCloud) {
    if (!row || row.heard !== true) return Promise.resolve(false);
    const parts = String(row.path).split('.');
    if (parts[0] !== 'days' || parts.length !== 4) return Promise.resolve(false);
    if (typeof State === 'undefined' || !State.schedule) return Promise.resolve(false);
    if (typeof FarkadSync === 'undefined' || typeof FarkadSync.heldRecords !== 'function') {
        return Promise.resolve(false);
    }
    const date = parts[1];
    const layer = parts[2];
    const workerId = parts[3];
    const vehicle = layer === 'vehicleRuns';
    if (vehicle && !describeHeldRecord(row, State.schedule).decidable) return Promise.resolve(false);
    if (!vehicle && layer !== 'plan' && layer !== 'actual') return Promise.resolve(false);
    const write = value => {
        if (vehicle && !describeHeldRecord(row, State.schedule).decidable) return false;
        const side = ensureDay(State.schedule, date, layer);
        side[workerId] = value;
        return State.commit({ path: row.path, value }) === true;
    };
    // STILL WHAT THE PANEL DREW, asked at the moment of the decision - after the
    // confirmation, not before it. A row is a reading of the base document; the base
    // moves with every snapshot, and an answer to a sentence the cloud has since
    // changed is an answer to nothing. The panel is redrawn and the person is told.
    // A row that is no longer held at all - a second tap after the first went through
    // - is refused quietly: there is nothing to decide.
    const asDrawn = () => {
        const fresh = FarkadSync.heldRecords().find(item => item.path === row.path);
        if (!fresh) return 'gone';
        if (!fresh.heard || !sameHeldBytes(fresh.cloud, row.cloud)
            || !sameHeldBytes(fresh.mine, row.mine)) return 'moved';
        return 'same';
    };
    const refuse = why => {
        if (why === 'moved' && typeof askTell === 'function') {
            askTell({ title: 'הרישום השתנה', message: HELD_MOVED });
        }
        if (typeof renderSettingsIfOpen === 'function') renderSettingsIfOpen();
        return false;
    };
    if (!vehicle && (!row.mine || typeof row.mine !== 'object')) return Promise.resolve(false);
    if (!takeCloud) {
        const state = asDrawn();
        if (state !== 'same') return Promise.resolve(refuse(state));
        return Promise.resolve(write(row.mine == null ? null : JSON.parse(JSON.stringify(row.mine))));
    }

    const theirs = row.cloud === undefined || row.cloud === null
        ? null : JSON.parse(JSON.stringify(row.cloud));
    // A record this build cannot read is not adopted into the pay record on a tap. It
    // arrived through the snapshot, so this should never fire; when it does, the row
    // stays and the reason is said.
    if (theirs !== null && typeof journalEntryProblems === 'function'
        && journalEntryProblems(row.path, theirs).length > 0) {
        if (typeof askTell === 'function') {
            askTell({ title: 'הרישום שבענן לא הועתק', message: HELD_UNREADABLE });
        }
        return Promise.resolve(false);
    }
    const said = describeHeldRecord(row, State.schedule);
    // No dialog to ask through - an incomplete shell - is a refusal, never a yes: this
    // replaces somebody's record of a day. The backup import refuses the same way.
    const ask = typeof askConfirm === 'function' ? askConfirm({
        title: 'לקחת את הרישום מהענן?',
        message: `${said.title}. ${HELD_MINE} ${said.mine}. ${HELD_CLOUD} ${said.cloud}. `
            + 'הרישום של המכשיר הזה יוחלף ברישום שבענן.',
        ok: HELD_TAKE,
        cancel: 'ביטול'
    }) : Promise.resolve(false);
    return Promise.resolve(ask).then(yes => {
        if (yes !== true) return false;
        const state = asDrawn();
        if (state !== 'same') return refuse(state);
        if (theirs === null && vehicle) return write(null);
        if (theirs === null) {
            return State.commit(clearWorkerDay(State.schedule, date, workerId, layer)) === true;
        }
        return write(theirs);
    });
}

// The rows, drawn into the ענן וסנכרון group under the reason line. Hidden - the box
// itself, not only its rows - while nothing is held, so an empty warning never stands.
function renderHeldRecords() {
    const box = document.getElementById('heldRecords');
    if (!box) return;
    let rows = [];
    let unreadable = false;
    if (typeof FarkadSync !== 'undefined' && typeof FarkadSync.heldRecords === 'function'
        && typeof State !== 'undefined' && State.schedule) {
        // A list that will not read is said, not hidden: "nothing held" over a queue
        // that could not be asked is the wrong sentence in the wrong colour.
        try { rows = FarkadSync.heldRecords(); } catch (error) { rows = []; unreadable = true; }
    }
    // NOT REBUILT WHEN NOTHING CHANGED. This runs on every render while the sheet is
    // open - every snapshot, every save - and a button rebuilt under a finger is a tap
    // that lands on nothing. The signature is the rows as drawn, both sides, bytes and
    // all, so a snapshot that moves a row still redraws it.
    const signature = unreadable ? 'unreadable' : JSON.stringify(rows.map(row =>
        [row.path, row.heard, row.mine === undefined ? null : row.mine,
            row.cloud === undefined ? null : row.cloud]));
    if (box.getAttribute('data-held') === signature) return;
    box.setAttribute('data-held', signature);
    clear(box);
    box.hidden = rows.length === 0 && !unreadable;
    if (unreadable) {
        box.appendChild(el('p', 'hint hint-warn', HELD_LIST_UNREADABLE));
        return;
    }
    if (rows.length === 0) return;

    box.appendChild(el('p', 'hint hint-warn', HELD_LEAD));
    const list = el('div', 'held-list');
    const sideLine = (label, text) => {
        const line = el('p', 'held-side');
        line.appendChild(el('b', null, label));
        line.appendChild(el('span', null, ' ' + text));
        return line;
    };
    rows.forEach(row => {
        const said = describeHeldRecord(row, State.schedule);
        const card = el('div', 'held-row');
        card.appendChild(el('div', 'held-title', said.title));
        if (said.kind !== 'day' && said.kind !== 'vehicle') {
            card.appendChild(el('p', 'hint', said.note));
            list.appendChild(card);
            return;
        }
        card.appendChild(sideLine(HELD_MINE, said.mine));
        card.appendChild(sideLine(HELD_CLOUD, said.cloud));
        if (said.note) card.appendChild(el('p', 'hint', said.note));
        if (said.decidable) {
            const actions = el('div', 'held-actions');
            actions.appendChild(button(HELD_KEEP, 'btn-secondary',
                () => { resolveHeldRecord(row, false); }));
            if (said.takeable) {
                actions.appendChild(button(HELD_TAKE, 'btn-secondary',
                    () => { resolveHeldRecord(row, true); }));
            }
            card.appendChild(actions);
        }
        list.appendChild(card);
    });
    box.appendChild(list);
}

// Installed to the home screen, or visiting in a tab. On an iPhone that difference is
// whether the record survives a week of not being opened - Safari clears a plain tab's
// storage, an installed app keeps it - so it belongs in מצב המכשיר, said quietly, not
// only in the banner that asks for the install.
function renderInstallState() {
    const line = document.getElementById('installState');
    if (!line) return;
    const standalone = typeof isStandalone === 'function' && isStandalone();
    line.textContent = standalone
        ? 'מותקן על מסך הבית.'
        : 'פועל בדפדפן - לא מותקן על מסך הבית.';
}

// Does the advances ledger agree with the record it was built from?
//
// The check itself lives with the ledger (js/model/ledger.js) and is landing in its own
// workstream, so everything here is feature-detected: when no check is reachable the
// line stays hidden and this panel claims nothing. When it is reachable, the answer is
// reported rather than assumed - and a disagreement is the one state in which flipping
// the ledger's write gate on would corrupt somebody's money, so the warning says exactly
// that.
function renderLedgerParity() {
    const line = document.getElementById('ledgerParity');
    if (!line) return;

    // State.ledgerParity is the shipped hook (it answers over the live schedule); the
    // bare function is the fallback for a build that has the ledger but not the hook.
    // `typeof window` FIRST - evaluating window.FarkadLedger where window is absent
    // throws before typeof can save it.
    const parity = (typeof State !== 'undefined' && typeof State.ledgerParity === 'function')
        ? () => State.ledgerParity()
        : (typeof ledgerAgreesWithAdvances === 'function'
            ? () => ledgerAgreesWithAdvances(State.schedule) : null);

    const quiet = () => {
        line.style.display = 'none';
        line.textContent = '';
        line.className = 'hint';
    };

    if (!parity || typeof State === 'undefined' || !State.schedule) { quiet(); return; }
    // No advances at all: agreement would be vacuous, and a reassurance line about an
    // empty record is noise.
    if (Object.keys(State.schedule.advances || {}).length === 0
        && Object.keys((State.schedule.ledger || {}).advances || {}).length === 0) {
        quiet();
        return;
    }

    let verdict;
    try {
        verdict = parity();
    } catch (error) {
        // A parity check that throws has no verdict to report, and a guess would be
        // worse than silence.
        quiet();
        return;
    }
    if (!verdict || typeof verdict.agrees !== 'boolean') { quiet(); return; }

    line.style.display = '';
    const behind = (verdict.missing || []).length;
    const wrong = (verdict.different || []).length + (verdict.orphaned || []).length;
    if (verdict.agrees) {
        line.textContent = 'היסטוריית המקדמות תואמת את המקדמות הרשומות.';
        line.className = 'hint';
    } else if (wrong === 0 && behind > 0) {
        // Behind is not broken: an advance recorded since the last boot simply has no
        // mirror yet, and the next open writes it. A red warning here taught people to
        // ignore the red warning that matters.
        line.textContent = 'היסטוריית המקדמות טרם הועתקה במלואה - תושלם בפתיחה הבאה.';
        line.className = 'hint';
    } else {
        line.textContent = 'היסטוריית המקדמות אינה תואמת את המקדמות הרשומות - ' +
            'אין להפעיל את הכתיבה החדשה לפני בדיקה.';
        line.className = 'hint hint-warn';
    }
}

// ---------------------------------------------------------------- the diagnostic
//
// WHAT THIS IS FOR, because it is not a feature and should not grow into one.
//
// One iPhone, on the home screen, is the only phone this app has ever been seen on, and
// nothing in this repository can look at it. Two rounds of work have now been argued from
// two screenshots: two bottom bars floating in the middle of the screen with page content
// underneath them, and a chip reading «(59 ממתינים לשליחה)». Both rounds had to guess at
// the build - one of them guessed it from the pixel dimensions of the image, which is not
// evidence and cost a day. The owner has been asked twice, in Hebrew and in Arabic, which
// version is running, and the answer has not come back, because the question is
// «⋯ ← גרסה» and the screenshot that would answer it is a different screenshot from the
// one showing the fault.
//
// So: one block, one tap, one paste. It reports the numbers that decide every question
// this round has been unable to answer - which build the page is, which build the scripts
// are, which builds the service worker is still holding, what the two viewports say, what
// has focus, where each bottom bar actually IS, how deep the queue is and why the cloud
// said no.
//
// AND IT CARRIES NOTHING ELSE. It is pasted into WhatsApp by somebody who is not thinking
// about privacy at the moment they paste it, so the guarantee cannot be care: no worker's
// name, no site's name, no amount, no e-mail, no password, no device id. Every value goes
// through ascii() below and the whole report is ASCII by construction, which a Hebrew name
// cannot survive; tests/mobile.test.mjs seeds a roster with Hebrew AND Latin names and
// asserts that none of them appears, because ASCII alone would not have caught the Latin
// one.

// One value, made safe to print: printable ASCII only, one line, and short.
//
// The cap is not tidiness. An error message arrives from a cloud this code does not
// control and is the one field here whose content nobody has written down.
function diagnosticAscii(value, limit) {
    const text = value === null || value === undefined ? '' : String(value);
    let out = '';
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code >= 0x20 && code <= 0x7e) out += ch;
    }
    const max = limit || 60;
    return out.length > max ? out.slice(0, max - 1) + '~' : out;
}

// A rectangle as one field, or the word for "not there". Rounded, because a fixed bar's
// sub-pixel position is not what anybody is going to read out over the phone.
function diagnosticRect(node) {
    if (!node) return 'missing';
    if (typeof getComputedStyle !== 'function') return 'unknown';
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 'hidden';
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return 'empty';
    return `${style.position} top=${Math.round(box.top)} bottom=${Math.round(box.bottom)}`
        + ` h=${Math.round(box.height)}`;
}

// What has focus, named by its SHAPE and never by its contents. A field's value is the
// one thing on this screen that could be somebody's name, and it is not read here.
function diagnosticFocus() {
    if (typeof document === 'undefined') return 'none';
    const node = document.activeElement;
    if (!node || node === document.body) return 'body';
    let out = node.tagName || 'unknown';
    if (node.tagName === 'INPUT') out += `[${diagnosticAscii(node.type || 'text', 16)}]`;
    if (node.id) out += `#${diagnosticAscii(node.id, 30)}`;
    // The class list, which in this app is always Latin and always written in the
    // stylesheet - never a name, never a number somebody typed.
    const cls = diagnosticAscii(String(node.className || '').replace(/\s+/g, '.'), 40);
    if (cls) out += `.${cls}`;
    return out;
}

// The sync failure as a CODE rather than as its sentence.
//
// Derived from syncFailureReason's own answer rather than from a second walk over the same
// fields, so the two can never disagree about what this phone is doing - and so the report
// stays ASCII while the sentence the person is reading stays Hebrew.
function syncReasonCode(sync) {
    const sentence = typeof syncFailureReason === 'function' ? syncFailureReason(sync) : '';
    if (!sentence) return 'none';
    if (sentence.indexOf(SYNC_REASON_BLIND) === 0) return 'blind';
    if (sentence.indexOf(SYNC_REASON_REFUSED) === 0) return 'refused';
    if (sentence.indexOf(SYNC_REASON_SIGNIN) === 0) return 'signin';
    if (sentence.indexOf(SYNC_REASON_UNREACHABLE) === 0) return 'unreachable';
    if (sentence.indexOf(SYNC_REASON_DEAF) === 0) return 'deaf';
    if (sentence.indexOf(SYNC_REASON_UNRECORDED) === 0) return 'unrecorded';
    return 'message';
}

// The whole report, as one block of text.
//
// `extra` carries the one answer this function cannot get synchronously - the builds the
// service worker says are still open on this device - so that everything else is readable
// without waiting for anything, and a worker that never answers costs the report one line
// rather than all of it.
function diagnosticText(extra) {
    const said = extra || {};
    const lines = [];
    const put = (key, value) => lines.push(`${key}=${diagnosticAscii(value, 80)}`);

    lines.push('--- farkad diagnostic ---');

    // THE VERSION QUESTION, first, because it is the one that has been asked twice.
    const meta = typeof document !== 'undefined'
        ? document.querySelector('meta[name="farkad-build"]') : null;
    const page = meta ? meta.getAttribute('content') : '';
    const app = typeof APP_VERSION === 'string' ? APP_VERSION : '';
    put('page.build', page || 'unknown');
    put('app.build', app || 'unknown');
    put('build.agree', page && app ? (page === app ? 'yes' : 'NO') : 'unknown');
    const controller = typeof navigator !== 'undefined' && navigator.serviceWorker
        ? navigator.serviceWorker.controller : null;
    put('sw.controller', navigator && navigator.serviceWorker ? (controller ? 'yes' : 'no') : 'none');
    put('sw.builds', said.builds === undefined ? 'not-asked' : (said.builds || 'no-answer'));

    // THE TWO VIEWPORTS, which is what the floating-bars screenshot is a picture of.
    // innerHeight is the layout viewport a fixed bar is placed in; visualViewport.height
    // is what is actually left to see through, and on a home-screen iPhone they disagree
    // for reasons that are not always a keyboard.
    if (typeof window !== 'undefined') {
        put('window', `${window.innerWidth}x${window.innerHeight}`);
        const vv = window.visualViewport;
        put('visual', vv
            ? `${Math.round(vv.width)}x${Math.round(vv.height)} scale=${vv.scale.toFixed(2)}`
                + ` offsetTop=${Math.round(vv.offsetTop)} pageTop=${Math.round(vv.pageTop)}`
            : 'unsupported');
        put('scroll', `${Math.round(window.scrollY)}`);
        put('dpr', String(window.devicePixelRatio || 1));
        put('standalone', typeof isStandalone === 'function' ? (isStandalone() ? 'yes' : 'no') : 'unknown');
        put('scheme', window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark' : 'light');
        put('orientation', window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    }

    put('focus', diagnosticFocus());

    // WHERE THE BARS ACTUALLY ARE. Read off the elements, not off the custom properties -
    // the properties are what the last measurement believed and these are what the browser
    // is drawing, and the screenshot this block exists for is the case where they differ.
    if (typeof document !== 'undefined') {
        put('bar.tabs', diagnosticRect(document.querySelector('.tabs')));
        put('bar.dock', diagnosticRect(document.querySelector('.day-actions')));
        put('bar.undo', diagnosticRect(document.getElementById('undoBar')));
        const root = document.documentElement;
        const css = name => {
            const value = getComputedStyle(root).getPropertyValue(name);
            return (value || '').trim() || '-';
        };
        put('css.bars', `nav=${css('--nav-h')} dock=${css('--day-actions-h')}`
            + ` undo=${css('--undo-h')} topbar=${css('--topbar-h')}`
            + ` kb=${css('--kb-h')} safe=${css('--safe-bottom')}`);
        put('body.kbd-open', document.body && document.body.classList.contains('kbd-open') ? 'yes' : 'no');
        put('body.day-compact', document.body && document.body.classList.contains('day-compact') ? 'yes' : 'no');
    }

    // THE QUEUE, and why it is not moving.
    if (typeof FarkadSync !== 'undefined' && FarkadSync) {
        let pending = 'unknown';
        try { pending = String(FarkadSync.pendingCount()); } catch (error) { pending = 'unreadable'; }
        put('sync.pending', pending);
        put('sync.status', FarkadSync.status || 'none');
        put('sync.reason', syncReasonCode(FarkadSync));
        const error = FarkadSync.lastError;
        put('sync.code', error && typeof error.code === 'string' ? error.code : '-');
    } else {
        put('sync.pending', 'no-sync');
    }
    put('writes.blocked',
        typeof farkadWritesBlocked === 'function' && farkadWritesBlocked() ? 'yes' : 'no');
    put('save.failed', typeof State !== 'undefined' && State.saveFailed ? 'yes' : 'no');
    put('navigator.online', typeof navigator !== 'undefined' && navigator.onLine === false ? 'no' : 'yes');

    lines.push('--- end ---');
    return lines.join('\n');
}

// The builds this device still has windows on, asked of the service worker.
//
// The same census js/ui/offline.js runs, on a channel of its own so the answer comes back
// here. It is the ONLY way to learn that a phone is running a page from one build under a
// worker from another - which is the state two rounds of this work have been unable to
// rule out. A worker that does not answer within the timeout leaves the line saying so;
// waiting longer than that for a diagnostic is how a diagnostic stops being pressed.
function askServiceWorkerBuilds() {
    return new Promise(resolve => {
        const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
        const worker = container ? container.controller : null;
        if (!worker || typeof MessageChannel !== 'function') { resolve(''); return; }
        let done = false;
        const finish = value => { if (!done) { done = true; resolve(value); } };
        try {
            const channel = new MessageChannel();
            channel.port1.onmessage = event => {
                const said = event.data;
                if (!said || said.type !== 'builds') return;
                const builds = (said.builds || []).join(',');
                finish(said.unknown ? `${builds}+unknown` : builds);
            };
            worker.postMessage({ type: 'which-builds' }, [channel.port2]);
        } catch (error) {
            finish('');
        }
        setTimeout(() => finish(''), 900);
    });
}

// Open or shut is a posture for the life of the panel, like every other fold in this app.
let diagnosticOpen = false;
let diagnosticBuilds;

// The block itself. Built into the settings sheet by JS rather than written into
// index.html, because it is drawn only when somebody asks for it and because index.html
// belongs to the shell rather than to this screen.
function renderDiagnostic() {
    const body = document.getElementById('settingsHelpCards');
    if (!body) return;

    let group = document.getElementById('diagnosticGroup');
    if (!group) {
        group = el('section', 'settings-group');
        group.id = 'diagnosticGroup';
        group.appendChild(el('h3', null, 'מידע טכני'));
        group.appendChild(el('p', 'hint',
            'שורות טכניות לצילום או להעתקה, כשמשהו נראה לא במקום על המסך. '
            + 'אין בהן שמות של עובדים או אתרים, אין סכומים ואין סיסמאות.'));
        const toggle = button('', 'btn-secondary', () => {
            diagnosticOpen = !diagnosticOpen;
            if (diagnosticOpen && diagnosticBuilds === undefined) {
                // Asked once per opening, not on every redraw: this panel redraws with the
                // rest of the app, and a message to the worker on every render is a message
                // every second.
                diagnosticBuilds = '';
                askServiceWorkerBuilds().then(value => {
                    diagnosticBuilds = value;
                    if (settingsOpen) renderDiagnostic();
                });
            }
            renderDiagnostic();
        });
        toggle.id = 'diagnosticToggle';
        toggle.setAttribute('aria-controls', 'diagnosticBox');
        group.appendChild(toggle);

        const box = el('div', 'diagnostic-box');
        box.id = 'diagnosticBox';
        const field = document.createElement('textarea');
        field.id = 'diagnosticText';
        field.className = 'diagnostic-text';
        field.readOnly = true;
        field.rows = 10;
        field.setAttribute('dir', 'ltr');
        field.setAttribute('aria-label', 'מידע טכני להעתקה');
        // Selecting the whole block by touching it: on a phone the alternative is a
        // long-press and two drag handles, over ten lines, one-handed, at night.
        field.addEventListener('focus', () => field.select());
        box.appendChild(field);
        const copy = button('העתק', 'btn-secondary', copyDiagnostic, 'העתק את המידע הטכני');
        copy.id = 'diagnosticCopy';
        box.appendChild(copy);
        group.appendChild(box);

        body.appendChild(group);
    }

    const toggle = document.getElementById('diagnosticToggle');
    const box = document.getElementById('diagnosticBox');
    const field = document.getElementById('diagnosticText');
    toggle.textContent = diagnosticOpen ? 'הסתר מידע טכני' : '🛠️ הצג מידע טכני';
    toggle.setAttribute('aria-expanded', String(diagnosticOpen));
    box.style.display = diagnosticOpen ? '' : 'none';
    if (!diagnosticOpen) return;

    const text = diagnosticText({ builds: diagnosticBuilds });
    // Never over a selection somebody is in the middle of making. This panel redraws on
    // every render, and rewriting the field's value collapses the selection to nothing -
    // which on a phone is the difference between one paste and four attempts.
    if (document.activeElement !== field && field.value !== text) field.value = text;
}

// One tap, and it says which of the three things happened.
//
// The clipboard is refused in plenty of real situations (no permission, an insecure
// origin, a browser that has none), and the answer to that is not silence: the text is
// already in a field that has just been selected, so the fallback is to say so. Not
// alert() - law 11.
async function copyDiagnostic() {
    const field = document.getElementById('diagnosticText');
    if (!field) return;
    const text = field.value;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            if (typeof askTell === 'function') await askTell('המידע הטכני הועתק.');
            return;
        }
    } catch (error) {
        // Falls through to the selection below, which is the answer that always works.
    }
    field.focus();
    field.select();
    if (typeof askTell === 'function') {
        await askTell('לא הצלחתי להעתיק לבד. הטקסט מסומן - לחץ עליו לחיצה ארוכה ובחר "העתק".');
    }
}
