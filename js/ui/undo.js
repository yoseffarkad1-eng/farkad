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
function editWithUndo(workerId, label, mutate) {
    const date = State.date;
    const layer = State.layer;
    const previous = snapshotWorkerDay(date, layer, workerId);

    // No undo bar for an edit that did not happen. commit() has already put the screen
    // back and said why; offering "undo" over that would name a change nobody made.
    if (!State.commit(mutate())) return false;

    // Taken AFTER the commit, so redo restores exactly what the edit produced rather
    // than being a guess at how to repeat it.
    const after = snapshotWorkerDay(date, layer, workerId);

    offerUndo(label,
        () => State.commit(setWorkerDay(State.schedule, date, workerId, layer, previous)),
        () => State.commit(setWorkerDay(State.schedule, date, workerId, layer, after)));
    return true;
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
        bar.appendChild(button('בטל', 'btn-secondary', runUndo));
        bar.appendChild(button('✕', 'btn-icon', dismissUndoBar, 'סגור'));
        bar.style.display = '';

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
function renderUndoButton() {
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
        undoBtn.disabled = !undoAction;
        undoBtn.title = undoAction ? `בטל: ${undoLabel}` : 'אין מה לבטל';
    }

    const redoBtn = document.getElementById('redoBtn');
    if (redoBtn) {
        redoBtn.disabled = !redoAction;
        redoBtn.title = redoAction ? `בצע שוב: ${undoLabel}` : 'אין מה לבצע שוב';
    }
}
