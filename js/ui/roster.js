// Workers and sites.
//
// Archiving is the ordinary way out: history has to keep resolving, and a deleted worker
// would leave every past day pointing at a name that no longer exists - including days
// already invoiced.
//
// Deleting exists for one case only, and the model decides whether it applies: a name
// typed by mistake, with nothing at all recorded against him AND provably made on this
// phone and never sent anywhere. See workerFootprint in js/model/schema.js for the first
// half and the provenance block in js/sync/sync.js for the second.
//
// The second half is not caution, it is the only honest reading of what this device can
// know. Once an id has left here, another phone can be holding a day for him recorded
// while it was offline - hours old, arriving tomorrow - and nothing on this screen can
// see it. Deleting on the strength of "nothing is recorded THAT I CAN SEE" is how a
// day of somebody's work ends up in the document belonging to nobody. So a man who has
// been shared is archived, never deleted, and his identity is kept.
//
// Neither action is offered in the list - both live inside the worker's own screen,
// where his name is on the dialog and there is room to say what each one does.

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
//
// The move is measured in the ACTIVE list, not in the array.
//
// The array holds archived men too, in among the others, and they are not on this screen:
// [A, X-archived, B] moved A down one array slot and left the visible order reading A, B
// exactly as before. The order really had changed - the write went out, the other phones
// took it - and on screen nothing whatever happened, so the answer was to press it again,
// and again. One press has to be one visible change or it is not a control.
//
// Swapping the two ACTIVE men, rather than shuffling one slot, is also what keeps the
// archived rows where they were: they are not part of this order and must not be dragged
// around by it.
function moveWorker(workerId, direction) {
    const workers = State.schedule.workers;
    const active = workers
        .map((worker, index) => ({ worker, index }))
        .filter(item => item.worker.active !== false);

    const at = active.findIndex(item => item.worker.id === workerId);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= active.length) return;

    const here = active[at].index;
    const there = active[to].index;
    const held = workers[here];
    workers[here] = workers[there];
    workers[there] = held;

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
    const problem = document.getElementById('workerFormError');
    const read = () => ({
        name: document.getElementById('workerFormName').value.trim(),
        idNumber: document.getElementById('workerFormId').value.trim(),
        phone: document.getElementById('workerFormPhone').value.trim(),
        dailyRate: Number(document.getElementById('workerFormDaily').value) || 0,
        hourlyRate: Number(document.getElementById('workerFormHourly').value) || 0
    });

    if (!read().name) {
        // Beside the field, not in a dialog over it: the person is looking at the field.
        problem.textContent = 'נא להזין שם עובד.';
        document.getElementById('workerFormName').focus();
        return;
    }
    problem.textContent = '';

    // Both questions are asked against the schedule as it is at the moment of asking, and
    // asked AGAIN after every answer. A confirmation is open for as long as somebody takes
    // to read it, and another phone's snapshot can replace the whole schedule in that gap:
    // the clash that was true when the question went up can be gone, a new one can have
    // appeared, and the man being edited can have been archived or removed outright.
    //
    // Two workers called the same thing is realistic - and the day screen shows nothing
    // but names, so from that point on nobody can tell which row is whose, including at
    // the moment their pay is worked out. It is allowed, but never by accident.
    const askedAbout = { name: null, phone: null };

    for (let round = 0; round < 4; round += 1) {
        const typed = read();
        if (!typed.name) {
            problem.textContent = 'נא להזין שם עובד.';
            document.getElementById('workerFormName').focus();
            return;
        }

        // The man himself, re-fetched. Editing a worker a snapshot has taken away must
        // not write into an object nothing is holding any more - Object.assign(null, ...)
        // throws, and the throw lands in the middle of a save with the form still open.
        if (editingWorkerId && !State.worker(editingWorkerId)) {
            closeWorkerForm();
            render();
            await askTell({
                title: 'העובד כבר אינו ברשימה',
                message: 'מכשיר אחר הסיר או שינה את העובד הזה בזמן העריכה, ולכן העריכה לא נשמרה.'
            });
            return;
        }

        const clash = State.schedule.workers.find(worker =>
            worker.id !== editingWorkerId && worker.active !== false
            && worker.name === typed.name);
        if (clash && askedAbout.name !== typed.name) {
            const go = await askConfirm({
                title: `כבר יש עובד בשם ${typed.name}`,
                message: 'במסך היומי רואים רק שמות, ואי אפשר יהיה להבדיל ביניהם. עדיף להוסיף שם משפחה או כינוי.',
                ok: 'הוסף בכל זאת'
            });
            if (!go) {
                document.getElementById('workerFormName').focus();
                return;
            }
            askedAbout.name = typed.name;
            continue;
        }

        // The number is the thing that tells two men with one name apart, so the same
        // number twice is usually the same man entered twice. Archived rows count: the
        // one about to be added again is exactly the one the daily list is not showing.
        const sharing = workersSharingPhone(State.schedule, typed.phone, editingWorkerId);
        if (sharing.length > 0 && askedAbout.phone !== normalisePhone(typed.phone)) {
            const names = sharing
                .map(worker => worker.active === false ? `${worker.name} (בארכיון)` : worker.name)
                .join(', ');
            const go = await askConfirm({
                title: `הטלפון הזה כבר רשום אצל ${names}`,
                message: `${typed.name} והמספר ${typed.phone} - בדרך כלל זה אותו אדם שנרשם פעמיים, ` +
                    'ואז חצי מהימים נרשמים על השורה שאף אחד לא מסתכל עליה. ' +
                    'אפשר להמשיך אם באמת מדובר בשני אנשים.',
                ok: 'שמור בכל זאת'
            });
            if (!go) {
                document.getElementById('workerFormPhone').focus();
                return;
            }
            askedAbout.phone = normalisePhone(typed.phone);
            continue;
        }

        // Nothing left to ask, and everything just checked against the state that is
        // about to be written to.
        if (editingWorkerId) {
            const worker = State.worker(editingWorkerId);
            if (!worker) continue;
            Object.assign(worker, typed);
        } else {
            State.schedule.workers.push(Object.assign(
                { id: State.nextWorkerId(), active: true }, typed));
        }

        closeWorkerForm();
        State.commitRoster();
        render();
        return;
    }

    // Four rounds of the two questions and the state is still moving under us. Better to
    // say so than to keep asking the same thing.
    problem.textContent = 'הנתונים השתנו במכשיר אחר בזמן העריכה. נסה שוב.';
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

    const blocked = deletionBlockers(worker.id);

    box.appendChild(button('🗄️ העבר לארכיון', 'btn-secondary',
        () => setWorkerArchived(worker.id, true)));

    // Deleting is offered only when nothing anywhere names him and nowhere else has ever
    // heard of him. Anything else and the button is not there to be pressed by mistake -
    // the sentence under it says which of those it is.
    if (blocked.length === 0) {
        box.appendChild(button('🗑️ מחק עובד', 'btn-danger', () => deleteWorker(worker.id)));
        box.appendChild(el('p', 'hint',
            'הוא לא נשלח לשום מכשיר אחר ואין לו רישומים, ולכן אפשר למחוק אותו לגמרי.'));
        return;
    }

    box.appendChild(el('p', 'hint', whyNotDeletable(blocked)));
}

// Every reason this man cannot be permanently deleted, asked of the model and of the
// queue rather than of the screen. Empty means deletable. Read in two places on purpose:
// once to decide what to draw, and again at the moment of the write - a snapshot can
// arrive while the confirmation is open.
function deletionBlockers(workerId) {
    const footprint = workerFootprint(State.schedule, workerId);
    const sync = typeof FarkadSync !== 'undefined' ? FarkadSync : null;
    const blocked = [];

    if (footprint.days.length > 0) blocked.push(`${footprint.days.length} ימים רשומים`);
    if (footprint.advances.length > 0) blocked.push(`${footprint.advances.length} מקדמות`);
    if (sync && sync.queueNamesWorker && sync.queueNamesWorker(workerId)) {
        blocked.push('רישומים שממתינים לשליחה');
    }
    if (sync && sync.pendingReplace && sync.pendingReplace()) {
        blocked.push('שחזור שממתין להסתיים');
    }
    // The one that is not about this device at all: unless this device can PROVE it made
    // him and PROVE he never left, he is archived. Absent proof is not proof of absence -
    // a phone upgrading from v78 has no record of anybody, and every one of those workers
    // may be on two other phones right now.
    if (!(sync && sync.provenLocalOnly && sync.provenLocalOnly('workers', workerId))) {
        blocked.push('אי אפשר להוכיח שהוא נוצר כאן ולא נשלח לשום מקום');
    }
    return blocked;
}

function whyNotDeletable(blocked) {
    return `${blocked.join(', ')} - אי אפשר למחוק, רק להעביר לארכיון. ` +
        'הכל יישמר בדוחות ההיסטוריים.';
}

// Out of the crew, and nothing else. Every day, every rate and every advance stays where
// it is; the reports still resolve his name on days that were already invoiced.
//
// Everything after the await is done against the schedule as it is THEN. A confirmation
// is open for as long as somebody takes to read it, and a snapshot arriving in that gap
// replaces State.schedule outright - so the worker captured before the question was
// asked can be an object no longer in the list, and writing to it changes nothing that
// is on screen while every line here reports success.
async function setWorkerArchived(workerId, archived) {
    const before = State.worker(workerId);
    if (!before) return;

    if (archived) {
        const owed = openAdvanceBalance(State.schedule, workerId);
        const go = await askConfirm({
            title: `להעביר את ${before.name} לארכיון?`,
            message: 'הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.'
                // What the record actually says, and nothing beyond it. It used to read
                // "שטרם קוזזו" - not yet deducted - and the schema has no such state:
                // an advance is an amount on a date, with nothing anywhere marking it
                // paid, open or settled. The sentence was inventing a fact about
                // somebody's money in the one dialog people read carefully.
                + (owed ? `\n\nרשומות לו ${owed.count} מקדמות בסך ${Math.round(owed.total)} ₪.` : ''),
            ok: 'לארכיון'
        });
        if (!go) return;
    }

    // Fetched again, by id, from the schedule as it is now.
    const worker = State.worker(workerId);
    if (!worker) {
        render();
        await askTell({
            title: 'לא בוצע',
            message: 'העובד כבר אינו ברשימה במכשיר הזה. ייתכן שמכשיר אחר שינה את הצוות.'
        });
        return;
    }

    // Already where it was going. Nothing to write, and nothing to announce - a dialog
    // that closes saying "done" over a change somebody else made is how two people end
    // up sure they each did it.
    if (worker.active === !archived) {
        closeWorkerForm();
        render();
        return;
    }

    // Restoring somebody into a crew that already has his name or his number. Said before
    // the write, because two indistinguishable rows in the daily list is a mistake that
    // gets recorded against the wrong man before anybody notices it.
    //
    // Recomputed after EVERY answer, and against the schedule as it is then: a snapshot
    // can arrive while the question is up, and the crew it lands with may have a clash the
    // first question knew nothing about - or may have resolved the one it asked about.
    if (!archived) {
        const answered = { name: null, phone: null };

        for (let round = 0; round < 4; round += 1) {
            const live = State.worker(workerId);
            if (!live || live.active !== false) { render(); return; }

            const named = State.schedule.workers.filter(item =>
                item.id !== live.id && item.active !== false
                && String(item.name).trim() === String(live.name).trim());
            if (named.length > 0 && answered.name !== String(live.name).trim()) {
                const go = await askConfirm({
                    title: `כבר יש עובד פעיל בשם ${live.name}`,
                    message: 'שני עובדים באותו שם ברשימה היומית - קל לרשום יום על השם הלא נכון. ' +
                        'אפשר להחזיר אותו ואז לשנות את השם.',
                    ok: 'החזר בכל זאת'
                });
                if (!go) return;
                answered.name = String(live.name).trim();
                continue;
            }

            const sharing = workersSharingPhone(State.schedule, live.phone, live.id)
                .filter(item => item.active !== false);
            if (sharing.length > 0 && answered.phone !== normalisePhone(live.phone)) {
                const go = await askConfirm({
                    title: `הטלפון של ${live.name} רשום גם אצל ${sharing.map(item => item.name).join(', ')}`,
                    message: 'אותו מספר על שתי שורות פעילות זה בדרך כלל אותו אדם פעמיים. ' +
                        'אפשר להחזיר אותו אם באמת מדובר בשני אנשים.',
                    ok: 'החזר בכל זאת'
                });
                if (!go) return;
                answered.phone = normalisePhone(live.phone);
                continue;
            }

            break;
        }
    }

    const live = State.worker(workerId);
    const was = live.active;
    live.active = !archived;
    // commitRoster puts the screen back and says so if the write did not land, so a
    // failure here cannot leave the list showing something the disk does not hold.
    if (!State.commitRoster()) {
        live.active = was;
        render();
        return;
    }
    closeWorkerForm();
    render();
}

// For the name typed by mistake on a phone that has never told anybody about him, and
// only that. deletionBlockers decides; this function asks it again at the write.
async function deleteWorker(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    if (deletionBlockers(workerId).length > 0) return refuseDeletion();

    // By NAME, typed. The button was drawn once and this is permanent: a confirmation
    // that is one more tap in the same place as the last tap is not a decision, and the
    // difference between archiving and deleting is the whole of what this screen does.
    const typed = await askText({
        title: `למחוק את ${worker.name}?`,
        message: 'המחיקה סופית. להמשיך - הקלד את שם העובד במדויק.',
        placeholder: worker.name,
        ok: 'מחק לצמיתות',
        validate: value => (String(value).trim() === String(worker.name).trim()
            ? null : 'השם אינו זהה.')
    });
    if (typed === null) return;

    // Everything, again, against the schedule as it is now - including the man himself,
    // who can have been archived or removed on another phone while the box was open.
    const live = State.worker(workerId);
    if (!live) { render(); return; }
    if (String(live.name).trim() !== String(worker.name).trim()) return refuseDeletion();
    if (deletionBlockers(workerId).length > 0) return refuseDeletion();

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

function refuseDeletion() {
    renderWorkerFormActions();
    return askTell({
        title: 'לא נמחק',
        message: 'בינתיים השתנה משהו על שמו, ולכן אי אפשר למחוק אותו. אפשר להעביר לארכיון - ' +
            'כל הימים והמקדמות שלו יישמרו.'
    });
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
