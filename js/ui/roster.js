// Workers and sites. Both are archived rather than deleted: history has to keep
// resolving, and a deleted worker would leave every past day pointing at a name that no
// longer exists - including days already invoiced.

function renderRoster() {
    renderWorkerList();
    renderPlaceList();
    renderBackupAge();
    renderRestorePoints();
    renderCloudRestorePoints();
}

function renderWorkerList() {
    const container = document.getElementById('workerList');
    if (!container) return;
    clear(container);

    if (State.schedule.workers.length === 0) {
        container.appendChild(emptyHint('אין עובדים. הוסף עובד כדי להתחיל.'));
        return;
    }

    State.schedule.workers.forEach(worker => {
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
        const index = State.schedule.workers.indexOf(worker);
        const up = button('▲', 'btn-icon', () => moveWorker(worker.id, -1), `העלה את ${worker.name}`);
        up.disabled = index === 0;
        const down = button('▼', 'btn-icon', () => moveWorker(worker.id, 1), `הורד את ${worker.name}`);
        down.disabled = index === State.schedule.workers.length - 1;
        actions.appendChild(up);
        actions.appendChild(down);

        actions.appendChild(button('✏️', 'btn-icon', () => editWorker(worker.id), `ערוך ${worker.name}`));
        actions.appendChild(button(
            worker.active === false ? '↩️' : '🗄️',
            'btn-icon',
            () => toggleWorkerActive(worker.id),
            worker.active === false ? `החזר את ${worker.name}` : `העבר את ${worker.name} לארכיון`
        ));
        row.appendChild(actions);

        container.appendChild(row);
    });
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
    document.getElementById('workerFormModal').style.display = 'none';
    editingWorkerId = null;
}

async function toggleWorkerActive(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    if (worker.active !== false) {
        const yes = await askConfirm({
            title: `להעביר את ${worker.name} לארכיון?`,
            message: 'הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.',
            ok: 'לארכיון'
        });
        if (!yes) return;
    }

    worker.active = worker.active === false;
    State.commitRoster();
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
