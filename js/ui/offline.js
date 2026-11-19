// Service worker registration and the update prompt.
//
// A new version is never swapped in under somebody's hands. Someone entering a day's
// record would have the screen reload mid-edit, and on a page whose whole job is a
// financial record that is not an acceptable surprise. On a page in use the new version
// waits until they press the banner, exactly as before.
//
// Since v205 it also takes itself at the next LAUNCH of the app, before anybody has started
// to work - the owner, 2026-11-19: "make the update automatic, no need to press it". Only
// there: a page freshly loaded (a navigation or a reload, never one brought back whole from
// the back-forward cache), a build already installed and waiting, nothing pressed and no key
// struck since the page loaded, and nothing a reload would throw away (midEdit). Then a
// cover goes over the whole glass at once with one line on it, the waiting build is asked to
// take over, and the page reloads once THAT build has taken over and is activated. The cover
// eats every touch and key, and moves no focus - it blurs nothing, so no box can commit what
// it holds on the way out. If the handover has not come within 12 seconds the cover comes
// down, the banner offers the update as before, and this page never reloads by itself after
// that. Two rounds of reloading a page that was already in use (v205's first candidates,
// 684c0f2 and 81ca7a3) each opened a hole in somebody's record; they are not here. A phone
// on v204 or older has the old rule and needs ONE tap to reach this one.

let waitingWorker = null;
let applyingUpdate = false;
let swRegistration = null;

// THE LAUNCH (v205). Has anybody pressed or typed since this page loaded? On the window and
// in the capture phase, so no control's own handler can keep it from being seen. A cover
// goes up only on a page nobody has touched.
let launchTouched = false;
// A page brought back whole from the back-forward cache is not a launch.
let launchFresh = true;
// The worker the launch asked to take over, whether its cover is up, and its deadline.
let launchWorker = null;
let launchCovered = false;
let launchDeadline = null;
const LAUNCH_WAIT_MS = 12000;
const LAUNCH_TEXT = 'מעדכן לגרסה חדשה…';
try {
    ['pointerdown', 'touchstart', 'keydown'].forEach(type =>
        window.addEventListener(type, () => { launchTouched = true; }, { capture: true, passive: true }));
    window.addEventListener('pageshow', event => { if (event && event.persisted) launchFresh = false; });
} catch (error) { /* no window: nothing is launched */ }

function registerOffline() {
    if (!('serviceWorker' in navigator)) return;

    // A service worker needs https or localhost. Opened straight from the filesystem it
    // simply does not register, and the app carries on online-only.
    if (location.protocol === 'file:') return;

    // Inside a sandboxed frame the property EXISTS and throws on access, so the usual
    // feature check passes and the read below is what fails. Uncaught, that took down
    // everything after this call in the boot sequence - the connection watcher, the
    // install prompt, the migration notice - in a page that otherwise looked fine.
    let container;
    try {
        container = navigator.serviceWorker;
    } catch (error) {
        console.info('Offline support unavailable:', error);
        return;
    }

    // The launch asks as early as the boot allows: the registration as it stands, before
    // register() has done its own work; and again when register() resolves, and 1.5 s later.
    try {
        if (typeof container.getRegistration === 'function') {
            container.getRegistration().then(registration => {
                if (registration && registration.waiting) launchUpdate(registration.waiting);
            }).catch(() => {});
        }
    } catch (error) { /* asked again below */ }

    container.register('sw.js').then(registration => {
        swRegistration = registration;

        // An installed app on a phone is not reopened, it is RESUMED - sometimes for
        // weeks without a real navigation, which is the only thing that checks for a
        // new worker on its own. So ask on every return to the foreground; the check
        // is a conditional request and costs nothing when there is nothing new.
        //
        // The waiting worker is re-offered here too. iOS restarts a home-screen app
        // freely, and the banner does not survive that - so an update could sit ready
        // and unannounced, which is exactly what "it appeared for a moment and went
        // away" looks like from the outside.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            registration.update().catch(() => {});
            if (registration.waiting) showUpdateBanner(registration.waiting);
        });

        // At the launch, a build already waiting is taken under the cover (launchUpdate);
        // on a page somebody has already touched it is offered, as before.
        if (registration.waiting && !launchUpdate(registration.waiting)) showUpdateBanner(registration.waiting);
        // register() can resolve a moment before the waiting worker is known.
        setTimeout(() => {
            if (registration.waiting && !launchUpdate(registration.waiting)) showUpdateBanner(registration.waiting);
        }, 1500);

        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;

            installing.addEventListener('statechange', () => {
                // "installed" with an existing controller means this is an update, not a
                // first install - only then is there something to offer.
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner(installing);
                }
            });
        });
    }).catch(error => {
        console.info('Offline support unavailable:', error);
    });

    // Tell the worker which build is running here, whenever one is in charge. It cannot
    // work this out for a page shipped before the message existed, so silence keeps that
    // page's cache and that page's bytes; this is what lets the cache go promptly once
    // the last window running it has been replaced.
    const announce = () => {
        const worker = container.controller;
        if (worker) worker.postMessage({ type: 'running', build: 'farkad-' + APP_VERSION });
    };
    announce();
    container.addEventListener('controllerchange', announce);

    // Ask the worker which builds have a window open, and hand the answer to Store.
    //
    // The rescue export's stability claim rests on nothing having written the disk while
    // the file was being read, and the one writer it cannot see is a window running a
    // build that predates the write fence - every phone in the field, for the length of a
    // rollout. The worker knows, because it enrolled those windows before it claimed them.
    //
    // Asked on a fresh MessageChannel so the answer comes back to THIS window; asked again
    // whenever the page is brought forward, because a window can be opened at any moment
    // and a census from ten minutes ago is not an answer about now.
    const census = () => {
        const worker = container.controller;
        if (!worker || typeof MessageChannel !== 'function') return;
        try {
            const channel = new MessageChannel();
            channel.port1.onmessage = event => {
                const said = event.data;
                if (!said || said.type !== 'builds') return;
                Store.noteOpenBuilds(said.builds, said.unknown);
            };
            worker.postMessage({ type: 'which-builds' }, [channel.port2]);
        } catch (error) {
            // No answer is not an answer. Store treats a census it never received as
            // "nobody has said", which is not the same as "nobody is there".
        }
    };
    census();
    container.addEventListener('controllerchange', census);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) census();
    });

    container.addEventListener('controllerchange', () => {
        // This also fires the first time a worker claims the page, which is not an
        // update - reloading there makes every first visit load twice, and reload the
        // screen out from under whatever the person had already started typing.
        //
        // It ALSO fires in every other window of the app, because the new worker claims
        // all of them. That window did not press anything and must not be reloaded under
        // somebody's hands - but leaving it there for ever is not the answer either: it
        // is a page from one build under a worker from the next, for as long as it stays
        // open. So it waits for the one safe moment and then catches up.
        if (launchHandover()) return;
        if (!applyingUpdate && !crossedUnderUs()) return;
        catchUpWhenSafe();
    });
}

// THE LAUNCH (v205): take the waiting build now, under a cover, if this is a fresh page that
// nobody has touched and nothing would be thrown away. Returns true when it has been taken
// (or is being taken); false and nothing done otherwise - the caller offers the banner.
function launchUpdate(worker) {
    if (launchWorker) return launchCovered;
    if (!worker || !launchFresh || launchTouched) return false;
    let controlled = false;
    try { controlled = Boolean(navigator.serviceWorker.controller); } catch (error) { controlled = false; }
    // A first install has nothing to update FROM.
    if (!controlled) return false;
    if (midEdit()) return false;
    if (!launchCover(true)) return false;
    launchWorker = worker;
    worker.postMessage('skip-waiting');
    launchDeadline = setTimeout(launchGiveUp, LAUNCH_WAIT_MS);
    return true;
}

// A controllerchange that is the launch's own handover: decided here. Under the cover, the
// page waits for THAT worker to be activated and reloads. With the cover down (the deadline
// passed) it never reloads by itself - unless the banner was pressed since, which is the
// press's own business, as before.
function launchHandover() {
    if (!launchWorker) return false;
    let controller = null;
    try { controller = navigator.serviceWorker.controller; } catch (error) { controller = null; }
    if (controller !== launchWorker) return false;
    if (launchCovered) {
        launchWhenActive(controller);
        return true;
    }
    if (applyingUpdate) return false;
    // The new build has taken over this page after all: a press of the banner now reloads.
    waitingWorker = null;
    return true;
}

// Reload once the worker that took over is activated: a reload asked of a worker still
// activating is held by the browser, and only the cover stands between that and the glass.
function launchWhenActive(worker) {
    if (!worker || worker.state === 'activated' || typeof worker.addEventListener !== 'function') {
        launchReload();
        return;
    }
    const settled = () => {
        if (worker.state !== 'activated' && worker.state !== 'redundant') return;
        worker.removeEventListener('statechange', settled);
        if (worker.state === 'activated') launchReload();
    };
    worker.addEventListener('statechange', settled);
}

function launchReload() {
    if (!launchCovered) return;
    location.reload();
}

// Twelve seconds and no handover (or no activation): the cover comes down, the banner offers
// the update, and the launch is over. Nothing reloads this page by itself after this.
function launchGiveUp() {
    launchDeadline = null;
    if (!launchCovered) return;
    launchCover(false);
    let handedOver = false;
    try { handedOver = Boolean(launchWorker && navigator.serviceWorker.controller === launchWorker); } catch (error) { handedOver = false; }
    showUpdateBanner(launchWorker);
    // Already in charge of this page: a press is a plain reload (applyUpdate's own way).
    if (handedOver) waitingWorker = null;
}

// The cover: index.html's #launchCover, over the whole glass, one line on it. Every touch
// and every key lands on it and stops there - and NOTHING moves the focus: no blur, no focus
// call, a press on the cover prevented before the browser can move the focus off whatever
// had it, so no box can fire a change and commit what it holds.
function launchEats(event) {
    if (!launchCovered) return;
    if (event.cancelable !== false && typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else if (typeof event.stopPropagation === 'function') event.stopPropagation();
}
const LAUNCH_POINTER_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick',
    'touchstart', 'touchmove', 'touchend', 'contextmenu', 'wheel'];
const LAUNCH_KEY_EVENTS = ['keydown', 'keypress', 'keyup'];
function launchCover(on) {
    try {
        const cover = document.getElementById('launchCover');
        if (!cover) return false;
        if (on) {
            cover.textContent = LAUNCH_TEXT;
            if (!cover.dataset.launchListening) {
                cover.dataset.launchListening = '1';
                LAUNCH_POINTER_EVENTS.forEach(type => cover.addEventListener(type, launchEats, { capture: true, passive: false }));
            }
            LAUNCH_KEY_EVENTS.forEach(type => window.addEventListener(type, launchEats, true));
            launchCovered = true;
            cover.hidden = false;
        } else {
            launchCovered = false;
            cover.hidden = true;
            LAUNCH_KEY_EVENTS.forEach(type => window.removeEventListener(type, launchEats, true));
        }
        return true;
    } catch (error) {
        return false;
    }
}

// Whether this page was already under a worker when it loaded. Read ONCE, at load: a
// controllerchange with no controller beforehand is a first install claiming the page,
// and reloading there makes every first visit load twice and throws away whatever the
// person had already started typing. A controllerchange with one beforehand is a
// different build taking over a running page, which is the case below.
// Read inside a try: in a sandboxed frame without allow-same-origin, merely READING
// navigator.serviceWorker throws - it does not return undefined - and this runs at
// definition time, so an unguarded read takes the whole app down before the first render
// in exactly the frame the app is embedded in.
const hadController = (() => {
    try {
        return Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
    } catch (error) {
        return false;
    }
})();

function crossedUnderUs() {
    return hadController;
}

// Reload, at the first moment it costs nobody anything. Not on a timer that gives up:
// the page and the worker are from different builds until this happens, and half a
// session of that is exactly what sw.js is written to prevent.
function catchUpWhenSafe() {
    if (!midEdit()) { location.reload(); return; }
    setTimeout(catchUpWhenSafe, 500);
}

// Is a new build sitting installed and waiting for a yes? Asked by the settings sheet
// (js/ui/settings.js), which opens its עדכון וגרסה row over one: the banner that offers
// the update can be dismissed with «אחר כך», and a waiting build behind a dismissed banner
// AND a closed row would be an update nothing on the screen admits to.
function updateWaiting() {
    return Boolean(waitingWorker || (swRegistration && swRegistration.waiting));
}

function showUpdateBanner(worker) {
    waitingWorker = worker;
    // A build that arrives while the sheet is open is news for the sheet too.
    if (typeof revealSettingsFolds === 'function') revealSettingsFolds();
    const banner = document.getElementById('updateBanner');
    if (!banner) return;

    clear(banner);
    banner.appendChild(el('span', null, '🔄 גרסה חדשה זמינה'));
    banner.appendChild(button('רענן עכשיו', 'btn-secondary', applyUpdate));
    banner.appendChild(button('אחר כך', 'btn-icon', () => { banner.style.display = 'none'; }));
    banner.style.display = '';
}

// Is somebody in the middle of something a reload would throw away?
//
// Every edit is written to disk the moment it is made, so there is no unsaved schedule -
// but there is unsaved TYPING: a worker's name half entered in a dialog, an amount in an
// advance, a site being renamed. A reload takes that with it, and an update the person
// did not ask for at that exact second is not worth it.
function midEdit() {
    if (typeof ADVANCE_ORDER_DRAFT !== 'undefined' && ADVANCE_ORDER_DRAFT) return true;
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName) && active.value) return true;

    return [...document.querySelectorAll('.modal')]
        .some(modal => modal.style.display && modal.style.display !== 'none');
}

function applyUpdate() {
    applyingUpdate = true;
    if (!waitingWorker) {
        location.reload();
        return;
    }
    waitingWorker.postMessage('skip-waiting');

    // If the handover never comes - the waiting worker was already replaced, or the
    // message went nowhere - the flag must not stay armed: the NEXT controllerchange,
    // whenever it happens, would reload the page under someone's hands mid-entry.
    setTimeout(() => { applyingUpdate = false; }, 4000);
}

// Connection state, shown next to where the data lives. Being offline is normal on a
// site and is not an error - but silently looking identical to being online is.
function watchConnection() {
    const paint = () => {
        // The grey line under the board and the settings panel's mirror of it answer
        // the same question as the banner - the three change together or they read as
        // three apps. Above the banner guard, so a missing banner element cannot take
        // the line down with it.
        if (typeof updateSyncNotice === 'function') updateSyncNotice();
        if (typeof renderSettingsIfOpen === 'function') renderSettingsIfOpen();
        const banner = document.getElementById('offlineBanner');
        if (!banner) return;
        banner.style.display = navigator.onLine ? 'none' : '';
        banner.textContent = '📴 אין חיבור. הרישום נשמר במכשיר ויסונכרן כשהחיבור יחזור.';
    };

    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    paint();
}


// The way out when the banner never shows up. An installed app can sit on a cached
// version for a long time: the new worker only takes over once every window of the app
// is closed, and on a phone "closed" is not what going back to the home screen does.
// This asks the server directly, takes whatever is waiting, and reloads onto it.
function checkForUpdate() {
    const say = text => askTell(text);
    // The check answers in a dialog and its version line is in the עדכון וגרסה row; whoever
    // presses this from anywhere but that row finds the row open when the dialog is gone.
    if (typeof settingsSendTo === 'function') settingsSendTo('settingsFoldUpdate');

    if (!swRegistration) {
        say(`הגרסה הפעילה: ${APP_VERSION}. עדכונים אוטומטיים אינם זמינים כאן - פתח את האתר בדפדפן.`);
        return;
    }

    swRegistration.update()
        .then(() => new Promise(resolve => setTimeout(resolve, 1200)))
        .then(() => {
            if (swRegistration.waiting) {
                applyingUpdate = true;
                swRegistration.waiting.postMessage('skip-waiting');
                // controllerchange reloads; this is the backstop for when it does not
                // arrive, which is common enough on iOS to be worth covering.
                setTimeout(() => { if (!midEdit()) location.reload(); }, 2000);
                return;
            }
            if (swRegistration.installing) {
                say('העדכון יורד כעת. נסה שוב בעוד רגע.');
                return;
            }
            say(`הגרסה מעודכנת: ${APP_VERSION}.`);
        })
        .catch(error => say('בדיקת העדכון נכשלה: ' + ((error && error.message) || error)));
}
