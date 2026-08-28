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
