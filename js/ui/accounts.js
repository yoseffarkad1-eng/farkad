// ---------------------------------------------------------------- the pay book's screens
//
// Worker accounts: the one list, the review page, the payment, the group walk, the
// history. (v176 - PHASE 4, SHIPPED SHUT.)
//
// NOTHING IN THIS FILE RUNS WHILE THE GATE IS SHUT. `FARKAD_FLAGS.paybook` is false in
// everything a person installs; accountsOpen() is asked by the three hooks in
// js/ui/reports.js before any function here is reached, and with it false the «מקדמות»
// tab, the «קיזוז מהשכר» button and the old closure dialog are exactly what v174 has.
// tests/accounts.test.mjs holds the shipped source to that.
//
// WHAT THIS FILE OWNS: drawing what the model says, collecting what the person typed, and
// handing ONE plan to FarkadSync.transactPaybook.
//
// WHAT IT MUST NEVER DO:
//   - compute money. Every figure on these screens is a field of a plan or a fold from
//     js/model/payroll.js. A screen that subtracted the deductions from the wage itself
//     would be a second calculator, and the day the two disagree the screen is the one a
//     man is paid from. Even the column totals of the summary are the model's paybookSum.
//   - write a pay entry by any road but transactPaybook. No State.commit, no journal, no
//     queue: a closure that this phone believes and the server never heard of is the
//     failure Phase 3 was built to remove.
//   - say «נסגר» before the server did. `closed` and `done` are the only answers that
//     mean it; everything else is said as what it is, in a sentence.
//   - leave a tap that does nothing. A button that cannot do its job says why.
//   - use prompt/confirm/alert (law 11), write a bar height (law 8), or put a name into a
//     sentence without isolate().
//
// WHERE IT DRAWS: inside #advancesView, the «מקדמות» tab's own page - not a new fixed
// layer. The tab bar, the top strip, the keyboard and the stuck-frame rules are then the
// ones every other tab already has, and paper never sees it (the tab is not printed).

// ---------------------------------------------------------------- every word, one block
//
// THE OWNER'S OWN LABELS, VERBATIM. He wrote these; they are not to be improved.
// (The five status labels are his too and live in the model: PAYBOOK_STATUS_LABELS.)
const ACC_OWNER = Object.freeze({
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
});

// PROPOSED. Every string below is this file's suggestion and the owner's to correct;
// each is pinned word for word in tests/accounts.test.mjs and listed in
// docs/payroll-closure.md, so changing one is a deliberate act in three places.
const ACC_TEXT = Object.freeze({
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
    // the review page
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
    // the server's answers
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
    // the later payment
    payFor: 'עבור התקופה',
    payOwed: 'נשאר לתשלום',
    payAmount: 'סכום התשלום',
    payDate: 'תאריך התשלום',
    paySave: 'רשום תשלום',
    payDone: 'התשלום נרשם.',
    payAlready: 'כבר נרשם',
    payNothing: 'אין יתרת שכר לתשלום לעובד הזה.',
    // the group walk
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
    // the history
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
    // the first run
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
    // PHASE 5. What was typed into a closure, kept across a reload
    draftRestored: 'מה שהוקלד לפני שהעמוד נטען מחדש שוחזר. בדוק את הסכומים לפני האישור.',
    draftContinue: 'המשך סגירה שהתחלת',
    // what «לבדיקה» is about
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
    // closures leaving the live record for the archive on the server
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
    // a phone that lacks the detail of a closure in the archive
    closedWaiting: 'במכשיר הזה חסר הפירוט של סגירות שכבר בארכיון. עד שהוא יירד מהשרת המכשיר לא מתעדכן, ואי אפשר לרשום ממנו סגירה או תשלום. זה קורה מעצמו כשיש חיבור.',
    closedBroken: 'סגירה שבארכיון בשרת אינה שלמה. המכשיר הזה לא מתעדכן עד שזה ייבדק. הראה את המסך הזה למי שמתחזק את האפליקציה.'
});

// EVERY REFUSAL CODE THE MODEL CAN ANSWER WITH, as the sentence a person reads. The model
// answers in stable codes because the sentence is Hebrew and the owner's (law 6); this is
// where they meet. A code with no line here is a refusal shown as nothing, so
// tests/accounts.test.mjs reads the codes out of js/model/payroll.js and fails on any
// that is missing.
const ACC_REFUSALS = Object.freeze({
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
});

// The words FarkadSync.transactPaybook refuses with (payTransactRefusal and the rest),
// each as its sentence in ACC_TEXT.
const ACC_SERVER = Object.freeze({
    offline: 'offline',
    'unsent-work': 'unsentWork',
    busy: 'busyElsewhere',
    pending: 'pending',
    restoring: 'restoring',
    unsupported: 'unsupported',
    plan: 'nothingToWrite',
    storage: 'storage',
    server: 'server',
    queued: 'unknown',
    unverified: 'unknown',
    unadopted: 'unknown',
    unconfirmed: 'unknown'
});

// ---------------------------------------------------------------- the one state
//
// Which screen is up and what the person has typed into it. In memory only: a draft of a
// closure is not a closure, and one that survived a reload would be offered again a week
// later against a different account.
const ACC = {
    screen: 'list',
    filter: 'all',
    search: '',
    flash: '',
    node: null,
    live: null,
    review: null,
    pay: null,
    group: null,
    history: { text: '', cycle: 'all', status: '', closedFrom: '', closedTo: '', periodFrom: '', periodTo: '' },
    statement: null,
    correct: null,
    legacyLeft: {},
    closed: {},
    watch: null,
    look: null,
    archive: null
};

// ---------------------------------------------------------------- a draft, across a reload
//
// WHAT WAS TYPED INTO A CLOSURE AND NOT YET CONFIRMED, kept on this phone only (Phase 5).
// Phase 4 kept it in memory on purpose - "a draft of a closure is not a closure, and one
// that survived a reload would be offered again a week later against a different account"
// - and that reason stands. So the draft carries a MARK of the account it was typed
// against (the wage, each open advance and what is left on it, what he is already owed)
// and the day; it is put back only into a review of the same man, the same period, on
// the same day, whose account still reads exactly so. Anything else, and it is thrown
// away without a word: the page shows what it would have shown.
//
// It is one Store key of its own, written only after a person has typed or tapped
// (opening a page still writes nothing). It is never the record, never the outbox, never
// the cloud, never a backup and never the rescue file - a lost phone loses a draft.
// NOTHING IS A CLOSURE UNTIL THE SERVER SAYS SO; a draft is typing.
const ACC_DRAFT_KEY = 'farkadPayDraft';

function accDraftRead() {
    let held = null;
    try { held = JSON.parse(Store.get(ACC_DRAFT_KEY) || 'null'); } catch (error) { held = null; }
    const text = value => typeof value === 'string';
    if (!held || typeof held !== 'object' || held.v !== 1 || !text(held.workerId) || !text(held.from)
        || !text(held.to) || !text(held.day) || !text(held.mark) || !held.alloc || typeof held.alloc !== 'object'
        || !Array.isArray(held.extras) || ['full', 'partial', 'none'].indexOf(held.paidMode) === -1
        || !text(held.paidText) || ['cash', 'transfer'].indexOf(held.method) === -1) return null;
    if (!Object.keys(held.alloc).every(id => text(held.alloc[id]))) return null;
    if (!held.extras.every(extra => extra && text(extra.amount) && text(extra.reason)
        && ['agreed', 'settlement', 'other'].indexOf(extra.category) !== -1)) return null;
    return held;
}

function accDraftClear() {
    try { Store.remove(ACC_DRAFT_KEY); } catch (error) { /* a draft, not the record */ }
}

// The account a draft was typed against, as one short string. Read off the model's own
// review - nothing is computed here.
function accDraftMark(review) {
    return paybookHash(JSON.stringify([review.gross, review.wageDueBefore, review.counts,
        review.advances.map(row => [row.advanceId, row.left, row.offered])]));
}

function accDraftSave(form) {
    if (!form.touched || !form.mark) return;
    const draft = { v: 1, workerId: form.workerId, from: form.from, to: form.to, day: todayStr(), mark: form.mark,
        alloc: Object.assign({}, form.alloc), extras: form.extras.map(extra => ({ amount: String(extra.amount),
            category: extra.category, reason: String(extra.reason) })),
        paidMode: form.paidMode, paidText: String(form.paidText), method: form.method };
    try { Store.set(ACC_DRAFT_KEY, JSON.stringify(draft), { optional: true }); } catch (error) { /* a draft */ }
}

// The draft for THIS review, or null - and a draft for this very account that no longer
// fits it is removed here, so it cannot be offered again.
function accDraftFor(form, review) {
    const held = accDraftRead();
    if (!held || held.workerId !== form.workerId || held.from !== form.from || held.to !== form.to) return null;
    if (held.day !== todayStr() || held.mark !== accDraftMark(review)) { accDraftClear(); return null; }
    return held;
}

function accountsOpen() {
    return typeof paybookWritesEnabled === 'function' && paybookWritesEnabled() === true;
}

// Does the accounts home take the «מקדמות» tab right now? Not while one man's advances
// page or the old ordering page is up: both are the existing screens, unchanged, and are
// still how an advance is given or handed back.
function accountsTakesTab() {
    return accountsOpen() && !ADVANCE_WORKER && !ADVANCE_ORDER_DRAFT;
}

// THE OLD CLOSURE DIALOG'S DOOR (decision 29). With the gate open there is ONE way to
// close an account: the review page. The old dialog writes no statement and goes through
// the queue, so two ways to close would be two different records of the same act.
// Answers true when it took the request.
function accountsRoutesClosure(workerId, period) {
    if (!accountsOpen()) return false;
    const worker = State.worker(workerId);
    if (!worker) return false;
    if (typeof closeWorkerDays === 'function') closeWorkerDays();
    ADVANCE_WORKER = null;
    accOpenReview(String(worker.id), period && isPeriodFor(worker, period.from, period.to) ? period : null);
    return true;
}

// What renderPeriodClosure hands back instead of the old form: one button to the review.
function accountsClosureDoor(worker) {
    if (!accountsOpen() || !worker) return null;
    const box = el('div', 'period-closure');
    const range = (typeof REPORT_RANGE !== 'undefined' && REPORT_RANGE.from && REPORT_RANGE.to)
        ? { from: REPORT_RANGE.from, to: REPORT_RANGE.to } : null;
    box.appendChild(button(ACC_OWNER.closeOne, 'btn-secondary',
        () => accountsRoutesClosure(worker.id, range)));
    return box;
}

// ---------------------------------------------------------------- small things
function accStamp() {
    return { at: new Date().toISOString(), by: String(syncDeviceId()), today: todayStr() };
}

// Money the way js/ui/reports.js prints it everywhere else: moneyText, a space, the sign.
function accMoney(value) {
    return `${Number(value) < 0 ? minusAmount(Math.abs(Number(value))) : moneyText(value)} ₪`;
}

function accDay(date) {
    const parsed = parseLocalDate(String(date || ''));
    return parsed ? formatFullDate(parsed) : String(date || '');
}

function accShort(date) {
    const text = String(date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text.slice(8, 10)}/${text.slice(5, 7)}` : text;
}

function accPeriod(from, to) {
    return to ? dateRange(accShort(from), accShort(to)) : isolateLtr(accShort(from));
}

function accRefusalText(code) {
    return Object.prototype.hasOwnProperty.call(ACC_REFUSALS, code)
        ? ACC_REFUSALS[code] : `${ACC_REFUSALS.rejected} ${isolateLtr('(' + code + ')')}`;
}

function accServerText(reasons) {
    const code = (reasons || [])[0];
    const key = Object.prototype.hasOwnProperty.call(ACC_SERVER, code) ? ACC_SERVER[code] : null;
    if (key) return ACC_TEXT[key];
    return code ? accRefusalText(code) : ACC_TEXT.server;
}

// What somebody typed into an amount field: blank, a number, or neither. A blank is NOT a
// zero - at a closure it is a missing answer, and the model is told so by leaving it out.
function accParse(text) {
    const said = String(text === null || text === undefined ? '' : text).trim()
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .replace(',', '.');
    if (said === '') return { blank: true };
    if (!/^\d+(\.\d{1,2})?$/.test(said)) return { bad: true };
    return { value: Number(said) };
}

// What the model is handed for a field: the number, or something it will refuse as "not
// money" - never a guess at what was meant.
function accAmountFor(text) {
    const parsed = accParse(text);
    return parsed.value === undefined ? 'x' : parsed.value;
}

function accInput(label, value, mode) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'acc-input';
    if (mode !== 'text') {
        // The digit keyboard, and left-to-right so 1,250.50 is not laid out backwards.
        input.setAttribute('inputmode', 'decimal');
        input.dir = 'ltr';
        input.autocomplete = 'off';
    }
    input.setAttribute('aria-label', label);
    input.value = value === undefined || value === null ? '' : String(value);
    // THE KEYBOARD MAY NOT COVER WHAT IS BEING TYPED. The page scrolls under the keyboard
    // (js/ui/bars.js publishes its height); bringing the field to the middle of what is
    // left is the same thing a person would do with a thumb they do not have free.
    input.addEventListener('focus', () => {
        setTimeout(() => {
            if (document.activeElement === input && typeof input.scrollIntoView === 'function') {
                input.scrollIntoView({ block: 'center' });
            }
        }, 250);
    });
    return input;
}

function accDateInput(label, value, max) {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'acc-input';
    input.setAttribute('aria-label', label);
    input.value = value || '';
    if (max) input.max = max;
    return input;
}

function accField(labelText, control) {
    const wrap = el('label', 'acc-field');
    wrap.appendChild(el('span', 'acc-field-label', labelText));
    wrap.appendChild(control);
    return wrap;
}

function accLine(labelText, valueText, className, key) {
    const row = el('div', 'acc-line' + (className ? ' ' + className : ''));
    if (key) row.dataset.line = key;
    row.appendChild(el('span', 'acc-line-label', labelText));
    row.appendChild(el('strong', 'acc-num', valueText));
    return row;
}

function accError(text) {
    const node = el('p', 'acc-error', text || '');
    node.setAttribute('role', 'alert');
    return node;
}

// One of several, as buttons: aria-pressed says which, and the look is tonal - the ONE
// filled button of a screen is its primary action and never a choice.
function accChoice(label, options, current, onPick) {
    const group = el('div', 'acc-seg');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const paint = value => {
        group.querySelectorAll('button').forEach(node => {
            const on = node.dataset.value === String(value);
            node.setAttribute('aria-pressed', on ? 'true' : 'false');
            node.classList.toggle('acc-seg-on', on);
        });
    };
    options.forEach(([value, text]) => {
        const node = button(text, 'acc-seg-btn', () => { paint(value); onPick(value); });
        node.dataset.value = String(value);
        group.appendChild(node);
    });
    paint(current);
    return group;
}

function accStatusLabel(status) {
    if (Object.prototype.hasOwnProperty.call(PAYBOOK_STATUS_LABELS, status)) return PAYBOOK_STATUS_LABELS[status];
    if (status === 'legacy-paid') return PAYBOOK_STATUS_LABELS.paid;
    if (status === 'legacy-due') return PAYBOOK_STATUS_LABELS.open;
    if (status === 'review') return ACC_TEXT.statusReview;
    if (status === 'unknown') return ACC_TEXT.statusUnknown;
    return ACC_TEXT.statusNone;
}

function accChip(status) {
    const node = el('span', 'acc-chip acc-chip-' + String(status).replace(/[^a-z-]/g, ''), accStatusLabel(status));
    node.dataset.status = status;
    return node;
}

function accCycleMark(cycle) {
    return el('span', 'acc-cycle', cycle === 'weekly' ? ACC_OWNER.weekly : ACC_OWNER.biweekly);
}

function accGo(screen, set) {
    Object.assign(ACC, set || {});
    ACC.screen = screen;
    ACC.node = null;
    if (typeof currentView !== 'undefined' && currentView !== 'advances') showView('advances');
    else render();
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}

function accHead(node, title, sub, onBack) {
    const head = el('div', 'acc-head');
    if (onBack) head.appendChild(button(ACC_TEXT.back, 'btn-secondary acc-back', onBack));
    const titles = el('div', 'acc-titles');
    titles.appendChild(el('h2', 'acc-title', title));
    if (sub) titles.appendChild(sub);
    head.appendChild(titles);
    node.appendChild(head);
    return head;
}

// ---------------------------------------------------------------- an operation in doubt
//
// The banner every screen here starts with. Three things it can say, and it says nothing
// otherwise: an operation whose fate is not known yet (and so nothing else may be sent),
// what became of one that was interrupted, and the calm line after something landed.
function accBanner() {
    const box = el('div', 'acc-banner');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    return box;
}

function accPaintBanner(box) {
    clear(box);
    const sync = typeof FarkadSync !== 'undefined' ? FarkadSync : null;
    const intent = sync && typeof sync.payIntent === 'function' && !sync._payBusy ? sync.payIntent() : null;
    if (intent) box.appendChild(el('p', 'acc-note acc-note-warn', ACC_TEXT.unknown));
    const outcome = sync && typeof sync.payOutcome === 'function' ? sync.payOutcome() : null;
    if (!intent && outcome && (outcome.outcome === 'committed' || outcome.outcome === 'nothing')) {
        const note = el('div', 'acc-note ' + (outcome.outcome === 'committed' ? 'acc-note-ok' : 'acc-note-warn'));
        note.appendChild(el('p', null, outcome.outcome === 'committed'
            ? ACC_TEXT.outcomeCommitted : ACC_TEXT.outcomeNothing));
        note.appendChild(button(ACC_TEXT.understood, 'btn-secondary', () => {
            sync.acknowledgePayOutcome();
            render();
        }));
        box.appendChild(note);
    }
    // A PHONE THAT LACKS THE DETAIL SAYS SO (js/sync/closed.js). The server's document
    // names a closure whose entries this phone could not fetch yet; it has NOT been
    // adopted, so every figure here is from the record this phone already had.
    const lacking = sync && typeof sync.closedWaiting === 'function' ? sync.closedWaiting() : null;
    if (lacking) {
        box.appendChild(el('p', 'acc-note acc-note-warn acc-closed-waiting',
            lacking.broken.length > 0 ? ACC_TEXT.closedBroken : ACC_TEXT.closedWaiting));
    }
    if (ACC.flash) box.appendChild(el('p', 'acc-note acc-note-ok', ACC.flash));
}

// Called by the sync layer when what it is waiting for changes, so the sentence above
// appears and goes without a tap.
function renderAccountsNotice() {
    if (!accountsOpen() || typeof currentView === 'undefined' || currentView !== 'advances') return;
    if (typeof render === 'function') render();
}

// IT RESOLVES BY ITSELF. While an intent stands, look again every few seconds: the sync
// layer settles it by READING the server (never by sending again), and this only asks it
// to look and redraws when the answer has come.
function accWatchIntent() {
    const sync = typeof FarkadSync !== 'undefined' ? FarkadSync : null;
    if (!sync || typeof sync.payIntent !== 'function') return;
    const held = sync.payIntent();
    if (!held) {
        if (ACC.watch) { clearInterval(ACC.watch); ACC.watch = null; }
        return;
    }
    if (ACC.watch) return;
    ACC.watch = setInterval(() => {
        if (!accountsOpen() || !sync.payIntent()) {
            clearInterval(ACC.watch);
            ACC.watch = null;
            render();
            return;
        }
        if (sync._payBusy || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        Promise.resolve(sync.resolvePayIntent()).then(outcome => {
            if (outcome === 'committed' || outcome === 'nothing') render();
        }, () => undefined);
    }, 3000);
}

// ONE DOOR for every screen's write: the plan, to the server, and the answer in words.
// `after(answer)` runs on `closed` / `done`; everything else comes back as a sentence.
function accSend(plan, form, after) {
    if (form.busy) return;
    form.busy = true;
    form.message = '';
    render();
    const settle = (answer) => {
        form.busy = false;
        if (answer && answer.ok && (answer.state === 'closed' || answer.state === 'done')) {
            after(answer);
            // The connection is known good and the queue is empty: the moment to let the
            // closures that have been settled long enough leave the live record. A few
            // at a time, refused quietly if anything is in the way; never awaited.
            if (typeof FarkadSync.archiveDue === 'function') {
                Promise.resolve().then(() => FarkadSync.archiveDue(todayStr())).catch(() => undefined);
            }
            return;
        }
        const state = answer ? answer.state : 'refused';
        if (state === 'stale') {
            const codes = (answer.reasons || []).filter(code => code !== 'stale');
            form.message = codes.indexOf('closed') !== -1 || codes.indexOf('statement') !== -1
                ? ACC_TEXT.staleClosed : ACC_TEXT.stale;
            form.stale = true;
        } else if (state === 'unknown') {
            form.message = ACC_TEXT.unknown;
        } else {
            form.message = accServerText(answer ? answer.reasons : []);
        }
        render();
    };
    let sent;
    try { sent = FarkadSync.transactPaybook(plan); } catch (error) { sent = Promise.reject(error); }
    Promise.resolve(sent).then(settle, () => settle({ ok: false, state: 'refused', reasons: ['server'] }));
}

function accPrimary(text, onClick) {
    return button(text, 'acc-primary', onClick);
}

function accPaintBusy(node, form, label) {
    node.textContent = form.busy ? ACC_TEXT.busy : label;
    node.disabled = Boolean(form.busy);
    node.setAttribute('aria-busy', form.busy ? 'true' : 'false');
}

// THE CARRY APPROVAL, asked on the spot: one sentence and its button, never a locked page.
function accCarryBox(form) {
    const box = el('div', 'acc-note acc-note-warn acc-carry');
    box.appendChild(el('p', null, ACC_REFUSALS['carry-approval-needed']));
    box.appendChild(button(ACC_TEXT.carryButton, 'btn-secondary', () => {
        const stamp = accStamp();
        const plan = planCarryApproval(State.schedule, stamp);
        let saved = plan.ok && plan.already;
        if (plan.ok && !plan.already) {
            // The ledger's own writer, on the record itself, through the ordinary path -
            // this is the entry the existing dialog in ⋯ writes, and it is not a pay entry.
            const change = recordCarryApproval(State.schedule, planCarryMigration(State.schedule),
                stamp.at, stamp.by);
            saved = Boolean(change) && State.commitMany([change]) === true;
        }
        form.message = saved ? ACC_TEXT.carryDone
            : (plan.ok ? ACC_TEXT.carryFailed : accRefusalText(plan.reasons[0]));
        render();
    }));
    return box;
}

// ---------------------------------------------------------------- the tab's one entry
function renderAccounts(root) {
    accWatchIntent();
    if (ACC.node && ACC.node.parentNode === root && typeof ACC.live === 'function') {
        ACC.live();
        return;
    }
    clear(root);
    const node = el('div', 'acc-screen acc-screen-' + ACC.screen);
    ACC.node = node;
    ACC.live = null;
    root.appendChild(node);
    const draw = {
        list: accDrawList, review: accDrawReview, pay: accDrawPay, group: accDrawGroup,
        summary: accDrawSummary, history: accDrawHistory, statement: accDrawStatement,
        correct: accDrawCorrect, legacy: accDrawLegacy, look: accDrawLook, archive: accDrawArchive
    }[ACC.screen] || accDrawList;
    draw(node);
}

// ---------------------------------------------------------------- the unified list
//
// THE ORDER, and it is the only thing here that is this file's own decision about the
// list: who needs a person first.
//   0  לבדיקה - something of his is held or over-settled
//   1  a period that has ENDED and is not closed (it can be closed now)
//   2  wage he is still owed from a closure
//   3  his open period, still running
//   4  only an advance debt
//   5  settled
//   6  nothing to speak of
// Inside a rank the roster's own order stands.
function accRank(row) {
    if (row.status === 'review') return 0;
    const ended = row.pending.length > 0
        || (row.current.hasWork && !row.current.closed && row.current.to <= row.today);
    if (ended) return 1;
    if (row.wageDue > 0) return 2;
    if (row.current.hasWork && !row.current.closed) return 3;
    if (row.debt > 0) return 4;
    if (row.status !== 'none') return 5;
    return 6;
}

// The period the row's close button means: the oldest one that is waiting, else his own.
function accTargetPeriod(row) {
    if (row.pending.length > 0) return { from: row.pending[0].from, to: row.pending[0].to };
    if (row.current.hasWork && !row.current.closed) return { from: row.current.from, to: row.current.to };
    return null;
}

function accLegacyRows() {
    return planPayMigration(State.schedule, todayStr()).paymentUnknown.filter(row => row.answerable);
}

function accDrawList(node) {
    const opened = Boolean(paybookFold(State.schedule).opening);
    if (!opened) { accDrawOpening(node); return; }

    accHead(node, ACC_TEXT.title, null, null);
    const banner = accBanner();
    node.appendChild(banner);

    const actions = el('div', 'acc-actions');
    actions.appendChild(accPrimary(ACC_OWNER.groupAll, () => accOpenGroup('all')));
    actions.appendChild(button(ACC_OWNER.groupBiweekly, 'btn-secondary', () => accOpenGroup('biweekly')));
    node.appendChild(actions);
    const links = el('div', 'acc-links');
    links.appendChild(button(ACC_OWNER.history, 'acc-link', () => accGo('history', { flash: '' })));
    const legacy = button('', 'acc-link', () => accGo('legacy', { flash: '' }));
    links.appendChild(legacy);
    const archive = button('', 'acc-link acc-archive-link', () => accGo('archive', { flash: '', archive: null }));
    links.appendChild(archive);
    const draftLink = button('', 'acc-link acc-draft-link', () => {
        const held = accDraftRead();
        if (held && State.worker(held.workerId)) accOpenReview(held.workerId, { from: held.from, to: held.to });
    });
    links.appendChild(draftLink);
    node.appendChild(links);

    node.appendChild(accChoice(ACC_TEXT.filterAll, [['all', ACC_TEXT.filterAll],
        ['weekly', ACC_TEXT.filterWeekly], ['biweekly', ACC_TEXT.filterBiweekly]], ACC.filter,
        value => { ACC.filter = value; paint(); }));
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'acc-input acc-search';
    search.placeholder = ACC_TEXT.search;
    search.setAttribute('aria-label', ACC_TEXT.search);
    search.value = ACC.search;
    search.addEventListener('input', () => { ACC.search = search.value.trim(); paint(); });
    node.appendChild(search);

    const list = el('div', 'acc-list');
    node.appendChild(list);

    function paint() {
        if (!paybookFold(State.schedule).opening) { accGo('list'); return; }
        accPaintBanner(banner);
        const waiting = accLegacyRows().filter(row => !ACC.legacyLeft[row.artifactId]).length;
        legacy.textContent = `${ACC_TEXT.legacyEntry} (${waiting})`;
        legacy.hidden = accLegacyRows().length === 0;
        // The archive is offered once there is anything it could say: a closure that
        // may leave, or one that already has.
        const moving = planArchive(State.schedule, todayStr()).totals;
        archive.textContent = `${ACC_TEXT.archiveEntry} (${moving.ready})`;
        archive.hidden = moving.ready === 0 && moving.archived === 0;
        const draft = accDraftRead();
        const drafted = draft && draft.day === todayStr() ? State.worker(draft.workerId) : null;
        draftLink.textContent = drafted ? `${ACC_TEXT.draftContinue}: ${isolate(drafted.name)}` : '';
        draftLink.hidden = !drafted;
        clear(list);
        const found = accountsList(State.schedule, todayStr(), { cycle: ACC.filter });
        const rows = found.rows.map((row, at) => ({ row, at }))
            .filter(item => item.row.name.indexOf(ACC.search) !== -1)
            .sort((a, b) => (accRank(a.row) - accRank(b.row)) || (a.at - b.at))
            .map(item => item.row);
        rows.forEach(row => list.appendChild(accRow(row)));
        if (rows.length === 0) list.appendChild(emptyHint(ACC_TEXT.notFound));
    }
    ACC.live = paint;
    paint();
}

function accRow(row) {
    const quiet = accRank(row) === 6;
    const card = el('section', 'acc-row' + (quiet ? ' acc-row-quiet' : ''));
    card.dataset.worker = row.workerId;
    card.dataset.rank = String(accRank(row));

    const head = el('div', 'acc-row-head');
    head.appendChild(el('strong', 'acc-name', isolate(row.name) + (row.active ? '' : ` · ${ACC_TEXT.inactiveMark}`)));
    head.appendChild(accCycleMark(row.cycle));
    head.appendChild(accChip(row.status));
    card.appendChild(head);

    // THE ONE BIG NUMBER is his open period's wage, and only while there is one: a period
    // that is closed, or has no work in it yet, is not printed as a large zero.
    if (!quiet && (row.running === null || (row.current.hasWork && !row.current.closed))) {
        const main = el('div', 'acc-row-main');
        main.appendChild(el('strong', 'acc-num acc-row-wage',
            row.running === null ? ACC_TEXT.unpriced : accMoney(row.running)));
        main.appendChild(el('span', 'acc-row-period', accPeriod(row.current.from, row.current.to)));
        card.appendChild(main);
    }

    // TWO BALANCES, IN TWO PLACES, NEVER ADDED. What he is owed and what he owes are two
    // facts about two different envelopes; a net of them is a decision only the person
    // closing the account may make, one advance at a time.
    if (row.wageDue > 0 || row.debt > 0) {
        const sums = el('div', 'acc-row-sums');
        if (row.wageDue > 0) {
            const due = el('span', 'acc-sum acc-sum-due');
            due.appendChild(el('span', null, ACC_OWNER.wageDue));
            due.appendChild(el('strong', 'acc-num', accMoney(row.wageDue)));
            sums.appendChild(due);
        }
        if (row.debt > 0) {
            const debt = el('span', 'acc-sum acc-sum-debt');
            debt.appendChild(el('span', null, ACC_TEXT.debt));
            debt.appendChild(el('strong', 'acc-num', accMoney(row.debt)));
            sums.appendChild(debt);
        }
        card.appendChild(sums);
    }

    // An earlier period nobody closed: listed apart, never summed into the number above.
    row.pending.forEach(wage => {
        const line = button('', 'acc-pending', () => accOpenReview(row.workerId, { from: wage.from, to: wage.to }));
        line.appendChild(el('span', 'acc-pending-label', PAYBOOK_STATUS_LABELS.waiting));
        line.appendChild(el('span', null, accPeriod(wage.from, wage.to)));
        line.appendChild(el('strong', 'acc-num', wage.gross === null ? ACC_TEXT.unpriced : accMoney(wage.gross)));
        card.appendChild(line);
    });

    const actions = el('div', 'acc-row-actions');
    if (row.status === 'review') {
        actions.appendChild(button(ACC_TEXT.lookAction, 'btn-secondary acc-look',
            () => accGo('look', { flash: '', look: { workerId: row.workerId } })));
    }
    const target = accTargetPeriod(row);
    if (target) {
        actions.appendChild(button(ACC_OWNER.closeOne, 'btn-secondary acc-close',
            () => accOpenReview(row.workerId, target)));
    }
    if (row.wageDue > 0) {
        actions.appendChild(button(ACC_OWNER.payment, 'btn-secondary acc-pay',
            () => accOpenPay(row.workerId, null, 'list')));
    }
    actions.appendChild(button(ACC_TEXT.advances, 'btn-secondary acc-advances', () => {
        ACC.flash = '';
        showWorkerAdvances(row.workerId);
    }));
    card.appendChild(actions);
    return card;
}

// ---------------------------------------------------------------- the review page
function accOpenReview(workerId, period, group) {
    const worker = State.worker(workerId);
    if (!worker) return;
    const account = accountFor(State.schedule, worker, todayStr());
    const range = periodRangeFor(worker, todayStr());
    const own = period || (account && accTargetPeriod(account)) || { from: range.from, to: range.to };
    accGo('review', { flash: '', review: {
        workerId: String(worker.id), from: own.from, to: own.to,
        alloc: {}, suggested: false, extras: [], paidMode: 'none', paidText: '', method: 'cash',
        attempted: false, busy: false, message: '', stale: false, group: Boolean(group)
    } });
}

// The plan as it stands for what is typed RIGHT NOW. Three dry runs, all the model's:
// one to learn which advances are on offer, one for the deductions (which is where "paid
// in full" learns what full is), one with the payment.
function accReviewPlan(form) {
    const stamp = accStamp();
    const period = { from: form.from, to: form.to };
    const probe = planClosure(State.schedule, form.workerId, period, {}, stamp);
    const rows = probe.review ? probe.review.advances : [];
    form.mark = probe.review ? accDraftMark(probe.review) : '';
    if (probe.review && !form.suggested) {
        const draft = accDraftFor(form, probe.review);
        if (draft) {
            // What he had typed, put back - against the account it was typed against.
            rows.forEach(row => { if (draft.alloc[row.advanceId] !== undefined) form.alloc[row.advanceId] = draft.alloc[row.advanceId]; });
            form.extras = draft.extras.map(extra => Object.assign({}, extra));
            form.paidMode = draft.paidMode;
            form.paidText = draft.paidText;
            form.method = draft.method;
            form.restored = true;
            form.touched = true;
        } else {
            const suggested = paybookSuggestAllocations(probe.review);
            rows.forEach(row => { form.alloc[row.advanceId] = moneyText(suggested[row.advanceId] || 0); });
        }
        form.suggested = true;
    }
    const allocations = {};
    rows.forEach(row => {
        // An advance that appeared while the page was open has no answer yet, and is not
        // given one: a blank is a missing answer and says so on its own row.
        if (form.alloc[row.advanceId] === undefined) form.alloc[row.advanceId] = '';
        if (accParse(form.alloc[row.advanceId]).blank) return;
        allocations[row.advanceId] = accAmountFor(form.alloc[row.advanceId]);
    });
    const choices = { allocations, extras: form.extras.map(extra => ({
        amount: accAmountFor(extra.amount), category: extra.category, reason: extra.reason })) };
    const base = planClosure(State.schedule, form.workerId, period, choices, stamp);
    let paid;
    if (form.paidMode === 'full' && base.review && base.review.netDue > 0) paid = base.review.netDue;
    if (form.paidMode === 'partial') paid = accAmountFor(form.paidText);
    if (paid === undefined) return base;
    return planClosure(State.schedule, form.workerId, period,
        Object.assign({}, choices, { paid, method: form.method }), stamp);
}

const ACC_FIELD_CODES = ['allocation', 'allocation-missing', 'over-advance', 'over-wage', 'deduction',
    'extra', 'paid', 'overpay', 'carry-approval-needed'];

function accDrawReview(node) {
    const form = ACC.review;
    const worker = form && State.worker(form.workerId);
    if (!form || !worker) { accGo('list'); return; }
    const leave = () => (form.group ? accGo('group') : accGo('list'));

    const sub = el('p', 'acc-sub');
    sub.appendChild(el('strong', 'acc-name', isolate(worker.name)));
    sub.appendChild(accCycleMark(payCycleAt(worker, form.from)));
    sub.appendChild(el('span', 'acc-row-period', dateRange(accDay(form.from), accDay(form.to))));
    accHead(node, ACC_OWNER.closure, sub, leave);
    const banner = accBanner();
    node.appendChild(banner);

    const walk = el('div', 'acc-walk');
    if (form.group && ACC.group) {
        walk.appendChild(el('strong', 'acc-progress', accGroupProgress()));
        walk.appendChild(button(ACC_TEXT.skip, 'btn-secondary', () => {
            ACC.group.results[accItemKey(form)] = { state: 'skipped' };
            accGroupNext();
        }));
        node.appendChild(walk);
    }

    const page = el('div', 'acc-page-reasons');
    node.appendChild(page);
    const facts = el('div', 'acc-facts');
    node.appendChild(facts);
    const gross = accLine(ACC_TEXT.gross, '', 'acc-line-strong', 'gross');
    node.appendChild(gross);
    const before = el('div', 'acc-before');
    node.appendChild(before);

    node.appendChild(el('h3', 'acc-h3', ACC_TEXT.advancesTitle));
    const advBox = el('div', 'acc-advances');
    node.appendChild(advBox);
    const advError = accError('');
    node.appendChild(advError);
    const later = el('div', 'acc-later');
    node.appendChild(later);

    node.appendChild(el('h3', 'acc-h3', ACC_TEXT.extrasTitle));
    const extraBox = el('div', 'acc-extras');
    node.appendChild(extraBox);
    const extraError = accError('');
    node.appendChild(extraError);
    node.appendChild(button(ACC_TEXT.addExtra, 'btn-secondary acc-add-extra', () => {
        form.extras.push({ amount: '', category: 'agreed', reason: '' });
        form.touched = true;
        drawExtras();
        paint();
    }));

    const result = el('div', 'acc-result');
    const deducted = accLine(ACC_TEXT.advanceDeducted, '', '', 'advances');
    const extraSum = accLine(ACC_TEXT.extrasTitle, '', '', 'extras');
    const net = accLine(ACC_TEXT.netDue, '', 'acc-line-net', 'net');
    result.appendChild(deducted);
    result.appendChild(extraSum);
    result.appendChild(net);
    node.appendChild(result);
    const wageError = accError('');
    node.appendChild(wageError);

    node.appendChild(el('h3', 'acc-h3', ACC_TEXT.paidTitle));
    node.appendChild(accChoice(ACC_TEXT.paidTitle, [['full', ACC_TEXT.paidFull],
        ['partial', ACC_OWNER.partial], ['none', ACC_TEXT.paidNone]], form.paidMode,
        value => { form.paidMode = value; form.touched = true; paint(); if (value === 'partial') paidInput.focus(); }));
    const paidInput = accInput(ACC_TEXT.paidAmount, form.paidText);
    const paidField = accField(ACC_TEXT.paidAmount, paidInput);
    node.appendChild(paidField);
    const methodBox = el('div', 'acc-method');
    methodBox.appendChild(accChoice(ACC_TEXT.methodTitle, [['cash', ACC_TEXT.methodCash],
        ['transfer', ACC_TEXT.methodTransfer]], form.method, value => { form.method = value; form.touched = true; paint(); }));
    node.appendChild(methodBox);
    const paidError = accError('');
    node.appendChild(paidError);

    const after = el('div', 'acc-result acc-after');
    const paidLine = accLine(ACC_TEXT.paidTitle, '', '', 'paid');
    const balance = accLine(ACC_TEXT.balanceAfter, '', 'acc-line-strong', 'balance');
    const debtLine = accLine(ACC_TEXT.debtAfter, '', '', 'debt');
    after.appendChild(paidLine);
    after.appendChild(balance);
    after.appendChild(debtLine);
    node.appendChild(after);

    const carry = el('div', 'acc-carry-slot');
    node.appendChild(carry);
    const message = accError('');
    message.classList.add('acc-message');
    node.appendChild(message);
    const fresh = el('div', 'acc-fresh');
    node.appendChild(fresh);
    const confirm = accPrimary(ACC_TEXT.confirm, () => {
        clearTimeout(timer);
        form.attempted = true;
        form.stale = false;
        const plan = paint();
        if (!plan.ok) {
            const fields = plan.reasons.filter(code => ACC_FIELD_CODES.indexOf(code) !== -1);
            // The carry approval has its own box, with its own sentence and button, right
            // above this one: nothing to add to it.
            form.message = fields.length === 1 && fields[0] === 'carry-approval-needed' ? ''
                : (fields.length > 0 ? ACC_TEXT.fixFirst : accRefusalText(plan.reasons[0]));
            paint();
            const first = node.querySelector('.acc-error:not(:empty):not(.acc-message), .acc-page-reasons .acc-note, .acc-carry');
            if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center' });
            return;
        }
        accSend(plan, form, () => {
            accDraftClear();
            const said = `${isolate(worker.name)}: ${ACC_TEXT.closedDone}`;
            if (form.group && ACC.group) {
                ACC.group.results[accItemKey(form)] = { state: 'done' };
                ACC.flash = said;
                accGroupNext();
            } else {
                accGo('list', { flash: said, review: null });
            }
        });
    });
    node.appendChild(confirm);

    let timer = null;
    const soon = () => { form.touched = true; clearTimeout(timer); timer = setTimeout(paint, 180); };
    paidInput.addEventListener('input', () => { form.paidText = paidInput.value; soon(); });

    let drawnIds = null;
    let advRefs = {};
    function drawAdvances(rows) {
        const ids = rows.map(row => row.advanceId).join('|');
        if (ids === drawnIds) return;
        drawnIds = ids;
        advRefs = {};
        clear(advBox);
        if (rows.length === 0) advBox.appendChild(emptyHint(ACC_TEXT.noAdvances));
        rows.forEach(row => {
            const card = el('div', 'acc-adv');
            card.dataset.advance = row.advanceId;
            const info = el('p', 'acc-adv-info');
            card.appendChild(info);
            const input = accInput(ACC_TEXT.advanceField, form.alloc[row.advanceId]);
            const set = text => { input.value = text; form.alloc[row.advanceId] = text; form.touched = true; paint(); };
            input.addEventListener('input', () => { form.alloc[row.advanceId] = input.value; soon(); });
            const line = el('div', 'acc-adv-line');
            line.appendChild(accField(ACC_TEXT.advanceField, input));
            const all = button(ACC_TEXT.all, 'btn-secondary acc-adv-all', () => set(moneyText(advRefs[row.advanceId].left)));
            line.appendChild(all);
            line.appendChild(button(ACC_TEXT.zero, 'btn-secondary acc-adv-zero', () => set('0')));
            card.appendChild(line);
            const left = accLine(ACC_TEXT.leftAfter, '', 'acc-adv-after');
            card.appendChild(left);
            const error = accError('');
            card.appendChild(error);
            advBox.appendChild(card);
            advRefs[row.advanceId] = { info, input, left: row.left, after: left.lastChild, error };
        });
    }

    function drawExtras() {
        clear(extraBox);
        form.extras.forEach((extra, at) => {
            const card = el('div', 'acc-extra');
            const amount = accInput(ACC_TEXT.extraAmount, extra.amount);
            amount.addEventListener('input', () => { extra.amount = amount.value; soon(); });
            const kind = document.createElement('select');
            kind.className = 'acc-input';
            kind.setAttribute('aria-label', ACC_TEXT.extraCategory);
            [['agreed', ACC_TEXT.categoryAgreed], ['settlement', ACC_TEXT.categorySettlement],
                ['other', ACC_TEXT.categoryOther]].forEach(([value, text]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                kind.appendChild(option);
            });
            kind.value = extra.category;
            kind.addEventListener('change', () => { extra.category = kind.value; form.touched = true; paint(); });
            const reason = accInput(ACC_TEXT.extraReason, extra.reason, 'text');
            reason.maxLength = 300;
            reason.addEventListener('input', () => { extra.reason = reason.value; soon(); });
            const top = el('div', 'acc-adv-line');
            top.appendChild(accField(ACC_TEXT.extraAmount, amount));
            top.appendChild(accField(ACC_TEXT.extraCategory, kind));
            card.appendChild(top);
            card.appendChild(accField(ACC_TEXT.extraReason, reason));
            card.appendChild(button(ACC_TEXT.removeExtra, 'btn-secondary', () => {
                form.extras.splice(at, 1);
                form.touched = true;
                drawExtras();
                paint();
            }));
            extraBox.appendChild(card);
        });
    }
    drawExtras();

    function paint() {
        const plan = accReviewPlan(form);
        const review = plan.review;
        accPaintBanner(banner);
        clear(page);
        plan.reasons.filter(code => ACC_FIELD_CODES.indexOf(code) === -1)
            .map(accRefusalText).filter((text, at, list) => list.indexOf(text) === at)
            .forEach(text => page.appendChild(el('p', 'acc-note acc-note-warn', text)));
        if (form.restored) page.appendChild(el('p', 'acc-note acc-draft-restored', ACC_TEXT.draftRestored));
        // Kept as it is typed - but only once somebody HAS typed: opening a page writes nothing.
        if (!form.busy) accDraftSave(form);
        accPaintBusy(confirm, form, ACC_TEXT.confirm);
        // "A field needs fixing" is true only until it is fixed.
        if (form.message === ACC_TEXT.fixFirst && plan.ok) form.message = '';
        message.textContent = form.message || '';
        clear(carry);
        if (plan.reasons.indexOf('carry-approval-needed') !== -1) carry.appendChild(accCarryBox(form));
        clear(fresh);
        if (form.stale) accFreshClosure(fresh, form);
        if (!review) return plan;

        const open = Boolean(facts.querySelector('details[open]'));
        clear(facts);
        const counts = el('p', 'acc-counts');
        [[ACC_TEXT.workDays, review.counts.attendanceDays], [ACC_TEXT.regularDays, review.counts.normalDays],
            [ACC_TEXT.doubleDays, review.counts.doubleDays], [ACC_TEXT.extraHours, review.counts.extraHours],
            [ACC_TEXT.absentDays, review.counts.absent]]
            .filter(([, count], at) => at === 0 || count > 0)
            .forEach(([label, count]) => {
                const one = el('span', 'acc-count');
                one.appendChild(el('span', null, label));
                one.appendChild(el('strong', 'acc-num', String(count)));
                counts.appendChild(one);
            });
        facts.appendChild(counts);
        if (review.sites.length > 0) {
            const sites = el('div', 'acc-sites');
            review.sites.forEach(site => {
                const tag = paintSite(el('span', 'acc-site'), site.placeId);
                appendSiteName(tag, site.placeId, site.name);
                tag.appendChild(el('span', 'acc-num', ` · ${site.days}`));
                sites.appendChild(tag);
            });
            facts.appendChild(sites);
        }
        const fold = el('details', 'acc-days');
        fold.open = open;
        fold.appendChild(el('summary', null, ACC_TEXT.dayList));
        review.days.forEach(day => {
            const names = day.absent ? ACC_TEXT.absent : day.sites.map(placeId =>
                (review.sites.filter(site => site.placeId === placeId)[0] || {}).name || '').join(' + ');
            const extra = (day.doubled ? ` · ${RATE_LABELS[RATE_DOUBLE]}` : '')
                + (day.extraHours > 0 ? ` · ${plusAmount(day.extraHours)}` : '');
            fold.appendChild(accLine(`${accShort(day.date)} · ${names}${extra}`,
                day.amount === null ? '' : accMoney(day.amount), 'acc-day'));
        });
        facts.appendChild(fold);

        gross.lastChild.textContent = review.gross === null ? ACC_TEXT.unpriced : accMoney(review.gross);
        clear(before);
        if (review.wageDueBefore > 0) {
            before.appendChild(accLine(ACC_OWNER.wageDue, accMoney(review.wageDueBefore), 'acc-sum-due'));
            before.appendChild(el('p', 'acc-hint', ACC_TEXT.wageDueBefore));
        }

        drawAdvances(review.advances);
        review.advances.forEach(row => {
            const refs = advRefs[row.advanceId];
            if (!refs) return;
            refs.left = row.left;
            refs.info.textContent = `${accDay(row.date)} · ${ACC_TEXT.advanceGiven} ${accMoney(row.given)} · `
                + `${ACC_TEXT.advanceLeft} ${accMoney(row.left)}`;
            const typed = accParse(form.alloc[row.advanceId]);
            const over = typed.value !== undefined && row.leftAfter < 0;
            refs.after.textContent = typed.value === undefined || over ? '—' : accMoney(row.leftAfter);
            refs.error.textContent = typed.bad ? ACC_REFUSALS.allocation
                : (over ? ACC_REFUSALS['over-advance']
                    : (typed.blank && form.attempted ? ACC_REFUSALS['allocation-missing'] : ''));
        });
        advError.textContent = plan.reasons.indexOf('deduction') !== -1 ? ACC_REFUSALS.deduction : '';
        clear(later);
        review.laterAdvances.forEach(row => later.appendChild(el('p', 'acc-hint',
            `${accDay(row.date)} · ${accMoney(row.left)} · ${ACC_TEXT.laterAdvance}`)));

        extraError.textContent = form.attempted && plan.reasons.indexOf('extra') !== -1 ? ACC_REFUSALS.extra : '';
        deducted.lastChild.textContent = accMoney(-review.advanceDeducted || 0);
        extraSum.lastChild.textContent = accMoney(-review.extraDeducted || 0);
        extraSum.hidden = !(review.extraDeducted > 0);
        net.lastChild.textContent = accMoney(review.netDue);
        wageError.textContent = plan.reasons.indexOf('over-wage') !== -1 ? ACC_REFUSALS['over-wage'] : '';

        paidField.hidden = form.paidMode !== 'partial';
        methodBox.hidden = form.paidMode === 'none';
        const typedPaid = accParse(form.paidText);
        paidError.textContent = plan.reasons.indexOf('overpay') !== -1 ? ACC_REFUSALS.overpay
            : (plan.reasons.indexOf('paid') !== -1 && (form.attempted || typedPaid.bad) ? ACC_REFUSALS.paid : '');
        paidLine.lastChild.textContent = accMoney(review.paid);
        balance.firstChild.textContent = review.balanceAfter > 0 ? ACC_OWNER.wageDue : ACC_TEXT.balanceAfter;
        balance.lastChild.textContent = accMoney(review.balanceAfter);
        debtLine.lastChild.textContent = accMoney(review.debtAfter);
        debtLine.hidden = !(review.debtBefore > 0);
        return plan;
    }
    ACC.live = paint;
    paint();
}

// THE FRESH NUMBERS after a conflict: when another phone closed this account first, what
// it was closed on - read off the record this phone has just adopted.
function accFreshClosure(box, form) {
    const row = closureHistory(State.schedule, { workerId: form.workerId })
        .filter(one => one.periodFrom === form.from)[0];
    if (!row) return;
    const note = el('div', 'acc-note');
    note.appendChild(el('p', null, ACC_TEXT.freshClosed));
    note.appendChild(accLine(ACC_TEXT.gross, row.gross === null ? '' : accMoney(row.gross)));
    note.appendChild(accLine(ACC_TEXT.advanceDeducted, accMoney(-row.advanceDeducted || 0)));
    note.appendChild(accLine(ACC_TEXT.netDue, row.netDue === null ? '' : accMoney(row.netDue)));
    if (row.paid !== null) note.appendChild(accLine(ACC_TEXT.paidTitle, accMoney(row.paid)));
    if (row.due !== null) note.appendChild(accLine(ACC_OWNER.wageDue, accMoney(row.due)));
    box.appendChild(note);
}

// ---------------------------------------------------------------- a later payment
function accOpenPay(workerId, statementId, back) {
    accGo('pay', { flash: '', pay: { workerId: String(workerId), statementId: statementId || null,
        // MINTED WHEN THE FORM OPENS, one per statement: a double tap, a retry and a slow
        // answer all carry the same id, so they are one payment.
        ids: {}, amountText: null, date: todayStr(), method: 'cash', busy: false, message: '',
        attempted: false, back: back || 'list' } });
}

function accDrawPay(node) {
    const form = ACC.pay;
    const worker = form && State.worker(form.workerId);
    if (!form || !worker) { accGo('list'); return; }
    const leave = () => (form.back === 'statement' ? accGo('statement') : accGo('list'));
    const sub = el('p', 'acc-sub');
    sub.appendChild(el('strong', 'acc-name', isolate(worker.name)));
    accHead(node, ACC_OWNER.payment, sub, leave);
    const banner = accBanner();
    node.appendChild(banner);
    const body = el('div', 'acc-form');
    node.appendChild(body);

    const pick = el('div', 'acc-pick');
    body.appendChild(pick);
    const owed = accLine(ACC_OWNER.wageDue, '', 'acc-line-net acc-sum-due', 'owed');
    body.appendChild(owed);
    const amount = accInput(ACC_TEXT.payAmount, '');
    amount.addEventListener('input', () => { form.amountText = amount.value; paint(); });
    body.appendChild(accField(ACC_TEXT.payAmount, amount));
    const amountError = accError('');
    body.appendChild(amountError);
    const date = accDateInput(ACC_TEXT.payDate, form.date, todayStr());
    date.addEventListener('change', () => { form.date = date.value; paint(); });
    body.appendChild(accField(ACC_TEXT.payDate, date));
    const dateError = accError('');
    body.appendChild(dateError);
    body.appendChild(accChoice(ACC_TEXT.methodTitle, [['cash', ACC_TEXT.methodCash],
        ['transfer', ACC_TEXT.methodTransfer]], form.method, value => { form.method = value; }));
    const after = accLine(ACC_TEXT.payOwed, '', '', 'after');
    body.appendChild(after);
    const message = accError('');
    message.classList.add('acc-message');
    body.appendChild(message);
    const empty = el('p', 'acc-note', ACC_TEXT.payNothing);
    node.appendChild(empty);

    const planNow = () => {
        const id = form.statementId;
        if (!form.ids[id]) form.ids[id] = newPaymentId();
        const typed = accParse(form.amountText);
        return planPayment(State.schedule, id, typed.value === undefined ? null : typed.value,
            { paymentId: form.ids[id], date: form.date, method: form.method }, accStamp());
    };
    const save = accPrimary(ACC_TEXT.paySave, () => {
        form.attempted = true;
        const plan = planNow();
        if (plan.ok && plan.already) { accGo(form.back === 'statement' ? 'statement' : 'list', { flash: ACC_TEXT.payAlready }); return; }
        if (!plan.ok) {
            form.message = plan.reasons.filter(code => ['amount', 'overpay', 'date'].indexOf(code) === -1)
                .map(accRefusalText)[0] || ACC_TEXT.fixFirst;
            paint();
            return;
        }
        accSend(plan, form, () => accGo(form.back === 'statement' ? 'statement' : 'list',
            { flash: `${isolate(worker.name)}: ${ACC_TEXT.payDone}`, pay: null }));
    });
    body.appendChild(save);

    let drawn = null;
    function paint() {
        accPaintBanner(banner);
        const account = accountFor(State.schedule, worker, todayStr());
        const unpaid = account ? account.unpaid : [];
        body.hidden = unpaid.length === 0;
        empty.hidden = unpaid.length !== 0;
        if (unpaid.length === 0) return;
        if (!unpaid.some(row => row.statementId === form.statementId)) {
            form.statementId = unpaid[0].statementId;
            form.amountText = null;
        }
        const target = unpaid.filter(row => row.statementId === form.statementId)[0];
        if (form.amountText === null) {
            form.amountText = moneyText(target.due);
            amount.value = form.amountText;
        }
        const ids = unpaid.map(row => row.statementId).join('|') + '>' + form.statementId;
        if (ids !== drawn) {
            drawn = ids;
            clear(pick);
            if (unpaid.length > 1) {
                pick.appendChild(accChoice(ACC_TEXT.payFor, unpaid.map(row => [row.statementId,
                    `${accPeriod(row.periodFrom, row.periodTo)} · ${accMoney(row.due)}`]), form.statementId,
                    value => { form.statementId = value; form.amountText = null; paint(); }));
            } else {
                pick.appendChild(el('p', 'acc-hint', `${ACC_TEXT.payFor} ${accPeriod(target.periodFrom, target.periodTo)}`));
            }
        }
        owed.lastChild.textContent = accMoney(target.due);
        const plan = planNow();
        const typed = accParse(form.amountText);
        amountError.textContent = plan.reasons.indexOf('overpay') !== -1 ? ACC_REFUSALS.overpay
            : (plan.reasons.indexOf('amount') !== -1 && (form.attempted || typed.bad) ? ACC_REFUSALS.amount : '');
        dateError.textContent = plan.reasons.indexOf('date') !== -1 ? ACC_REFUSALS.date : '';
        after.lastChild.textContent = plan.ok && !plan.already ? accMoney(plan.dueAfter) : '—';
        message.textContent = form.message || '';
        accPaintBusy(save, form, ACC_TEXT.paySave);
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- the group walk
function accItemKey(item) {
    return `${item.workerId}>${item.from}`;
}

// Every account in scope that is waiting, one item per man per period, roster order.
function accGroupItems(scope) {
    const today = todayStr();
    const items = [];
    accountsList(State.schedule, today, { cycle: scope === 'biweekly' ? 'biweekly' : 'all' }).rows.forEach(row => {
        row.pending.forEach(wage => items.push({ workerId: row.workerId, from: wage.from, to: wage.to }));
        if (row.current.hasWork && !row.current.closed) {
            items.push({ workerId: row.workerId, from: row.current.from, to: row.current.to });
        }
    });
    return items;
}

function accOpenGroup(scope) {
    accGo('group', { flash: '', group: { scope, items: accGroupItems(scope), results: {}, selected: {},
        prepared: null, paidAll: false, running: false, ran: false, message: '', busy: false } });
}

// 'done' is read off the RECORD, never remembered: a closure another phone made while
// this list was open is done here too, and a retry can never repeat one.
function accItemState(item) {
    const worker = State.worker(item.workerId);
    const wage = worker ? paybookPeriodWage(State.schedule, worker, { from: item.from, to: item.to }, null) : null;
    if (wage && wage.closed) return 'done';
    const held = ACC.group && ACC.group.results[accItemKey(item)];
    if (held && held.state !== 'done') return held.state;
    return item.to > todayStr() ? 'early' : 'waiting';
}

function accGroupCounts() {
    const states = ACC.group.items.map(accItemState);
    const total = states.filter(state => state !== 'early').length;
    const done = states.filter(state => state === 'done').length;
    return { total, done, left: total - done };
}

function accGroupProgress() {
    const counts = accGroupCounts();
    return `${counts.done} ${ACC_TEXT.groupOf} ${counts.total} · ${ACC_TEXT.groupLeft} ${counts.left}`;
}

// The next account of the walk: one nobody has touched first, then the skipped ones -
// "skip and come back".
function accGroupNextItem() {
    const items = ACC.group.items;
    return items.filter(item => accItemState(item) === 'waiting')[0]
        || items.filter(item => ['skipped', 'refused'].indexOf(accItemState(item)) !== -1)[0] || null;
}

function accGroupNext() {
    const fresh = ACC.group.items.filter(item => accItemState(item) === 'waiting')[0];
    if (fresh) { accOpenReview(fresh.workerId, { from: fresh.from, to: fresh.to }, true); return; }
    accGo('group', { review: null });
}

function accGroupTitle() {
    return ACC.group && ACC.group.scope === 'biweekly' ? ACC_OWNER.groupBiweekly : ACC_OWNER.groupAll;
}

function accItemChip(item) {
    const state = accItemState(item);
    const held = ACC.group.results[accItemKey(item)] || {};
    const text = state === 'done' ? PAYBOOK_STATUS_LABELS.closed
        : (state === 'skipped' ? ACC_TEXT.skipped
            : (state === 'refused' ? ACC_TEXT.notClosed
                : (state === 'early' ? `${ACC_TEXT.notEnded}${isolateLtr(accShort(item.to))}` : PAYBOOK_STATUS_LABELS.waiting)));
    const chip = el('span', 'acc-chip acc-chip-' + (state === 'done' ? 'closed' : (state === 'refused' ? 'review' : 'waiting')), text);
    chip.dataset.state = state;
    return { chip, why: state === 'refused' ? (held.text || '') : '' };
}

function accDrawGroup(node) {
    const group = ACC.group;
    if (!group) { accGo('list'); return; }
    accHead(node, accGroupTitle(), null, () => accGo('list', { group: null, flash: '' }));
    const banner = accBanner();
    node.appendChild(banner);
    const progress = el('strong', 'acc-progress');
    node.appendChild(progress);
    const message = accError('');
    message.classList.add('acc-message');
    const actions = el('div', 'acc-actions');
    const start = accPrimary(ACC_TEXT.groupStart, () => {
        const next = accGroupNextItem();
        if (!next) {
            group.message = group.items.length === 0 ? ACC_TEXT.groupEmpty : ACC_TEXT.groupAllDone;
            paint();
            return;
        }
        delete group.results[accItemKey(next)];
        accOpenReview(next.workerId, { from: next.from, to: next.to }, true);
    });
    actions.appendChild(start);
    actions.appendChild(button(ACC_TEXT.prepare, 'btn-secondary acc-prepare', () => {
        const keys = group.items.filter(item => group.selected[accItemKey(item)]
            && ['waiting', 'skipped', 'refused'].indexOf(accItemState(item)) !== -1).map(accItemKey);
        if (keys.length === 0) { group.message = ACC_TEXT.needSelection; paint(); return; }
        group.message = '';
        accGo('summary', { group: Object.assign(group, { prepared: keys, ran: false, paidAll: false }) });
    }));
    node.appendChild(actions);
    node.appendChild(message);
    const list = el('div', 'acc-list');
    node.appendChild(list);

    function paint() {
        accPaintBanner(banner);
        progress.textContent = accGroupProgress();
        const counts = accGroupCounts();
        start.textContent = counts.done > 0 || Object.keys(group.results).length > 0
            ? ACC_TEXT.groupResume : ACC_TEXT.groupStart;
        message.textContent = group.message || (group.items.length === 0 ? ACC_TEXT.groupEmpty : '');
        clear(list);
        group.items.forEach(item => {
            const worker = State.worker(item.workerId);
            if (!worker) return;
            const key = accItemKey(item);
            const state = accItemState(item);
            const row = el('section', 'acc-row acc-group-row');
            row.dataset.worker = item.workerId;
            row.dataset.from = item.from;
            const head = el('div', 'acc-row-head');
            if (['waiting', 'skipped', 'refused'].indexOf(state) !== -1) {
                const box = el('label', 'acc-check');
                const tick = document.createElement('input');
                tick.type = 'checkbox';
                tick.checked = Boolean(group.selected[key]);
                tick.setAttribute('aria-label', `${ACC_TEXT.select}: ${isolate(worker.name)}`);
                tick.addEventListener('change', () => { group.selected[key] = tick.checked; });
                box.appendChild(tick);
                head.appendChild(box);
            }
            head.appendChild(el('strong', 'acc-name', isolate(worker.name)));
            head.appendChild(accCycleMark(payCycleAt(worker, item.from)));
            const said = accItemChip(item);
            head.appendChild(said.chip);
            row.appendChild(head);
            const wage = paybookPeriodWage(State.schedule, worker, { from: item.from, to: item.to }, null);
            const open = button('', 'acc-pending', () => {
                if (state === 'done') { accGo('statement', { statement: { workerId: item.workerId, periodFrom: item.from, back: 'group' } }); return; }
                accOpenReview(item.workerId, { from: item.from, to: item.to }, true);
            });
            open.appendChild(el('span', null, accPeriod(item.from, item.to)));
            open.appendChild(el('strong', 'acc-num', wage.gross === null ? ACC_TEXT.unpriced : accMoney(wage.gross)));
            row.appendChild(open);
            if (said.why) row.appendChild(el('p', 'acc-error', said.why));
            list.appendChild(row);
        });
    }
    ACC.live = paint;
    paint();
}

// The plan for one prepared item: the suggestions, and "not paid yet" unless the person
// said otherwise for the whole batch. Payment is never assumed from having been selected.
function accPreparedPlan(item, paidAll) {
    const stamp = accStamp();
    const period = { from: item.from, to: item.to };
    const probe = planClosure(State.schedule, item.workerId, period, {}, stamp);
    if (!probe.review) return probe;
    const choices = { allocations: paybookSuggestAllocations(probe.review) };
    const base = planGroupClosure(State.schedule, [item.workerId], period,
        { [item.workerId]: choices }, stamp).results[0];
    if (!base.plan || !paidAll || !base.plan.review || !(base.plan.review.netDue > 0)) return base.plan || probe;
    return planClosure(State.schedule, item.workerId, period,
        Object.assign({}, choices, { paid: base.plan.review.netDue, method: 'cash' }), stamp);
}

function accDrawSummary(node) {
    const group = ACC.group;
    if (!group || !group.prepared) { accGo('list'); return; }
    accHead(node, ACC_TEXT.summaryTitle, el('p', 'acc-sub', accGroupTitle()), () => accGo('group'));
    const banner = accBanner();
    node.appendChild(banner);
    const paidChoice = accChoice(ACC_TEXT.paidTitle, [['none', ACC_TEXT.paidNone], ['full', ACC_TEXT.paidFull]],
        group.paidAll ? 'full' : 'none', value => { group.paidAll = value === 'full'; paint(); });
    node.appendChild(paidChoice);
    const said = el('p', 'acc-note');
    node.appendChild(said);
    const table = el('div', 'acc-table');
    node.appendChild(table);
    const message = accError('');
    message.classList.add('acc-message');
    node.appendChild(message);
    const go = accPrimary(ACC_TEXT.batchConfirm, () => run(false));
    node.appendChild(go);
    const again = button(ACC_TEXT.retry, 'btn-secondary acc-retry', () => run(true));
    node.appendChild(again);
    const home = button(ACC_TEXT.backToList, 'btn-secondary', () => accGo('list', { group: null, flash: '' }));
    node.appendChild(home);

    const items = () => group.prepared.map(key => group.items.filter(item => accItemKey(item) === key)[0]).filter(Boolean);

    // ONE TRANSACTION PER MAN, ONE AFTER ANOTHER. A man already closed is never sent
    // again - his state is read off the record - and a retry takes only the refused.
    function run(retry) {
        if (group.busy) return;
        const todo = items().filter(item => {
            const state = accItemState(item);
            return state !== 'done' && state !== 'early' && (!retry || state === 'refused');
        });
        if (todo.length === 0) { group.message = ACC_TEXT.batchNone; paint(); return; }
        group.busy = true;
        group.ran = true;
        group.message = '';
        let at = 0;
        const step = () => {
            if (at >= todo.length) { group.busy = false; group.progress = ''; render(); return; }
            const item = todo[at];
            at += 1;
            group.progress = `${ACC_TEXT.batchRunning} ${at} ${ACC_TEXT.groupOf} ${todo.length}…`;
            render();
            const plan = accPreparedPlan(item, group.paidAll);
            if (!plan.ok) {
                group.results[accItemKey(item)] = { state: 'refused', text: accRefusalText(plan.reasons[0]) };
                step();
                return;
            }
            let sent;
            try { sent = FarkadSync.transactPaybook(plan); } catch (error) { sent = Promise.reject(error); }
            Promise.resolve(sent).then(answer => answer, () => ({ ok: false, state: 'refused', reasons: ['server'] }))
                .then(answer => {
                    if (answer.ok && (answer.state === 'closed' || answer.state === 'done')) {
                        group.results[accItemKey(item)] = { state: 'done' };
                        step();
                        return;
                    }
                    const text = answer.state === 'stale' ? ACC_TEXT.stale
                        : (answer.state === 'unknown' ? ACC_TEXT.unknown : accServerText(answer.reasons));
                    group.results[accItemKey(item)] = { state: 'refused', text };
                    // IN DOUBT STOPS THE BATCH: until that one is settled every further
                    // closure is refused anyway, and nine refusals would bury the one line
                    // that matters.
                    if (answer.state === 'unknown') { group.busy = false; group.progress = ''; render(); return; }
                    step();
                });
        };
        step();
    }

    function paint() {
        accPaintBanner(banner);
        paidChoice.hidden = group.ran;
        said.textContent = group.paidAll ? ACC_TEXT.batchPaid : ACC_TEXT.batchUnpaid;
        said.hidden = group.ran;
        clear(table);
        const headRow = el('div', 'acc-table-row acc-table-head');
        [ACC_TEXT.colWage, ACC_TEXT.colAdvances, ACC_TEXT.colNet, ACC_TEXT.colPaid]
            .forEach(text => headRow.appendChild(el('span', null, text)));
        table.appendChild(headRow);
        const sums = { gross: [], advances: [], net: [], paid: [] };
        items().forEach(item => {
            const worker = State.worker(item.workerId);
            const state = accItemState(item);
            const done = state === 'done';
            const row = done ? closureHistory(State.schedule, { workerId: item.workerId })
                .filter(one => one.periodFrom === item.from)[0] : null;
            const plan = done ? null : accPreparedPlan(item, group.paidAll);
            const figures = done && row
                ? { gross: row.gross, advances: row.advanceDeducted, net: row.netDue, paid: row.paid }
                : (plan && plan.review ? { gross: plan.review.gross, advances: plan.review.advanceDeducted,
                    net: plan.review.netDue, paid: plan.review.paid } : null);
            const card = el('section', 'acc-table-card');
            card.dataset.worker = item.workerId;
            const head = el('div', 'acc-row-head');
            head.appendChild(el('strong', 'acc-name', worker ? isolate(worker.name) : ''));
            head.appendChild(el('span', 'acc-row-period', accPeriod(item.from, item.to)));
            if (group.ran || done) head.appendChild(accItemChip(item).chip);
            card.appendChild(head);
            if (figures) {
                const line = el('div', 'acc-table-row');
                [figures.gross, figures.advances, figures.net, figures.paid].forEach(value =>
                    line.appendChild(el('strong', 'acc-num', value === null || value === undefined ? '—' : accMoney(value))));
                card.appendChild(line);
                sums.gross.push(figures.gross || 0);
                sums.advances.push(figures.advances || 0);
                sums.net.push(figures.net || 0);
                sums.paid.push(figures.paid || 0);
            }
            const held = group.results[accItemKey(item)] || {};
            const why = !done && plan && !plan.ok ? accRefusalText(plan.reasons[0])
                : (state === 'refused' ? held.text || '' : '');
            if (why) card.appendChild(el('p', 'acc-error', why));
            if (!done) {
                card.appendChild(button(ACC_TEXT.openRow, 'btn-secondary',
                    () => accOpenReview(item.workerId, { from: item.from, to: item.to }, true)));
            }
            table.appendChild(card);
        });
        const total = el('div', 'acc-table-card acc-table-total');
        total.appendChild(el('strong', 'acc-name', ACC_TEXT.total));
        const totals = el('div', 'acc-table-row');
        // The model's own sum, in agorot: these four are never added to each other.
        [sums.gross, sums.advances, sums.net, sums.paid].forEach(values =>
            totals.appendChild(el('strong', 'acc-num', accMoney(paybookSum(values)))));
        total.appendChild(totals);
        table.appendChild(total);

        const refused = items().some(item => accItemState(item) === 'refused');
        go.hidden = group.ran;
        again.hidden = !group.ran || !refused || group.busy;
        home.hidden = !group.ran || group.busy;
        go.disabled = Boolean(group.busy);
        go.textContent = ACC_TEXT.batchConfirm;
        message.textContent = group.busy ? (group.progress || '') : (group.message || '');
        // ONE FILLED BUTTON: before the run it is the confirmation; after it, the retry
        // when something failed, and otherwise the way back.
        again.className = group.ran && refused ? 'acc-primary acc-retry' : 'btn-secondary acc-retry';
        home.className = group.ran && !refused ? 'acc-primary' : 'btn-secondary';
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- the history
function accDrawHistory(node) {
    const query = ACC.history;
    accHead(node, ACC_OWNER.history, null, () => accGo('list', { flash: '' }));
    const banner = accBanner();
    node.appendChild(banner);
    const text = document.createElement('input');
    text.type = 'search';
    text.className = 'acc-input acc-search';
    text.placeholder = ACC_TEXT.historySearch;
    text.setAttribute('aria-label', ACC_TEXT.historySearch);
    text.value = query.text;
    text.addEventListener('input', () => { query.text = text.value.trim(); paint(); });
    node.appendChild(text);
    node.appendChild(accChoice(ACC_TEXT.filterAll, [['all', ACC_TEXT.filterAll],
        ['weekly', ACC_TEXT.filterWeekly], ['biweekly', ACC_TEXT.filterBiweekly]], query.cycle,
        value => { query.cycle = value; paint(); }));
    const status = document.createElement('select');
    status.className = 'acc-input';
    status.setAttribute('aria-label', ACC_TEXT.statusFilter);
    [['', ACC_TEXT.statusAll], ['closed', PAYBOOK_STATUS_LABELS.closed], ['partial', PAYBOOK_STATUS_LABELS.partial],
        ['paid', PAYBOOK_STATUS_LABELS.paid], ['unknown', ACC_TEXT.statusUnknown], ['review', ACC_TEXT.statusReview]]
        .forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            status.appendChild(option);
        });
    status.value = query.status;
    status.addEventListener('change', () => { query.status = status.value; paint(); });
    node.appendChild(accField(ACC_TEXT.statusFilter, status));
    const dates = el('details', 'acc-days acc-date-filters');
    dates.appendChild(el('summary', null, ACC_TEXT.dateFilters));
    [['closedFrom', ACC_TEXT.closedFrom], ['closedTo', ACC_TEXT.closedTo],
        ['periodFrom', ACC_TEXT.periodFrom], ['periodTo', ACC_TEXT.periodTo]].forEach(([key, label]) => {
        const input = accDateInput(label, query[key]);
        input.dataset.key = key;
        input.addEventListener('change', () => { query[key] = input.value; paint(); });
        input.addEventListener('input', () => { query[key] = input.value; paint(); });
        dates.appendChild(accField(label, input));
    });
    dates.open = Boolean(query.closedFrom || query.closedTo || query.periodFrom || query.periodTo);
    node.appendChild(dates);
    const list = el('div', 'acc-list');
    node.appendChild(list);

    function paint() {
        accPaintBanner(banner);
        const want = {};
        if (query.text) want.text = query.text;
        if (query.cycle !== 'all') want.cycle = query.cycle;
        ['closedFrom', 'closedTo', 'periodFrom', 'periodTo'].forEach(key => { if (query[key]) want[key] = query[key]; });
        let rows = closureHistory(State.schedule, want);
        // «שולם» and «נסגר» mean the same to a person whether the closure has a statement
        // or the owner answered for an older one.
        if (query.status === 'paid') rows = rows.filter(row => row.status === 'paid' || row.status === 'legacy-paid');
        else if (query.status) rows = rows.filter(row => row.status === query.status);
        clear(list);
        rows.forEach(row => {
            const card = button('', 'acc-row acc-history-row', () => accGo('statement',
                { statement: { workerId: row.workerId, periodFrom: row.periodFrom, back: 'history' } }));
            card.dataset.worker = row.workerId;
            card.dataset.from = row.periodFrom;
            const head = el('span', 'acc-row-head');
            head.appendChild(el('strong', 'acc-name', isolate(row.name)));
            head.appendChild(accCycleMark(row.cycle));
            head.appendChild(accChip(row.status));
            card.appendChild(head);
            const main = el('span', 'acc-row-main');
            main.appendChild(el('strong', 'acc-num acc-row-wage', row.netDue === null ? '—' : accMoney(row.netDue)));
            main.appendChild(el('span', 'acc-row-period', accPeriod(row.periodFrom, row.periodTo)));
            card.appendChild(main);
            if (row.closedOn) {
                card.appendChild(el('span', 'acc-hint', `${ACC_TEXT.closedOn}${isolateLtr(accDay(row.closedOn))}`));
            }
            list.appendChild(card);
        });
        if (rows.length === 0) list.appendChild(emptyHint(ACC_TEXT.historyEmpty));
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- one closure, in full
function accStatementRow(at) {
    return at ? closureHistory(State.schedule, { workerId: at.workerId })
        .filter(row => row.periodFrom === at.periodFrom)[0] || null : null;
}

function accVoidOf(id) {
    const entry = (State.schedule.pay || {})[paybookVoidId(id)];
    return entry && entry.kind === 'void' ? entry : null;
}

function accDrawStatement(node) {
    const at = ACC.statement;
    const first = accStatementRow(at);
    if (!at || !first) { accGo('history'); return; }
    const leave = () => accGo(at.back === 'group' ? 'group' : 'history', { flash: '' });
    const sub = el('p', 'acc-sub');
    sub.appendChild(el('strong', 'acc-name', isolate(first.name)));
    sub.appendChild(accCycleMark(first.cycle));
    sub.appendChild(el('span', 'acc-row-period', first.periodTo
        ? dateRange(accDay(first.periodFrom), accDay(first.periodTo)) : accDay(first.periodFrom)));
    accHead(node, ACC_OWNER.closure, sub, leave);
    const banner = accBanner();
    node.appendChild(banner);
    const body = el('div', 'acc-statement');
    node.appendChild(body);

    function paint() {
        accPaintBanner(banner);
        const row = accStatementRow(at);
        if (!row) return;
        clear(body);
        const top = el('div', 'acc-row-head');
        top.appendChild(accChip(row.status));
        if (row.closedOn) top.appendChild(el('span', 'acc-hint', `${ACC_TEXT.closedOn}${isolateLtr(accDay(row.closedOn))}`));
        body.appendChild(top);
        if (row.status === 'unknown') body.appendChild(el('p', 'acc-note acc-note-warn', ACC_TEXT.legacyUnknown));

        const sums = el('div', 'acc-result');
        sums.appendChild(accLine(ACC_TEXT.gross, row.gross === null ? '—' : accMoney(row.gross), 'acc-line-strong', 'gross'));
        sums.appendChild(accLine(ACC_TEXT.advanceDeducted, accMoney(-row.advanceDeducted || 0), '', 'advances'));
        if (row.extraDeducted > 0) sums.appendChild(accLine(ACC_TEXT.extrasTitle, accMoney(-row.extraDeducted), '', 'extras'));
        sums.appendChild(accLine(ACC_TEXT.netDue, row.netDue === null ? '—' : accMoney(row.netDue), 'acc-line-net', 'net'));
        body.appendChild(sums);

        // THE DETAIL. Balances never wait for it; the day list does. When the entries are
        // not on this phone the page says so and shows NO day list - never a live one in
        // its place, which would be today's days under a closed wage.
        const worker = State.worker(row.workerId);
        const detail = row.statementId ? paybookDetail(State.schedule, ACC.closed, row.statementId) : { state: 'record' };
        if (detail.state === 'absent') {
            body.appendChild(el('p', 'acc-note', ACC_TEXT.detailAbsent));
            accFetchClosed(row.statementId);
        } else if (worker && row.periodTo && detail.state === 'record') {
            const days = workerDaysReport(State.schedule, worker, row.periodFrom, row.periodTo);
            const fold = el('details', 'acc-days');
            fold.appendChild(el('summary', null, `${ACC_TEXT.dayList} (${days.filter(day => !day.absent).length})`));
            days.forEach(day => {
                const names = day.absent ? ACC_TEXT.absent : (day.entries || []).map(one => {
                    const place = State.place ? State.place(one.placeId) : null;
                    return place ? place.name : '';
                }).join(' + ');
                fold.appendChild(accLine(`${accShort(day.date)} · ${names}`,
                    day.amount === null || day.amount === undefined ? '' : accMoney(day.amount), 'acc-day'));
            });
            body.appendChild(fold);
        }

        body.appendChild(el('h3', 'acc-h3', ACC_TEXT.advancesTitle));
        if (row.advanceDeductions.length === 0) body.appendChild(emptyHint(ACC_TEXT.noAdvances));
        const given = currentAdvances(State.schedule);
        // Oldest advance first, as the review page listed them when they were answered.
        const dated = id => String((given[id] || {}).date || '');
        row.advanceDeductions.slice().sort((x, y) => (dated(x.advanceId) < dated(y.advanceId) ? -1
            : (dated(x.advanceId) > dated(y.advanceId) ? 1 : (x.advanceId < y.advanceId ? -1 : 1)))).forEach(one => {
            const card = el('div', 'acc-adv');
            const of = given[one.advanceId];
            card.appendChild(el('p', 'acc-adv-info', of
                ? `${accDay(of.date)} · ${ACC_TEXT.advanceGiven} ${accMoney(advanceOutstanding(State.schedule, one.advanceId).given)}` : ''));
            card.dataset.advance = one.advanceId;
            card.appendChild(accLine(ACC_TEXT.deducted, accMoney(one.amount), '', 'deducted'));
            if (one.after !== null) card.appendChild(accLine(ACC_TEXT.leftThen, accMoney(one.after), '', 'left-then'));
            card.appendChild(accLine(ACC_TEXT.leftNow, accMoney(one.leftNow), '', 'left-now'));
            if (one.reversed > 0) card.appendChild(accLine(ACC_TEXT.voided, accMoney(one.reversed)));
            body.appendChild(card);
        });

        if (row.extras.length > 0) body.appendChild(el('h3', 'acc-h3', ACC_TEXT.extrasTitle));
        row.extras.forEach(extra => {
            const card = el('div', 'acc-adv');
            const kind = { agreed: ACC_TEXT.categoryAgreed, settlement: ACC_TEXT.categorySettlement,
                other: ACC_TEXT.categoryOther }[extra.category] || '';
            card.appendChild(accLine(`${kind} · ${extra.reason}`, accMoney(extra.amount)));
            accVoidLine(card, extra.id, row);
            body.appendChild(card);
        });

        body.appendChild(el('h3', 'acc-h3', ACC_TEXT.payments));
        if (row.payments.length === 0) body.appendChild(emptyHint(ACC_TEXT.noPayments));
        row.payments.forEach(payment => {
            const card = el('div', 'acc-adv');
            const how = payment.method === 'transfer' ? ACC_TEXT.methodTransfer
                : (payment.method === 'cash' ? ACC_TEXT.methodCash : '');
            card.dataset.payment = payment.id;
            card.appendChild(accLine(`${accDay(payment.date)}${how ? ' · ' + how : ''}`, accMoney(payment.amount)));
            accVoidLine(card, payment.id, row);
            body.appendChild(card);
        });

        if (row.adjustments.length > 0) body.appendChild(el('h3', 'acc-h3', ACC_TEXT.corrections));
        row.adjustments.forEach(one => {
            const card = el('div', 'acc-adv');
            card.appendChild(accLine(`${accDay(one.date)} · ${one.reason}`, accMoney(one.delta)));
            body.appendChild(card);
        });

        if (row.owed !== null) {
            const end = el('div', 'acc-result acc-after');
            end.appendChild(accLine(ACC_TEXT.owed, accMoney(row.owed), '', 'owed'));
            end.appendChild(accLine(ACC_TEXT.paidSoFar, accMoney(row.paid), '', 'paid'));
            end.appendChild(accLine(ACC_OWNER.wageDue, accMoney(row.due), 'acc-line-strong acc-sum-due', 'due'));
            if (row.debtAfter !== null) end.appendChild(accLine(ACC_TEXT.debtAfter, accMoney(row.debtAfter)));
            body.appendChild(end);
        }

        const actions = el('div', 'acc-actions');
        const target = row.statementId || (row.status === 'legacy-due' ? paybookLegacyId(row.artifactId) : null);
        if (target && row.due > 0) {
            actions.appendChild(accPrimary(ACC_OWNER.payment, () => accOpenPay(row.workerId, target, 'statement')));
        }
        if (row.statementId) {
            actions.appendChild(button(ACC_TEXT.adjustAction, 'btn-secondary acc-adjust', () => accGo('correct',
                { correct: { mode: 'adjust', statementId: row.statementId, sign: 1, amountText: '', reason: '',
                    busy: false, message: '', attempted: false } })));
        }
        if (row.status === 'unknown' && row.artifactId) {
            actions.appendChild(button(ACC_TEXT.legacyTitle, 'btn-secondary', () => accGo('legacy')));
        }
        body.appendChild(actions);
    }
    ACC.live = paint;
    paint();
}

// A correction is shown UNDER what it corrects, and what it corrects stays readable: the
// void's amount and reason beside the original, or the button that would write one.
function accVoidLine(card, id, row) {
    const made = accVoidOf(id);
    if (made) {
        card.classList.add('acc-voided');
        card.appendChild(el('p', 'acc-hint', `${ACC_TEXT.voided} ${accMoney(made.amount)} · ${accDay(made.date)} · ${made.reason}`));
        return;
    }
    if (!row.statementId && row.status !== 'legacy-due') return;
    card.appendChild(button(ACC_TEXT.voidAction, 'btn-secondary acc-void', () => accGo('correct',
        { correct: { mode: 'void', targetId: id, reason: '', busy: false, message: '', attempted: false } })));
}

function accFetchClosed(id) {
    const sync = typeof FarkadSync !== 'undefined' ? FarkadSync : null;
    if (!sync || !sync.adapter || typeof sync.adapter.readClosed !== 'function' || ACC.closed['?' + id]) return;
    ACC.closed['?' + id] = true;
    Promise.resolve(sync.adapter.readClosed(id)).then(doc => {
        if (doc && paybookClosedProblems(id, doc).length === 0) { ACC.closed[id] = doc; render(); }
    }, () => { delete ACC.closed['?' + id]; });
}

// ---------------------------------------------------------------- a correction, linked
function accDrawCorrect(node) {
    const form = ACC.correct;
    if (!form) { accGo('history'); return; }
    const voiding = form.mode === 'void';
    accHead(node, voiding ? ACC_TEXT.voidAction : ACC_TEXT.adjustAction, null, () => accGo('statement'));
    const banner = accBanner();
    node.appendChild(banner);
    node.appendChild(el('p', 'acc-note', ACC_TEXT.correctionLead));
    const amountError = accError('');
    if (!voiding) {
        node.appendChild(accChoice(ACC_TEXT.adjustAction, [['1', ACC_TEXT.adjustAdd], ['-1', ACC_TEXT.adjustSub]],
            String(form.sign), value => { form.sign = Number(value); paint(); }));
        const amount = accInput(ACC_TEXT.adjustAmount, form.amountText);
        amount.addEventListener('input', () => { form.amountText = amount.value; paint(); });
        node.appendChild(accField(ACC_TEXT.adjustAmount, amount));
        node.appendChild(amountError);
    }
    const label = voiding ? ACC_TEXT.voidReason : ACC_TEXT.adjustReason;
    const reason = accInput(label, form.reason, 'text');
    reason.maxLength = 300;
    reason.addEventListener('input', () => { form.reason = reason.value; paint(); });
    node.appendChild(accField(label, reason));
    const reasonError = accError('');
    node.appendChild(reasonError);
    const after = accLine(ACC_OWNER.wageDue, '', '', 'after');
    node.appendChild(after);
    const message = accError('');
    message.classList.add('acc-message');
    node.appendChild(message);

    const planNow = () => {
        const stamp = accStamp();
        if (voiding) return planVoid(State.schedule, form.targetId, { reason: form.reason }, stamp);
        const typed = accParse(form.amountText);
        return planAdjustment(State.schedule, form.statementId,
            typed.value === undefined ? 0 : form.sign * typed.value, { reason: form.reason }, stamp);
    };
    const save = accPrimary(ACC_TEXT.saveCorrection, () => {
        form.attempted = true;
        const plan = planNow();
        if (plan.ok && plan.already) { accGo('statement', { flash: ACC_TEXT.payAlready }); return; }
        if (!plan.ok) {
            form.message = plan.reasons.filter(code => ['reason', 'delta', 'below-zero'].indexOf(code) === -1)
                .map(accRefusalText)[0] || ACC_TEXT.fixFirst;
            paint();
            return;
        }
        accSend(plan, form, () => accGo('statement', { flash: ACC_TEXT.correctionDone, correct: null }));
    });
    node.appendChild(save);

    function paint() {
        accPaintBanner(banner);
        const plan = planNow();
        reasonError.textContent = form.attempted && plan.reasons.indexOf('reason') !== -1 ? ACC_REFUSALS.reason : '';
        amountError.textContent = plan.reasons.indexOf('below-zero') !== -1 ? ACC_REFUSALS['below-zero']
            : (form.attempted && plan.reasons.indexOf('delta') !== -1 ? ACC_REFUSALS.delta : '');
        after.lastChild.textContent = plan.ok && !plan.already && plan.dueAfter !== undefined ? accMoney(plan.dueAfter) : '—';
        message.textContent = form.message || '';
        accPaintBusy(save, form, ACC_TEXT.saveCorrection);
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- the first run
//
// One sentence, one day, one button. The day is the first day of the fortnight that
// contains today: every man's own period containing it is then inside tracking, weekly
// or not.
function accDrawOpening(node) {
    const form = ACC.opening || (ACC.opening = { date: periodRangeFor({}, todayStr()).from,
        busy: false, message: '', attempted: false });
    accHead(node, ACC_TEXT.title, null, null);
    const banner = accBanner();
    node.appendChild(banner);
    node.appendChild(el('p', 'acc-note', ACC_TEXT.openingLead));
    const date = accDateInput(ACC_TEXT.openingDay, form.date, todayStr());
    date.addEventListener('change', () => { form.date = date.value; paint(); });
    node.appendChild(accField(ACC_TEXT.openingDay, date));
    const echo = el('p', 'acc-hint');
    node.appendChild(echo);
    const carry = el('div', 'acc-carry-slot');
    node.appendChild(carry);
    const message = accError('');
    message.classList.add('acc-message');
    node.appendChild(message);
    const go = accPrimary(ACC_TEXT.openingConfirm, () => {
        form.attempted = true;
        const plan = planOpening(State.schedule, form.date, accStamp());
        if (plan.ok && plan.already) { accGo('list', { flash: ACC_TEXT.openingDone }); return; }
        if (!plan.ok) {
            // The carry approval has its own box, sentence and button right above.
            const other = plan.reasons.filter(code => code !== 'carry-approval-needed')[0];
            form.message = other ? accRefusalText(other) : '';
            paint();
            return;
        }
        accSend(plan, form, () => accGo('list', { flash: ACC_TEXT.openingDone, opening: null }));
    });
    node.appendChild(go);
    const advances = button(ACC_TEXT.advances, 'btn-secondary', () => {
        // The advances themselves stay reachable before anybody has activated anything:
        // the first man on the roster's page, from which every other is one tap back.
        const first = (State.schedule.workers || [])[0];
        if (first) showWorkerAdvances(first.id);
        else { form.message = ACC_TEXT.notFound; paint(); }
    });
    node.appendChild(advances);

    function paint() {
        if (paybookFold(State.schedule).opening) { accGo('list', { opening: null }); return; }
        accPaintBanner(banner);
        const parsed = parseLocalDate(form.date);
        echo.textContent = parsed ? `${hebrewDayName(parsed)}, ${formatFullDate(parsed)}` : '';
        const plan = planOpening(State.schedule, form.date, accStamp());
        clear(carry);
        if (plan.reasons.indexOf('carry-approval-needed') !== -1) carry.appendChild(accCarryBox(form));
        message.textContent = form.message || '';
        accPaintBusy(go, form, ACC_TEXT.openingConfirm);
    }
    ACC.live = paint;
    paint();
}

// The older closures nobody recorded a payment for. Each is answered in one tap, or left;
// nothing here blocks the daily list, and «לא ידוע» writes nothing at all.
function accDrawLegacy(node) {
    const form = ACC.legacy || (ACC.legacy = { busy: false, message: '', due: {}, dueText: {} });
    accHead(node, ACC_TEXT.legacyTitle, null, () => accGo('list', { flash: '' }));
    const banner = accBanner();
    node.appendChild(banner);
    node.appendChild(el('p', 'acc-note', ACC_TEXT.legacyLead));
    const message = accError('');
    message.classList.add('acc-message');
    node.appendChild(message);
    const list = el('div', 'acc-list');
    node.appendChild(list);

    const answer = (row, said) => {
        const plan = planLegacy(State.schedule, row.workerId, row.periodFrom, said, accStamp());
        if (plan.ok && plan.already) { paint(); return; }
        if (!plan.ok) { form.message = accRefusalText(plan.reasons[0]); paint(); return; }
        accSend(plan, form, () => { ACC.flash = ACC_TEXT.legacyDone; render(); });
    };

    let drawn = null;
    function paint() {
        accPaintBanner(banner);
        message.textContent = form.busy ? ACC_TEXT.busy : (form.message || '');
        const rows = accLegacyRows();
        const key = rows.map(row => row.artifactId + (form.due[row.artifactId] ? '+' : '')
            + (ACC.legacyLeft[row.artifactId] ? '-' : '')).join('|') + (form.busy ? '!' : '');
        if (key === drawn) return;
        drawn = key;
        clear(list);
        if (rows.length === 0) list.appendChild(emptyHint(ACC_TEXT.legacyEmpty));
        rows.forEach(row => {
            const card = el('section', 'acc-row' + (ACC.legacyLeft[row.artifactId] ? ' acc-row-quiet' : ''));
            card.dataset.artifact = row.artifactId;
            const head = el('div', 'acc-row-head');
            head.appendChild(el('strong', 'acc-name', isolate(row.name)));
            head.appendChild(el('span', 'acc-row-period', accPeriod(row.periodFrom, row.periodTo)));
            card.appendChild(head);
            card.appendChild(accLine(ACC_TEXT.netDue, row.net === null ? '—' : accMoney(row.net), 'acc-line-strong'));
            const actions = el('div', 'acc-row-actions');
            const paid = button(ACC_TEXT.legacyPaid, 'btn-secondary', () => answer(row, { state: 'paid' }));
            const due = button(ACC_TEXT.legacyDue, 'btn-secondary', () => { form.due[row.artifactId] = true; paint(); });
            const leave = button(ACC_TEXT.legacyLeave, 'btn-secondary', () => {
                ACC.legacyLeft[row.artifactId] = true;
                delete form.due[row.artifactId];
                paint();
            });
            [paid, due, leave].forEach(one => { one.disabled = Boolean(form.busy); actions.appendChild(one); });
            card.appendChild(actions);
            if (form.due[row.artifactId]) {
                const input = accInput(ACC_TEXT.legacyDueAmount, form.dueText[row.artifactId] || '');
                input.addEventListener('input', () => { form.dueText[row.artifactId] = input.value; });
                const line = el('div', 'acc-adv-line');
                line.appendChild(accField(ACC_TEXT.legacyDueAmount, input));
                line.appendChild(button(ACC_TEXT.legacySave, 'btn-secondary', () => {
                    const typed = accParse(form.dueText[row.artifactId]);
                    answer(row, { state: 'due', due: typed.value === undefined ? null : typed.value });
                }));
                card.appendChild(line);
            }
            list.appendChild(card);
        });
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- «לבדיקה»: what to look at
//
// A man reads «לבדיקה» when something of his is held, disputed or over-settled, and until
// Phase 5 nothing said what. This page SHOWS it - both bodies of a disagreement side by
// side, which one every phone counts, each entry the fold holds out and why it has no
// place, and what was paid beyond what was owed.
//
// IT DOES NOT SETTLE ANYTHING, and says so. Choosing between two bodies is a new record
// (a void or an adjustment beside the one that stands, and the retirement of the other),
// and that is a model change this phase does not make. Every figure here is the model's.
function accEntryLines(card, entry) {
    if (!entry || typeof entry !== 'object') return;
    const kinds = { statement: ACC_OWNER.closure, payment: ACC_TEXT.kindPayment, deduction: ACC_TEXT.kindDeduction,
        'void': ACC_TEXT.voidAction, adjustment: ACC_TEXT.adjustAction, legacy: ACC_TEXT.kindLegacy,
        opening: ACC_TEXT.openingDay };
    card.appendChild(el('strong', 'acc-look-kind', kinds[String(entry.kind)] || String(entry.kind || '')));
    const sum = ['amount', 'netDue', 'delta', 'due'].filter(key => typeof entry[key] === 'number')[0];
    if (sum) card.appendChild(accLine(ACC_TEXT.lookAmount, accMoney(entry[sum])));
    if (typeof entry.date === 'string') card.appendChild(accLine(ACC_TEXT.lookDate, accDay(entry.date)));
    if (typeof entry.by === 'string') card.appendChild(accLine(ACC_TEXT.lookBy, entry.by));
}

function accDrawLook(node) {
    const form = ACC.look;
    const worker = form && State.worker(form.workerId);
    if (!form || !worker) { accGo('list'); return; }
    const sub = el('p', 'acc-sub');
    sub.appendChild(el('strong', 'acc-name', isolate(worker.name)));
    accHead(node, ACC_TEXT.statusReview, sub, () => accGo('list'));
    const banner = accBanner();
    node.appendChild(banner);
    const body = el('div', 'acc-look-body');
    node.appendChild(body);

    function paint() {
        accPaintBanner(banner);
        clear(body);
        const account = accountFor(State.schedule, worker, todayStr());
        const book = State.schedule.pay || {};
        const beside = State.schedule.payConflicted || {};
        const any = account.conflicts.length > 0 || account.held.length > 0 || account.wageOverpaid > 0
            || overpaidAdvances(State.schedule, worker.id).length > 0;
        if (!any) { body.appendChild(emptyHint(ACC_TEXT.lookNothing)); return; }
        body.appendChild(el('p', 'acc-note acc-note-warn', ACC_TEXT.lookLead));
        account.conflicts.forEach(row => {
            const card = el('section', 'acc-look acc-look-conflict');
            card.dataset.entry = row.id;
            card.appendChild(el('h3', 'acc-h3', ACC_TEXT.lookConflict));
            const counted = el('div', 'acc-look-side acc-look-counted');
            counted.appendChild(el('p', 'acc-hint', ACC_TEXT.lookCounted));
            accEntryLines(counted, book[row.id]);
            card.appendChild(counted);
            const others = Array.isArray(beside[row.id]) ? beside[row.id] : [beside[row.id]];
            others.forEach(other => {
                const side = el('div', 'acc-look-side acc-look-beside');
                side.appendChild(el('p', 'acc-hint', ACC_TEXT.lookBeside));
                accEntryLines(side, other);
                card.appendChild(side);
            });
            body.appendChild(card);
        });
        account.held.forEach(row => {
            const card = el('section', 'acc-look acc-look-held');
            card.dataset.entry = row.id;
            card.appendChild(el('h3', 'acc-h3', ACC_TEXT.lookHeld));
            accEntryLines(card, book[row.id]);
            card.appendChild(el('p', 'acc-hint acc-look-id', String(row.id)));
            body.appendChild(card);
        });
        if (account.wageOverpaid > 0) {
            const card = el('section', 'acc-look acc-look-overpaid');
            card.appendChild(accLine(ACC_TEXT.lookOverpaid, accMoney(account.wageOverpaid), 'acc-line-strong'));
            body.appendChild(card);
        }
        overpaidAdvances(State.schedule, worker.id).forEach(row => {
            const card = el('section', 'acc-look acc-look-advance');
            card.appendChild(accLine(ACC_TEXT.lookOverpaidAdvance, accMoney(row.overpaid), 'acc-line-strong'));
            body.appendChild(card);
        });
        body.appendChild(el('p', 'acc-hint acc-look-nofix', ACC_TEXT.lookNoFix));
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- the archive
//
// WHAT WOULD MOVE, READ BEFORE ANYTHING MOVES - and then the move. The page is the
// model's dry run (planArchive): every closed period with whether it may leave the live
// record for the archive on the server, and if not, why; how large the server's record
// is and how large it would be. «העבר לארכיון» hands the ready ones to
// FarkadSync.archiveClosed, which copies, reads back, compares and only then drops - and
// can be pressed again after any interruption: it continues from what the server holds.
//
// Nothing here is a closure and nothing here changes a figure: the phone keeps every
// entry. Sizes are the model's byte counts, shown in whole kilobytes.
function accArchiveWord(reasons) {
    const code = (reasons || [])[0];
    const words = { offline: ACC_TEXT.archiveOffline, differs: ACC_TEXT.archiveDiffers,
        'copy-differs': ACC_TEXT.archiveCopyDiffers, row: ACC_TEXT.archiveCopyDiffers, server: ACC_TEXT.archiveServer,
        busy: ACC_TEXT.archiveBusy, waiting: ACC_TEXT.closedWaiting, gate: ACC_REFUSALS.gate };
    return Object.prototype.hasOwnProperty.call(words, code) ? words[code] : accServerText(reasons);
}

function accDrawArchive(node) {
    const form = ACC.archive || (ACC.archive = { busy: false, message: '', moved: null });
    accHead(node, ACC_TEXT.archiveEntry, null, () => accGo('list', { archive: null }));
    const banner = accBanner();
    node.appendChild(banner);
    node.appendChild(el('p', 'acc-hint acc-archive-lead', ACC_TEXT.archiveLead));
    const sizes = el('div', 'acc-result acc-archive-sizes');
    const now = accLine(ACC_TEXT.archiveSizeNow, '', '', 'size-now');
    const then = accLine(ACC_TEXT.archiveSizeAfter, '', '', 'size-after');
    sizes.appendChild(now);
    sizes.appendChild(then);
    node.appendChild(sizes);
    const message = accError('');
    message.classList.add('acc-message');
    const list = el('div', 'acc-archive-list');
    node.appendChild(list);
    node.appendChild(message);
    const run = accPrimary(ACC_TEXT.archiveRun, () => {
        if (form.busy) return;
        form.busy = true;
        form.message = '';
        form.moved = null;
        paint();
        const done = answer => {
            form.busy = false;
            form.moved = answer && Array.isArray(answer.moved) ? answer.moved.length : 0;
            if (!answer || answer.state === 'refused') form.message = accArchiveWord(answer ? answer.reasons : ['server']);
            else if (answer.failed.length > 0) {
                form.message = `${accArchiveWord([answer.failed[0].reason])} ${ACC_TEXT.archiveStopped}`;
            }
            render();
        };
        let sent;
        try { sent = FarkadSync.archiveClosed({ today: todayStr() }); } catch (error) { sent = Promise.reject(error); }
        Promise.resolve(sent).then(done, () => done({ state: 'refused', reasons: ['server'], moved: [], failed: [] }));
    });
    node.appendChild(run);

    const kb = bytes => `${Math.ceil(bytes / 1024).toLocaleString('en-US')} KB`;
    const why = { owed: ACC_TEXT.whyOwed, unanswered: ACC_TEXT.statusUnknown, overpaid: ACC_TEXT.lookOverpaid,
        disputed: ACC_TEXT.statusReview, corrected: ACC_TEXT.whyCorrected, irregular: ACC_TEXT.whyIrregular };
    function paint() {
        accPaintBanner(banner);
        const drawn = planArchive(State.schedule, todayStr());
        const totals = drawn.totals;
        now.lastChild.textContent = `${kb(totals.liveBytes)} ${ACC_TEXT.groupOf} ${kb(totals.limitBytes)}`;
        then.lastChild.textContent = kb(totals.liveBytesAfter);
        then.hidden = totals.ready === 0;
        clear(list);
        [['ready', ACC_TEXT.archiveReady], ['held', ACC_TEXT.archiveHeld], ['archived', ACC_TEXT.archiveDone]].forEach(([state, title]) => {
            const rows = drawn.bundles.filter(bundle => bundle.state === state);
            if (rows.length === 0) return;
            const group = el('section', 'acc-archive-group acc-archive-' + state);
            group.appendChild(el('h3', 'acc-h3', `${title} (${rows.length})`));
            rows.forEach(bundle => {
                const line = el('div', 'acc-archive-row');
                line.dataset.row = bundle.rowId || '';
                line.appendChild(el('strong', 'acc-name', isolate(bundle.name)));
                line.appendChild(el('span', 'acc-row-period', accPeriod(bundle.periodFrom, bundle.periodTo || bundle.periodFrom)));
                if (state === 'held') line.appendChild(el('span', 'acc-hint acc-archive-why', why[bundle.why] || ''));
                group.appendChild(line);
            });
            list.appendChild(group);
        });
        if (totals.ready === 0 && !form.busy && form.moved === null) list.appendChild(emptyHint(ACC_TEXT.archiveNone));
        if (form.moved !== null && form.moved > 0) {
            list.insertBefore(el('p', 'acc-note acc-note-ok acc-archive-moved', `${ACC_TEXT.archiveMoved}: ${form.moved}`), list.firstChild);
        }
        message.textContent = form.message || '';
        run.textContent = form.busy ? ACC_TEXT.archiveRunning : ACC_TEXT.archiveRun;
        run.disabled = Boolean(form.busy);
        run.setAttribute('aria-busy', form.busy ? 'true' : 'false');
        run.hidden = totals.ready === 0 && !form.busy;
    }
    ACC.live = paint;
    paint();
}

// ---------------------------------------------------------------- «נסגר» on «לפי עובד»
//
// The owner's answer of 2026-11-10: the old report is not restructured; a week of a
// weekly man that has been closed is MARKED «נסגר» - his word, the model's label. The
// weekly breakdown has just appended one line per week; the mark goes on the lines of the
// weeks that are whole and closed, and on nothing else. Called from one guarded line in
// js/ui/reports.js, so with the gate shut that report is what it was.
function accountsMarkClosedWeeks(fold, workerId, weeks) {
    if (!accountsOpen() || !fold || !Array.isArray(weeks)) return;
    const lines = [...fold.querySelectorAll('.report-weekly-line')].slice(-weeks.length);
    weeks.forEach((week, at) => {
        const line = lines[at];
        if (!line || !week.whole || frozenPeriodFor(State.schedule, workerId, week.from, week.to) === undefined) return;
        line.classList.add('report-weekly-closed');
        const when = line.querySelector('.report-weekly-when');
        (when || line).appendChild(el('span', 'acc-chip acc-chip-closed report-weekly-mark', PAYBOOK_STATUS_LABELS.closed));
    });
}
