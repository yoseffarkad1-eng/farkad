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
    const body = document.querySelector('#settingsPanel .settings-body');
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

        // Above the carry review, which is a screen about money and belongs last.
        const carry = document.getElementById('carryMigrationBox');
        if (carry && carry.parentNode === body) body.insertBefore(group, carry);
        else body.appendChild(group);
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
