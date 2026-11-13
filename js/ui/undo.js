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

    offerUndo(label,
        () => State.commit(setWorkerDay(State.schedule, date, workerId, layer, previous)),
        () => State.commit(setWorkerDay(State.schedule, date, workerId, layer, after)));
    return true;
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
    restore();

    undoAction = null;
    redoAction = replay || null;
    if (redoAction) redoAction._replay = restore;
    renderUndoButton();
}

function runRedo() {
    const replay = redoAction;
    if (!replay) return;
    const restore = replay._replay;

    replay();

    redoAction = null;
    undoAction = restore || null;
    if (undoAction) undoAction._replay = replay;
    renderUndoButton();
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
