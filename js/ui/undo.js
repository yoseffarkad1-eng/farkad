// One step back, and one step forward again.
//
// Clearing a worker's day is one tap on a row in a list of twelve, on a phone, at night.
// It will be the wrong row sometimes. Without this the only trace is a day that silently
// went back to "טרם נרשם" - and if it is noticed at all, it is noticed on payday.
//
// A confirmation dialog on every ✕ would cost a tap thirty times an evening to prevent a
// mistake that happens once a month. An undo costs nothing until it is needed.
//
// REDO exists for a specific reason, not for symmetry: pressing ↶ on a phone shows a
// screen that looks much like the one before it, and if the change being undone was not
// the one the person had in mind, they are left worse off than before - the original
// edit gone and no way back to it. ↷ makes ↶ safe to try.
//
// Deliberately one step deep in each direction. An undo stack over a document three
// people are editing at once would start restoring states that no longer exist by the
// time anyone reaches for it.

const UNDO_SECONDS = 12;

let undoAction = null;      // puts the record back the way it was
let redoAction = null;      // puts it back the way the edit left it
let undoTimer = null;
let undoLabel = '';

// The record for one worker on one day, deep-copied. It has to be taken BEFORE the
// change, and it has to be a copy: the live object is about to be replaced in place.
function snapshotWorkerDay(date, layer, workerId) {
    const record = workerDay(State.schedule, date, workerId, layer);
    return record ? JSON.parse(JSON.stringify(record)) : { entries: [] };
}

// Applies a change to one worker-day and keeps both sides of it on hand. The date and
// layer are captured now, not read at undo time - by then the person may have moved to
// another day, and restoring into that one would be a second mistake.
//
// Returns whether the edit STOOD - State.commit's verdict, passed through. The assign
// sheet advances to the next worker on the strength of this call, and an advance over a
// refused commit moves the sheet to a different name behind the very dialog explaining
// that nothing was recorded for this one.
//
// `at`, THE DAY THE SURFACE NAMED: { date, layer }, read by the surface making this edit when
// it was drawn - the sheet's meta line, the picker's context, the day screen's header - and
// the edit is made on THAT day, whatever State.date has become by the time the finger lands.
// The sheet's «שעות נוספות» box was the proof that reading it here was not enough: shut
// after midnight with the box still holding the focus, the follow of the calendar (js/app.js)
// moved State.date first, the box's `change` came after, and three hours typed on Tuesday
// were taken off Tuesday and written onto Wednesday (the second review of the hotfix). So a
// surface passes its day, and `mutate` is handed the same two - the change is built on the
// very day the copy below was taken of, by construction rather than by the order of events.
// Left out, the day on screen, as before.
function editWithUndo(workerId, label, mutate, at) {
    const date = at && at.date ? at.date : State.date;
    const layer = at && at.layer ? at.layer : State.layer;
    const previous = snapshotWorkerDay(date, layer, workerId);

    // No undo bar for an edit that did not happen. commit() has already put the screen
    // back and said why; offering "undo" over that would name a change nobody made.
    //
    // AND NO OLDER STEP LEFT ARMED OVER ONE THE JOURNAL KEPT (v166). Another window of this
    // app wrote the same day first, so the disk guard held this edit in the journal and
    // said so; it is owed to the cloud. ↶ still held the step before it, and pressed to
    // take this edit back it took back that one instead - another man's day.
    if (!State.commit(mutate(date, layer))) {
        if (State.lastCommitKept) hideUndo();
        return false;
    }

    // Taken AFTER the commit, so redo restores exactly what the edit produced rather
    // than being a guess at how to repeat it.
    const after = snapshotWorkerDay(date, layer, workerId);

    // A step back is offered over the day it restores into, while that day is the one on
    // the screen (hideUndo, below, says why). An edit that landed on its surface's day after
    // the screen had moved on stood all the same - but no step is offered for it, and none
    // older is left armed over it.
    if (date !== State.date || layer !== State.layer) {
        hideUndo();
        return true;
    }

    // Each direction is written only over what this phone's own step left there (undoStands).
    let left = after;
    const put = record => () => {
        if (!undoStands(date, layer, workerId, left)) return UNDO_STALE;
        const stood = State.commit(setWorkerDay(State.schedule, date, workerId, layer, record));
        if (stood) left = snapshotWorkerDay(date, layer, workerId);
        return stood;
    };
    offerUndo(label, put(previous), put(after));
    return true;
}

// A STEP IS TAKEN BACK ONLY OVER WHAT THIS PHONE'S OWN STEP LEFT THERE (v194).
//
// The step is two copies of a man's day, taken at the edit, and ↶ stays lit until the day is
// left - long after its bar has gone. Meanwhile another phone corrects the same man: this phone
// adopts the correction, shows it, says «מסונכרן» - and ↶, pressed then, wrote this phone's OLD
// copy over the other phone's newer record, on every phone and in the cloud, each saying
// «מסונכרן»; ↷ put back this phone's own edit, never the correction (the audit of v192, measured
// with two devices: placed on site 1 here, corrected there to another site with 3 extra hours,
// ↶ here - an empty day everywhere). Copy-a-day already knew the rule (copyDayInto,
// js/ui/sheet.js): a row another phone edited in between is that phone's answer.
//
// So every step asks first whether the day it would write over still holds what this phone's
// last step left on it - read from the live record at the press, compared field for field. If it
// does not, NOTHING is written, both directions are forgotten, and the person is told
// (UNDO_TEXT.stale). A step over several men (a site filled, a site emptied, «הכל חופש») goes
// back man by man: each one still standing is put back, each one changed since is left as it
// is, and how many were left is said (UNDO_TEXT.partial); none standing is the same sentence as
// the single step's, and nothing written.
//
// PROPOSED, not read by the owner; pinned in tests/undo-stale.test.mjs.
const UNDO_TEXT = {
    stale: 'הרישום הזה השתנה מאז, אולי ממכשיר אחר. הפעולה לא בוצעה ושום רישום לא שונה.',
    partial: count => (count === 1
        ? 'רישום אחד השתנה מאז, אולי ממכשיר אחר, ונשאר כמו שהוא.'
        : `${count} רישומים השתנו מאז, אולי ממכשיר אחר, ונשארו כמו שהם.`)
};
// What a step answers when it found the record changed under it (runUndo, runRedo).
const UNDO_STALE = 'stale';

// One record as text, its keys in order: a copy that came back from the cloud is the same
// record whatever order its fields arrived in.
function undoCanonical(value) {
    if (Array.isArray(value)) return `[${value.map(undoCanonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
            .map(key => `${JSON.stringify(key)}:${undoCanonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

// Whether the man's day still holds `left` - what this phone's step left there.
function undoStands(date, layer, workerId, left) {
    return undoCanonical(snapshotWorkerDay(date, layer, workerId)) === undoCanonical(left);
}

// The way back of a step over several men. `rows`: [{ workerId, left, back }] - what the step
// left on each man's day, and the change that takes it back, built at the press. `open(row)`,
// when given, is one more thing a row must pass (an account still open). Answers UNDO_STALE when
// no row stands; otherwise writes the standing rows in one commit and says how many were left.
function undoRows(date, layer, rows, open) {
    const standing = rows.filter(row => undoStands(date, layer, row.workerId, row.left) && (!open || open(row)));
    if (!standing.length) return UNDO_STALE;
    const stood = State.commitMany(standing.map(row => row.back()));
    if (stood && standing.length < rows.length) askTell(UNDO_TEXT.partial(rows.length - standing.length));
    return stood;
}

// THE BAR COMES UP UNDER THE FINGER THAT MADE THE EDIT (the second review of the hotfix). On a
// short phone a usual site's chip low on the screen places its man, and the bar appears where
// the chip was: the second tap of a double tap, 150 ms later, landed on «בטל» and took the
// placement straight back - two taps, no man, a stamped empty day left on the record.
//
// AND ONLY THAT FINGER IS IGNORED (the third review of the hotfix). Round two made «בטל» take no
// finger at all for DOUBLE_TAP_GUARD_MS after the bar appeared, and a man taken off a site by a
// mis-tapped ✕ and given back by a quick «בטל» - 350, 450, 650 ms later - stayed off his day, the
// bar still offering the step, nothing saying the tap had done nothing. A deliberate «בטל» is a
// press on «בטל»; the bounce is the press that made the edit coming down again, where it came
// down, at once. So «בטל» ignores exactly that: the same finger again (sameFingerAgain,
// js/ui/sheet.js) - a press inside the control the edit was pressed on, less than its bounce after
// it. Anywhere else, or later, it is a tap. A keyboard's press (detail 0) is never a bounce and
// acts at once; the header's ↶ holds the same step and is never under that finger.
let undoBarPress = null;

function undoBarTap(event) {
    if (event && event.detail > 0 && typeof sameFingerAgain === 'function'
        && sameFingerAgain(pressOf(event), undoBarPress)) return;
    runUndo();
}

// AND UNDER THE FINGER THAT IS TAKING MEN OFF A SITE THE BAR IS NOT PUT UP AT ALL.
//
// The owner, from his phone: several men taken off one after another, and "one of the two
// removals does not happen and things get mixed up". Measured: the bar stands on the lowest
// rows of the list the page shows, and the ✕ of a row is on the same side of the screen as the
// bar's own «בטל» and ✕. A man low on the screen taken off, the bar came up over the place his
// ✕ had been - and the next tap there, at any pace, landed on the bar and not on the next man:
// measured at 320x568, 375x667 and 390x844 on the lowest row a finger reaches, it landed on the
// bar's own ✕ - the bar went away, the man stayed, and nothing said so. The bounce above is a
// press made at once; this one is made on purpose, at the next man, and no window of time
// answers it.
//
// So a row's ✕ asks, once its edit stood: does the bar stand where this finger came down
// (HALF_A_FINGER around it)? Then the bar is put away again in the same turn, before it was ever
// drawn. The step is not: it is held by the header's ↶, by name, exactly as it is after the bar's
// twelve seconds - and the next man's ✕ is what stands under the finger. Anywhere else on the
// screen the bar comes up as it always did. A keyboard's press has no finger and keeps its bar.
const HALF_A_FINGER = 22;     // CSS px: half of the 44px a target is promised

function undoBarAwayFromPress() {
    const bar = document.getElementById('undoBar');
    const press = undoBarPress;
    if (!bar || !press || bar.style.display === 'none' || typeof bar.getBoundingClientRect !== 'function') return;
    const box = bar.getBoundingClientRect();
    if (!(box.height > 0)) return;
    if (press.y < box.top - HALF_A_FINGER || press.y > box.bottom + HALF_A_FINGER
        || press.x < box.left - HALF_A_FINGER || press.x > box.right + HALF_A_FINGER) return;
    dismissUndoBar();
}

// `redo` is optional: a bulk action (emptying a site) passes only the way back.
function offerUndo(label, restore, replay) {
    undoAction = restore;
    redoAction = null;      // a new edit ends whatever forward path existed
    undoLabel = label;
    undoAction._replay = replay || null;

    const bar = document.getElementById('undoBar');
    if (bar) {
        clear(bar);
        bar.appendChild(el('span', null, label));
        bar.appendChild(button('בטל', 'btn-secondary', undoBarTap));
        bar.appendChild(button('✕', 'btn-icon', dismissUndoBar, 'סגור'));
        bar.style.display = '';
        // The press of the tap that made this edit, where it came down; none for a keyboard's.
        undoBarPress = typeof openPress === 'function' ? openPress() : null;

        clearTimeout(undoTimer);
        // Only the BAR expires. The step itself stays available behind the header
        // buttons, because "I did that wrong" is not always noticed within twelve
        // seconds - often it is noticed two names later.
        undoTimer = setTimeout(dismissUndoBar, UNDO_SECONDS * 1000);
    }

    renderUndoButton();
}

// Undo and redo SWAP rather than being spent. Pressing one always leaves the other
// available, so a person who is not sure which way they wanted can move back and forth
// until the screen says what they expected - which is the whole point of having both.
function runUndo() {
    const restore = undoAction;
    if (!restore) return;
    const replay = restore._replay;

    dismissUndoBar();
    if (restore() === UNDO_STALE) {
        undoRefused();
        return;
    }

    undoAction = null;
    redoAction = replay || null;
    if (redoAction) redoAction._replay = restore;
    renderUndoButton();
}

function runRedo() {
    const replay = redoAction;
    if (!replay) return;
    const restore = replay._replay;

    if (replay() === UNDO_STALE) {
        undoRefused();
        return;
    }

    redoAction = null;
    undoAction = restore || null;
    if (undoAction) undoAction._replay = replay;
    renderUndoButton();
}

// The record changed under the step: both directions are forgotten - neither is this phone's to
// take any more - and the person is told that nothing was written.
function undoRefused() {
    hideUndo();
    askTell(UNDO_TEXT.stale);
}

// Takes the toast off the screen and leaves the step itself standing.
function dismissUndoBar() {
    clearTimeout(undoTimer);
    undoTimer = null;

    const bar = document.getElementById('undoBar');
    if (bar) bar.style.display = 'none';
}

// Forgets both directions. Called when the day changes: these restore into the day they
// were made on, and offering them while another day is on screen would put a correction
// somewhere nobody is looking.
function hideUndo() {
    dismissUndoBar();
    undoAction = null;
    redoAction = null;
    renderUndoButton();
}

// The two arrows in the day header. Present always so their place is learned, dimmed
// when there is nothing behind them - a control that appears and disappears is one that
// has to be hunted for at the moment it is needed. Each carries the name of the change
// it would apply, so pressing it is not a guess.
//
// THE NAME AND THE TOOLTIP ARE TWO DIFFERENT THINGS, and only one of them was moving.
//
// `title` is what a mouse pointer hovers over, and there is no pointer on a building
// site. The accessible NAME - what VoiceOver reads out - comes from aria-label, which was
// written once in index.html and never again: so after an edit the tooltip said
// «בטל: מחיקת יום» and the screen reader still said «אין מה לבטל», which is the opposite
// of what the button would do.
//
// It became load-bearing rather than merely wrong when the day screen learned to collapse
// at large text sizes: the words beside these two buttons are hidden there, so the
// accessible name is the ONLY thing left that says what they are. Both are set together
// now, from one string, so they cannot drift apart again.
function renderUndoButton() {
    const name = (action, label, empty) => (action ? `${label}: ${undoLabel}` : empty);

    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
        undoBtn.disabled = !undoAction;
        const said = name(undoAction, 'בטל', 'אין מה לבטל');
        undoBtn.title = said;
        undoBtn.setAttribute('aria-label', said);
    }

    const redoBtn = document.getElementById('redoBtn');
    if (redoBtn) {
        redoBtn.disabled = !redoAction;
        const said = name(redoAction, 'בצע שוב', 'אין מה לבצע שוב');
        redoBtn.title = said;
        redoBtn.setAttribute('aria-label', said);
    }
}
