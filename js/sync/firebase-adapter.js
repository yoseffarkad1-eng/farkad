// Firebase adapter. This is the ONLY file that knows Firebase exists - everything else
// talks to FarkadSync, which talks to whatever adapter is connected.
//
// It is an ES module because the Firebase v9 SDK only ships as modules. That is fine and
// deliberate: it loads separately from the app's classic scripts and reaches them through
// the global scope, so the inline onclick handlers everywhere else keep working. Do NOT
// convert the rest of the app to modules to match this file.
//
// With firebase-config.js left as the placeholder, this module does nothing at all and
// the app stays local-only.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    onSnapshot,
    FieldPath
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig, SCHEDULE_DOC_PATH } from './firebase-config.js';

function isConfigured() {
    return Boolean(firebaseConfig && firebaseConfig.projectId && firebaseConfig.apiKey);
}

if (!isConfigured()) {
    console.info('Firebase is not configured - running local-only. See docs/firebase-setup.md');
} else {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const scheduleRef = doc(db, ...SCHEDULE_DOC_PATH.split('/'));

    // The sync layer's paths look like days.2026-08-12.plan.w_01. Passing that to
    // updateDoc as a STRING would throw "invalid field path": in a string path, any
    // segment that starts with a digit or contains a dash has to be backtick-escaped,
    // and every date segment does both. So every single field write would have failed
    // the first time sync was switched on - the design would have died on contact.
    //
    // The FieldPath constructor takes the segments raw and does its own escaping, and
    // updateDoc accepts (path, value, path, value, ...) pairs.
    function patchToUpdateArgs(patch) {
        const args = [];
        Object.keys(patch).forEach(path => {
            args.push(new FieldPath(...path.split('.')), patch[path]);
        });
        return args;
    }

    // Sign-in is a button rather than an automatic redirect: an automatic one would lock
    // the door on anyone who opens the page before the allowlist has their address.
    //
    // A popup is the better experience where it works, and it does not always: an app
    // launched from the home screen on iOS has no window to open one into, and Safari
    // blocks popups that are not obviously a click. When that happens the whole page
    // goes to Google and comes back, which is slower and perfectly reliable.
    function signInMessage(error) {
        const code = (error && error.code) || '';
        if (code === 'auth/unauthorized-domain') {
            return 'הכתובת של האתר לא מאושרת בפרויקט. הוסף אותה ב-Firebase: ' +
                'Authentication → Settings → Authorized domains.';
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
            return 'ההתחברות בוטלה.';
        }
        return 'ההתחברות נכשלה: ' + ((error && error.message) || error);
    }

    function usePopup() {
        // An installed app has no separate window to put a popup in.
        return !(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            && !window.navigator.standalone;
    }

    window.farkadSignIn = () => {
        const provider = new GoogleAuthProvider();
        if (!usePopup()) {
            return signInWithRedirect(auth, provider)
                .catch(error => askTell(signInMessage(error)));
        }
        return signInWithPopup(auth, provider).catch(error => {
            const code = (error && error.code) || '';
            // The environment refused the popup rather than the person refusing the
            // sign-in: fall the whole page through to Google instead of reporting a
            // failure the person cannot do anything about.
            if (code === 'auth/popup-blocked'
                || code === 'auth/operation-not-supported-in-this-environment'
                || code === 'auth/popup-closed-by-user') {
                return signInWithRedirect(auth, provider)
                    .catch(inner => askTell(signInMessage(inner)));
            }
            console.error('Sign-in failed:', error);
            askTell(signInMessage(error));
        });
    };

    // Coming back from the redirect. Only an error needs saying - a success arrives at
    // onAuthStateChanged below like any other sign-in.
    getRedirectResult(auth).catch(error => {
        console.error('Sign-in redirect failed:', error);
        askTell(signInMessage(error));
    });

    window.farkadSignOut = () => signOut(auth);

    onAuthStateChanged(auth, user => {
        const button = document.getElementById('syncAuthBtn');

        // The button ships hidden, because with no Firebase project a "connect to the
        // cloud" button is a door onto nothing. Reaching this callback means the SDK
        // loaded and a project answered, so the door is real - and nothing else on the
        // page was ever going to show it.
        if (button) button.style.display = '';

        if (!user) {
            window.FarkadSync.disconnect();
            if (button) {
                button.textContent = '☁️ התחבר לענן';
                button.setAttribute('onclick', 'farkadSignIn()');
            }
            return;
        }

        if (button) {
            button.textContent = `☁️ ${user.email}`;
            button.setAttribute('onclick', 'farkadSignOut()');
        }

        window.FarkadSync.connect({
            // Firestore merges dotted field paths server-side, so two people writing
            // days.2026-08-12.plan.w_01 and ...plan.w_07 both land. This is what lets the
            // three of them build the evening roster at the same time.
            update(patch) {
                const args = patchToUpdateArgs(patch);
                return updateDoc(scheduleRef, ...args)
                    .catch(error => {
                        // A document that does not exist yet cannot be updated.
                        if (error && error.code === 'not-found') {
                            return setDoc(scheduleRef, {}, { merge: true })
                                .then(() => updateDoc(scheduleRef, ...args));
                        }
                        throw error;
                    });
            },
            save(data) {
                return setDoc(scheduleRef, data);
            },

            // Sync is not a backup: a deletion syncs as faithfully as a correction, and
            // by the time it is noticed every phone agrees with it. These are the copies
            // that disagree - one per day, written by whichever device opens first.
            //
            // The rules allow CREATE here and nothing else. So a day's copy cannot be
            // overwritten by a later, already-damaged state, and cannot be deleted by a
            // careless tap or a bug in this file. That is what makes it a backup rather
            // than another mirror.
            archive(key, data) {
                return setDoc(doc(db, 'history', key), data);
            },
            archiveDates() {
                return getDocs(collection(db, 'history'))
                    .then(snapshot => snapshot.docs.map(entry => entry.id).sort().reverse());
            },
            archiveRead(key) {
                return getDoc(doc(db, 'history', key))
                    .then(snapshot => (snapshot.exists() ? snapshot.data() : null));
            },
            subscribe(onSnapshotData, onError) {
                return onSnapshot(
                    scheduleRef,
                    snapshot => {
                        if (snapshot.exists()) {
                            onSnapshotData(snapshot.data());
                            return;
                        }
                        // A project connected for the first time has no document yet.
                        // Saying so - as an empty, unstamped schedule - lets the sync
                        // layer leave local data alone, mark itself synced, and push
                        // anything queued. Staying silent left it on "מתחבר לענן…"
                        // forever, until the first local edit happened to create the
                        // document.
                        onSnapshotData({ workers: [], places: [], days: {}, updatedAt: null });
                    },
                    onError
                );
            }
        });
    });
}
