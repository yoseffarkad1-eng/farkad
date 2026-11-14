// View switching and boot.

// Bumped with sw.js. It is cached alongside every other script, so what this prints is
// the version actually RUNNING on this phone - which is the question that cannot
// otherwise be answered from inside an installed app, and the one that matters when a
// fix is not showing up.
const APP_VERSION = 'v197';

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

const VIEWS = ['day', 'week', 'roster', 'advances', 'reports'];

// Manual tab activation: arrows move focus in the visual RTL direction; Enter or
// Space uses the existing click path, including the guard for an unsaved roster.
function handleNavigationKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const origin = event.target.closest('.tab');
    if (!origin) return;
    const index = VIEWS.indexOf(origin.id.slice(4));
    if (index < 0) return;
    const rtl = getComputedStyle(origin.parentElement).direction === 'rtl';
    const step = event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : (rtl ? -1 : 1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1
        : (index + step + VIEWS.length) % VIEWS.length;
    event.preventDefault();
    VIEWS.forEach((view, at) => document.getElementById('tab-' + view)
        .setAttribute('tabindex', at === next ? '0' : '-1'));
    document.getElementById('tab-' + VIEWS[next]).focus({ preventScroll: true });
}

function showView(view) {
    if (!VIEWS.includes(view)) return;
    // An open reorder draft owns the door. A tab tapped mid-sort used to throw the
    // unsaved order away without a word; now the mode asks its three-answer question
    // and the switch proceeds only once the draft is saved or knowingly discarded.
    if (typeof reorderDraft !== 'undefined' && reorderDraft && view !== 'roster') {
        // NOT CAUGHT, on purpose. This chain used to end in `.catch(() => {})` - the one
        // empty catch in this app sitting on a user tap, on the most-tapped control
        // there is. watchForCrashes listens for unhandledrejection precisely so that a
        // throw inside an async click handler becomes the crash banner instead of a
        // tap that does nothing; catching here cut that net, and a TypeError inside
        // saveReorder left the person looking at a panel that would not close, a tab
        // that would not switch, and nothing anywhere saying why. Nothing on this path
        // rejects in the ordinary course - confirmReorderExit answers true or false and
        // askChoice resolves null when it is displaced - so a rejection here IS a
        // programming error, and the app already has one place to put those.
        confirmReorderExit().then(allowed => { if (allowed) showView(view); });
        return;
    }
    // The offer to undo belongs to the screen the change was made on. Left floating over
    // the reports it is just a bar in the way, on top of numbers it has nothing to do with.
    hideUndo();
    currentView = view;
    if (view === 'week') {
        weekPhoneMode = 'grid';
        weekPhoneDate = null;
        setWeekFromDate(State.date);
    }
    render();
    // A box he was typing into on the page just left holds the midnight follow no longer
    // (watchDayRollover, below): it is made after this tap, if one is owed and nothing else
    // holds it.
    if (typeof dayRolloverViewLeft === 'function') dayRolloverViewLeft();
}

// One render for the whole app. The state is small - a few hundred assignments at most -
// so redrawing the visible view on every change is cheaper in bugs than tracking which
// nodes need patching, and fast enough that nobody can see it happen.
function render() {
    // Held writes are a body state, not a banner alone: the stylesheet dims the
    // recording surfaces and quiets the dock under it, and the progress row adds its
    // badge - the block is SAID where the tap would land, not only explained at the top.
    if (document.body && document.body.classList) {
        document.body.classList.toggle('week-print-layout', currentView === 'week');
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
            tab.setAttribute('tabindex', view === currentView ? '0' : '-1');
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
    if (currentView === 'advances') renderAdvances();

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
    // The same for the seder to each worker: every link on it carries a man's message,
    // and a snapshot from another phone that moved him must move his link with it.
    if (typeof renderSederIfOpen === 'function') renderSederIfOpen();
    // And for the transport plan (v171), on a phone that has it on: it reads who is on
    // which site from this same record, and a man moved under it must show as moved.
    if (typeof renderTransportIfOpen === 'function') renderTransportIfOpen();
    // And for the seder's journey (js/ui/journey.js), while one is being walked: its counter,
    // its strip and its last look are all read from this record, and say what it says now.
    if (typeof renderJourneyIfOpen === 'function') renderJourneyIfOpen();
    // And for a worker's card (js/ui/workercard.js): every figure on it is read off this
    // record, and a card left showing what the record said a minute ago is a wrong number.
    if (typeof renderWorkerCardIfOpen === 'function') renderWorkerCardIfOpen();
    // And for the month's summary (js/ui/monthsummary.js), for the same reason.
    if (typeof renderMonthSummaryIfOpen === 'function') renderMonthSummaryIfOpen();
    // And for a site's card (js/ui/sitecard.js): every count on it is read off this record.
    if (typeof renderSiteCardIfOpen === 'function') renderSiteCardIfOpen();
    // And for «תלוש לכל עובד» (js/ui/payslips.js): every row is a man's pay and a link that
    // carries his statement, and both must say what the record says now.
    if (typeof renderPayslipsIfOpen === 'function') renderPayslipsIfOpen();
    // And for «סגירת שבוע» (js/ui/weeklyclose.js) - which does NOT redraw: a record that moved
    // under it raises one line, nothing chosen is lost, and the press compares everything.
    if (typeof renderWeeklyCloseIfOpen === 'function') renderWeeklyCloseIfOpen();
    // And for the finder (js/ui/find.js): a man added or turned off on another phone is
    // found, or not, as the record has him now.
    if (typeof renderFindIfOpen === 'function') renderFindIfOpen();

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
//
// AND NEVER UNDER AN OPEN WRITER. The follow used to be made the moment the page came back,
// whatever was open over the day. The assign sheet, «לאן הלך» and a site's picker each name
// their day once, when they are drawn - the sheet's meta line is the only thing on the
// screen that says which day is being written - and every one of them writes to State.date
// at the tap, as «🧹 רוקן אתר» does after its question. A sheet opened at 23:50 on Tuesday
// and taken up again at 00:05 still said «יום שלישי 10/11», and the site tapped in it was
// written to Wednesday, rate-stamped and queued for the cloud; Tuesday was left with
// nothing, as if he had not worked. (The review of v189, c1 and c2.)
//
// So while a dialog is open or a field on the glass holds what somebody typed
// (dayRolloverHeld, below) the date stays where the screen says it is, and every write lands
// on the day the surface named. The follow is owed, not dropped. It is made at the
// first moment nothing is open: the instant the last dialog closes, in that same turn, so
// no frame of the old day is painted after the close; or the next time the page is brought
// back. Never on a timer: a day changed at some moment nobody chose is a day changed under
// a finger already on its way to the glass. And, exactly as before, only if the screen is
// still on the old today - a day somebody moved to on purpose meanwhile is his choice
// (dayChosenByHand, below: even when the day he chose IS the old today).
//
// Nor is the day DRAWN again while something is being typed into it. The redraw a new day
// asks for (the «היום» button, the drawer's today) takes a focused box out of the page, and
// a box taken away by a redraw commits nothing (dayTearingDown, js/ui/day.js): the digits a
// man was typing into a site's count when the phone locked were thrown away on unlocking.
// They are kept; the redraw comes with the next one.

// The follow owed: the old today the day screen is to leave once nothing is open over it,
// or null when none is. Out here rather than inside watchDayRollover so that a day chosen by
// hand can settle it.
let dayRolloverLeaving = null;

// Called by showView once the page has switched (set by watchDayRollover at boot).
let dayRolloverViewLeft = null;

// A DAY CHOSEN BY HAND SETTLES WHAT THE CALENDAR OWED. Every control that puts the day screen
// on a date somebody picked - the arrows, the drawer, the date picker, a day of the week
// screen or of a card's calendar - calls this as it sets State.date: the day on the screen is
// his choice now, not the screen left sitting on yesterday, and no later moment takes it from
// him. The follow could not tell the two apart when the day chosen was the very day it was
// about to leave. A worker's card left open across midnight, its Tuesday tapped in the
// morning: the card closed, Tuesday was set, and the close's own follow - the observer's
// microtask, later in that same turn - put him on Wednesday under a header he had not asked
// for. A site's card did the same (the review of the hotfix, R1).
function dayChosenByHand() {
    dayRolloverLeaving = null;
}

// WHAT HOLDS THE FOLLOW: a dialog open - each names its day once, when it is drawn, and may
// write to State.date at a tap - or a box on the glass being TYPED INTO, which a redraw would
// take off the page with what was typed. Not midEdit (js/ui/offline.js), whose question is
// whether a RELOAD would throw something away. Its third reason, the advances page's «סידור»
// draft, names no day, writes none, and a redraw draws it again as it was (renderAdvanceOrder,
// js/ui/reports.js); counted here, a draft left open while he went back to the day held the
// follow on every unlock until שמור or ביטול, and the morning's records landed on yesterday
// (the review of the hotfix, R4). And a box in a page he has left is not being typed into: a
// tab tapped on an iPhone takes no focus, so the box can go on being the focused element
// under display:none - Chromium lets go of it only at the next frame - and it held the
// follow for as long as he stayed away from that page.
//
// TYPED INTO, NOT MERELY HOLDING SOMETHING (the third review of the hotfix, BLOCKER). The
// question was "a focused box with a value in it", and a site's count box holding a count stored
// earlier is such a box from the moment it is tapped: tapped at 23:50 and never typed into, it
// held the follow at the 07:10 unlock, the screen stayed on Tuesday, and the morning's first tap
// - a man's usual site, «נעדר», a ✕ - wrote Tuesday; the follow its leaving owed came after it and
// took its step off ↶ (leave-by-writer). Nothing typed is nothing a redraw can take away. A box is
// being typed into from its first keystroke (`input`) after it took the focus. And the focus
// going from such a box straight into another box - a tap on the next site's count, Tab, the
// keyboard's «הבא» - takes the typing with it: he is still filling in the evening's counts, box
// after box, and the day stays under him. On v190 it did; round two made the follow at the first
// box's leaving and drew the day again under the box he had just tapped, and the digits he typed
// next went nowhere (box-to-box). The focus anywhere else ends it.
let dayRolloverTyping = false;
// A box being typed into was left in this turn: the box the focus lands in now carries the typing.
let dayRolloverCarry = false;

function dayRolloverBox(node) {
    if (!node || !node.tagName) return false;
    if (node.tagName === 'TEXTAREA') return true;
    if (node.tagName !== 'INPUT') return false;
    return !/^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/i.test(node.type || '');
}

function dayRolloverOnGlass(node) {
    return dayRolloverBox(node) && node.isConnected && node.getClientRects().length > 0;
}

function dayRolloverDialogOpen() {
    return [...document.querySelectorAll('.modal')]
        .some(modal => modal.style.display && modal.style.display !== 'none');
}

function dayRolloverHeld() {
    if (dayRolloverDialogOpen()) return true;
    if (!dayRolloverOnGlass(document.activeElement)) {
        dayRolloverTyping = false;
        return false;
    }
    return dayRolloverTyping;
}

// THE MORNING FOLLOWS THE CALENDAR ONCE THE BOX IS LEFT (the second review of the hotfix), AND
// THE TAP THAT LEAVES IT IS SPENT ON LEAVING IT (the third).
//
// A box being typed into holds the follow, and the box is LEFT - by a tap on anything else, by
// the keyboard's own key, by Tab to something that is not a box - but nothing made the follow
// then: he typed a site's count at 23:50, unlocked at 07:10, left the box, the day screen still
// said Tuesday, and the morning's first man went to Tuesday. So the follow owed is made when the
// box is left - its `change`, which a box commits on when it is left (and which may take the box
// off the page with its own redraw, so that no blur ever reaches the document: measured), or its
// `focusout` - and, for the phone whose tab takes no focus, when the page it was on is left; and
// only if nothing else holds it then.
//
// NEVER UNDER A FINGER, and never AFTER it either. A box is left by the press of a tap whose click
// has yet to come. Drawn at that press, the new day would be under the click, and the click would
// land on whatever Wednesday put there. Round two waited for the click instead and let it land on
// what it was aimed at - Tuesday's surface - and a writer wrote Tuesday, or opened a picker that
// named Tuesday, and the follow that came after took the step off ↶ with the screen: yesterday
// written by the morning's first tap, and nothing on the screen to take it back (the third review,
// BLOCKER). So the follow due in a press is made AT ITS CLICK, before anything the click was aimed
// at acts - and a click on what the follow draws again, the day screen, its dock or the undo bar
// over them, is spent on it: it does nothing else. The day he then sees under his finger is the
// new one, and his next tap is on the day it says. Chromium already loses such a tap on its own
// whenever the box's commit redraws the day under it (the mouse press's target is gone, and no
// click comes); this makes it so whatever was typed, wherever the tap came down. A click anywhere
// else - a tab, the top bar, a page that is not the day - lands on what it was aimed at, on the
// page as it was drawn, and the new day is drawn in the turn after it. What is known of a
// tap, measured in Chromium (tests/midnight.browser.mjs): a finger's press and release come first,
// each in its own turn, and the press, release and click it makes as a mouse come after, together
// in ONE turn - in which the focus moves, at that press; a mouse presses in one turn and releases
// and clicks in another. A press whose click never comes (the redraw above, a release that became
// nothing) is over at the end of its mouse's turn, or a second after a finger's release, and the
// follow is made then. With no press under way - the keyboard - it is made in the turn after.
//
// AND AN IPHONE'S TAP LEAVES THE BOX WITHOUT MOVING THE FOCUS. A button tapped there takes no
// focus, and the box can stay focused under the keyboard while the tap lands somewhere else: the
// box was never left, the follow was still held, and the tap wrote Tuesday; the day's redraw then
// took the box away and the digits typed in it with it (the third review, simulated). So with a
// follow owed, a finger's click outside the box being typed into - and not on another box, nor
// on the box's own label - first lets go of the box: its `change` commits what was typed, on the
// day the box was drawn for (renderSiteCountField, js/ui/day.js), and the click is then the
// leaving tap above. Only with a follow owed: on any other morning the box is the iPhone's own.
let dayRolloverPressDown = false;   // a press whose click's turn is not over
let dayRolloverPressType = null;    // its pointerType
let dayRolloverPending = false;     // a follow due inside that press: made at its click, or its end
let dayRolloverPressTimer = null;

function watchDayRollover() {
    let knownToday = todayStr();
    const busy = dayRolloverHeld;

    const follow = () => {
        if (dayRolloverLeaving === null || busy()) return false;
        const from = dayRolloverLeaving;
        dayRolloverLeaving = null;
        if (State.date !== from) return false;
        hideUndo();
        State.date = todayStr();
        return true;
    };

    // What the follow draws again under a finger: the day screen, its dock and the undo bar.
    // A target already gone was taken off the day by the box's own commit.
    const redrawn = target => !target || !target.isConnected
        || Boolean(target.closest && target.closest('#dayView, .day-actions, #undoBar'));

    // The follow made now, if one is owed and nothing holds it. `click`: the click of the press
    // it came due in, which is spent on it when it came down on what is drawn again.
    const decide = click => {
        dayRolloverPending = false;
        if (dayRolloverLeaving === null || busy()) return;
        const spent = Boolean(click) && currentView === 'day' && redrawn(click.target);
        if (!follow()) return;
        if (spent) {
            render();
            click.preventDefault();
            click.stopPropagation();
        } else if (click) {
            // Anywhere else - a tab, the top bar, a page that is not the day: the click lands
            // first, on the page as it was drawn, and the new day is drawn in the turn after it.
            // Drawn here, the page was taken away under the click, and its button's own handler
            // ran on a button no longer on the page.
            setTimeout(render, 0);
        } else {
            render();
        }
    };

    // A box left, or the page it was on: the follow is due - at the click of the press under
    // way, or in the turn after.
    const due = () => {
        if (dayRolloverLeaving === null) return;
        if (dayRolloverPressDown) dayRolloverPending = true;
        else setTimeout(() => decide(null), 0);
    };

    const endPress = () => {
        clearTimeout(dayRolloverPressTimer);
        dayRolloverPressTimer = null;
        dayRolloverPressDown = false;
        if (dayRolloverPending) decide(null);
    };
    // The end of the turn being dispatched: for a tap, after its click has been handled.
    const endPressSoon = () => {
        clearTimeout(dayRolloverPressTimer);
        dayRolloverPressTimer = setTimeout(endPress, 0);
    };

    // A tap on a box, or on the words of a box's own label (a site's count is one <label>): the
    // focus is on its way INTO a box, and the typing goes with it - not a leaving.
    const intoBox = target => {
        if (!target) return false;
        if (dayRolloverBox(target)) return true;
        const label = target.closest ? target.closest('label') : null;
        return Boolean(label && dayRolloverBox(label.control));
    };

    // An iPhone's tap that moves no focus: the box let go of first (above).
    const letGoOfBox = click => {
        const active = document.activeElement;
        if (!dayRolloverTyping || !dayRolloverOnGlass(active) || dayRolloverDialogOpen()) return;
        const target = click.target;
        if (!target || target === active || (active.contains && active.contains(target)) || intoBox(target)) return;
        active.blur();
    };

    // On the window and in the capture phase: seen before any control's own handler, and
    // before any guard that stops a press at its surface (guardFingersOn, js/ui/sheet.js).
    window.addEventListener('pointerdown', event => {
        clearTimeout(dayRolloverPressTimer);
        dayRolloverPressTimer = null;
        dayRolloverPressDown = true;
        dayRolloverPressType = event.pointerType || 'mouse';
    }, true);
    window.addEventListener('pointerup', () => {
        if (dayRolloverPressType === 'mouse') return;
        clearTimeout(dayRolloverPressTimer);
        dayRolloverPressTimer = setTimeout(endPress, 1000);
    }, true);
    window.addEventListener('pointercancel', endPressSoon, true);
    // The turn of the click: a finger's opens with its mouse press, a mouse's with its release.
    window.addEventListener('mousedown', () => { if (dayRolloverPressType !== 'mouse') endPressSoon(); }, true);
    window.addEventListener('mouseup', () => { if (dayRolloverPressType === 'mouse') endPressSoon(); }, true);
    window.addEventListener('keydown', () => { if (dayRolloverPending) endPressSoon(); }, true);
    window.addEventListener('click', event => {
        if (dayRolloverLeaving !== null && event.detail > 0) {
            // Into a box: the focus lands there after this click (a label's own default), and
            // the follow is asked at the end of the tap, with the typing carried (below).
            if (intoBox(event.target)) {
                if (dayRolloverTyping && !dayRolloverCarry) {
                    dayRolloverCarry = true;
                    setTimeout(settleTyping, 0);
                }
                due();
            } else {
                letGoOfBox(event);
                decide(event);
            }
        }
        if (dayRolloverPressDown) endPressSoon();
    }, true);

    // The typing (dayRolloverHeld, above): begun by a keystroke, carried from box to box within
    // the turn the first was left in, ended by the focus coming down anywhere else.
    const settleTyping = () => {
        dayRolloverCarry = false;
        if (!dayRolloverOnGlass(document.activeElement)) dayRolloverTyping = false;
    };
    const left = event => {
        if (!dayRolloverBox(event.target)) return;
        if (dayRolloverTyping && !dayRolloverCarry) {
            dayRolloverCarry = true;
            setTimeout(settleTyping, 0);
        }
        due();
    };
    document.addEventListener('input', event => { if (dayRolloverBox(event.target)) dayRolloverTyping = true; }, true);
    document.addEventListener('change', left, true);
    document.addEventListener('focusout', left, true);
    document.addEventListener('focusin', event => {
        if (dayRolloverBox(event.target) && dayRolloverCarry) return;
        dayRolloverTyping = false;
    }, true);
    // The page the box was on, left by a tab that took no focus: an iPhone's tap focuses
    // nothing, and the box can stay the focused element under display:none. It holds nothing
    // there (dayRolloverHeld); the page switch is the moment it was left.
    dayRolloverViewLeft = due;

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const now = todayStr();
        const turned = now !== knownToday;
        if (turned) {
            // Follow the calendar only if the screen was sitting on the old today. Someone
            // deliberately fixing a past date must not be yanked off it mid-correction.
            if (State.date === knownToday) dayRolloverLeaving = knownToday;
            knownToday = now;
            takeDailySnapshot();
        }
        if (follow() || (turned && !busy())) render();
    });

    // The moment the last dialog closes. Every dialog is a .modal shown and hidden by its
    // style, the attribute js/ui/modal.js watches for the same moment (it gives the focus
    // back first: its observer was made first, at boot).
    if (typeof MutationObserver !== 'function') return;
    const closed = new MutationObserver(() => { if (follow()) render(); });
    document.querySelectorAll('.modal').forEach(modal =>
        closed.observe(modal, { attributes: true, attributeFilter: ['style'] }));
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

    // AND NOT DAMAGED. Both branches read one `result` and both used to fire, in this
    // order, in the same tick.
    //
    // A boot that migrates BECAUSE the v2 record would not parse has migrated nothing to
    // the disk: js/state.js keeps the migrated week in memory and deliberately does not
    // save it, because saving it would put pre-migration data over the newest record
    // there is. «הנתונים הועברו לגרסה החדשה» describes something that happened to this
    // device; on that boot nothing happened to it. The sentence was then displaced by the
    // damage notice a few lines down, in the same tick, which is what made this invisible
    // - a claim made and withdrawn leaves no trace for a check that reads the screen at
    // the end. See tests/status.test.mjs for where that lesson is written down, and
    // tests/boot.browser.mjs for this one.
    //
    // It was not only invisible. The count>0 arm chains openMigrationModal onto its
    // dialog, and a DISPLACED dialog resolves - as a dismissal - so the questions modal
    // opened by itself over the damage notice: a device that is holding its writes,
    // asking somebody to answer questions about a migration it never recorded and could
    // not record the answers to. Nothing is lost by staying quiet here. The migration was
    // not written down and neither were its questions, so the next boot that reads a
    // healthy record raises both again, from the top.
    if (result.migrated && !result.damaged) {
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
            noteCloudUnavailable(error);
            console.info('Cloud sync is not available in this session:', error && error.message);
        });
    } catch (error) {
        cloudStarted = false;
        noteCloudUnavailable(error);
        console.info('Cloud sync could not be started:', error && error.message);
    }
    return cloudStarted;
}

// AN IMPORT THAT DID NOT ARRIVE IS NOT A PHONE WITHOUT A CLOUD.
//
// This used to be a console.info and nothing else, and the two situations were then
// indistinguishable on every screen: the line under the board read
// «הנתונים נשמרים במכשיר הזה בלבד», the chip stayed off, and the ⋯ panel said the same.
// That sentence is true of a build with no project configured. On a phone that HAS one it
// is the opposite of the truth - the record is on this disk, the other two phones are not
// getting it, and nothing anywhere says so. It is the same failure holdForRecovery was
// given a status of its own for (js/sync/status.js): recording all evening while the
// screen calls it local-only.
//
// Reported through the sync layer's own door rather than a banner of this file's own, so
// it arrives in the words the app already has: the foot line says the sync failed, the
// chip beside the name goes red, and the reason under it in ⋯ ← ענן וסנכרון is
// «אין כרגע גישה לענן - הניסיון יחזור מעצמו.» - which is exactly what happened and
// exactly what will happen, because the failed import is retried on the next resume.
//
// Only from 'off'. Anything else is a status something better informed has already set,
// and a stale import failure must not paint over a live one.
function noteCloudUnavailable(error) {
    if (typeof FarkadSync === 'undefined' || typeof FarkadSync.fail !== 'function') return;
    if (FarkadSync.status !== 'off') return;
    FarkadSync.fail(error instanceof Error ? error
        : new Error(String((error && error.message) || error || 'import failed')));
}

// Once, and never twice. A script that arrives after the document is already parsed gets
// no DOMContentLoaded, and an app that boots twice reads the disk twice and draws over
// its own first render.
let booted = false;
function bootOnce() {
    if (booted) return;
    booted = true;
    boot();
    // The seder's journey the app went away in the middle of - see js/ui/journey.js. Before
    // the seder's own list, which opens over its last station.
    if (typeof journeyResume === 'function') journeyResume();
    // A seder run the phone killed the app in the middle of - see js/ui/seder.js. Before
    // the reminder link is read, because it stands aside for one.
    if (typeof resumeSederRun === 'function') resumeSederRun();
    // The same for a run of pay statements (js/ui/payslips.js); it stands aside for any
    // dialog already open, the seder's list included.
    if (typeof resumePayslipsRun === 'function') resumePayslipsRun();
    FarkadReminders.openPending();
    // «מה חדש» (js/ui/whatsnew.js): last, after everything the boot itself reopens - the
    // quiet line waits for whatever dialog one of them put up.
    if (typeof whatsNewBoot === 'function') whatsNewBoot();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOnce, { once: true });
} else {
    bootOnce();
}
