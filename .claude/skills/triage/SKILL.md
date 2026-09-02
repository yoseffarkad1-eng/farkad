---
name: triage
description: Filter an adversarial review down to proven findings
---
Read the review report at: $ARGUMENTS
Verify each finding against the actual code. Open the cited
file and line. Mark it CONFIRMED, NOT REPRODUCIBLE, or
ALREADY HANDLED.
Discard: style with no functional impact, speculative concerns
with no reproduction path, anything already covered by a test
or guard.
Output only confirmed findings, ordered:
P1 — data loss, privacy leak, broken auth
P2 — wrong behavior on a realistic path
P3 — everything else
For each: file:line, one-sentence problem, one-sentence fix.
End with how many findings you discarded and why.
Report only. Do not fix anything in this command.
