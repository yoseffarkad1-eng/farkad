---
name: gate
description: Check release criteria before merge or deploy
---
Run the closing checklist for: $ARGUMENTS
Verify each item by actually running it. Report PASS or FAIL
with command output. Never mark PASS on assumption.
1. Zero open P1.
2. Zero open P2 touching privacy, permissions, or data integrity.
3. Migrations run clean from an empty database.
4. Migrations run clean from a copy of the current database.
5. Negative tests exist and fail when the guard is removed.
   Prove this: temporarily remove one guard, show the test
   fails, then restore it.
6. Full test suite green on the current SHA.
7. CI green on the same SHA.
Finish with one line: READY or NOT READY. If NOT READY, list
the shortest set of blockers.
