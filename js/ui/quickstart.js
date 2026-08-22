// Quick start: paste one list, then another, and the app is set up.
//
// The alternative was fourteen names through fourteen separate dialogs, on a phone, on
// the first evening - which is where a new tool gets abandoned. A crew list already
// exists somewhere (WhatsApp, notes, a GPT answer); pasting it is thirty seconds.
//
// Step 1 takes worker names, step 2 takes site names, one per line. Blank lines and
// stray spaces are cleaned up; order is kept, because the paper the list came from has
// an order and the day screen mirrors it.

let quickStep = null;   // 'workers' | 'places' | null
let quickWorkers = [];

function openQuickStart() {
    quickStep = 'workers';
    quickWorkers = [];
    renderQuickStep();
    document.getElementById('quickModal').style.display = 'flex';
    document.getElementById('quickText').focus();
}

function renderQuickStep() {
    const workers = quickStep === 'workers';
    document.getElementById('quickTitle').textContent =
        workers ? 'שלב 1 מתוך 2: העובדים' : 'שלב 2 מתוך 2: אתרי העבודה';
    document.getElementById('quickHint').textContent = workers
        ? 'הדבק או כתוב את שמות העובדים - שם אחד בכל שורה, לפי הסדר שבו אתה רגיל לעבור עליהם.'
        : 'עכשיו את שמות האתרים - אתר אחד בכל שורה.';
    document.getElementById('quickNext').textContent = workers ? 'המשך' : 'סיום';
    document.getElementById('quickText').value = '';
    document.getElementById('quickError').textContent = '';
}

function quickLines() {
    return document.getElementById('quickText').value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function quickNext() {
    const lines = quickLines();
    const problem = document.getElementById('quickError');

    if (lines.length === 0) {
        problem.textContent = quickStep === 'workers'
            ? 'נא להזין לפחות שם אחד.'
            : 'נא להזין לפחות אתר אחד.';
        return;
    }

    if (quickStep === 'workers') {
        quickWorkers = lines;
        quickStep = 'places';
        renderQuickStep();
        document.getElementById('quickText').focus();
        return;
    }

    // Both lists in hand - build the roster in one go. Existing entries are never
    // touched: running quick start twice adds, it does not replace - and a name that is
    // already on the roster is skipped the same way a duplicate site is, or pasting an
    // overlapping list makes two identical דוד rows the day screen cannot tell apart.
    quickWorkers.forEach(name => {
        if (State.schedule.workers.some(worker => worker.name === name)) return;
        State.schedule.workers.push({
            id: State.nextWorkerId(), name,
            idNumber: '', phone: '', dailyRate: 0, hourlyRate: 0, active: true
        });
    });
    lines.forEach(name => {
        // A duplicate site name would collide with the uniqueness rule the rename
        // dialog enforces; quietly numbering it would invent a site nobody has.
        if (!State.schedule.places.some(place => place.name === name)) {
            State.schedule.places.push({ id: State.nextPlaceId(), name, active: true });
        }
    });

    const made = { workers: quickWorkers.length, places: lines.length };
    closeQuickStart();
    State.save();
    if (typeof FarkadSync !== 'undefined') FarkadSync.replaceAll(State.schedule);
    render();
    askTell(`מוכן: ${made.workers} עובדים ו-${made.places} אתרים. אפשר להתחיל לרשום.`);
}

function closeQuickStart() {
    document.getElementById('quickModal').style.display = 'none';
    quickStep = null;
    quickWorkers = [];
}
