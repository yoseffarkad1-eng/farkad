# Contract — v103: the app put in order, and no number moves

Base: after v102's heading commit on `claude/farkad-mobile-design-review-odl8ue`; `main` at
`2bae97f` (v102, served). Wave 4 of `features/next/opus-closeout.md`.

## The promise

**No number moves.** Not a shekel on a report, not a day on a record, not a byte on the wire.
This wave changes what the app SAYS and where it says it — the order of a panel, the word on
a button, the sentence on an empty screen — and every Hebrew string that changes moves with
its pinned test, in the same commit, with the reason.

Both money gates stay `false`. Nothing here goes near them.

## The map

Four screens, one panel, and eleven dialogs. Purpose · primary action · what it must never do.

### Screens (the tab bar)

| screen | its one purpose | primary action | must never |
|---|---|---|---|
| **day** (`#dayView`) | who worked where, on ONE date | record an assignment | show a date other than the one in its header; lose a name below the bars; claim saved before a durable commit |
| **week** (`#weekView`) | the same record, read-only, seven days wide | print | be editable — it is the read surface, and a tap that changed a record here would be unattributable |
| **roster** (`#rosterView`) | who and where exist at all | add a worker / add a site | delete a person who has work recorded; reorder under a reader's finger |
| **reports** (`#reportsView`) | what is owed and what is billed | print | show a number the export disagrees with; price one day twice; bill a client for a name |

### The ⋯ panel (`#settingsPanel`)

**Its order is already what this wave asks for**, and that was verified rather than assumed:
cloud and sync (with the reason line under the status) → backup → import and restore →
emergency restore → update and version → device state → the carry migration, hidden behind
its flag, last. No section moves. What this wave owes it is the button vocabulary below and
the 44px floor on every control in it.

### Dialogs

`askModal` (the app's own prompt/confirm/tell — law 11), `assignSheet`, `workerPickerModal`,
`placePickerModal`, `workerFormModal`, `workerDaysModal`, `shareModal`, `signInModal`,
`quickModal`, `migrationModal`, `reorderPanel`. Each: one job, one primary action, Escape
closes, focus returns to what opened it (`js/ui/modal.js` owns that and is not changed here).

## The button vocabulary, and three defects found writing it

The glossary this wave establishes:

| class | means | looks like |
|---|---|---|
| *(no class)* | the primary action of its surface | accent fill — the base `button` rule |
| `btn-secondary` | everything else that is safe | surface, inked, outlined |
| `btn-add` | brings a new thing into existence | soft accent |
| `btn-success` | the act that ENDS a piece of work: print, send | green |
| `btn-danger` | destroys a record | red, and confirms through `askConfirm` |
| `btn-icon` | a glyph alone; the accessible name is the whole label | 44px, no fill |

Three things do not fit it, all measured, none of them visible to a person today:

1. **`.btn-primary` is not defined anywhere.** `css/app.css` has no such rule. The three
   money-form save buttons that carry it — the repayment, the correction and the event
   reversal — look correct only because the BASE `button` rule already paints the primary
   style. The name is a lie in the code: a reader adding a fourth save button would expect it
   to mean something.
2. **`.btn-info` is byte-identical to `.btn-secondary`** — same background, same colour, same
   border token. Two names for one appearance, on the report's share-as-image and export
   buttons.
3. **`.backup-primary`** is a one-off name in `index.html` for what the glossary calls a
   primary.

No test pins any of the three (`btn-success` is the only button class the suites name, in
`tests/mobile.test.mjs`). So fixing them is safe, and each fix is a rename or a definition —
never a change of appearance. **A button that looks different after this wave is a bug in this
wave.**

## Empty states

Every screen with nothing on it says what to do next, in that file's own voice, and no
sentence says "error" without saying what to do about it. The day screen's two setup cards
are the model — a glyph, one sentence, one button that fixes it. Where a screen already has
one, it is left alone; where it does not, the sentence is new and gets a pin.

## The documents

- `docs/دليل-الاستخدام.md` brought up to v103: the print button and the picture, the Saturday
  arrows, the export names and the hand-over dialog, the sync chip's words and the reason
  line, the header that compacts on scroll, the site-card icons — each with the one-tap check
  a person can do to see it working.
- `docs/iphone-acceptance.md`: a row for every v99–v103 behaviour, all NOT RUN, with a short
  Arabic checklist at the top saying which order to run them in.
- `docs/architecture.md` and `docs/sync-protocol.md` already moved to the split files at v102;
  this wave checks them against the code again rather than assuming.
- `docs/firebase-setup.md` states the rules-first rollout with the exact command.

## The rules review

`firestore.rules` read against `docs/sync-protocol.md`. Every claim the protocol says the
rules enforce must have a check in `tests/rules.test.mjs` or `tests/bootstrap.rules.test.mjs`.
Anything unenforced is either enforced or written down as unenforced — a protocol that claims
a guarantee its rules do not keep is worse than one that admits the gap.

## Out of scope
- Any change to the arithmetic, the record's shape, sync, or either gate.
- Any change to what a button DOES. This wave changes what it is called and how it looks to a
  reader of the code, not what happens when it is pressed.
- `js/ui/reports.js`'s split, refused at v102 with its number, stays refused.

## How it will be proved
`npm test` after every commit; the whole release gate on the wave's final commit. Every moved
Hebrew string moves with its pin in the same commit. The mobile suite's 44px floor covers the
panel's controls, and `tests/wording.test.mjs` covers the vocabulary where it names strings.
