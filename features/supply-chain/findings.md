# The third-party code this app ships, and what is known about it

Measured on `88e406b`, on the `claude/farkad-quality-leap` branch. Nothing here is a
guess: every claim below names the command that produced it, so the next person can
re-run it rather than believe it.

## What actually reaches a phone

One file. `vendor/xlsx-0.18.5.min.js`, 881,727 bytes, in the service worker's shell,
loaded on demand by the reports screen. Its licence, `vendor/xlsx-0.18.5.LICENSE`, is in
the shell beside it, so the attribution travels with the code even onto a phone with no
signal.

Everything else in `package.json` is a **devDependency**: firebase, firebase-tools,
@firebase/rules-unit-testing, playwright, xlsx. None of them is served. The Firebase SDK
the app uses at runtime is fetched from Google's CDN by `js/sync/firebase-adapter.js`
after boot, never before the first render, and fails soft — that is a separate exposure
with its own reasoning in `docs/architecture.md`, and it is not this file's subject.

    $ grep -o "'\./[^']*'" sw.js | grep -c vendor/     → 2

## CVE-2023-30533, and why it does not reach the owner's crew

SheetJS below 0.19.3 has a prototype-pollution flaw. It is a flaw **in the parser**: a
crafted workbook, read by `XLSX.read` or `XLSX.readFile`, can set keys on
`Object.prototype`. The npm `xlsx` package is stale at 0.18.5 because SheetJS moved
distribution off npm, so `npm install xlsx@latest` cannot fix it and no lockfile bump
will either.

This app never parses a spreadsheet. It only writes them:

    $ grep -rn "XLSX\.\(read\|readFile\)" js/ tests/      → no matches
    $ grep -rno "XLSX\.[a-z_]*\.\?[a-z_]*" js/ | sort -u
        XLSX.utils.aoa_to_sheet
        XLSX.utils.book_append_sheet
        XLSX.utils.book_new
        XLSX.write

There is no door in this app through which a spreadsheet arrives. The reports screen
builds an array of arrays out of the schedule and hands it to `aoa_to_sheet`; nothing
reads a file a person supplies, and the backup/restore path is JSON through `Store`,
never a workbook. So the vulnerable code path is present in the shipped bytes and is
unreachable from any input a person can provide.

**This is a statement about today's code, not a permanent one.** The day somebody adds
"import an Excel sheet of workers" — which is a reasonable thing to want, and
`js/ui/quickstart.js` already does the paste-a-list version of it — the exposure becomes
real on the same commit. Whoever writes that feature has to upgrade the library first,
from SheetJS's own distribution, not from npm.

## What was NOT known, and is now pinned

`tests/xlsx.test.mjs` proved the library works — it builds a real workbook through this
exact file and reads the arithmetic back — and pinned the filename the page asks for,
cross-checked against the `XLSX.version` the file reports. None of that could catch the
file being a **different** 0.18.5: bytes edited, appended to, or taken from somewhere
other than the release this repository pins. Such a file reports 0.18.5, writes correct
spreadsheets, and passes every check in that suite.

`tests/build.test.mjs` now compares the shipped copy against the pinned devDependency's
own dist — bytes npm fetched from the registry and `npm ci` verified against
`package-lock.json`'s integrity hash:

    the only third-party code shipped is the release it claims to be
      PASS  the vendored library is in the shell
      PASS  the shipped copy is byte-identical to the pinned dependency's dist
      PASS  and the version in its filename is the version installed  — 0.18.5
      PASS  its licence sits beside it in the repository
      PASS  and nothing else is vendored

Proved able to fail on this commit: appending one comment line to
`vendor/xlsx-0.18.5.min.js` gives **FAIL ... b4512242ce973c5c vs c9506197caf809a0** and
33/34. The file was restored and re-hashed afterwards
(`c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99`).

The check also makes the two halves inseparable: bumping the dependency without
re-vendoring, and re-vendoring without bumping the dependency, both fail. An upgrade is
now a deliberate act with a diff, rather than something that half-happens.

## Not done here, and not this session's to do

- **Upgrading SheetJS.** It would mean taking a build from SheetJS's own CDN rather than
  npm, which changes where the shipped bytes come from and what verifies them. That is a
  supply-chain decision for the owner, it is not forced by any exposure this app has
  today, and it is not made on an afternoon.
- **`npm audit`.** It reports on devDependencies, which do not ship. Running it is
  worthwhile before a release; treating its output as a statement about the three phones
  would be wrong, and this file exists partly so nobody does that.
