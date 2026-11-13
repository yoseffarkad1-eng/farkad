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
        list: document.getElementById('askList'),
        input: document.getElementById('askInput'),
        error: document.getElementById('askError'),
        ok: document.getElementById('askOk'),
        cancel: document.getElementById('askCancel'),
        choices: document.getElementById('askChoices'),
        footer: document.getElementById('askFooter')
    };
}

// ---------------------------------------------------------------- a question that is held
//
// Three things a confirmation can ask for, and only one asks for them so far - «הכל חופש»
// (markAllHoliday, js/ui/day.js), a whole day of men marked at one press. A question that
// does not ask for them is exactly what it was before them.
//
//   names   the men it is about, one to a line, in a list that scrolls inside the dialog
//           when it is long. textContent only: a name is never markup.
//   danger  the confirming button is the destructive kind (.btn-danger), and the dialog
//           opens on «ביטול» - a key pressed on an opened dialog answers the safe way.
//           A question with names or danger opens at its TOP all the same (askShowTop):
//           taller than the screen, it is read from the question down.
//   hold    for that many milliseconds after it opens the question cannot be answered at
//           all: the confirming button is disabled, and «ביטול», Escape and a tap beside
//           the dialog do nothing. The second tap of a double tap lands inside it - on the
//           dialog that has just come up under the finger - and it must neither confirm the
//           question nor close it before it has been read. Measured on v190 at 440 (the
//           owner's phone): the second tap of a double tap on «הכל חופש» closed the question
//           before it could be seen.
//   from    {x, y}, where the finger that opened the question was. The confirming button is
//           kept ASK_KEEP_AWAY pixels from it (askKeepAway), so a slow second tap - or a
//           thumb that comes down again where it was - lands on something that does not
//           answer yes.
//
// AND A CHOICE THAT IS HELD (askChoice's `apart`, `hold`, `from` and a choice's `next`): «עוד ⋯»
// at the foot of the day (openDayMore, js/ui/day.js), the one door to «הכל חופש» since the
// owner's second look at it - the button itself is on no screen any more.
//   apart   the answers a finger's width (ASK_KEEP_AWAY) apart, not the usual 22px, so a
//           finger meant for «סגור» is not on the answer beside it
//   hold    for that many milliseconds nothing answers: the first answer is disabled, and
//           every answer, Escape and a tap beside the dialog do nothing - the second tap of
//           a double tap on «עוד ⋯» lands on the menu that has just come up under it - and
//           the focus is on the LAST answer, the safe one, as a held question's is on «ביטול»
//   from    where the finger that opened it was: the first answer is kept ASK_KEEP_AWAY from
//           it (askChoiceAway), turning the column round or laying the two side by side
//   next    on a choice: chosen, it goes STRAIGHT ON to the next question, in the same dialog
//           and the same task, given where the finger was (askPointOf). The dialog is never
//           shut between the two: the moment nothing is open is the moment the day follows
//           the calendar (watchDayRollover, js/app.js), and a menu opened on Tuesday before
//           midnight would have asked its question about Wednesday.
let askHoldUntil = 0;
let askHoldTimer = null;

// The same clock as the day's double-tap guard (tapClock, js/ui/day.js).
function askClock() {
    return typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now() : Date.now();
}

function askHeld() {
    return askHoldUntil > 0 && askClock() < askHoldUntil;
}

// `held` is the button that cannot be pressed meanwhile: the confirming one, or a menu's first.
function askHold(parts, ms, held) {
    const button = held || parts.ok;
    askHoldUntil = askClock() + ms;
    button.disabled = true;
    clearTimeout(askHoldTimer);
    askHoldTimer = setTimeout(() => {
        askHoldTimer = null;
        askHoldUntil = 0;
        button.disabled = false;
    }, ms);
}

// Where a finger pressed `button`: the tap itself, or - a key, or a click with no point - the
// middle of the button.
function askPointOf(event, button) {
    if (event && event.detail !== 0 && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        && (event.clientX !== 0 || event.clientY !== 0)) return { x: event.clientX, y: event.clientY };
    if (!button || typeof button.getBoundingClientRect !== 'function') return null;
    const box = button.getBoundingClientRect();
    return box.width > 0 && box.height > 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
}

// askKeepAway for a menu: its FIRST answer out from under `point`. The column as every menu
// has it, the column turned round, the two side by side, and side by side the other way - the
// first that leaves the first answer ASK_KEEP_AWAY from the point, or failing all four the one
// that leaves it furthest. A phone turned sideways is why there are four: there «עוד ⋯» rests
// level with where the menu's column comes down (measured at 568x320 and 667x375, 20-28px
// from either place in the column), and only beside the other answer is it far from it.
function askChoiceAway(parts, point) {
    const box = parts.choices;
    const first = box && box.querySelector('button');
    if (!first || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const away = () => {
        const at = first.getBoundingClientRect();
        return Math.hypot(Math.max(at.left - point.x, 0, point.x - at.right), Math.max(at.top - point.y, 0, point.y - at.bottom));
    };
    const arrange = classes => {
        box.classList.remove('ask-flip', 'ask-across');
        classes.forEach(name => box.classList.add(name));
    };
    let best = null;
    for (const classes of [[], ['ask-flip'], ['ask-across'], ['ask-across', 'ask-flip']]) {
        arrange(classes);
        const distance = away();
        if (distance >= ASK_KEEP_AWAY) return;
        if (!best || distance > best.distance) best = { classes, distance };
    }
    arrange(best.classes);
}

// A finger's width, the unit every target in this app is measured in.
const ASK_KEEP_AWAY = 48;

// Puts the confirming button out from under `point`. The two buttons are tried side by side
// as every question has them (the confirming one first, on the right), then the other way
// round, then one above the other, both ways - and the first arrangement that leaves the
// confirming button at least ASK_KEEP_AWAY from the point is kept; failing all four, the
// one that leaves it furthest. Measured, not assumed: what is under the finger depends on
// the phone, the size of the text, how long the list is and how far the day was scrolled.
function askKeepAway(parts, point) {
    const actions = parts.ok && parts.ok.parentElement;
    if (!actions || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const away = () => {
        const box = parts.ok.getBoundingClientRect();
        const dx = Math.max(box.left - point.x, 0, point.x - box.right);
        const dy = Math.max(box.top - point.y, 0, point.y - box.bottom);
        return Math.hypot(dx, dy);
    };
    const arrange = classes => {
        actions.classList.remove('ask-swap', 'ask-stack');
        classes.forEach(name => actions.classList.add(name));
    };
    let best = null;
    for (const classes of [[], ['ask-swap'], ['ask-stack'], ['ask-stack', 'ask-swap']]) {
        arrange(classes);
        const distance = away();
        if (distance >= ASK_KEEP_AWAY) return;
        if (!best || distance > best.distance) best = { classes, distance };
    }
    arrange(best.classes);
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
        parts.choices.classList.remove('ask-apart', 'ask-flip', 'ask-across');
    }
    // And what a held question left behind (names, danger, hold, from): the next question
    // starts with no list, an ordinary button that can be pressed, and the usual order.
    clearTimeout(askHoldTimer);
    askHoldTimer = null;
    askHoldUntil = 0;
    if (parts.ok) {
        parts.ok.disabled = false;
        parts.ok.classList.remove('btn-danger');
        parts.ok.style.transition = '';
        if (parts.ok.parentElement) parts.ok.parentElement.classList.remove('ask-swap', 'ask-stack');
    }
    if (parts.list) {
        parts.list.textContent = '';
        parts.list.style.display = 'none';
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
    // A held question's three extras (see askHold above). Absent, none of this runs.
    // The destructive kind FIRST, before anything below reads the layout (the list's scrollTop
    // does). Opened from a shut dialog it made no difference; opened from the day's menu, whose
    // dialog stays open into it (openDayMore, js/ui/day.js), that read drew the confirming
    // button once in the ordinary accent and `button`'s 120ms background transition faded it to
    // the destructive one under the reader's eyes - 3.3:1 at 60ms, measured.
    //
    // AND WITH NO FADE AT ALL (v194). Moving the class up was not enough: the button is shown
    // again - by the menu's answer, or by askResetExtras above - with its own display going
    // from none to shown, and Chromium fades its background from the ordinary accent to the
    // destructive one all the same (transitionrun on background-color with no layout read in
    // between, measured on round two's own tree and on this one; the question's words were
    // 3.3:1 on it 60 ms in, at 375x667 light, whenever the reader's frame came that early).
    // A destructive answer has no colour to arrive from: its transition is off while it is one.
    if (settings.danger) {
        parts.ok.style.transition = 'none';
        parts.ok.classList.add('btn-danger');
    }
    const named = Array.isArray(settings.names) && settings.names.length > 0 && Boolean(parts.list);
    if (named) {
        settings.names.forEach(name => parts.list.appendChild(el('li', null, String(name))));
        parts.list.style.display = '';
        parts.list.scrollTop = 0;
    }
    parts.modal.style.display = 'flex';
    const focus = settings.danger ? parts.cancel : parts.ok;
    if (settings.danger || named) {
        // OPENED WHERE IT IS READ FROM: its top. A focus that scrolls is the bug (focusFirst,
        // js/ui/modal.js, says it of the worker's account). A question that names the men is
        // taller than the screen at twice the text size on a 320 or a 375, and «ביטול», at its
        // foot, scrolled it down as it opened: «בטוח שכולם בחופש?», the day and the count were
        // above the glass (measured on the first build of this question: 421 to 514px down at
        // 320x568, 395 at 375x667). The answers are under it, a scroll away.
        focus.focus({ preventScroll: true });
        askShowTop(parts);
    } else {
        focus.focus();
    }
    if (settings.from) askKeepAway(parts, settings.from);
    if (settings.hold > 0) askHold(parts, settings.hold);

    return new Promise(resolve => { askResolve = resolve; });
}

// The dialog at its top - after the focus, which on a browser that does not know
// preventScroll still scrolls to the button it was given.
function askShowTop(parts) {
    const content = parts.modal && typeof parts.modal.querySelector === 'function'
        ? parts.modal.querySelector('.modal-content') : null;
    if (content) content.scrollTop = 0;
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
    // A choice is its label, or { label, aria, next } - an accessible name of its own, and a
    // question it goes straight on to (see the held choice above).
    (settings.choices || []).forEach((choice, index) => {
        const label = choice && typeof choice === 'object' ? choice.label : choice;
        const btn = document.createElement('button');
        btn.type = 'button';
        if (index > 0) btn.className = 'btn-secondary';
        btn.textContent = label;
        if (choice && typeof choice === 'object' && choice.aria) btn.setAttribute('aria-label', choice.aria);
        btn.onclick = event => {
            // Inside a menu's hold nothing answers it (askHold).
            if (askHeld()) return;
            parts.ok.style.display = '';
            if (choice && typeof choice === 'object' && typeof choice.next === 'function') {
                choice.next(askPointOf(event, btn));
                return;
            }
            askClose(label);
        };
        parts.choices.appendChild(btn);
    });
    if (settings.apart) parts.choices.classList.add('ask-apart');

    askValidate = null;
    parts.modal.style.display = 'flex';
    const answers = [...parts.choices.querySelectorAll('button')];
    const first = answers[0];
    if (settings.hold > 0 || settings.from) {
        // A held menu opens on its LAST answer, the safe one, and at its top.
        const safe = answers[answers.length - 1];
        if (safe) safe.focus({ preventScroll: true });
        askShowTop(parts);
        if (settings.from) askChoiceAway(parts, settings.from);
        if (settings.hold > 0 && first) askHold(parts, settings.hold, first);
    } else if (first) {
        first.focus();
    }

    return new Promise(resolve => { askResolve = resolve; });
}

function askAccept() {
    // Inside a question's hold nothing answers it (askHold).
    if (askHeld()) return;
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
    // «ביטול», Escape and a tap beside the dialog alike (js/ui/modal.js closes it here).
    if (askHeld()) return;
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
