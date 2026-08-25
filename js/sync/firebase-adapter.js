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
    signInWithEmailAndPassword,
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
    runTransaction,
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

    // Sign-in has to happen INSIDE the app, and on an iPhone that rules out both of the
    // usual routes. A home-screen web app has its own storage, separate from Safari's,
    // and any Google flow - popup or redirect - hands the whole thing to Safari: the
    // sign-in completes over there, in a different store, and the app comes back exactly
    // as signed-out as it left. Which is what "it opens Safari and drops straight back"
    // is, from the outside.
    //
    // Email and password never leaves the page, so it works in the installed app, in a
    // browser, and on a desktop alike. Google stays as a second door for a browser,
    // where it is the more convenient one.
    function authMessage(error) {
        const code = (error && error.code) || '';
        const said = {
            'auth/invalid-email': 'כתובת המייל אינה תקינה.',
            'auth/user-not-found': 'אין משתמש עם הכתובת הזו. הוסף אותו ב-Firebase → Authentication → Users.',
            'auth/wrong-password': 'הסיסמה שגויה.',
            'auth/invalid-credential': 'המייל או הסיסמה שגויים.',
            'auth/too-many-requests': 'יותר מדי נסיונות. המתן דקה ונסה שוב.',
            'auth/network-request-failed': 'אין חיבור לרשת.',
            'auth/unauthorized-domain': 'הכתובת של האתר לא מאושרת ב-Firebase: Authentication → Settings → Authorized domains.',
            'auth/popup-closed-by-user': 'ההתחברות בוטלה.',
            'auth/operation-not-allowed': 'התחברות במייל וסיסמה אינה מופעלת בפרויקט: Authentication → Sign-in method → Email/Password → Enable.'
        }[code];
        return said || ('ההתחברות נכשלה: ' + ((error && error.message) || error));
    }

    window.farkadSignIn = () => openSignInModal();

    window.farkadSignInWithPassword = () => {
        const email = document.getElementById('signInEmail').value.trim();
        const password = document.getElementById('signInPassword').value;
        const error = document.getElementById('signInError');

        if (!email || !password) {
            error.textContent = 'הכנס מייל וסיסמה.';
            return;
        }
        error.textContent = 'מתחבר…';

        signInWithEmailAndPassword(auth, email, password)
            .then(closeSignInModal)
            .catch(err => { error.textContent = authMessage(err); });
    };

    // The browser door. Useless in an installed app for the reason above, so it says so
    // rather than opening Safari and dropping the person back where they started.
    window.farkadSignInWithGoogle = () => {
        const error = document.getElementById('signInError');
        const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone;

        if (standalone) {
            error.textContent = 'באפליקציה המותקנת יש להתחבר עם מייל וסיסמה - התחברות Google עובדת רק בדפדפן.';
            return;
        }
        signInWithPopup(auth, new GoogleAuthProvider())
            .then(closeSignInModal)
            .catch(err => { error.textContent = authMessage(err); });
    };

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
                // 'not-found' travels back to the sync layer untouched. Answering it
                // here used to mean writing an empty {} - which the rules refuse, since
                // they require a timestamp on every write - so the first sync of a new
                // project failed twice over and reported only "sync error". What to put
                // in a document that does not exist yet is a question about the
                // schedule, and this file is not allowed to know what a schedule is.
                return updateDoc(scheduleRef, ...patchToUpdateArgs(patch));
            },
            save(data) {
                return setDoc(scheduleRef, data);
            },

            // The first write of a new project. A transaction rather than a plain set:
            // two phones opened the same evening are both told the document is missing
            // and both try to create it, and a set would let the second silently
            // overwrite the first. Inside the transaction the read and the write are one
            // operation, so exactly one wins and the other is handed 'already-exists' -
            // which the sync layer turns back into an ordinary field merge.
            create(data) {
                return runTransaction(db, transaction =>
                    transaction.get(scheduleRef).then(snapshot => {
                        if (snapshot.exists()) {
                            const error = new Error('the schedule already exists');
                            error.code = 'already-exists';
                            throw error;
                        }
                        transaction.set(scheduleRef, data);
                    }));
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
