// One step of undo, for the taps that destroy something.
//
// Clearing a worker's day is one tap on a row in a list of twelve, on a phone, at night.
// It will be the wrong row sometimes. Without this the only trace is a day that silently
// went back to "טרם נרשם" - and if it is noticed at all, it is noticed on payday.
//
// A confirmation dialog on every ✕ would cost a tap thirty times an evening to prevent a
// mistake that happens once a month. An undo costs nothing until it is needed.
//
// Deliberately one step deep. An undo stack over a document three people are editing at
// once would start restoring states that no longer exist by the time anyone reaches for
// it; one step, expiring quickly, only ever undoes the tap that was just made.

const UNDO_SECONDS = 12;

let undoAction = null;
let undoTimer = null;

// The record for one worker on one day, deep-copied. It has to be taken BEFORE the
// change, and it has to be a copy: the live object is about to be replaced in place.
function snapshotWorkerDay(date, layer, workerId) {
    const record = workerDay(State.schedule, date, workerId, layer);
    return record ? JSON.parse(JSON.stringify(record)) : { entries: [] };
}

// Applies a change to one worker-day and keeps the previous value on hand. The date and
// layer are captured now, not read at undo time - by then the person may have moved to
// another day, and restoring into that one would be a second mistake.
function editWithUndo(workerId, label, mutate) {
    const date = State.date;
    const layer = State.layer;
    const previous = snapshotWorkerDay(date, layer, workerId);

    State.commit(mutate());

    offerUndo(label, () => {
        State.commit(setWorkerDay(State.schedule, date, workerId, layer, previous));
    });
}

function offerUndo(label, restore) {
    undoAction = restore;

    const bar = document.getElementById('undoBar');
    if (!bar) return;

    clear(bar);
    bar.appendChild(el('span', null, label));
    bar.appendChild(button('בטל', 'btn-secondary', runUndo));
    bar.appendChild(button('✕', 'btn-icon', hideUndo, 'סגור'));
    bar.style.display = '';

    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, UNDO_SECONDS * 1000);
}

function runUndo() {
    const restore = undoAction;
    hideUndo();
    if (restore) restore();
}

function hideUndo() {
    clearTimeout(undoTimer);
    undoTimer = null;
    undoAction = null;

    const bar = document.getElementById('undoBar');
    if (bar) bar.style.display = 'none';
}
