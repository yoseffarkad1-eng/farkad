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
    // The backup, the restore points and the version live on הגדרות וכלים now - see
    // js/ui/settings.js. This screen is about people and sites; it was also about files,
    // which on a phone meant scrolling past thirty men to reach the backup button.
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

    if (reorderDraft) {
        renderReorderList(container, active);
        return;
    }

    if (active.length === 0) {
        container.appendChild(emptyHint('כל העובדים בארכיון.'));
    }
    active.forEach(worker => container.appendChild(workerRow(worker)));

    // The headings carry the counts: a crew is a NUMBER before it is a list, and the
    // number is the first thing checked against payday's.
    const workersHeading = document.getElementById('workersHeading');
    if (workersHeading) workersHeading.textContent = `עובדים פעילים (${active.length})`;
    const placesHeading = document.getElementById('placesHeading');
    if (placesHeading) {
        placesHeading.textContent =
            `אתרי עבודה (${State.schedule.places.filter(place => place.active !== false).length})`;
    }

    if (archived.length === 0) return;

    // Folded, and at the bottom. They are not part of the working list any more, and a
    // crew of six that reads as a crew of eleven is a crew somebody counts wrong.
    const box = el('details', 'roster-archive');
    // The count of archived men who still have advances on the books rides on the fold:
    // money does not go to the archive with the man, and a fold that hid it would be
    // where an open balance goes to be forgotten.
    // One pass over the advances, not a footprint walk per archived man: this render
    // runs on every pointermove of a reorder drag.
    const advanceHolders = new Set(
        Object.values(State.schedule.advances || {}).map(item => item && item.workerId));
    const owing = archived.filter(worker => advanceHolders.has(worker.id)).length;
    const summary = el('summary', null, owing === 0
        ? `ארכיון עובדים (${archived.length})`
        : `ארכיון עובדים (${archived.length}) · ` +
            (owing === 1 ? 'לאחד מהם יש מקדמה רשומה' : `ל-${owing} מהם יש מקדמות רשומות`));
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
    // One line for the phone and the rates - it is a list of thirty, and every extra
    // line per man is a screen of scrolling. A man with no phone says so, because a
    // blank next to a list of numbers reads as "somebody forgot", which is the case.
    const line = el('div', 'roster-meta');
    if (worker.phone) {
        line.appendChild(el('span', null, '📞 '));
        line.appendChild(ltr(worker.phone));
    } else {
        line.appendChild(el('span', null, 'בלי טלפון'));
    }
    if (worker.dailyRate) {
        line.appendChild(el('span', null, ' · יומי: '));
        line.appendChild(ltr(String(worker.dailyRate)));
        if (worker.hourlyRate) {
            line.appendChild(el('span', null, ' · שעה: '));
            line.appendChild(ltr(String(worker.hourlyRate)));
        }
    }
    details.appendChild(line);
    if (worker.active === false) details.appendChild(el('span', 'badge', 'לא פעיל'));
    // Pairs that already exist - from an import, or from before this was checked.
    if (worker.active !== false && hasDuplicateName(worker)) {
        details.appendChild(el('span', 'badge badge-warn', 'שם כפול'));
    }
    // A number two men share is how half the days end up on the row nobody reads: the
    // badge surfaces it on the LIST, where the duplicate is actually noticed - the
    // dialogs at edit time already ask about it.
    if (worker.phone && typeof workersSharingPhone === 'function'
        && workersSharingPhone(State.schedule, worker.phone, worker.id).length > 0) {
        details.appendChild(el('span', 'badge badge-warn', 'מספר משותף'));
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

    // No archive icon here any more. Beside every name it was one mis-tap away from
    // taking a man off the daily screen mid-evening, and the pencil next to it opens
    // the screen where the same thing can be done deliberately, with his name on it.
    actions.appendChild(button('✏️', 'btn-icon', () => editWorker(worker.id), `ערוך ${isolate(worker.name)}`));
    row.appendChild(actions);

    return row;
}

// ---------------------------------------------------------------- reorder mode
//
// Roster order is the order every other screen reads in: the day list, the sheet's run
// through the names, the pay sheet. Getting the men who are recorded every single day to
// the top is worth a screen of its own.
//
// The arrows beside every name were that screen, and they were wrong in two ways. Each
// press was a WRITE - one commitRoster, one cloud round trip, one entry in the queue -
// so moving somebody from the bottom of a crew of thirty to the top was twenty-nine
// writes, twenty-eight of which described an order nobody wanted. And they were beside
// the pencil, which meant the mis-tap that reorders the crew was one thumb-width from
// the one that opens a man's details.
//
// So: a mode. A DRAFT order that lives in memory, moved by dragging or by four buttons
// per row, saved once, and thrown away by cancelling. Nothing leaves this device until
// the person says the order is right.

// The draft, and what the crew looked like when it was taken. Both null when the mode is
// closed, which is also what every render below tests.
let reorderDraft = null;
let reorderBase = null;
// Where a drag started, so the row being carried can be drawn differently.
let reorderHeld = null;

function activeWorkerIds() {
    return State.schedule.workers
        .filter(worker => worker.active !== false)
        .map(worker => worker.id);
}

function openReorder() {
    reorderDraft = activeWorkerIds();
    reorderBase = reorderDraft.join();
    render();
    const list = document.getElementById('workerList');
    const first = list && list.querySelector('.reorder-row button');
    if (first && first.focus) first.focus();
}

function closeReorder() {
    reorderDraft = null;
    reorderBase = null;
    reorderHeld = null;
    const line = document.getElementById('reorderLive');
    if (line) line.textContent = '';
    render();
}

// How many rows sit somewhere other than where the crew's saved order has them. The
// footer counts it out loud, each moved row wears a badge, and the exit guard below
// asks about exactly this number.
function reorderMovedIds() {
    if (!reorderDraft || !reorderBase) return [];
    const base = reorderBase.split(',');
    return reorderDraft.filter((id, index) => base[index] !== id);
}

// The three-answer question at the door. Leaving a mode with unsaved work by switching
// tabs used to discard it without a word - and the third answer, staying, is the one a
// person who tapped the wrong tab actually wants.
async function confirmReorderExit() {
    if (!reorderDraft) return true;
    const moved = reorderMovedIds().length;
    if (moved === 0) { closeReorder(); return true; }

    // The harness loads roster.js without ask.js; a guard beats a ReferenceError that
    // would strand the draft open and pin the app to this tab.
    if (typeof askChoice !== 'function') { closeReorder(); return true; }
    const answer = await askChoice({
        title: 'יציאה מסידור העובדים',
        message: moved === 1
            ? 'שינית את הסדר של עובד אחד והשינוי עוד לא נשמר.'
            : `שינית את הסדר של ${moved} עובדים והשינויים עוד לא נשמרו.`,
        choices: ['שמירה ויציאה', 'יציאה בלי לשמור', 'הישארות']
    });
    if (answer === 'שמירה ויציאה') { saveReorder(); return reorderDraft === null; }
    if (answer === 'יציאה בלי לשמור') { closeReorder(); return true; }
    return false;
}

// The whole array, rebuilt from a draft order of the ACTIVE men.
//
// The archived rows keep the slots they already had: they are not part of this order and
// must not be dragged around by it - an archived man who moved to the top of the array
// would be back on the daily screen at the next merge, which is a very quiet way to put
// somebody back to work.
function reorderedWorkers(all, draftIds) {
    const byId = new Map(all.map(worker => [worker.id, worker]));
    const queue = draftIds.map(id => byId.get(id)).filter(Boolean);
    let next = 0;
    return all.map(worker =>
        (worker.active === false ? worker : (queue[next++] || worker)));
}

// Has the crew itself changed while this draft was open?
//
// Another phone can add a man, archive one, or delete one mid-reorder, and the snapshot
// in memory then describes a crew that no longer exists. Saving it would drop whoever
// arrived and resurrect whoever left - silently, because an order is not something
// anybody proof-reads. Compared as SETS: the order is exactly what is allowed to differ.
function reorderDraftStale(all, draftIds) {
    const now = all.filter(worker => worker.active !== false).map(worker => worker.id);
    if (now.length !== draftIds.length) return true;
    return now.slice().sort().join() !== draftIds.slice().sort().join();
}

// One move inside the draft. `to` is clamped rather than refused: a jump to the top from
// the top is not an error, it is a no-op, and saying so would be noise.
function moveDraftTo(workerId, to) {
    if (!reorderDraft) return;
    const at = reorderDraft.indexOf(workerId);
    if (at < 0) return;
    const target = Math.max(0, Math.min(reorderDraft.length - 1, to));
    if (target === at) return;
    reorderDraft.splice(at, 1);
    reorderDraft.splice(target, 0, workerId);
    renderWorkerList();
    announceReorder(workerId);
}

// Said out loud, for the person who cannot see the list move. The alternative is a screen
// where four buttons do something invisible.
function announceReorder(workerId) {
    const line = document.getElementById('reorderLive');
    if (!line || !reorderDraft) return;
    const worker = State.worker(workerId);
    if (!worker) return;
    line.textContent =
        `${isolate(worker.name)} במקום ${reorderDraft.indexOf(workerId) + 1} מתוך ${reorderDraft.length}`;
}

function saveReorder() {
    if (!reorderDraft) return;

    // Read the world again at the last moment, not at the first.
    if (reorderDraftStale(State.schedule.workers, reorderDraft)) {
        const fresh = activeWorkerIds();
        reorderDraft = fresh;
        reorderBase = fresh.join();
        render();
        askTell({
            title: 'רשימת העובדים השתנתה',
            message: 'מכשיר אחר הוסיף או הוציא עובד בזמן הסידור, ולכן הסדר לא נשמר. ' +
                'הרשימה שעל המסך מעודכנת - סדר אותה שוב ושמור.'
        });
        return;
    }

    if (reorderDraft.join() === reorderBase) {
        closeReorder();
        return;
    }

    State.schedule.workers = reorderedWorkers(State.schedule.workers, reorderDraft);

    // ONE write for the whole order, whatever it took to arrive at it.
    if (!State.commitRoster()) {
        // The order is still on screen and still in the draft: nothing has been lost,
        // and the storage notice already names the actual problem.
        askTell({
            title: 'הסדר לא נשמר',
            message: 'לא הצלחנו לכתוב את הסדר החדש במכשיר. הסדר שעל המסך נשמר כאן ' +
                'בינתיים - ייצא קובץ גיבוי, פנה מקום ונסה לשמור שוב.'
        });
        return;
    }
    closeReorder();
}

function renderReorderList(container, active) {
    const byId = new Map(active.map(worker => [worker.id, worker]));

    const head = el('div', 'reorder-head');
    head.appendChild(el('p', 'hint',
        'גרור בידית, או השתמש בכפתורים. שום דבר לא נשמר עד שלוחצים "שמירה ויציאה".'));
    container.appendChild(head);

    const list = el('div', 'reorder-list');
    list.setAttribute('role', 'list');

    reorderDraft.forEach((id, index) => {
        const worker = byId.get(id);
        if (!worker) return;
        list.appendChild(reorderRow(worker, index));
    });
    container.appendChild(list);

    const foot = el('div', 'reorder-foot');
    const moved = reorderMovedIds().length;
    if (moved > 0) {
        foot.appendChild(el('p', 'hint reorder-moved-count', moved === 1
            ? 'שינוי אחד לא נשמר'
            : `${moved} שינויים לא נשמרו`));
    }
    const save = button('שמירה ויציאה', 'btn-add', saveReorder);
    // Mid-drag the finger owns the list; a save that fires under it would write
    // whatever order the row happened to be passing through.
    save.disabled = Boolean(reorderDragging);
    foot.appendChild(save);
    // The explicit button IS the answer - asking "leave without saving?" back at the
    // person who just pressed exactly those words is a doubt loop, not a guard. The
    // guard exists for the implicit exits (a tab tapped mid-sort).
    foot.appendChild(button('יציאה בלי לשמור', 'btn-secondary', closeReorder));
    foot.appendChild(el('p', 'hint',
        'השמירה היא הכל או כלום - או שכל הסדר נשמר בבת אחת, או ששום דבר לא משתנה.'));
    container.appendChild(foot);
}

function reorderRow(worker, index) {
    const row = el('div', reorderHeld === worker.id ? 'reorder-row reorder-carrying' : 'reorder-row');
    row.setAttribute('role', 'listitem');
    row.dataset.workerId = worker.id;

    const handle = el('span', 'reorder-handle', '⠿');
    handle.setAttribute('aria-hidden', 'true');
    row.appendChild(handle);

    const name = el('div', 'reorder-name');
    name.appendChild(el('strong', null, worker.name));
    name.appendChild(el('span', 'reorder-place', `${index + 1} מתוך ${reorderDraft.length}`));
    // Which rows the unsaved count is counting - the answer to "what did I change?"
    // before deciding at the door.
    if (reorderBase && reorderBase.split(',')[index] !== worker.id) {
        name.appendChild(el('span', 'badge badge-warn reorder-changed', 'שונה'));
    }
    row.appendChild(name);

    const moves = el('div', 'reorder-moves');
    const jumpTop = button('⤒', 'btn-icon', () => moveDraftTo(worker.id, 0),
        `העבר את ${isolate(worker.name)} לראש הרשימה`);
    const up = button('▲', 'btn-icon', () => moveDraftTo(worker.id, index - 1),
        `העלה את ${isolate(worker.name)} מקום אחד`);
    const down = button('▼', 'btn-icon', () => moveDraftTo(worker.id, index + 1),
        `הורד את ${isolate(worker.name)} מקום אחד`);
    const jumpEnd = button('⤓', 'btn-icon', () => moveDraftTo(worker.id, reorderDraft.length - 1),
        `העבר את ${isolate(worker.name)} לסוף הרשימה`);
    jumpTop.disabled = index === 0;
    up.disabled = index === 0;
    down.disabled = index === reorderDraft.length - 1;
    jumpEnd.disabled = index === reorderDraft.length - 1;
    [jumpTop, up, down, jumpEnd].forEach(node => moves.appendChild(node));

    // The exact position, for a crew of thirty where "up one" thirty times is not a
    // control. Typed rather than dragged, and it is the same move underneath.
    moves.appendChild(button('מקום…', 'btn-secondary reorder-exact', () => askExactPlace(worker.id),
        `בחר מקום מדויק ל${isolate(worker.name)}`));
    row.appendChild(moves);

    row.addEventListener('pointerdown', event => startReorderDrag(event, worker.id));
    return row;
}

function askExactPlace(workerId) {
    const worker = State.worker(workerId);
    if (!worker || !reorderDraft) return;
    const total = reorderDraft.length;

    askText({
        title: `לאיזה מקום להעביר את ${isolate(worker.name)}?`,
        message: `מספר בין 1 ל-${total}.`,
        value: String(reorderDraft.indexOf(workerId) + 1)
    }).then(answer => {
        if (answer === null || answer === undefined || String(answer).trim() === '') return;
        const wanted = Number(String(answer).trim());
        if (!Number.isInteger(wanted) || wanted < 1 || wanted > total) {
            askTell(`המקום חייב להיות מספר שלם בין 1 ל-${total}.`);
            return;
        }
        moveDraftTo(workerId, wanted - 1);
    });
}

// Dragging, by pointer, on a list that scrolls.
//
// Not HTML5 drag-and-drop: it does not fire on touch at all, which is every phone this
// app runs on. Pointer events do, and they are the same three handlers for a mouse.
let reorderDragging = null;

function startReorderDrag(event, workerId) {
    // Only from the handle, and only with the primary button. Anywhere else on the row is
    // the buttons, and a drag that starts under a thumb resting on ▲ moves the wrong man.
    if (!event.target.classList || !event.target.classList.contains('reorder-handle')) return;
    if (event.button !== undefined && event.button !== 0) return;

    event.preventDefault();
    reorderHeld = workerId;
    reorderDragging = { workerId, scrolling: null };
    // The edge bands appear only while a row is actually in the air - painted, they say
    // where holding the row will scroll, and gone the moment the finger lets go.
    if (document.body && document.body.classList) document.body.classList.add('reorder-dragging');

    // Listeners BEFORE the render: a throw inside renderWorkerList must not leave the
    // drag armed with no way to end it - a stranded reorderDragging keeps the save
    // button disabled for the rest of the session.
    document.addEventListener('pointermove', onReorderDrag);
    document.addEventListener('pointerup', endReorderDrag);
    document.addEventListener('pointercancel', endReorderDrag);
    renderWorkerList();
}

function onReorderDrag(event) {
    if (!reorderDragging || !reorderDraft) return;
    event.preventDefault();

    // The row the pointer is over, decided by midpoints rather than by hit testing: the
    // row being carried is under the finger, so hit testing always returns itself.
    const rows = [...document.querySelectorAll('#workerList .reorder-row')];
    let target = reorderDraft.length - 1;
    for (let i = 0; i < rows.length; i += 1) {
        const box = rows[i].getBoundingClientRect();
        if (event.clientY < box.top + box.height / 2) { target = i; break; }
    }

    if (reorderDraft.indexOf(reorderDragging.workerId) !== target) {
        moveDraftTo(reorderDragging.workerId, target);
    }

    autoScrollWhileDragging(event.clientY);
}

// A list of thirty does not fit a phone, and a finger holding a row cannot also scroll.
// So the page moves when the row is carried near either edge.
function autoScrollWhileDragging(clientY) {
    const edge = 90;
    const height = window.innerHeight || 0;
    let step = 0;
    if (clientY < edge) step = -14;
    else if (clientY > height - edge) step = 14;

    if (step === 0) {
        if (reorderDragging && reorderDragging.scrolling) {
            clearInterval(reorderDragging.scrolling);
            reorderDragging.scrolling = null;
        }
        return;
    }
    if (!reorderDragging || reorderDragging.scrolling) return;
    reorderDragging.scrolling = setInterval(() => window.scrollBy(0, step), 16);
}

function endReorderDrag() {
    if (document.body && document.body.classList) document.body.classList.remove('reorder-dragging');
    if (reorderDragging && reorderDragging.scrolling) clearInterval(reorderDragging.scrolling);
    reorderDragging = null;
    reorderHeld = null;
    document.removeEventListener('pointermove', onReorderDrag);
    document.removeEventListener('pointerup', endReorderDrag);
    document.removeEventListener('pointercancel', endReorderDrag);
    renderWorkerList();
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
        actions.appendChild(button('✏️', 'btn-icon', () => renamePlaceById(place.id), `שנה שם ${isolate(place.name)}`));
        actions.appendChild(button(
            place.active === false ? '↩️' : '🗄️',
            'btn-icon',
            () => togglePlaceActive(place.id),
            place.active === false ? `החזר את ${isolate(place.name)}` : `העבר את ${isolate(place.name)} לארכיון`
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
                .map(worker => worker.active === false ? `${isolate(worker.name)} (בארכיון)` : worker.name)
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
        //
        // The write happens FIRST and its answer decides the rest. Closing the form and
        // then committing meant a refused write - a full disk, a journal that would not
        // take it - left the person looking at a list without their edit in it and a form
        // that had already thrown away everything they typed. There is nothing to retype
        // from at that point.
        let undo = null;
        if (editingWorkerId) {
            const worker = State.worker(editingWorkerId);
            if (!worker) continue;
            const before = {
                name: worker.name, idNumber: worker.idNumber, phone: worker.phone,
                dailyRate: worker.dailyRate, hourlyRate: worker.hourlyRate
            };
            undo = () => Object.assign(worker, before);
            Object.assign(worker, typed);
        } else {
            const added = Object.assign({ id: State.nextWorkerId(), active: true }, typed);
            State.schedule.workers.push(added);
            undo = () => {
                State.schedule.workers = State.schedule.workers.filter(item => item !== added);
            };
        }

        if (!State.commitRoster()) {
            undo();
            render();
            // The form stays open, with every field exactly as it was typed.
            problem.textContent = 'לא הצלחנו לשמור במכשיר. הפרטים נשארו כאן - נסה שוב.';
            return;
        }

        closeWorkerForm();
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

        // A typo does not become undeletable by being archived. If the same proof holds -
        // made here, never sent anywhere, no day, no advance, nothing queued and no
        // restore in flight - then he is still a name that was typed by mistake, and
        // leaving him in the archive for ever is not tidier, it is just clutter that
        // somebody has to read past every time they open this screen.
        //
        // Everybody else stays archive-only, and the sentence says which of the two he is.
        const archivedBlockers = deletionBlockers(worker.id);
        if (archivedBlockers.length === 0) {
            box.appendChild(button('🗑️ מחק עובד', 'btn-danger', () => deleteWorker(worker.id)));
            box.appendChild(el('p', 'hint',
                'הוא לא נשלח לשום מכשיר אחר ואין לו רישומים, ולכן אפשר למחוק אותו לגמרי.'));
        } else {
            box.appendChild(el('p', 'hint', whyNotDeletable(archivedBlockers)));
        }
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
    // The enumeration names WHICH blocker; the rule after it stays causeless, because
    // the blockers are not all history - a provenance gap is not היסטוריה, and a
    // sentence that asserts the wrong cause teaches the wrong rule.
    return `${blocked.join(', ')}. אי אפשר למחוק, רק להעביר לארכיון - ` +
        'כך דוחות ותשלומי עבר נשמרים תמיד.';
}

// Said out loud, every time. Returning in silence here leaves somebody looking at a
// screen where the thing they just tapped simply did not happen, and no reason for it.
function workerMovedAway() {
    render();
    return askTell({
        title: 'העובד כבר אינו ברשימה',
        message: 'מכשיר אחר הסיר או שינה את העובד הזה בזמן השאלה, ולכן לא בוצע שינוי.'
    });
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
        let settled = false;

        for (let round = 0; round < 4; round += 1) {
            const live = State.worker(workerId);
            if (!live || live.active !== false) return workerMovedAway();

            // Captured BEFORE the question, and that is the whole of what was agreed to.
            // Reading it back off the worker afterwards records whatever he has become
            // in the meantime - so a snapshot that renamed him while the dialog was open
            // came out the far side as a name somebody had approved, when nobody had
            // ever seen it.
            const askedName = String(live.name).trim();
            const askedPhone = normalisePhone(live.phone);

            const named = State.schedule.workers.filter(item =>
                item.id !== live.id && item.active !== false
                && String(item.name).trim() === askedName);
            if (named.length > 0 && answered.name !== askedName) {
                const go = await askConfirm({
                    title: `כבר יש עובד פעיל בשם ${live.name}`,
                    message: 'שני עובדים באותו שם ברשימה היומית - קל לרשום יום על השם הלא נכון. ' +
                        'אפשר להחזיר אותו ואז לשנות את השם.',
                    ok: 'החזר בכל זאת'
                });
                if (!go) return;
                answered.name = askedName;
                continue;
            }

            const sharing = workersSharingPhone(State.schedule, live.phone, live.id)
                .filter(item => item.active !== false);
            if (sharing.length > 0 && answered.phone !== askedPhone) {
                const go = await askConfirm({
                    title: `הטלפון של ${live.name} רשום גם אצל ${sharing.map(item => item.name).join(', ')}`,
                    message: 'אותו מספר על שתי שורות פעילות זה בדרך כלל אותו אדם פעמיים. ' +
                        'אפשר להחזיר אותו אם באמת מדובר בשני אנשים.',
                    ok: 'החזר בכל זאת'
                });
                if (!go) return;
                answered.phone = askedPhone;
                continue;
            }

            settled = true;
            break;
        }

        // Four rounds and the crew is still moving under the questions. Falling out of
        // the loop and writing anyway would put him back into a clash nobody agreed to -
        // the last question asked was about a state that has already been replaced.
        if (!settled) {
            render();
            await askTell({
                title: 'לא הוחזר לעבודה',
                message: 'הצוות משתנה כרגע ממכשיר אחר, ולכן לא הצלחנו לבדוק התנגשויות. ' +
                    'נסה שוב בעוד רגע - הוא נשאר בארכיון, וכל הימים והמקדמות שלו שמורים.'
            });
            return;
        }
    }

    // Fetched again, after every question. A snapshot answered while somebody was reading
    // the last dialog can have taken him away entirely, and reading .active off nothing is
    // an exception in the middle of a write.
    const live = State.worker(workerId);
    if (!live) return workerMovedAway();
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
    // The message names the four things that were just checked - no day, no advance,
    // nothing queued - because "it is final" alone does not say WHY this one man may be
    // deleted when every other one may not. The footer makes the one promise the write
    // path actually keeps.
    const typed = await askText({
        title: 'מחיקת עובד',
        message: `ל${isolate(worker.name)} אין אף יום רשום, אף מקדמה ואף רישום שממתין ` +
            'לשליחה. המחיקה סופית ולא ניתנת לשחזור. לאישור, הקלד את שם העובד במדויק:',
        placeholder: worker.name,
        ok: 'מחיקה סופית',
        footer: 'נשמר במכשיר ויסתנכרן כשיש חיבור.',
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
            title: `להעביר את ${isolate(place.name)} לארכיון?`,
            message: 'הימים שכבר נרשמו יישמרו, והאתר לא יופיע ברשימת האתרים.',
            ok: 'לארכיון'
        });
        if (!yes) return;
    }

    place.active = place.active === false;
    State.commitRoster();
    render();
}
