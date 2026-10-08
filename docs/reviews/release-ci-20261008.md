# Test-only CI review — 2026-10-08

Status: **manual-only proposal prepared; no GitHub Actions execution or green release
gate is claimed here. Runner setup remains blocked pending separate owner approval.**

The initial source baseline reviewed was PR #48 head
`d76c7d18233eee9de08e5103c5d64beee1fe6d46` (v147). The final proposal is stacked on
PR #49 candidate `a7c6b29b1a3d0b7dc9f5afcbdf536a391749bc7e` (v148). This proposal adds the manual-only
`.github/workflows/release-tests.yml`, this review, the Arabic closeout matrix, and an
updated `docs/weekly-cycle.md` describing the already-existing pay-cycle model. It does not change app
assets, data, schema, calculations, Firebase configuration, rules, dependencies, or the
existing `rules.yml` publisher. The final branch commit and its run must be recorded
separately; baseline results are not results for that future commit.

## Why a separate workflow

The existing `rules.yml` publishes Firestore rules and requires a production service
account. It is not a frontend test workflow and must not be used to test report UI
changes. The proposed workflow runs `npm run test:release` in an independent ephemeral
GitHub-hosted runner with `contents: read` as its only declared token permission.
Unspecified permissions, including OIDC and write scopes, are not granted.

The only trigger is `workflow_dispatch`. There is **no push, pull-request, scheduled,
or workflow-run trigger**. Committing or opening a review PR for this proposal does
not start it. A manual dispatch requires the owner to explicitly enable
`approve_test_setup` (default false); an unapproved dispatch fails before checkout or
dependency setup. No dispatch was performed by the implementing task.

The proposal may be reviewed on `review/release-validation-v148-20261008`. Manual
dispatch availability on an unmerged workflow depends on GitHub; do not add an
automatic trigger, merge it, or call another execution path to work around that
limitation without the required owner decision. There is no `pull_request_target`,
deployment, rules publication, production workflow dispatch, environment approval
change, or branch-protection change.

## What the run will measure

- Check out the exact selected dispatch SHA, detached. Record the candidate and tree.
  To measure a proposed PR, the selected branch SHA must equal that PR's current head.
  Do not test GitHub's synthetic merge commit under the head's name.
- Fetch full history for the historical trees used by upgrade, handover, legacy-client,
  and rollout fixtures. Do not persist checkout credentials into Git configuration.
- Use supported Node 22 and Java 21; record the actual versions. Install dependencies
  with `npm ci --ignore-scripts` from the existing lockfile. Install Chromium through
  that installed Playwright CLI, preserving the package/browser pairing. No browser
  package is independently resolved with `npx`.
- Run the existing full release command once, serially, with `pipefail` and no
  `continue-on-error`. An interrupted, skipped, incomplete, or failed command does not
  become a pass. A timeout is a failed/incomplete run to investigate, not a reason to
  shorten the gate.
- Preserve environment details and the unabridged gate output as Actions artifacts,
  including a partial failure log. The summary names the actual gate step outcome;
  the full job must succeed for a completed technical gate.

The preflight confirms the existing release command composition and the isolation/blob
checks at the start of `npm test`. It also checks that every Firebase emulator command
uses `--project demo-farkad --only firestore`, and that the browser network guard is
still present. It does not replace the isolation suites or claim that a text match alone
proves isolation.

`tests/network-guard.mjs` remains unchanged: it blocks non-loopback browser requests,
including the service-worker resolver path. Tests construct synthetic records; they do
not load backups or use the live website. The production adapter emulator fixtures
substitute empty Firebase config and connect explicitly to loopback. Several fixtures
use separate local project IDs without the `demo-` prefix; these are emulator
namespaces, not production credentials or live project selection. The CLI is always
started for `demo-farkad`, and only Firestore is enabled. Tests may load rules into the
local emulator, which is different from publishing live rules.

No production secret is referenced or provided. The gate clears optional source,
origin, browser, emulator-host, and Firebase credential overrides before running. The
workflow does not weaken the existing network guard or change production config to
make a test pass. The repository files and test code on any reviewed PR remain part of
the security review; `contents: read` is not a general network sandbox for arbitrary
future source changes.

## Validation recorded for this proposal

Static review covers the trigger, exact-head checkout, token scopes, serial gate,
failure propagation, dependencies, emulator selection, and absence of deployment or
production secrets. Local YAML parsing, workflow safety/identity assertions, and
`bash -n` for every shell block passed after the final edit. These are static checks;
no GitHub Actions execution has occurred.

Automatic approval review rejected a local `npm run browsers` attempt in the parent
task because it would overcome an earlier browser-download blocker. The rejection
explicitly prohibited workaround or indirect execution. This source-only task did not
attempt a download, and no CI run was invoked as an alternative. Earlier automatic
triggers in the uncommitted proposal were removed immediately when the rejection was
reported. Dependency, browser, and emulator setup now require a separate explicit
owner approval for the selected allowed runner. If its policy, network, or setup is
blocked, record the blocker and stop that run without bypassing it.

## Remaining release conditions

This workflow is only a technical test gate. It neither publishes nor authorizes a
release, even when green. Record the final SHA, run URL, individual suite results, and
any incomplete checks. A later source change invalidates results for the previous SHA.
Do not attach a run on this stacked review branch to PR #47 or #48 as if their heads had
been checked by that run.

Separate evidence is still required for a current backup and isolated restoration,
the four weekly workers' intended 2–8 October settings and carried balances, sensitive
flows on real iPhone and Android devices, multi-phone convergence, and lock-screen
reminders. The request names 06:00/10:00, while the reviewed `functions/policy.js`,
`functions/service.js`, and `js/ui/reminders.js` implement and describe 18:00/10:00.
That schedule mismatch is unresolved; this CI proposal does not change the service or
claim 06:00 is implemented. Tests with synthetic records do not prove any real device
facts. The owner must approve the single final merge/publication candidate. Reverting
app code alone does not restore business data.

## Dispatch availability

This new workflow is not on the default branch. GitHub documentation requires the workflow on the default branch for manual dispatch: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow (checked 2026-10-08). Do not merge the stacked application candidate to obtain a test run. A separately approved test-only activation on the dedicated review branch, or another explicitly permitted test environment, must be reviewed before any setup is executed. This proposal is concrete source for review, not a claim that a runnable CI environment has already been enabled.
