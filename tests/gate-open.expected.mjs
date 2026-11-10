// tests/gate-open.expected.mjs
//
// THE HAND-KEPT LIST: what the existing suites say differently with the pay book's gates
// open, each difference read by a person and given its reason. tests/gate-open.matrix.mjs
// runs the suites and compares with this file, both ways. docs/payroll-closure.md («The
// existing suites with the gates open») is the same list in words.
//
// It is kept by hand, deliberately. A list that a script rewrote would say "expected"
// about whatever happened to fail.

// THE SUITES WHOSE SUBJECT IS THE GATE. Not run by the matrix: each opens and shuts the
// gates itself, on fixtures built for each state, so a gate opened under it measures
// nothing. Every one of them is in the ordinary gates, where it measures both states.
export const SUBJECT = {
    'test:payroll': 'the pay book\'s model: every planner with the writer on and off',
    'test:paybook-store': 'the gate, the commit, the disk - shut and open',
    'test:paybook-sync': 'two and three phones, the old queue door opened by name',
    'test:paybook-oldbuilds': 'older builds beside this one, each flag state named',
    'test:debt-ruling': 'the one-debt ruling, both builds side by side',
    'test:paybook-transact': 'the server-first door, and the shipped build beside it',
    'test:paybook-split': 'the split\'s model and capacity',
    'test:accounts': 'the screens\' words and hooks, the gate shut and open',
    'test:paybook-archive': 'closures leaving the live document, and the gate shut',
    'test:months': 'months leaving it, either flag shut',
    'test:months-capacity': 'capacity, weighed with the flags named',
    'test:cold': 'the cold store, its flag shut and open',
    'test:activation': 'the record\'s own switch, on the build as it ships',
    'test:accounts-browser': 'the pay book\'s screens, opened through the seam',
    'test:archive-browser': 'the archive, the draft and «לבדיקה», opened through the seam',
    'test:cold-browser': 'the cold store on a real IndexedDB, its flag shut and open',
    'test:activation-browser': 'turning it on from the app, on the build as it ships'
};

// THE DIFFERENCES. `fails` are check names, word for word; `died` is where a suite stops
// before its last line (and then nothing after that point is compared).
//
//   why      what is different with the pay book on, in one sentence
//   kind     'replaced'  the thing the suite tests is the thing the pay book replaces; the
//                        guarantee is held for the new thing by the suite named in `held`
//            'ruling'    the one-debt ruling: the figure moves by the owner's decision of
//                        2026-11-10; the new figure is held by the suite named in `held`
//            'reading'   the suite reads a flag, a file list or a sentence that is
//                        different with a gate open, and says nothing about behaviour
//   held     where the equivalent guarantee is asserted for the build with the pay book on
export const EXPECTED = {
    // ------------------------------------------------------------------ node suites

    // THE ONE-DEBT RULING (the owner, 2026-11-10): an advance from a period nobody closed
    // stays a full debt until a person deducts it. These suites were written for the walk
    // that settled such a period by itself, and each of these figures is that walk's.
    'test:repayment': {
        kind: 'ruling',
        why: 'an account that inherits what the one before could not cover: 1,800 under the old walk, the whole 5,000 under the ruling, where the earlier account was never closed',
        held: 'tests/debt.ruling.test.mjs (the carry into any account is the sum of what is left on each advance: 60 seeded records, 630 accounts); tests/activation.test.mjs V4, V10',
        fails: [
            'account B is told what account A could not cover',
            'account B starts owing 1,800 and clears it out of 2,800',
            'so he is paid nothing in A and 1,000 in B',
            'account B: the cash he handed back settles it, and nothing is deducted from pay',
            'account B: 2,800 earned, the 1,800 it inherited deducted, 1,000 to pay',
            'תקופה ב׳: opening 1,950, 200 handed back, 1,750 still owed'
        ]
    },
    'test:ledger-truth': {
        kind: 'ruling',
        why: 'the same: the next account opens on everything given in the unclosed account before it (420,000), not on what its wage could not cover (100,000)',
        held: 'tests/debt.ruling.test.mjs',
        fails: ['the next account opens on exactly the 100,000 that walked out']
    },
    'test:paycycle-completion': {
        kind: 'ruling',
        why: 'the same: October opens owing the whole 3,000 of an advance from an account nobody closed, not the 1,050 its wage left over',
        held: 'tests/debt.ruling.test.mjs',
        fails: ['October owes 1050, not 1700']
    },
    'test:oracle': {
        kind: 'ruling',
        why: 'the second calculator (tests/oracle.mjs) is the DOCUMENTED rule of main - the walk that settles an unclosed period by itself - so with the ruling on, the app and the calculator part on every man with an advance behind an unclosed period. THERE IS NO SECOND CALCULATOR FOR THE RULING: the gate-open arithmetic is held by fixtures and by one invariant on seeded records, not by an independent implementation',
        held: 'tests/debt.ruling.test.mjs (the invariant); tests/payroll.test.mjs; tests/overpayment.test.mjs, suite 4 (the credit under the ruling)',
        fails: [
            'the second: 1,950 in, 200 back, 610 covered, 1,140 out - the app',
            'the week after opens on 1,050 - the app',
            'every man\'s account, period by period: in, given, back, corrected, covered, out, forward',
            'a close writes the payslip and the deductions the rules say, oldest advance first',
            'a credit: periods that open on one, periods where it comes off new money, closed periods that hand one on',
            'and the same dozen records are clean against the app as shipped'
        ]
    },
    'test:overpayment': {
        kind: 'ruling',
        why: 'a fixture: «the middle account closed: 500 off, written against the oldest advance». Under the ruling that closure takes the whole debt - 1,000 off one advance and 500 off the other - so the fixture the rest of the suite is built on is another history, and the suite stops. Its own suite 4 builds exactly that history with the gate open and holds the credit there',
        held: 'tests/overpayment.test.mjs, suite 4 («the gate open: the one-debt walk and the pay book\'s own fold keep the credit»), which runs in the ordinary gate',
        died: 'SETUP FAILED: the middle account closed: 500 off, written against the oldest advance',
        fails: []
    },

    // A SUITE THAT READS THE SHUT STATE ITSELF.
    'test:poison': {
        kind: 'reading',
        why: 'its own precondition: «the shipped build does not write the pay book», asked of a device it made with no flags - which this instrument opens. It stops there. The poison names under `pay` and `payConflicted` are held, writer on, by the pay book\'s own suite',
        held: 'tests/paybook.store.test.mjs (poison names under pay and payConflicted, the writer on through the seam)',
        died: 'SETUP FAILED: the shipped build does not write the pay book',
        fails: []
    },
    'test:transport': {
        kind: 'reading',
        why: 'a detector, not a leak. The suite looks for the word "off" (a vehicle turned off) in the rescue file; with the cold store\'s reader active the rescue file carries `aboutColdStore`, whose `state` on a device that never ran State.load is the word "off". No transport key is in the file: the two checks before it (the backup, the restore points) pass, and tests/cold.test.mjs K4 holds what the rescue file carries',
        held: 'tests/cold.test.mjs K4 (the rescue file with a cold store); tests/transport.test.mjs itself, shut',
        fails: ['nor does the rescue file']
    },

    // RED WITH THE GATES SHUT TOO, on a branch of many commits: the three stamps moved at
    // the merge and cached files changed after it. Not a difference of the gate. BOTH
    // LEAVE THIS LIST in the commit that moves the stamps (the squash).
    'test:build': {
        kind: 'reading',
        why: 'the stamp check - red shut as well on this multi-commit branch; nothing to do with a gate',
        held: 'the squash commit moves the stamps',
        fails: ['and nothing in the shell has changed since']
    },
    'test:gate-integrity': {
        kind: 'reading',
        why: 'the same stamp check, asked a second way',
        held: 'the squash commit moves the stamps',
        fails: ['no cached file has changed since the three stamps last moved']
    },

    // ------------------------------------------------------------------ browser suites

    // THE «מקדמות» TAB IS THE ACCOUNTS HOME. Two suites tap things on the advances list
    // that tab used to hold, and stop where the list is not.
    'test:simple-advances-browser': {
        kind: 'replaced',
        why: 'it taps a man\'s card on the «מקדמות» tab; with the pay book on that tab is the accounts home and has no such card (measured first at Phase 5). What it holds: one man\'s advances page with a repayment and «תיקון טעות» through the real forms; the old closure dialog («קיזוז מהשכר», «סגירת חשבון התקופה»), which the review page replaces by decision 29; the layout of the old list',
        held: 'tests/activation.browser.mjs («with the pay book on, one man\'s advances page is the existing one»: the same two forms, reached from his row, on the build as it ships); tests/accounts.browser.mjs (the review page, the closure, the list\'s geometry); tests/forms.browser.mjs, which says the same with the gates open',
        died: 'locator.click: Timeout Nms exceeded.',
        fails: []
    },
    'test:polish-browser': {
        kind: 'replaced',
        why: 'v181\'s «quiet zero» is measured on the advances list (`.advance-workers`), which is not on the tab. The suite stops there, so what it holds AFTER that point - the empty screens, the site\'s letter in the week, the backup\'s age - is NOT measured with the gates open; none of the three is drawn by anything the pay book touches',
        held: 'tests/accounts.browser.mjs («a man with nothing to close is one quiet line»; a debt figure only when it is above zero)',
        died: 'page.evaluate: TypeError: Failed to execute \'getComputedStyle\' on \'Window\': parameter 1 is not of type \'Element\'.',
        fails: []
    },

    // THE SEAM IS NOT THE ACTIVATION. The settings sheet's one new row belongs to a record:
    // «not turned on» with its button, or «on since» a day. A device opened through the
    // seam has the flag and a record with no opening, which is neither - so the row is
    // not drawn at all, and the three checks that count it part.
    'test:settings-order-browser': {
        kind: 'reading',
        why: 'the pay book\'s row in the settings sheet is drawn for a RECORD (not on: a sentence and a button; on: the day), and under the seam the record is neither, so no row is drawn. On a record really turned on the row is there, in its second form',
        held: 'tests/activation.browser.mjs (the row before and after the record is turned on, on the build as it ships)',
        fails: [
            'every control, with its id, its words and its inline handler - the v171 sheet, and the one row added since',
            'every sentence, word for word - the same',
            'what was added is one sentence and one button, both in the first section and neither behind a shut row'
        ]
    }
};
