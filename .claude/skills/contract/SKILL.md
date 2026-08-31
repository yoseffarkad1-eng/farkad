---
name: contract
description: Write the feature contract before any code is written
---
Create the contract file for a new feature.
Feature: $ARGUMENTS
Write to `features/$ARGUMENTS/contract.md` with sections:
## Goal — one paragraph, what the user can do after this ships.
## Out of scope — explicit list of what we are NOT doing.
## Data — tables/columns touched, migrations needed, rollback plan.
## Permissions — who reads what, who writes what, behavior on
   an unauthorized request.
## Privacy — which student/teacher data is exposed, to whom,
   in which view.
## Success criteria — numbered, each testable. If it cannot be
   tested, rewrite it.
## Base — branch name, BASE SHA, files that must not be touched.
Ask me for anything you cannot determine from the repo.
Do not write product code in this command.
