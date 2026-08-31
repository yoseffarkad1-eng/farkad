---
name: handoff
description: Produce a copy-ready handoff report after implementation
---
Write the implementation handoff for: $ARGUMENTS
1. Run `git rev-parse HEAD`, record the exact SHA.
2. Run the full test suite, record pass/fail counts verbatim.
3. Run `git diff --stat` against the BASE SHA in the contract.
Write to `features/$ARGUMENTS/handoff.md`: SHA, branch, files
changed with one line each, migrations added and whether tested
from an empty DB and from a populated old DB, tests added
including negative tests, test output pasted not summarized,
contract items NOT completed and why, known risks.
Do not claim anything you did not verify by running it.
If a test failed, say so. Do not soften it.
