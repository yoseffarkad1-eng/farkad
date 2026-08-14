// Fill these in from your own Firebase project - see docs/firebase-setup.md.
// While projectId and apiKey are empty the app runs local-only, exactly as before.
//
// These values are not secrets. A Firebase web config is public by design; what actually
// keeps other people out is the allowlist in firestore.rules, which is enforced on the
// server. Never rely on this file for security.

export const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

export const SCHEDULE_DOC_PATH = 'schedules/current';
