# The rounds

One directory per round of work. Each holds the contract it was written against, the
findings that were measured, and the handoff with the release gate's output verbatim on
the commit it ran on. They are the record of WHY the code is shaped the way it is; the
code's own comments say what each piece prevents, and these say what was found on the way.

Read a round's `contract.md` for what was promised, `findings.md` for what was measured,
and `handoff.md` for what was shipped and what was left open. A round with no contract was
one where nothing touching money, sync or the record's shape changed.

| round | what it was | files |
|---|---|---|
| `compact-day` | v93: the day screen made to fit a phone — six worker rows at 430, five at 390, three at 320, with nothing removed and no bar moved. | contract, handoff |
| `core-repairs` | The v91 line: the bootstrap carrying no business data, receipts bound to their operation, a durable contested hold, poison-safe ledger ids, and two rounds of adversarial findings. | contract, findings, findings-round2, handoff |
| `ledger` | The v92 line: the advances ledger merged onto the core, both money gates still shut, and the create-race gap named for later. | handoff |
| `iphone` | v97: the first round answered from a real iPhone. The "reversed" report, six lenses and thirteen verifications; the print fallback, the picture, the Saturday arrows, touch-action, the sync chip, and the export path told the truth. | findings, handoff |
| `storm` | v98: the closure-echo race. One red emulator run explained — a phone held by its own closure — and closed with numbers, plus the frozen day list's missing hours. | findings, handoff |
| `bars-reason` | v99: the bottom bars stuck hidden on iOS (a keyboard needs a focused editable), and the ⋯ panel naming why the cloud refused. | handoff |
| `false-holds` | v100, served: the four items v98 left open, plus the data-safety re-audit. One arithmetic for a closure's writer and its judge; a clock that is behind refusing rather than moving money quietly; the same-fact rule asked at every gate that can hold a write; every name in the day message isolated; the week strip showing where it is cut off. Then five more from four parallel adversarial reviews — a closure frozen for its own period and no other, a deaf phone that stopped saying synced, a refused edit taken off the screen, the undo stack quarantined — and **two left open with reproductions**, in `docs/data-safety-audit.md`. | contract, handoff |
| `day-room` | v101, served: room on the day screen without moving a bar. The header compacts to one row on scroll (157px of chrome above the first name becomes about 57), and the site cards' two footer buttons become icon buttons on the coloured head — a row back per card. The third change, moving the switcher into the header, is the one worth reading about: measured, it gives back **three pixels, not a row**, and the handoff says why and what it buys instead. | contract, handoff |
| `code-order` | v102, served: the code put in order and nothing else. sync.js 6,194 lines into six by concern, share.js into two, schema.js into two, a table of contents on the stylesheet, three dead functions named and removed. The gate says the same thing it said at v101, check for check, which is the whole claim. Two items were measured and REFUSED with their numbers: reports.js (25 reads across 13 suites, three of them meta-tests) and reordering css/app.css (four documented places where cascade order is the mechanism). | contract, handoff |
| `gate-flip` | Not a round: the checklist a person reads before `LEDGER_WRITES` and `carryAdvances` are opened together. No code, and the decision is not this repository's to take. | contract |
| `next` | The briefs written for whoever comes next. `brief-for-opus.md` (the eight items after v98) is **done** — see `false-holds`. `opus-closeout.md` is the wave plan this line is working through; its Wave 0 shipped as v99, its Wave 1 (both halves) as v100, its Wave 2 as v101 and its Wave 3 as v102. | briefs |

## The shape of a round

    features/<name>/contract.md    what will be true when this ships, and what is out of
                                   scope; the base SHA; the files that must not be touched
    features/<name>/findings.md    what was measured on the base, with the numbers
    features/<name>/handoff.md     the pairs, the expectations moved deliberately, the
                                   migrations, the gate's output verbatim, and — the part
                                   that matters most — what is NOT done

The last section is the point of the format. A handoff that lists only what works is a
sales page, and `docs/releases.md` says the same thing about a release note.
