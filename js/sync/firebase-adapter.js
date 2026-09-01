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

// THE WRITE PATH, AT MODULE SCOPE, so that something other than a signed-in browser can
// run it.
//
// All of this used to live inside the `else` branch below, inside an auth callback, three
// closures deep. It worked, and it was unreachable: no test could get at it, so the one
// financially critical path in this file - the transaction that decides whether a write
// is a conflict, and what it hands back when it refuses - was the only part of the app
// with no coverage against a real Firestore at all. That is how it came to differ from
// the fake cloud the CAS suite exercises, and nobody found out.
//
// Nothing here knows about auth, the DOM or the app. It takes a database handle and the
// two document references, and returns the operations. The browser path builds it from
// the real project; tests/cas.emulator.test.mjs builds it from the emulator and runs
// these exact functions.

// The sync layer's paths look like days.2026-08-12.plan.w_01. Passing that to updateDoc
// as a STRING would throw "invalid field path": in a string path, any segment that starts
// with a digit or contains a dash has to be backtick-escaped, and every date segment does
// both. So every single field write would have failed the first time sync was switched on
// - the design would have died on contact.
//
// The FieldPath constructor takes the segments raw and does its own escaping, and
// updateDoc accepts (path, value, path, value, ...) pairs.
export function patchToUpdateArgs(patch) {
    const args = [];
    Object.keys(patch).forEach(path => {
        args.push(new FieldPath(...path.split('.')), patch[path]);
    });
    return args;
}

export function firestoreOps(db, scheduleRef, receiptRef) {
    // One write, one receipt, one transaction. `apply` does the schedule half.
    function withReceipt(payload, apply) {
        return runTransaction(db, transaction =>
            transaction.get(receiptRef(payload.lastOpId)).then(receipt =>
                transaction.get(scheduleRef).then(snapshot => {
                // ALREADY APPLIED - CHECKED AGAINST THE DOCUMENT, not taken on trust.
                //
                // The receipt's existence was the whole proof, and the rules used to let
                // anybody on the list create one alone: a receipt naming revision 999
                // with no schedule write anywhere near it. This client is built to
                // believe a receipt - that is what makes a retry safe - so it would have
                // found that one, answered success, acknowledged, and pruned the queue.
                // An evening off the phone on the strength of a record nothing wrote.
                //
                // The rules refuse to create such a receipt now (receiptMatchesSchedule),
                // and this is the same question asked from the client's side, because a
                // receipt already on the disk from before those rules were published is
                // not covered by them. A receipt is proof only if the document it names
                // has actually reached that revision.
                if (receipt.exists()) {
                    const claimed = receipt.data().revision;
                    const held = snapshot.exists() ? snapshot.data().revision : null;
                    if (!snapshot.exists() || !Number.isInteger(held)
                        || !Number.isInteger(claimed) || held < claimed) {
                        const error = new Error('a receipt claims a revision the schedule '
                            + 'never reached');
                        error.code = 'receipt-mismatch';
                        error.claimed = Number.isInteger(claimed) ? claimed : null;
                        error.revision = Number.isInteger(held) ? held : null;
                        throw error;
                    }
                    // AND IT HAS TO BE THIS OPERATION'S RECEIPT.
                    //
                    // The revision check above says a write wearing this name reached this
                    // revision. It does not say what that write did, and the client is
                    // built to BELIEVE a receipt - that is what makes a retry safe - so a
                    // second arrival carrying the same name and a different path and value
                    // was answered "already applied", acknowledged, pruned and reported
                    // synced, with the phone holding one value and the cloud another.
                    //
                    // A receipt written before this field existed carries none; that is an
                    // older receipt rather than a lie, and the revision check is what it
                    // gets. A receipt that HAS one must agree.
                    const named = receipt.data().opFingerprint;
                    if (typeof named === 'string' && named !== payload.opFingerprint) {
                        const error = new Error('a receipt of this name describes a '
                            + 'different operation');
                        error.code = 'receipt-mismatch';
                        error.expected = named;
                        error.sent = payload.opFingerprint || null;
                        throw error;
                    }
                    return;
                }
                return Promise.resolve().then(() => {
                    if (!snapshot.exists()) {
                        const error = new Error('No document to update');
                        error.code = 'not-found';
                        throw error;
                    }
                    const held = snapshot.data().revision;
                    const base = Number.isInteger(held) ? held : 0;
                    if (payload.revision !== base + 1) {
                        const error = new Error('the document moved while this write '
                            + 'was being prepared');
                        error.code = 'conflict';
                        error.revision = base;
                        // THE DOCUMENT THE TRANSACTION ACTUALLY READ, handed back with the
                        // refusal.
                        //
                        // Without it the client fell back to its last onSnapshot delivery,
                        // which is a different channel with no ordering against this read.
                        // The window is real: this transaction sees revision N+1 and
                        // refuses, the snapshot for N+1 has not arrived, so the client
                        // compares against revision N - where the path another phone just
                        // corrected still holds the value this write was built on. It
                        // reads as uncontested, rebases, and puts the older value back
                        // over the correction.
                        //
                        // A COPY, not the snapshot's own object: what travels to the
                        // client must not be a live handle into the SDK's cache.
                        error.document = JSON.parse(JSON.stringify(snapshot.data()));
                        throw error;
                    }
                    apply(transaction);
                    transaction.set(receiptRef(payload.lastOpId), {
                        revision: payload.revision,
                        // What the operation DID, carried on the receipt and on the
                        // schedule in the same transaction, so the pair can never be
                        // re-pointed at different semantics afterwards - receipts are
                        // immutable, so the first pairing is binding for ever.
                        opFingerprint: payload.opFingerprint || null,
                        at: new Date().toISOString(),
                        by: payload.updatedBy || null
                    });
                });
            })));
    }

    return {
        withReceipt,
        // THE CUTOVER WRITE, and it carries no business data at all.
        //
        // The live document was written by builds that had never heard of a revision, so
        // it has none - and against a document with no revision the compare-and-set
        // cannot refuse anything. `payload.revision === 0 + 1` is true for every write
        // ever prepared, whatever it was built on and however long it has been queued.
        //
        // Which is exactly what went wrong. A phone that updated while offline, holding
        // an edit for a day another phone had since corrected, came back and sent it as
        // its first protocol write: accepted at revision 1, business paths and all, and
        // the correction was gone. Nothing was refused, nothing was held, nobody was
        // told, and the document then claimed revision 1 as though the ordering had been
        // in force the whole time. Cutover was the one moment the protocol did not cover.
        //
        // So the first protocol write is its own operation and writes FIVE fields:
        // protocol, revision, lastOpId, and the stamp the rules require. No days, no
        // workers, no places, no advances, no ledger, no roster - nothing a person
        // recorded. It moves the document into the protocol and changes not one number.
        //
        // Afterwards the client has an authoritative revision and an authoritative
        // document, and every queued edit goes out through the ordinary CAS against them
        // - where a path somebody corrected is a contest and is held, and a path nobody
        // touched merges. See bootstrapCutover in js/sync/sync.js.
        bootstrap(payload) {
            return runTransaction(db, transaction =>
                transaction.get(receiptRef(payload.lastOpId)).then(receipt =>
                    transaction.get(scheduleRef).then(snapshot => {
                        // The same question as withReceipt asks, and it matters more here:
                        // a device that skipped its bootstrap on the strength of a receipt
                        // nothing wrote would go straight on to send business data against
                        // a document that still has no revision - which is the defect the
                        // bootstrap exists to prevent, reached through the receipt.
                        if (receipt.exists()) {
                            const claimed = receipt.data().revision;
                            const held = snapshot.exists() ? snapshot.data().revision : null;
                            if (!snapshot.exists() || !Number.isInteger(held)
                                || !Number.isInteger(claimed) || held < claimed) {
                                const error = new Error('a receipt claims a revision the '
                                    + 'schedule never reached');
                                error.code = 'receipt-mismatch';
                                throw error;
                            }
                            return JSON.parse(JSON.stringify(snapshot.data()));
                        }
                        if (!snapshot.exists()) {
                            const error = new Error('No document to bootstrap');
                            error.code = 'not-found';
                            throw error;
                        }
                        const held = snapshot.data().revision;
                        // ALREADY IN THE PROTOCOL. Another phone got there first, or this
                        // one has been away longer than it thought. Not an error the
                        // person needs to see: it is a conflict carrying the authoritative
                        // document, which is precisely what the client needs to rebuild
                        // its queued writes against.
                        if (Number.isInteger(held)) {
                            const error = new Error('the document is already in the protocol');
                            error.code = 'conflict';
                            error.revision = held;
                            error.document = JSON.parse(JSON.stringify(snapshot.data()));
                            throw error;
                        }
                        transaction.update(scheduleRef,
                            'protocol', payload.protocol,
                            'revision', 1,
                            'lastOpId', payload.lastOpId,
                            'updatedAt', payload.updatedAt,
                            'updatedBy', payload.updatedBy || null);
                        transaction.set(receiptRef(payload.lastOpId), {
                            revision: 1,
                            at: new Date().toISOString(),
                            by: payload.updatedBy || null
                        });
                        // The document as this transaction leaves it: what it read, plus
                        // the five fields it wrote and nothing else. Handed back so the
                        // caller has an authoritative base without a second round trip -
                        // it still rereads when it can, and this is what it falls back on.
                        return Object.assign(
                            JSON.parse(JSON.stringify(snapshot.data())),
                            {
                                protocol: payload.protocol,
                                revision: 1,
                                lastOpId: payload.lastOpId,
                                updatedAt: payload.updatedAt,
                                updatedBy: payload.updatedBy || null
                            });
                    })));
        },
        // The authoritative document, read outside any transaction. What the client calls
        // straight after a bootstrap: the write it is about to replay has to be judged
        // against the document as it IS, not against a snapshot that may not have arrived.
        read() {
            return getDoc(scheduleRef).then(snapshot =>
                (snapshot.exists() ? JSON.parse(JSON.stringify(snapshot.data())) : null));
        },
        update(patch) {
            return withReceipt(patch, transaction => {
                transaction.update(scheduleRef, ...patchToUpdateArgs(patch));
            });
        },
        save(data) {
            return withReceipt(data, transaction => {
                transaction.set(scheduleRef, data);
            });
        },
        // The first write of a new project. A transaction rather than a plain set: two
        // phones opened the same evening are both told the document is missing and both
        // try to create it, and a set would let the second silently overwrite the first.
        // Inside the transaction the read and the write are one operation, so exactly one
        // wins and the other is handed 'already-exists' - which the sync layer turns back
        // into an ordinary field merge.
        create(data) {
            return runTransaction(db, transaction =>
                transaction.get(scheduleRef).then(snapshot => {
                    if (snapshot.exists()) {
                        const error = new Error('the schedule already exists');
                        error.code = 'already-exists';
                        throw error;
                    }
                    transaction.set(scheduleRef, data);
                    transaction.set(receiptRef(data.lastOpId), {
                        revision: data.revision,
                        opFingerprint: data.opFingerprint || null,
                        at: new Date().toISOString(),
                        by: data.updatedBy || null
                    });
                }));
        }
    };
}

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

        // The receipts live under the schedule document, which is what firestore.rules
        // matches on: schedules/{docId}/receipts/{opId}. Built from the same configured
        // path as the document itself, so a project that renames it keeps them together.
        const receiptRef = opId =>
            doc(db, ...SCHEDULE_DOC_PATH.split('/'), 'receipts', String(opId));

        const ops = firestoreOps(db, scheduleRef, receiptRef);

        window.FarkadSync.connect({
            // Firestore merges dotted field paths server-side, so two people writing
            // days.2026-08-12.plan.w_01 and ...plan.w_07 both land. This is what lets the
            // three of them build the evening roster at the same time.
            // Every write is a transaction now, and it writes TWO documents: the
            // schedule and the immutable receipt for the operation it carries. See
            // docs/sync-protocol.md and firestore.rules, which refuse either one without
            // the other - getAfter() is what makes them land together.
            //
            // The receipt is read first. If it is already there, this operation has
            // already been applied and the answer is success without touching anything:
            // that is what makes retrying a request which may still have landed safe,
            // rather than a way to record the same edit twice.
            //
            // A base that has moved comes back as `conflict`, carrying the revision the
            // document is actually at, so the sync layer can rebuild the same operation
            // against it. Firestore's own error for the rules refusing a write is
            // 'permission-denied', which cannot be told apart from "you are not on the
            // allowlist" - so the check is made here, in the transaction, where the real
            // revision is in hand.
            update: ops.update,
            save: ops.save,

            create: ops.create,

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
