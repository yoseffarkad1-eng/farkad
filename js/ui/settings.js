// ---------------------------------------------------------------- הגדרות וכלים
//
// Everything that is not "who worked where": the backup file, the restore points, the
// cloud account, which build is running, and the way to get a damaged device's raw
// records off it.
//
// It was at the foot of the roster screen, under the crew and the sites, which made the
// screen about people also the screen about files - and on a phone it meant scrolling
// past thirty men to reach the backup button. It is not a fifth tab either: four tabs is
// what fits across a phone with a legible label under each icon, and the fifth would have
// been the one nobody presses on a screen everybody uses.
//
// So: one ⋯ in the header, and a sheet that covers the screen. The tab bar stays where it
// is - the way back is the same X that closes every other sheet in this app.

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
    document.addEventListener('keydown', settingsKeydown);
    // The heading, not the first button: a screen reader should say where it has arrived
    // before it starts naming controls, and the first control here is a file dialog.
    const title = document.getElementById('settingsTitle');
    if (title && title.focus) title.focus();
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
    renderCarryMigration();
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
        else if (parts[0] === 'advances') title = 'מקדמה';
        else if (parts[0] === 'ledger') title = 'רישום כספי';
        return { kind: 'other', title, mine: '', cloud: '', note: HELD_ELSEWHERE,
            decidable: false, takeable: false };
    }
    const parsed = parseLocalDate(parts[1]);
    const worker = (roster.workers || []).find(item => item && item.id === parts[3]);
    const who = worker && typeof worker.name === 'string' ? worker.name : parts[3];
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
    if (heard && sameHeldBytes(row.mine, row.cloud)) {
        // The cloud caught up with this value after the hold was written. There is
        // nothing to take; keeping this one sends it, changes nothing, and clears the row.
        cloud += ' ' + HELD_SAME;
        takeable = false;
    } else if (heard && mine === cloud) {
        // The same sites, different bytes: the stamp, usually. Say the number, since
        // that is the difference the person is being asked to decide.
        const stamp = value => (value && value.rates && Number.isFinite(Number(value.rates.daily))
            ? ` · תעריף ${Number(value.rates.daily)}` : '');
        if (stamp(row.mine) !== stamp(row.cloud)) {
            mine += stamp(row.mine);
            cloud += stamp(row.cloud);
        } else cloud += ' ' + HELD_UNSEEN;
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
    const date = parts[1];
    const layer = parts[2];
    const workerId = parts[3];
    const write = value => {
        const side = ensureDay(State.schedule, date, layer);
        side[workerId] = value;
        return State.commit({ path: row.path, value }) === true;
    };
    if (!row.mine || typeof row.mine !== 'object') return Promise.resolve(false);
    if (!takeCloud) return Promise.resolve(write(JSON.parse(JSON.stringify(row.mine))));

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
    const ask = typeof askConfirm === 'function' ? askConfirm({
        title: 'לקחת את הרישום מהענן?',
        message: `${said.title}. ${HELD_MINE} ${said.mine}. ${HELD_CLOUD} ${said.cloud}. `
            + 'הרישום של המכשיר הזה יוחלף ברישום שבענן.',
        ok: HELD_TAKE,
        cancel: 'ביטול'
    }) : Promise.resolve(true);
    return Promise.resolve(ask).then(yes => {
        if (yes !== true) return false;
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
    clear(box);
    let rows = [];
    if (typeof FarkadSync !== 'undefined' && typeof FarkadSync.heldRecords === 'function'
        && typeof State !== 'undefined' && State.schedule) {
        try { rows = FarkadSync.heldRecords(); } catch (error) { rows = []; }
    }
    box.hidden = rows.length === 0;
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
        if (said.kind !== 'day') {
            card.appendChild(el('p', 'hint', said.note));
            list.appendChild(card);
            return;
        }
        card.appendChild(sideLine(HELD_MINE, said.mine));
        card.appendChild(sideLine(HELD_CLOUD, said.cloud));
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
