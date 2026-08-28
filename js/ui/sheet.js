// The assign sheet, the two pickers, and copying a day in - the WRITE half of the day
// screen. Split out of day.js when the pair passed eight hundred lines: day.js draws the
// day, this file changes it. Same globals, same rules: classic script, no modules.

let pickerPlaceId = null;

// ---------------------------------------------------------------- assign sheet

// The sheet advances to the next unfilled worker by itself. Copying a column of thirty
// names off a sheet of paper is one continuous motion, and closing the dialog after each
// one turns one tap per worker into three.
let sheetWorkerId = null;

function openAssignSheet(workerId) {
    sheetWorkerId = workerId;
    renderAssignSheet();
    const sheet = document.getElementById('assignSheet');
    // Opening is calm; only an ADVANCE animates. A leftover swap class from the last
    // run would replay the slide on open and dilute what it signals.
    sheet.querySelector('.sheet-content').classList.remove('sheet-swap');
    sheet.style.display = 'flex';
    document.addEventListener('keydown', sheetKeydown);
}

function closeAssignSheet() {
    document.removeEventListener('keydown', sheetKeydown);
    document.getElementById('assignSheet').style.display = 'none';
    sheetWorkerId = null;
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
// the start so someone skipped earlier is not stranded.
function nextUnfilledAfter(workerId) {
    const workers = State.activeWorkers();
    const start = workers.findIndex(w => w.id === workerId);
    const isEmpty = worker => !isAbsent(State.schedule, State.date, worker.id, State.layer)
        && entriesFor(State.schedule, State.date, worker.id, State.layer).length === 0;

    for (let step = 1; step <= workers.length; step++) {
        const candidate = workers[(start + step) % workers.length];
        if (candidate && isEmpty(candidate)) return candidate.id;
    }
    return null;
}

function advanceSheet() {
    const next = nextUnfilledAfter(sheetWorkerId);
    if (!next) {
        closeAssignSheet();
        return;
    }
    sheetWorkerId = next;
    renderAssignSheet();

    // The sheet looks the same from worker to worker, so the advance has to MOVE: the
    // card slides in slowly enough to be seen and the name line flashes. The move is
    // instant - one tap, next worker - but it is never silent.
    const content = document.querySelector('#assignSheet .sheet-content');
    content.classList.remove('sheet-swap');
    void content.offsetWidth;   // restart the animation when advances come back to back
    content.classList.add('sheet-swap');
}

function renderAssignSheet() {
    const worker = State.worker(sheetWorkerId);
    if (!worker) return;

    const workers = State.activeWorkers();
    const position = workers.findIndex(w => w.id === worker.id) + 1;

    document.getElementById('assignSheetTitle').textContent = worker.name;
    // The sheet covers the day header, so while it is open this line is the only thing
    // on screen that says WHICH day is being written - and thirty taps into the wrong
    // day is the mistake the fixed header exists to prevent.
    const day = parseLocalDate(State.date);
    document.getElementById('assignSheetMeta').textContent =
        `${position} מתוך ${workers.length} · ${State.unrecorded().length} נותרו` +
        ` · ${hebrewDayName(day)} ${formatShortDate(day)}`;

    const body = document.getElementById('assignSheetBody');
    clear(body);

    const entries = entriesFor(State.schedule, State.date, worker.id, State.layer);
    const chosen = new Set(entries.map(entry => entry.placeId));
    const absent = isAbsent(State.schedule, State.date, worker.id, State.layer);

    const grid = el('div', 'sheet-places');
    State.activePlaces().forEach(place => {
        const on = chosen.has(place.id);
        const tile = button(
            '',
            on ? 'sheet-place sheet-place-on' : 'sheet-place',
            () => {
                if (on) {
                    editWithUndo(worker.id, `${isolate(worker.name)} הוסר מ${isolate(place.name)}`, () =>
                        unassignPlace(State.schedule, State.date, worker.id, State.layer, place.id));
                    renderAssignSheet();
                    return;
                }
                const stood = editWithUndo(worker.id,
                    `${isolate(worker.name)} נרשם ב${isolate(place.name)}`, () =>
                        assignPlace(State.schedule, State.date, worker.id, State.layer, place.id, RATE_NORMAL));
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
        entries.forEach(entry => {
            const place = State.place(entry.placeId);
            const row = el('div', 'sheet-rate-row');
            // The same badge as the list above it: with two sites open at once, the rate
            // buttons need to say which site they belong to at a glance.
            const label = el('span', 'sheet-rate-name tag tag-place');
            appendSiteName(label, entry.placeId, place ? place.name : entry.placeId);
            paintSite(label, entry.placeId);
            row.appendChild(label);

            RATES.forEach(rate => {
                const on = entryRate(entry) === rate;
                row.appendChild(button(RATE_LABELS[rate], on ? 'chip-on' : 'chip-off', () => {
                    // Through undo because leaving 'שעות נוספות' discards the hours that
                    // were typed into it, and a mis-tap on this row is otherwise silent
                    // and permanent.
                    editWithUndo(worker.id, `${isolate(worker.name)}: ${RATE_LABELS[rate]}`, () =>
                        setRate(State.schedule, State.date, worker.id, State.layer,
                            entry.placeId, rate, rate === RATE_EXTRA ? entryExtraHours(entry) : 0));
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
                hours.setAttribute('aria-label', `שעות נוספות ב${place ? place.name : ''}`);
                hours.addEventListener('change', () => {
                    editWithUndo(worker.id, `${isolate(worker.name)}: ${hours.value || 0} שעות נוספות`, () =>
                        setRate(State.schedule, State.date, worker.id, State.layer,
                            entry.placeId, RATE_EXTRA, hours.value));
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
                ? `שעות נוספות מחושבות לפי שכר שעה (${worker.hourlyRate} ₪ ל${isolate(worker.name)}).`
                : 'לעובד אין שכר שעה - השעות יירשמו בלי סכום.'));
        }
        body.appendChild(rates);
    }

    const foot = document.getElementById('assignSheetFoot');
    clear(foot);

    const actions = el('div', 'sheet-actions');
    actions.appendChild(button(absent ? '✓ נעדר' : 'נעדר', absent ? 'chip-on' : 'btn-secondary', () => {
        if (absent) {
            editWithUndo(worker.id, `ההיעדרות של ${isolate(worker.name)} בוטלה`, () =>
                clearWorkerDay(State.schedule, State.date, worker.id, State.layer));
            renderAssignSheet();
            return;
        }
        // Same gate as the site tiles: an absence is a complete answer for this worker,
        // but only an absence that was actually recorded is.
        if (editWithUndo(worker.id, `${isolate(worker.name)} נרשם כנעדר`, () =>
            markAbsent(State.schedule, State.date, worker.id, State.layer))) advanceSheet();
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
    const forward = button(forwardLabel, 'btn-secondary sheet-fwd', advanceSheet);
    forward.appendChild(forwardChevron());
    actions.appendChild(forward);
    // "סגור", not "סיום" and certainly not "שמור". Every tap on this sheet has already
    // been written and sent by the time the finger leaves the glass - there is nothing
    // here to save, and a button that says there is teaches somebody that closing without
    // pressing it loses the evening. It does not, and they should not have to wonder.
    actions.appendChild(button('סגור', 'btn-secondary', closeAssignSheet));
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

function openWorkerPicker(placeId) {
    pickerPlaceId = placeId;

    const here = new Set(workersAtPlace(State.schedule, State.date, placeId, State.layer));
    const unrecorded = new Set(State.unrecorded().map(w => w.id));
    pickerOrder = State.activeWorkers().slice().sort((a, b) => {
        const rank = worker => (here.has(worker.id) ? 2 : unrecorded.has(worker.id) ? 0 : 1);
        return rank(a) - rank(b);
    }).map(worker => worker.id);

    renderWorkerPicker();
    document.getElementById('workerPickerModal').style.display = 'flex';
}

function renderWorkerPicker() {
    const place = State.place(pickerPlaceId);
    if (!place) return;

    const here = new Set(workersAtPlace(State.schedule, State.date, place.id, State.layer));
    const unrecorded = new Set(State.unrecorded().map(w => w.id));

    document.getElementById('workerPickerTitle').textContent =
        `הוסף עובדים ל${isolate(place.name)} · ${here.size} רשומים`;

    const container = document.getElementById('workerPickerList');
    container.innerHTML = '';

    // Anyone added to the roster while this was open goes on the end rather than being
    // dropped - the frozen order is a snapshot, not a whitelist.
    const known = new Set(pickerOrder);
    const ordered = pickerOrder
        .map(id => State.worker(id))
        .filter(worker => worker && worker.active)
        .concat(State.activeWorkers().filter(worker => !known.has(worker.id)));

    ordered.forEach(worker => {
        const row = el('div', 'picker-row');
        const inHere = here.has(worker.id);
        if (inHere) row.classList.add('picker-row-on');

        const label = el('span', 'picker-name', worker.name);
        if (!inHere && !unrecorded.has(worker.id)) {
            const elsewhere = entriesFor(State.schedule, State.date, worker.id, State.layer)
                .map(entry => (State.place(entry.placeId) || {}).name)
                .filter(Boolean)
                .join(', ');
            if (elsewhere) label.appendChild(el('span', 'picker-note', elsewhere));
        }
        row.appendChild(label);

        row.appendChild(button(inHere ? '✓ נמצא' : '+ הוסף', inHere ? 'btn-on' : 'btn-add', () => {
            const label = inHere
                ? `${isolate(worker.name)} הוסר מ${isolate(place.name)}`
                : `${isolate(worker.name)} נוסף ל${isolate(place.name)}`;
            editWithUndo(worker.id, label, () => (inHere
                ? unassignPlace(State.schedule, State.date, worker.id, State.layer, place.id)
                : assignPlace(State.schedule, State.date, worker.id, State.layer, place.id, RATE_NORMAL)));
            renderWorkerPicker();
        }));

        container.appendChild(row);
    });
}

// Emptying a site in one go. Building it up name by name is the normal case; taking it
// apart one ✓ at a time when the crew moved somewhere else is the same work twice.
async function clearWorkerPicker() {
    const place = State.place(pickerPlaceId);
    if (!place) return;

    const here = workersAtPlace(State.schedule, State.date, place.id, State.layer);
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

    const previous = here.map(workerId => ({
        workerId,
        record: snapshotWorkerDay(State.date, State.layer, workerId)
    }));
    const date = State.date;
    const layer = State.layer;

    if (!State.commitMany(here.map(workerId =>
        unassignPlace(State.schedule, date, workerId, layer, place.id)))) return;

    offerUndo(`${here.length} עובדים הוסרו מ${isolate(place.name)}`, () => {
        State.commitMany(previous.map(item =>
            setWorkerDay(State.schedule, date, item.workerId, layer, item.record)));
    });

    renderWorkerPicker();
}

function closeWorkerPicker() {
    document.getElementById('workerPickerModal').style.display = 'none';
    pickerPlaceId = null;
}

// The mirror of the site picker, for when a name in the tray is tapped instead.
function openPlacePicker(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    document.getElementById('placePickerTitle').textContent = `לאן הלך ${isolate(worker.name)}?`;

    const container = document.getElementById('placePickerList');
    container.innerHTML = '';

    const current = new Set(entriesFor(State.schedule, State.date, workerId, State.layer)
        .map(entry => entry.placeId));

    State.activePlaces().forEach(place => {
        const inHere = current.has(place.id);
        container.appendChild(button(
            inHere ? `✓ ${isolate(place.name)}` : place.name,
            inHere ? 'place-btn place-on' : 'place-btn',
            () => {
                const change = inHere
                    ? unassignPlace(State.schedule, State.date, workerId, State.layer, place.id)
                    : assignPlace(State.schedule, State.date, workerId, State.layer, place.id, RATE_NORMAL);
                State.commit(change);
                openPlacePicker(workerId);
            }
        ));
    });

    document.getElementById('placePickerModal').style.display = 'flex';
}

function closePlacePicker() {
    document.getElementById('placePickerModal').style.display = 'none';
}

// ---------------------------------------------------------------- copying a day in

// Two ways of not typing thirty names again, and the same rule under both: only workers
// with NOTHING recorded are filled. A copy can never overwrite something a person entered
// by hand - including something one of the other two entered a minute ago.
function copyDayInto(fromDate, fromLayer, source, empty, options) {
    const targets = State.unrecorded();
    if (targets.length === 0) {
        askTell('כל העובדים כבר טופלו ביום הזה.');
        return;
    }

    // An absence travels only from the day RIGHT BEFORE this one. Copied sites from a
    // week back are visible and cheap to fix; a copied absence looks exactly like a real
    // one, and a man marked נעדר off a day from before the holiday loses a paid day
    // with nothing on screen to catch it.
    const withAbsences = !(options && options.skipAbsences);

    const changes = [];
    targets.forEach(worker => {
        if (isAbsent(State.schedule, fromDate, worker.id, fromLayer)) {
            if (withAbsences) {
                changes.push(markAbsent(State.schedule, State.date, worker.id, State.layer));
            }
            return;
        }

        const entries = entriesFor(State.schedule, fromDate, worker.id, fromLayer);
        if (entries.length === 0) return;

        entries.forEach(entry => {
            changes.push(assignPlace(State.schedule, State.date, worker.id, State.layer,
                entry.placeId, entryRate(entry), entryExtraHours(entry)));
        });
    });

    if (changes.length === 0) {
        askTell(empty);
        return;
    }

    // One save and one render for the whole copy, but every path is still sent - see
    // State.commitMany. No "copied N workers" over a copy that was refused: commit has
    // already said what happened.
    if (!State.commitMany(changes)) return;
    askTell(`הועתקו ${countCopied(changes)} עובדים ${source}. רק מי שלא היה רשום עודכן.`);
}

// Workers, not writes: a worker copied into two sites produced two changes on the same
// path, and reporting that as "2 workers copied" is simply wrong.
function countCopied(changes) {
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
function copyPreviousDay() {
    const from = lastRecordedDayBefore(State.schedule, State.date, State.layer);
    if (!from) {
        askTell('אין יום קודם עם רישום להעתיק ממנו.');
        return;
    }

    const parsed = parseLocalDate(from);
    const gapDays = Math.round((parseLocalDate(State.date) - parsed) / 86400000);
    copyDayInto(from, State.layer,
        `מ${hebrewDayName(parsed)} ${formatShortDate(parsed)}`,
        `אין מה להעתיק מ${formatShortDate(parsed)}.`,
        // Sites carry across any gap; absences only from the adjacent day, where
        // "he was out yesterday" still says something about today.
        { skipAbsences: gapDays > 1 });
}

// The button names the day it will copy from, because "the previous day" is a guess the
// person then has to check, and the whole point of the button is not having to.
function renderCopyButton() {
    const btn = document.getElementById('copyDayBtn');
    if (!btn) return;

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



