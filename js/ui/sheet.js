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

    // The sheet looks the same from worker to worker, so without a visible move the
    // only sign of the advance is a name changing in the corner - and the next tap
    // records a site against the wrong worker.
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
    document.getElementById('assignSheetMeta').textContent =
        `${position} מתוך ${workers.length} · ${State.unrecorded().length} נותרו`;

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
                    State.commit(unassignPlace(State.schedule, State.date, worker.id, State.layer, place.id));
                    renderAssignSheet();
                    return;
                }
                State.commit(assignPlace(State.schedule, State.date, worker.id, State.layer, place.id, RATE_NORMAL));
                // A second site in a day is normal here, so picking one cannot assume the
                // worker is finished - only move on when this is their first.
                if (entries.length === 0) advanceSheet();
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
                    State.commit(setRate(State.schedule, State.date, worker.id, State.layer,
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
                    State.commit(setRate(State.schedule, State.date, worker.id, State.layer,
                        entry.placeId, RATE_EXTRA, hours.value));
                    renderAssignSheet();
                });
                row.appendChild(hours);
            }

            rates.appendChild(row);
        });
        body.appendChild(rates);
    }

    const actions = el('div', 'sheet-actions');
    actions.appendChild(button(absent ? '✓ נעדר' : 'נעדר', absent ? 'chip-on' : 'btn-secondary', () => {
        if (absent) {
            State.commit(clearWorkerDay(State.schedule, State.date, worker.id, State.layer));
            renderAssignSheet();
            return;
        }
        State.commit(markAbsent(State.schedule, State.date, worker.id, State.layer));
        advanceSheet();
    }));
    actions.appendChild(button('דלג ›', 'btn-secondary', advanceSheet));
    actions.appendChild(button('סיום', 'btn-secondary', closeAssignSheet));
    body.appendChild(actions);
}

// ---------------------------------------------------------------- pickers

// Site-first entry: the picker stays open so a run of names can be tapped one after the
// other. Closing after each pick would triple the work for a site with eight people.
function openWorkerPicker(placeId) {
    pickerPlaceId = placeId;
    renderWorkerPicker();
    document.getElementById('workerPickerModal').style.display = 'flex';
}

function renderWorkerPicker() {
    const place = State.place(pickerPlaceId);
    if (!place) return;

    document.getElementById('workerPickerTitle').textContent = `הוסף עובדים ל${place.name}`;

    const container = document.getElementById('workerPickerList');
    container.innerHTML = '';

    const here = new Set(workersAtPlace(State.schedule, State.date, place.id, State.layer));
    const unrecorded = new Set(State.unrecorded().map(w => w.id));

    // Unrecorded first: those are the ones being looked for.
    const ordered = State.activeWorkers().slice().sort((a, b) => {
        const rank = worker => (here.has(worker.id) ? 2 : unrecorded.has(worker.id) ? 0 : 1);
        return rank(a) - rank(b);
    });

    ordered.forEach(worker => {
        const row = el('div', 'picker-row');
        const inHere = here.has(worker.id);

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
            const change = inHere
                ? unassignPlace(State.schedule, State.date, worker.id, State.layer, place.id)
                : assignPlace(State.schedule, State.date, worker.id, State.layer, place.id, RATE_NORMAL);
            State.commit(change);
            renderWorkerPicker();
        }));

        container.appendChild(row);
    });
}

function closeWorkerPicker() {
    document.getElementById('workerPickerModal').style.display = 'none';
    pickerPlaceId = null;
}

// The mirror of the site picker, for when a name in the tray is tapped instead.
function openPlacePicker(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    document.getElementById('placePickerTitle').textContent = `לאן הלך ${worker.name}?`;

    const container = document.getElementById('placePickerList');
    container.innerHTML = '';

    const current = new Set(entriesFor(State.schedule, State.date, workerId, State.layer)
        .map(entry => entry.placeId));

    State.activePlaces().forEach(place => {
        const inHere = current.has(place.id);
        container.appendChild(button(
            inHere ? `✓ ${place.name}` : place.name,
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
function copyDayInto(fromDate, fromLayer, source, empty) {
    const targets = State.unrecorded();
    if (targets.length === 0) {
        askTell('כל העובדים כבר טופלו ביום הזה.');
        return;
    }

    const changes = [];
    targets.forEach(worker => {
        if (isAbsent(State.schedule, fromDate, worker.id, fromLayer)) {
            changes.push(markAbsent(State.schedule, State.date, worker.id, State.layer));
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
    // State.commitMany.
    State.commitMany(changes);
    askTell(`הועתקו ${countCopied(changes)} עובדים ${source}. רק מי שלא היה רשום עודכן.`);
}

// Workers, not writes: a worker copied into two sites produced two changes on the same
// path, and reporting that as "2 workers copied" is simply wrong.
function countCopied(changes) {
    return new Set(changes.map(change => change.path)).size;
}

// Not "copy last week" - the roster does not repeat weekly here. But two consecutive days
// often look alike, and starting from yesterday and fixing the differences is quicker.
function copyPreviousDay() {
    const previous = parseLocalDate(State.date);
    previous.setDate(previous.getDate() - 1);
    copyDayInto(toLocalDateStr(previous), State.layer, 'מהיום הקודם',
        'אין מה להעתיק מהיום הקודם.');
}



