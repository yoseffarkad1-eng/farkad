// The app's own prompt, confirm and alert.
//
// The browser's built-in ones are not reliably available. Inside an embedded frame they
// are ignored outright - the call returns and nothing is shown, so "add a site" appears
// to do nothing at all and there is no error to see. Some mobile browsers also let a
// person tick "block dialogs" permanently after the third one, which on a screen that
// asks for a name thirty times an evening is a matter of when, not if.
//
// So every question the app asks is asked inside the page. As a side effect it can do
// things the built-ins cannot: validate a name without closing, and show the error next
// to the field instead of stacking a second dialog on top of the first.

let askResolve = null;
let askValidate = null;

function askElements() {
    return {
        modal: document.getElementById('askModal'),
        title: document.getElementById('askTitle'),
        message: document.getElementById('askMessage'),
        input: document.getElementById('askInput'),
        error: document.getElementById('askError'),
        ok: document.getElementById('askOk'),
        cancel: document.getElementById('askCancel')
    };
}

// Asks for a line of text. Resolves with the trimmed string, or null if cancelled.
// `validate` returns an error message to keep the dialog open, or null to accept.
function askText(options) {
    const parts = askElements();
    if (!parts.modal) return Promise.resolve(null);

    const settings = options || {};
    parts.title.textContent = settings.title || '';
    parts.message.textContent = settings.message || '';
    parts.message.style.display = settings.message ? '' : 'none';
    parts.input.value = settings.value || '';
    parts.input.placeholder = settings.placeholder || '';
    parts.input.style.display = '';
    parts.error.textContent = '';
    parts.ok.textContent = settings.ok || 'שמור';
    parts.cancel.style.display = '';
    parts.cancel.textContent = 'ביטול';

    askValidate = settings.validate || null;
    parts.modal.style.display = 'flex';
    // Focused and selected: renaming a site is usually a small correction, not a retype.
    parts.input.focus();
    parts.input.select();

    return new Promise(resolve => { askResolve = resolve; });
}

// Resolves true or false. The confirming button carries the actual verb - "לארכיון",
// not "אישור" - because that is what is read before tapping.
function askConfirm(options) {
    const parts = askElements();
    if (!parts.modal) return Promise.resolve(false);

    const settings = options || {};
    parts.title.textContent = settings.title || '';
    parts.message.textContent = settings.message || '';
    parts.message.style.display = settings.message ? '' : 'none';
    parts.input.style.display = 'none';
    parts.error.textContent = '';
    parts.ok.textContent = settings.ok || 'אישור';
    parts.cancel.style.display = '';
    parts.cancel.textContent = settings.cancel || 'ביטול';

    askValidate = null;
    parts.modal.style.display = 'flex';
    parts.ok.focus();

    return new Promise(resolve => { askResolve = resolve; });
}

// Says something and waits for nothing. Replaces alert(), which in an embedded frame
// tells the person nothing at all.
function askTell(options) {
    const parts = askElements();
    if (!parts.modal) return Promise.resolve(true);

    const settings = typeof options === 'string' ? { message: options } : (options || {});
    parts.title.textContent = settings.title || '';
    parts.message.textContent = settings.message || '';
    parts.message.style.display = '';
    parts.input.style.display = 'none';
    parts.error.textContent = '';
    parts.ok.textContent = settings.ok || 'סגור';
    parts.cancel.style.display = 'none';

    askValidate = null;
    parts.modal.style.display = 'flex';
    parts.ok.focus();

    return new Promise(resolve => { askResolve = resolve; });
}

function askAccept() {
    const parts = askElements();
    const typing = parts.input.style.display !== 'none';
    const value = typing ? parts.input.value.trim() : true;

    if (typing && askValidate) {
        const error = askValidate(value);
        if (error) {
            // Kept open with the error under the field: closing and reopening loses what
            // was typed, which is the thing that needed correcting.
            parts.error.textContent = error;
            parts.input.focus();
            return;
        }
    }

    askClose(typing ? value : true);
}

function askCancel() {
    askClose(askElements().input.style.display === 'none' ? false : null);
}

function askClose(result) {
    const parts = askElements();
    if (parts.modal) parts.modal.style.display = 'none';

    const resolve = askResolve;
    askResolve = null;
    askValidate = null;
    if (resolve) resolve(result);
}

function askKeydown(event) {
    if (event.key === 'Enter') { event.preventDefault(); askAccept(); }
    if (event.key === 'Escape') { event.preventDefault(); askCancel(); }
}
