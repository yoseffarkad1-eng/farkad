// Prompting to install to the home screen.
//
// This is not a nicety. On iPhone, a site that has only been visited in Safari has its
// storage wiped after seven days without a visit - and this app holds a fortnight of work
// records between pay runs. Installed to the home screen, the same site keeps its data.
// So the prompt is really a warning about losing the record, phrased as an invitation.
//
// Android gets the real thing: Chrome fires beforeinstallprompt and the browser installs
// it in one tap. iOS has no such event and never will, so there it is written out by
// hand: Share, then Add to Home Screen.

const INSTALL_DISMISSED_KEY = 'farkadInstallDismissed';

let deferredInstall = null;

function isStandalone() {
    // Two checks because iOS Safari does not implement display-mode and reports its own
    // navigator.standalone instead.
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

function isIos() {
    // iPadOS reports itself as a Mac, so the touch point count is what separates an iPad
    // from a desktop Safari that has nothing to install.
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function watchInstall() {
    if (isStandalone()) return;

    window.addEventListener('beforeinstallprompt', event => {
        // Held rather than fired: an install sheet thrown up over an empty app, before
        // the person has seen what it is, gets dismissed every time.
        event.preventDefault();
        deferredInstall = event;
        showInstallBanner('android');
    });

    window.addEventListener('appinstalled', () => {
        deferredInstall = null;
        hideInstallBanner();
    });

    // Only once there is something to lose. On a first visit the app is empty, the
    // warning is about nothing, and a banner over an empty screen just gets dismissed -
    // the same reasoning the Android prompt already follows.
    if (isIos() && Store.get(INSTALL_DISMISSED_KEY) !== '1' &&
        State.schedule.workers.length > 0) {
        showInstallBanner('ios');
    }
}

function showInstallBanner(kind) {
    if (Store.get(INSTALL_DISMISSED_KEY) === '1') return;

    const banner = document.getElementById('installBanner');
    if (!banner) return;

    clear(banner);

    if (kind === 'ios') {
        banner.appendChild(el('span', null,
            '📲 הוסף למסך הבית: לחץ על שיתוף ואז "הוסף למסך הבית". בלי זה הדפדפן מוחק את הנתונים אחרי שבוע.'));
    } else {
        banner.appendChild(el('span', null, '📲 התקן את האפליקציה במכשיר - נפתחת מהר יותר ועובדת בלי חיבור.'));
        banner.appendChild(button('התקן', 'btn-secondary', runInstall));
    }

    banner.appendChild(button('✕', 'btn-icon', dismissInstall, 'סגור'));
    banner.style.display = '';
}

function runInstall() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => {
        deferredInstall = null;
        hideInstallBanner();
    });
}

// Dismissal is remembered. Being told the same thing on every visit is how a warning
// stops being read, including the part about losing a fortnight of records.
function dismissInstall() {
    Store.set(INSTALL_DISMISSED_KEY, '1');
    hideInstallBanner();
}

function hideInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
}
