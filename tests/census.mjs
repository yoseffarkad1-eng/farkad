// THE ONE KEY A WHOLE-DISK COMPARISON IN A BROWSER SUITE LEAVES OUT, and the check that
// it is the only one. Not a suite: a helper, on the HELPERS list of
// tests/gate.integrity.test.mjs.
//
// A dozen browser suites prove "this screen wrote nothing" by reading every key of
// localStorage before and after and holding the two byte for byte. One key on that disk
// is not the screen's and not the record's: `farkad:openBuilds` (OPEN_BUILDS_KEY,
// js/store.js), the SERVICE WORKER'S CENSUS of which builds have a window open. The page
// asks the worker for it and Store.noteOpenBuilds writes the answer WITH THE TIME -
// js/ui/offline.js, `census()` - on the page's own schedule:
//
//   - at load, when a worker already controls the page;
//   - on `controllerchange` - which on a first visit is the moment the freshly installed
//     worker claims the page, some hundreds of milliseconds after load, later on a busy
//     machine;
//   - on every `visibilitychange` that leaves the page visible.
//
// So a comparison that took its "before" ahead of the worker's claim and its "after"
// behind it saw a key appear that no screen wrote, and a later census moves the `at`
// inside it. Measured, with nothing touched between the readings: null right after load,
// {"at":…416658,"builds":["farkad-v189"],"foreign":false} once the worker claimed the
// page, the same record with a new `at` after one visibilitychange, and again after a
// reload. That is what failed daycheck, journey and settings-order - not load; load only
// widens the window.
//
// The app itself treats the key the same way: Store leaves it out of the write fence by
// name (js/store.js, bumpWriteTick: `if (key === OPEN_BUILDS_KEY) return;`), because it is
// bookkeeping about windows and not a write to anything a person recorded.
//
// WHAT THE COMPARISONS STILL GUARANTEE: every other key on the disk, byte for byte. The
// filter in each suite names this key as a literal (it runs inside the page), and each
// suite calls censusOnly() once, which fails if anything else on the disk is missing
// from what the suite read - so the exclusion cannot quietly grow - or if the key that is
// left out holds something that is not a census.

export const CENSUS_KEY = 'farkad:openBuilds';

// The keys a suite's own disk reading holds, whatever shape it keeps it in: a JSON string
// or the value itself; a list of [key, bytes] pairs, a list of names, or an object.
export function keysIn(snapshot) {
    const value = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    if (Array.isArray(value)) return value.map(item => (Array.isArray(item) ? item[0] : item));
    return Object.keys(value || {});
}

let asked = false;

// Once per suite (a second call is a no-op, so a helper used inside a loop may call it).
// `snapshot` is a disk reading the suite just took; `named` are the keys the suite leaves
// out for reasons of its own and says so (its feature's own key, say).
export async function censusOnly(check, page, snapshot, named = []) {
    if (asked) return;
    asked = true;
    const had = keysIn(snapshot);
    const seen = await page.evaluate(([had, named, censusKey]) => {
        const left = Object.keys(localStorage)
            .filter(key => had.indexOf(key) === -1 && named.indexOf(key) === -1).sort();
        const raw = localStorage.getItem(censusKey);
        let census = 'not written yet';
        if (raw !== null) {
            try {
                const said = JSON.parse(raw);
                census = said && Object.keys(said).sort().join() === 'at,builds,foreign'
                    && typeof said.at === 'number' && Array.isArray(said.builds)
                    && typeof said.foreign === 'boolean' ? 'a census' : `not a census: ${raw.slice(0, 80)}`;
            } catch (error) { census = `unreadable: ${raw.slice(0, 80)}`; }
        }
        return { left, census };
    }, [had, named, CENSUS_KEY]);
    check('the disk reading leaves out the service worker\'s census of open builds and no other key',
        had.indexOf(CENSUS_KEY) === -1 && seen.left.every(key => key === CENSUS_KEY)
        && (seen.census === 'a census' || seen.census === 'not written yet'),
        JSON.stringify(seen));
}
