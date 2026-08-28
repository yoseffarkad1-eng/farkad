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
        cancel: document.getElementById('askCancel'),
        choices: document.getElementById('askChoices'),
        footer: document.getElementById('askFooter')
    };
}

// Shared cleanup for the optional pieces: every ask starts from a dialog with no
// leftover choice buttons and no leftover footer from the question before it.
function askResetExtras(parts, settings) {
    // A question opened over an unanswered question: the displaced promise must not
    // hang forever - an awaiting caller (the reorder exit guard) would suspend with it
    // and pin the whole app to one tab. Resolved as a dismissal, which every caller
    // already treats as "do nothing".
    if (askResolve) {
        const stale = askResolve;
        askResolve = null;
        stale(null);
    }
    // askChoice hides the confirm button; every other entry point must get it back, or
    // one interrupted choice leaves every later dialog with no way to say yes.
    if (parts.ok) parts.ok.style.display = '';
    if (parts.choices) {
        parts.choices.textContent = '';
        parts.choices.style.display = 'none';
    }
    if (parts.footer) {
        parts.footer.textContent = (settings && settings.footer) || '';
        parts.footer.style.display = settings && settings.footer ? '' : 'none';
    }
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
    // Reset every call: the field is shared, and an inputmode left over from a number
    // question would give the next NAME question a digit keyboard.
    if (settings.inputmode) parts.input.setAttribute('inputmode', settings.inputmode);
    else parts.input.removeAttribute('inputmode');
    parts.input.dir = settings.dir || '';
    parts.input.style.display = '';
    parts.error.textContent = '';
    parts.ok.textContent = settings.ok || 'שמור';
    parts.cancel.style.display = '';
    parts.cancel.textContent = 'ביטול';

    askResetExtras(parts, settings);
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

    askResetExtras(parts, settings);
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

    askResetExtras(parts, settings);
    askValidate = null;
    parts.modal.style.display = 'flex';
    parts.ok.focus();

    return new Promise(resolve => { askResolve = resolve; });
}

// One question, several named answers. Resolves with the chosen label, or null when
// dismissed (Escape, the backdrop) - which callers treat as the do-nothing answer, so
// a slipped finger never saves and never discards.
function askChoice(options) {
    const parts = askElements();
    if (!parts.modal || !parts.choices) return Promise.resolve(null);

    const settings = options || {};
    parts.title.textContent = settings.title || '';
    parts.message.textContent = settings.message || '';
    parts.message.style.display = settings.message ? '' : 'none';
    parts.input.style.display = 'none';
    parts.error.textContent = '';
    askResetExtras(parts, settings);
    parts.ok.style.display = 'none';
    parts.cancel.style.display = 'none';

    parts.choices.style.display = '';
    (settings.choices || []).forEach((label, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        if (index > 0) btn.className = 'btn-secondary';
        btn.textContent = label;
        btn.onclick = () => {
            parts.ok.style.display = '';
            askClose(label);
        };
        parts.choices.appendChild(btn);
    });

    askValidate = null;
    parts.modal.style.display = 'flex';
    const first = parts.choices.querySelector('button');
    if (first) first.focus();

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
    const parts = askElements();
    if (parts.choices && parts.choices.style.display !== 'none') {
        parts.ok.style.display = '';
        askClose(null);
        return;
    }
    askClose(parts.input.style.display === 'none' ? false : null);
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
