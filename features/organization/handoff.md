# Handoff — v103: the app put in order, and the panel that was already right

- Branch: `claude/farkad-mobile-design-review-odl8ue`
- SHA: `60114303550e9a3e7a76292d926696092b161169`
- Base: `2bae97f` (v102 as served)
- Build stamps: `farkad-build` v103 · `APP_VERSION` v103 · `VERSION` farkad-v103
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.
- Contract: `features/organization/contract.md`
- Wave 4 of `features/next/opus-closeout.md`.

## The promise

**No number moved.** Not a shekel on a report, not a day on a record, not a byte on the
wire. What changed is what the app SAYS, what its classes are CALLED, and what its documents
claim — plus one new Hebrew sentence, which ships with the pin that would catch its removal.

## What was found writing the contract, before anything was changed

**The ⋯ panel's order is already what the brief asks for.** Cloud and sync with its reason
line → backup → import and restore → emergency restore → update and version → device state →
the carry migration, behind its flag, last. Read off `index.html` and verified rather than
assumed, and **nothing moved**. Reordering a panel that was already right would be churn
wearing the costume of work, and the contract records the check so the next reader does not
repeat it.

**The button vocabulary had three names that meant nothing**, none of them visible to a
person, all three now fixed:

| | what was wrong | what was done |
|---|---|---|
| `.btn-primary` | **matched no rule in `css/app.css` at all.** The three money-form save buttons carrying it — the repayment, the correction, the event reversal — looked right only because the base `button` rule already paints the primary style. The name was a lie to whoever added a fourth. | removed at the call sites, with a comment saying the base rule IS the primary. Provably identical: a class matching no rule contributes nothing, and `.advance-form .modal-actions button:not(.btn-secondary)` — the one rule reaching those three — still matches them exactly. |
| `.btn-info` | byte-for-byte `.btn-secondary`: same background, same ink, same border token. Two names for one appearance is a vocabulary that cannot be read. | its two call sites say `btn-secondary`. Checked first that `.range-actions` has no rule naming a button class. |
| `.backup-primary` | a name ending in `-primary` that carries SIZE and no colour. | kept; its comment now says so in a sentence instead of in passing. |

No test pins any of the three — checked. `btn-success`, the only button class the suites
name, is untouched. **The rule this wave worked to: a button that LOOKS different after it is
a bug in it.**

## The rules review found no gap, and says which check answers which claim

`firestore.rules` read against `docs/sync-protocol.md`, claim by claim. The protocol names
three things the rules enforce and all three are checked in `tests/rules.test.mjs`:

| the protocol's claim | the check |
|---|---|
| a protocol write must CARRY a fingerprint | «a schedule write with no fingerprint at all is refused» |
| the schedule and its receipt carry the SAME one, in one transaction | «a receipt whose fingerprint disagrees with the document is refused»; «and a receipt with a fingerprint for a document without one is refused» |
| a receipt is immutable | «and can never be changed afterwards»; «nor deleted» |

Nothing unenforced was found, so nothing had to be enforced or written down as a gap. The
protocol now carries that table, so adding a server-enforced sentence without adding its
check becomes a visible omission — a protocol promising a guarantee its rules do not keep is
worse than one that admits the gap.

**One real finding, and it was this line of work's own drift:** the protocol still pointed at
`js/sync/sync.js` for the send claim, the client protocol and the replay path, and v102 split
that file into six. Each now names the file the code is in, and the replay path names
`js/sync/firebase-adapter.js`, where `receipt-mismatch` is raised.

## The one behaviour change, with its pin

`js/ui/week.js`'s empty state said «אין עובדים להצגה.» — the absence and nothing else. Every
other empty state in the app names the next move (the roster's three say «הוסף עובד כדי
להתחיל»; the day screen's setup cards carry the button that fixes them). An empty week is the
one moment a person cannot tell a fresh install from a broken app, on a screen a phone may
well open first.

It now reads **«אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.»** — a new Hebrew sentence, so
it shipped as a pair: the pin in `tests/wording.test.mjs` first, red, then the change.

The reports screen is deliberately NOT in that check. «אין רישומים בטווח הזה» is a fact about
the crew rather than a setup problem, and the range that would change it is already on screen
— `js/ui/reports.js` explains why that sentence is the one it is.

## The documents

- **`docs/iphone-acceptance.md`**: thirteen rows for v99–v103 — the bars coming back after a
  keyboard, a share sheet and a backgrounding; the ⋯ panel's reason line; the header
  compacting and returning; the site card's icons and what VoiceOver says about them; the
  week's fade; the WhatsApp message not turning round on a Latin name; the week's new empty
  sentence; and the month preset showing twenty days where it once showed ten. Plus an Arabic
  block at the top giving the ORDER to run them in — **not a translation**, because the list
  quotes the screen verbatim and translating it would make a person compare words with words.
  **58 rows, none run**, and the count is at the top rather than left to be counted.
- **`docs/دليل-الاستخدام.md`**: caught up with five things a person can see, each with a
  «جرّبها» — the one tap that shows it working. Plus a new section on telling whether a phone
  is well in two lines, the three reasons a sync error gives and their three different
  answers, and the sentence that ends all three: the work does not go anywhere, it waits.
- **`docs/firebase-setup.md`**: the rules-first rollout with the exact command, the order, and
  why the order is that way round — measured by `tests/rollout.test.mjs` against a real legacy
  document. Plus save-the-current-rules-first, and that this is a human operation no suite
  here performs.
- **`docs/sync-protocol.md`**: the enforcement table above, and the file names corrected.
- `docs/architecture.md` moved to the split files at v102 and was re-read here, not assumed.

## Test output (verbatim, on the final commit)

```
=== npm test on 60114303550e9a3e7a76292d926696092b161169 at 01:48:40 v22.22.2
18/18 checks passed
11/11 checks passed
29/29 checks passed
37/37 checks passed
28/28 checks passed
73/73 checks passed
28/28 checks passed
1949/1949 checks passed
75/75 checks passed
116/116 checks passed
35/35 checks passed
44/44 checks passed
46/46 checks passed
73/73 checks passed
35/35 checks passed
43/43 checks passed
21/21 checks passed
9/9 checks passed
21/21 checks passed
17/17 checks passed
4/4 checks passed
82/82 checks passed
37/37 checks passed
37/37 checks passed
122/122 checks passed
79/79 checks passed
33/33 checks passed
82/82 checks passed
72/72 checks passed
240/240 checks passed
151/151 checks passed
88/88 checks passed
37/37 checks passed
40/40 checks passed
206/206 checks passed
51/51 checks passed
51/51 checks passed
48/48 checks passed
61/61 checks passed
74/74 checks passed
23/23 checks passed
23/23 checks passed
32/32 checks passed
EXIT=0
43 suites · 4381/4381 checks

=== npm run test:release on 60114303550e9a3e7a76292d926696092b161169 at 01:52:31 v22.22.2
18/18 checks passed
11/11 checks passed
29/29 checks passed
37/37 checks passed
28/28 checks passed
73/73 checks passed
28/28 checks passed
1949/1949 checks passed
75/75 checks passed
116/116 checks passed
35/35 checks passed
44/44 checks passed
46/46 checks passed
73/73 checks passed
35/35 checks passed
43/43 checks passed
21/21 checks passed
9/9 checks passed
21/21 checks passed
17/17 checks passed
4/4 checks passed
82/82 checks passed
37/37 checks passed
37/37 checks passed
122/122 checks passed
79/79 checks passed
33/33 checks passed
82/82 checks passed
72/72 checks passed
240/240 checks passed
151/151 checks passed
88/88 checks passed
37/37 checks passed
40/40 checks passed
206/206 checks passed
51/51 checks passed
51/51 checks passed
48/48 checks passed
61/61 checks passed
74/74 checks passed
23/23 checks passed
23/23 checks passed
32/32 checks passed
1130/1130 checks passed
78/78 checks passed
807/807 checks passed
30/30 checks passed
10/10 checks passed
25/25 checks passed
26/26 checks passed
31/31 checks passed
55/55 checks passed
43/43 checks passed
59/59 checks passed
24/24 checks passed
17/17 checks passed
23/23 checks passed
28/28 checks passed
50/50 checks passed
EXIT=0
59 suites · 6817/6817 checks
```

Both from one clean detached worktree at `6011430`, `git diff --check` clean, Node v22.22.2,
run separately and reported separately, neither wrapped in anything that turns a nonzero exit
into a success.

**4380 → 4381 and 6816 → 6817.** Exactly one check more than v102, and it is the empty-state
pin. Everything else in this wave is a rename, a document, or a class that matched no rule —
none of which the gate can see, which is the point.

## Contract items NOT completed
- **The ⋯ panel was not reordered** because it did not need to be; the check is recorded.
- Empty states on the other screens were left as they are: each already names a next move, or
  (reports) is a fact rather than a setup problem, and the file says why.

## Known gaps, measured and named
- **No phone has run any of this**, and this wave is largely FOR a phone: the acceptance list
  it extends is 58 rows long and every one is NOT RUN. Nothing since v86 has been on a device.
- **`firestore.rules` is still not deployed.** This wave documented the deploy properly; it
  did not perform it, and cannot. `docs/rollout-checklist.md` has the steps.
- The two findings v100's re-audit left OPEN are still open and untouched.
- `js/ui/reports.js`'s split stays refused, with its number, from v102.
- Both money gates are shut.
