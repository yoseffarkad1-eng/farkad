// Workers and sites.
//
// Archiving is the ordinary way out: history has to keep resolving, and a deleted worker
// would leave every past day pointing at a name that no longer exists - including days
// already invoiced.
//
// Deleting exists for one case only, and the model decides whether it applies: a name
// typed by mistake, or a man added twice, with nothing at all recorded against him. See
// workerFootprint in js/model/schema.js. Neither action is offered in the list any more -
// both live inside the worker's own screen, where his name is on the dialog and there is
// room to say what each one does.

function renderRoster() {
    renderWorkerList();
    renderPlaceList();
    renderBackupAge();
    renderRestorePoints();
    renderCloudRestorePoints();
    renderAppVersion();
}

function renderAppVersion() {
    const node = document.getElementById('appVersion');
    if (node) node.textContent = `גרסה ${APP_VERSION}`;
}

function renderWorkerList() {
    const container = document.getElementById('workerList');
    if (!container) return;
    clear(container);

    if (State.schedule.workers.length === 0) {
        container.appendChild(emptyHint('אין עובדים. הוסף עובד כדי להתחיל.'));
        return;
    }

    const active = State.schedule.workers.filter(worker => worker.active !== false);
    const archived = State.schedule.workers.filter(worker => worker.active === false);

    if (active.length === 0) {
        container.appendChild(emptyHint('כל העובדים בארכיון.'));
    }
    active.forEach(worker => container.appendChild(workerRow(worker)));

    if (archived.length === 0) return;

    // Folded, and at the bottom. They are not part of the working list any more, and a
    // crew of six that reads as a crew of eleven is a crew somebody counts wrong.
    const box = el('details', 'roster-archive');
    const summary = el('summary', null, `ארכיון עובדים (${archived.length})`);
    box.appendChild(summary);
    archived.forEach(worker => box.appendChild(workerRow(worker)));
    container.appendChild(box);
}

function workerRow(worker) {
    const row = el('div', worker.active === false ? 'roster-row roster-off' : 'roster-row');

    const details = el('div', 'roster-details');
    details.appendChild(el('strong', null, worker.name));
    if (worker.idNumber) {
        const line = el('div', 'roster-meta');
        line.appendChild(el('span', null, 'זהות: '));
        line.appendChild(ltr(worker.idNumber));
        details.appendChild(line);
    }
    if (worker.phone) {
        const line = el('div', 'roster-meta');
        line.appendChild(el('span', null, '📞 '));
        line.appendChild(ltr(worker.phone));
        details.appendChild(line);
    }
    if (worker.dailyRate) {
        const line = el('div', 'roster-meta');
        line.appendChild(el('span', null, 'יומי: '));
        line.appendChild(ltr(String(worker.dailyRate)));
        if (worker.hourlyRate) {
            line.appendChild(el('span', null, ' · שעה: '));
            line.appendChild(ltr(String(worker.hourlyRate)));
        }
        details.appendChild(line);
    }
    if (worker.active === false) details.appendChild(el('span', 'badge', 'לא פעיל'));
    // Pairs that already exist - from an import, or from before this was checked.
    if (worker.active !== false && hasDuplicateName(worker)) {
        details.appendChild(el('span', 'badge badge-warn', 'שם כפול'));
    }
    row.appendChild(details);

    const actions = el('div', 'roster-actions');

    // Roster order is the order every other screen reads in - the day list, the
    // sheet's run through the names, the pay sheet. Being able to set it puts the
    // men who are recorded every single day at the top, where they are reached
    // first. Arrows rather than dragging: a drag on a phone, held by a thumb over a
    // list that scrolls, moves the wrong name often enough to be its own problem.
    // Only for the men who are actually on the daily screen. An archived name has no
    // place in that order, and an arrow that lifted one out of the archive and back into
    // the crew would be a very quiet way to put somebody back to work.
    if (worker.active !== false) {
        const active = State.schedule.workers.filter(other => other.active !== false);
        const index = active.indexOf(worker);
        const up = button('▲', 'btn-icon', () => moveWorker(worker.id, -1), `העלה את ${worker.name}`);
        up.disabled = index === 0;
        const down = button('▼', 'btn-icon', () => moveWorker(worker.id, 1), `הורד את ${worker.name}`);
        down.disabled = index === active.length - 1;
        actions.appendChild(up);
        actions.appendChild(down);
    }

    // No archive icon here any more. Beside every name it was one mis-tap away from
    // taking a man off the daily screen mid-evening, and the pencil next to it opens
    // the screen where the same thing can be done deliberately, with his name on it.
    actions.appendChild(button('✏️', 'btn-icon', () => editWorker(worker.id), `ערוך ${worker.name}`));
    row.appendChild(actions);

    return row;
}

// The roster is one array and its order is the whole point, so a move is a whole-list
// write rather than a per-field one - there is no field path that means "the order
// changed". It goes through commitRoster, which sends the two roster fields and not the
// whole document: reordering mid-evening must not overwrite the other two phones' work.
function moveWorker(workerId, direction) {
    const workers = State.schedule.workers;
    const from = workers.findIndex(worker => worker.id === workerId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= workers.length) return;

    workers.splice(to, 0, workers.splice(from, 1)[0]);
    State.commitRoster();
    render();
}

function hasDuplicateName(worker) {
    return State.schedule.workers.some(other =>
        other.id !== worker.id && other.active !== false && other.name === worker.name);
}

function ltr(value) {
    const node = el('bdi', null, value);
    node.setAttribute('dir', 'ltr');
    return node;
}

function renderPlaceList() {
    const container = document.getElementById('placeList');
    if (!container) return;
    clear(container);

    if (State.schedule.places.length === 0) {
        container.appendChild(emptyHint('אין אתרי עבודה. הוסף אתר כדי להתחיל.'));
        return;
    }

    State.schedule.places.forEach(place => {
        const row = el('div', place.active === false ? 'roster-row roster-off' : 'roster-row');

        const details = el('div', 'roster-details');
        // The site list is where the colour is learned, so it is shown here in the same
        // badge the day screen uses rather than as plain text.
        const tag = el('strong', 'tag tag-place');
        appendSiteName(tag, place.id, place.name);
        paintSite(tag, place.id);
        details.appendChild(tag);
        if (place.active === false) details.appendChild(el('span', 'badge', 'לא פעיל'));
        row.appendChild(details);

        const actions = el('div', 'roster-actions');
        actions.appendChild(button('✏️', 'btn-icon', () => renamePlaceById(place.id), `שנה שם ${place.name}`));
        actions.appendChild(button(
            place.active === false ? '↩️' : '🗄️',
            'btn-icon',
            () => togglePlaceActive(place.id),
            place.active === false ? `החזר את ${place.name}` : `העבר את ${place.name} לארכיון`
        ));
        row.appendChild(actions);

        container.appendChild(row);
    });
}

// ---------------------------------------------------------------- workers

let editingWorkerId = null;

function showAddWorkerModal() {
    editingWorkerId = null;
    document.getElementById('workerFormTitle').textContent = 'הוסף עובד';
    document.getElementById('workerFormName').value = '';
    document.getElementById('workerFormId').value = '';
    document.getElementById('workerFormPhone').value = '';
    document.getElementById('workerFormDaily').value = '';
    document.getElementById('workerFormHourly').value = '';
    document.getElementById('workerFormError').textContent = '';
    renderWorkerFormActions();
    document.getElementById('workerFormModal').style.display = 'flex';
}

function editWorker(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    editingWorkerId = workerId;
    document.getElementById('workerFormTitle').textContent = 'עריכת עובד';
    document.getElementById('workerFormName').value = worker.name;
    document.getElementById('workerFormId').value = worker.idNumber || '';
    document.getElementById('workerFormPhone').value = worker.phone || '';
    document.getElementById('workerFormDaily').value = worker.dailyRate || '';
    document.getElementById('workerFormHourly').value = worker.hourlyRate || '';
    document.getElementById('workerFormError').textContent = '';
    // Folded details that hold data would look like data that was lost.
    document.getElementById('workerFormMore').open =
        Boolean(worker.phone || worker.idNumber || worker.hourlyRate);
    renderWorkerFormActions();
    document.getElementById('workerFormModal').style.display = 'flex';
}

async function saveWorkerForm() {
    const name = document.getElementById('workerFormName').value.trim();
    const problem = document.getElementById('workerFormError');
    if (!name) {
        // Beside the field, not in a dialog over it: the person is looking at the field.
        problem.textContent = 'נא להזין שם עובד.';
        document.getElementById('workerFormName').focus();
        return;
    }
    problem.textContent = '';

    // Two workers called the same thing is realistic - and the day screen shows nothing
    // but names, so from that point on nobody can tell which row is whose, including at
    // the moment their pay is worked out. It is allowed, but never by accident.
    const clash = State.schedule.workers.find(worker =>
        worker.id !== editingWorkerId && worker.active !== false && worker.name === name);
    if (clash) {
        const go = await askConfirm({
            title: `כבר יש עובד בשם ${name}`,
            message: 'במסך היומי רואים רק שמות, ואי אפשר יהיה להבדיל ביניהם. עדיף להוסיף שם משפחה או כינוי.',
            ok: 'הוסף בכל זאת'
        });
        if (!go) {
            document.getElementById('workerFormName').focus();
            return;
        }
    }

    const idNumber = document.getElementById('workerFormId').value.trim();
    const phone = document.getElementById('workerFormPhone').value.trim();
    const dailyRate = Number(document.getElementById('workerFormDaily').value) || 0;
    const hourlyRate = Number(document.getElementById('workerFormHourly').value) || 0;

    if (editingWorkerId) {
        const worker = State.worker(editingWorkerId);
        Object.assign(worker, { name, idNumber, phone, dailyRate, hourlyRate });
    } else {
        State.schedule.workers.push({
            id: State.nextWorkerId(), name, idNumber, phone, dailyRate, hourlyRate, active: true
        });
    }

    closeWorkerForm();
    State.commitRoster();
    render();
}

function closeWorkerForm() {
    // Guarded like every other node read in this file: the screen is not always there,
    // and the two actions below it must not fall over on their way out.
    const modal = document.getElementById('workerFormModal');
    if (modal) modal.style.display = 'none';
    editingWorkerId = null;
}

// ---------------------------------------------------------------- inside the worker's screen
//
// Both ways out live here, and which one is offered is not a choice this file makes - it
// asks the model what is recorded against the man and does what that allows.

function renderWorkerFormActions() {
    const box = document.getElementById('workerFormDanger');
    if (!box) return;
    clear(box);

    // A worker who has not been saved yet has nothing to archive and nothing to delete.
    if (!editingWorkerId) { box.style.display = 'none'; return; }
    const worker = State.worker(editingWorkerId);
    if (!worker) { box.style.display = 'none'; return; }
    box.style.display = '';

    if (worker.active === false) {
        box.appendChild(button('↩️ החזר לעבודה', 'btn-secondary',
            () => setWorkerArchived(worker.id, false)));
        box.appendChild(el('p', 'hint',
            'הימים והמקדמות שלו נשמרו כל הזמן הזה, והם יופיעו שוב במסך היומי.'));
        return;
    }

    const footprint = workerFootprint(State.schedule, worker.id);
    const queued = typeof FarkadSync !== 'undefined' && FarkadSync.queueNamesWorker
        ? FarkadSync.queueNamesWorker(worker.id) : false;
    const midTransaction = typeof FarkadSync !== 'undefined' && FarkadSync.pendingReplace
        ? Boolean(FarkadSync.pendingReplace()) : false;

    box.appendChild(button('🗄️ העבר לארכיון', 'btn-secondary',
        () => setWorkerArchived(worker.id, true)));

    // Deleting is offered only when there is nothing anywhere that names him: no day in
    // either layer, no advance, nothing still queued, and no restore in flight. Anything
    // else and the button is not there to be pressed by mistake - the sentence under it
    // says which of those it is.
    if (footprint.days.length === 0 && footprint.advances.length === 0
        && !queued && !midTransaction) {
        box.appendChild(button('🗑️ מחק עובד', 'btn-danger', () => deleteWorker(worker.id)));
        box.appendChild(el('p', 'hint', 'אין לו רישומים, ולכן אפשר למחוק אותו לגמרי.'));
        return;
    }

    box.appendChild(el('p', 'hint', whyNotDeletable(footprint, queued, midTransaction)));
}

function whyNotDeletable(footprint, queued, midTransaction) {
    const reasons = [];
    if (footprint.days.length > 0) reasons.push(`${footprint.days.length} ימים רשומים`);
    if (footprint.advances.length > 0) reasons.push(`${footprint.advances.length} מקדמות`);
    if (queued) reasons.push('רישומים שממתינים לשליחה');
    if (midTransaction) reasons.push('שחזור שממתין להסתיים');

    return `יש לו ${reasons.join(' ו')} - אי אפשר למחוק, רק להעביר לארכיון. ` +
        'הכל יישמר בדוחות ההיסטוריים.';
}

// Out of the crew, and nothing else. Every day, every rate and every advance stays where
// it is; the reports still resolve his name on days that were already invoiced.
async function setWorkerArchived(workerId, archived) {
    const worker = State.worker(workerId);
    if (!worker) return;

    if (archived) {
        const owed = openAdvanceBalance(State.schedule, workerId);
        const go = await askConfirm({
            title: `להעביר את ${worker.name} לארכיון?`,
            message: 'הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.'
                // Said before, not after. Putting a man away while he is still holding
                // cash is a thing somebody does by accident and finds out at settlement.
                + (owed ? `\n\n⚠️ יש לו ${owed.count} מקדמות בסך ${Math.round(owed.total)} שטרם קוזזו.` : ''),
            ok: 'לארכיון'
        });
        if (!go) return;
    }

    const was = worker.active;
    worker.active = !archived;
    // commitRoster puts the screen back and says so if the write did not land, so a
    // failure here cannot leave the list showing something the disk does not hold.
    if (!State.commitRoster()) {
        worker.active = was;
        render();
        return;
    }
    closeWorkerForm();
    render();
}

// For the name typed by mistake, and only that. renderWorkerFormActions has already
// established that nothing anywhere names him.
async function deleteWorker(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    // Checked AGAIN, here, at the moment of the write. The button was drawn when the
    // screen opened, and a snapshot from another phone can have arrived since with a day
    // recorded against this very man.
    const footprint = workerFootprint(State.schedule, workerId);
    const queued = typeof FarkadSync !== 'undefined' && FarkadSync.queueNamesWorker
        ? FarkadSync.queueNamesWorker(workerId) : false;
    if (footprint.days.length > 0 || footprint.advances.length > 0 || queued
        || (typeof FarkadSync !== 'undefined' && FarkadSync.pendingReplace
            && FarkadSync.pendingReplace())) {
        renderWorkerFormActions();
        askTell({
            title: 'לא נמחק',
            message: 'בינתיים נרשם משהו על שמו, ולכן אי אפשר למחוק אותו. אפשר להעביר לארכיון.'
        });
        return;
    }

    // By name, because the dialog is the last thing between a tap and a man being gone.
    const go = await askConfirm({
        title: `למחוק את ${worker.name}?`,
        message: 'אין לו אף יום רשום ואף מקדמה, ולכן לא ייפגע שום דוח. ' +
            'המחיקה סופית - להחזיר אותו צריך להוסיף אותו מחדש.',
        ok: 'מחק'
    });
    if (!go) return;

    const before = State.schedule.workers.slice();
    State.schedule.workers = State.schedule.workers.filter(item => item.id !== workerId);

    // One write, through the ordinary safe path: the per-person tombstone, the order and
    // the legacy array all go into a single journal entry, so the three of them cannot
    // land apart. If it does not reach the disk, commitRoster puts the screen back and
    // nothing here says otherwise.
    if (!State.commitRoster({ workers: [workerId] })) {
        State.schedule.workers = before;
        render();
        return;
    }

    closeWorkerForm();
    render();
}

// ---------------------------------------------------------------- places

async function showAddPlaceModal() {
    const name = await askText({
        title: 'הוסף אתר עבודה',
        placeholder: 'שם האתר',
        ok: 'הוסף',
        // Checked while the dialog is open, so a duplicate name does not throw the typing
        // away and make the person start again.
        validate: value => validatePlaceName(value, null)
    });
    if (!name) return;

    State.schedule.places.push({ id: State.nextPlaceId(), name, active: true });
    State.commitRoster();
    render();
}

async function renamePlaceById(placeId) {
    const place = State.place(placeId);
    if (!place) return;

    // The value comes back trimmed, and the guard runs on the trimmed value: a single
    // space used to pass as a name and wipe every assignment that referenced it.
    const name = await askText({
        title: 'שם חדש לאתר',
        value: place.name,
        validate: value => validatePlaceName(value, placeId)
    });
    if (!name || name === place.name) return;

    // Renaming is safe now: assignments point at the id, so the name is only a label.
    place.name = name;
    State.commitRoster();
    render();
}

function validatePlaceName(name, ignoreId) {
    if (!name) return 'נא להזין שם לאתר.';
    if (State.schedule.places.some(p => p.id !== ignoreId && p.name === name)) {
        return 'אתר בשם זה כבר קיים.';
    }
    return null;
}

async function togglePlaceActive(placeId) {
    const place = State.place(placeId);
    if (!place) return;

    if (place.active !== false) {
        const yes = await askConfirm({
            title: `להעביר את ${place.name} לארכיון?`,
            message: 'הימים שכבר נרשמו יישמרו, והאתר לא יופיע ברשימת האתרים.',
            ok: 'לארכיון'
        });
        if (!yes) return;
    }

    place.active = place.active === false;
    State.commitRoster();
    render();
}
