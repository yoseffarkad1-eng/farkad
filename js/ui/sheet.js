// The assign sheet, the two pickers, and copying a day in - the WRITE half of the day
// screen. Split out of day.js when the pair passed eight hundred lines: day.js draws the
// day, this file changes it. Same globals, same rules: classic script, no modules.

let pickerPlaceId = null;

// ---------------------------------------------------------------- assign sheet

// The sheet advances to the next unfilled worker by itself. Copying a column of thirty
// names off a sheet of paper is one continuous motion, and closing the dialog after each
// one turns one tap per worker into three.
let sheetWorkerId = null;

// THE DAY THE SHEET NAMES, read once, when it opens (the second review of the hotfix, c1).
//
// Its meta line says «יום שלישי 10/11» and is the only thing on the screen saying which day
// is being written. Every control in it used to write to State.date as it stood at the tap,
// and the two could part: the sheet shut after midnight with its «שעות נוספות» box still
// holding the focus - Escape, a «סגור» that takes no focus, the backdrop - and the follow of
// the calendar (js/app.js) moved State.date in the close's own turn, before the box let go of
// the focus; its `change` came after, and the hours typed on Tuesday were taken off Tuesday
// and written onto Wednesday, rate-stamped and queued, over Wednesday's regular day. So the
// day and the layer are taken when the sheet is opened - from the surface that opened it, or
// the day on screen - and the meta line, the tiles, the rates, the hours, «נעדר», the walk
// to the next man and the step on ↶ are all of THAT day, by construction, whatever State.date
// does meanwhile. Null while the sheet is shut.
let sheetDate = null;
let sheetLayer = null;

function sheetDay() {
    return { date: sheetDate || State.date, layer: sheetLayer || State.layer };
}

// OPENED FROM A MAN'S ROW ON A SITE, THE SHEET IS ABOUT HIM (v167).
//
// The walk above is the evening's run down the roster, and the tally «נרשמו X מתוך Y» and
// the by-worker list still open the sheet for it. A man's NAME on a site's row (js/ui/day.js,
// renderAssignmentRow) is tapped to change HIS day - his rate, an absence, a site - and
// walking on to somebody else after «נעדר», or after he is put back on a site, leaves the
// person looking at a man he never asked about. So opened that way the sheet stays on him
// (advanceSheet) and has no forward button. The owner's amendment to the declutter,
// 2026-11-04.
let sheetStays = false;

// A DOUBLE TAP ON A NAME IS ONE TAP (v167). The sheet opens over the row the moment the name
// is tapped, so the second tap of a double tap - or a bounce - lands on whatever the sheet
// has put under the finger: a site's tile (a second site for him, or his own site taken
// off), a rate, or - where the sheet opens below the finger - the backdrop above it, which
// closes it (js/ui/modal.js). It is the ✕'s trap one layer up (secondTapTooSoon,
// js/ui/day.js), and it gets the same answer: for DOUBLE_TAP_GUARD_MS after the sheet is
// opened from a row, a finger on the sheet does nothing - its press, its release and its
// click stop at the sheet. A keyboard's click (detail 0) is never a bounce, so a digit or
// Enter still acts at once. Measured in tests/declutter.browser.mjs, both ways.
//
// AND SO DOES EVERY WRITER A TAP OPENS (the review of the hotfix, R2). The sheet opened from a
// man's row was the only one guarded. A name in «לא נרשמו» opens «לאן הלך», a site's «+» opens
// its picker - and the second tap of a double tap on either landed on the site or the «+ הוסף»
// the surface had just put under the finger, and wrote a rate-stamped day nobody chose.
// Measured in Chromium at four phone sizes: 14 double taps on a name of 64, 16 on a site's
// «+» of 24. So each of these, opened by a tap, takes no finger on its WRITING controls for
// DOUBLE_TAP_GUARD_MS, the same way: press, release and click stop at the surface, and a
// keyboard's click still acts at once. The window is time and not place: a site the person
// MEANS inside it is ignored too - and nothing is written by that, and the surface stays open
// on the same man, so the next tap is the same tap again.
//
// THE GUARD COVERS THE WRITING CONTROLS ONLY, and the backdrop (the second review of the
// hotfix). It stopped the whole surface, and a «סגור» tapped inside the window - or the search
// box, or «נקה» - did nothing and said nothing, the picker left open over the day. Each surface
// names what writes (`writes`, a selector), and a press anywhere else on it is a press. The
// backdrop stays guarded: where a surface opens below the finger, the second tap of the double
// tap that opened it comes down on the backdrop above it, which would shut it (v167).
//
// THE SHEET THAT WALKS THE EVENING NEVER SWALLOWS A DELIBERATE TAP (the second review of the
// hotfix, BLOCKER). The tally and a row of «לפי עובדים» open the sheet that walks, and a site,
// «נעדר» or «דלג» moves it on to the next man with the same tiles in the same places: a double
// tap placed him AND the next man (R3). Round one answered with DOUBLE_TAP_GUARD_MS after every
// move - and at a person's pace, a tap every 400-600 ms, a deliberate tap fell inside it, was
// swallowed without a sign, and every later site went to the man BEFORE the one it was meant
// for: a wrong man's pay (probe-walk, 4 men: אמיר, אמיר, בסאם, בסאם at the four taps). A walk
// cannot be guarded by a window a deliberate tap can fall into, because a tap it swallows does
// not leave the walk where it was - it shifts every tap after it by one man. So on the walking
// sheet the window is a BOUNCE, and only after a MOVE: a press less than WALK_BOUNCE_MS after the
// press of the tap that last moved the sheet to a man - opened it on him, or walked it on to him -
// is the same finger again and does nothing; any press later than that is a tap; a write that
// leaves the sheet on the same man arms nothing. Measured on the presses' own clock (the
// pointerdown's timeStamp, the time the touch was made, which a busy page does not compress:
// with the page held 120 ms per click, two taps 150 ms apart were handled 316 ms apart by
// performance.now() and stamped 346 ms apart, the gap Playwright actually sent), not on the
// page's clock at the handler. 300 ms: a double tap or a bounce is 100-250 ms between presses,
// and a man read off the paper and his site chosen takes longer than 350 - the boundary sits
// halfway, 50 ms clear of each. And not a window over the slide. The slide the advance asks for
// (.sheet-swap, css/app.css: 32 px over 600 ms) does not run on the phones at all - the sheet's
// entrance in css/readability.css is set on every .modal-content, later in the cascade, and takes
// its place; what moves is the name's flash. Forced to run, it puts the next man's tile 10 px
// from its place at 300 ms and 7 px at 350, on tiles 139-199 px wide with 8 px between them: a
// tap at that pace lands on the tile it was aimed at either way (tests/doubletap.browser.mjs
// measures both, at 320, 375 and 440). The sheet a man's row opens keeps v167's
// DOUBLE_TAP_GUARD_MS at its opening, as it was: it does not walk, so nothing shifts under it.
//
// A BOUNCE IS THE SAME FINGER IN THE SAME PLACE (the third review of the hotfix). The window was
// time alone, so a press on ANOTHER site less than WALK_BOUNCE_MS after the move was taken for the
// bounce of the one before - and a tap it swallows shifts every tap after it by one man, exactly
// as the window it replaced did. A bounce comes down where the press it repeats came down: so it
// is a press inside the control that press hit, as that control stood then (sameFingerAgain,
// below), and soon enough after it; a press on any other control is a tap whatever its time. What
// is left the reviewers measured and no window can take back: four taps on ONE tile 200-250 ms
// apart, meant for four men, are on the presses' own clock and on the glass the very double taps
// the walk must take as one man - the second and the fourth are dropped, and the next site tapped
// goes to the man before. Their "300 ms" double tap reaches the page 329-332 ms apart (measured):
// the spacing at which a deliberate pace must place every man. The boundary stays where the spec
// put it, halfway between a double tap (100-250) and a deliberate pace (350 and slower); the sheet
// says who it is waiting for in its title, and the step on ↶ names the last man placed.
const WALK_BOUNCE_MS = 300;
let sheetGuardUntil = 0;
// The press of the tap that last moved the walking sheet to a man (opened it, walked it on) -
// when and where it came down (lastPress, below); null when none has (opened by code, by the
// keyboard, or from his row).
let sheetBounceFrom = null;
let placePickerGuardUntil = 0;
let workerPickerGuardUntil = 0;
const fingerGuarded = new Set();

function sheetClock() {
    return typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now() : Date.now();
}

// THE PRESS OF THE TAP UNDER WAY: when the finger (or the mouse) went down - the timeStamp of its
// pointerdown, the time the touch was made - where on the glass, and the rectangle of the control
// it came down on, as that control stood at the press (the press point itself, BOUNCE_REACH each
// way, where it came down on none). Every press is seen here first - the window, in the capture
// phase - so a surface the press OPENS knows when and where its opener was pressed, and so does
// the undo bar that comes up under it (js/ui/undo.js). A press is the tap's until the turn after
// its click (or its cancel); an event with no press of its own open - a click from code - is
// taken as pressed where and when it happened.
const PRESSED_CONTROL = 'button, a, input, select, textarea, label, [role="button"]';
// How far outside the control it hit a bounce may still come down (CSS px): a finger's own jitter.
const BOUNCE_REACH = 8;
let lastPress = null;

function pressArea(node, x, y) {
    const control = node && node.closest ? node.closest(PRESSED_CONTROL) : null;
    if (control && control.getBoundingClientRect) {
        const box = control.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    }
    return { left: x, top: y, right: x, bottom: y };
}

// A PRESS THAT COMES DOWN ON WHAT WAS NOT THERE IS THE PRESS BEFORE IT, AGAIN (v194).
//
// Every guard above and in js/ui/day.js is a surface saying «I have just come up under a finger».
// None of them is the page saying «what was under the finger has just GONE» - and the second tap
// of a double tap fell through every surface a first tap shut. Measured in Chromium with a touch
// screen, 150 ms apart (docs/releases.md, v192, STILL WRONG): the walking sheet's last waiting man
// placed, the sheet shut, and the second tap took another man off his site by the ✕ that was
// under the tile; the sheet's «סגור», and the second tap on «מהיום הקודם» copied the previous day
// into every waiting man; and in the sheet a man's row opens, once its opening window was over,
// «נעדר» marked and unmarked him (his site gone), a site was added and taken off again, and
// «שעות נוספות» - the row redrawn with the hours box in it - landed on «יום כפול».
//
// They are one fault, and it is not about sheets: the first tap REPLACED what was under the
// finger - shut the surface, or redrew the control - and the second press came down, in the same
// place and at once, on something the person had never seen there. Nobody aims at what appeared
// under their finger less than a third of a second ago. So the rule is the page's, in one place,
// and names no surface: a press that comes down on the same spot again (sameSpotAgain, below -
// inside the rectangle the control the press before it hit stood in, less than WALK_BOUNCE_MS
// after it, on the presses' own clock) and on a control that is NOT the one that press came down
// on is spent. Its whole tap - press, release, the mouse events made of it, the click - stops at
// the document and reaches no control, no backdrop and no drag. It covers every surface that
// shuts and every one that opens (the dialogs of js/ui/modal.js and js/ui/ask.js, the sheets, ⋯,
// the cards, the menus, the undo bar, a row that slides up under a ✕) because it asks none of them.
//
// WHAT IT LEAVES ALONE. A press on the SAME control, still there: a text box (a double tap
// selects a word), a seat. A press on that control DRAWN AGAIN AS IT WAS - the same rectangle to
// the pixel and the same markup, word for word (sameControlAgain): the day's arrows and a card's
// month arrows are built anew by every render, and two quick taps on one are two days, as they
// always were. A press anywhere else, whatever its time. A press WALK_BOUNCE_MS or more after
// the one before, wherever it is. A keyboard's click and a click from code have no press and are
// never spent. And a spent press is not a press to repeat: the next one is measured from the
// last press that was let through, so a burst is one tap and the tap after the burst is a tap.
//
// WHAT IT DOES NOT SEE, said plainly: a mouse's double click (below, at the press). And a
// control that stays the same node, or is drawn again with the same words in the same
// rectangle, and means something else under the finger - the next man's tile in the walking
// sheet, the next man's «נעדר» in a tray. Those are the surfaces' own guards (the walk's bounce,
// the trays' clock), which stay exactly as they are.
//
// The surfaces' own guards stay as they are - they are wider (DOUBLE_TAP_GUARD_MS, a whole
// tray) where a surface asked for more.
let tapBefore = null;

if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('pointerdown', event => {
        const target = event.target;
        const control = target && target.closest ? target.closest(PRESSED_CONTROL) : null;
        const press = { stamp: event.timeStamp, x: event.clientX, y: event.clientY,
            area: pressArea(target, event.clientX, event.clientY), open: true,
            node: control || target || null, markup: control ? control.outerHTML : null, spent: false };
        lastPress = press;
        // A second finger of a pinch is nobody's double tap.
        if (event.isPrimary === false) return;
        // A FINGER'S RULE (and a pen's). A mouse is not spent and is not a press to repeat: its
        // pointer is seen where it stands, it has no bounce, and its double click is covered,
        // as before, where a surface has its own guard (guardFingersOn, secondTapTooSoon).
        if (event.pointerType === 'mouse') { tapBefore = null; return; }
        if (tapBefore && press.node !== tapBefore.node && sameSpotAgain(press, tapBefore)
            && !sameControlAgain(press, tapBefore)) press.spent = true;
        else tapBefore = press;
    }, true);
    window.addEventListener('pointercancel', () => { if (lastPress) lastPress.open = false; }, true);
    window.addEventListener('click', () => {
        const press = lastPress;
        if (press) setTimeout(() => { press.open = false; }, 0);
    }, true);
    // The spent press's events stop HERE: on the document, in the capture phase - after every
    // listener of the window has seen them (the press's own clock above, the calendar's follow in
    // js/app.js, the bars), before any control, any surface's guard and the backdrop's closer.
    // The touch itself is not prevented: a finger that goes on to swipe still scrolls the page.
    const spend = event => {
        const press = lastPress;
        if (!press || !press.spent || !press.open || !(event.detail > 0 || event.type.startsWith('pointer'))) return;
        event.stopImmediatePropagation();
        if (event.type !== 'pointerdown' && event.type !== 'pointerup') event.preventDefault();
    };
    if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(type => document.addEventListener(type, spend, true));
    }
}
// The press of the tap whose click is being handled now, or null (a keyboard, code).
function openPress() {
    return lastPress && lastPress.open ? lastPress : null;
}
// The press `event` belongs to: the open one when the event is its own, else the event itself.
function pressOf(event) {
    const press = lastPress;
    if (press && press.open && press.stamp <= event.timeStamp + 1 && event.timeStamp - press.stamp < 1000) return press;
    const x = typeof event.clientX === 'number' ? event.clientX : 0;
    const y = typeof event.clientY === 'number' ? event.clientY : 0;
    return { stamp: event.timeStamp, x, y, area: pressArea(event.target, x, y), open: false };
}
// THE SAME FINGER AGAIN: `press` came down inside the control `before` came down on (as it stood
// then, BOUNCE_REACH around it), less than WALK_BOUNCE_MS after it, on the presses' own clock. A
// bounce, or the second tap of a double tap: it repeats a press, where that press was. A press
// anywhere else, or later, is a tap of its own.
function sameFingerAgain(press, before) {
    if (!press || !before || !before.area) return false;
    const after = press.stamp - before.stamp;
    if (!(after >= 0 && after < WALK_BOUNCE_MS)) return false;
    const area = before.area;
    return press.x >= area.left - BOUNCE_REACH && press.x <= area.right + BOUNCE_REACH
        && press.y >= area.top - BOUNCE_REACH && press.y <= area.bottom + BOUNCE_REACH;
}

// THE SAME SPOT AGAIN, for the page's rule (tapBefore, above): less than WALK_BOUNCE_MS after
// `before`, and either INSIDE the rectangle the control it hit stood in - no reach around it, so
// a quick tap on the control NEXT to that one, which was there all along, is never taken for it -
// or within a finger's jitter (BOUNCE_REACH) of the very point. And not when one of the two
// controls is inside the other and the earlier one is still on the page: a box and its own
// label, a row and its button - the pressed control is still what is under the finger.
function sameSpotAgain(press, before) {
    if (!press || !before || !before.area) return false;
    const after = press.stamp - before.stamp;
    if (!(after >= 0 && after < WALK_BOUNCE_MS)) return false;
    const area = before.area;
    const inside = press.x >= area.left && press.x <= area.right && press.y >= area.top && press.y <= area.bottom;
    const near = Math.abs(press.x - before.x) <= BOUNCE_REACH && Math.abs(press.y - before.y) <= BOUNCE_REACH;
    if (!inside && !near) return false;
    const a = before.node, b = press.node;
    if (a && b && a.isConnected && typeof a.contains === 'function' && (a.contains(b) || b.contains(a))) return false;
    return true;
}

// THE SAME CONTROL, DRAWN AGAIN AS IT WAS: both presses came down on a control, the two controls
// stand in the same rectangle (to the pixel) and their markup is the same, word for word - what
// a render leaves of a control it did not change.
function sameControlAgain(press, before) {
    if (!press || !before || press.markup === null || before.markup === null) return false;
    if (press.markup !== before.markup) return false;
    const a = press.area, b = before.area;
    return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1
        && Math.abs(a.right - b.right) < 1 && Math.abs(a.bottom - b.bottom) < 1;
}

// The guard on one surface, installed the first time it opens: capture, on the surface
// itself, so it runs before any tile, chip or button inside it and stops the press before it
// reaches the backdrop's closer on the document. `writes` names the surface's writing
// controls; `held(press)` says whether a press (pressOf, above) is to be ignored; `seen(press)`,
// when given, is told of each click on a writing control that was let through, with its press -
// or null for a keyboard's click, which is never a bounce and never starts one.
function guardFingersOn(surface, writes, held, seen) {
    if (!surface || fingerGuarded.has(surface)) return;
    const guard = event => {
        const target = event.target;
        const control = target && target.closest ? target.closest(writes) : null;
        const covered = target === surface || (control && surface.contains(control));
        if (!covered) return;
        if (!(event.detail > 0)) {
            if (seen && control && event.type === 'click') seen(null);
            return;
        }
        const press = pressOf(event);
        if (held(press)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (seen && control && event.type === 'click') seen(press);
    };
    ['mousedown', 'mouseup', 'click'].forEach(type => surface.addEventListener(type, guard, true));
    fingerGuarded.add(surface);
}

// The press of the click being handled on the sheet (guardFingersOn's `seen`), for the walk to
// arm its bounce from when that click moves it on; null for a keyboard's.
let sheetTapPress = null;

// The sheet's writing controls: the sites, the rates and the hours, «נעדר», and the way on.
// Not «סגור» (sheet-close).
const SHEET_WRITES = '.sheet-place, .sheet-rate-row button, .sheet-rate-row input, .sheet-actions button:not(.sheet-close)';

// `options.stay`: opened from a man's row, about him (sheetStays). `options.tapped`: opened by
// a tap that may have a twin - the tally, a row of «לפי עובדים». Opened from a row, the sheet
// takes no finger on its writers for DOUBLE_TAP_GUARD_MS (v167); opened by a tap to walk, it
// takes none for the walk's bounce (WALK_BOUNCE_MS, above); opened by code, it takes one at
// once. `options.date` and `options.layer`: the day the surface that opened it named
// (sheetDate, above); left out, the day on screen.
function openAssignSheet(workerId, options) {
    sheetWorkerId = workerId;
    sheetStays = Boolean(options && options.stay);
    sheetDate = options && options.date ? options.date : State.date;
    sheetLayer = options && options.layer ? options.layer : State.layer;
    renderAssignSheet();
    const sheet = document.getElementById('assignSheet');
    guardFingersOn(sheet, SHEET_WRITES,
        press => sheetClock() < sheetGuardUntil || sameFingerAgain(press, sheetBounceFrom),
        press => { sheetTapPress = press; });
    sheetGuardUntil = sheetStays ? sheetClock() + DOUBLE_TAP_GUARD_MS : 0;
    // Opened by a tap to walk: the walk's bounce, from the opener's press - where it came down.
    sheetBounceFrom = !sheetStays && options && options.tapped ? openPress() : null;
    // Opening is calm; only an ADVANCE animates. A leftover swap class from the last
    // run would replay the slide on open and dilute what it signals.
    sheet.querySelector('.sheet-content').classList.remove('sheet-swap');
    sheet.style.display = 'flex';
    document.addEventListener('keydown', sheetKeydown);
}

function closeAssignSheet() {
    document.removeEventListener('keydown', sheetKeydown);
    const sheet = document.getElementById('assignSheet');
    // WHAT IS TYPED IN IT IS KEPT FIRST, on the sheet's day, while the sheet is still the
    // screen. A box holding the focus - the hours, mid-number - commits on `change`, which
    // fires when the box is left; shut by Escape, or by a «סגור» that takes no focus (an
    // iPhone's tap on a button), it was left only after the sheet had gone, so the hours
    // came in behind the close: an edit with its step offered over whatever the day screen
    // had become. Let go of here, they are written before anything else happens; the day
    // they are written on is the sheet's either way (sheetDate).
    const active = document.activeElement;
    if (active && sheet.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.blur();
    sheet.style.display = 'none';
    sheetWorkerId = null;
    sheetStays = false;
    sheetGuardUntil = 0;
    sheetBounceFrom = null;
    sheetDate = null;
    sheetLayer = null;
    render();
}

// The evening seder is built by three people around one screen, and on a keyboard the
// sheet is otherwise Tab-Tab-Tab-Enter per worker. A digit picks the site in that
// position, and the sheet moves to the next name by itself - so a whole roster is a run
// of single keystrokes, the same shape as reading it off the paper.
function sheetKeydown(event) {
    // Not while typing hours into a field, and not on top of a browser shortcut.
    if (event.target.matches('input, textarea, select')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const position = Number(event.key);
    if (!Number.isInteger(position) || position < 1) return;

    const tiles = document.querySelectorAll('#assignSheet .sheet-place');
    const tile = tiles[position - 1];
    if (!tile) return;

    event.preventDefault();
    tile.click();
}

// The next worker with nothing recorded, after this one in roster order. Wraps back to
// the start so someone skipped earlier is not stranded. On the sheet's day (sheetDate).
function nextUnfilledAfter(workerId) {
    const { date, layer } = sheetDay();
    const workers = State.activeWorkers();
    const start = workers.findIndex(w => w.id === workerId);
    const isEmpty = worker => !isAbsent(State.schedule, date, worker.id, layer)
        && entriesFor(State.schedule, date, worker.id, layer).length === 0;

    for (let step = 1; step <= workers.length; step++) {
        const candidate = workers[(start + step) % workers.length];
        if (candidate && isEmpty(candidate)) return candidate.id;
    }
    return null;
}

function advanceSheet() {
    // Opened from his row: there is no next man, only this one again (sheetStays).
    if (sheetStays) {
        renderAssignSheet();
        return;
    }
    const next = nextUnfilledAfter(sheetWorkerId);
    if (!next) {
        closeAssignSheet();
        return;
    }
    sheetWorkerId = next;
    renderAssignSheet();
    // Another man under the same tiles: the walk's bounce, from the press of the tap that moved
    // it on (none for a keyboard's digit) - the same finger again, in the same place inside
    // WALK_BOUNCE_MS, does nothing, and the next tap after it is his. NOT a window of
    // DOUBLE_TAP_GUARD_MS here: a deliberate tap fell into that one, and every site after it went
    // to the man before; nor time alone: a tap on another site is never the same finger.
    sheetBounceFrom = sheetTapPress;
    sheetTapPress = null;

    // The sheet looks the same from worker to worker, so the advance has to MOVE: the
    // card slides in slowly enough to be seen and the name line flashes. The move is
    // instant - one tap, next worker - but it is never silent.
    const content = document.querySelector('#assignSheet .sheet-content');
    content.classList.remove('sheet-swap');
    void content.offsetWidth;   // restart the animation when advances come back to back
    content.classList.add('sheet-swap');
}

// A SITE PICKED FOR A MAN ON THE DAY HIS SURFACE NAMED: a regular day there, one field path,
// with the step back on ↶. It was written inline in the tile below until the tray's
// suggestion (js/ui/usual.js) needed the very same act - and a second copy of a write is how
// two doors come to record two different things. Both call this, and nothing else does.
// `at` is the day each of them was drawn for (editWithUndo, js/ui/undo.js). Returns whether
// the edit stood (editWithUndo's verdict, State.commit's under it).
function sheetPickPlace(worker, place, at) {
    return editWithUndo(worker.id,
        `${isolate(worker.name)} נרשם ב${isolate(place.name)}`, (date, layer) =>
            assignPlace(State.schedule, date, worker.id, layer, place.id, RATE_NORMAL), at);
}

function renderAssignSheet() {
    const worker = State.worker(sheetWorkerId);
    if (!worker) return;
    // The sheet's day, read once at its opening (sheetDate). Every control below writes to
    // it - `at` - and to nothing else.
    const at = sheetDay();
    const { date, layer } = at;

    const workers = State.activeWorkers();
    const position = workers.findIndex(w => w.id === worker.id) + 1;

    document.getElementById('assignSheetTitle').textContent = worker.name;
    // The sheet covers the day header, so while it is open this line is the only thing
    // on screen that says WHICH day is being written - and thirty taps into the wrong
    // day is the mistake the fixed header exists to prevent.
    const day = parseLocalDate(date);
    document.getElementById('assignSheetMeta').textContent =
        `${position} מתוך ${workers.length} · ${unrecordedOn(date, layer).length} נותרו` +
        ` · ${hebrewDayName(day)} ${formatShortDate(day)}`;

    const body = document.getElementById('assignSheetBody');
    clear(body);

    const entries = entriesFor(State.schedule, date, worker.id, layer);
    const chosen = new Set(entries.map(entry => entry.placeId));
    const absent = isAbsent(State.schedule, date, worker.id, layer);
    const status = el('p', absent ? 'sheet-status sheet-status-absent'
        : entries.length ? 'sheet-status sheet-status-recorded' : 'sheet-status sheet-status-pending',
        absent ? 'נעדר ביום הזה' : entries.length === 1 ? 'רשום באתר אחד'
            : entries.length ? `רשום ב־${entries.length} אתרים` : 'טרם נרשם ביום הזה');
    body.appendChild(status);

    const grid = el('div', 'sheet-places');
    State.activePlaces().forEach(place => {
        const on = chosen.has(place.id);
        const tile = button(
            '',
            on ? 'sheet-place sheet-place-on' : 'sheet-place',
            () => {
                if (on) {
                    editWithUndo(worker.id, `${isolate(worker.name)} הוסר מ${isolate(place.name)}`, (date, layer) =>
                        unassignPlace(State.schedule, date, worker.id, layer, place.id), at);
                    renderAssignSheet();
                    return;
                }
                const stood = sheetPickPlace(worker, place, at);
                // A second site in a day is normal here, so picking one cannot assume the
                // worker is finished - only move on when this is their first. And only
                // when the edit STOOD: a refused commit has already rolled back and put
                // its dialog up, and advancing behind that dialog silently changes which
                // worker the next tap lands on.
                if (stood && entries.length === 0) advanceSheet();
                else renderAssignSheet();
            }
        );

        if (on) tile.appendChild(el('span', 'sheet-check', '✓'));
        // The number that picks it from the keyboard. Hidden on a phone, where there is
        // no keyboard and the space belongs to the name.
        const position = State.activePlaces().indexOf(place) + 1;
        if (position <= 9) tile.appendChild(el('span', 'sheet-key', String(position)));
        appendSiteName(tile, place.id, place.name);
        paintSite(tile, place.id);
        tile.setAttribute('aria-pressed', on ? 'true' : 'false');

        grid.appendChild(tile);
    });
    body.appendChild(grid);
    // The counting rule, where the second tap happens. It otherwise lives only in the
    // reports, which are read on payday - two weeks after the tap it explains.
    body.appendChild(el('p', 'sheet-note',
        'שני אתרים - יום אחד · יום כפול נספר כשני ימי שכר'));

    if (entries.length > 0) {
        const rates = el('div', 'sheet-rates');
        // What every other screen calls these sites. This row used to fall back to the
        // record id whenever the roster had no entry for it - the same fallback day.js
        // and week.js were cured of - so the one screen that check did not look at was
        // the one still printing an internal key where a site name belongs, in text a
        // person reads and in the hours field's own label. A day naming a site the roster
        // has lost is ordinary, not exotic: days and roster entries travel as separate
        // field paths, so the day can arrive while the site is still queued behind it.
        const labels = placeLabelsIn(State.schedule);
        entries.forEach(entry => {
            const row = el('div', 'sheet-rate-row');
            // The same badge as the list above it: with two sites open at once, the rate
            // buttons need to say which site they belong to at a glance.
            const label = el('span', 'sheet-rate-name tag tag-place');
            appendSiteName(label, entry.placeId, placeLabelFrom(labels, entry.placeId));
            paintSite(label, entry.placeId);
            row.appendChild(label);

            RATES.forEach(rate => {
                const on = entryRate(entry) === rate;
                row.appendChild(button(RATE_LABELS[rate], on ? 'chip-on' : 'chip-off', () => {
                    // Through undo because leaving 'שעות נוספות' discards the hours that
                    // were typed into it, and a mis-tap on this row is otherwise silent
                    // and permanent.
                    editWithUndo(worker.id, `${isolate(worker.name)}: ${RATE_LABELS[rate]}`, (date, layer) =>
                        setRate(State.schedule, date, worker.id, layer,
                            entry.placeId, rate, rate === RATE_EXTRA ? entryExtraHours(entry) : 0), at);
                    renderAssignSheet();
                }));
            });

            if (entryRate(entry) === RATE_EXTRA) {
                const hours = document.createElement('input');
                hours.type = 'number';
                hours.className = 'rate-hours';
                hours.min = '0';
                hours.step = '0.5';
                hours.dir = 'ltr';
                hours.value = entryExtraHours(entry) || '';
                hours.placeholder = 'ש׳';
                hours.setAttribute('aria-label',
                    `שעות נוספות ב${placeLabelFrom(labels, entry.placeId)}`);
                // On the sheet's day (`at`), not on State.date at the `change`: the box is left
                // last of all, after the sheet has shut and the calendar's follow has had its
                // turn (sheetDate, above).
                hours.addEventListener('change', () => {
                    editWithUndo(worker.id, `${isolate(worker.name)}: ${hours.value || 0} שעות נוספות`, (date, layer) =>
                        setRate(State.schedule, date, worker.id, layer,
                            entry.placeId, RATE_EXTRA, hours.value), at);
                    renderAssignSheet();
                });
                row.appendChild(hours);
            }

            rates.appendChild(row);
        });
        // What the hours just typed are worth - said here, at the field, not two weeks
        // later as an asterisk on the payroll. The no-rate case is the one that matters:
        // hours recorded for a worker with no שכר שעה add nothing to the sum, and the
        // person typing them should not find that out on payday.
        if (entries.some(entry => entryRate(entry) === RATE_EXTRA)) {
            rates.appendChild(el('p', 'sheet-note', worker.hourlyRate > 0
                ? `שעות נוספות מחושבות לפי שכר השעה של ${isolate(worker.name)} - ` +
                    `${worker.hourlyRate} ₪ לשעה.`
                : 'לעובד אין שכר שעה - השעות יירשמו בלי סכום.'));
        }
        body.appendChild(rates);
    }

    const foot = document.getElementById('assignSheetFoot');
    clear(foot);

    const actions = el('div', 'sheet-actions');
    actions.appendChild(button(absent ? '✓ נעדר' : 'נעדר', absent ? 'chip-on' : 'btn-secondary', () => {
        if (absent) {
            editWithUndo(worker.id, `ההיעדרות של ${isolate(worker.name)} בוטלה`, (date, layer) =>
                clearWorkerDay(State.schedule, date, worker.id, layer), at);
            renderAssignSheet();
            return;
        }
        // Same gate as the site tiles: an absence is a complete answer for this worker,
        // but only an absence that was actually recorded is.
        if (editWithUndo(worker.id, `${isolate(worker.name)} נרשם כנעדר`, (date, layer) =>
            markAbsent(State.schedule, date, worker.id, layer), at)) advanceSheet();
        else renderAssignSheet();
    }));
    // The forward button says what forward MEANS right now. With nothing recorded for
    // this worker it is a skip and says so; once something is, it names the worker the
    // sheet will move to - which is also the quiet confirmation that this one is done.
    // With nobody unfilled left, forward closes the sheet (see advanceSheet), so the
    // label says the list is finished rather than promising a name it does not have.
    const next = entries.length > 0 || absent
        ? State.worker(nextUnfilledAfter(worker.id))
        : null;
    const forwardLabel = entries.length === 0 && !absent ? 'דלג'
        : next ? `המשך אל ${isolate(next.name)}`
            : 'סיום הרשימה';
    // Not on a sheet opened from a man's row: it is about him, and goes nowhere (sheetStays).
    if (!sheetStays) {
        const forward = button(forwardLabel, 'btn-secondary sheet-fwd', advanceSheet);
        forward.appendChild(forwardChevron());
        actions.appendChild(forward);
    }
    // "סגור", not "סיום" and certainly not "שמור". Every tap on this sheet has already
    // been written and sent by the time the finger leaves the glass - there is nothing
    // here to save, and a button that says there is teaches somebody that closing without
    // pressing it loses the evening. It does not, and they should not have to wonder.
    // Not a writing control: no guard holds it (SHEET_WRITES).
    actions.appendChild(button('סגור', 'btn-secondary sheet-close', closeAssignSheet));
    foot.appendChild(actions);
    foot.appendChild(el('p', 'sheet-note', 'כל בחירה נשמרת מיד במכשיר. אין מה לשמור כאן.'));
}

// Forward points LEFT on this calendar - time flows right-to-left - and it is drawn as
// an SVG because a bare › inside a Hebrew label is reordered by the bidi algorithm to
// whichever side it pleases, and has been seen pointing backwards.
function forwardChevron() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M15 6l-6 6 6 6');
    svg.appendChild(path);
    return svg;
}

// ---------------------------------------------------------------- pickers

// Site-first entry: the picker stays open so a run of names can be tapped one after the
// other. Closing after each pick would triple the work for a site with eight people.
//
// The order is decided ONCE, when the picker opens, and then frozen. It used to be
// re-sorted on every tap - unrecorded first, then those working elsewhere, then those
// already here - which meant every name jumped the moment it was touched. Tap someone by
// mistake and they were removed from the site AND thrown to the top of the list, so the
// only way to find out who had just moved was to read every name again. A row that stays
// where it is makes the mistake self-correcting: the thumb is already on it.
let pickerOrder = [];

// The day the picker names in its context line, read once when it opens - from the site
// card that opened it, or the day on screen - and the day every «+ הוסף», «✓ נמצא» and
// «🧹 רוקן אתר» in it writes to, as the assign sheet's (sheetDate, above). Null while shut.
let pickerDate = null;
let pickerLayer = null;

function pickerDay() {
    return { date: pickerDate || State.date, layer: pickerLayer || State.layer };
}

// `options.tapped`: opened by a tap on the site's «+», which may have a twin - no finger for a
// moment (guardFingersOn, above). `options.date`, `options.layer`: the day the card named.
function openWorkerPicker(placeId, options) {
    pickerPlaceId = placeId;
    pickerDate = options && options.date ? options.date : State.date;
    pickerLayer = options && options.layer ? options.layer : State.layer;
    document.getElementById('workerPickerSearch').value = '';

    const here = new Set(workersAtPlace(State.schedule, pickerDate, placeId, pickerLayer));
    const unrecorded = new Set(unrecordedOn(pickerDate, pickerLayer).map(w => w.id));
    pickerOrder = State.activeWorkers().slice().sort((a, b) => {
        const rank = worker => (here.has(worker.id) ? 2 : unrecorded.has(worker.id) ? 0 : 1);
        return rank(a) - rank(b);
    }).map(worker => worker.id);

    renderWorkerPicker();
    const modal = document.getElementById('workerPickerModal');
    // Its writing controls: each row's «+ הוסף» / «✓ נמצא», and «🧹 רוקן אתר». The search box,
    // «נקה», «הצג את כל העובדים» and «סגור» are never held (guardFingersOn, above).
    guardFingersOn(modal, '.picker-row button, button[onclick="clearWorkerPicker()"]',
        () => sheetClock() < workerPickerGuardUntil);
    workerPickerGuardUntil = options && options.tapped ? sheetClock() + DOUBLE_TAP_GUARD_MS : 0;
    modal.style.display = 'flex';
}

function clearWorkerPickerSearch() {
    const search = document.getElementById('workerPickerSearch');
    search.value = '';
    renderWorkerPicker();
    search.focus({ preventScroll: true });
}

function renderWorkerPicker() {
    const place = State.place(pickerPlaceId);
    if (!place) return;
    // The picker's day (pickerDate): what it shows and what each row writes.
    const at = pickerDay();
    const { date, layer } = at;

    const here = new Set(workersAtPlace(State.schedule, date, place.id, layer));
    const unrecorded = new Set(unrecordedOn(date, layer).map(w => w.id));

    document.getElementById('workerPickerTitle').textContent =
        `הוסף עובדים ל${isolate(place.name)} · ${here.size} רשומים`;
    const named = parseLocalDate(date);
    document.getElementById('workerPickerContext').textContent = `${hebrewDayName(named)} · ${formatFullDate(named)}`;
    const query = document.getElementById('workerPickerSearch').value.trim().toLocaleLowerCase();
    document.getElementById('workerPickerClear').disabled = !document.getElementById('workerPickerSearch').value;

    const container = document.getElementById('workerPickerList');
    const focusedRow = document.activeElement && document.activeElement.closest('#workerPickerList .picker-row');
    const focusedWorker = focusedRow && focusedRow.dataset.workerId;
    container.innerHTML = '';

    // Anyone added to the roster while this was open goes on the end rather than being
    // dropped - the frozen order is a snapshot, not a whitelist.
    const known = new Set(pickerOrder);
    const ordered = pickerOrder
        .map(id => State.worker(id))
        .filter(worker => worker && worker.active)
        .concat(State.activeWorkers().filter(worker => !known.has(worker.id)));

    const visible = ordered.filter(worker => worker.name.toLocaleLowerCase().includes(query));
    document.getElementById('workerPickerSummary').textContent = query
        ? `מוצגים ${visible.length} מתוך ${ordered.length} עובדים` : `${ordered.length} עובדים ברשימה`;
    if (!visible.length) {
        const empty = el('div', 'picker-no-results');
        empty.appendChild(el('p', null, 'לא נמצאו עובדים בחיפוש.'));
        if (query) empty.appendChild(button('הצג את כל העובדים', 'btn-secondary', clearWorkerPickerSearch));
        container.appendChild(empty);
    }
    visible.forEach(worker => {
        const row = el('div', 'picker-row');
        row.dataset.workerId = worker.id;
        const inHere = here.has(worker.id);
        if (inHere) row.classList.add('picker-row-on');

        const label = el('span', 'picker-name', worker.name);
        if (!inHere && unrecorded.has(worker.id)) {
            row.classList.add('picker-row-pending');
            label.appendChild(el('span', 'picker-note picker-note-pending', 'טרם נרשם'));
        } else if (!inHere && isAbsent(State.schedule, date, worker.id, layer)) {
            label.appendChild(el('span', 'picker-note', 'נעדר ביום הזה'));
        }
        if (!inHere && !unrecorded.has(worker.id)) {
            const elsewhere = entriesFor(State.schedule, date, worker.id, layer)
                .map(entry => (State.place(entry.placeId) || {}).name)
                .filter(Boolean)
                .join(', ');
            if (elsewhere) label.appendChild(el('span', 'picker-note', elsewhere));
        }
        row.appendChild(label);

        const action = button(inHere ? '✓ נמצא' : '+ הוסף', inHere ? 'btn-on' : 'btn-add', () => {
            // «+ הוסף» becomes «✓ נמצא» in place, under the finger: a second tap on this
            // row inside DOUBLE_TAP_GUARD_MS is the first tap again, not a removal
            // (secondTapTooSoon, js/ui/day.js). Keyed by site and man, so the guard
            // outlives the redraw of the list below.
            if (secondTapTooSoon(`picker:${place.id}:${worker.id}`)) return;
            const label = inHere
                ? `${isolate(worker.name)} הוסר מ${isolate(place.name)}`
                : `${isolate(worker.name)} נוסף ל${isolate(place.name)}`;
            editWithUndo(worker.id, label, (date, layer) => (inHere
                ? unassignPlace(State.schedule, date, worker.id, layer, place.id)
                : assignPlace(State.schedule, date, worker.id, layer, place.id, RATE_NORMAL)), at);
            renderWorkerPicker();
        }, `${inHere ? 'הסר את' : 'הוסף את'} ${isolate(worker.name)} ${inHere ? 'מ' : 'ל'}${isolate(place.name)}`);
        action.setAttribute('aria-pressed', String(inHere));
        row.appendChild(action);

        container.appendChild(row);
        if (focusedWorker === worker.id) row.querySelector('button').focus({ preventScroll: true });
    });
}

// Emptying a site in one go. Building it up name by name is the normal case; taking it
// apart one ✓ at a time when the crew moved somewhere else is the same work twice.
//
// THE DAY IS THE ONE THE QUESTION WAS ASKED ABOUT. The men were counted before the question
// and the date read after the answer, so a question left open over midnight («2 עובדים
// יוסרו מאתר צפון ביום הזה», the picker behind it saying Tuesday) emptied the site on
// WEDNESDAY - the seder built the evening before, or another phone's record of the morning -
// and left Tuesday as it was (the review of v189, c2). The date and the layer are read once,
// before the question, as markAllHoliday (js/ui/day.js) reads its own; and after the answer
// the men counted are taken off only if they are still on the site that day. A man another
// phone moved, or marked absent, while the question was up is that phone's answer: rewriting
// his day to an empty list would have taken his absence or his new site with it.
async function clearWorkerPicker() {
    const place = State.place(pickerPlaceId);
    if (!place) return;

    // The picker's own day (pickerDate) - the one its context line names behind the question.
    const { date, layer } = pickerDay();
    const here = workersAtPlace(State.schedule, date, place.id, layer);
    if (here.length === 0) {
        askTell(`אף אחד לא רשום ב${isolate(place.name)} ביום הזה.`);
        return;
    }

    const ok = await askConfirm({
        title: `לרוקן את ${isolate(place.name)}?`,
        message: `${here.length} עובדים יוסרו מ${isolate(place.name)} ביום הזה. שאר הימים לא ייגעו.`,
        ok: 'רוקן'
    });
    if (!ok) return;

    const still = new Set(workersAtPlace(State.schedule, date, place.id, layer));
    const leaving = here.filter(workerId => still.has(workerId));
    if (leaving.length === 0) {
        renderWorkerPicker();
        return;
    }
    const previous = leaving.map(workerId => ({
        workerId,
        record: snapshotWorkerDay(date, layer, workerId)
    }));

    // Kept in the journal by the disk guard, it is an edit all the same - see editWithUndo.
    if (!State.commitMany(leaving.map(workerId =>
        unassignPlace(State.schedule, date, workerId, layer, place.id)))) {
        if (State.lastCommitKept) hideUndo();
        return;
    }

    // The way back puts back only a day that still holds what this step left on it: a man
    // another phone has recorded since keeps that phone's answer (undoRows, js/ui/undo.js).
    const rows = previous.map(item => ({ workerId: item.workerId, left: snapshotWorkerDay(date, layer, item.workerId),
        back: () => setWorkerDay(State.schedule, date, item.workerId, layer, item.record) }));
    offerUndo(`${leaving.length} עובדים הוסרו מ${isolate(place.name)}`, () => undoRows(date, layer, rows));

    renderWorkerPicker();
}

function closeWorkerPicker() {
    document.getElementById('workerPickerModal').style.display = 'none';
    pickerPlaceId = null;
    pickerDate = null;
    pickerLayer = null;
    workerPickerGuardUntil = 0;
}

// The mirror of the site picker, for when a name in the tray is tapped instead.
// `options.tapped`: opened by that tap, which may have a twin - no finger for a moment
// (guardFingersOn, above). Drawn again after a pick, it keeps the window it opened with.
// `options.date`, `options.layer`: the day the tray named when it was drawn - the day the
// context line says and every site in it writes to, as the assign sheet's (sheetDate); the
// redraw after a pick is handed the same day again. Left out, the day on screen.
function openPlacePicker(workerId, options) {
    const worker = State.worker(workerId);
    if (!worker) return;
    const at = {
        date: options && options.date ? options.date : State.date,
        layer: options && options.layer ? options.layer : State.layer
    };

    document.getElementById('placePickerTitle').textContent = `לאן הלך ${isolate(worker.name)}?`;
    const named = parseLocalDate(at.date);
    document.getElementById('placePickerContext').textContent = `${hebrewDayName(named)} · ${formatFullDate(named)}`;

    const container = document.getElementById('placePickerList');
    container.innerHTML = '';

    const current = new Set(entriesFor(State.schedule, at.date, workerId, at.layer)
        .map(entry => entry.placeId));

    State.activePlaces().forEach(place => {
        const inHere = current.has(place.id);
        const choice = button(
            '',
            inHere ? 'place-btn place-on' : 'place-btn',
            () => {
                // This site turns into its own opposite in place (the picker is redrawn
                // under the finger): the same site tapped again for the same man inside
                // DOUBLE_TAP_GUARD_MS is the first tap again (secondTapTooSoon, js/ui/day.js).
                if (secondTapTooSoon(`place:${workerId}:${place.id}`)) return;
                // Through editWithUndo, in the sheet's own words for the same two acts. It was
                // a bare commit, the one write the tray's name led to with no step of its own:
                // the header's ↶ stayed on the step before - often another man just placed by
                // his chip (js/ui/usual.js) - and pressed to take this pick back it took HIS day
                // back instead. The mutation is handed over unmade: assignPlace changes the
                // schedule the moment it is called, before editWithUndo has taken its copy.
                editWithUndo(workerId, inHere
                    ? `${isolate(worker.name)} הוסר מ${isolate(place.name)}`
                    : `${isolate(worker.name)} נרשם ב${isolate(place.name)}`, (date, layer) => (inHere
                    ? unassignPlace(State.schedule, date, workerId, layer, place.id)
                    : assignPlace(State.schedule, date, workerId, layer, place.id, RATE_NORMAL)), at);
                openPlacePicker(workerId, at);
            }
        );
        const dot = el('span', 'place-choice-dot');
        dot.setAttribute('aria-hidden', 'true');
        paintSite(dot, place.id);
        choice.appendChild(dot);
        const name = el('span', 'place-choice-name');
        appendSiteName(name, place.id, place.name);
        choice.appendChild(name);
        if (inHere) choice.appendChild(el('span', 'place-choice-check', '✓'));
        choice.setAttribute('aria-pressed', String(inHere));
        container.appendChild(choice);
    });

    const modal = document.getElementById('placePickerModal');
    // Its writing controls are its sites; «סגור» is never held (guardFingersOn, above).
    guardFingersOn(modal, '.place-btn', () => sheetClock() < placePickerGuardUntil);
    if (options && options.tapped) placePickerGuardUntil = sheetClock() + DOUBLE_TAP_GUARD_MS;
    modal.style.display = 'flex';
}

function closePlacePicker() {
    document.getElementById('placePickerModal').style.display = 'none';
    placePickerGuardUntil = 0;
}

// ---------------------------------------------------------------- copying a day in

// Two ways of not typing thirty names again, and the same rule under both: only workers
// with NOTHING recorded are filled. A copy can never overwrite something a person entered
// by hand - including something one of the other two entered a minute ago.
// `at`: the day the copy is INTO, as the button named it when it was drawn (renderCopyButton);
// left out, the day on screen.
function copyDayInto(fromDate, fromLayer, source, empty, options, at) {
    const dateAtCopy = at && at.date ? at.date : State.date;
    const layerAtCopy = at && at.layer ? at.layer : State.layer;
    const targets = unrecordedOn(dateAtCopy, layerAtCopy);
    if (targets.length === 0) {
        askTell('כל העובדים כבר טופלו ביום הזה.');
        return;
    }

    // An absence travels only from the day RIGHT BEFORE this one. Copied sites from a
    // week back are visible and cheap to fix; a copied absence looks exactly like a real
    // one, and a man marked נעדר off a day from before the holiday loses a paid day
    // with nothing on screen to catch it.
    const withAbsences = !(options && options.skipAbsences);

    // Snapshotted BEFORE the change-building below: assignPlace and markAbsent mutate
    // the schedule the moment they are called, so a snapshot taken after the loop
    // reads the copy back as "no change" and the undo offer never appears. Date and
    // layer were captured above - by undo time the person may be on another day.
    const held = targets.map(worker => ({
        id: worker.id,
        before: snapshotWorkerDay(dateAtCopy, layerAtCopy, worker.id)
    }));

    const changes = [];
    targets.forEach(worker => {
        if (isAbsent(State.schedule, fromDate, worker.id, fromLayer)) {
            if (withAbsences) {
                changes.push(markAbsent(State.schedule, dateAtCopy, worker.id, layerAtCopy));
            }
            return;
        }

        const entries = entriesFor(State.schedule, fromDate, worker.id, fromLayer);
        if (entries.length === 0) return;

        entries.forEach(entry => {
            changes.push(assignPlace(State.schedule, dateAtCopy, worker.id, layerAtCopy,
                entry.placeId, entryRate(entry), entryExtraHours(entry)));
        });
    });

    if (changes.length === 0) {
        askTell(empty);
        return;
    }

    // One save and one render for the whole copy, but every path is still sent - see
    // State.commitMany. No "copied N workers" over a copy that was refused: commit has
    // already said what happened. Kept in the journal by the disk guard, it is an edit all
    // the same, and the step behind it is not the last one - see editWithUndo.
    if (!State.commitMany(changes)) {
        if (State.lastCommitKept) hideUndo();
        return;
    }

    // Only the rows the copy actually filled: a worker it skipped must not be dragged
    // back and forth by somebody else's undo.
    const touched = held
        .map(item => ({ ...item, after: snapshotWorkerDay(dateAtCopy, layerAtCopy, item.id) }))
        .filter(item => JSON.stringify(item.before) !== JSON.stringify(item.after));
    if (touched.length > 0) {
        const count = touched.length;
        // The undo (and the redo) restore only rows that still hold what this copy
        // left there - a row another phone edited in between is that phone's answer,
        // and dragging it back would re-make the mistake somewhere new.
        const restoreTo = side => () => State.commitMany(touched
            .filter(item => JSON.stringify(snapshotWorkerDay(dateAtCopy, layerAtCopy, item.id))
                === JSON.stringify(side === 'before' ? item.after : item.before))
            .map(item => setWorkerDay(State.schedule, dateAtCopy, item.id, layerAtCopy,
                side === 'before' ? item.before : item.after)));
        // Offered over the day it restores into, while that day is on the screen - as
        // editWithUndo offers its own (js/ui/undo.js).
        if (dateAtCopy === State.date && layerAtCopy === State.layer) {
            offerUndo(count === 1 ? `הועתק עובד אחד ${source}` : `הועתקו ${count} עובדים ${source}`,
                restoreTo('before'), restoreTo('after'));
        } else {
            hideUndo();
        }
    }

    const copied = countCopied(changes);
    askTell(copied === 1
        ? `הועתק עובד אחד ${source}. רק מי שלא היה רשום עודכן.`
        : `הועתקו ${copied} עובדים ${source}. רק מי שלא היה רשום עודכן.`);
}

// Workers, not writes: a worker copied into two sites produced two changes on the same
// path, and reporting that as "2 workers copied" is simply wrong.
function countCopied(changes) {
    changes = changes.filter(change => change && change.path);
    return new Set(changes.map(change => change.path)).size;
}

// The most recent day BEFORE this one that anything was recorded on. Yesterday is the
// wrong answer often enough to matter: on a Sunday it is the rest day, after a holiday
// it is a run of empty days, and on a day being fixed weeks later it is whatever
// happened to be next to it. Every one of those made the copy button do nothing and
// say so, which teaches a person to stop pressing it.
function lastRecordedDayBefore(schedule, date, layer) {
    const workers = schedule.workers || [];
    return Object.keys(schedule.days || {})
        .filter(day => day < date)
        .sort()
        .reverse()
        .find(day => workers.some(worker =>
            isAbsent(schedule, day, worker.id, layer) ||
            entriesFor(schedule, day, worker.id, layer).length > 0)) || null;
}

// Not "copy last week" - the roster does not repeat weekly here. But consecutive working
// days often look alike, and starting from the last one and fixing the differences is
// the difference between thirty taps and five.
//
// Into the day the button was drawn for (copyButtonDay, below) - the day its words count
// back from - rather than State.date at the tap.
function copyPreviousDay() {
    const at = copyButtonDay || { date: State.date, layer: State.layer };
    const from = lastRecordedDayBefore(State.schedule, at.date, at.layer);
    if (!from) {
        askTell('אין יום קודם עם רישום להעתיק ממנו.');
        return;
    }

    const parsed = parseLocalDate(from);
    const gapDays = Math.round((parseLocalDate(at.date) - parsed) / 86400000);
    copyDayInto(from, at.layer,
        `מ${hebrewDayName(parsed)} ${formatShortDate(parsed)}`,
        `אין מה להעתיק מ${formatShortDate(parsed)}.`,
        // Sites carry across any gap; absences only from the adjacent day, where
        // "he was out yesterday" still says something about today.
        { skipAbsences: gapDays > 1 }, at);
}

// The day the copy button was last drawn for: render() draws it on every pass (js/app.js),
// so this is the day its label was counted back from.
let copyButtonDay = null;

// The button names the day it will copy from, because "the previous day" is a guess the
// person then has to check, and the whole point of the button is not having to.
function renderCopyButton() {
    const btn = document.getElementById('copyDayBtn');
    if (!btn) return;
    copyButtonDay = { date: State.date, layer: State.layer };

    // THE HOLD IS SAID BY THE BUTTON, not only worn by the stylesheet.
    //
    // css/app.css gives this button `pointer-events: none` and opacity .5 while
    // body.writes-blocked stands. That stops a FINGER. It does not stop a keyboard, and it
    // does not reach the accessibility tree at all - so the button reported itself enabled,
    // Enter on it fired, and its title still promised to copy the day. Measured:
    // blocked:true, disabled:false, pointerEvents:"none", all at once.
    //
    // The record was never at risk - State.commit refuses under the hold, which is law 3
    // doing its job. What was wrong was the SAYING, on the button somebody reaches for
    // first in the morning: a control that announces itself live and then does nothing has
    // told the person the app is broken, not that recording is held.
    //
    // Checked BEFORE the "is there a day to copy" question below, because the hold outranks
    // it: on a held phone the answer is the same whether or not yesterday has a record.
    // The word is the app's own - js/ui/day.js's progress line already says «הרישום מושבת»
    // in exactly this state - so no new string enters the product.
    if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
        btn.textContent = '↧ מהיום הקודם';
        btn.disabled = true;
        btn.title = 'הרישום מושבת';
        return;
    }

    const from = State.schedule.workers.length === 0
        ? null
        : lastRecordedDayBefore(State.schedule, State.date, State.layer);

    if (!from) {
        btn.textContent = '↧ מהיום הקודם';
        btn.disabled = true;
        btn.title = 'אין יום קודם עם רישום';
        return;
    }

    const parsed = parseLocalDate(from);
    btn.disabled = false;
    // 'מיום רביעי', not 'מרביעי' - the toast for the same action says it correctly and
    // the button should not speak worse Hebrew than its own confirmation.
    btn.textContent = `↧ ${'מ' + hebrewDayName(parsed)} ${formatShortDate(parsed)}`;
    btn.title = `העתק את מה שנרשם ב${formatFullDate(parsed)}. רק מי שעדיין לא נרשם יושלם.`;
}
