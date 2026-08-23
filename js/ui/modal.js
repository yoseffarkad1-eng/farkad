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

    // Focus is captured before the dialog takes it, and given back when the last one
    // closes, so the keyboard carries on from where the person was.
    const observer = new MutationObserver(() => {
        const open = openModals();
        if (open.length > 0 && !focusBeforeModal) {
            focusBeforeModal = document.activeElement;
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
