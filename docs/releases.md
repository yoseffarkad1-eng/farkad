# What has actually been served

One line per build that reached `main`, newest first. `main` is what the live site
deploys, so a build is not released until it is here — a branch full of verified work is
not a release, it is a cost.

Each entry says what changed, what was checked before it went, and anything the build is
known NOT to cover. The last of those is the point of the file: a release note that lists
only what works is a sales page.

---

## v79 — 28 August 2026 — `94d5a84`

Sixteen commits, fast-forwarded from `claude/farkad-mobile-workers-v79`, so what is on
`main` is exactly the tree that was verified. The previous build on `main` was v78
(`1dec586`).

**What the crew gets that v78 did not have**

- The phone screen rebuilt around the hand holding it: the day's work reachable with a
  thumb, 44px targets, the home indicator cleared, the sticky headers dropped on a short
  landscape screen where they used to cover the last man in the list.
- Printing that prints the report and nothing else. An open dialog used to print over the
  pay sheet and produce grey pages; now every overlay, bar and dock is excluded by
  default, without the person having to close anything first.
- A worker's history is proved before he can be deleted, and his lifecycle is safe across
  two phones editing at once.
- Nothing off this origin sits between a person and their own data: the export library is
  fetched after the app is running, never before it draws.
- The device says it is filling up while there is still room to act, instead of at the
  moment a tap is refused.
- The bookkeeper's file: a name opening with `=` or `-` is a name and not a formula, and
  the workbook opens right to left the way it reads.
- Zoom, which the app used to refuse, is the reader's to use.

**Checked before it went**, from a clean clone at `94d5a84` on Node v22.22.2:

| suite | |
|---|---|
| build | 18/18 |
| data | 1794/1794, and the same at seeds 1, 42, 2026 and 42 again |
| print / PDF | 54/54 |
| mobile layouts | 278/278 |
| smoke | 902/902, twice |
| update path | 25/25 |
| Firestore rules | 34/34, against a local emulator |

`git diff --check` clean, all 40 tracked JS/MJS files syntax-checked.

**What this build is NOT known to do**

- **It has never run on an iPhone.** Every layout, print and update assertion was measured
  in headless Chromium. That is the right tool for layout arithmetic and it is not a
  phone: an installed app on iOS is resumed rather than reopened, and the update handover
  is at its most awkward exactly there.
- **The update banner was proved against a real deploy, in Chromium.** If a phone sits on
  v78 without offering the banner, Settings has a manual check that asks the server
  directly.
- **The device still fills up.** It now warns first - at about two years of records for a
  crew of thirty - but the ceiling itself is not gone.
- **CSV cannot carry a direction.** The xlsx export opens right to left; the CSV fallback,
  used when the export library cannot be reached, is at the mercy of whatever opens it.
