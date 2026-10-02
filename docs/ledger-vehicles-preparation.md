# Ledger and explicit vehicle departures — local preparation, v111

Base: unified v109 documentation tip 99c092742d4b40271eeb09f7e01348ec73a6b328.
No deployment, main merge, Firebase configuration/rules change or financial gate flip.

## Ledger F3

Unreadable cloud financial records are refused before adoption. Their COMPLETE snapshot,
including valid repayments alongside malformed ones, is quarantined. The boot re-derives
its warning from the durable copy on every reopen, including after acknowledgement in an
earlier session. Rescue export includes that copy. Refused or corrupt quarantine holds
writes and keeps the surviving bytes available for rescue in memory. If storage refuses
ALL durable writes, nothing can promise evidence survives process death; export before
closing is still necessary. No automatic repair or choice between financial versions.

The new reproducer failed seven checks before the fix. Boot, two reopens, raw export,
corrupt/refused/quota writes are covered. F2 is a deployment prerequisite, not declared
solved: verify real protocol/revision and every phone before enabling ledger writes and
carry reporting together, then review every migration row. No live project was inspected.

## Vehicles: updated product contract

A missing departure is NOT a departure and costs zero. Each day's vehicleRuns.<id>
records out, ownerId, name, amount and siteIds. Explicit false means it stayed home;
null is an undo back to unrecorded. Legacy vehiclesOff bytes remain preserved but are
never converted into inferred paid departures. One flat amount per vehicle per date:
not multiplied by worker double days, number of sites or trips. Multiple cars owned by
one worker are paid separately. The departure stamps the day's rate and owner, so later
archive, owner or rate edits cannot change prior totals. Site membership refers to the
existing site roster; this does not assign individual passengers or enforce seat capacity.

The day form lists all sites, permits several, requires one for departure, distinguishes
missing from stayed-home, and retains the draft after a refused save. It checks concurrent
changes before saving and guards undo/redo against overwriting a changed departure.
Two devices use separate per-car field paths. Backup validation, reopen, sync, restoration
and malformed-input checks cover the new day shape. The two-device unit test uses the
production sync layer with a simulated cloud; it is not physical iPhone evidence.

## Activation boundary

Source flags remain false. This is deliberate preparation, not a released feature.
All participating phones must first run a reader supporting vehicleRuns (v110 or later),
otherwise an old normaliser may drop or refuse that new day field. Confirm rollout and
server ordering before activating vehicles. The ledger has its own migration approval
and cutover requirements. Owner confirmation of existing held money is never automated.

Physical iPhone acceptance remains NOT RUN. No claim is made about real iOS keyboard,
VoiceOver, offline storage eviction or published rules. Validation results follow below.

The follow-up refuses vehicle edits inside a closed payroll period and invalidates a
form whose vehicle roster record changed while open. Build v111 has these additional
shipped bytes; v110 was only an intermediate local candidate, never served.
