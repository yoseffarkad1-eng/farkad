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
};
