// Keyboard behaviour for every dialog in the app.
//
// The seder is often written on a desktop, with two hands on a keyboard - and until now
// the only way out of any dialog was to find its ביטול button with the mouse. Escape did
// nothing, Tab wandered off into the page behind, and after closing, focus was left on
// <body> so the next Tab started again from the top of the document.
//
// Handled centrally rather than in each dialog: there are seven of them, they are opened
// from a dozen places, and the eighth one added later would have been the one that got
// forgotten.

// Every dialog closes through its own function, because closing is not always just
// hiding: the sheet re-renders the day behind it, the ask dialog has a promise waiting
// on an answer.
const MODAL_CLOSERS = {
    askModal: () => askCancel(),
    quickModal: () => closeQuickStart(),
    assignSheet: () => closeAssignSheet(),
    workerPickerModal: () => closeWorkerPicker(),
    placePickerModal: () => closePlacePicker(),
    workerFormModal: () => closeWorkerForm(),
    workerDaysModal: () => closeWorkerDays(),
    shareModal: () => closeShareModal(),
    migrationModal: () => closeMigrationModal()
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let focusBeforeModal = null;

// The last thing focused OUTSIDE every open dialog, recorded as it happens.
//
// This exists because the capture below could not be done where it was being done. The
// MutationObserver fires at the microtask checkpoint - after the WHOLE synchronous block
// that both revealed the dialog and moved focus into it:
//
//     parts.modal.style.display = 'flex';   // ask.js:80 - the mutation is only queued
//     parts.input.focus();                  // ask.js:82 - activeElement is now the input
//     ...                                   // the observer runs here
//
// so document.activeElement at that moment was a node INSIDE the dialog for the three
// dialogs that focus a field for themselves (askText, the quick start, the sign-in
// sheet). Calling .focus() on it after the dialog was hidden is a no-op, and the keyboard
// landed on <body>: askText is this app's prompt(), so renaming a site, correcting an
// amount and answering the reorder guard all dropped a person back at the top of the
// document. focusFirst() twenty lines below anticipates exactly this case - "whatever the
// dialog already focused for itself is left alone" - and the capture did not.
//
// A focusin listener is early by construction: it runs before the microtask checkpoint,
// on the focus that is being replaced. Nothing here decides WHETHER to restore; it only
// keeps a candidate that the dialogs cannot overwrite.
let lastFocusOutsideModal = null;

function openModals() {
    return Array.from(document.querySelectorAll('.modal'))
        .filter(modal => modal.style.display === 'flex');
}

// The one on top: the ask dialog is deliberately above the rest, otherwise the last one
// opened is the last one in the document.
function topModal() {
    const open = openModals();
    if (open.length === 0) return null;

    const ask = open.find(modal => modal.id === 'askModal');
    return ask || open[open.length - 1];
}

function watchModals() {
    document.addEventListener('keydown', event => {
        const modal = topModal();
        if (!modal) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeTopModal();
            return;
        }

        if (event.key === 'Tab') trapTab(event, modal);
    });

    // Clicking the backdrop closes it. The click must have started AND ended there -
    // otherwise a text selection dragged out of a field closes the dialog under way.
    document.addEventListener('mousedown', event => {
        const modal = topModal();
        if (modal && event.target === modal) modal.dataset.pressed = '1';
    });
    document.addEventListener('mouseup', event => {
        const modal = topModal();
        if (!modal) return;
        const pressed = modal.dataset.pressed;
        delete modal.dataset.pressed;
        if (pressed && event.target === modal) closeTopModal();
    });

    // Every focus that lands outside an open dialog is a candidate to come back to. The
    // openModals() test is what makes it safe to run on every focus: the dialog's own
    // field is focused while its modal is already display:flex, so it is skipped here and
    // the button that opened the dialog stays the last thing recorded.
    document.addEventListener('focusin', event => {
        const node = event.target;
        if (!node || node === document.body || node === document) return;
        if (openModals().some(modal => modal.contains(node))) return;
        lastFocusOutsideModal = node;
    });

    // Focus is captured before the dialog takes it, and given back when the last one
    // closes, so the keyboard carries on from where the person was.
    const observer = new MutationObserver(() => {
        const open = openModals();
        if (open.length > 0 && !focusBeforeModal) {
            // activeElement first, because for the ten dialogs that do NOT focus a field
            // for themselves it is still the opener and still exactly right. The tracked
            // node is the fallback for the three that do - and for the case where the
            // opener was a tap on iOS, which focuses nothing at all.
            const active = document.activeElement;
            const outside = active && active !== document.body
                && !open.some(modal => modal.contains(active));
            focusBeforeModal = outside ? active : lastFocusOutsideModal;
            focusFirst(topModal());
        } else if (open.length === 0 && focusBeforeModal) {
            if (document.contains(focusBeforeModal)) focusBeforeModal.focus();
            focusBeforeModal = null;
        }
    });

    document.querySelectorAll('.modal').forEach(modal => {
        observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
    });
}

function closeTopModal() {
    const modal = topModal();
    if (!modal) return;

    const close = MODAL_CLOSERS[modal.id];
    if (close) close();
    else modal.style.display = 'none';
}

function focusFirst(modal) {
    if (!modal) return;
    // Whatever the dialog already focused for itself is left alone - the ask dialog puts
    // the cursor in its field, and moving it to the first button would undo that.
    if (modal.contains(document.activeElement) && document.activeElement !== document.body) return;

    // A dialog that made its heading focusable (tabindex="-1") is entered at the heading,
    // the way the settings sheet and the reorder panel are: a reader is told where it has
    // arrived before the controls are named, and the dialog opens where it is read from.
    // Entering the worker's account at its first BUTTON scrolled it to its foot on a phone
    // - that button is «+ מקדמה», the last thing in a dialog taller than the screen - so
    // the person who tapped a name to see the days was shown the money buttons instead.
    // preventScroll: the heading is at the top, and a focus that scrolls is the bug.
    const heading = modal.querySelector('.modal-content > h3[tabindex="-1"]');
    if (heading) {
        heading.focus({ preventScroll: true });
        return;
    }

    const target = modal.querySelector(FOCUSABLE);
    if (target) target.focus();
}

function trapTab(event, modal) {
    const items = Array.from(modal.querySelectorAll(FOCUSABLE))
        .filter(node => node.offsetParent !== null);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (!modal.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
    }
    // Inside the dialog but not one of its controls - the heading it was entered at.
    // Tab goes on to the first control in document order by itself; shift-tab would
    // walk backwards OUT of the dialog, so it is sent to the last control instead.
    if (items.indexOf(document.activeElement) === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
    }
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}


// The sign-in sheet. Opened by the adapter, which is the only file that knows whether
// there is a cloud to sign in to at all.
function openSignInModal() {
    const error = document.getElementById('signInError');
    if (error) error.textContent = '';
    const password = document.getElementById('signInPassword');
    if (password) password.value = '';

    const modal = document.getElementById('signInModal');
    if (modal) modal.style.display = 'flex';

    const email = document.getElementById('signInEmail');
    if (email && !email.value) email.focus();
}

function closeSignInModal() {
    const modal = document.getElementById('signInModal');
    if (modal) modal.style.display = 'none';
    const password = document.getElementById('signInPassword');
    if (password) password.value = '';
}
