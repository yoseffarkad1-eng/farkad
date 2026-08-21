// View switching and boot.

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
        banner.appendChild(button('רענן', 'btn-secondary', () => location.reload()));
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

window.onload = () => {
    State.date = todayStr();

    const result = State.load();
    // Before the first edit of the day, and only ever from the state as it was found.
    takeDailySnapshot();
    render();

    watchForCrashes();
    watchModals();
    registerOffline();
    watchConnection();
    watchInstall();

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
};
