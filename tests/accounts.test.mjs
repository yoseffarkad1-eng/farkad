// The pay book's screens (v176, shipped shut): every word pinned, every refusal code a
// sentence, and - with the gate shut - nothing of the feature reachable.
//
//   node tests/accounts.test.mjs
//
// js/ui/accounts.js is the first file in this app whose every function sits behind a gate
// that is FALSE in what a person installs. So the questions here are the ones a browser
// suite cannot answer by looking: that the words are exactly the words (law 6 - the
// owner's own labels verbatim, every other string proposed and pinned so that changing one
// is deliberate), that no refusal the model can give is shown as nothing, that the file
// computes no money and writes by one door, and that the three screens it can replace are
// built by the same code as on main when the gate answers false. What the screens DO with
// the gate open is tests/accounts.browser.mjs, in a real Chromium on a played cloud.
//
// THE TABLES BELOW ARE THE PIN. They are a second copy on purpose: a test that read the
// strings out of the file and compared them with themselves would pin nothing.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeDevice, sourceRoot, loadOrder } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = sourceRoot();

const WANT_OWNER = {
    closeOne: 'סגירת חשבון ואיפוס',
    wageDue: 'יתרת שכר לתשלום',
    groupAll: 'סגירת חשבונות עובדים',
    groupBiweekly: 'סגירת חשבון דו-שבועי',
    history: 'היסטוריית סגירות חשבון',
    closure: 'סגירת חשבון',
    payment: 'תשלום בפועל',
    weekly: 'עובד שבועי',
    biweekly: 'עובד דו-שבועי',
    partial: 'שולם חלקית'
};

const WANT_TEXT = {
    title: 'חשבונות עובדים',
    back: 'חזרה',
    backToList: 'חזרה לרשימה',
    understood: 'הבנתי',
    filterAll: 'הכול',
    filterWeekly: 'שבועי',
    filterBiweekly: 'דו־שבועי',
    search: 'חיפוש עובד',
    notFound: 'לא נמצא עובד.',
    advances: 'מקדמות',
    debt: 'חוב מקדמות',
    statusReview: 'לבדיקה',
    statusNone: 'אין חשבון פתוח',
    statusUnknown: 'לא ידוע אם שולם',
    inactiveMark: 'כבוי',
    unpriced: 'חסר תעריף - אי אפשר לחשב שכר',
    workDays: 'ימי עבודה',
    regularDays: 'ימים רגילים',
    doubleDays: 'ימים כפולים',
    extraHours: 'שעות נוספות',
    absentDays: 'ימי היעדרות',
    dayList: 'פירוט הימים',
    absent: 'נעדר',
    gross: 'שכר התקופה',
    wageDueBefore: 'מסגירות קודמות. לא נכלל בסגירה הזאת.',
    advancesTitle: 'מקדמות לקיזוז',
    advanceGiven: 'ניתנה',
    advanceLeft: 'נשאר',
    advanceField: 'כמה לקזז מהמקדמה הזאת?',
    all: 'הכול',
    zero: '0',
    leftAfter: 'יישאר אחרי הסגירה',
    noAdvances: 'אין מקדמות פתוחות לעובד הזה.',
    laterAdvance: 'מקדמה מאוחרת - תקוזז מהתקופה הבאה',
    extrasTitle: 'ניכויים נוספים',
    addExtra: '+ ניכוי נוסף',
    extraAmount: 'סכום הניכוי',
    extraCategory: 'סוג הניכוי',
    extraReason: 'סיבת הניכוי',
    removeExtra: 'הסר ניכוי',
    categoryAgreed: 'ניכוי מוסכם',
    categorySettlement: 'הסדר',
    categoryOther: 'אחר',
    advanceDeducted: 'קיזוז מקדמות',
    netDue: 'נטו לתשלום',
    paidTitle: 'שולם בפועל',
    paidFull: 'שולם הכול',
    paidNone: 'עוד לא שולם',
    paidAmount: 'כמה שולם?',
    methodTitle: 'איך שולם?',
    methodCash: 'מזומן',
    methodTransfer: 'העברה',
    balanceAfter: 'יתרה אחרי הסגירה',
    debtAfter: 'חוב מקדמות אחרי הסגירה',
    confirm: 'אישור סגירה',
    busy: 'רושם בשרת…',
    closedDone: 'החשבון נסגר ונרשם.',
    fixFirst: 'יש שדה שצריך לתקן. הוא מסומן למעלה.',
    carryButton: 'אשר את המעבר',
    carryDone: 'המעבר אושר. אפשר להמשיך.',
    carryFailed: 'האישור לא נשמר. נסה שוב.',
    freshClosed: 'כך נסגר החשבון:',
    offline: 'אין חיבור לשרת. סגירת חשבון ותשלום נרשמים רק כשיש חיבור. לא נרשם דבר.',
    unsentWork: 'יש במכשיר הזה רישומים שעוד לא נשלחו לשרת. חכה שיישלחו ונסה שוב. לא נרשם דבר.',
    busyElsewhere: 'פעולה אחרת עדיין נרשמת. חכה רגע.',
    pending: 'פעולה קודמת עדיין לא אושרה מהשרת. אי אפשר לרשום עוד עד שיתברר מה קרה איתה.',
    restoring: 'שחזור נתונים עוד לא הסתיים. נסה שוב אחריו. לא נרשם דבר.',
    unsupported: 'הגרסה במכשיר הזה לא יכולה לרשום סגירת חשבון. עדכן את האפליקציה.',
    nothingToWrite: 'אין מה לרשום. בדוק את הסכומים.',
    storage: 'אין מקום לשמור במכשיר. לא נרשם דבר.',
    server: 'השרת לא קיבל את הרישום. לא נרשם דבר. נסה שוב.',
    stale: 'החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב.',
    staleClosed: 'החשבון כבר נסגר בטלפון אחר. לא נרשם דבר נוסף.',
    unknown: 'הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב - הבדיקה תיעשה מעצמה כשיהיה חיבור.',
    outcomeCommitted: 'הרישום שהיה בבדיקה התקבל בשרת.',
    outcomeNothing: 'הרישום שהיה בבדיקה לא התקבל. לא נרשם דבר - אפשר לרשום שוב.',
    payFor: 'עבור התקופה',
    payOwed: 'נשאר לתשלום',
    payAmount: 'סכום התשלום',
    payDate: 'תאריך התשלום',
    paySave: 'רשום תשלום',
    payDone: 'התשלום נרשם.',
    payAlready: 'כבר נרשם',
    payNothing: 'אין יתרת שכר לתשלום לעובד הזה.',
    groupStart: 'התחל',
    groupResume: 'המשך',
    groupOf: 'מתוך',
    groupLeft: 'נשארו',
    skip: 'דלג',
    skipped: 'דולג',
    notClosed: 'לא נסגר',
    notEnded: 'התקופה מסתיימת ב־',
    prepare: 'הכן סגירה לנבחרים',
    select: 'בחירה',
    needSelection: 'בחר עובדים קודם: סמן את התיבה ליד כל עובד.',
    groupEmpty: 'אין חשבונות שממתינים לסגירה.',
    groupAllDone: 'כל החשבונות שאפשר לסגור נסגרו.',
    summaryTitle: 'סיכום לפני אישור',
    colWage: 'שכר',
    colAdvances: 'מקדמות',
    colNet: 'נטו',
    colPaid: 'שולם',
    total: 'סה״כ',
    batchUnpaid: 'התשלום לא נרשם: כל החשבונות ייסגרו כ״עוד לא שולם״. אפשר לרשום תשלום אחר כך.',
    batchPaid: 'כל החשבונות יירשמו כ״שולם הכול״ במזומן.',
    batchConfirm: 'אישור סגירה לכל הרשימה',
    batchRunning: 'סוגר',
    batchNone: 'אין ברשימה חשבון שאפשר לסגור.',
    retry: 'נסה שוב לנכשלים',
    openRow: 'פתח ועדכן',
    historySearch: 'חיפוש לפי שם',
    statusAll: 'כל המצבים',
    statusFilter: 'מצב התשלום',
    dateFilters: 'סינון לפי תאריכים',
    closedFrom: 'נסגר מתאריך',
    closedTo: 'נסגר עד תאריך',
    periodFrom: 'תקופת עבודה מתאריך',
    periodTo: 'תקופת עבודה עד תאריך',
    historyEmpty: 'לא נמצאו סגירות.',
    closedOn: 'נסגר ב־',
    deducted: 'קוזז',
    leftThen: 'נשאר במקדמה אחרי הסגירה',
    leftNow: 'נשאר היום',
    payments: 'תשלומים',
    noPayments: 'לא נרשם תשלום.',
    corrections: 'תיקונים',
    voided: 'בוטל',
    voidAction: 'ביטול רישום',
    voidReason: 'סיבת הביטול',
    adjustAction: 'תיקון לסגירה',
    adjustAdd: 'להוסיף לעובד',
    adjustSub: 'להפחית',
    adjustAmount: 'סכום התיקון',
    adjustReason: 'סיבת התיקון',
    correctionLead: 'תיקון הוא רישום חדש שנשאר ליד המקורי. שום דבר לא נמחק.',
    saveCorrection: 'רשום תיקון',
    correctionDone: 'התיקון נרשם.',
    detailAbsent: 'הפירוט המלא של הסגירה הזאת עדיין לא במכשיר הזה. הסכומים נכונים; הפירוט יופיע כשיהיה חיבור.',
    owed: 'מגיע לעובד',
    paidSoFar: 'שולם עד היום',
    legacyUnknown: 'נסגר לפני שנרשמו תשלומים - לא ידוע אם שולם',
    openingLead: 'מהיום שתבחר, כל סגירת חשבון ותשלום נרשמים כאן. מה שנסגר לפני כן לא משתנה.',
    openingDay: 'יום תחילת המעקב',
    openingConfirm: 'התחל מעקב',
    openingDone: 'המעקב התחיל.',
    legacyEntry: 'סגירות ישנות לבדיקה',
    legacyTitle: 'סגירות ישנות - האם שולם?',
    legacyLead: 'סגירות שנעשו לפני שנרשמו תשלומים. ענה מתי שנוח - זה לא עוצר שום דבר.',
    legacyPaid: 'שולם',
    legacyDue: 'נשאר חוב',
    legacyLeave: 'לא ידוע',
    legacyDueAmount: 'כמה נשאר לשלם?',
    legacySave: 'רשום',
    legacyDone: 'התשובה נרשמה.',
    legacyEmpty: 'אין סגירות ישנות לבדיקה.',
    draftRestored: 'מה שהוקלד לפני שהעמוד נטען מחדש שוחזר. בדוק את הסכומים לפני האישור.',
    draftContinue: 'המשך סגירה שהתחלת',
    lookAction: 'מה לבדוק?',
    lookLead: 'הסכומים שבמסכים הם אלה שהשרת מחזיק. שום דבר לא נמחק. עד שזה ייפתר אי אפשר לרשום לעובד הזה סגירה או תשלום.',
    lookConflict: 'שני טלפונים רשמו את אותו רישום בסכומים שונים',
    lookCounted: 'נספר - מה שהשרת מחזיק',
    lookBeside: 'נשמר בצד, לא נספר',
    lookHeld: 'רישום שלא נספר',
    lookOverpaid: 'שולם יותר מהמגיע',
    lookOverpaidAdvance: 'הוחזר או קוזז יותר ממה שניתן במקדמה',
    lookNoFix: 'עדיין אין פתרון מהמסך הזה. הראה את המסך הזה למי שמתחזק את האפליקציה.',
    lookNothing: 'אין מה לבדוק לעובד הזה.',
    lookAmount: 'סכום',
    lookDate: 'תאריך',
    lookBy: 'נרשם במכשיר',
    kindPayment: 'תשלום',
    kindDeduction: 'ניכוי נוסף',
    kindLegacy: 'תשובה על סגירה ישנה',
    archiveEntry: 'ארכיון סגירות',
    archiveLead: 'סגירה ששולמה במלואה עוברת מהרישום החי לארכיון בשרת, כדי שהרישום לא יתמלא. שום דבר לא נמחק: הסגירה נשארת במכשיר הזה ובהיסטוריה בדיוק כמו שהיא.',
    archiveReady: 'מוכנות להעברה',
    archiveHeld: 'נשארות ברישום',
    archiveDone: 'כבר בארכיון',
    archiveSizeNow: 'גודל הרישום בשרת',
    archiveSizeAfter: 'אחרי ההעברה',
    archiveRun: 'העבר לארכיון',
    archiveRunning: 'מעביר…',
    archiveNone: 'אין סגירות שמוכנות להעברה.',
    archiveMoved: 'הועברו לארכיון',
    archiveStopped: 'ההעברה נעצרה. מה שכבר הועבר נמצא בארכיון, ושום דבר לא אבד. אפשר לנסות שוב.',
    archiveOffline: 'אין חיבור לשרת. ההעברה נעשית רק כשיש חיבור. שום דבר לא השתנה.',
    archiveDiffers: 'הסגירה בשרת אינה זהה למה שבמכשיר הזה. היא נשארת ברישום.',
    archiveCopyDiffers: 'העותק שבארכיון אינו זהה לסגירה. היא נשארת ברישום.',
    archiveServer: 'השרת לא קיבל את ההעברה. שום דבר לא השתנה. נסה שוב.',
    archiveBusy: 'הרישום בשרת השתנה כמה פעמים בזמן ההעברה. נסה שוב בעוד רגע.',
    whyOwed: 'עוד לא שולם במלואו',
    whyCorrected: 'יש תיקון למקדמה שקוזזה בסגירה הזאת',
    whyIrregular: 'רישום ישן שאי אפשר להעביר',
    closedWaiting: 'במכשיר הזה חסר הפירוט של סגירות שכבר בארכיון. עד שהוא יירד מהשרת המכשיר לא מתעדכן, ואי אפשר לרשום ממנו סגירה או תשלום. זה קורה מעצמו כשיש חיבור.',
    closedBroken: 'סגירה שבארכיון בשרת אינה שלמה. המכשיר הזה לא מתעדכן עד שזה ייבדק. הראה את המסך הזה למי שמתחזק את האפליקציה.'
};

const WANT_REFUSALS = {
    worker: 'העובד לא נמצא ברשימה.',
    stamp: 'השעון או זיהוי המכשיר חסרים. פתח את האפליקציה מחדש.',
    gate: 'רישום סגירות חשבון לא פעיל במכשיר הזה.',
    'carry-approval-needed': 'כדי לקזז רק חלק ממקדמה צריך לאשר פעם אחת שיתרת מקדמה עוברת לחשבון הבא.',
    permission: 'למשתמש הזה אין הרשאה לסגור חשבונות.',
    inactive: 'עוד לא נקבע יום תחילת המעקב. קבע אותו בעמוד החשבונות.',
    'before-tracking': 'התקופה הזאת לפני יום תחילת המעקב.',
    period: 'התקופה אינה תקופת התשלום של העובד הזה.',
    closed: 'החשבון כבר נסגר.',
    overlap: 'התקופה חופפת לתקופה שכבר נסגרה לעובד הזה.',
    statement: 'החשבון כבר נסגר.',
    conflict: 'שני טלפונים רשמו סכומים שונים לעובד הזה. צריך לבדוק לפני שממשיכים.',
    early: 'אי אפשר לסגור לפני היום האחרון של התקופה.',
    unpriced: 'יש יום עבודה בלי תעריף. קבע תעריף לעובד ואז סגור.',
    overpaid: 'יש עודף בהחזרי המקדמות של העובד הזה. תקן קודם, ואז סגור.',
    allocation: 'הסכום אינו תקין. הכנס מספר, גם 0 אפשרי.',
    'allocation-missing': 'לא נבחר סכום למקדמה הזאת. הכנס סכום, גם 0 אפשרי.',
    'over-advance': 'אי אפשר לקזז יותר ממה שנשאר במקדמה.',
    'over-wage': 'הניכויים גבוהים מהשכר של התקופה.',
    deduction: 'אי אפשר לקזז את הסכום הזה מהתקופה הזאת.',
    clock: 'השעון של הטלפון הזה מפגר אחרי תנועה שכבר רשומה בחשבון. תקן את השעון ונסה שוב.',
    extra: 'בניכוי נוסף חסר סכום או סיבה.',
    paid: 'סכום התשלום אינו תקין.',
    overpay: 'אי אפשר לרשום תשלום גבוה מהסכום לתשלום.',
    unpaid: 'צריך לרשום תשלום כדי לסגור.',
    note: 'ההערה ארוכה מדי.',
    'unsafe-id': 'מזהה העובד אינו תקין. אי אפשר לרשום לו סגירה.',
    rejected: 'הרישום לא עבר בדיקה פנימית. לא נרשם דבר.',
    target: 'הרישום לא נמצא, או שכבר אין בו יתרה.',
    'payment-id': 'הטופס נפתח לא נכון. סגור ופתח אותו שוב.',
    amount: 'הכנס סכום גדול מ־0.',
    date: 'התאריך אינו תקין, או שעוד לא הגיע.',
    method: 'בחר מזומן או העברה.',
    reason: 'חובה לכתוב סיבה.',
    'over-target': 'אי אפשר לבטל יותר מהסכום שנרשם.',
    voided: 'הרישום הזה כבר בוטל.',
    delta: 'הכנס סכום גדול מ־0.',
    'below-zero': 'התיקון יוריד את הסכום מתחת למה שכבר שולם.',
    opened: 'יום תחילת המעקב כבר נקבע.',
    state: 'בחר תשובה.',
    due: 'הסכום אינו תקין, או גבוה מהנטו של אותה סגירה.',
    answered: 'כבר נרשמה תשובה לסגירה הזאת.',
    cycle: 'העובד אינו במחזור הזה.',
    twice: 'העובד נבחר פעמיים.',
    stale: 'החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב.',
    done: 'כבר נרשם',
    'server-first': 'רישום כזה נעשה רק מול השרת.'
};

const WANT_SERVER = {
    offline: 'offline',
    'unsent-work': 'unsentWork',
    busy: 'busyElsewhere',
    pending: 'pending',
    restoring: 'restoring',
    waiting: 'closedWaiting',
    unsupported: 'unsupported',
    plan: 'nothingToWrite',
    storage: 'storage',
    server: 'server',
    queued: 'unknown',
    unverified: 'unknown',
    unadopted: 'unknown',
    unconfirmed: 'unknown'
};


// =====================================================================================
const UI = readFileSync(join(ROOT, 'js/ui/accounts.js'), 'utf8');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const PAYROLL = readFileSync(join(ROOT, 'js/model/payroll.js'), 'utf8');
const TRANSACT = readFileSync(join(ROOT, 'js/sync/transact.js'), 'utf8');
const SCHEMA = readFileSync(join(ROOT, 'js/model/schema.js'), 'utf8');
const PAGE = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SW = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const DESIGN = readFileSync(join(ROOT, 'css/design.css'), 'utf8');
const DOC = readFileSync(join(ROOT, 'docs/payroll-closure.md'), 'utf8');
const git = args => execFileSync('git', ['-C', ROOT].concat(args), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// The file, loaded the way the page loads it: a classic script on one global scope. The
// stubs are the handful of globals its functions reach for in the checks below.
function load(globals) {
    const box = vm.createContext(Object.assign({ console }, globals || {}));
    vm.runInContext(UI + '\n;globalThis.__acc = { ACC_OWNER, ACC_TEXT, ACC_REFUSALS, ACC_SERVER, ACC, accParse, '
        + 'accRank, accRefusalText, accServerText, accountsOpen, accountsTakesTab, accountsRoutesClosure, '
        + 'accountsClosureDoor, accTargetPeriod };', box);
    return box.__acc;
}
const plain = value => JSON.parse(JSON.stringify(value));

{
    suite('every word of the screens, pinned');
    const acc = load();
    same('the owner\'s own labels, VERBATIM', plain(acc.ACC_OWNER), WANT_OWNER);
    same('every proposed string, word for word', plain(acc.ACC_TEXT), WANT_TEXT);
    same('every refusal sentence, word for word', plain(acc.ACC_REFUSALS), WANT_REFUSALS);
    same('the server\'s refusals, each mapped to its sentence', plain(acc.ACC_SERVER), WANT_SERVER);
    check('the four tables are frozen', [acc.ACC_OWNER, acc.ACC_TEXT, acc.ACC_REFUSALS, acc.ACC_SERVER].every(Object.isFrozen));
    same('the five status labels are the model\'s, and they are his words',
        plain(vm.runInContext(PAYROLL.slice(PAYROLL.indexOf('const PAYBOOK_STATUS_LABELS'),
            PAYROLL.indexOf('});', PAYROLL.indexOf('const PAYBOOK_STATUS_LABELS')) + 3) + ';PAYBOOK_STATUS_LABELS', vm.createContext({}))),
        { waiting: 'ממתין לסגירה', closed: 'נסגר', paid: 'שולם', partial: 'שולם חלקית', open: 'יתרה פתוחה' });
    same('his labels, exactly as he wrote them', [WANT_OWNER.closeOne, WANT_OWNER.wageDue, WANT_OWNER.groupAll, WANT_OWNER.groupBiweekly,
        WANT_OWNER.history, WANT_OWNER.closure, WANT_OWNER.payment, WANT_OWNER.weekly, WANT_OWNER.biweekly],
        ['סגירת חשבון ואיפוס', 'יתרת שכר לתשלום', 'סגירת חשבונות עובדים', 'סגירת חשבון דו-שבועי', 'היסטוריית סגירות חשבון',
            'סגירת חשבון', 'תשלום בפועל', 'עובד שבועי', 'עובד דו-שבועי']);

    // ALL THE WORDS ARE IN THE ONE BLOCK. A Hebrew literal anywhere below the tables is
    // a string nobody pinned. (Comments are not code.)
    const body = UI.slice(UI.indexOf('// ---------------------------------------------------------------- the one state'))
        .split('\n').filter(line => !/^\s*\/\//.test(line)).map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    const stray = body.match(/[֐-׿]+/g) || [];
    same('no Hebrew is written outside the block at the top of the file', stray, []);

    const listed = Object.values(WANT_OWNER).concat(Object.values(WANT_TEXT), Object.values(WANT_REFUSALS));
    same('docs/payroll-closure.md lists every one of them', listed.filter(text => !DOC.includes(text)), []);
}

{
    suite('every refusal code has a sentence');
    const acc = load();
    // Read out of the model, not listed by hand: a code added to a planner tomorrow is a
    // failure here until it has a sentence.
    const codes = new Set();
    for (const match of PAYROLL.matchAll(/paybookAddReason\(reasons, '([a-z-]+)'\)/g)) codes.add(match[1]);
    for (const match of PAYROLL.matchAll(/reasons: \['([a-z-]+)'\]/g)) codes.add(match[1]);
    for (const match of PAYROLL.matchAll(/refuse\(\['([a-z-]+)'\]\)/g)) codes.add(match[1]);
    for (const match of PAYROLL.matchAll(/return \{ ok: false, reasons: \['([a-z-]+)'\]/g)) codes.add(match[1]);
    ['stamp', 'cycle', 'twice', 'stale', 'done', 'unpaid'].forEach(code => codes.add(code));
    // paybookOperation's three are about the PLAN handed to the door, and the door answers
    // them itself as `plan` - below.
    ['plan', 'paths', 'no-entry'].forEach(code => codes.delete(code));
    check('the model was read: its vocabulary is here', ['allocation-missing', 'over-advance', 'over-wage', 'early', 'overpay',
        'carry-approval-needed', 'below-zero', 'voided', 'answered', 'opened', 'payment-id', 'over-target'].every(code => codes.has(code)),
        [...codes].join(' '));
    same('no code of the model is without a sentence', [...codes].filter(code => !Object.prototype.hasOwnProperty.call(WANT_REFUSALS, code)
        || WANT_REFUSALS[code].trim() === ''), []);
    same('a code nobody mapped is still said, with its name, never as nothing',
        acc.accRefusalText.toString().includes('ACC_REFUSALS.rejected'), true);

    const door = new Set();
    for (const match of TRANSACT.matchAll(/return '([a-z-]+)';/g)) door.add(match[1]);
    for (const match of TRANSACT.matchAll(/reasons: \['([a-z-]+)'\]/g)) door.add(match[1]);
    for (const match of TRANSACT.matchAll(/refused\('refused', \['([a-z-]+)'\]\)/g)) door.add(match[1]);
    // `stale` is the model's word, above; the last four are resolvePayIntent's OUTCOMES,
    // which the banner words separately (outcomeCommitted / outcomeNothing / unknown).
    ['stale', 'unknown', 'nothing', 'committed', 'none'].forEach(code => door.delete(code));
    check('the door was read: its words are here', ['offline', 'unsent-work', 'busy', 'pending', 'restoring', 'unsupported',
        'plan', 'storage', 'server', 'unverified', 'unadopted', 'unconfirmed', 'queued'].every(code => door.has(code)), [...door].join(' '));
    same('no word of the server-first door is without a sentence',
        [...door].filter(code => !WANT_TEXT[WANT_SERVER[code]]), []);
    same('offline and unsent work say that nothing was written',
        [WANT_TEXT[WANT_SERVER.offline].endsWith('לא נרשם דבר.'), WANT_TEXT[WANT_SERVER['unsent-work']].endsWith('לא נרשם דבר.')], [true, true]);
    same('"in doubt" says not to repeat', WANT_TEXT.unknown.includes('אל תרשום שוב'), true);
    const used = UI.slice(UI.indexOf('const ACC_SERVER'));
    same('no string in the block is dead: every one is shown by something',
        Object.keys(WANT_TEXT).filter(key => !used.includes(`ACC_TEXT.${key}`) && !used.includes(`'${key}'`)), []);
}

{
    suite('with the gate shut nothing of the feature is reachable');
    const start = SCHEMA.indexOf('const FARKAD_SHIPPED_FLAGS');
    const shipped = SCHEMA.slice(start, SCHEMA.indexOf('};', start));
    check('the shipped flag is false', /\n\s*paybook: false,/.test(shipped) && !/paybook: true/.test(shipped));

    // THE FIVE HOOKS (four at Phase 4, one more at Phase 5), and nothing else, are what js/ui/reports.js gained. Taken out, the
    // file is byte for byte main's at v174 - so with the hooks answering false, the
    // «מקדמות» tab, «קיזוז מהשכר» and the old closure dialog are built by the same code.
    const HOOKS = [
        `    // v176, SHUT: with the pay book's gate open this tab is the accounts home
    // (js/ui/accounts.js). With it shut - every build a person has - this line is false
    // and everything below is what it was.
    if (typeof accountsTakesTab === 'function' && accountsTakesTab()) { renderAccounts(root); return; }
`,
        `            // v176, SHUT: one way to close an account once the pay book is open.
            if (typeof accountsRoutesClosure === 'function' && accountsRoutesClosure(worker.id, null)) return;
`,
        `    // v176, SHUT: with the pay book open the old dialog is not a second way to close.
    if (typeof accountsRoutesClosure === 'function' && accountsRoutesClosure(worker.id,
        { from: REPORT_RANGE.from, to: REPORT_RANGE.to })) return;
`,
        `    // v176, SHUT: with the pay book open this block is one button to the review page.
    if (typeof accountsClosureDoor === 'function' && accountsOpen()) return accountsClosureDoor(worker);
`,
        // PHASE 5, the fifth: the owner's answer of 2026-11-10 - a closed week of the old
        // «לפי עובד» report is marked «נסגר». One line after the weeks are drawn.
        `        // v176 (Phase 5), SHUT: with the pay book open a closed week is marked «נסגר».
        if (typeof accountsMarkClosedWeeks === 'function' && accountsOpen()) accountsMarkClosedWeeks(fold, item.row.workerId, item.weeks);
`
    ];
    let without = REPORTS;
    HOOKS.forEach(hook => {
        given('a hook is in js/ui/reports.js exactly once', without.split(hook).length === 2, hook.slice(0, 60));
        without = without.replace(hook, '');
    });
    same('js/ui/reports.js without its five hooks is main\'s file at 893def8 (v174), byte for byte',
        without === git(['show', '893def8:js/ui/reports.js']), true);
    check('every hook asks the gate before it does anything', HOOKS.every(hook =>
        /accountsTakesTab\(\)|accountsRoutesClosure\(|accountsOpen\(\)/.test(hook) && /typeof \w+ === 'function'/.test(hook)));

    const shut = load({ paybookWritesEnabled: () => false, ADVANCE_WORKER: null, ADVANCE_ORDER_DRAFT: null,
        State: { worker: () => ({ id: 'w_01' }) } });
    same('shut: the tab is not taken, the closure is not routed, the door is not offered',
        [shut.accountsOpen(), shut.accountsTakesTab(), shut.accountsRoutesClosure('w_01', null), shut.accountsClosureDoor({ id: 'w_01' })],
        [false, false, false, null]);
    const none = load({ ADVANCE_WORKER: null, ADVANCE_ORDER_DRAFT: null });
    same('and a build that does not have the model at all answers the same', [none.accountsOpen(), none.accountsTakesTab()], [false, false]);
    const open = load({ paybookWritesEnabled: () => true, ADVANCE_WORKER: null, ADVANCE_ORDER_DRAFT: null });
    same('open (the test seam): the tab is taken', [open.accountsOpen(), open.accountsTakesTab()], [true, true]);
    const busy = load({ paybookWritesEnabled: () => true, ADVANCE_WORKER: 'w_01', ADVANCE_ORDER_DRAFT: null });
    same('but one man\'s advances page stays the existing one', busy.accountsTakesTab(), false);

    // The gate on a real device, built as shipped and built through the seam.
    const asShipped = makeDevice({ deviceId: 'd_acc1' });
    const opened = makeDevice({ deviceId: 'd_acc2', flags: { paybook: true } });
    same('a device built as shipped does not write the pay book; one built through the seam does',
        [asShipped.call('paybookWritesEnabled'), opened.call('paybookWritesEnabled')], [false, true]);

    // NO OTHER ENTRY. Nothing but reports.js's hooks names a function of this file, the
    // page has no element or handler for it, and the tab bar is main's.
    const others = loadOrder().concat(['js/app.js', 'js/ui/day.js', 'js/ui/settings.js', 'js/ui/share.js', 'js/ui/roster.js',
        'js/ui/week.js', 'js/ui/backup.js', 'js/ui/sheet.js']).filter((file, at, list) => list.indexOf(file) === at)
        .filter(file => file !== 'js/ui/accounts.js' && file !== 'js/ui/reports.js');
    same('no other shipped script calls into the screens', others.filter(file =>
        /\b(renderAccounts|accountsTakesTab|accountsRoutesClosure|accountsClosureDoor|accGo|accOpen\w+)\b/
            .test(readFileSync(join(ROOT, file), 'utf8'))), []);
    const before = git(['show', '893def8:index.html']);
    const tabs = text => text.slice(text.indexOf('<nav class="tabs"'), text.indexOf('</nav>', text.indexOf('<nav class="tabs"')));
    same('the tab bar is main\'s, byte for byte: five tabs, the same label', tabs(PAGE) === tabs(before), true);
    const added = PAGE.split('\n').filter(lineText => !before.split('\n').includes(lineText));
    same('index.html gained the script tags of the phases and the stamp, and no element',
        added.filter(lineText => /<(div|button|section|nav|input|details|p|h\d)\b/.test(lineText)), []);
    check('the page loads the file after reports.js, whose helpers it uses',
        PAGE.indexOf('<script src="js/ui/accounts.js"></script>') > PAGE.indexOf('<script src="js/ui/reports.js"></script>')
        && PAGE.indexOf('<script src="js/ui/accounts.js"></script>') < PAGE.indexOf('<script src="js/app.js"></script>'));
    check('and it is in the service worker\'s shell', SW.includes("'./js/ui/accounts.js'"));
    check('it is a classic script: no import, no export', !/^\s*(import|export)\b/m.test(UI));
}

{
    suite('what the screens may and may not do');
    const code = UI.split('\n').filter(lineText => !/^\s*\/\//.test(lineText)).join('\n');
    same('no prompt, confirm or alert (law 11)', code.match(/\b(prompt|confirm|alert)\s*\(/g), null);
    same('no markup from strings: textContent only', code.match(/innerHTML|insertAdjacentHTML|outerHTML/g), null);
    same('a pay entry is written by ONE door', (code.match(/transactPaybook\(/g) || []).length, 2);
    same('never by the queue, the journal or a bare save', code.match(/commitPaybook|State\.commit\(|State\.save\(|\.persist\(|queueOperations/g), null);
    same('the one ordinary commit is the carry approval, by the ledger\'s own writer',
        [(code.match(/State\.commitMany\(/g) || []).length, (code.match(/recordCarryApproval\(/g) || []).length], [1, 1]);
    same('the old closure writer is not called from here', code.match(/closePeriodChanges|planPeriodClosure|recordPeriodClosed/g), null);
    // MOVED AT PHASE 5, deliberately. Phase 4 pinned «nothing is kept in storage»: what was
    // typed into a closure lived in memory and a reload lost it. The owner's list asks for
    // a draft that survives a reload, so there is now exactly ONE key, of this file's own,
    // read, written and removed in one place each - and still no closure in it: a draft is
    // typing, it is saved only after somebody has typed, and it is put back only against
    // the account it was typed against, on the day it was typed.
    same('ONE thing is kept in storage - the draft - under one key of its own, through Store',
        [code.match(/localStorage/g), (code.match(/Store\.\w+\([^)]*/g) || []).sort()],
        [null, ['Store.get(ACC_DRAFT_KEY', 'Store.remove(ACC_DRAFT_KEY', 'Store.set(ACC_DRAFT_KEY, JSON.stringify(draft']]);
    same('that key is the draft\'s and nothing else\'s', /const ACC_DRAFT_KEY = '(\w+)';/.exec(code)[1], 'farkadPayDraft');
    check('a draft is written only after somebody typed or tapped: opening a page writes nothing',
        /function accDraftSave\(form\) \{\n    if \(!form\.touched \|\| !form\.mark\) return;/.test(code));
    check('and is put back only for the same man, period, day and account - else it is removed',
        /held\.workerId !== form\.workerId \|\| held\.from !== form\.from \|\| held\.to !== form\.to\) return null;\n    if \(held\.day !== todayStr\(\) \|\| held\.mark !== accDraftMark\(review\)\) \{ accDraftClear\(\); return null; \}/.test(code));
    check('a closure that went through takes its draft with it', /accSend\(plan, form, \(\) => \{\n            accDraftClear\(\);/.test(code));
    // NO MONEY ARITHMETIC. The only minus sign applied to a figure flips the sign of one
    // the model already computed, for display; sums are the model's paybookSum.
    const arithmetic = code.split('\n').filter(lineText => /\b(gross|netDue|due|paid|amount|left|debt|wageDue|deducted)\b[^;\n]*[^=!<>-][+*/][^+=/*]/.test(lineText)
        && !/`|'/.test(lineText));
    same('no line adds, multiplies or divides a money field', arithmetic, []);
    check('the column totals are the model\'s sum', /paybookSum\(values\)/.test(code));
    check('the prefill is the model\'s suggestion', /paybookSuggestAllocations\(probe\.review\)/.test(code));
    same('no bar height and no hardcoded inset is written in the screens\' styles',
        (DESIGN.slice(DESIGN.indexOf('WORKER ACCOUNTS')).match(/--nav-h|--topbar-h|safe-area|position:\s*fixed|position:\s*sticky/g)), null);
    check('every rule for the screens is inside the screen-only layer', DESIGN.indexOf('@media screen {') < DESIGN.indexOf('.acc-screen')
        && DESIGN.trimEnd().endsWith('}') && !/\.acc-/.test(readFileSync(join(ROOT, 'css/app.css'), 'utf8'))
        && !/\.acc-/.test(readFileSync(join(ROOT, 'css/readability.css'), 'utf8')));
    check('names go into sentences through isolate()', (code.match(/isolate\((worker|row|first)\.name\)/g) || []).length >= 8
        && !/\$\{(worker|row|first)\.name\}/.test(code));
}

{
    suite('the pieces of the screens that are pure');
    const acc = load();
    same('an amount field: blank is blank, not zero', plain([acc.accParse(''), acc.accParse('  '), acc.accParse(null)]),
        [{ blank: true }, { blank: true }, { blank: true }]);
    same('a number is a number, to the agora, in any digits', plain([acc.accParse('300'), acc.accParse('0'), acc.accParse('12.5'),
        acc.accParse('12,50'), acc.accParse('١٢٠'), acc.accParse('۳۰')]),
        [{ value: 300 }, { value: 0 }, { value: 12.5 }, { value: 12.5 }, { value: 120 }, { value: 30 }]);
    same('and anything else is neither', plain([acc.accParse('abc'), acc.accParse('-5'), acc.accParse('1.234'), acc.accParse('5 ₪'),
        acc.accParse('1e3')]), [{ bad: true }, { bad: true }, { bad: true }, { bad: true }, { bad: true }]);

    // The order of the list - the one thing about it that is this file's own decision.
    const man = extra => Object.assign({ status: 'none', today: '2026-10-15', pending: [], wageDue: 0, debt: 0,
        current: { hasWork: false, closed: false, from: '2026-10-02', to: '2026-10-15' } }, extra);
    same('who comes first: review, a period that has ended, wage owed, a running period, a debt, settled, nothing',
        [man({ status: 'review' }), man({ status: 'waiting', pending: [{ from: '2026-09-18', to: '2026-10-01' }] }),
            man({ status: 'waiting', current: { hasWork: true, closed: false, from: '2026-10-02', to: '2026-10-15' } }),
            man({ status: 'partial', wageDue: 1000 }),
            man({ status: 'waiting', current: { hasWork: true, closed: false, from: '2026-10-09', to: '2026-10-22' } }),
            man({ status: 'open', debt: 500 }), man({ status: 'paid' }), man({})].map(acc.accRank),
        [0, 1, 1, 2, 3, 4, 5, 6]);
    same('the close button means the oldest period that is waiting',
        plain([acc.accTargetPeriod(man({ pending: [{ from: '2026-09-18', to: '2026-10-01' }, { from: '2026-10-02', to: '2026-10-08' }],
            current: { hasWork: true, closed: false, from: '2026-10-09', to: '2026-10-15' } })),
        acc.accTargetPeriod(man({ current: { hasWork: true, closed: false, from: '2026-10-09', to: '2026-10-15' } })),
        acc.accTargetPeriod(man({ current: { hasWork: true, closed: true, from: '2026-10-09', to: '2026-10-15' } }))]),
        [{ from: '2026-09-18', to: '2026-10-01' }, { from: '2026-10-09', to: '2026-10-15' }, null]);
}

{
    suite('the model\'s one new answer: the suggestion the review page pre-fills');
    const d = makeDevice({ deviceId: 'd_acc3', flags: { paybook: true } });
    const suggest = review => plain(d.call('paybookSuggestAllocations', review));
    const rows = (...list) => list.map(([advanceId, left, offered]) => ({ advanceId, left, offered: offered !== false }));
    same('all of each, when the wage allows',
        suggest({ gross: 4400, walkRoom: 1200, advances: rows(['a', 500], ['b', 400], ['c', 300]) }), { a: 500, b: 400, c: 300 });
    same('oldest first, and it stops at the wage - the rest is 0, never blank',
        suggest({ gross: 600, walkRoom: 600, advances: rows(['a', 500], ['b', 400], ['c', 300]) }), { a: 500, b: 100, c: 0 });
    same('one advance above the whole wage', suggest({ gross: 3600, walkRoom: 3600, advances: rows(['a', 5000]) }), { a: 3600 });
    same('never more than the account walk lets this closure take',
        suggest({ gross: 4400, walkRoom: 150, advances: rows(['a', 500], ['b', 400]) }), { a: 150, b: 0 });
    same('an unknown wage suggests nothing off anybody', suggest({ gross: null, walkRoom: 0, advances: rows(['a', 500]) }), { a: 0 });
    same('in agorot: 0.1 + 0.2 of room is 0.3, not a hair under',
        suggest({ gross: 0.3, walkRoom: 0.3, advances: rows(['a', 0.1], ['b', 0.2], ['c', 5]) }), { a: 0.1, b: 0.2, c: 0 });
    same('an advance that is not on offer is not answered for', suggest({ gross: 900, walkRoom: 900,
        advances: rows(['a', 500], ['later', 400, false]) }), { a: 500 });
    same('nothing to read is nothing suggested', [suggest(null), suggest({}), suggest({ advances: 'x' })], [{}, {}, {}]);
    const review = { gross: 600, walkRoom: 600, advances: rows(['a', 500], ['b', 400]) };
    const frozen = JSON.stringify(review);
    suggest(review);
    same('it does not touch what it is handed, and answers the same twice',
        [JSON.stringify(review) === frozen, JSON.stringify(suggest(review)) === JSON.stringify(suggest(review))], [true, true]);
    same('a poisoned id is not keyed on a prototype', Object.keys(suggest({ gross: 100, walkRoom: 100, advances: rows(['__proto__', 50]) })).length <= 1
        && ({}).polluted === undefined, true);
    check('the shipped build has the function and it writes nothing: no State, no Store, no clock in it',
        !/State\.|Store\.|Date\b/.test(PAYROLL.slice(PAYROLL.indexOf('function paybookSuggestAllocations'))));
}

report();
