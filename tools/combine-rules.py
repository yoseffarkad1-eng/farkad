#!/usr/bin/env python3
#
# ONE RULES FILE FOR TWO PENDING ADDITIONS.
#
#   python3 tools/combine-rules.py <this branch's firestore.rules> <main's firestore.rules> \
#                                  <the other branch's firestore.rules> <output file>
#
# WHY THIS EXISTS. The owner pastes Firestore rules by hand, and is asked to do it ONCE.
# Two branches each add to main's rules: the pay book (this repository's firestore.rules on
# its branch) and another feature that adds its own documents under the schedule (shared
# rides: match /transport/{name}). Pasting one file and then the other would publish, for a
# while, rules that lack one of the two - and would make "what is live" equal to neither
# file in the repository. So the two are joined into one file, by this script and never by
# hand (docs/payroll-activation.md, «One file for two additions»).
#
# WHAT IT REFUSES. It does not merge text. It takes the OTHER branch's change only if that
# change is exactly ONE insertion into main's file, right after the receipts block inside
# match /schedules/{docId}, holding exactly one `match` block, and declaring no function
# this branch's file also declares. Then it inserts those lines after probe/ - the last
# block under the schedule in the pay book's file - and before the brace that closes the
# schedule. tests/activation.test.mjs (V12) pins that place. Anything else: it stops, and
# a person reads both files.
#
# WHAT IT IS NOT. It publishes nothing and touches no project. The file it writes is run
# through every emulator suite in place of firestore.rules before anybody pastes it.
import difflib
import re
import sys

if len(sys.argv) != 5:
    sys.exit('usage: combine-rules.py <paybook rules> <main rules> <other branch rules> <out>')
paybook, main_path, other_path, out = sys.argv[1:5]
P = open(paybook, encoding='utf-8').read()
M = open(main_path, encoding='utf-8').read()
N = open(other_path, encoding='utf-8').read()

# The other addition must be a PURE INSERTION into main's file: found by diff, not assumed.
ml, nl = M.split('\n'), N.split('\n')
ops = [op for op in difflib.SequenceMatcher(None, ml, nl, autojunk=False).get_opcodes() if op[0] != 'equal']
assert len(ops) == 1 and ops[0][0] == 'insert', 'the other branch does more than insert one block: %r' % (ops,)
_, i1, _, j1, j2 = ops[0]
block = '\n'.join(nl[j1:j2])
assert block.count('match /') == 1, 'the inserted lines hold more than one match block'
before = '\n'.join(ml[max(0, i1 - 8):i1])
assert 'match /receipts/{opId}' in before, 'the insertion is not right after the receipts block'

# In the pay book's file the blocks that follow receipts/ - closed/, months/, probe/ - are
# siblings. The other block goes LAST among them, immediately before the brace that closes
# match /schedules/{docId}.
anchor = """      match /probe/{generation} {
        allow get: if allowed() && generation == 'paybook-8';
        allow list, create, update, delete: if false;
      }
    }
"""
assert P.count(anchor) == 1, 'the pay book\'s file no longer ends its schedule block with probe/'
for name in re.findall(r'function (\w+)\(', block):
    assert len(re.findall(r'function %s\(' % re.escape(name), P)) == 0, 'declared twice: ' + name
combined = P.replace(anchor, anchor[:-len("    }\n")] + block.rstrip('\n') + "\n    }\n")
assert combined.count('{') == combined.count('}'), 'the braces do not balance'
# Nothing of either file is lost: every line of the pay book's file, in order, and every
# line of the block.
at = 0
for line in P.split('\n'):
    at = combined.index(line, at) + len(line)
assert block.rstrip('\n') in combined
open(out, 'w', encoding='utf-8').write(combined)
print('combined: %d bytes = the pay book\'s %d + a block of %d lines' % (
    len(combined.encode('utf-8')), len(P.encode('utf-8')), block.rstrip('\n').count('\n') + 1))
