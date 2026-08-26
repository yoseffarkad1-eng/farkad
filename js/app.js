// View switching and boot.

// Bumped with sw.js. It is cached alongside every other script, so what this prints is
// the version actually RUNNING on this phone - which is the question that cannot
// otherwise be answered from inside an installed app, and the one that matters when a
// fix is not showing up.
const APP_VERSION = 'v79';

// Is the page in front of us from the same build as these scripts?
//
// It should be impossible: the service worker serves the document and the scripts from
// one version's cache and never mixes them. But "impossible" is what the old
// network-first document was too, and a page from one build running a sync layer from
// another writes edits in a shape the other half does not read - which is a data
// failure, not a rendering one. So it is checked rather than assumed, and if it ever
// does happen the app stops writing instead of writing something nobody can read back.
function pageBuild() {
    const tag = document.querySelector('meta[name="farkad-build"]');
    return tag ? tag.getAttribute('content') : null;
}

function checkBuildConsistency() {
    const page = pageBuild();
    if (!page || page === APP_VERSION) return;

    // Through Recovery, which is what everything that writes asks before writing. It
    // cannot be acknowledged away - a reload is the fix, and until then this page and
    // these scripts disagree about what a record looks like.
    Recovery.halt('build', `הדף מגרסה ${page} והתוכנה מגרסה ${APP_VERSION}.`);

    const banner = document.getElementById('crashBanner');
    if (!banner) return;

    clear(banner);
    banner.appendChild(el('span', null,
        `⚠️ העדכון לא הושלם: הדף מגרסה ${page} והתוכנה מגרסה ${APP_VERSION}. ` +
        'הרישום שכבר נשמר במכשיר בטוח, אבל אין לרשום עכשיו - רענן כדי להשלים את העדכון.'));
    banner.appendChild(button('רענן', 'btn-secondary', () => location.reload()));
    banner.style.display = '';
    console.error('Farkad build mismatch:', page, APP_VERSION);
}

let currentView = 'day';

const VIEWS = ['day', 'week', 'roster', 'reports'];

function showView(view) {
    if (!VIEWS.includes(view)) return;
    // The offer to undo belongs to the screen the change was made on. Left floating over
    // the reports it is just a bar in the way, on top of numbers it has nothing to do with.
    hideUndo();
    currentView = view;
    if (view === 'week') setWeekFromDate(State.date);
    render();
}

// One render for the whole app. The state is small - a few hundred assignments at most -
// so redrawing the visible view on every change is cheaper in bugs than tracking which
// nodes need patching, and fast enough that nobody can see it happen.
function render() {
    VIEWS.forEach(view => {
        const node = document.getElementById(view + 'View');
        if (node) node.style.display = view === currentView ? '' : 'none';

        const tab = document.getElementById('tab-' + view);
        if (tab) {
            tab.classList.toggle('tab-on', view === currentView);
            tab.setAttribute('aria-selected', view === currentView ? 'true' : 'false');
        }
    });

    // "Copy yesterday" and "WhatsApp message" act on the day being viewed, so they have
    // no meaning on the reports or roster screens.
    const dayActions = document.querySelector('.day-actions');
    if (dayActions) dayActions.style.display = currentView === 'day' ? '' : 'none';

    if (currentView === 'day') renderDay();
    if (currentView === 'week') renderWeek();
    if (currentView === 'roster') renderRoster();
    if (currentView === 'reports') renderReports();

    renderMigration();
    // The day header is rebuilt from scratch on every render, so the ↶ comes back
    // disabled every time and has to be told what it is standing on.
    renderUndoButton();
    // Lives outside the day view, so it is not redrawn with it - but what it copies
    // from changes with the date and with every record made.
    renderCopyButton();
    renderAccountBanner();
    updateSyncNotice();

    // Last, because the two bars it measures have just been shown or hidden by the lines
    // above. See js/ui/bars.js - the page reserves room for what is actually there, not
    // for a number somebody wrote down once.
    scheduleBarMeasure();
}

// A crash on a phone looks like nothing: half a screen, no console, no clue whether what
// was typed survived. This says so, says the record on the device is untouched, and
// offers the one action that helps.
function watchForCrashes() {
    const show = detail => {
        const banner = document.getElementById('crashBanner');
        if (!banner || banner.dataset.shown) return;
        banner.dataset.shown = '1';

        clear(banner);
        banner.appendChild(el('span', null,
            '⚠️ משהו השתבש במסך. הרישום ששמור במכשיר לא נפגע - רענן את הדף.'));
        // The actual message, small and last. Without it the only way to find out what
        // broke is a developer console, which is not a thing anyone has on a building
        // site - and "something went wrong" is not a report anybody can act on.
        banner.appendChild(el('span', 'crash-detail', String(
            (detail && detail.message) ? detail.message : detail).slice(0, 160)));
        banner.appendChild(button('רענן', 'btn-secondary', () => location.reload()));
        banner.appendChild(button('✕', 'btn-icon', () => { banner.style.display = 'none'; }, 'סגור'));
        banner.style.display = '';
        console.error('Farkad crash:', detail);
    };

    window.addEventListener('error', event => {
        // Resource errors (an image, a script that 404s) also arrive here and carry no
        // message. Those are not what this is for.
        if (event.message) show(event.message);
    });
    window.addEventListener('unhandledrejection', event => show(event.reason));
}

// The costliest input error is the wrong date, and the app used to hand it out itself:
// "today" was computed once at load, and a phone app is not reopened, it is resumed -
// often the next morning, where the first record of the new day landed on yesterday.
function watchDayRollover() {
    let knownToday = todayStr();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const now = todayStr();
        if (now === knownToday) return;

        // Follow the calendar only if the screen was sitting on the old today. Someone
        // deliberately fixing a past date must not be yanked off it mid-correction.
        if (State.date === knownToday) {
            hideUndo();
            State.date = now;
        }
        knownToday = now;
        takeDailySnapshot();
        render();
    });
}

// The boot, and what it is deliberately NOT waiting for.
//
// This used to hang off window.onload, which fires only once every subresource has
// settled - and two of those were on the far side of the internet: SheetJS from cdnjs and
// the Firebase SDK from gstatic. On a building site with one bar those requests do not
// fail, they hang, and load never fires. State.load() was never called, render() was never
// called, and a phone holding a fortnight of records showed a white screen with no error
// on it, because nothing had gone wrong locally at all.
//
// DOMContentLoaded is the right event: the document is parsed, every same-origin script
// here has run, and nothing outside this origin is between a person and their own data.
// The crash handler is installed BEFORE the first read and the first draw, so a failure in
// either is a banner rather than a dead screen.
function boot() {
    watchForCrashes();

    State.date = todayStr();

    const result = State.load();
    // Before the first edit of the day, and only ever from the state as it was found.
    takeDailySnapshot();
    render();

    checkBuildConsistency();
    watchModals();
    registerOffline();
    watchConnection();
    watchInstall();
    watchDayRollover();
    watchBottomBars();

    if (result.migrated) {
        const count = (result.issues || []).length;
        // The counts are stated so they can be checked against the old board rather than
        // taken on trust - a migration that quietly lost a week would look identical to
        // one that worked.
        const counts = migrationTally(State.schedule);
        const moved = `הועברו ${counts.workDays} ימי עבודה ו-${counts.absences} היעדרויות.`;

        if (count > 0) {
            askTell({
                title: 'הנתונים הועברו לגרסה החדשה',
                message: `${moved} ${count} רישומים לא ניתנים לפענוח אוטומטי וממתינים להחלטה שלך. הגרסה הישנה נשמרה ולא שונתה.`
            }).then(openMigrationModal);
        } else {
            askTell(`הנתונים הועברו לגרסה החדשה. ${moved} הגרסה הישנה נשמרה ולא שונתה.`);
        }
    }

    // Two boot failures used to pass in silence, which is the worst way for them to pass:
    // the app comes up looking ordinary and the person keeps recording into it.
    if (result.damaged) {
        askTell({
            title: 'הקובץ השמור נפגם',
            message: 'לא הצלחנו לקרוא את הרישום האחרון. העותק הפגום נשמר במכשיר ולא נמחק, ' +
                'וניתן לשחזר ממנו. מה שרואים כרגע הוא המצב הישן יותר - בדוק את הימים האחרונים ' +
                'מול נקודות השחזור לפני שממשיכים לרשום.'
        });
    } else if (result.failed) {
        askTell({
            title: 'לא הצלחנו לפתוח את הרישום',
            message: 'הנתונים השמורים במכשיר לא נקראו, והמסך שנפתח ריק. הם לא נמחקו - ' +
                'אל תרשום מחדש מעל הריק, נסה נקודת שחזור או קובץ גיבוי.'
        });
    }

    // Last, and off to one side. The cloud is a convenience on top of a record that is
    // already on screen; if gstatic never answers, the import never settles and nothing
    // here is waiting on it.
    connectCloudLater();
}

// The one ES module in the app, imported after the local boot rather than by a tag in the
// document. A tag - deferred or not - is fetched before DOMContentLoaded, and this one
// pulls the Firebase SDK from gstatic, so the tag alone was enough to hold the whole app
// behind a network that was not answering.
function connectCloudLater() {
    if (typeof Recovery !== 'undefined' && Recovery.blocked && Recovery.blocked()) return;
    try {
        import('./js/sync/firebase-adapter.js').catch(error => {
            console.info('Cloud sync is not available in this session:', error && error.message);
        });
    } catch (error) {
        console.info('Cloud sync could not be started:', error && error.message);
    }
}

// Once, and never twice. A script that arrives after the document is already parsed gets
// no DOMContentLoaded, and an app that boots twice reads the disk twice and draws over
// its own first render.
let booted = false;
function bootOnce() {
    if (booted) return;
    booted = true;
    boot();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOnce, { once: true });
} else {
    bootOnce();
}
