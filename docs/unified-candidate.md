# Unified repair candidate — not published

Base: main `0d5160f80e80aff0b918d5562018d1b87f159974`.
Merged locally: closeout `bee073c9fe97120a31c9656fce0cc144b5d6d1b2`.
Selected quality source: `b69c769b6a2c757cb16b213f387d4f5db87e8599`.

The main adapter bootstrap/read forwarding, held-record panel, its stale-dialog
protection and rescue-export evidence remain present. The closeout restore and
per-field roster implementation is authoritative; quality's alternative O1/O2
implementation is not overlaid on it. Existing release evidence belongs to its
original source commits, not this combined tree.

Quality fixes included with their regression checks:
- E1–E5/E8: preserve failed quarantine bytes, migration questions, restore points
  and v1 records; never overwrite an unreadable restore index.
- E6/E7/E9: tab save refusal, drag exit/autoscroll and honest damaged-record boot.
- Queue decode cache keyed by complete freshly-read records; cross-tab tests retained.
- Vendored XLSX byte identity. Emulator tests read their configured local port.
- Contrast, by-site large text, day drawer semantics, focus return, input names,
  password clearing, week labels, persistent live regions, focus rings and blocked copy.

Not copied: report-file reorganisation and timing budgets dependent on that
reorganisation. They are optional refactoring, not necessary to preserve these fixes.

Raised bars: the quality patch inferred displacement from viewport dimensions.
This candidate additionally requires a matching actual tab-bar rectangle before
applying compensation. Tests use real DOM rectangles without subtracting an imagined
displacement. This is NOT proof of an iOS compositing fix. Physical iPhone resume,
keyboard, sharing and scrolling acceptance remains NOT RUN.

Browser tests block non-loopback network requests and name resolution. Firebase
configuration, Firestore rules and all four shipped feature gates remain unchanged.
No live cloud access, main merge, PR, deployment or tag occurred. A review-only
branch upload was attempted, but GitHub rejected blob creation with HTTP 403;
no remote commit or branch was created.

Build v109 avoids reusing v105 and previously discussed local v107/v108 draft names.
It is a local candidate, not a release.

## Independently executed final gate

Source SHA: `03b45afe5b6112e6da6dbd4fcf1675ec14a844ea`.
Tree: `6cbb3846c4254fb54f5fdb0b06f4852cd12040e9`.
Node: v22.22.2. Clean detached worktree, browser network limited to loopback,
and all seven emulator commands explicitly use project demo-farkad.

`npm run test:release`: **8555/8555**, 78 reporting blocks, exit 0,
zero **FAIL** lines, no SKIP or SETUP FAILED lines. This includes the node
contract gate (56 blocks, 5292/5292), browser tests and seven emulator suites.

Earlier independent targeted results: smoke 1178/1178 and node 5292/5292
at 3dadd07; mobile 1345/1345 against the unchanged shipped bytes at f1f2bc9;
emulator 258/258 at 03b45af. The final release result above supersedes these
for aggregate evidence: do not add their counts or claim two full release runs.

The initial build gate failed because both stamp-history instruments omitted
merge commits. Both were corrected with explicit first-parent merge diffs and
new fixtures proving a stamped merge passes and a later unstamped change fails.
The corrected build suite passes 65/65. No production expectation was weakened.

Physical iPhone: NOT RUN. Remaining acceptance includes raised bars after app
resume/keyboard/share/rotation, VoiceOver and Dynamic Type, real download refusal,
Excel/Numbers and physical Safari/PWA printing. Closed financial gates are not
an authorization to activate them. Existing held records require owner decisions.

This documentation-only follow-up does not change the source tree measured above.

