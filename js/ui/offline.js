// Service worker registration and the update prompt.
//
// A new version is never swapped in on its own. Someone entering a day's record would
// have the screen reload under their hands mid-edit, and on a page whose whole job is a
// financial record that is not an acceptable surprise. The new version waits until they
// press the banner.

let waitingWorker = null;
let applyingUpdate = false;

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

    container.register('sw.js').then(registration => {
        // An installed app on a phone is not reopened, it is RESUMED - sometimes for
        // weeks without a real navigation, which is the only thing that checks for a
        // new worker on its own. So ask on every return to the foreground; the check
        // is a conditional request and costs nothing when there is nothing new.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                registration.update().catch(() => {});
            }
        });

        if (registration.waiting) showUpdateBanner(registration.waiting);

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

    container.addEventListener('controllerchange', () => {
        // This also fires the first time a worker claims the page, which is not an
        // update - reloading there makes every first visit load twice, and reload the
        // screen out from under whatever the person had already started typing.
        if (!applyingUpdate) return;
        location.reload();
    });
}

function showUpdateBanner(worker) {
    waitingWorker = worker;
    const banner = document.getElementById('updateBanner');
    if (!banner) return;

    clear(banner);
    banner.appendChild(el('span', null, '🔄 גרסה חדשה זמינה'));
    banner.appendChild(button('רענן עכשיו', 'btn-secondary', applyUpdate));
    banner.appendChild(button('אחר כך', 'btn-icon', () => { banner.style.display = 'none'; }));
    banner.style.display = '';
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
        const banner = document.getElementById('offlineBanner');
        if (!banner) return;
        banner.style.display = navigator.onLine ? 'none' : '';
        banner.textContent = '📴 אין חיבור. הרישום נשמר במכשיר ויסונכרן כשהחיבור יחזור.';
    };

    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    paint();
}
