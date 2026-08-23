// Fill these in from your own Firebase project - see docs/firebase-setup.md.
// While projectId and apiKey are empty the app runs local-only, exactly as before.
//
// These values are not secrets. A Firebase web config is public by design; what actually
// keeps other people out is the allowlist in firestore.rules, which is enforced on the
// server. Never rely on this file for security.

// databaseURL and measurementId are in the console's snippet and deliberately NOT here:
// the first belongs to Realtime Database, which this app does not use, and the second to
// Analytics, which was switched off when the project was made. Carrying either would
// pull in a product nobody asked for.
export const firebaseConfig = {
    apiKey: "AIzaSyC1hOWJZucfqtS50hvNAxYbs0khN2gi0rQ",
    authDomain: "farkad-schedule.firebaseapp.com",
    projectId: "farkad-schedule",
    storageBucket: "farkad-schedule.firebasestorage.app",
    messagingSenderId: "1011153058443",
    appId: "1:1011153058443:web:a0043b31d724241817328e"
};

export const SCHEDULE_DOC_PATH = 'schedules/current';
