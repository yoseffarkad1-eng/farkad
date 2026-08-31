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
            `${formatFullDate(parseLocalDate(row.from))} - ${formatFullDate(parseLocalDate(row.to))}`));
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

// Does the v80 advances ledger agree with the record it was built from?
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
        line.textContent = 'פנקס המקדמות (v80) תואם את המקדמות הרשומות.';
        line.className = 'hint';
    } else if (wrong === 0 && behind > 0) {
        // Behind is not broken: an advance recorded since the last boot simply has no
        // mirror yet, and the next open writes it. A red warning here taught people to
        // ignore the red warning that matters.
        line.textContent = 'פנקס המקדמות (v80) טרם הועתק במלואו - יושלם בפתיחה הבאה.';
        line.className = 'hint';
    } else {
        line.textContent = 'פנקס המקדמות (v80) אינו תואם את המקדמות הרשומות - ' +
            'אין להפעיל את הכתיבה החדשה לפני בדיקה.';
        line.className = 'hint hint-warn';
    }
}
