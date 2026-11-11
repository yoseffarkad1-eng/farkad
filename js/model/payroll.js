// Worker accounts: what a man is owed, what was closed, and what actually reached him.
//
// SHIPPED SHUT (v173). The file is loaded - index.html, after model/ledger.js and above
// the sync group, because reading the queue at load reaches payEntryProblems - and the
// record it describes is stored, merged, backed up and sent like the ledger. What is NOT
// on is the writer: FARKAD_FLAGS.paybook is false, so every planner here refuses with
// `gate` and State.commitPaybook refuses whatever reaches it. A phone on this build keeps
// a pay book it is handed and never starts one. There is still no screen.
//
// It is the pure half: every function here takes a schedule and hands back plain data,
// and none of them touches the DOM, Store, the journal or a clock. The half that writes is
// State.commitPaybook (js/state.js); the half that merges calls paybookUnion below from
// the three doors a document arrives by. docs/payroll-closure.md has both phases as built.
//
// ---------------------------------------------------------------- why
//
// The app already closes a period: js/model/ledger.js freezes the payslip
// (`le_period_<worker>_<from>`) and writes what came off each advance
// (`le_close_<advance>_<from>`). What it cannot say is the thing a man asks on a Thursday:
// was I paid. A closure records what was DEDUCTED and never what was HANDED OVER, so a
// wage of 3,000 with 2,000 in the envelope reads exactly like a wage of 3,000 paid in full,
// and the 1,000 lives in somebody's memory. Measured on bd59a68 by the audit's probe 2: no
// entry kind, no field and no figure anywhere for wage owed to the worker.
//
// And one rule the owner states as iron is not met on the sheet he reads today: a man
// settled every Thursday whose first week is CLOSED still shows both weeks added together
// when the report is opened on the fortnight - 3,800 where his running account is 2,000.
// tests/payroll.test.mjs pins that present behaviour in its Phase 0 section, so the change
// to it is deliberate when it comes.
//
// ---------------------------------------------------------------- the records
//
// A closure stays what it is. The artifact and the `deducted` entries are written by the
// writers that already exist, in the shape every phone in the field already reads; the
// only thing that changes about them is WHO chooses the split - the person, per advance,
// instead of the app, oldest first.
//
// Everything new lives in ONE new append-only map at the top of the document:
//
//      schedule.pay = { "<id>": entry }            one field path per entry: pay.<id>
//
// Top level, not `ledger.advances` and not a new family under `ledger`, because of what a
// phone that has not updated does with each (measured, audit probe 3): an unknown KIND in
// ledger.advances is held unreadable and blocks that phone's writes; an unknown FAMILY
// under ledger is carried once and, the moment it grows, reported as a conflict on the
// whole family - and blocks that phone's writes. An unknown top-level key is dropped from
// that phone's own copy and never removed from the cloud by an ordinary edit. That is the
// exposure the Rima count had and it is closed the same way: by a rollout rule first and a
// protocol gate after.
//
// The laws are the ledger's: an entry is created once, never edited, never deleted, merged
// by union; the same id carrying the same money with a different signer is ONE fact, and
// the same id carrying different money is a disagreement nobody but a person may settle.
//
//   statement   ps_<worker>_<YYYYMMDD from>        the closure, for the wage: net due
//   deduction   pd_<worker>_<YYYYMMDD from>_<n>    money off the wage that is NOT an advance
//   payment     pp_<random> | pp_<statementId>     money that actually reached the man
//   void        pv_<targetId>                      a payment or deduction recorded in error
//   adjustment  pa_<statementId>_<n>               a closed net that was wrong, said beside it
//   opening     po_open                            the day account tracking begins
//   legacy      pl_<artifactId>                    the owner's word on an older closure
//
// ---------------------------------------------------------------- one calculator
//
// No wage is computed in this file. Every wage figure is payrollReport's row over a period
// that periodRangeFor names, and a closed period is the artifact payrollReport already
// reads. A second sum, however careful, is a second answer to "what is he owed" - and the
// day the two differ by an agora, one of them is on a payslip.
//
// ---------------------------------------------------------------- the owner's defaults
//
// Eight questions are still his to answer. Each has a default here and each is ONE line to
// flip; nothing else in the file spells any of them out a second time.
const PAYBOOK_RULES = Object.freeze({
    // (1) A weekly man's running account is his open week and nothing else - in THIS file.
    // The existing «לפי עובד» report still adds the weeks of whatever range it is opened
    // on. Nothing in this phase reads this flag: it is the switch the reports change will
    // read, written down here so the decision has one name. See the Phase 0 pin.
    legacyReportFollowsAccounts: false,

    // (2) An earlier period that was never closed is listed apart, each with its own
    // amount. True would add them into the running figure, which is the 3,800 again.
    earlierUnclosedSummed: false,

    // (3) An account may be closed with nothing handed over yet; the net waits in
    // «יתרת שכר לתשלום». False refuses a closure that names no payment.
    closeWithNothingPaid: true,

    // (4) A period may not be closed before its last day. A day added on the Wednesday of
    // a week frozen on the Tuesday is a day outside every payslip.
    closeBeforeLastDay: false,

    // (5) Advance and extra deductions together may not exceed the period's wage; what is
    // left of the debt carries. True would let a net go below zero.
    deductionsMayExceedWage: false,

    // (6) An advance dated after the period's last day is shown and not offered. Flipping
    // this is NOT one line: advanceWalk counts a period from what is dated inside it, so
    // the walk in js/model/schema.js would have to learn the same rule first.
    offerLaterDatedAdvances: false,

    // (7) Payment tracking begins at the period containing the day somebody activated it
    // (the `opening` entry). Earlier closures go to a list that says "payment unknown";
    // earlier unclosed periods are listed as before tracking. False tracks all history,
    // which is asserting things about fortnights this app was never told about.
    trackingFromActivationPeriod: true,

    // (8) Every account on the allowlist may close and pay. A list of device or account
    // names here restricts it - on the CLIENT; a server role is a rules change.
    whoMayClose: null,

    // NOT ONE OF THE EIGHT, and it differs from the design note, so it has a name. The
    // owner's words are that the person chooses how much comes off EACH advance. An
    // advance the person said nothing about is therefore a missing answer, not a zero.
    unlistedAdvanceMeansZero: false
});

// THE DAY TRACKING BEGINS, AS THE OWNER DECIDED IT (decision 75, his answer of 2026-11-11:
// "30/10" - the first day of the fortnight 30/10-12/11, which was current as he answered).
//
// It is what the activation screen OFFERS, not something this file writes: the opening is
// still one entry a person confirms, on the day the field holds. It is here because the
// screen's own default - "the first day of the fortnight that holds today" - stops being
// his day the moment the next fortnight begins (13/11), and he may well press after that;
// a person who pressed without touching the field would then have fixed, for good, a day
// he did not choose. And the later day is the worse one, measured
// (tests/activation.test.mjs, V14): a period with work that nobody closed and that ends
// before tracking begins can no longer be closed at all once the record is on - the
// review page refuses it (`before-tracking`) and the old dialog is no longer a door.
//
// A day that has not come yet cannot be an opening (planOpening, `date`), so before it
// the offer is what it was: the first day of the fortnight that holds today.
const PAYBOOK_TRACKING_DAY_DECIDED = '2026-10-30';

function paybookTrackingDefault(today) {
    const decided = PAYBOOK_TRACKING_DAY_DECIDED;
    if (typeof today !== 'string' || !isRealDate(today)) return null;
    if (typeof decided === 'string' && isRealDate(decided) && decided <= today) return decided;
    return periodRangeFor({}, today).from;
}

// The statuses, by key. The five labels are the owner's own words and nothing else has a
// label yet: `review`, `unknown` and `none` are proposed in docs/payroll-closure.md and a
// Hebrew string is a product decision (iron law 6), not something a model file invents.
const PAYBOOK_STATUS_LABELS = Object.freeze({
    waiting: 'ממתין לסגירה',
    closed: 'נסגר',
    paid: 'שולם',
    partial: 'שולם חלקית',
    open: 'יתרה פתוחה'
});

const PAYBOOK_KINDS = ['statement', 'deduction', 'payment', 'void', 'adjustment', 'opening', 'legacy'];
const PAYBOOK_CATEGORIES = ['agreed', 'settlement', 'other'];
const PAYBOOK_METHODS = ['cash', 'transfer'];
const PAYBOOK_OPENING_ID = 'po_open';
const PAYBOOK_TEXT_MAX = 300;
const PAYBOOK_EXTRAS_MAX = 20;

// WHO WROTE IT DOWN, WHEN, AND WHAT THEY HAPPENED TO BE LOOKING AT. Everything else on an
// entry is the entry.
//
// `wageDueBefore` is on this list on purpose. It is the man's older unpaid wage at the
// moment of closing, printed for information and added to nothing. Two phones closing the
// same account with the same choices can honestly disagree about it - one of them has not
// yet heard of a payment the other recorded an hour ago - and comparing it as money would
// hold a statement both phones agree on for a figure neither of them chose.
const PAYBOOK_CONTEXT_FIELDS = ['at', 'by', 'rev', 'wageDueBefore'];

const PAYBOOK_FIELDS = {
    statement: ['id', 'kind', 'workerId', 'cycle', 'transition', 'periodFrom', 'periodTo', 'date',
        'artifactId', 'gross', 'advanceDeductions', 'advanceDeducted', 'extraIds',
        'extraDeducted', 'netDue', 'wageDueBefore', 'debtAfter', 'note', 'at', 'by', 'rev'],
    deduction: ['id', 'kind', 'workerId', 'statementId', 'date', 'amount', 'category', 'reason',
        'at', 'by', 'rev'],
    payment: ['id', 'kind', 'workerId', 'statementId', 'date', 'amount', 'method', 'note',
        'at', 'by', 'rev'],
    void: ['id', 'kind', 'workerId', 'targetId', 'targetKind', 'statementId', 'date', 'amount',
        'reason', 'at', 'by', 'rev'],
    adjustment: ['id', 'kind', 'workerId', 'statementId', 'date', 'delta', 'reason', 'at', 'by',
        'rev'],
    opening: ['id', 'kind', 'date', 'at', 'by', 'rev'],
    legacy: ['id', 'kind', 'workerId', 'artifactId', 'date', 'state', 'due', 'note', 'at', 'by',
        'rev']
};

// ---------------------------------------------------------------- money, counted in agorot
//
// Every sum in this file is taken over whole agorot and divided once at the end. Adding
// shekels as floats is how 0.1 + 0.2 becomes 0.30000000000000004 and how thirty-seven
// deductions of 33.33 come to 1233.2099999999998 - a figure that then fails `<= wage` by a
// hair, or passes it by one, on the comparison that decides whether a closure is legal.
function paybookAgorot(value) {
    return Math.round((Number(value) || 0) * 100);
}

function paybookSum(values) {
    let agorot = 0;
    (values || []).forEach(value => { agorot += paybookAgorot(value); });
    return agorot / 100;
}

// What is wrong with an amount, or '' when it is money. The same four questions
// advanceAmountProblems asks, with no coercion anywhere: "500" is not 500 here, because a
// string that reads as a number on this phone is a string on the next one, and the two
// then disagree about whether an entry is the same fact.
function paybookMoneyProblem(value, zeroAllowed) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'not a number';
    if (value < 0) return 'less than nothing';
    if (value === 0 && !zeroAllowed) return 'nothing';
    if (value > ADVANCE_MAX) return 'beyond any wage';
    const agorot = value * 100;
    if (Math.abs(agorot - Math.round(agorot)) > 1e-6) return 'finer than an agora';
    return '';
}

// A deep copy, as JSON would carry it. The schedule is a JSON document and nothing else,
// and every planner below works on a copy made here - the ledger's writers append into
// the schedule they are handed, and a dry run that appended into the LIVE one would have
// closed the account by looking at it.
function paybookClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------- ids
//
// A deterministic id is the whole of the double-entry defence, exactly as it is for
// `le_close_` and `le_period_`: two phones closing one account write the SAME field path,
// so the union holds one statement and not two. Measured before closures had one (see
// closureId in js/model/ledger.js): one closure pressed on two phones came out as 200 off
// a wage and a carried balance of 800.
function paybookDateKey(date) {
    return String(date).replace(/-/g, '');
}

function paybookStatementId(workerId, periodFrom) {
    return `ps_${String(workerId)}_${paybookDateKey(periodFrom)}`;
}

function paybookDeductionId(workerId, periodFrom, n) {
    return `pd_${String(workerId)}_${paybookDateKey(periodFrom)}_${n}`;
}

// THE PAYMENT MADE AT THE CLOSING ITSELF HAS A DERIVED ID, and every later one a random
// one. The design note gave every payment a random id, and that loses money on the one
// path it was not looking at: two phones close the same account, each with «שולם הכול».
// The statement is one fact and merges into one - and two random payment ids are two
// payments, 3,000 handed over once and recorded twice. Derived from the statement, the
// second is the first, and two phones that typed DIFFERENT paid amounts collide on one id
// and are shown to a person instead of being added together.
function paybookClosingPaymentId(statementId) {
    return `pp_${String(statementId)}`;
}

// A later payment: minted when the form OPENS, never when the button is pressed. A double
// tap, a retry after a lost answer and a reload mid-send then all carry one id and land
// once. A random id holds no underscore, so it can never be mistaken for a derived one.
function newPaymentId() {
    return 'pp_' + newEntityId('x').slice(2);
}

function paybookVoidId(targetId) {
    return `pv_${String(targetId)}`;
}

function paybookAdjustmentId(statementId, n) {
    return `pa_${String(statementId)}_${n}`;
}

function paybookLegacyId(artifactId) {
    return `pl_${String(artifactId)}`;
}

function paybookPath(id) {
    return `pay.${id}`;
}

// ---------------------------------------------------------------- one entry, read strictly
//
// Everything wrong with one entry, in English like every other *Problems in the model.
// Empty means it is an entry this build could have written - and that is the bar, not
// "an entry this build can make sense of". A record with a field nobody wrote is a record
// from somewhere else: another build, a hand-edited backup, a damaged byte. Folding the
// parts of it that happen to parse is how a number nobody computed reaches a payslip.
function paybookStampProblems(value) {
    if (typeof value.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.at)) {
        return ['a pay entry that does not say when it was written'];
    }
    if (typeof value.by !== 'string' || value.by.trim() === '' || value.by.length > 100) {
        return ['a pay entry that does not say who wrote it'];
    }
    if (value.rev !== undefined && !isSafeSeq(value.rev)) {
        return ['a pay entry whose revision is not a revision'];
    }
    return [];
}

function paybookTextProblem(value, required) {
    if (value === undefined) return required ? 'missing' : '';
    if (typeof value !== 'string') return 'not text';
    if (required && value.trim() === '') return 'empty';
    if (value.length > PAYBOOK_TEXT_MAX) return 'too long';
    return '';
}

function payEntryProblems(id, value) {
    if (value === null) return ['a pay entry cannot be deleted'];
    if (!isPlainObject(value)) return ['a pay entry that is not a record'];
    // The id is half of a field path AND a map key. `__proto__` as a key re-parents the
    // map instead of storing anything (see isSafeId, and tests/poison.test.mjs for the
    // ledger's version of the same lesson): the entry is in no map anybody reads, and the
    // next save writes the emptiness over the only record that money changed hands.
    if (typeof id !== 'string' || !isSafeId(id)) return ['a pay entry under an id nobody could write'];
    if (value.id !== id) return ['a pay entry whose id does not match its path'];
    if (typeof value.kind !== 'string' || PAYBOOK_KINDS.indexOf(value.kind) === -1) {
        return ['a pay entry of a kind nobody wrote'];
    }
    const allowed = PAYBOOK_FIELDS[value.kind];
    const stray = Object.keys(value).filter(field => allowed.indexOf(field) === -1);
    if (stray.length > 0) return ['a pay entry carrying a field nobody wrote: ' + stray.sort()[0]];
    const stamp = paybookStampProblems(value);
    if (stamp.length > 0) return stamp;
    if (typeof value.date !== 'string' || !isRealDate(value.date)) {
        return ['a pay entry on a date that is not a date'];
    }

    if (value.kind === 'opening') {
        if (id !== PAYBOOK_OPENING_ID) return ['an opening under a name that is not the opening'];
        return [];
    }

    if (typeof value.workerId !== 'string' || !isSafeId(value.workerId)) {
        return ['a pay entry belonging to nobody'];
    }

    if (value.kind === 'statement') return paybookStatementShape(id, value);

    if (value.kind === 'legacy') {
        if (typeof value.artifactId !== 'string' || !isSafeId(value.artifactId)
            || value.artifactId.indexOf('le_period_' + value.workerId + '_') !== 0) {
            return ['a legacy answer about a closure that is not this man\'s'];
        }
        if (id !== paybookLegacyId(value.artifactId)) {
            return ['a legacy answer whose id is not derived from its closure'];
        }
        if (value.state !== 'paid' && value.state !== 'due') {
            return ['a legacy answer that is neither paid nor owed'];
        }
        if (value.state === 'paid' && value.due !== undefined) {
            return ['a legacy answer that says paid and names a sum still owed'];
        }
        if (value.state === 'due') {
            const wrong = paybookMoneyProblem(value.due, false);
            if (wrong) return ['a legacy answer owing a sum that is ' + wrong];
        }
        if (paybookTextProblem(value.note, false)) return ['a legacy answer with a note that is not a note'];
        return [];
    }

    // The three that hang off a statement (or, for a payment, a legacy answer).
    if (typeof value.statementId !== 'string' || !isSafeId(value.statementId)) {
        return ['a pay entry that names no closure'];
    }

    if (value.kind === 'deduction') {
        const prefix = 'pd_' + value.statementId.slice(3) + '_';
        const n = id.indexOf(prefix) === 0 ? id.slice(prefix.length) : '';
        if (value.statementId.indexOf('ps_' + value.workerId + '_') !== 0 || !/^[1-9]\d?$/.test(n)) {
            return ['a deduction whose id is not derived from its closure'];
        }
        const wrong = paybookMoneyProblem(value.amount, false);
        if (wrong) return ['a deduction of a sum that is ' + wrong];
        if (PAYBOOK_CATEGORIES.indexOf(value.category) === -1) {
            return ['a deduction of a category nobody wrote'];
        }
        // An unexplained deduction from a wage is the thing this record exists to refuse:
        // "somebody took 200 off his pay and nobody wrote down why".
        if (paybookTextProblem(value.reason, true)) return ['a deduction with no reason'];
        return [];
    }

    if (value.kind === 'payment') {
        const target = value.statementId;
        const mine = target.indexOf('ps_' + value.workerId + '_') === 0
            || target.indexOf('pl_le_period_' + value.workerId + '_') === 0;
        if (!mine) return ['a payment against a closure that is not this man\'s'];
        if (!/^pp_[A-Za-z0-9]{6,40}$/.test(id) && id !== paybookClosingPaymentId(target)) {
            return ['a payment under an id nobody could mint'];
        }
        const wrong = paybookMoneyProblem(value.amount, false);
        if (wrong) return ['a payment of a sum that is ' + wrong];
        // Absent is absent. A method nobody chose is not 'cash' - the same rule
        // foldAdvance keeps for an advance.
        if (value.method !== undefined && PAYBOOK_METHODS.indexOf(value.method) === -1) {
            return ['a payment by a method nobody wrote'];
        }
        if (paybookTextProblem(value.note, false)) return ['a payment with a note that is not a note'];
        return [];
    }

    if (value.kind === 'void') {
        if (typeof value.targetId !== 'string' || !isSafeId(value.targetId)) {
            return ['a void that names nothing'];
        }
        if (id !== paybookVoidId(value.targetId)) {
            return ['a void whose id is not derived from what it voids'];
        }
        if (value.targetKind !== 'payment' && value.targetKind !== 'deduction') {
            return ['a void of a kind of entry that carries no money'];
        }
        if (value.targetId.indexOf(value.targetKind === 'payment' ? 'pp_' : 'pd_') !== 0) {
            return ['a void whose target is not the kind it says'];
        }
        const wrong = paybookMoneyProblem(value.amount, false);
        if (wrong) return ['a void of a sum that is ' + wrong];
        if (paybookTextProblem(value.reason, true)) return ['a void with no reason'];
        return [];
    }

    // adjustment
    const prefix = 'pa_' + value.statementId + '_';
    const n = id.indexOf(prefix) === 0 ? id.slice(prefix.length) : '';
    if (value.statementId.indexOf('ps_' + value.workerId + '_') !== 0 || !/^[1-9]\d?$/.test(n)) {
        return ['an adjustment whose id is not derived from its closure'];
    }
    if (typeof value.delta !== 'number' || !Number.isFinite(value.delta) || value.delta === 0) {
        return ['an adjustment of nothing'];
    }
    const wrong = paybookMoneyProblem(Math.abs(value.delta), false);
    if (wrong) return ['an adjustment of a sum that is ' + wrong];
    if (paybookTextProblem(value.reason, true)) return ['an adjustment with no reason'];
    return [];
}

// The statement, on its own: every figure in it has to follow from the others. It arrives
// from another phone, from a backup, from a restore, and the netDue on it is a number
// somebody else computed - so the sum is done again here, in agorot, and a statement that
// does not add up is not folded into anybody's wage.
function paybookStatementShape(id, value) {
    if (!isPayCycle(value.cycle)) return ['a statement over a cycle nobody is paid on'];
    if (typeof value.transition !== 'boolean') return ['a statement that does not say whether its period was cut'];
    if (typeof value.periodFrom !== 'string' || typeof value.periodTo !== 'string'
        || !isRealDate(value.periodFrom) || !isRealDate(value.periodTo)) {
        return ['a statement over no period'];
    }
    if (value.periodTo < value.periodFrom) return ['a statement whose period closed before it opened'];
    // Both cycles cut on a Friday and neither runs past a fortnight; a statement over a
    // hand-picked window is a net for days nobody is paid on.
    if (!isWeekStart(value.periodFrom) || value.periodTo > advanceDayStep(value.periodFrom, 13)) {
        return ['a statement over a window that is not a pay period'];
    }
    if (value.date !== value.periodTo) return ['a statement not dated on its period\'s last day'];
    if (id !== paybookStatementId(value.workerId, value.periodFrom)) {
        return ['a statement whose id is not derived from its man and its period'];
    }
    if (value.artifactId !== periodArtifactId(value.workerId, value.periodFrom)) {
        return ['a statement naming a closure that is not its own'];
    }
    const money = ['gross', 'advanceDeducted', 'extraDeducted', 'wageDueBefore', 'debtAfter'];
    for (let at = 0; at < money.length; at += 1) {
        const wrong = paybookMoneyProblem(value[money[at]], true);
        if (wrong) return ['a statement whose ' + money[at] + ' is ' + wrong];
    }
    if (!Array.isArray(value.advanceDeductions)) return ['a statement whose advance deductions are not a list'];
    const seen = {};
    for (let at = 0; at < value.advanceDeductions.length; at += 1) {
        const row = value.advanceDeductions[at];
        if (!isPlainObject(row)) return ['a statement with an advance deduction that is not a record'];
        const stray = Object.keys(row).filter(field =>
            ['advanceId', 'entryId', 'amount', 'before', 'after'].indexOf(field) === -1);
        if (stray.length > 0) return ['a statement with an advance deduction carrying a field nobody wrote'];
        if (typeof row.advanceId !== 'string' || !isSafeId(row.advanceId)) {
            return ['a statement deducting from an advance nobody could name'];
        }
        // THE SAME ADVANCE TWICE IN ONE CLOSURE is the same deduction twice.
        if (ownsKey(seen, row.advanceId)) return ['a statement deducting from one advance twice'];
        putKey(seen, row.advanceId, true);
        if (row.entryId !== closureId(row.advanceId, value.periodFrom)) {
            return ['a statement whose advance deduction names an entry that is not its own'];
        }
        if (paybookMoneyProblem(row.amount, false) || paybookMoneyProblem(row.before, false)
            || paybookMoneyProblem(row.after, true)) {
            return ['a statement with an advance deduction that is not money'];
        }
        if (paybookAgorot(row.before) - paybookAgorot(row.amount) !== paybookAgorot(row.after)) {
            return ['a statement whose advance deduction does not leave what it says'];
        }
    }
    if (paybookAgorot(paybookSum(value.advanceDeductions.map(row => row.amount)))
        !== paybookAgorot(value.advanceDeducted)) {
        return ['a statement whose advance deductions do not add up'];
    }
    if (!Array.isArray(value.extraIds) || value.extraIds.length > PAYBOOK_EXTRAS_MAX) {
        return ['a statement whose extra deductions are not a list'];
    }
    for (let at = 0; at < value.extraIds.length; at += 1) {
        if (value.extraIds[at] !== paybookDeductionId(value.workerId, value.periodFrom, at + 1)) {
            return ['a statement naming an extra deduction that is not its own'];
        }
    }
    if ((value.extraIds.length === 0) !== (paybookAgorot(value.extraDeducted) === 0)) {
        return ['a statement whose extra deductions and their total disagree'];
    }
    if (typeof value.netDue !== 'number' || !Number.isFinite(value.netDue)
        || Math.abs(value.netDue) > ADVANCE_MAX) {
        return ['a statement whose net is not a number'];
    }
    if (paybookAgorot(value.gross) - paybookAgorot(value.advanceDeducted)
        - paybookAgorot(value.extraDeducted) !== paybookAgorot(value.netDue)) {
        return ['a statement whose net is not its wage less its deductions'];
    }
    // A man does not owe his employer his labour back - the same line closureProblems
    // draws under «a closure leaving a wage below zero».
    if (value.netDue < 0 && !PAYBOOK_RULES.deductionsMayExceedWage) {
        return ['a statement leaving a wage below zero'];
    }
    if (paybookTextProblem(value.note, false)) return ['a statement with a note that is not a note'];
    return [];
}

// ---------------------------------------------------------------- same fact, or not
//
// One id, two bodies. If everything but the signer agrees it is one fact written by two
// hands, and the first stands - sameLedgerFact's rule, with this map's own list of what
// counts as "the signer".
function paybookSameFact(one, two) {
    if (!isPlainObject(one) || !isPlainObject(two)) return false;
    const facts = record => {
        const out = {};
        Object.keys(record).forEach(field => {
            if (PAYBOOK_CONTEXT_FIELDS.indexOf(field) !== -1) return;
            if (record[field] === undefined) return;
            out[field] = record[field];
        });
        return out;
    };
    return sameLedgerBytes(facts(one), facts(two));
}

// ---------------------------------------------------------------- the writer's gate
//
// Does this BUILD create pay entries? One answer, read off the frozen flags, so that a
// planner, the commit and a future screen cannot each have their own idea of it. Reading,
// keeping, merging and sending are deliberately not behind it - see FARKAD_SHIPPED_FLAGS.
//
// PER RECORD since Phase 8 (paybookOn, js/model/schema.js): the build's flag through the
// test seam, or a record somebody activated. Called with no schedule it answers for the
// build alone - false in everything a person installs.
function paybookWritesEnabled(schedule) {
    return typeof paybookOn === 'function' ? paybookOn(schedule) === true
        : (typeof FARKAD_FLAGS !== 'undefined' && FARKAD_FLAGS.paybook === true);
}

// ---------------------------------------------------------------- two documents, one book
//
// paybookUnion(standing, other) -> { pay, payConflicted, clashes }
//
// The pay book of two documents, as one: every entry either of them holds, and nothing
// removed. A document that carries no `pay` at all - every phone before v173, every backup
// written before the first closure - has not disagreed with one, so it takes nothing away.
// That is mergeLedgerInto's rule, and it is the whole reason a not-updated phone's
// snapshot cannot erase somebody's payment from a phone that has it.
//
// ONE ID, TWO BODIES. Same money with a different hand on it (paybookSameFact) is one
// fact and `standing`'s copy is the record. Different money is a disagreement nobody but
// a person may settle: `standing`'s copy STANDS, the other is kept verbatim beside it
// under `payConflicted[<id>]`, and the id is named in `clashes`. Never merged, never
// chosen between by a clock, never last-write-wins.
//
// WHO STANDS is the caller's statement, and the three callers say the same thing in
// three places: what the cloud holds outranks what a phone holds, and what is live
// outranks what is being restored. So every phone that has heard the cloud folds the SAME
// entry under a disputed id - the one the other two fold - and the loser's own figure is
// beside it rather than in the arithmetic. (The ledger does it the other way round on the
// phone that lost, which is why that phone has to be stopped; this map can afford not to
// stop it. See docs/payroll-closure.md, «the conflict rule».)
//
// An entry this build cannot read is treated as bytes like any other: it stands if it is
// `standing`'s, it is kept beside if it is not. Nothing here repairs or judges one.
//
// Pure. Neither input is touched; the entries themselves are shared, not copied, as
// mergeLedgerInto shares them.
function paybookUnion(standing, other) {
    const bookOf = side => (side && isPlainObject(side.pay)) ? side.pay : {};
    const besideOf = side => (side && isPlainObject(side.payConflicted)) ? side.payConflicted : {};
    const usable = id => POISON_SEGMENTS.indexOf(id) === -1;
    const pay = {};
    const beside = {};
    const clashes = [];

    const sameAsStanding = (id, body) => ownsKey(pay, id)
        && (sameLedgerBytes(pay[id], body) || paybookSameFact(pay[id], body));
    const keepBeside = (id, body) => {
        if (body === undefined || sameAsStanding(id, body)) return;
        if (!ownsKey(beside, id)) putKey(beside, id, []);
        if (!beside[id].some(had => sameLedgerBytes(had, body))) beside[id].push(body);
    };

    const first = bookOf(standing);
    Object.keys(first).forEach(id => { if (usable(id)) putKey(pay, id, first[id]); });
    const second = bookOf(other);
    Object.keys(second).forEach(id => {
        if (!usable(id)) return;
        if (!ownsKey(pay, id)) { putKey(pay, id, second[id]); return; }
        if (sameAsStanding(id, second[id])) return;
        clashes.push(id);
        keepBeside(id, second[id]);
    });
    // What either side was ALREADY keeping beside an entry stays kept: a second reading
    // of a disagreement is not a licence to forget half of it.
    [standing, other].forEach(side => {
        const held = besideOf(side);
        Object.keys(held).forEach(id => {
            if (!usable(id)) return;
            (Array.isArray(held[id]) ? held[id] : [held[id]]).forEach(body => keepBeside(id, body));
        });
    });
    return { pay, payConflicted: beside, clashes };
}

// The union, written onto a document. `target` is usually one of the two sides; it is
// named separately because which side STANDS and which object is being built are two
// different questions, and conflating them is how mergeLedgerInto's direction went
// unnoticed for a release (see the note inside it).
function layPaybookUnion(target, standing, other) {
    const union = paybookUnion(standing, other);
    target.pay = union.pay;
    if (Object.keys(union.payConflicted).length > 0) target.payConflicted = union.payConflicted;
    else delete target.payConflicted;
    // And the bytes of a container neither side could read (normaliseSchedule's
    // `payUnreadableContainer`), from whichever side is holding them: the evidence is part
    // of the record so that the hold outlives a session, and a document that has simply
    // never seen it must not be what takes it off.
    [standing, other].forEach(side => {
        if (target.payUnreadableContainer === undefined && side
            && side.payUnreadableContainer !== undefined) {
            target.payUnreadableContainer = side.payUnreadableContainer;
        }
    });
    // AND THE INDEX of what has left the live document (Phase 5), by the same law: rows
    // only ever arrive. A document that has never heard of a row - a backup written before
    // the closure moved, a restore point - must not be what takes it off, because the row
    // is the only thing in the live document that says those entries exist at all. Laid
    // here so that the three callers (receive, prepareReplace, absorbCloudLedger) carry it
    // without each having to remember to.
    layPaybookIndexUnion(target, standing, other);
    return union.clashes;
}

// ONE ENTRY, laid onto a schedule by the same law - for the journal's replay, where the
// thing arriving is a single (path, value) and not a document.
//
// Never an overwrite. A queued entry is put where there is nothing; where the record
// already holds that id it is left exactly as it is, and a body that differs is kept
// beside it. That order matters at the one moment it can bite: a snapshot has just been
// adopted carrying another phone's statement, and this phone's own pending one is about
// to be laid back "on top" (reapplyPending). On top is what every other path family
// means there. For this one it would be a rewrite of the entry the cloud holds, on this
// phone's screen, with the send then held for ever - a phone folding a figure nobody
// else folds.
//
// Returns 'added', 'same' or 'beside'. A null is a deletion and does nothing at all.
function layPaybookEntry(schedule, id, value) {
    if (value === null || value === undefined) return 'same';
    if (typeof id !== 'string' || POISON_SEGMENTS.indexOf(id) !== -1) return 'same';
    if (!isPlainObject(schedule.pay)) schedule.pay = {};
    if (!ownsKey(schedule.pay, id)) { putKey(schedule.pay, id, value); return 'added'; }
    const standing = schedule.pay[id];
    if (sameLedgerBytes(standing, value) || paybookSameFact(standing, value)) return 'same';
    if (!isPlainObject(schedule.payConflicted)) schedule.payConflicted = {};
    if (!ownsKey(schedule.payConflicted, id)) putKey(schedule.payConflicted, id, []);
    const beside = schedule.payConflicted[id];
    if (Array.isArray(beside) && !beside.some(had => sameLedgerBytes(had, value))) beside.push(value);
    return 'beside';
}

// Does a schedule already HOLD this entry - the same fact, whoever's hand is on it? The
// queue's collector asks before it lets an acknowledged operation go, and for this map
// "the same bytes" is the wrong question: when two phones wrote one fact the record keeps
// the first writer's copy, so this phone's operation is settled by a body that is not
// byte for byte its own, and would otherwise sit in the queue for ever.
function paybookHoldsEntry(schedule, id, value) {
    const map = paybookMap(schedule);
    if (!ownsKey(map, id)) return false;
    return sameLedgerBytes(map[id], value) || paybookSameFact(map[id], value);
}

// Does `mine` already hold everything `theirs` says - every entry, and everything kept
// beside one? The receive path asks before it treats a snapshot as this phone's own echo:
// an echo teaches a phone nothing, and a snapshot carrying a pay entry this copy has never
// held is not one, whatever its stamps say. One-directional on purpose - what `mine`
// holds beyond `theirs` is this phone's own unsent work and is not the question.
function paybookCovers(mine, theirs) {
    const book = paybookMap(theirs);
    if (!Object.keys(book).every(id => paybookHoldsEntry(mine, id, book[id]))) return false;
    const beside = (theirs && isPlainObject(theirs.payConflicted)) ? theirs.payConflicted : {};
    const held = (mine && isPlainObject(mine.payConflicted)) ? mine.payConflicted : {};
    return Object.keys(beside).every(id => {
        const variants = Array.isArray(beside[id]) ? beside[id] : [beside[id]];
        const known = ownsKey(held, id) ? (Array.isArray(held[id]) ? held[id] : [held[id]]) : [];
        return variants.every(body => paybookHoldsEntry(mine, id, body)
            || known.some(had => sameLedgerBytes(had, body)));
    }) && paybookIndexCovers(mine, theirs);
}

// Every entry of the map this build could not have written, by id, exactly as it lies.
// The bar is payEntryProblems - the same one the queue applies on the way out - and it is
// about SHAPE: a payment whose statement has not arrived yet is readable and waits in the
// fold; it is not here.
function paybookUnreadable(schedule) {
    const map = paybookMap(schedule);
    const out = {};
    Object.keys(map).sort().forEach(id => {
        if (payEntryProblems(id, map[id]).length > 0) putKey(out, id, map[id]);
    });
    return out;
}

// ---------------------------------------------------------------- what a commit may carry
//
// paybookCommitPlan(schedule, changes) -> { ok, reasons, write, same }
//
// The last question before a plan's `changes` reach the journal, asked of the record AS IT
// IS NOW rather than as it was when the plan was drawn. It exists because the journal
// takes a path and a value and nothing else: it cannot know that `pay.ps_w1_20261002` is
// already on this phone saying something different, and a batch that reached it would
// journal a rewrite of an entry that is never rewritten.
//
//   gate       this build does not write the pay book, or the record's own financial gate
//              is shut. Nothing is written.
//   rejected   a path that is not `pay.<id>` or `ledger.advances.<id>`, a value the
//              journal's own reader would refuse (a null among them - a deletion), or one
//              path twice in one batch. A closure writes entries; it edits nothing else.
//   conflict   an id already on the record with DIFFERENT content, or one somebody is
//              still being asked about. Refused whole: a local write never creates a
//              disagreement - only two phones can - and half a closure is not a closure.
//
// An id already there with the SAME content is the same fact and is left out of `write`
// (named in `same`): committing a plan twice, or after the other phone's copy of it has
// arrived, writes nothing and is not an error.
//
// ALL OR NOTHING. `ok` is false if any change is refused, and `write` is then empty.
function paybookCommitPlan(schedule, changes) {
    const reasons = [];
    const write = [];
    const same = [];
    if (!paybookWritesEnabled(schedule)
        || (typeof financialWritingEnabled === 'function' && !financialWritingEnabled(schedule))) {
        paybookAddReason(reasons, 'gate');
    } else if (!paybookQueueEnabled()) {
        // THE QUEUE IS NOT THE PAY BOOK'S DOOR ANY MORE (v175). A pay entry is written by
        // one server transaction (js/sync/transact.js) and adopted from the server's
        // document; committing one here would journal it as an edit and leave it in the
        // outbox - a closure accepted offline, which the owner ruled out.
        paybookAddReason(reasons, 'server-first');
    }
    const book = paybookMap(schedule);
    const beside = (schedule && isPlainObject(schedule.payConflicted)) ? schedule.payConflicted : {};
    const ledger = paybookLedger(schedule);
    const seen = {};
    const list = Array.isArray(changes) ? changes : [];
    if (list.length === 0) paybookAddReason(reasons, 'rejected');
    list.forEach(change => {
        const path = isPlainObject(change) && typeof change.path === 'string' ? change.path : '';
        const value = isPlainObject(change) ? change.value : undefined;
        const parts = path.split('.');
        const isPay = parts.length === 2 && parts[0] === 'pay';
        const isEntry = parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'advances';
        if ((!isPay && !isEntry) || ownsKey(seen, path)
            || journalEntryProblems(path, value).length > 0) {
            paybookAddReason(reasons, 'rejected');
            return;
        }
        putKey(seen, path, true);
        const id = parts[parts.length - 1];
        const map = isPay ? book : ledger;
        if (isPay && ownsKey(beside, id)) { paybookAddReason(reasons, 'conflict'); return; }
        if (!ownsKey(map, id)) { write.push({ path, value }); return; }
        const one = isPay ? paybookSameFact(map[id], value) : sameLedgerFact(map[id], value);
        if (one) same.push(path);
        else paybookAddReason(reasons, 'conflict');
    });
    const ok = reasons.length === 0;
    return { ok, reasons, write: ok ? write : [], same };
}

// ---------------------------------------------------------------- small readers
function paybookWorker(schedule, worker) {
    const id = isPlainObject(worker) ? String(worker.id) : String(worker);
    return ((schedule && schedule.workers) || [])
        .filter(item => item && String(item.id) === id)[0] || null;
}

function paybookMap(schedule) {
    return (schedule && isPlainObject(schedule.pay)) ? schedule.pay : {};
}

function paybookLedger(schedule) {
    return (schedule && schedule.ledger && isPlainObject(schedule.ledger.advances))
        ? schedule.ledger.advances : {};
}

// The local calendar day an entry was written on. `at` is an ISO moment in UTC; slicing
// its first ten characters is the bug js/dates.js opens with - east of Greenwich a closure
// pressed just after midnight would be filed under the day before.
function paybookDayOf(at) {
    const made = new Date(String(at || ''));
    return isNaN(made.getTime()) ? '' : toLocalDateStr(made);
}

// ---------------------------------------------------------------- the fold
//
// Everything the `pay` map says, read once. Derived, never stored, and independent of the
// order entries arrived in: three phones receive these in three orders and all of them
// have to print the same «יתרת שכר לתשלום».
//
// What cannot be folded is HELD, by id, with the reason - never dropped and never
// repaired. A payment whose statement has not arrived yet is the ordinary case (one path
// per entry, and the wire does not promise order), and it must neither vanish nor count:
// it waits, visibly, and folds the moment the statement lands.
function paybookFold(schedule) {
    const map = paybookMap(schedule);
    const ledger = paybookLedger(schedule);
    const held = [];
    const hold = (id, problems) => held.push({ id, problems });
    const shaped = {};
    Object.keys(map).sort().forEach(id => {
        const problems = payEntryProblems(id, map[id]);
        if (problems.length > 0) hold(id, problems);
        else putKey(shaped, id, map[id]);
    });
    const ofKind = kind => Object.keys(shaped).filter(id => shaped[id].kind === kind);

    const opening = ownsKey(shaped, PAYBOOK_OPENING_ID) ? shaped[PAYBOOK_OPENING_ID] : null;

    // --- statements, each judged against the record it claims to describe.
    const statements = {};
    ofKind('statement').forEach(id => {
        const problems = paybookStatementProblems(schedule, shaped[id], shaped);
        if (problems.length > 0) { hold(id, problems); return; }
        putKey(statements, id, {
            id, statement: shaped[id], workerId: shaped[id].workerId,
            deductions: [], payments: [], adjustments: [], reversals: []
        });
    });

    // --- legacy answers: the owner's word on a closure that has no statement.
    const legacy = {};
    ofKind('legacy').forEach(id => {
        const entry = shaped[id];
        const artifact = ownsKey(ledger, entry.artifactId) ? ledger[entry.artifactId] : null;
        if (!artifact || String(artifact.kind) !== 'closed'
            || String(artifact.workerId) !== entry.workerId) {
            hold(id, ['a legacy answer about a closure that is not on the record']); return;
        }
        if (ownsKey(statements, paybookStatementId(entry.workerId, artifact.periodFrom))) {
            hold(id, ['a legacy answer about a closure that has a statement of its own']); return;
        }
        const net = Number.isFinite(Number(artifact.net)) ? Number(artifact.net)
            : (Number.isFinite(Number(artifact.gross)) ? Number(artifact.gross) : null);
        if (entry.state === 'due' && net !== null && paybookAgorot(entry.due) > paybookAgorot(net)) {
            hold(id, ['a legacy answer owing more than the closure\'s own net']); return;
        }
        putKey(legacy, id, {
            id, entry, workerId: entry.workerId, artifactId: entry.artifactId,
            periodFrom: String(artifact.periodFrom), periodTo: String(artifact.periodTo),
            payments: []
        });
    });

    // --- extra deductions: only the ones a standing statement names.
    ofKind('deduction').forEach(id => {
        const entry = shaped[id];
        const of = ownsKey(statements, entry.statementId) ? statements[entry.statementId] : null;
        if (!of || of.statement.extraIds.indexOf(id) === -1) {
            hold(id, ['a deduction no standing closure names']); return;
        }
        of.deductions.push({ id, entry, voided: 0 });
    });

    // --- payments.
    const payments = {};
    ofKind('payment').forEach(id => {
        const entry = shaped[id];
        const target = ownsKey(statements, entry.statementId) ? statements[entry.statementId]
            : (ownsKey(legacy, entry.statementId) ? legacy[entry.statementId] : null);
        if (!target || target.workerId !== entry.workerId) {
            hold(id, ['a payment against a closure that is not standing on the record']); return;
        }
        if (ownsKey(legacy, entry.statementId) && legacy[entry.statementId].entry.state !== 'due') {
            hold(id, ['a payment against an older closure nobody said was owed']); return;
        }
        const row = { id, entry, voided: 0 };
        target.payments.push(row);
        putKey(payments, id, row);
    });

    // --- voids: one per target, never larger than what it voids.
    ofKind('void').forEach(id => {
        const entry = shaped[id];
        let target = null;
        if (entry.targetKind === 'payment' && ownsKey(payments, entry.targetId)) {
            target = payments[entry.targetId];
        } else if (entry.targetKind === 'deduction' && ownsKey(statements, entry.statementId)) {
            target = statements[entry.statementId].deductions
                .filter(row => row.id === entry.targetId)[0] || null;
        }
        if (!target || target.entry.statementId !== entry.statementId
            || target.entry.workerId !== entry.workerId) {
            hold(id, ['a void of an entry that is not standing on the record']); return;
        }
        if (paybookAgorot(entry.amount) > paybookAgorot(target.entry.amount)) {
            hold(id, ['a void larger than what it voids']); return;
        }
        target.voided = entry.amount;
        target.voidId = id;
    });

    // --- adjustments.
    ofKind('adjustment').forEach(id => {
        const entry = shaped[id];
        const of = ownsKey(statements, entry.statementId) ? statements[entry.statementId] : null;
        if (!of || of.workerId !== entry.workerId) {
            hold(id, ['an adjustment to a closure that is not standing on the record']); return;
        }
        of.adjustments.push({ id, entry });
    });

    // --- an advance deduction UNDONE through the ledger's own correction. The advance's
    // debt went back up there (advanceOutstanding nets it); the same shekels are wage that
    // did not, after all, come off - so the man is owed them again here. One correction,
    // read by both folds, or the two balances stop adding up to the wage.
    const reversedBy = {};
    Object.keys(ledger).forEach(id => {
        const entry = ledger[id];
        if (!entry || String(entry.kind) !== 'reversed' || !entry.targetId) return;
        const key = String(entry.targetId);
        if (!ownsKey(reversedBy, key)) putKey(reversedBy, key, []);
        reversedBy[key].push(entry);
    });

    const settle = (owedParts, rows) => {
        const owed = paybookSum(owedParts);
        const paid = paybookSum(rows.map(row => row.entry.amount))
            - paybookSum(rows.map(row => row.voided));
        const paidNet = agoraRound(paid);
        // NEVER CLAMPED INTO SILENCE. Two phones offline, each recording the same 1,000
        // handed over under its own id: both land, and both are right to land. What must
        // not happen is the surplus quietly reducing the NEXT wage or an advance - that
        // is netting, and the owner ruled it out. It is named, and a person looks.
        return {
            owed: agoraRound(owed),
            paid: paidNet,
            due: agoraRound(Math.max(0, owed - paidNet)),
            overpaid: agoraRound(Math.max(0, paidNet - Math.max(0, owed))),
            negative: owed < 0
        };
    };

    Object.keys(statements).forEach(id => {
        const of = statements[id];
        of.statement.advanceDeductions.forEach(row => {
            (ownsKey(reversedBy, row.entryId) ? reversedBy[row.entryId] : []).forEach(entry => {
                of.reversals.push({ id: String(entry.id), advanceId: row.advanceId,
                    amount: Number(entry.amount) || 0 });
            });
        });
        of.adjusted = paybookSum(of.adjustments.map(row => row.entry.delta));
        of.extraVoided = paybookSum(of.deductions.map(row => row.voided));
        of.deductionReversed = paybookSum(of.reversals.map(row => row.amount));
        Object.assign(of, settle([of.statement.netDue, of.adjusted, of.extraVoided,
            of.deductionReversed], of.payments));
        of.status = paybookStatementStatus(of);
    });
    Object.keys(legacy).forEach(id => {
        const of = legacy[id];
        Object.assign(of, settle([of.entry.state === 'due' ? of.entry.due : 0], of.payments));
        of.status = of.entry.state === 'paid' ? 'legacy-paid'
            : (of.overpaid > 0 ? 'review' : (of.due > 0 ? 'legacy-due' : 'legacy-paid'));
    });

    // --- what two phones disagreed about, kept beside the entry that stands. Written by
    // paybookApply here and, in a later phase, by the receive path; the fold only reports.
    const conflicts = [];
    const conflicted = (schedule && isPlainObject(schedule.payConflicted)) ? schedule.payConflicted : {};
    Object.keys(conflicted).sort().forEach(id => {
        const variants = Array.isArray(conflicted[id]) ? conflicted[id] : [conflicted[id]];
        const workers = {};
        variants.concat(ownsKey(map, id) ? [map[id]] : []).forEach(entry => {
            if (isPlainObject(entry) && typeof entry.workerId === 'string') {
                putKey(workers, entry.workerId, true);
            }
        });
        conflicts.push({ id, variants: variants.length, workerIds: Object.keys(workers).sort() });
    });

    return { opening, statements, legacy, held, conflicts };
}

// One rule for a closed period's payment state, and every surface reads this.
function paybookStatementStatus(of) {
    if (of.overpaid > 0 || of.negative) return 'review';
    if (of.paid > 0 && of.due === 0) return 'paid';
    if (of.paid > 0) return 'partial';
    return 'closed';
}

// A statement against the record: is the closure it describes actually there, and is it
// the same closure? The statement is the wage's half of one event whose other half is the
// artifact and the `deducted` entries. A statement whose artifact says a different gross,
// or whose deductions are not on the ledger, is two phones' halves of two different
// closures stapled together - and folding it would print a net no closure ever produced.
function paybookStatementProblems(schedule, statement, shaped) {
    const out = [];
    const worker = paybookWorker(schedule, statement.workerId);
    if (!worker) return ['a statement for a man who is not on the roster'];
    if (!isPeriodFor(worker, statement.periodFrom, statement.periodTo)) {
        out.push('a statement over a period this man is not settled on');
    } else if (periodRangeFor(worker, statement.periodFrom).cycle !== statement.cycle) {
        out.push('a statement naming a cycle that did not govern its period');
    }
    const artifact = periodArtifactFor(schedule, statement.workerId, statement.periodFrom);
    if (!artifact || String(artifact.kind) !== 'closed') {
        out.push('a statement whose closure is not on the record');
    } else {
        if (String(artifact.periodTo) !== statement.periodTo) {
            out.push('a statement and a closure that end on different days');
        }
        if (!Number.isFinite(Number(artifact.gross))
            || paybookAgorot(artifact.gross) !== paybookAgorot(statement.gross)) {
            out.push('a statement whose wage is not the wage its closure froze');
        }
    }
    const ledger = paybookLedger(schedule);
    statement.advanceDeductions.forEach(row => {
        const entry = ownsKey(ledger, row.entryId) ? ledger[row.entryId] : null;
        if (!entry || String(entry.kind) !== 'deducted'
            || paybookAgorot(entry.amount) !== paybookAgorot(row.amount)) {
            out.push('a statement naming an advance deduction the ledger does not hold');
        }
    });
    // AND THE OTHER DIRECTION. A `deducted` entry over this period that the statement
    // does not list is money that came off the wage and is missing from the net.
    const frozen = closedPeriods(schedule, statement.workerId)[statement.periodFrom];
    if (frozen && paybookAgorot(frozen.deducted) !== paybookAgorot(statement.advanceDeducted)) {
        out.push('a statement whose advance deductions are not the ledger\'s for its period');
    }
    const extras = statement.extraIds.map(id => (ownsKey(shaped, id) ? shaped[id] : null));
    if (extras.some(entry => !entry || entry.kind !== 'deduction'
        || entry.statementId !== statement.id || entry.workerId !== statement.workerId)) {
        out.push('a statement naming an extra deduction that is not on the record');
    } else if (paybookAgorot(paybookSum(extras.map(entry => entry.amount)))
        !== paybookAgorot(statement.extraDeducted)) {
        out.push('a statement whose extra deductions do not add up');
    }
    return out;
}

// ---------------------------------------------------------------- where tracking begins
//
// The first day of the period that contained the activation day - per man, because a
// weekly man's period that week and a fortnightly man's are different windows. Null while
// nobody has activated anything: there is then no period this file may call "waiting to
// be paid", because it was never told which ones were.
function paybookTrackingStart(schedule, worker, fold) {
    if (!PAYBOOK_RULES.trackingFromActivationPeriod) return '0000-01-01';
    const opening = (fold || paybookFold(schedule)).opening;
    if (!opening) return null;
    return periodRangeFor(worker, opening.date).from;
}

// ---------------------------------------------------------------- one period's wage
//
// payrollReport's row and nothing else. `closed` is frozenPeriodFor - the same question
// payrollReport, workerDaysReport and advanceWalk ask - so "is this period closed" has one
// answer in the app and this file is not a second opinion.
function paybookPeriodWage(schedule, worker, period, cache) {
    const key = period.from + '>' + period.to;
    const rows = (cache && cache[key]) || payrollReport(schedule, period.from, period.to);
    if (cache) cache[key] = rows;
    const row = rows.filter(item => String(item.workerId) === String(worker.id))[0] || {};
    const amount = (row.amount === null || row.amount === undefined) ? null : agoraRound(row.amount);
    const attendance = Number(row.attendanceDays) || 0;
    return {
        from: period.from,
        to: period.to,
        cycle: period.cycle,
        transition: Boolean(period.transition),
        gross: amount,
        attendanceDays: attendance,
        payUnits: Number(row.payUnits) || 0,
        normalDays: Number(row.normalDays) || 0,
        doubleDays: Number(row.doubleDays) || 0,
        extraHours: Number(row.extraHours) || 0,
        siteVisits: Number(row.siteVisits) || 0,
        absent: Number(row.absent) || 0,
        // Work a wage is owed for. An absence alone is a record and not a wage; an
        // advance alone is a debt and not a period to close.
        hasWork: attendance > 0 || (amount !== null && amount > 0),
        closed: frozenPeriodFor(schedule, worker.id, period.from, period.to) !== undefined
    };
}

function paybookFirstWorkDay(schedule, workerId) {
    const dates = Object.keys((schedule && schedule.days) || {}).filter(isRealDate).sort();
    for (let at = 0; at < dates.length; at += 1) {
        if (isAbsent(schedule, dates[at], workerId, 'actual')
            || entriesFor(schedule, dates[at], workerId, 'actual').length > 0) return dates[at];
    }
    return null;
}

// Every period of this man's that ended before `current` began, oldest first. Stepped in
// HIS cycle through nextPeriodFor - the walk accountsBefore learned to take after it
// stepped a weekly man in fourteens and counted his week once as carried in and once as
// given.
function paybookEarlierPeriods(schedule, worker, current) {
    const first = paybookFirstWorkDay(schedule, worker.id);
    const out = [];
    if (!first || first >= current.from) return out;
    let period = periodRangeFor(worker, first);
    for (let n = 0; period.to < current.from && n < 4000; n += 1) {
        out.push(period);
        const next = nextPeriodFor(worker, period.from);
        if (!next || next.from <= period.from) break;
        period = next;
    }
    return out;
}

// Every closed period of this man's that shares a DAY with [from, to], with whether it is
// this exact period.
//
// The audit's probe 2 measured the hole this closes. A weekly man's week 10-02..10-08 is
// closed; planPeriodClosure is then asked for 10-02..10-15 and answers canClose: true,
// because overlappingClosures drops any closure that opens on the same Friday as the one
// being asked about - on the reasoning that it must BE the one being asked about. It is
// not: the week and the fortnight open on one Friday and are different periods. The
// closure then deducted his advance against a gross of 3,600, both weeks, with one of
// them already paid. The screen cannot reach it; a second phone or an import can.
//
// So the comparison here is on both ends, and a closure that never recorded its last day
// is given the longest period there is - an overlap that cannot be disproved is one.
function paybookClosedOverlaps(schedule, workerId, from, to) {
    const closed = closedPeriods(schedule, workerId) || {};
    return Object.keys(closed).sort().map(key => {
        const hadTo = closed[key].periodTo === undefined
            ? advanceDayStep(key, 13) : String(closed[key].periodTo);
        return { from: key, to: hadTo, known: closed[key].periodTo !== undefined };
    }).filter(had => had.from <= to && had.to >= from)
        .map(had => Object.assign(had, { exact: had.known && had.from === from && had.to === to }));
}

// ---------------------------------------------------------------- his advances
//
// advanceOutstanding per advance - THE ONE ANSWER, as its own header says - and nothing
// computed here. Debt is their sum; it is never subtracted from, added to or compared with
// the wage he is owed anywhere in this file.
function paybookAdvances(schedule, workerId) {
    const current = currentAdvances(schedule);
    return Object.keys(current)
        .filter(id => String(current[id].workerId) === String(workerId))
        .map(id => {
            const state = advanceOutstanding(schedule, id);
            return { advanceId: id, date: String(current[id].date || ''), given: state.given,
                repaid: state.repaid, deducted: state.deducted, reversed: state.reversed,
                left: state.left, overpaid: state.overpaid };
        })
        .sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1
            : (a.advanceId < b.advanceId ? -1 : 1))));
}

// ---------------------------------------------------------------- the running account
//
// What the list prints for one man, as of `today`.
//
//   current        his OWN period containing today - a week for a weekly man, whatever
//                  range anybody is looking at - and `running` is its wage only while it
//                  is not closed. A closed period's wage is in a statement; it never comes
//                  back into `running`.
//   pending        earlier periods inside tracking, with work and no closure. Listed,
//                  each with its own amount. Not added to `running` and not to each other.
//   wageDue        «יתרת שכר לתשלום»: what closed statements still owe him.
//   debt           what he still owes on advances.
//
// The last two are two numbers in two fields. There is no field holding their difference,
// deliberately: a figure that exists gets printed, and a net of the two is a decision
// about his money that only the person closing the account may make, one advance at a time.
function accountFor(schedule, worker, today) {
    const man = paybookWorker(schedule, worker);
    if (!man || typeof today !== 'string' || !isRealDate(today)) return null;
    return paybookAccount(schedule, man, today, paybookFold(schedule), {});
}

function paybookAccount(schedule, man, today, fold, cache) {
    const workerId = String(man.id);
    const tracking = paybookTrackingStart(schedule, man, fold);
    const period = periodRangeFor(man, today);
    const current = paybookPeriodWage(schedule, man, period, cache);

    const pending = [];
    const beforeTracking = [];
    paybookEarlierPeriods(schedule, man, period).forEach(earlier => {
        const wage = paybookPeriodWage(schedule, man, earlier, cache);
        if (wage.closed || !wage.hasWork) return;
        if (tracking !== null && earlier.from >= tracking) pending.push(wage);
        else beforeTracking.push(wage);
    });

    const advances = paybookAdvances(schedule, workerId);
    const open = advances.filter(row => row.left > 0);
    // WHAT HE OWES IS ONE FIGURE IN THIS APP, and since v180 it is net of his credit.
    //
    // The owner's ruling there (OVERPAYMENT_STAYS_CREDIT, js/model/schema.js): money a
    // man gave back beyond what he owed stays his credit and comes off whatever advance he
    // takes next. The account walk carries it (`creditForward`), and openAdvanceBalance -
    // the sum over his advances every older screen prints - nets it the same way. This
    // fold used to add up `left` alone: a man over-settled by 500 on one advance who then
    // took 1,500 read «חוב מקדמות 1,500» on the accounts page and «חוב פתוח: 1000» on his
    // statement, the same evening, on the same phone (measured at the merge of v180 into
    // this branch; tests/overpayment.test.mjs, «the pay book and the credit»).
    //
    // So: the sum of what is left, less what was over-settled, never below zero - and
    // what is over beyond that is `credit`, its own figure, zero for almost everybody.
    // Neither is ever added to or taken from the wage he is owed; that has not changed.
    // The ROWS are not netted: each advance still says what its own record says (`left`,
    // `overpaid`), a closure is still refused while one of them is over-settled
    // (`overpaid`), and his status is still «לבדיקה» - the credit is a figure, not a way
    // past the person who has to look.
    const owedOnAdvances = paybookSum(open.map(row => row.left));
    const overSettled = (typeof overpaymentStaysCredit === 'function' && overpaymentStaysCredit())
        ? paybookSum(advances.map(row => row.overpaid)) : 0;
    const debt = agoraRound(Math.max(0, owedOnAdvances - overSettled));
    const credit = agoraRound(Math.max(0, overSettled - owedOnAdvances));

    const mine = Object.keys(fold.statements).map(id => fold.statements[id])
        .filter(of => of.workerId === workerId)
        .sort((a, b) => (a.statement.periodFrom < b.statement.periodFrom ? -1 : 1));
    const answered = Object.keys(fold.legacy).map(id => fold.legacy[id])
        .filter(of => of.workerId === workerId);
    const unpaid = mine.filter(of => of.due > 0).map(of => ({
        statementId: of.id, periodFrom: of.statement.periodFrom, periodTo: of.statement.periodTo,
        netDue: of.statement.netDue, owed: of.owed, paid: of.paid, due: of.due, status: of.status
    })).concat(answered.filter(of => of.due > 0).map(of => ({
        statementId: of.id, periodFrom: of.periodFrom, periodTo: of.periodTo,
        netDue: of.entry.due, owed: of.owed, paid: of.paid, due: of.due, status: of.status
    })));
    const wageDue = paybookSum(unpaid.map(row => row.due));
    const wageOverpaid = paybookSum(mine.concat(answered).map(of => of.overpaid));

    // CLOSED, AND NOBODY EVER SAID WHETHER IT WAS PAID. Every closure made before this
    // existed, and every one made since through the old dialog, is a frozen payslip with
    // no payment record beside it. It is not counted as paid and it is not counted as
    // owed: either would be this app asserting something about an envelope it never saw.
    const closed = closedPeriods(schedule, workerId) || {};
    const paymentUnknown = Object.keys(closed).sort()
        .filter(from => !ownsKey(fold.statements, paybookStatementId(workerId, from)))
        .filter(from => !ownsKey(fold.legacy, paybookLegacyId(periodArtifactId(workerId, from))))
        .map(from => ({
            periodFrom: from,
            periodTo: closed[from].periodTo === undefined ? null : String(closed[from].periodTo),
            artifactId: periodArtifactFor(schedule, workerId, from)
                ? periodArtifactId(workerId, from) : null,
            gross: Number.isFinite(closed[from].gross) ? agoraRound(closed[from].gross) : null,
            deducted: agoraRound(closed[from].deducted)
        }));

    const held = fold.held.filter(row => {
        const entry = paybookMap(schedule)[row.id];
        return isPlainObject(entry) && String(entry.workerId) === workerId;
    });
    const conflicts = fold.conflicts.filter(row => row.workerIds.indexOf(workerId) !== -1);
    const overpaidAdvance = advances.some(row => row.overpaid > 0);

    const latest = mine.length > 0 ? mine[mine.length - 1] : null;
    const waiting = pending.length > 0 || (!current.closed && current.hasWork);

    // THE STATUS, by one rule, first match wins:
    //   review    something of his is held, contested or over-settled - a person looks first
    //   waiting   a period with work and no closure: the current one, or an earlier one
    //   partial / closed   his LATEST statement still owes him: part paid, or nothing paid
    //   open      nothing waiting and the latest is settled, but an older wage or a debt stands
    //   paid / closed      his latest statement, settled (closed = a net of nothing, no payment)
    //   none      no account to speak of
    let status = 'none';
    if (held.length > 0 || conflicts.length > 0 || wageOverpaid > 0 || overpaidAdvance) status = 'review';
    else if (waiting) status = 'waiting';
    else if (latest && latest.due > 0) status = latest.status;
    else if (wageDue > 0 || debt > 0) status = 'open';
    else if (latest) status = latest.status;

    const running = current.closed ? 0
        : (PAYBOOK_RULES.earlierUnclosedSummed
            ? (pending.concat([current]).some(wage => wage.gross === null) ? null
                : paybookSum(pending.concat([current]).map(wage => wage.gross)))
            : current.gross);

    return {
        workerId,
        name: String(man.name || ''),
        active: man.active !== false,
        cycle: period.cycle,
        today,
        tracking: { active: tracking !== null, from: tracking },
        current: Object.assign({}, current, {
            statementId: ownsKey(fold.statements, paybookStatementId(workerId, current.from))
                ? paybookStatementId(workerId, current.from) : null
        }),
        // Null when a worked day has no rate: an unknown wage is not a wage of zero.
        running,
        pending,
        beforeTracking,
        advances: open,
        debt,
        // His credit on advances beyond everything he owes (v180's ruling). Never wages.
        credit,
        unpaid,
        wageDue,
        wageOverpaid,
        paymentUnknown,
        held,
        conflicts,
        status
    };
}

// The unified list: every man by HIS cycle, in roster order. `filter.cycle` is 'weekly',
// 'biweekly' or anything else for everybody. A man taken off the active roster stays on
// the list for as long as anything of his is unsettled - archiving somebody must not be a
// way to lose sight of 1,000 he is still owed.
function accountsList(schedule, today, filter) {
    if (typeof today !== 'string' || !isRealDate(today)) return { rows: [], totals: null, today };
    const fold = paybookFold(schedule);
    const cache = {};
    const want = filter && isPayCycle(filter.cycle) ? filter.cycle : 'all';
    const rows = ((schedule && schedule.workers) || [])
        .filter(man => man && man.id !== undefined)
        .map(man => paybookAccount(schedule, man, today, fold, cache))
        .filter(row => want === 'all' || row.cycle === want)
        .filter(row => row.active || row.status !== 'none'
            || row.paymentUnknown.length > 0 || row.beforeTracking.length > 0);
    // Three totals that are never added to each other. `running` is null as soon as one
    // man's wage is unknown - a total that silently skips him reads as the payroll.
    const totals = {
        running: rows.some(row => row.running === null) ? null
            : paybookSum(rows.map(row => row.running)),
        wageDue: paybookSum(rows.map(row => row.wageDue)),
        debt: paybookSum(rows.map(row => row.debt))
    };
    return { today, cycle: want, rows, totals };
}

// ---------------------------------------------------------------- fingerprints
//
// A short name for "the account as it was when this plan was drawn". The review page is
// open for as long as somebody takes to read it, and three phones share the record: by the
// time «אישור» is pressed the advance may have been repaid on another phone, or the
// account closed. stillValid re-plans against the record as it is NOW and compares; the
// fingerprint is what lets it say WHY in one word - the account moved - rather than
// handing back a page of numbers that differ somewhere.
function paybookHash(value) {
    const text = JSON.stringify(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let at = 0; at < text.length; at += 1) {
        const code = text.charCodeAt(at);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ('00000000' + (h2 >>> 0).toString(16)).slice(-8)
        + ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
}

function paybookClosureFingerprint(schedule, man, period, fold, wage) {
    const workerId = String(man.id);
    const mine = Object.keys(paybookMap(schedule)).sort().filter(id => {
        const entry = paybookMap(schedule)[id];
        return isPlainObject(entry) && String(entry.workerId) === workerId;
    });
    return paybookHash({
        workerId,
        period: [period.from, period.to],
        tracking: paybookTrackingStart(schedule, man, fold),
        wage: wage ? [wage.gross, wage.attendanceDays, wage.payUnits, wage.extraHours, wage.closed] : null,
        closed: Object.keys(closedPeriods(schedule, workerId) || {}).sort(),
        advances: paybookAdvances(schedule, workerId).map(row => [row.advanceId, row.given, row.left, row.overpaid]),
        pay: mine.map(id => [id, ownsKey(fold.statements, id) ? fold.statements[id].due : null]),
        conflicts: fold.conflicts.filter(row => row.workerIds.indexOf(workerId) !== -1).map(row => row.id)
    });
}

function paybookTargetFingerprint(of) {
    return paybookHash({
        id: of.id,
        owed: of.owed, paid: of.paid, due: of.due, overpaid: of.overpaid,
        payments: of.payments.map(row => [row.id, row.entry.amount, row.voided]),
        deductions: (of.deductions || []).map(row => [row.id, row.entry.amount, row.voided]),
        adjustments: (of.adjustments || []).map(row => [row.id, row.entry.delta])
    });
}

// ---------------------------------------------------------------- the stamp
//
// `at`, `by` and `today` come from the caller - this file has no clock. They are checked
// because they are WRITTEN: an entry with no moment cannot be ordered against a repayment
// that raced it (outstandingWithout's whole second half), and an entry with no signer is a
// closure nobody can be asked about.
function paybookStampReasons(stamp) {
    const ok = isPlainObject(stamp)
        && typeof stamp.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stamp.at)
        && typeof stamp.by === 'string' && stamp.by.trim() !== '' && stamp.by.length <= 100
        && typeof stamp.today === 'string' && isRealDate(stamp.today)
        && (stamp.rev === undefined || isSafeSeq(stamp.rev));
    return ok ? [] : ['stamp'];
}

function paybookSigned(entry, stamp) {
    const out = Object.assign({}, entry, { at: stamp.at, by: stamp.by });
    if (stamp.rev !== undefined) out.rev = stamp.rev;
    return out;
}

// (8) Who may close and pay. Null is everybody on the allowlist, which is today's rule.
function paybookMayClose(stamp) {
    return PAYBOOK_RULES.whoMayClose === null
        || (Array.isArray(PAYBOOK_RULES.whoMayClose)
            && PAYBOOK_RULES.whoMayClose.indexOf(String((stamp || {}).by)) !== -1);
}

// The gate every financial control already asks (financialWritingEnabled): the writer
// open AND the carry migration settled on THIS record. A planner here that ignored it
// would be a second door into the ledger with no gate on it.
function paybookGateReasons(schedule, stamp) {
    const out = [];
    // BOTH GATES, and the new one first. `paybook` is this build's own answer to "does
    // this phone create pay entries at all"; financialWritingEnabled is the record's
    // answer to "may anything be written against these accounts". Either one shut is
    // `gate` - a caller has nothing different to do about the two.
    //
    // THE THIRD ANSWER (v175): `carry-approval-needed`. The build writes money and this
    // record's carry has not been approved - the one shut gate a person can open, on the
    // spot, with one sentence and one button. Answered as its own code so that a screen
    // never has to translate "everything financial is locked" as "not available": the
    // owner's requirement of 2026-11-10. paybookCarryApproval has what the screen shows.
    if (!paybookWritesEnabled(schedule)
        || (typeof ledgerWritesEnabled === 'function' && !ledgerWritesEnabled())
        || (typeof advanceCarryEnabled === 'function' && !advanceCarryEnabled())) {
        out.push('gate');
    } else if (typeof financialWritingEnabled === 'function' && !financialWritingEnabled(schedule)) {
        out.push('carry-approval-needed');
    }
    if (!paybookMayClose(stamp)) out.push('permission');
    return out;
}

function paybookAddReason(reasons, code) {
    if (reasons.indexOf(code) === -1) reasons.push(code);
}

// ---------------------------------------------------------------- closing: the dry run
//
// planClosure(schedule, worker, { from, to }, choices, { at, by, today })
//
//   choices.allocations   { advanceId: amount }   what comes off EACH open advance
//   choices.extras        [ { amount, category, reason } ]   deductions that are not advances
//   choices.paid          what was handed over at the closing; absent or 0 = not yet
//   choices.paidOn        the day it was handed over (default: today)
//   choices.method, choices.paymentNote, choices.note
//
// It changes nothing. It returns the review page's numbers and, when nothing refuses, the
// exact list of field paths and values a confirm would write, in the order they must be
// written: the artifact, one `deducted` entry per advance touched, the extra deductions,
// the statement, the payment. The first two are built by the ledger's own writers on a
// COPY of the schedule, so their shape is byte for byte what closePeriodChanges writes
// and what every phone in the field already reads.
//
// Every refusal is a stable code in `reasons`; none of them is a sentence, because the
// sentence is Hebrew and the owner's (iron law 6). All that apply are reported, not just
// the first, so a screen can mark every field that is wrong at once.
//
//   worker       nobody by that id. A plan for a man who is not on the roster would freeze
//                a payslip payrollReport cannot even produce a row for.
//   stamp        no moment, no signer or no today - see paybookStampReasons.
//   gate         the financial gate is shut on this record (carry migration unapproved, or
//                a build with the writer off). Nothing has gone wrong yet; without this a
//                phone the owner has not cleared to write money would write it from here.
//   permission   rule (8) names who may close and this signer is not among them.
//   inactive     nobody has activated tracking. A statement written before the opening
//                would claim «יתרת שכר» for a man whose earlier closures nobody has
//                answered for.
//   before-tracking   the period ended before tracking begins - the review list's business.
//   period       [from, to] is not a period this man is settled on (isPeriodFor). This is
//                half of the same-Friday hole: the weekly man's "fortnight" is not his
//                period, and closureProblems's fallback to the fortnight grid let it pass.
//   closed       this exact period already has a closure on the ledger.
//   overlap      a closed period shares a day with this one - compared by DAYS; see
//                paybookClosedOverlaps for the measured case.
//   statement    a statement for this man and period is already in the map, standing or
//                held. Two statements for one period is one wage owed twice.
//   conflict     two phones wrote different money under one of his ids and nobody has
//                settled it. Closing on top of a disagreement buries it.
//   early        today is before the period's last day (rule 4).
//   unpriced     a worked day has no rate, so there is no wage to close on.
//   overpaid     more has been settled against one of his advances than was ever given -
//                the state advanceWalk stops its own deduction on, for the same reason.
//   allocation   an allocation that is not money, or names an advance that is not his,
//                not open, or not offered (dated after the period - rule 6).
//   allocation-missing   an open advance of his that the person gave no answer for.
//   over-advance more off an advance than it has left. Judged against BOTH balances: what
//                closureProblems will judge it by (as of the period's end and this moment)
//                and what is left on it today. The first alone would let a man who repaid
//                300 the day after the period ended be deducted the full 500 as well.
//   over-wage    advances plus extras exceed the period's wage (rule 5).
//   deduction    the account walk allows less than the person chose. MEASURED on bd59a68,
//                and it is not rare: an advance whose OWN period was never closed reads
//                `left: 500` in advanceOutstanding - nothing was ever recorded against it -
//                while advanceWalk has already counted it as taken from that period's
//                wage, so advanceCarryInto answers 0 and advanceAccount refuses any
//                deduction of it later. Two folds of one record, 500 apart. The existing
//                dialog refuses the same way (planPeriodClosure: `deduction`). It cannot
//                be planned around from here: the artifact's carriedIn, net and
//                balanceAfter are the walk's, and a deduction the walk does not know
//                makes the next period open on a negative balance. So it is refused, the
//                two figures are both on the review (`walkRoom` beside each `left`), and
//                reconciling them is a change to js/model/schema.js that a person has to
//                decide - see docs/payroll-closure.md.
//   clock        an entry on a touched advance was recorded after this closure's moment -
//                this phone's clock is behind. planPeriodClosure's reason, kept.
//   extra        an extra deduction with no reason, no category, or an amount that is not
//                money; or more of them than a statement can carry.
//   paid         the paid amount is not money, or its day, method or note is not one.
//   note         the closure's own note is not a note this record carries.
//   overpay      more handed over than the net. The surplus would have nowhere honest to
//                go: it is not an advance (nobody recorded one) and not next week's wage.
//   unpaid       rule (3) flipped to require a payment, and none was named.
//   unsafe-id    an id this closure would mint cannot be a field path (a worker id too
//                long, mostly). Refused before anything is built on it.
//   rejected     the ledger's own writer or judge refused an entry this plan built. It
//                means this file and js/model/ledger.js disagree; freeze nothing.
function planClosure(schedule, worker, period, choices, stamp) {
    const input = paybookClone({ worker: isPlainObject(worker) ? worker.id : worker,
        period, choices: choices || {}, stamp });
    const reasons = paybookStampReasons(stamp);
    const man = paybookWorker(schedule, worker);
    const refuse = extra => ({ kind: 'closure', ok: false, canClose: false,
        reasons: reasons.concat(extra || []), changes: [], input, expects: null, review: null });
    if (!man) return refuse(['worker']);
    if (!isPlainObject(period) || typeof period.from !== 'string' || typeof period.to !== 'string'
        || !isRealDate(period.from) || !isRealDate(period.to)) return refuse(['period']);
    if (reasons.length > 0) return refuse();

    const workerId = String(man.id);
    const from = period.from;
    const to = period.to;
    const picked = isPlainObject(choices) ? choices : {};
    const fold = paybookFold(schedule);
    paybookGateReasons(schedule, stamp).forEach(code => paybookAddReason(reasons, code));

    const statementId = paybookStatementId(workerId, from);
    const artifactId = periodArtifactId(workerId, from);
    if (!isSafeId(statementId) || !isSafeId(artifactId)
        || !isSafeId(paybookDeductionId(workerId, from, PAYBOOK_EXTRAS_MAX))) {
        return refuse(['unsafe-id']);
    }

    // --- is it his period, and is it free.
    const own = isPeriodFor(man, from, to);
    if (!own) paybookAddReason(reasons, 'period');
    const range = own ? periodRangeFor(man, from)
        : { from, to, cycle: payCycleAt(man, from), transition: false };
    const tracking = paybookTrackingStart(schedule, man, fold);
    if (tracking === null) paybookAddReason(reasons, 'inactive');
    else if (from < tracking) paybookAddReason(reasons, 'before-tracking');

    const overlaps = paybookClosedOverlaps(schedule, workerId, from, to);
    if (overlaps.some(had => had.exact) || periodArtifactFor(schedule, workerId, from)) {
        paybookAddReason(reasons, 'closed');
    }
    if (overlaps.some(had => !had.exact)) paybookAddReason(reasons, 'overlap');
    if (ownsKey(paybookMap(schedule), statementId)) paybookAddReason(reasons, 'statement');
    if (fold.conflicts.some(row => row.workerIds.indexOf(workerId) !== -1)) {
        paybookAddReason(reasons, 'conflict');
    }
    if (!PAYBOOK_RULES.closeBeforeLastDay && stamp.today < to) paybookAddReason(reasons, 'early');

    // --- the wage, from the one calculator.
    const wage = paybookPeriodWage(schedule, man, { from, to, cycle: range.cycle,
        transition: range.transition }, null);
    if (wage.gross === null) paybookAddReason(reasons, 'unpriced');
    const gross = wage.gross === null ? 0 : wage.gross;

    // --- his advances, and what the person chose for each.
    const all = paybookAdvances(schedule, workerId);
    if (all.some(row => row.overpaid > 0)) paybookAddReason(reasons, 'overpaid');
    const allocations = isPlainObject(picked.allocations) ? picked.allocations : {};
    if (picked.allocations !== undefined && !isPlainObject(picked.allocations)) {
        paybookAddReason(reasons, 'allocation');
    }
    const rows = [];
    const later = [];
    all.forEach(row => {
        // What closureProblems will judge the deduction against: the advance as it stood
        // on the period's last day, as recorded by this closure's own moment.
        const judged = outstandingWithout(schedule, row.advanceId, null, to, stamp.at);
        const room = agoraRound(Math.min(judged.left, row.left));
        if (!PAYBOOK_RULES.offerLaterDatedAdvances && row.date > to) {
            if (row.left > 0) later.push({ advanceId: row.advanceId, date: row.date,
                given: row.given, left: row.left, offered: false });
            return;
        }
        if (room <= 0 && !ownsKey(allocations, row.advanceId)) return;
        const answered = ownsKey(allocations, row.advanceId);
        const chosen = answered ? allocations[row.advanceId] : 0;
        if (!answered && !PAYBOOK_RULES.unlistedAdvanceMeansZero) {
            paybookAddReason(reasons, 'allocation-missing');
        }
        const wrong = answered ? paybookMoneyProblem(chosen, true) : '';
        if (wrong) paybookAddReason(reasons, 'allocation');
        else if (paybookAgorot(chosen) > paybookAgorot(room)) paybookAddReason(reasons, 'over-advance');
        rows.push({ advanceId: row.advanceId, date: row.date, given: row.given,
            left: room, before: judged.left, chosen: wrong ? 0 : agoraRound(chosen),
            after: wrong ? judged.left : agoraRound(judged.left - chosen),
            leftAfter: wrong ? room : agoraRound(room - chosen),
            offered: true });
    });
    // An answer about an advance that is not on the list above: somebody else's, a later
    // one, a cancelled one, a typo. Silently ignoring it would close the account on fewer
    // deductions than the person believes they chose.
    Object.keys(allocations).forEach(id => {
        if (!rows.some(row => row.advanceId === id)) paybookAddReason(reasons, 'allocation');
    });
    const advanceDeducted = paybookSum(rows.map(row => row.chosen));

    // --- the deductions that are not advances.
    const extras = [];
    const wanted = picked.extras === undefined ? [] : picked.extras;
    if (!Array.isArray(wanted) || wanted.length > PAYBOOK_EXTRAS_MAX) paybookAddReason(reasons, 'extra');
    (Array.isArray(wanted) ? wanted.slice(0, PAYBOOK_EXTRAS_MAX) : []).forEach(extra => {
        const bad = !isPlainObject(extra) || paybookMoneyProblem(extra.amount, false) !== ''
            || PAYBOOK_CATEGORIES.indexOf(extra.category) === -1
            || paybookTextProblem(extra.reason, true) !== '';
        if (bad) { paybookAddReason(reasons, 'extra'); return; }
        extras.push({ amount: agoraRound(extra.amount), category: extra.category,
            reason: extra.reason.trim() });
    });
    const extraDeducted = paybookSum(extras.map(extra => extra.amount));

    if (!PAYBOOK_RULES.deductionsMayExceedWage && wage.gross !== null
        && paybookAgorot(advanceDeducted) + paybookAgorot(extraDeducted) > paybookAgorot(gross)) {
        paybookAddReason(reasons, 'over-wage');
    }
    const netDue = agoraRound(paybookSum([gross]) - advanceDeducted - extraDeducted);

    // What the account WALK says could come off this period - see `deduction` above.
    const walk = advanceAccount(schedule, workerId, from, to);
    const walkRoom = (walk.closed || walk.gross === null) ? 0
        : agoraRound(Math.min(agoraRound(walk.carriedForward + walk.deducted), Math.max(0, walk.gross)));
    if (!walk.closed && paybookAgorot(advanceDeducted) > paybookAgorot(walkRoom)) {
        paybookAddReason(reasons, 'deduction');
    }

    // --- what was actually handed over, which is a different fact from all of the above.
    let paid = 0;
    if (picked.paid !== undefined && picked.paid !== null) {
        if (paybookMoneyProblem(picked.paid, true)) paybookAddReason(reasons, 'paid');
        else paid = agoraRound(picked.paid);
    }
    if (paybookAgorot(paid) > Math.max(0, paybookAgorot(netDue))) paybookAddReason(reasons, 'overpay');
    if (!PAYBOOK_RULES.closeWithNothingPaid && paid === 0 && netDue > 0) paybookAddReason(reasons, 'unpaid');
    const paidOn = picked.paidOn === undefined ? stamp.today : picked.paidOn;
    if (paid > 0 && (typeof paidOn !== 'string' || !isRealDate(paidOn) || paidOn > stamp.today
        || (picked.method !== undefined && PAYBOOK_METHODS.indexOf(picked.method) === -1)
        || paybookTextProblem(picked.paymentNote, false) !== '')) {
        paybookAddReason(reasons, 'paid');
    }
    if (paybookTextProblem(picked.note, false) !== '') paybookAddReason(reasons, 'note');

    const account = paybookAccount(schedule, man, stamp.today, fold, {});
    const wageDueBefore = account.wageDue;
    const debtBefore = account.debt;

    // --- the day list the person reads beside the number.
    const days = workerDaysReport(schedule, man, from, to).map(day => ({
        date: String(day.date),
        absent: Boolean(day.absent),
        sites: (day.entries || []).map(one => String(one.placeId || '')),
        doubled: Boolean(day.doubled),
        extraHours: Number(day.extraHours) || 0,
        amount: day.amount === null || day.amount === undefined ? null : agoraRound(day.amount)
    }));
    const siteDays = {};
    days.forEach(day => day.sites.forEach(placeId => {
        putKey(siteDays, placeId, (ownsKey(siteDays, placeId) ? siteDays[placeId] : 0) + 1);
    }));
    const places = (schedule && schedule.places) || [];
    const sites = Object.keys(siteDays).sort().map(placeId => ({
        placeId,
        name: String((places.filter(place => place && String(place.id) === placeId)[0] || {}).name || ''),
        days: siteDays[placeId]
    }));

    const review = {
        workerId,
        name: String(man.name || ''),
        cycle: range.cycle,
        transition: Boolean(range.transition),
        from,
        to,
        days,
        sites,
        counts: { attendanceDays: wage.attendanceDays, payUnits: wage.payUnits,
            normalDays: wage.normalDays, doubleDays: wage.doubleDays,
            extraHours: wage.extraHours, siteVisits: wage.siteVisits, absent: wage.absent },
        gross: wage.gross,
        advances: rows,
        laterAdvances: later,
        advanceDeducted,
        // The most the account walk lets this closure take off his advances altogether.
        // Lower than the sum of `left` above when an earlier period of his was never
        // closed; the screen has to be able to say so instead of refusing a number that
        // looks legal.
        walkRoom,
        extras,
        extraDeducted,
        netDue,
        // Shown, and added to nothing: his older unpaid wage is its own balance.
        wageDueBefore,
        paid,
        // What THIS closure leaves owing to him, and his whole «יתרת שכר» after it.
        balanceAfter: agoraRound(netDue - paid),
        wageDueAfter: agoraRound(wageDueBefore + netDue - paid),
        // And, apart, what he still owes: every open advance of his, the later ones too.
        debtBefore,
        debtAfter: agoraRound(debtBefore - advanceDeducted),
        // HIS CREDIT ON ADVANCES (v180's ruling; decision 67): what he handed back beyond
        // everything he owes. `debtBefore` above is already net of it, so a page that
        // showed the debt alone would show a smaller debt with nothing naming why. A
        // closure never spends it - it comes off the next advance he takes - so there is
        // one figure, not a before and an after. Zero for almost everybody.
        creditBefore: account.credit
    };
    const expects = paybookClosureFingerprint(schedule, man, { from, to }, fold, wage);
    const ids = { statementId, artifactId, deductionIds: [], extraIds: [], paymentId: null };

    if (reasons.length > 0) {
        const refused = { kind: 'closure', ok: false, canClose: false, reasons, changes: [], input,
            expects, review, ids };
        if (reasons.indexOf('carry-approval-needed') !== -1) {
            refused.carryApproval = paybookCarryApproval(schedule);
        }
        return refused;
    }

    // --- build it, on a copy, with the ledger's own writers.
    const draft = paybookClone(schedule);
    // The SIGNED position (v180), as the old dialog's closePeriodChanges passes it: a
    // payslip of a man who opened in credit records the credit beside a debt of zero.
    const facts = closureFacts(draft, workerId, from, to,
        advancePositionInto(draft, workerId, from), advanceDeducted);
    const walked = advanceAccount(draft, workerId, from, to, advanceDeducted);
    if (!facts || walked.invalidDeduction) {
        return { kind: 'closure', ok: false, canClose: false, reasons: ['deduction'],
            changes: [], input, expects, review, ids };
    }
    const touched = rows.filter(row => row.chosen > 0);
    if (touched.some(row => recordedAfter(schedule, row.advanceId, to, stamp.at).length > 0)) {
        return { kind: 'closure', ok: false, canClose: false, reasons: ['clock'],
            changes: [], input, expects, review, ids };
    }
    const changes = [];
    const rejected = () => ({ kind: 'closure', ok: false, canClose: false, reasons: ['rejected'],
        changes: [], input, expects, review, ids });
    const artifact = recordPeriodArtifact(draft, workerId, from, to, stamp.at, stamp.by, facts);
    if (!artifact) return rejected();
    changes.push(artifact);
    for (let at = 0; at < touched.length; at += 1) {
        const row = touched[at];
        const written = recordPeriodClosed(draft, row.advanceId, workerId, from, to, row.chosen,
            stamp.at, stamp.by, row.after, facts);
        if (!written) return rejected();
        changes.push(written);
        ids.deductionIds.push(written.value.id);
    }
    // JUDGED BY THE JUDGE, before anything is offered for writing. closureProblems is what
    // every door applies to a closure ARRIVING; an entry this planner built that its own
    // app would hold aside at the next boot is the fault recordedAfter's block describes -
    // a phone put into recovery by a closure nobody disagreed about.
    if (changes.some(change => closureProblems(draft, change.value).length > 0)) return rejected();

    // AND IT MAY NOT LOCK THE RECORD BEHIND ITSELF. A deduction that is not exactly the
    // advance given in that fortnight makes the carry "migration" needed (Phase 1,
    // finding 2), and on a record where nobody has approved the carry that shuts every
    // financial control the moment this closure lands - with nothing on any screen saying
    // why. So the closure is refused BEFORE it is written, with the code a screen can act
    // on; the person approves (planCarryApproval), and closes.
    if (paybookWouldLock(draft)) {
        return { kind: 'closure', ok: false, canClose: false, reasons: ['carry-approval-needed'],
            changes: [], input, expects, review, ids, carryApproval: paybookCarryApproval(draft) };
    }

    const debtAfter = Number.isFinite(Number(artifact.value.balanceAfter))
        ? agoraRound(artifact.value.balanceAfter) : review.debtAfter;
    extras.forEach((extra, at) => {
        const id = paybookDeductionId(workerId, from, at + 1);
        ids.extraIds.push(id);
        changes.push({ path: paybookPath(id), value: paybookSigned({
            id, kind: 'deduction', workerId, statementId, date: to,
            amount: extra.amount, category: extra.category, reason: extra.reason
        }, stamp) });
    });
    const statement = {
        id: statementId, kind: 'statement', workerId,
        cycle: range.cycle, transition: Boolean(range.transition),
        periodFrom: from, periodTo: to, date: to,
        artifactId,
        // COPIED from the artifact, never taken from this function's own arithmetic: the
        // statement and the payslip are one closure and may not hold two wages.
        gross: agoraRound(artifact.value.gross),
        advanceDeductions: touched.map(row => ({ advanceId: row.advanceId,
            entryId: closureId(row.advanceId, from), amount: row.chosen,
            before: row.before, after: row.after })),
        advanceDeducted,
        extraIds: ids.extraIds.slice(),
        extraDeducted,
        netDue,
        wageDueBefore,
        debtAfter
    };
    if (typeof picked.note === 'string' && picked.note.trim() !== '') statement.note = picked.note.trim();
    changes.push({ path: paybookPath(statementId), value: paybookSigned(statement, stamp) });
    if (paid > 0) {
        const payment = { id: paybookClosingPaymentId(statementId), kind: 'payment', workerId,
            statementId, date: paidOn, amount: paid };
        if (picked.method !== undefined) payment.method = picked.method;
        if (typeof picked.paymentNote === 'string' && picked.paymentNote.trim() !== '') {
            payment.note = picked.paymentNote.trim();
        }
        ids.paymentId = payment.id;
        changes.push({ path: paybookPath(payment.id), value: paybookSigned(payment, stamp) });
    }
    // And every new entry read by the reader that will have to read it back - the lesson
    // appendLedgerEntry records about a correction it once wrote and could not reopen.
    const unreadable = changes.filter(change => change.path.indexOf('pay.') === 0)
        .some(change => payEntryProblems(change.value.id, change.value).length > 0);
    if (unreadable || agoraRound(artifact.value.gross) !== gross) return rejected();

    return { kind: 'closure', ok: true, canClose: true, reasons: [], changes, input, expects,
        review, ids };
}

// ---------------------------------------------------------------- a later payment
//
// planPayment(schedule, statementId, amount, { paymentId, date, method, note }, stamp)
//
// Money that reached the man after the closing. It names the statement it pays and
// touches nothing else: the statement is never edited, and what is still owed is the fold.
//
//   stamp, gate, permission   as for a closure.
//   target        no standing statement (or owed legacy answer) by that id. A payment
//                 against a closure that is held or absent would wait in `held` forever.
//   payment-id    the id is not one newPaymentId could have minted. The id is the
//                 idempotency key; one made up at press time defeats it.
//   amount        not money, or nothing.
//   overpay       more than that statement still owes. See planClosure's `overpay`.
//   date          not a day, or a day that has not happened yet.
//   method / note not a method or a note this record carries.
//   conflict      this id is already on the record with DIFFERENT money, or the man has
//                 an unsettled disagreement.
//
// THE SAME ID WITH THE SAME MONEY IS NOT A REFUSAL. It is the double tap, the retry after
// an answer was lost, the reload mid-send: `already: true`, no changes, and the caller
// says «נרשם» because it was.
function planPayment(schedule, statementId, amount, options, stamp) {
    const input = paybookClone({ statementId, amount, options: options || {}, stamp });
    const reasons = paybookStampReasons(stamp);
    const done = extra => Object.assign({ kind: 'payment', ok: false, already: false,
        reasons, changes: [], input, expects: null }, extra || {});
    if (reasons.length > 0) return done();
    paybookGateReasons(schedule, stamp).forEach(code => paybookAddReason(reasons, code));
    const fold = paybookFold(schedule);
    const key = String(statementId);
    const target = ownsKey(fold.statements, key) ? fold.statements[key]
        : (ownsKey(fold.legacy, key) && fold.legacy[key].entry.state === 'due' ? fold.legacy[key] : null);
    if (!target) { paybookAddReason(reasons, 'target'); return done(); }
    const expects = paybookTargetFingerprint(target);
    const picked = isPlainObject(options) ? options : {};
    const id = picked.paymentId;
    if (typeof id !== 'string' || !/^pp_[A-Za-z0-9]{6,40}$/.test(id) || !isSafeId(id)) {
        paybookAddReason(reasons, 'payment-id');
    }
    if (paybookMoneyProblem(amount, false)) paybookAddReason(reasons, 'amount');
    const date = picked.date === undefined ? stamp.today : picked.date;
    if (typeof date !== 'string' || !isRealDate(date) || date > stamp.today) paybookAddReason(reasons, 'date');
    if (picked.method !== undefined && PAYBOOK_METHODS.indexOf(picked.method) === -1) {
        paybookAddReason(reasons, 'method');
    }
    if (paybookTextProblem(picked.note, false) !== '') paybookAddReason(reasons, 'note');
    if (fold.conflicts.some(row => row.workerIds.indexOf(target.workerId) !== -1)) {
        paybookAddReason(reasons, 'conflict');
    }
    if (reasons.length > 0) return done({ expects });

    const payment = { id, kind: 'payment', workerId: target.workerId, statementId: key, date,
        amount: agoraRound(amount) };
    if (picked.method !== undefined) payment.method = picked.method;
    if (typeof picked.note === 'string' && picked.note.trim() !== '') payment.note = picked.note.trim();
    const value = paybookSigned(payment, stamp);

    if (ownsKey(paybookMap(schedule), id)) {
        if (paybookSameFact(paybookMap(schedule)[id], value)) {
            return done({ ok: true, already: true, expects, due: target.due, dueAfter: target.due });
        }
        paybookAddReason(reasons, 'conflict');
        return done({ expects });
    }
    if (paybookAgorot(amount) > paybookAgorot(target.due)) {
        paybookAddReason(reasons, 'overpay');
        return done({ expects, due: target.due });
    }
    if (payEntryProblems(id, value).length > 0) { paybookAddReason(reasons, 'rejected'); return done({ expects }); }
    return done({ ok: true, expects, due: target.due,
        dueAfter: agoraRound(target.due - payment.amount),
        changes: [{ path: paybookPath(id), value }] });
}

// ---------------------------------------------------------------- a correction, linked
//
// planVoid(schedule, targetId, { reason, amount, date }, stamp)
//
// A payment or an extra deduction that was recorded in error. Nothing is edited and
// nothing is removed: the original stays, the void names it, and the history shows both.
// One void per target - its id is derived from the target - so the same mistake cannot be
// corrected twice by two phones into money that was never there.
//
// (An ADVANCE deduction is corrected through the ledger's own recordEventReversed, which
// already exists and which the fold above reads; this file does not write a second way.)
//
//   target        nothing standing by that id, or not a payment or an extra deduction.
//   reason        missing. An unexplained change to money is what an append-only record
//                 exists to refuse - the ledger's rule for a reversal, word for word.
//   amount        not money. Absent means the whole of the target.
//   over-target   more than the target carried.
//   voided        the target already has a void with different money. A second correction
//                 of one mistake needs a person, not a bigger number.
//   date          not a day, or not yet.
function planVoid(schedule, targetId, options, stamp) {
    const input = paybookClone({ targetId, options: options || {}, stamp });
    const reasons = paybookStampReasons(stamp);
    const done = extra => Object.assign({ kind: 'void', ok: false, already: false,
        reasons, changes: [], input, expects: null }, extra || {});
    if (reasons.length > 0) return done();
    paybookGateReasons(schedule, stamp).forEach(code => paybookAddReason(reasons, code));
    const fold = paybookFold(schedule);
    const key = String(targetId);
    let target = null;
    let owner = null;
    Object.keys(fold.statements).map(id => fold.statements[id])
        .concat(Object.keys(fold.legacy).map(id => fold.legacy[id]))
        .forEach(of => {
            of.payments.concat(of.deductions || []).forEach(row => {
                if (row.id === key) { target = row; owner = of; }
            });
        });
    if (!target) { paybookAddReason(reasons, 'target'); return done(); }
    const expects = paybookTargetFingerprint(owner);
    const picked = isPlainObject(options) ? options : {};
    if (paybookTextProblem(picked.reason, true) !== '') paybookAddReason(reasons, 'reason');
    const amount = picked.amount === undefined ? target.entry.amount : picked.amount;
    if (paybookMoneyProblem(amount, false)) paybookAddReason(reasons, 'amount');
    else if (paybookAgorot(amount) > paybookAgorot(target.entry.amount)) paybookAddReason(reasons, 'over-target');
    const date = picked.date === undefined ? stamp.today : picked.date;
    if (typeof date !== 'string' || !isRealDate(date) || date > stamp.today) paybookAddReason(reasons, 'date');
    if (reasons.length > 0) return done({ expects });

    const id = paybookVoidId(key);
    const value = paybookSigned({ id, kind: 'void', workerId: target.entry.workerId, targetId: key,
        targetKind: target.entry.kind, statementId: target.entry.statementId, date,
        amount: agoraRound(amount), reason: picked.reason.trim() }, stamp);
    if (ownsKey(paybookMap(schedule), id)) {
        if (paybookSameFact(paybookMap(schedule)[id], value)) {
            return done({ ok: true, already: true, expects });
        }
        paybookAddReason(reasons, 'voided');
        return done({ expects });
    }
    if (!isSafeId(id) || payEntryProblems(id, value).length > 0) {
        paybookAddReason(reasons, 'rejected');
        return done({ expects });
    }
    return done({ ok: true, expects, due: owner.due,
        dueAfter: agoraRound(owner.due + value.amount - Math.min(value.amount, owner.overpaid)),
        changes: [{ path: paybookPath(id), value }] });
}

// planAdjustment(schedule, statementId, delta, { reason, date }, stamp)
//
// A closed net that was itself wrong - a day recorded after the closing, a rate. The
// statement and the artifact are not touched; the adjustment stands under them, signed.
// Its number is the next free one for that statement, so two phones adjusting the same
// statement at once mint ONE id and are either one fact or a visible disagreement.
//
//   target        no standing statement by that id.
//   delta         zero, or not money.
//   reason        missing.
//   below-zero    it would leave him owed less than nothing, or less than he was already
//                 handed. Taking back money that was paid is a conversation and then a
//                 void, not a negative number.
//   date          not a day, or not yet.
function planAdjustment(schedule, statementId, delta, options, stamp) {
    const input = paybookClone({ statementId, delta, options: options || {}, stamp });
    const reasons = paybookStampReasons(stamp);
    const done = extra => Object.assign({ kind: 'adjustment', ok: false, already: false,
        reasons, changes: [], input, expects: null }, extra || {});
    if (reasons.length > 0) return done();
    paybookGateReasons(schedule, stamp).forEach(code => paybookAddReason(reasons, code));
    const fold = paybookFold(schedule);
    const key = String(statementId);
    const target = ownsKey(fold.statements, key) ? fold.statements[key] : null;
    if (!target) { paybookAddReason(reasons, 'target'); return done(); }
    const expects = paybookTargetFingerprint(target);
    const picked = isPlainObject(options) ? options : {};
    const money = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0
        && paybookMoneyProblem(Math.abs(delta), false) === '';
    if (!money) paybookAddReason(reasons, 'delta');
    if (paybookTextProblem(picked.reason, true) !== '') paybookAddReason(reasons, 'reason');
    const date = picked.date === undefined ? stamp.today : picked.date;
    if (typeof date !== 'string' || !isRealDate(date) || date > stamp.today) paybookAddReason(reasons, 'date');
    if (money && paybookAgorot(target.owed) + paybookAgorot(delta) < paybookAgorot(target.paid)) {
        paybookAddReason(reasons, 'below-zero');
    }
    if (reasons.length > 0) return done({ expects });
    const id = paybookAdjustmentId(key, target.adjustments.length + 1);
    const value = paybookSigned({ id, kind: 'adjustment', workerId: target.workerId,
        statementId: key, date, delta: agoraRound(delta), reason: picked.reason.trim() }, stamp);
    if (!isSafeId(id) || ownsKey(paybookMap(schedule), id) || payEntryProblems(id, value).length > 0) {
        paybookAddReason(reasons, 'rejected');
        return done({ expects });
    }
    return done({ ok: true, expects, due: target.due, dueAfter: agoraRound(target.due + value.delta),
        changes: [{ path: paybookPath(id), value }] });
}

// ---------------------------------------------------------------- the activation (Phase 8)
//
// IS THIS RECORD BEING TURNED ON RIGHT NOW? The build offers the step
// (FARKAD_FLAGS.paybookActivation) and the record is not on. With the test seam's
// `paybook: true` every record is already on and this is always false - which is why the
// suites that open the gate through the seam see exactly the planners they always saw.
function paybookActivating(schedule) {
    return typeof paybookActivationOffered === 'function' && paybookActivationOffered()
        && !paybookWritesEnabled(schedule);
}

// THE RECORD AS IT WILL READ ONCE THE OPENING HAS LANDED: a copy of the top level and of
// the pay map with the opening laid in, sharing everything else. Never written anywhere,
// never handed to a writer - it exists so that the dry runs and the gates can be asked of
// the record a person is about to have rather than the one they have.
function paybookActivationView(schedule, date, stamp) {
    const view = Object.assign({}, schedule);
    const book = Object.assign({}, paybookMap(schedule));
    putKey(book, PAYBOOK_OPENING_ID, paybookSigned({ id: PAYBOOK_OPENING_ID, kind: 'opening', date }, stamp));
    view.pay = book;
    return view;
}

// planActivation(schedule, date, stamp) -> the whole of what a person reads before turning
// the pay book on, and the two plans that turn it on. IT WRITES NOTHING: `changes` is
// empty, and the plans inside it are plans.
//
//   state      'off'      this build does not offer the step (and the record is not on)
//              'on'       the record is on already - `since` is its opening day
//              'offered'  it may be turned on (subject to `reasons`)
//   reasons    the opening plan's own: `stamp`, `gate`, `permission`, `date`,
//              `carry-approval-needed` (answered by `carry`, in the same step)
//   opening    planOpening(schedule, date, stamp) - the entry that turns it on
//   carry      planCarryApproval(schedule, stamp) - `already` when the record has it
//   report     the dry runs the docs require a person to read first, each computed on the
//              record AS IT WILL READ (paybookActivationView), by the functions that
//              already exist and by nothing new:
//       debt       planDebtRuling: every man whose open debt reads differently, old and new
//       debtTotals the two sums, and how many men move
//       legacy     planPayMigration: the older closures that will be «לבדיקה» (count), the
//                  unclosed periods inside tracking, what is held or disputed
//       archive    planArchive's totals: the record's size, what could leave it
//       months     planMonths (when that file is loaded): its plan, for monthsPlanLines
//       carry      the carry approval's state and how many rows it moves
//       tracking   the day offered (paybookTrackingDefault), whether it is the day the
//                  owner decided, the day asked, and what the day asked would strand
//
// The screen draws this and computes nothing (js/ui/accounts.js, accDrawActivate).
function planActivation(schedule, date, stamp) {
    const out = { kind: 'activation', state: 'off', ok: false, reasons: [], since: null,
        opening: null, carry: null, report: null, changes: [] };
    const offered = typeof paybookActivationOffered === 'function' && paybookActivationOffered();
    // A build that does not offer the step still says `on` of a record another phone
    // turned on (v190: the offer and the honouring are two flags) - and `off` otherwise.
    if (!offered && !(typeof paybookActivated === 'function' && paybookActivated(schedule))) return out;
    const fold = paybookFold(schedule);
    if (paybookWritesEnabled(schedule)) {
        out.state = 'on';
        out.since = fold.opening ? String(fold.opening.date) : null;
        return out;
    }
    out.state = 'offered';
    const stampBad = paybookStampReasons(stamp);
    if (stampBad.length > 0) { out.reasons = stampBad; return out; }
    const day = (typeof date === 'string' && isRealDate(date) && date <= stamp.today) ? date : stamp.today;
    const view = paybookActivationView(schedule, day, stamp);
    out.opening = planOpening(schedule, date, stamp);
    out.carry = planCarryApproval(schedule, stamp);
    out.reasons = out.opening.reasons.slice();
    out.ok = out.opening.ok === true
        || (out.reasons.length === 1 && out.reasons[0] === 'carry-approval-needed' && out.carry.ok === true);

    const ruling = typeof planDebtRuling === 'function' ? planDebtRuling(schedule, stamp.today) : { workers: [] };
    const debt = ruling.workers.filter(row => row.debt.old !== row.debt.new).map(row => ({
        workerId: row.workerId, name: row.name, asOf: row.debt.asOf,
        old: row.debt.old, new: row.debt.new, recorded: row.debt.recorded,
        advances: row.advances.length }));
    const migration = planPayMigration(view, stamp.today);
    const archive = planArchive(view, stamp.today);
    const months = typeof planMonths === 'function' ? planMonths(view, stamp.today) : null;
    const carry = paybookCarryApproval(view);
    // THE DAY ASKED, beside the day offered. `stranded` are the periods with work that
    // nobody closed, that begin on or after the day offered and end up BEFORE tracking
    // under the day asked: once the record is on they cannot be closed by any door.
    // Empty whenever the day asked is the day offered or earlier.
    const offeredDay = paybookTrackingDefault(stamp.today);
    const stranded = migration.unclosed.filter(row => row.tracking === 'before' && offeredDay !== null && row.from >= offeredDay)
        .map(row => ({ workerId: row.workerId, name: row.name, from: row.from, to: row.to, gross: row.gross }));
    out.report = {
        tracking: { offered: offeredDay, decided: offeredDay === PAYBOOK_TRACKING_DAY_DECIDED, asked: day, stranded },
        debt,
        debtTotals: { men: debt.length, old: paybookSum(debt.map(row => row.old)), new: paybookSum(debt.map(row => row.new)) },
        legacy: { paymentUnknown: migration.paymentUnknown.length, unclosed: migration.unclosed.length,
            held: migration.held.length, conflicts: migration.conflicts.length,
            debtDisagreements: migration.debtDisagreements.length },
        archive: { liveBytes: archive.totals.liveBytes, limitBytes: archive.totals.limitBytes,
            closures: archive.bundles.length, held: archive.totals.held },
        months,
        carry: { needed: carry.needed, approved: carry.approved, rows: carry.rows.length }
    };
    return out;
}

// ---------------------------------------------------------------- the two decisions
//
// planOpening(schedule, date, stamp): the day tracking begins - one entry, one id, so two
// phones activating are one activation or a visible disagreement about the day.
//
//   date      not a day, or a day that has not come.
//   opened    tracking already began on a different day. Moving it would reclassify
//             periods people have already been shown as waiting.
//
// AND IT IS THE ACTIVATION (Phase 8). On a record that is not on yet, in a build that
// offers the step (paybookActivating), this same plan is how the pay book is turned on:
// the opening is the record's own switch (paybookOn, js/model/schema.js). It is then
// judged AS IF it had landed - on a view of the record with the opening laid in - because
// the question "may this record be written against" has a different answer the moment it
// lands: the one-debt ruling comes into force with it, and with the ruling the carry
// (cm_carry) may be needed where it was not before. So `carry-approval-needed` here means
// "needed once this is on", and ALSO "not on the record at all": an activation never
// leaves a record whose carry nobody approved, because until it is approved every older
// surface - the pay sheet, the statement, the worker's card - reads what was handed over
// while the accounts page reads what is left (measured: tests/workercard.test.mjs).
// `activating: true` on the answer says which of the two plans this was.
function planOpening(schedule, date, stamp) {
    const input = paybookClone({ date, stamp });
    const reasons = paybookStampReasons(stamp);
    const activating = paybookActivating(schedule);
    const done = extra => Object.assign({ kind: 'opening', ok: false, already: false,
        reasons, changes: [], input, expects: null, activating }, extra || {});
    if (reasons.length > 0) return done();
    const dateOk = typeof date === 'string' && isRealDate(date) && date <= stamp.today;
    const judged = activating ? paybookActivationView(schedule, dateOk ? date : stamp.today, stamp) : schedule;
    paybookGateReasons(judged, stamp).forEach(code => paybookAddReason(reasons, code));
    if (activating && reasons.indexOf('gate') === -1 && !paybookCarryApproval(judged).approved) {
        paybookAddReason(reasons, 'carry-approval-needed');
    }
    if (!dateOk) paybookAddReason(reasons, 'date');
    if (reasons.length > 0) {
        return done(reasons.indexOf('carry-approval-needed') !== -1
            ? { carryApproval: paybookCarryApproval(judged) } : {});
    }
    const value = paybookSigned({ id: PAYBOOK_OPENING_ID, kind: 'opening', date }, stamp);
    if (ownsKey(paybookMap(schedule), PAYBOOK_OPENING_ID)) {
        if (paybookSameFact(paybookMap(schedule)[PAYBOOK_OPENING_ID], value)) {
            return done({ ok: true, already: true });
        }
        paybookAddReason(reasons, 'opened');
        return done();
    }
    return done({ ok: true, changes: [{ path: paybookPath(PAYBOOK_OPENING_ID), value }] });
}

// planLegacy(schedule, worker, periodFrom, { state: 'paid' | 'due', due, note }, stamp): the
// owner's word on ONE closure that has no payment record. Never inferred, never bulk: this
// is the only way a "payment unknown" row leaves the review list, and it takes a person.
//
//   target    no closure artifact for that man and period, or it has a statement already.
//   state     neither paid nor owed.
//   due       owed, with a sum that is not money or exceeds that closure's own net.
//   answered  already answered differently. One closure, one answer; a change of mind is
//             a payment or a conversation, not a second answer under the first.
function planLegacy(schedule, worker, periodFrom, answer, stamp) {
    const input = paybookClone({ worker: isPlainObject(worker) ? worker.id : worker, periodFrom,
        answer: answer || {}, stamp });
    const reasons = paybookStampReasons(stamp);
    const done = extra => Object.assign({ kind: 'legacy', ok: false, already: false,
        reasons, changes: [], input, expects: null }, extra || {});
    if (reasons.length > 0) return done();
    paybookGateReasons(schedule, stamp).forEach(code => paybookAddReason(reasons, code));
    const man = paybookWorker(schedule, worker);
    const artifact = man && typeof periodFrom === 'string' && isRealDate(periodFrom)
        ? periodArtifactFor(schedule, man.id, periodFrom) : null;
    if (!artifact || String(artifact.kind) !== 'closed'
        || ownsKey(paybookMap(schedule), paybookStatementId(man.id, periodFrom))) {
        paybookAddReason(reasons, 'target');
        return done();
    }
    const picked = isPlainObject(answer) ? answer : {};
    if (picked.state !== 'paid' && picked.state !== 'due') paybookAddReason(reasons, 'state');
    const net = Number.isFinite(Number(artifact.net)) ? Number(artifact.net) : Number(artifact.gross);
    if (picked.state === 'due' && (paybookMoneyProblem(picked.due, false) !== ''
        || (Number.isFinite(net) && paybookAgorot(picked.due) > paybookAgorot(net)))) {
        paybookAddReason(reasons, 'due');
    }
    if (paybookTextProblem(picked.note, false) !== '') paybookAddReason(reasons, 'note');
    if (reasons.length > 0) return done();
    const artifactId = periodArtifactId(man.id, periodFrom);
    const id = paybookLegacyId(artifactId);
    const entry = { id, kind: 'legacy', workerId: String(man.id), artifactId,
        date: String(artifact.periodTo), state: picked.state };
    if (picked.state === 'due') entry.due = agoraRound(picked.due);
    if (typeof picked.note === 'string' && picked.note.trim() !== '') entry.note = picked.note.trim();
    const value = paybookSigned(entry, stamp);
    if (ownsKey(paybookMap(schedule), id)) {
        if (paybookSameFact(paybookMap(schedule)[id], value)) return done({ ok: true, already: true });
        paybookAddReason(reasons, 'answered');
        return done();
    }
    if (!isSafeId(id) || payEntryProblems(id, value).length > 0) {
        paybookAddReason(reasons, 'rejected');
        return done();
    }
    return done({ ok: true, changes: [{ path: paybookPath(id), value }] });
}

// ---------------------------------------------------------------- is the plan still true
//
// stillValid(schedule, plan): the question asked at the moment of «אישור», against the
// record as it is NOW. The plan is drawn again from its own inputs and has to come out the
// same - same fingerprint, same changes, byte for byte. If it does not, the answer is
// `stale` plus whatever the fresh plan itself refuses with, and the fresh plan is handed
// back so the review can be redrawn from it. Nothing is written either way.
//
// The measured case is the audit's probe 3E: two phones, one account, different
// deductions - the first landed and the second phone was stopped by Recovery with a
// disagreement nobody could act on. Re-checked here, the second phone is told the account
// was closed while it was looking, and is not stopped.
function stillValid(schedule, plan) {
    if (!isPlainObject(plan) || !isPlainObject(plan.input)) {
        return { ok: false, reasons: ['stale'], fresh: null };
    }
    const input = plan.input;
    let fresh = null;
    if (plan.kind === 'closure') {
        fresh = planClosure(schedule, input.worker, input.period, input.choices, input.stamp);
    } else if (plan.kind === 'payment') {
        fresh = planPayment(schedule, input.statementId, input.amount, input.options, input.stamp);
    } else if (plan.kind === 'void') {
        fresh = planVoid(schedule, input.targetId, input.options, input.stamp);
    } else if (plan.kind === 'adjustment') {
        fresh = planAdjustment(schedule, input.statementId, input.delta, input.options, input.stamp);
    } else if (plan.kind === 'opening') {
        fresh = planOpening(schedule, input.date, input.stamp);
    } else if (plan.kind === 'legacy') {
        fresh = planLegacy(schedule, input.worker, input.periodFrom, input.answer, input.stamp);
    }
    if (!fresh) return { ok: false, reasons: ['stale'], fresh: null };
    const same = fresh.ok === true && plan.ok === true && fresh.already !== true
        && fresh.expects === plan.expects
        && JSON.stringify(fresh.changes) === JSON.stringify(plan.changes);
    if (same) return { ok: true, reasons: [], fresh };
    // The plan already landed - the same entry, the same money - is not a stale plan. It
    // is a finished one, and the caller must be able to tell the two apart: one says
    // "look again", the other says "done".
    if (fresh.already === true) return { ok: false, reasons: ['done'], fresh };
    const reasons = ['stale'];
    fresh.reasons.forEach(code => paybookAddReason(reasons, code));
    return { ok: false, reasons, fresh };
}

// ---------------------------------------------------------------- closing several men
//
// planGroupClosure(schedule, workers, scope, choicesByWorker, stamp)
//
//   scope   { date }            each man's OWN period containing that day, or
//           { from, to }        that exact window - refused per man if it is not his period
//           plus { cycle }      'weekly' | 'biweekly' to take only men on that cycle
//
// One independent plan per man. No plan depends on another: every id is derived from the
// man, so the plans can be written in any order, one transaction each, and one man's
// refusal says nothing about the next. That independence is the feature - a fused "close
// and pay N workers" either blocks nine men on the tenth's unpriced day or closes nine and
// reports the batch as failed.
//
//   outcome 'write'    a plan with changes
//           'done'     his statement for that period already stands - a retry skips him
//           'skip'     not on the cycle asked for (reason `cycle`), or named twice (`twice`)
//           'refuse'   his plan refused, with planClosure's own reasons
function planGroupClosure(schedule, workers, scope, choicesByWorker, stamp) {
    const fold = paybookFold(schedule);
    const wanted = isPlainObject(scope) ? scope : {};
    const seen = {};
    const results = (Array.isArray(workers) ? workers : []).map(worker => {
        const man = paybookWorker(schedule, worker);
        const workerId = man ? String(man.id) : String(isPlainObject(worker) ? worker.id : worker);
        const row = { workerId, name: man ? String(man.name || '') : '', period: null,
            outcome: 'refuse', reasons: [], plan: null };
        if (ownsKey(seen, workerId)) return Object.assign(row, { outcome: 'skip', reasons: ['twice'] });
        putKey(seen, workerId, true);
        if (!man) return Object.assign(row, { reasons: ['worker'] });
        let period = null;
        if (typeof wanted.from === 'string' && typeof wanted.to === 'string') {
            period = { from: wanted.from, to: wanted.to };
        } else if (typeof wanted.date === 'string' && isRealDate(wanted.date)) {
            const own = periodRangeFor(man, wanted.date);
            period = { from: own.from, to: own.to };
        }
        if (!period || !isRealDate(period.from) || !isRealDate(period.to)) {
            return Object.assign(row, { reasons: ['period'] });
        }
        row.period = period;
        if (isPayCycle(wanted.cycle) && payCycleAt(man, period.from) !== wanted.cycle) {
            return Object.assign(row, { outcome: 'skip', reasons: ['cycle'] });
        }
        const statementId = paybookStatementId(workerId, period.from);
        if (ownsKey(fold.statements, statementId)
            && fold.statements[statementId].statement.periodTo === period.to) {
            return Object.assign(row, { outcome: 'done', statementId });
        }
        const choices = isPlainObject(choicesByWorker) && ownsKey(choicesByWorker, workerId)
            ? choicesByWorker[workerId] : {};
        const plan = planClosure(schedule, man, period, choices, stamp);
        return Object.assign(row, { plan, outcome: plan.ok ? 'write' : 'refuse',
            reasons: plan.reasons.slice() });
    });
    const count = outcome => results.filter(row => row.outcome === outcome).length;
    return { results, counts: { write: count('write'), done: count('done'),
        skip: count('skip'), refuse: count('refuse') } };
}

// ---------------------------------------------------------------- a commit, modelled
//
// paybookApply(schedule, changes) -> { schedule, applied, same, conflicts, refused }
//
// A NEW schedule with the changes laid in, by the laws the record keeps: nothing is ever
// overwritten and nothing removed. An id already there with the same money is the same
// fact and the first copy stands; with different money, the first copy still stands and
// the other is kept beside it under `payConflicted` for a person, never merged and never
// chosen between - there is no honest rule that could (mergeLedgerInto's own words).
//
// This is NOT the write path. A real commit is State.commitPaybook (journal first, one
// batch) and, for money, a later phase's single server transaction. This exists so the
// suites - and a dry run - can ask what the record would say AFTER a plan, and what two
// phones' plans say together, without any of that machinery. It keeps the first copy it
// was handed; the stored record's rule for WHICH copy stands between two phones is
// paybookUnion's, and it is stricter: the cloud's.
function paybookApply(schedule, changes) {
    const next = paybookClone(schedule) || {};
    const out = { schedule: next, applied: [], same: [], conflicts: [], refused: [] };
    (Array.isArray(changes) ? changes : []).forEach(change => {
        const path = String((change || {}).path || '');
        const parts = path.split('.');
        const value = (change || {}).value;
        let family = null;
        let id = null;
        if (parts.length === 2 && parts[0] === 'pay') {
            id = parts[1];
            if (payEntryProblems(id, value).length > 0) { out.refused.push(path); return; }
            if (!isPlainObject(next.pay)) next.pay = {};
            family = next.pay;
        } else if (parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'advances') {
            id = parts[2];
            if (ledgerEntryProblems(id, value).length > 0) { out.refused.push(path); return; }
            next.ledger = isPlainObject(next.ledger) ? next.ledger : {};
            if (!isPlainObject(next.ledger.advances)) next.ledger.advances = {};
            family = next.ledger.advances;
        } else {
            out.refused.push(path);
            return;
        }
        if (!ownsKey(family, id)) {
            putKey(family, id, paybookClone(value));
            out.applied.push(path);
            return;
        }
        const one = parts[0] === 'pay' ? paybookSameFact(family[id], value) : sameLedgerFact(family[id], value);
        if (one) { out.same.push(path); return; }
        out.conflicts.push(path);
        if (parts[0] === 'pay') {
            if (!isPlainObject(next.payConflicted)) next.payConflicted = {};
            if (!ownsKey(next.payConflicted, id)) putKey(next.payConflicted, id, []);
            if (!next.payConflicted[id].some(had => sameLedgerBytes(had, value))) {
                next.payConflicted[id].push(paybookClone(value));
            }
        }
    });
    return out;
}

// ---------------------------------------------------------------- the history
//
// closureHistory(schedule, query): every closure on the record with its whole summary -
// which advance, how much came off it, how much was left - newest period first.
//
//   query.workerId     that man
//   query.text         part of a name
//   query.closedFrom / query.closedTo     the local day the closure was WRITTEN on
//   query.periodFrom / query.periodTo     work periods sharing a day with that window
//   query.cycle        'weekly' | 'biweekly'
//   query.status       'closed' | 'partial' | 'paid' | 'review' | 'unknown'
//                      | 'legacy-paid' | 'legacy-due'
//
// A closure made before statements existed is on the list too, read off its artifact and
// its `deducted` entries, with status `unknown` until the owner answers for it. A history
// that left those out would show a man's account beginning the week this was switched on.
function closureHistory(schedule, query) {
    const want = isPlainObject(query) ? query : {};
    const fold = paybookFold(schedule);
    const ledger = paybookLedger(schedule);
    const legacyField = (schedule && isPlainObject(schedule.advances)) ? schedule.advances : {};
    const rows = [];
    ((schedule && schedule.workers) || []).filter(man => man && man.id !== undefined).forEach(man => {
        const workerId = String(man.id);
        const closed = closedPeriods(schedule, workerId) || {};
        Object.keys(closed).forEach(from => {
            const artifact = periodArtifactFor(schedule, workerId, from);
            const statementId = paybookStatementId(workerId, from);
            const of = ownsKey(fold.statements, statementId) ? fold.statements[statementId] : null;
            const legacyId = paybookLegacyId(periodArtifactId(workerId, from));
            const answer = artifact && ownsKey(fold.legacy, legacyId) ? fold.legacy[legacyId] : null;
            const to = closed[from].periodTo === undefined ? null : String(closed[from].periodTo);
            const own = to !== null && isPeriodFor(man, from, to) ? periodRangeFor(man, from) : null;
            const at = artifact ? String(artifact.at || '') : '';
            // Read off the ledger whether or not a statement stands, so the two can be
            // laid side by side: what came off each advance at this closure, what it
            // left, and what a later correction gave back.
            const deductions = Object.keys(ledger).map(id => ledger[id])
                .filter(entry => entry && String(entry.kind) === 'deducted'
                    && String(entry.periodFrom) === from
                    && String(entry.id) === closureId(entry.advanceId, from)
                    // Whose it is, by closedPeriods' own rule: the advance says, and the
                    // entry only where no advance is left to ask.
                    && String(ownsKey(legacyField, String(entry.advanceId))
                        ? (legacyField[String(entry.advanceId)] || {}).workerId
                        : entry.workerId) === workerId)
                .map(entry => {
                    const amount = agoraRound(entry.amount);
                    const after = entry.balanceAfter === undefined ? null : agoraRound(entry.balanceAfter);
                    return {
                        advanceId: String(entry.advanceId), entryId: String(entry.id), amount,
                        before: after === null ? null : agoraRound(after + amount),
                        after,
                        reversed: paybookSum(Object.keys(ledger).map(id => ledger[id])
                            .filter(other => other && String(other.kind) === 'reversed'
                                && String(other.targetId || '') === String(entry.id))
                            .map(other => other.amount)),
                        leftNow: advanceOutstanding(schedule, entry.advanceId).left
                    };
                })
                .sort((a, b) => (a.advanceId < b.advanceId ? -1 : 1));
            const gross = Number.isFinite(closed[from].gross) ? agoraRound(closed[from].gross) : null;
            const advanceDeducted = agoraRound(closed[from].deducted);
            const settled = of || answer || null;
            rows.push({
                workerId,
                name: String(man.name || ''),
                cycle: of ? of.statement.cycle : (own ? own.cycle : payCycleAt(man, from)),
                transition: of ? of.statement.transition : Boolean(own && own.transition),
                periodFrom: from,
                periodTo: to,
                closedAt: at,
                closedOn: paybookDayOf(at),
                closedBy: artifact ? String(artifact.by || '') : '',
                artifactId: artifact ? periodArtifactId(workerId, from) : null,
                statementId: of ? statementId : null,
                source: of ? 'statement' : 'artifact',
                gross,
                advanceDeductions: deductions,
                advanceDeducted,
                extras: of ? of.deductions.map(row => ({ id: row.id, amount: row.entry.amount,
                    category: row.entry.category, reason: row.entry.reason, voided: row.voided })) : [],
                extraDeducted: of ? of.statement.extraDeducted : 0,
                adjustments: of ? of.adjustments.map(row => ({ id: row.id, delta: row.entry.delta,
                    reason: row.entry.reason, date: row.entry.date })) : [],
                netDue: of ? of.statement.netDue
                    : (gross === null ? null : agoraRound(gross - advanceDeducted)),
                payments: settled ? settled.payments.map(row => ({ id: row.id, date: row.entry.date,
                    amount: row.entry.amount, method: row.entry.method, voided: row.voided })) : [],
                owed: settled ? settled.owed : null,
                paid: settled ? settled.paid : null,
                due: settled ? settled.due : null,
                overpaid: settled ? settled.overpaid : null,
                debtAfter: closed[from].balanceAfter === undefined ? null
                    : agoraRound(closed[from].balanceAfter),
                status: of ? of.status : (answer ? answer.status : 'unknown')
            });
        });
    });
    const text = typeof want.text === 'string' ? want.text.trim() : '';
    return rows
        .filter(row => want.workerId === undefined || row.workerId === String(want.workerId))
        .filter(row => text === '' || row.name.indexOf(text) !== -1)
        .filter(row => !isPayCycle(want.cycle) || row.cycle === want.cycle)
        .filter(row => want.status === undefined || row.status === want.status)
        .filter(row => want.closedFrom === undefined || (row.closedOn !== '' && row.closedOn >= want.closedFrom))
        .filter(row => want.closedTo === undefined || (row.closedOn !== '' && row.closedOn <= want.closedTo))
        .filter(row => want.periodTo === undefined || row.periodFrom <= want.periodTo)
        .filter(row => want.periodFrom === undefined
            || (row.periodTo === null ? row.periodFrom : row.periodTo) >= want.periodFrom)
        .sort((a, b) => (a.periodFrom !== b.periodFrom ? (a.periodFrom < b.periodFrom ? 1 : -1)
            : (a.name !== b.name ? (a.name < b.name ? -1 : 1) : (a.workerId < b.workerId ? -1 : 1))));
}

// ---------------------------------------------------------------- the migration, as a report
//
// planPayMigration(schedule, today): what switching this on would find, WITHOUT doing any
// of it - the courtesy planRateStamping, planAdvanceCarry and planCarryMigration give, for
// the same reason. `changes` is an empty list and there is no function in this file that
// turns the report into writes: every row here is a question, and each one is answered by
// a person, one at a time (planOpening, planLegacy), or not at all.
//
// What can be reconstructed and what cannot is said per row, because the difference is
// the whole point. An advance has its id, man, date, amount and every repayment, reversal
// and deduction written since the ledger opened. What nobody can reconstruct is which
// WAGE an older advance was taken out of before closures existed, and whether any closed
// period was actually paid. Nothing is invented for either.
function planPayMigration(schedule, today) {
    const fold = paybookFold(schedule);
    const ledger = paybookLedger(schedule);
    const legacyField = (schedule && schedule.advances) || {};
    const current = currentAdvances(schedule);
    const withoutOrigin = advancesWithoutOrigin(schedule);
    const closures = [];
    const unclosed = [];
    const debtDisagreements = [];
    const cache = {};
    ((schedule && schedule.workers) || []).filter(man => man && man.id !== undefined).forEach(man => {
        const workerId = String(man.id);
        const closed = closedPeriods(schedule, workerId) || {};
        Object.keys(closed).sort().forEach(from => {
            const statementId = paybookStatementId(workerId, from);
            const artifact = periodArtifactFor(schedule, workerId, from);
            const legacyId = paybookLegacyId(periodArtifactId(workerId, from));
            const answer = artifact && ownsKey(fold.legacy, legacyId) ? fold.legacy[legacyId] : null;
            const gross = Number.isFinite(closed[from].gross) ? agoraRound(closed[from].gross) : null;
            closures.push({
                workerId, name: String(man.name || ''), periodFrom: from,
                periodTo: closed[from].periodTo === undefined ? null : String(closed[from].periodTo),
                artifactId: artifact ? periodArtifactId(workerId, from) : null,
                gross, deducted: agoraRound(closed[from].deducted),
                net: gross === null ? null : agoraRound(gross - closed[from].deducted),
                // NEVER 'paid' BY DEFAULT. Absence of a payment record on a closure made
                // before payment records existed says nothing at all.
                payment: ownsKey(fold.statements, statementId) ? 'tracked'
                    : (answer ? 'answered-' + answer.entry.state : 'unknown'),
                // A closure with no artifact is from before artifacts: there is nothing
                // for an answer to hang on, so it can be listed and cannot be answered.
                answerable: Boolean(artifact) && !ownsKey(fold.statements, statementId) && !answer
            });
        });
        if (typeof today === 'string' && isRealDate(today)) {
            const account = paybookAccount(schedule, man, today, fold, cache);
            account.pending.forEach(wage => unclosed.push(Object.assign({ workerId,
                name: String(man.name || ''), tracking: 'inside' }, wage)));
            account.beforeTracking.forEach(wage => unclosed.push(Object.assign({ workerId,
                name: String(man.name || ''), tracking: 'before' }, wage)));
            // TWO FOLDS, ONE DEBT, AND THEY NEED NOT AGREE. advanceOutstanding counts only
            // what was RECORDED against an advance; advanceWalk also counts what an
            // unclosed earlier period WOULD have deducted. A man with 500 from a
            // fortnight nobody closed owes 500 by the first and nothing by the second
            // (measured; see planClosure's `deduction`). Neither is repaired here. Both
            // are printed, because which of them is his debt is exactly the kind of
            // history this app was never told and may not assume.
            const walk = advanceAccount(schedule, workerId, account.current.from, account.current.to);
            // (Since v180 both are read NET OF HIS CREDIT when the credit ruling is in
            // force: the walk's signed position, and the advances' left less what was
            // over-settled. Otherwise an over-settled advance - which is already its own
            // line in this report - would also be listed here as a disagreement between
            // two folds that in fact agree.)
            const keeps = typeof overpaymentStaysCredit === 'function' && overpaymentStaysCredit();
            const walked = !keeps
                ? (walk.closed ? walk.carriedForward : agoraRound(walk.carriedForward + walk.deducted))
                : (walk.closed ? walk.position : agoraRound(walk.position + walk.deducted));
            const mine = paybookAdvances(schedule, workerId).filter(row => row.date <= account.current.to);
            const folded = !keeps
                ? paybookSum(mine.filter(row => row.left > 0).map(row => row.left))
                : agoraRound(paybookSum(mine.map(row => row.left)) - paybookSum(mine.map(row => row.overpaid)));
            if (paybookAgorot(walked) !== paybookAgorot(folded)) {
                debtDisagreements.push({ workerId, name: String(man.name || ''),
                    byAdvance: folded, byAccountWalk: walked });
            }
        }
    });
    const ids = Object.keys(current).concat(Object.keys(legacyField))
        .filter((id, at, list) => list.indexOf(id) === at).sort();
    const advances = ids.map(id => {
        const of = current[id] || legacyField[id] || {};
        const history = advanceHistory(schedule, id);
        const origin = history.filter(entry => String(entry.kind) === 'given')[0] || null;
        const state = advanceOutstanding(schedule, id);
        const moved = history.filter(entry => ['repaid', 'deducted', 'reversed', 'corrected']
            .indexOf(String(entry.kind)) !== -1).length;
        return {
            advanceId: id, workerId: String(of.workerId || ''), date: String(of.date || ''),
            given: state.given, left: state.left, overpaid: state.overpaid,
            entries: history.length, movements: moved,
            //   unmirrored   only the old field knows it; the boot mirror writes its origin
            //   no-origin    events with nothing to stand on - a person's question
            //   migrated     mirrored from the old field: when and by whom it was first
            //                written down is not known and is not invented (`at: ''`)
            //   recorded     written through the ledger, with its moment and signer
            history: history.length === 0 ? 'unmirrored'
                : (withoutOrigin.indexOf(id) !== -1 || !origin ? 'no-origin'
                    : (String(origin.at || '') === '' ? 'migrated' : 'recorded')),
            // Its balance is the fold's and is exact. What it was DEDUCTED from, period
            // by period, exists only for deductions made since closures recorded them.
            allocation: history.some(entry => String(entry.kind) === 'deducted') ? 'recorded'
                : (state.left < state.given ? 'balance-only' : 'untouched')
        };
    });
    return {
        // Said out loud, so the caller does not have to trust a comment.
        changes: [],
        writes: 0,
        today: typeof today === 'string' ? today : null,
        opening: fold.opening ? { date: fold.opening.date, at: fold.opening.at, by: fold.opening.by } : null,
        closures,
        paymentUnknown: closures.filter(row => row.payment === 'unknown'),
        unclosed,
        debtDisagreements,
        advances,
        held: fold.held,
        conflicts: fold.conflicts,
        // The checks that already exist, reported unchanged beside the new ones.
        impossibleClosures: impossibleClosures(schedule),
        advancesWithoutOrigin: withoutOrigin,
        ledgerEntries: Object.keys(ledger).length
    };
}

// =====================================================================================
// PHASE 3 (v175): the server-first operation, the closed document, and the index
// =====================================================================================
//
// Three things the phases before this one did not have, all of them pure:
//
//   the operation     a plan, turned into the ONE thing that is sent: its field paths, the
//                     id of the closed document it creates, and that document's body.
//                     js/sync/transact.js sends it as one transaction and nothing else
//                     sends a pay path at all.
//   the carry         `carry-approval-needed` instead of a bare `gate`, with what a screen
//                     needs to offer the approval on the spot.
//   the split         what would leave the live document (planHistoryMove), and the small
//                     index that would stay (paybookIndexFrom) - with the folds from the
//                     index, so a suite can show they equal the folds from the whole
//                     history. NOTHING HERE MOVES ANYTHING: the functions report.

// ---------------------------------------------------------------- the queue door, shut
//
// Does a pay entry travel through the ORDINARY queue? Since v175: no. A closure, a payment
// or a void is one transaction of its own (js/sync/transact.js) and is adopted from the
// server's document when it has committed - it is never journalled as an edit and never
// waits in the outbox, where Phase 2 measured a closure being cut in two by the 296-path
// limit and accepted offline. FARKAD_FLAGS.paybookQueue is the old door, off in every
// build; the Phase 2 suites open it through the test seam, because two phones holding
// different pay entries - the state the union and the conflict rule exist for - cannot be
// produced any other way.
function paybookQueueEnabled() {
    return typeof FARKAD_FLAGS !== 'undefined' && FARKAD_FLAGS.paybookQueue === true;
}

function isPaybookPath(path) {
    return typeof path === 'string' && path.indexOf('pay.') === 0;
}

// ---------------------------------------------------------------- the carry approval
//
// WHAT THE OWNER MUST NEVER MEET: every financial control locked, and nothing saying why.
// financialWritingEnabled goes false on a record whose carry "migration" is needed and
// not approved (planCarryMigration) - and the first PARTIAL deduction makes it needed
// (Phase 1, finding 2). The old answer from every planner was `gate`, which a screen can
// only translate as "not available".
//
// { needed, approved, id, rows }: `rows` are planCarryMigration's own, so the screen can
// lay out exactly what the existing approval dialog in ⋯ lays out. `needed && !approved`
// is the state that locks.
function paybookCarryApproval(schedule) {
    const plan = planCarryMigration(schedule);
    return {
        id: plan.id,
        needed: plan.needed === true,
        approved: carryMigrationApproved(schedule, plan),
        rows: paybookClone(plan.rows)
    };
}

// The approval itself, as a plan: one field path, ledger.migrations.cm_carry, built by the
// ledger's own writer on a COPY. It is NOT a pay entry and does not go through the
// server-first door - it is the record the existing dialog writes, by the existing path
// (State.commitMany), and three phones approving it are one fact (recordCarryApproval).
//
//   stamp, permission   as for a closure
//   gate                this build does not write the ledger at all
//   already: true       it is approved; nothing to write, and that is not a refusal
function planCarryApproval(schedule, stamp) {
    const reasons = paybookStampReasons(stamp);
    const done = extra => Object.assign({ kind: 'carry-approval', ok: false, already: false,
        reasons, changes: [], carryApproval: null }, extra || {});
    if (reasons.length > 0) return done();
    // While a record is being ACTIVATED (Phase 8) the approval is part of that step: it is
    // judged on the record as it will read once the opening lands, which is the only
    // reading under which "what will the carry move" has the answer the person needs.
    const activating = paybookActivating(schedule);
    const judged = activating ? paybookActivationView(schedule, stamp.today, stamp) : schedule;
    if (!(paybookWritesEnabled(schedule) || activating) || !ledgerWritesEnabled() || !advanceCarryEnabled()) {
        paybookAddReason(reasons, 'gate');
    }
    if (!paybookMayClose(stamp)) paybookAddReason(reasons, 'permission');
    const state = paybookCarryApproval(judged);
    if (reasons.length > 0) return done({ carryApproval: state });
    if (state.approved) return done({ ok: true, already: true, carryApproval: state });
    const draft = paybookClone(judged);
    const written = recordCarryApproval(draft, planCarryMigration(draft), stamp.at, stamp.by);
    if (!written || written.already || journalEntryProblems(written.path, written.value).length > 0) {
        return done({ reasons: ['rejected'], carryApproval: state });
    }
    return done({ ok: true, changes: [{ path: written.path, value: written.value }], carryApproval: state });
}

// Would THIS closure, once written, leave the record locked? Asked of the draft the
// planner has just built - the schedule with the closure's ledger entries laid in.
function paybookWouldLock(draft) {
    const plan = planCarryMigration(draft);
    return plan.needed && !carryMigrationApproved(draft, plan);
}

// ---------------------------------------------------------------- the operation
//
// paybookOperation(plan) -> { ok, reasons, kind, closedId, workerId, entries, paths }
//
// A plan's `changes`, as the one thing the server-first door sends. `closedId` names the
// closed document the transaction creates: the statement's id for a closure (so two phones
// closing one man's one period aim at ONE document, and the second finds it there), the
// entry's own id for a payment, a void, an adjustment, the opening or a legacy answer.
//
//   plan       not a plan that may be written (ok false, already, or no changes)
//   paths      a path that is neither pay.<id> nor ledger.advances.<id>, one path twice,
//              or a value its own reader refuses
//   no-entry   nothing in it is a pay entry. The server-first door is the pay book's; a
//              batch of ledger entries alone is the existing dialog's and goes its way.
function paybookOperation(plan) {
    const refuse = code => ({ ok: false, reasons: [code], kind: null, closedId: null,
        workerId: null, entries: {}, paths: [] });
    if (!isPlainObject(plan) || plan.ok !== true || plan.already === true
        || !Array.isArray(plan.changes) || plan.changes.length === 0) return refuse('plan');
    const entries = {};
    const paths = [];
    let bad = false;
    plan.changes.forEach(change => {
        const path = isPlainObject(change) && typeof change.path === 'string' ? change.path : '';
        const parts = path.split('.');
        const isPay = parts.length === 2 && parts[0] === 'pay';
        const isEntry = parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'advances';
        if ((!isPay && !isEntry) || ownsKey(entries, path)
            || journalEntryProblems(path, change.value).length > 0) { bad = true; return; }
        putKey(entries, path, paybookClone(change.value));
        paths.push(path);
    });
    if (bad) return refuse('paths');
    const pay = paths.filter(isPaybookPath);
    if (pay.length === 0) return refuse('no-entry');
    const statement = pay.map(path => entries[path]).filter(entry => entry.kind === 'statement')[0];
    const head = statement || entries[pay[0]];
    const closedId = String(head.id);
    if (!isSafeId(closedId)) return refuse('paths');
    return { ok: true, reasons: [], kind: String(plan.kind || head.kind), closedId,
        workerId: head.workerId === undefined ? null : String(head.workerId), entries, paths };
}

// The closed document's body. Everything the operation adds to the record, verbatim, under
// the field paths it adds it at - so the closed documents laid back over a document that
// has dropped them rebuild it byte for byte, and no second description of a closure exists
// to drift from the first. `opId` and `revision` are the commit that created it; the rules
// check both against the schedule in the same commit (closedMatchesSchedule).
const PAYBOOK_CLOSED_VERSION = 1;

function paybookClosedDocument(operation, opId, revision) {
    return {
        v: PAYBOOK_CLOSED_VERSION,
        id: operation.closedId,
        kind: operation.kind,
        workerId: operation.workerId,
        opId: String(opId),
        revision,
        entries: paybookClone(operation.entries)
    };
}

// Everything wrong with a closed document as it arrives - from the server, from a backup
// file. Empty means this build could have written it. The entries are judged by the
// journal's own grammar, the same as if they were arriving as field paths.
function paybookClosedProblems(id, value) {
    if (!isPlainObject(value)) return ['a closed document that is not a record'];
    const out = [];
    if (value.v !== PAYBOOK_CLOSED_VERSION) out.push('a closed document of a version this build does not read');
    if (typeof value.id !== 'string' || value.id !== String(id) || !isSafeId(value.id)) {
        out.push('a closed document filed under another name');
    }
    if (typeof value.opId !== 'string' || value.opId === '' || value.opId.length >= 128) {
        out.push('a closed document that does not name its operation');
    }
    if (!Number.isInteger(value.revision) || value.revision < 1) {
        out.push('a closed document that does not name its revision');
    }
    if (!isPlainObject(value.entries) || Object.keys(value.entries).length === 0) {
        out.push('a closed document with nothing in it');
        return out;
    }
    Object.keys(value.entries).forEach(path => {
        const parts = path.split('.');
        const known = (parts.length === 2 && parts[0] === 'pay')
            || (parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'advances');
        if (!known || journalEntryProblems(path, value.entries[path]).length > 0) {
            out.push(`a closed document carrying something that is not an entry (${path.slice(0, 60)})`);
        }
    });
    return out;
}

// Is the DETAIL of one closure on this phone? `closed` is whatever closed documents this
// phone holds, by id (fetched, or written here). The balances never depend on the answer;
// the day list, the reasons and the notes do.
//
//   'record'   the entries are in the schedule itself - every closure made before the split
//   'fetched'  they are not, and the closed document is on this phone
//   'absent'   they are not, and it is not: the screen says the detail is not on this
//              phone yet, and shows no day list rather than a live one
function paybookDetail(schedule, closed, statementId) {
    const id = String(statementId);
    if (ownsKey(paybookMap(schedule), id)) return { state: 'record', closedId: id, entries: null };
    const held = isPlainObject(closed) && ownsKey(closed, id) ? closed[id] : null;
    if (held && paybookClosedProblems(id, held).length === 0) {
        return { state: 'fetched', closedId: id, entries: paybookClone(held.entries) };
    }
    return { state: 'absent', closedId: id, entries: null };
}

// ---------------------------------------------------------------- what would move
//
// planHistoryMove(schedule) -> { bundles, totals, changes: [] }
//
// A DRY RUN, like planPayMigration: what the split would take out of the live document
// and what it would leave, on this record, in bytes. It writes nothing and nothing applies
// it - moving existing history is Phase 5's, and happens only after every phone reads the
// index.
//
// One bundle per closed period per man: the frozen payslip, each `deducted` entry of that
// period, and - where the pay book has them - the statement, its extra deductions, its
// payments, voids and adjustments, or the owner's answer about an older closure. Bytes
// are counted the way Firestore stores a map entry: the key and the JSON of the value.
// `settled` says whether anything about it can still change: a statement that still owes
// the man, an unanswered older closure and a disputed id are NOT settled, and the design
// moves a bundle only when it is.
function paybookEntryBytes(path, value) {
    return String(path).length + JSON.stringify(value === undefined ? null : value).length;
}

function planHistoryMove(schedule) {
    const fold = paybookFold(schedule);
    const ledger = paybookLedger(schedule);
    const book = paybookMap(schedule);
    const legacyField = (schedule && isPlainObject(schedule.advances)) ? schedule.advances : {};
    const bundles = [];
    ((schedule && schedule.workers) || []).filter(man => man && man.id !== undefined).forEach(man => {
        const workerId = String(man.id);
        const closed = closedPeriods(schedule, workerId) || {};
        Object.keys(closed).sort().forEach(from => {
            const paths = [];
            const artifactId = periodArtifactId(workerId, from);
            if (ownsKey(ledger, artifactId)) paths.push(ledgerPath(artifactId));
            Object.keys(ledger).sort().forEach(id => {
                const entry = ledger[id];
                if (!entry || String(entry.kind) !== 'deducted' || String(entry.periodFrom) !== from) return;
                const whose = ownsKey(legacyField, String(entry.advanceId))
                    ? (legacyField[String(entry.advanceId)] || {}).workerId : entry.workerId;
                if (String(whose) === workerId) paths.push(ledgerPath(id));
            });
            const statementId = paybookStatementId(workerId, from);
            const legacyId = paybookLegacyId(artifactId);
            const of = ownsKey(fold.statements, statementId) ? fold.statements[statementId]
                : (ownsKey(fold.legacy, legacyId) ? fold.legacy[legacyId] : null);
            if (of) {
                paths.push(paybookPath(of.id));
                (of.deductions || []).concat(of.payments || [], of.adjustments || []).forEach(row => {
                    paths.push(paybookPath(row.id));
                    if (ownsKey(book, paybookVoidId(row.id))) paths.push(paybookPath(paybookVoidId(row.id)));
                });
            }
            const read = path => (isPaybookPath(path) ? book[path.split('.')[1]]
                : ledger[path.split('.')[2]]);
            const bytes = paths.reduce((sum, path) => sum + paybookEntryBytes(path, read(path)), 0);
            const disputed = fold.conflicts.some(row => row.workerIds.indexOf(workerId) !== -1);
            bundles.push({
                closedId: of && ownsKey(fold.statements, statementId) ? statementId : artifactId,
                workerId,
                periodFrom: from,
                periodTo: closed[from].periodTo === undefined ? null : String(closed[from].periodTo),
                source: of ? (ownsKey(fold.statements, statementId) ? 'statement' : 'legacy') : 'artifact',
                paths,
                bytes,
                settled: Boolean(of) && of.due === 0 && of.overpaid === 0 && !disputed
            });
        });
    });
    const index = paybookIndexFrom(schedule);
    const indexBytes = Object.keys(index.rows).reduce((sum, id) =>
        sum + paybookEntryBytes(id, index.rows[id]), 0);
    const whole = JSON.stringify(schedule === undefined ? null : schedule).length;
    const moving = bundles.reduce((sum, bundle) => sum + bundle.bytes, 0);
    const settled = bundles.filter(bundle => bundle.settled);
    return {
        bundles,
        totals: {
            documentBytes: whole,
            bundles: bundles.length,
            entries: bundles.reduce((sum, bundle) => sum + bundle.paths.length, 0),
            bytes: moving,
            settledBundles: settled.length,
            settledBytes: settled.reduce((sum, bundle) => sum + bundle.bytes, 0),
            indexBytes,
            freed: moving - indexBytes,
            documentBytesAfter: whole - moving + indexBytes
        },
        changes: []
    };
}

// ---------------------------------------------------------------- the index
//
// What the live document would keep about a closure whose entries have left it: ONE small
// row per closed period per man, keyed by the closed document's id. Everything a phone
// must answer OFFLINE, from the live document alone, and nothing it can only want with the
// detail open:
//
//   w, f, t        whose, and which period
//   at             the moment it was closed (the judge's cut-off, and the history's order)
//   g, ci, bo      the wage it was closed on, the balance it opened on and the balance it
//                  left - closedPeriods' figures, so a closed period stays frozen
//   a              [advanceId, amount, balanceAfter] per advance it deducted - so each
//                  advance's remaining balance is still the sum of what was recorded
//   x, n           extra deductions and the net - present only where a statement stands
//   o, p           owed (the net, corrected) and paid - so «יתרת שכר לתשלום» is o - p
//   s              'statement' | 'legacy' | 'artifact' - an artifact row is a closure
//                  nobody has answered for: payment unknown
//
// It is DERIVED: every figure is a fold of entries that exist, immutably, in the closed
// documents. So it can be rebuilt from them, and a suite can show that the folds from it
// equal the folds from the whole history (tests/paybook.split.test.mjs).
function paybookIndexFrom(schedule) {
    const fold = paybookFold(schedule);
    const ledger = paybookLedger(schedule);
    const legacyField = (schedule && isPlainObject(schedule.advances)) ? schedule.advances : {};
    const rows = {};
    ((schedule && schedule.workers) || []).filter(man => man && man.id !== undefined).forEach(man => {
        const workerId = String(man.id);
        const closed = closedPeriods(schedule, workerId) || {};
        Object.keys(closed).sort().forEach(from => {
            const artifact = periodArtifactFor(schedule, workerId, from);
            const statementId = paybookStatementId(workerId, from);
            const legacyId = paybookLegacyId(periodArtifactId(workerId, from));
            const statement = ownsKey(fold.statements, statementId) ? fold.statements[statementId] : null;
            const answer = !statement && ownsKey(fold.legacy, legacyId) ? fold.legacy[legacyId] : null;
            const row = { w: workerId, f: from };
            if (closed[from].periodTo !== undefined) row.t = String(closed[from].periodTo);
            if (artifact && artifact.at) row.at = String(artifact.at);
            if (Number.isFinite(closed[from].gross)) row.g = agoraRound(closed[from].gross);
            if (closed[from].carriedIn !== undefined) row.ci = agoraRound(closed[from].carriedIn);
            if (closed[from].balanceAfter !== undefined) row.bo = agoraRound(closed[from].balanceAfter);
            row.a = Object.keys(ledger).sort().map(id => ledger[id])
                .filter(entry => entry && String(entry.kind) === 'deducted' && String(entry.periodFrom) === from
                    && String(ownsKey(legacyField, String(entry.advanceId))
                        ? (legacyField[String(entry.advanceId)] || {}).workerId : entry.workerId) === workerId)
                .map(entry => [String(entry.advanceId), agoraRound(entry.amount),
                    entry.balanceAfter === undefined ? null : agoraRound(entry.balanceAfter)]);
            if (statement) {
                row.s = 'statement';
                row.x = statement.statement.extraDeducted;
                row.n = statement.statement.netDue;
                row.o = statement.owed;
                row.p = statement.paid;
            } else if (answer) {
                row.s = 'legacy';
                row.o = answer.owed;
                row.p = answer.paid;
            } else {
                row.s = 'artifact';
            }
            rows[statement ? statementId : (answer ? legacyId : periodArtifactId(workerId, from))] = row;
        });
    });
    return { v: 1, rows };
}

// The folds a phone needs offline, from the index and nothing else. Each is one line of
// arithmetic over the rows, written out so that the suite can hold it against the fold of
// the whole history: closedPeriods, advanceOutstanding's `deductedGross`, and accountFor's
// wage balances.
function paybookIndexFolds(index) {
    const rows = (isPlainObject(index) && isPlainObject(index.rows)) ? index.rows : {};
    const closed = {};
    const deducted = {};
    const wage = {};
    Object.keys(rows).sort().forEach(id => {
        const row = rows[id];
        if (!ownsKey(closed, row.w)) putKey(closed, row.w, {});
        const period = { deducted: paybookSum((row.a || []).map(one => one[1])) };
        if (row.t !== undefined) period.periodTo = row.t;
        if (row.g !== undefined) period.gross = row.g;
        if (row.ci !== undefined) period.carriedIn = row.ci;
        if (row.bo !== undefined) period.balanceAfter = row.bo;
        putKey(closed[row.w], row.f, period);
        (row.a || []).forEach(one => {
            putKey(deducted, one[0], paybookSum([ownsKey(deducted, one[0]) ? deducted[one[0]] : 0, one[1]]));
        });
        if (!ownsKey(wage, row.w)) putKey(wage, row.w, { wageDue: 0, wageOverpaid: 0, unpaid: [], paymentUnknown: [] });
        const mine = wage[row.w];
        if (row.s === 'artifact') { mine.paymentUnknown.push(row.f); return; }
        const due = Math.max(0, paybookAgorot(row.o) - paybookAgorot(row.p)) / 100;
        const over = Math.max(0, paybookAgorot(row.p) - paybookAgorot(row.o)) / 100;
        mine.wageDue = paybookSum([mine.wageDue, due]);
        mine.wageOverpaid = paybookSum([mine.wageOverpaid, over]);
        if (due > 0) mine.unpaid.push({ statementId: id, periodFrom: row.f, owed: row.o, paid: row.p, due });
    });
    return { closed, deducted, wage };
}

// =====================================================================================
// PHASE 4 (v176): the one answer the review page needs that no planner gave
// =====================================================================================
//
// paybookSuggestAllocations(review) -> { advanceId: amount }
//
// What the review page PRE-FILLS for each open advance, before a person has typed
// anything: all of it, oldest first, for as long as the wage allows - and 0 for the rest.
// It is a suggestion and nothing else. Every field stays the person's to change, the
// plan is drawn again from what they typed, and nothing here is ever written.
//
// It lives in the model and not in the screen for one reason: a screen that worked out
// "how much of this advance fits in what is left of the wage" would be a second place
// that subtracts money, and the first one (planClosure) would not know when it was wrong.
// This reads only what planClosure's own review says - each row's `left`, the period's
// `gross`, and `walkRoom`, the most the account walk lets this closure take altogether -
// in agorot, so that 0.1 + 0.2 cannot suggest a sum the planner then refuses.
//
// EVERY offered advance gets an answer, a 0 included: a blank is a missing answer
// (`allocation-missing`), and a suggestion that left one blank would hand the person a
// page that refuses on the first tap.
function paybookSuggestAllocations(review) {
    const out = {};
    if (!isPlainObject(review) || !Array.isArray(review.advances)) return out;
    const gross = paybookMoneyProblem(review.gross, true) === '' ? review.gross : 0;
    const walk = paybookMoneyProblem(review.walkRoom, true) === '' ? review.walkRoom : 0;
    let room = Math.min(paybookAgorot(gross), paybookAgorot(walk));
    review.advances.forEach(row => {
        if (!isPlainObject(row) || row.offered !== true || typeof row.advanceId !== 'string') return;
        const left = paybookMoneyProblem(row.left, true) === '' ? paybookAgorot(row.left) : 0;
        const take = Math.max(0, Math.min(left, room));
        room -= take;
        putKey(out, row.advanceId, take / 100);
    });
    return out;
}

// =====================================================================================
// PHASE 5: the stored index, and what leaves the live document
// =====================================================================================
//
// WHAT THIS IS FOR. The schedule is one Firestore document and Firestore refuses one over
// a mebibyte; closures are what fill it (docs/payroll-closure.md, Capacity). Since Phase 3
// every closure has a create-once copy under closed/. Here the LIVE document gives up its
// own copy of a settled closure and keeps one small row in its place.
//
// THE ONE INVARIANT EVERYTHING BELOW KEEPS: a phone's own record never has a hole.
//
//   the server's live document     the open accounts, the days, and `payIndex` - one row
//                                  per closure whose entries have left it
//   the server's closed documents  those entries, verbatim, create-once
//   a phone's record               BOTH, laid together: every entry at the field path it
//                                  was written at, exactly as before anything left
//
// So no fold in this app reads the index for money. closedPeriods, advanceOutstanding,
// the judge, payrollReport and the pay book's own folds read the entries they have always
// read, because on a phone the entries are still there. What the index is for is the
// boundary: it says which closed documents make the live document whole again
// (paybookWhole, on the way in), and which entries a whole-document write must leave out
// (paybookStripCovered, on the way out). A phone that cannot fetch a closed document it
// lacks does NOT adopt the server's document with a hole in it - it keeps the record it
// has, says so, and tries again (js/sync/closed.js).
//
// WHAT THIS DOES NOT DO, said here so nobody reads it in: it does not shrink the copy a
// PHONE keeps. A phone's record is as large as it always was. Folds that read the index
// instead of the entries - which is what would let a phone hold less - are not built.

const PAYBOOK_INDEX_VERSION = 1;

// How long a settled closure stays in the live document before the app moves it by
// itself. A phone that was out of signal for the whole life of a closure in the live
// document has to fetch its closed copy before it can adopt anything; two weeks makes
// that the rare case. The person can move a settled closure sooner, by hand.
const PAYBOOK_ARCHIVE_AFTER_DAYS = 14;

const PAYBOOK_INDEX_FIELDS = ['w', 'f', 't', 'at', 'g', 'ci', 'bo', 'a', 'x', 'n', 'o', 'p', 's', 'e', 'd'];

// The one entry every closed document is named after: a closed document's id is the id of
// one of the entries it holds (the statement, the payment, the void, the answer - or the
// frozen payslip, for the ledger half of a closure from before statements).
function paybookAnchorPath(closedId) {
    const id = String(closedId);
    return id.indexOf('le_') === 0 ? ledgerPath(id) : paybookPath(id);
}

function paybookReadAt(document, path) {
    let node = document;
    const parts = String(path).split('.');
    for (let i = 0; i < parts.length; i += 1) {
        if (!isPlainObject(node) || !ownsKey(node, parts[i])) return undefined;
        node = node[parts[i]];
    }
    return node;
}

function paybookWriteAt(document, path, value) {
    const parts = String(path).split('.');
    let node = document;
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (!ownsKey(node, parts[i]) || !isPlainObject(node[parts[i]])) putKey(node, parts[i], {});
        node = node[parts[i]];
    }
    putKey(node, parts[parts.length - 1], value);
}

function paybookDeleteAt(document, path) {
    const parts = String(path).split('.');
    let node = document;
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (!isPlainObject(node) || !ownsKey(node, parts[i])) return;
        node = node[parts[i]];
    }
    if (isPlainObject(node) && ownsKey(node, parts[parts.length - 1])) delete node[parts[parts.length - 1]];
}

// Everything wrong with one stored index row. Empty means this build could have written
// it. A row is the manifest of what left: a row that cannot be read names nothing, lays
// nothing back and strips nothing - and is kept exactly as it lies.
function paybookIndexRowProblems(id, row) {
    if (!isPlainObject(row)) return ['an index row that is not a record'];
    const out = [];
    const safe = value => typeof value === 'string' && isSafeId(value);
    const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    Object.keys(row).forEach(key => {
        if (PAYBOOK_INDEX_FIELDS.indexOf(key) === -1) {
            out.push(`an index row with a field this build does not write (${key.slice(0, 20)})`);
        }
    });
    if (!safe(row.w)) out.push('an index row that names nobody');
    if (!day(row.f)) out.push('an index row with no period');
    if (row.t !== undefined && !day(row.t)) out.push('an index row whose period does not end on a day');
    if (row.at !== undefined && typeof row.at !== 'string') out.push('an index row closed at no moment');
    ['g', 'ci', 'bo', 'x', 'n', 'o', 'p'].forEach(key => {
        if (row[key] !== undefined && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) {
            out.push(`an index row whose ${key} is not a number`);
        }
    });
    if (row.s !== 'statement' && row.s !== 'legacy') out.push('an index row of a closure nobody answered for');
    // `a` is a MAP here - { advanceId: [amount, balanceAfter] } - where paybookIndexFrom
    // derives a list of triples. Firestore refuses a list inside a list (measured on the
    // emulator: `invalid-argument`, and the drop that carried one never landed), so the
    // stored row keys each deduction by its advance instead. Same three facts.
    if (!isPlainObject(row.a) || !Object.keys(row.a).every(id => safe(id) && Array.isArray(row.a[id])
        && row.a[id].length === 2 && typeof row.a[id][0] === 'number' && Number.isFinite(row.a[id][0])
        && (row.a[id][1] === null || (typeof row.a[id][1] === 'number' && Number.isFinite(row.a[id][1]))))) {
        out.push('an index row whose advance deductions cannot be read');
    }
    ['e', 'd'].forEach(key => {
        if (row[key] !== undefined && (!Array.isArray(row[key]) || !row[key].every(safe)
            || new Set(row[key]).size !== row[key].length)) {
            out.push(`an index row whose list ${key} cannot be read`);
        }
    });
    if (Array.isArray(row.e) && !row.e.every(one => typeof one === 'string' && one.indexOf('p') === 0)) {
        out.push('an index row listing an entry that is not a pay entry');
    }
    if (out.length === 0) {
        const want = row.s === 'statement' ? paybookStatementId(row.w, row.f)
            : paybookLegacyId(periodArtifactId(row.w, row.f));
        if (String(id) !== want || !isSafeId(String(id))) out.push('an index row filed under another name');
    }
    return out;
}

// A derived row (paybookIndexFrom) in the shape that is STORED: the same facts, with the
// advance deductions keyed by advance. Null when two deductions name one advance - which
// no closure this build writes can do, and which a map could not hold.
function paybookStoredRow(row) {
    const out = paybookClone(row);
    const by = {};
    let twice = false;
    (Array.isArray(row.a) ? row.a : []).forEach(one => {
        if (ownsKey(by, String(one[0]))) twice = true;
        putKey(by, String(one[0]), [one[1], one[2]]);
    });
    if (twice) return null;
    out.a = by;
    return out;
}

// And back: a stored row as paybookIndexFolds reads one.
function paybookDerivedRow(row) {
    const out = paybookClone(row);
    out.a = Object.keys(row.a).sort().map(id => [id, row.a[id][0], row.a[id][1]]);
    delete out.e;
    delete out.d;
    return out;
}

// The stored index as this build reads it: the rows it can read, and the ids of the ones
// it cannot. Never throws, never repairs.
function paybookStoredIndex(schedule) {
    const held = (schedule && isPlainObject(schedule.payIndex) && isPlainObject(schedule.payIndex.rows))
        ? schedule.payIndex.rows : {};
    const rows = {};
    const unreadable = [];
    Object.keys(held).sort().forEach(id => {
        if (POISON_SEGMENTS.indexOf(id) !== -1) return;
        if (paybookIndexRowProblems(id, held[id]).length === 0) putKey(rows, id, held[id]);
        else unreadable.push(id);
    });
    return { rows, unreadable };
}

// Every field path one row stands for - exactly the entries that left the live document
// with it, derived from the row alone: the frozen payslip, one deduction per advance, the
// row's own pay entry, and the other pay entries it lists.
function paybookRowPaths(id, row) {
    return [ledgerPath(periodArtifactId(row.w, row.f))]
        .concat(Object.keys(row.a).sort().map(advance => ledgerPath(closureId(advance, row.f))))
        .concat([paybookPath(String(id))])
        .concat((row.e || []).map(one => paybookPath(one)));
}

// The closed documents that hold them: the one the row is named after, and the others.
function paybookRowDocs(id, row) {
    return [String(id)].concat(row.d || []);
}

// paybookWhole(document, local, closed) -> { document, missing, broken, laid }
//
// The server's live document made whole: for every row of its index, the entries the row
// stands for put back at their paths - from this phone's own record where it holds them
// (they are the same bytes; the union in receive() would keep them anyway), and from the
// closed documents in `closed` ({ id: document }, as fetched) where it does not.
//
//   missing   closed documents that have to be fetched before this can be whole
//   broken    rows whose closed documents are all here and still do not hold what the row
//             says. Nothing can make that whole; it is said, never papered over
//   laid      how many entries were put back
//
// `document` is returned AS IT CAME - the same object - when its index names nothing,
// which is every document there has ever been until the first closure leaves.
function paybookWhole(document, local, closed) {
    const index = paybookStoredIndex(document);
    const ids = Object.keys(index.rows);
    if (ids.length === 0) return { document, missing: [], broken: [], laid: 0 };
    const out = paybookClone(document);
    const have = isPlainObject(closed) ? closed : {};
    const missing = [];
    const broken = [];
    let laid = 0;
    ids.forEach(id => {
        const row = index.rows[id];
        let absent = paybookRowPaths(id, row).filter(path => paybookReadAt(out, path) === undefined);
        absent = absent.filter(path => {
            const mine = paybookReadAt(local, path);
            if (mine === undefined) return true;
            paybookWriteAt(out, path, paybookClone(mine));
            laid += 1;
            return false;
        });
        if (absent.length === 0) return;
        const docs = paybookRowDocs(id, row);
        const lacking = docs.filter(doc => !ownsKey(have, doc)
            || paybookClosedProblems(doc, have[doc]).length > 0);
        docs.filter(doc => lacking.indexOf(doc) === -1).forEach(doc => {
            absent = absent.filter(path => {
                if (!ownsKey(have[doc].entries, path)) return true;
                paybookWriteAt(out, path, paybookClone(have[doc].entries[path]));
                laid += 1;
                return false;
            });
        });
        if (absent.length === 0) return;
        if (lacking.length > 0) {
            lacking.forEach(doc => { if (missing.indexOf(doc) === -1) missing.push(doc); });
        } else broken.push(id);
    });
    return { document: out, missing, broken, laid };
}

// The other direction: what a WHOLE-document write may carry. Every entry an index row
// stands for is left out - it lives in a closed document, the rules refuse a write that
// would put a pay entry back without creating one, and putting the ledger half back
// would only refill the document the move emptied. The index itself is carried.
// Returns the same object when there is nothing to leave out.
function paybookStripCovered(document) {
    const index = paybookStoredIndex(document);
    const ids = Object.keys(index.rows);
    if (ids.length === 0) return document;
    const out = paybookClone(document);
    ids.forEach(id => paybookRowPaths(id, index.rows[id]).forEach(path => paybookDeleteAt(out, path)));
    return out;
}

// The index of two documents, unioned: rows only ever arrive. `standing`'s row stands
// where both have one. Bytes, not judgements - an unreadable row is carried like any other.
function paybookIndexUnion(standing, other) {
    const rowsOf = side => (side && isPlainObject(side.payIndex) && isPlainObject(side.payIndex.rows))
        ? side.payIndex.rows : {};
    const rows = {};
    [rowsOf(standing), rowsOf(other)].forEach(held => Object.keys(held).forEach(id => {
        if (POISON_SEGMENTS.indexOf(id) === -1 && !ownsKey(rows, id)) putKey(rows, id, held[id]);
    }));
    return rows;
}

function layPaybookIndexUnion(target, standing, other) {
    const rows = paybookIndexUnion(standing, other);
    if (Object.keys(rows).length > 0) target.payIndex = { v: PAYBOOK_INDEX_VERSION, rows };
}

// Does `mine` hold every index row `theirs` does? Asked beside paybookCovers, for the
// same reason: a snapshot naming a closure that has left the live document, on a phone
// that has no row for it, is not that phone's own echo.
function paybookIndexCovers(mine, theirs) {
    const rows = (theirs && isPlainObject(theirs.payIndex) && isPlainObject(theirs.payIndex.rows))
        ? theirs.payIndex.rows : {};
    const held = (mine && isPlainObject(mine.payIndex) && isPlainObject(mine.payIndex.rows))
        ? mine.payIndex.rows : {};
    return Object.keys(rows).every(id => ownsKey(held, id));
}

// planArchive(schedule, today, options) -> { ok, reasons, bundles, totals, changes: [] }
//
// THE DRY RUN the owner reads before anything moves, and the list the move works from.
// It writes nothing. One row per closed period per man (planHistoryMove's bundles), each
// with the one thing the move needs to know and a person needs to be told:
//
//   state 'archived'   it has already left the live document (its row is in the index)
//   state 'ready'      settled, and may leave now
//   state 'waiting'    settled, and younger than `options.olderThanDays`
//   state 'held'       it stays, and `why` says why:
//     unanswered   a closure from before payments were recorded that nobody answered for
//     owed         its wage has not been paid in full
//     overpaid     more was paid than was owed - it needs a person first
//     disputed     two phones recorded different amounts for this man
//     corrected    a ledger correction points at one of its deductions
//     irregular    an entry of it is not where this build would have written it
//
// `row` is the index row that would be stored (paybookIndexFrom's own, plus `e`, the pay
// entries that leave with it; the move adds `d`, the closed documents, when it has read
// them). Nothing unsettled moves, ever: what can still change must stay where every
// phone reads it without asking.
function planArchive(schedule, today, options) {
    const want = isPlainObject(options) ? options : {};
    const move = planHistoryMove(schedule);
    const stored = paybookStoredIndex(schedule);
    const derived = paybookIndexFrom(schedule).rows;
    const fold = paybookFold(schedule);
    const ledger = paybookLedger(schedule);
    const reasons = paybookWritesEnabled(schedule) ? [] : ['gate'];
    const horizon = Number.isInteger(want.olderThanDays) && want.olderThanDays > 0 && typeof today === 'string'
        ? advanceDayStep(today, -want.olderThanDays) : null;
    const names = {};
    ((schedule && schedule.workers) || []).forEach(man => {
        if (man && man.id !== undefined) putKey(names, String(man.id), String(man.name || ''));
    });
    const bundles = move.bundles.map(bundle => {
        const artifactId = periodArtifactId(bundle.workerId, bundle.periodFrom);
        const statementId = paybookStatementId(bundle.workerId, bundle.periodFrom);
        const legacyId = paybookLegacyId(artifactId);
        const rowId = bundle.source === 'statement' ? statementId : (bundle.source === 'legacy' ? legacyId : null);
        const of = bundle.source === 'statement' ? fold.statements[statementId]
            : (bundle.source === 'legacy' ? fold.legacy[legacyId] : null);
        const base = { rowId, workerId: bundle.workerId,
            name: ownsKey(names, bundle.workerId) ? names[bundle.workerId] : '',
            periodFrom: bundle.periodFrom, periodTo: bundle.periodTo, source: bundle.source,
            paths: bundle.paths.slice(), bytes: bundle.bytes,
            closedOn: paybookDayOf(String((ledger[artifactId] || {}).at || '')),
            owed: of ? of.owed : null, paid: of ? of.paid : null, due: of ? of.due : null };
        if (rowId !== null && ownsKey(stored.rows, rowId)) {
            return Object.assign(base, { state: 'archived', why: null, row: stored.rows[rowId] });
        }
        const held = why => Object.assign(base, { state: 'held', why, row: null });
        if (!of) return held('unanswered');
        if (fold.conflicts.some(one => one.workerIds.indexOf(bundle.workerId) !== -1)) return held('disputed');
        if (of.overpaid !== 0) return held('overpaid');
        if (of.due !== 0) return held('owed');
        const row = ownsKey(derived, rowId) ? paybookStoredRow(derived[rowId]) : null;
        if (!row) return held('irregular');
        const entries = bundle.paths.filter(path => !isPaybookPath(path)).map(path => path.split('.')[2]);
        if (Object.keys(ledger).some(id => ledger[id] && String(ledger[id].kind) === 'reversed'
            && entries.indexOf(String(ledger[id].targetId || '')) !== -1)) return held('corrected');
        const extra = bundle.paths.filter(isPaybookPath).map(path => path.split('.')[1]).filter(id => id !== rowId);
        if (extra.length > 0) row.e = extra.slice().sort();
        // The row must be one this build reads back, and must stand for exactly the
        // entries the bundle holds - no more, so nothing leaves that the row cannot
        // name, and no fewer, so nothing is named that never left.
        if (paybookIndexRowProblems(rowId, row).length > 0) return held('irregular');
        const named = paybookRowPaths(rowId, row).slice().sort();
        const there = bundle.paths.slice().sort();
        if (named.length !== there.length || named.some((path, at) => path !== there[at])) return held('irregular');
        if (horizon !== null && (base.closedOn === '' || base.closedOn > horizon)) {
            return Object.assign(base, { state: 'waiting', why: 'recent', row });
        }
        return Object.assign(base, { state: 'ready', why: null, row });
    });
    const count = state => bundles.filter(bundle => bundle.state === state);
    const bytesOf = list => list.reduce((sum, bundle) => sum + bundle.bytes, 0);
    const rowBytes = list => list.reduce((sum, bundle) => sum + paybookEntryBytes(bundle.rowId, bundle.row), 0);
    const ready = count('ready');
    // What the SERVER's document weighs is this phone's record less what has already
    // left it: the phone keeps the entries, the live document does not.
    const liveNow = JSON.stringify(paybookStripCovered(schedule === undefined ? null : schedule) || null).length;
    return {
        ok: reasons.length === 0,
        reasons,
        bundles,
        totals: {
            bundles: bundles.length,
            ready: ready.length,
            readyBytes: bytesOf(ready),
            waiting: count('waiting').length,
            held: count('held').length,
            archived: count('archived').length,
            unreadableRows: stored.unreadable.length,
            liveBytes: liveNow,
            liveBytesAfter: liveNow - bytesOf(ready) + rowBytes(ready),
            limitBytes: 1048576
        },
        changes: []
    };
}
