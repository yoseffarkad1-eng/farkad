// View switching and boot.

// Bumped with sw.js. It is cached alongside every other script, so what this prints is
// the version actually RUNNING on this phone - which is the question that cannot
// otherwise be answered from inside an installed app, and the one that matters when a
// fix is not showing up.
const APP_VERSION = 'v102';

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
    // An open reorder draft owns the door. A tab tapped mid-sort used to throw the
    // unsaved order away without a word; now the mode asks its three-answer question
    // and the switch proceeds only once the draft is saved or knowingly discarded.
    if (typeof reorderDraft !== 'undefined' && reorderDraft && view !== 'roster') {
        confirmReorderExit().then(allowed => { if (allowed) showView(view); })
            .catch(() => {});
        return;
    }
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
    // Held writes are a body state, not a banner alone: the stylesheet dims the
    // recording surfaces and quiets the dock under it, and the progress row adds its
    // badge - the block is SAID where the tap would land, not only explained at the top.
    if (document.body && document.body.classList) {
        document.body.classList.toggle('writes-blocked',
            typeof farkadWritesBlocked === 'function' && farkadWritesBlocked());
    }
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
    // After the line, because the chip is read from it.
    renderSyncChip();
    // Only if it is open. Everything on it - the backup age, the restore points, the
    // cloud copies - is answered by state that changes while it is on screen.
    if (typeof renderSettingsIfOpen === 'function') renderSettingsIfOpen();

    // Last, because the two bars it measures have just been shown or hidden by the lines
    // above. See js/ui/bars.js - the page reserves room for what is actually there, not
    // for a number somebody wrote down once.
    scheduleBarMeasure();
}

// The chip beside the app's name: the sync line, shortened. Read from #storageNotice
// rather than composed again, so the two can never disagree - updateSyncNotice
// (js/sync/sync.js) owns the words and this only recognises them. Anything it does not
// recognise, including the local-only line, leaves the chip off: a chip that guesses is
// worse than no chip.
function renderSyncChip() {
    const chip = document.getElementById('syncChip');
    const notice = document.getElementById('storageNotice');
    if (!chip || !notice) return;
    const text = notice.textContent || '';
    const waiting = text.match(/\((\d+) ממתינים לשליחה\)/);

    let state = '';
    let label = '';
    if (text.startsWith('⚠️')) {
        // A change that was NOT written down - the one state the chip must never soften.
        state = 'chip-danger';
        label = 'לא נשמר';
    } else if (text.startsWith('הנתונים השתנו במכשיר אחר')) {
        // THE SENTENCE BEFORE THE COUNT. A held edit is still counted by pendingCount(),
        // so this line never arrives without a queue suffix - and read count-first the
        // chip called it "waiting to send", which is the one thing a held edit is not:
        // nothing goes until a person decides. That is the lie 63b7776 took off the
        // status line, and the chip had put it back beside the app's name.
        state = 'chip-warn';
        label = 'דורש הכרעה';
    } else if (text.startsWith('הסנכרון מושהה')) {
        // Same precedence, same reason: the queue behind a suspended sync is not on its
        // way anywhere until the poisoned record is exported. The chip repeats the
        // line's own first words rather than inventing a shorter one.
        state = 'chip-warn';
        label = 'הסנכרון מושהה';
    } else if (text.startsWith('שגיאת סנכרון')) {
        // And the same again, found on a real phone: v96, 5G, thirty-eight edits the
        // cloud was REFUSING (permission-denied under rules the server had not yet
        // caught up with), and the chip read «38 ממתינים לשליחה» - a queue on its way -
        // over a line that began with the error. Danger, not warn: nothing in that queue
        // moves until somebody acts, and warn is the colour of "wait".
        state = 'chip-danger';
        label = 'שגיאת סנכרון';
    } else if (text.startsWith('הרישום שמור במכשיר. השליחה תקועה')) {
        // The claim that will not clear: the queue exists and the sender is stuck behind
        // another window. Its own words, ahead of its own count. Warn rather than danger
        // because the line itself names the remedy - close the other windows - and the
        // data is on this phone; the full stop after במכשיר keeps this from catching the
        // suspended line, which also opens with הרישום שמור.
        state = 'chip-warn';
        label = 'השליחה תקועה';
    } else if (waiting) {
        state = 'chip-warn';
        label = `${waiting[1]} ממתינים לשליחה`;
    } else if (text.includes('רישום אחד ממתין לשליחה')) {
        state = 'chip-warn';
        label = 'ממתין לשליחה';
    } else if (text.startsWith('אין חיבור')) {
        state = 'chip-warn';
        label = 'אין חיבור';
    } else if (text.startsWith('מסונכרן')) {
        state = 'chip-ok';
        label = 'מסונכרן';
    } else if (text.startsWith('מחובר') || text.startsWith('מתחבר')) {
        state = 'chip-warn';
        label = 'שולח…';
    }
    chip.textContent = label;
    chip.className = 'sync-chip' + (state ? ' ' + state : '');
    chip.hidden = label === '';
}

function watchSyncNotice() {
    const notice = document.getElementById('storageNotice');
    if (!notice || typeof MutationObserver !== 'function') return;
    // The chip AND the ⋯ panel's two lines. The panel is redrawn with render(), which
    // follows a commit, not a status: a listener that died or a cloud that refused a
    // batch under an open sheet changed the foot and the chip and left the sheet
    // reading the previous status, with the previous reason under it. The foot is
    // written by every setStatus, so following it is following the status.
    new MutationObserver(() => {
        renderSyncChip();
        if (typeof renderSettingsSyncLine === 'function') renderSettingsSyncLine();
    }).observe(notice, { childList: true, characterData: true, subtree: true });
}

// A crash on a phone looks like nothing: half a screen, no console, no clue whether what
// was typed survived. This says so, says the record on the device is untouched, and
// offers the one action that helps.
function watchForCrashes() {
    // The handover. Up to this line the inline sentinel in index.html is the only thing
    // that would have said anything at all; from here the app reports its own failures,
    // with the detail it can give. Exactly one of the two ever speaks.
    if (window.farkadBootSentinel && window.farkadBootSentinel.standDown) {
        window.farkadBootSentinel.standDown();
    }

    const show = detail => {
        // The sentinel got there first - a script that never arrived, before any of this
        // was running. Its banner names the real failure; a second one underneath it,
        // saying something vaguer about the same thing, helps nobody.
        if (window.farkadBootSentinel && window.farkadBootSentinel.spoke
            && window.farkadBootSentinel.spoke()) return;

        const banner = document.getElementById('crashBanner');
        if (!banner) return;
        // Memo on the MESSAGE, not a one-shot flag: a DIFFERENT crash later in the
        // session must show, and the ✕ must forget - the storage banner had exactly
        // this bug and went permanently silent after its first hide.
        const memo = String((detail && detail.message) ? detail.message : detail).slice(0, 160);
        if (banner.dataset.shown === memo) return;
        banner.dataset.shown = memo;

        clear(banner);
        banner.appendChild(el('span', null,
            '⚠️ משהו השתבש במסך. הרישום ששמור במכשיר לא נפגע - רענן את הדף.'));
        // The actual message, small and last. Without it the only way to find out what
        // broke is a developer console, which is not a thing anyone has on a building
        // site - and "something went wrong" is not a report anybody can act on.
        banner.appendChild(el('span', 'crash-detail', String(
            (detail && detail.message) ? detail.message : detail).slice(0, 160)));
        banner.appendChild(button('רענן', 'btn-secondary', () => location.reload()));
        banner.appendChild(button('✕', 'btn-icon', () => {
            banner.style.display = 'none';
            delete banner.dataset.shown;
        }, 'סגור'));
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
    // From here on, Recovery may redraw the app itself when it holds new evidence. Not
    // before: State.load above reports a poisoned map through Recovery.evidence, and a
    // redraw from inside that read drew every view over a half-read State and turned a
    // fault in the drawing into a quarantined record - see evidence() in js/recovery.js.
    // The render just above is what shows a hold found by the read.
    if (typeof Recovery !== 'undefined') Recovery.onScreen = true;

    // The recovery banner, painted here rather than only where the damage is found.
    //
    // sync.js reads its outbox the moment it loads - before js/ui/dom.js exists - so a
    // damaged QUEUE reported itself into a paint() that could not draw anything and was
    // never asked again. Writing was blocked, the banner was invisible, and the one
    // button that turns writing back on was on it: the phone was read-only for the rest
    // of its life with nothing on screen saying why, or what to do about it.
    if (typeof Recovery !== 'undefined') Recovery.paint();

    checkBuildConsistency();
    watchModals();
    registerOffline();
    watchConnection();
    watchInstall();
    watchDayRollover();
    watchBottomBars();
    // The status line is rewritten by sync.js on its own clock, between renders; the
    // chip that mirrors it follows every rewrite, or it would sit on "3 ממתינים" after
    // the three had gone.
    watchSyncNotice();

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
// Called twice on purpose: once at the end of boot, and again if Recovery is
// acknowledged later in the session. Both have to be safe, so this is idempotent - one
// import, one adapter, one subscription - and it reports whether the cloud is on its way
// rather than leaving the caller to guess.
let cloudStarted = false;

// Where the cloud adapter lives, relative to the page. Same-origin, precached in the
// service worker's shell, and imported only after the local boot has drawn.
const ADAPTER_URL = 'js/sync/firebase-adapter.js';

function connectCloudLater() {
    if (cloudStarted) return true;

    // Blocked means blocked: no import, no connection, and the status says so instead of
    // looking like an ordinary local-only phone. Recovery.acknowledge() calls back here.
    if (typeof Recovery !== 'undefined' && Recovery.blocked && Recovery.blocked()) {
        if (typeof FarkadSync !== 'undefined' && FarkadSync.holdForRecovery) {
            FarkadSync.holdForRecovery();
        }
        return false;
    }

    cloudStarted = true;
    try {
        // Resolved against the DOCUMENT, not against this file.
        //
        // `import('./js/sync/firebase-adapter.js')` from inside a classic script is
        // resolved against the script's own URL - so from js/app.js it asked for
        // /js/js/sync/firebase-adapter.js, got a 404, and the catch below wrote one line
        // into a console nobody on a building site has. The app looked entirely normal
        // and was local-only for ever: no sign-in button, no snapshots, every edit piling
        // up in a queue with nowhere to go, on all three phones at once.
        //
        // The path is spelled once, above, so the service worker's shell list and this
        // can be checked against each other by tests/build.test.mjs.
        import(new URL(ADAPTER_URL, document.baseURI).href).catch(error => {
            // An import that never arrived is not an import that happened. Letting a
            // later resume try again is the difference between a phone that reconnects
            // when the signal comes back and one that has to be closed and reopened.
            cloudStarted = false;
            console.info('Cloud sync is not available in this session:', error && error.message);
        });
    } catch (error) {
        cloudStarted = false;
        console.info('Cloud sync could not be started:', error && error.message);
    }
    return cloudStarted;
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
