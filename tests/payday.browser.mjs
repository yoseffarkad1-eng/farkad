// «יום תשלום» - on the glass.
//
//   node tests/payday.browser.mjs [--shots <dir>]
//
// tests/payday.test.mjs holds the figures, the checks, the gate, the cost and the words in
// Node. This holds what only a screen can say, in a real Chromium with emulated touch, on the
// crew tests/screens.mjs seeds (Tuesday 10 November 2026, the evening; a week and a fortnight
// that both end on Thursday 12/11) - and, where a check needs it, that record changed IN
// MEMORY ONLY (deskRecord below: nothing committed, the disk is what the seed left):
//
//   B12 THE ROW ON «מקדמות» at 320x568, 375x667 and 440x956, dark and light, with «תצוגה
//       גדולה» off and on: «יום תשלום» and «סגירת שבוע» in one row, each with its words inside
//       it and 48px tall (52 with the mode); the board under it where it stood without the
//       row (0px; up to 18px at 320 with the mode); «סגירת שבוע» still opens from it. THE
//       CENSUS: opening the payslips from the desk writes exactly the bytes their own entry in
//       «הפקת דוח» writes, and opening, reading and closing the desk writes nothing. Fix round 1:
//       the first card's «לתשלום» on the glass as the desk opens; the open «לפי עובד» marked.
//   B13 THE TAP paints «מחשב את החשבונות…» before any figure (in the next frame); the figures
//       then arrive within 1,500 ms and are, as text, the band «דוחות» draws for each group on
//       the same page state.
//   B14 A BUILD WITHOUT THE FILE: with paydayEntryButton set to undefined «מקדמות» is drawn
//       rectangle for rectangle as the base commit draws it (git archive, served beside this
//       tree), «סגירת שבוע» at full width.
//   B15 EVERY DOOR, TAPPED, lands where it says; a dialog it opens is entered at its title;
//       a door to a view runs a task after the desk shut and the keyboard is then where the
//       target put it, never on a node of the shut desk (revision 2). Fix round 1: Thursday's
//       «לסגירה» says the men check d names once, in d's look; «מקדמות» lands on its men.
//   B16 Escape, the backdrop and «סגור» close the desk and give the keyboard back to its
//       button; Tab stays inside; «לפי עובד» unfolds and folds with the keyboard; midEdit()
//       is true while it is open and false once it is shut (revision 2). Fix round 1: each
//       «לפי עובד» named by its group; check a follows the sync line while the desk is open.
//   B17 A COMMIT UNDER THE OPEN DESK: the placeholder over the figures at once, then the new
//       figures once the draws have stopped; the dialog left where it was scrolled to. Fix
//       round 1: the placeholder on the glass at that position, the keyboard back on its control.
//   B18 THE FLOORS of the desk on every phone, scheme and mode, folded and unfolded (the
//       ruler of tests/screens.mjs): 14px, 4.5:1, 44px - and 18px, 500, 7:1, 52px with the
//       mode; no two controls over each other, no words past a control, nothing cut, nothing
//       out of reach, no sideways scroll; the title on the glass. And every font doubled at
//       320, 375 and 440, the mode off and on: no sideways scroll, nothing off the side, the
//       last door reachable - and (fix round 1) every figure on one line, every label's words
//       whole, each count with its word.
//   B20 WHERE «סגירת שבוע» IS NOT DRAWN (revision 2): the writer gate shut (the test seam) and,
//       in B12's pages, a record nobody approved (in memory) - «יום תשלום» alone at the
//       board's full width, its words inside it, and the board's move MEASURED, printed, and
//       equal to the row (the button plus its gap) at every phone, scheme and mode.
//   B19 Nothing threw, on any page.
//
// With --shots <dir> it also leaves pictures (JPEG): the row and the desk at 440x956 dark,
// the desk at 320x568 with the mode, and the desk's checks. They assert nothing.
//
// NOT a real phone: emulated touch and Chromium's layout and fonts. Synthetic names only.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor, blobsAt, sha256 } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { openApp, measure, PHONES, SCHEMES } from './screens.mjs';

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt !== -1 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);

// THE BASE, out of Git: the commit this track was cut from, served beside this tree so that a
// build without the file can be held to what the base really draws.
const BASE = '6ab193d68c960e4a56d947673c282b867acd258f';
const baseDir = mkdtempSync(join(tmpdir(), 'payday-base-'));
execFileSync('git', ['-C', root, 'archive', '--format=tar', '-o', join(baseDir, 'base.tar'), BASE]);
execFileSync('tar', ['-xf', join(baseDir, 'base.tar'), '-C', baseDir]);
const baseServer = await serve(baseDir);
{
    const expected = blobsAt(BASE, { root: baseDir, objectsFrom: root });
    const wrong = [];
    for (const file of Object.keys(expected).filter(name => name !== 'firestore.rules')) {
        const response = await fetch(`${baseServer.url}/${file}`);
        if (!response.ok || sha256(await response.text()) !== expected[file]) wrong.push(file);
    }
    given('the base commit is served as Git holds it', wrong.length === 0 && Object.keys(expected).length > 30, wrong.slice(0, 3).join(', '));
}

const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const allErrors = [];
const brief = (rows, say) => rows.slice(0, 5).map(say).join(' | ') + (rows.length > 5 ? ` … +${rows.length - 5}` : '');
const bare = text => String(text === undefined || text === null ? '' : text).replace(/[⁦-⁩‎‏]/g, '');
const PLACEHOLDER = 'מחשב את החשבונות…';
const THURSDAY = '2026-11-12T19:30:00+02:00';

// ---------------------------------------------------------------- the page
async function phone(url, options) {
    const opened = await openApp(browser, url, options);
    opened.page.on('pageerror', error => allErrors.push(`${options.width} ${options.scheme}: ${error.message}`));
    return opened;
}

const toAdvances = async page => {
    await page.evaluate(() => {
        ['updateBanner', 'installBanner', 'whatsNewBanner', 'closeReminderBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
        ADVANCE_WORKER = null; OWES_PAGE = null; showView('advances'); window.scrollTo(0, 0);
    });
    await page.waitForTimeout(250);
};

const tapOn = async (page, selector) => {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await target.tap();
};

const openDesk = async page => {
    await tapOn(page, '#paydayEntry');
    await page.waitForFunction(() => typeof PAYDAY !== 'undefined' && PAYDAY && PAYDAY.state === 'shown', null, { timeout: 15000 });
    await page.waitForTimeout(150);
};

// The disk as a person's phone holds it, less the two bookkeeping keys that move by themselves.
const disk = (page, ...skip) => page.evaluate(keys => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds' && key.indexOf('farkad:writeTick') !== 0 && !keys.includes(key))
    .map(key => [key, localStorage.getItem(key)])), skip);

// A record with something for every check to say, CHANGED IN MEMORY ONLY (the model's own
// writers on the live schedule, nothing committed - a reload takes it all back). Runs in the page.
//   b  סאמר ח'טיב, paid by the week: 1,500 on 26/10; that week closed with 300 taken, the week
//      after left open
//   c  זיאד עמר: two days this fortnight and no daily rate
//   e  an advance of 400 to מוחמד אבו ראס חוסיין handed back twice (two phones)
//   f  האני חלבי: two extra hours on 09/11 and no hourly rate
function deskRecord() {
    if (window.__deskRecord) return;
    window.__deskRecord = true;
    addAdvance(State.schedule, 'w06', '2026-10-26', 1500, '');
    State.schedule.workers[5].payCycles = '2026-08-07=weekly';
    closePeriodChanges(State.schedule, 'w06', '2026-10-23', '2026-10-29', '2026-10-29T15:40:00.000Z', syncDeviceId(), 300);
    State.schedule.workers.push({ id: 'w20', name: 'זיאד עמר', active: true, dailyRate: 0, hourlyRate: 0, phone: '' });
    ['2026-11-09', '2026-11-10'].forEach(date => assignPlace(State.schedule, date, 'w20', 'actual', 'p1'));
    State.schedule.workers.push({ id: 'w21', name: 'האני חלבי', active: true, dailyRate: 420, hourlyRate: 0, phone: '' });
    assignPlace(State.schedule, '2026-11-09', 'w21', 'actual', 'p2', 'extra', 2);
    const made = recordNewAdvance(State.schedule, 'w03', '2026-11-09', 400, '', '2026-11-09T07:00:00.000Z', syncDeviceId(), 'cash');
    const id = made[0].value.id;
    recordAdvanceRepaid(State.schedule, id, 400, '2026-11-10', '', '2026-11-10T08:00:00.000Z', 'd_a', 'cash');
    recordAdvanceRepaid(State.schedule, id, 400, '2026-11-10', '', '2026-11-10T08:05:00.000Z', 'd_b', 'cash');
    OWES_PAGE = null;
    render();
}

// EVERY FONT DOUBLED (tests/mobile.test.mjs's doubleEveryFontSize): every rule that sets a size
// in px said again at twice it, behind the same media queries. Runs in the page; answers how
// many rules it doubled.
function doubleEveryFont() {
    const out = [];
    const walkRules = (rules, wrap) => {
        for (const rule of rules) {
            if (rule.type === 4 || rule.type === 12) {
                const head = rule.type === 4 ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                walkRules(rule.cssRules, said => wrap(`${head}{${said}}`));
                continue;
            }
            if (rule.type !== 1 || !rule.style) continue;
            const raw = rule.style.getPropertyValue('font-size');
            if (!raw || !/^[\d.]+px$/.test(raw.trim())) continue;
            wrap(`${rule.selectorText}{font-size:${parseFloat(raw) * 2}px !important;}`);
        }
    };
    for (const sheet of document.styleSheets) {
        let rules = null;
        try { rules = sheet.cssRules; } catch (error) { rules = null; }
        if (rules) walkRules(rules, said => out.push(said));
    }
    const style = document.createElement('style');
    style.textContent = out.join('\n');
    document.head.appendChild(style);
    return out.length;
}

// A FIGURE IS ONE PIECE (fix round 1). Every figure of the desk - the cards' three and each man's
// - read off its line boxes: on how many lines it is drawn. And every word of a figure's label,
// and the count with its word under a card. Runs in the page.
function splitFigures() {
    const lines = range => new Set([...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5).map(r => Math.round(r.top))).size;
    const whole = node => { const range = document.createRange(); range.selectNodeContents(node); return lines(range); };
    const shown = node => node.getClientRects().length > 0;
    const clean = text => text.replace(/[⁦-⁩‎‏]/g, '');
    const figures = [...document.querySelectorAll('#paydayBody .payday-value')].filter(shown);
    const words = [];
    document.querySelectorAll('#paydayBody .payday-figure-label').forEach(label => {
        const text = label.firstChild;
        if (!text || !shown(label)) return;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(text.nodeValue))) {
            const range = document.createRange();
            range.setStart(text, m.index);
            range.setEnd(text, m.index + m[0].length);
            if (lines(range) > 1) words.push(m[0]);
        }
    });
    const counts = [...document.querySelectorAll('#paydayBody .payday-count-n')].filter(shown);
    return {
        figures: figures.length,
        broken: figures.filter(node => whole(node) > 1).map(node => clean(node.textContent)),
        labels: words.map(clean),
        counts: counts.length,
        countsBroken: counts.filter(node => whole(node) > 1).map(node => clean(node.textContent))
    };
}

// The ruler's floors, said once.
const FLOOR = { size: 14, ratio: 4.5, target: 43.5, weight: 0 };
const LARGE = { size: 18, ratio: 7, target: 51.5, weight: 500 };
function holdFloors(label, read, floor, width) {
    const live = read.texts.filter(t => !t.off);
    given(`${label}: there is something on it to measure`, live.length > 10, String(live.length));
    const text = t => `${t.size}px w${t.weight} ${t.contrast}:1 «${t.words}» ${t.where}`;
    const small = live.filter(t => t.size < floor.size);
    check(`${label}: no text under ${floor.size}px (${live.length} pieces)`, small.length === 0, brief(small, text));
    const faint = live.filter(t => t.contrast !== null && t.contrast < floor.ratio);
    check(`${label}: every text at ${floor.ratio}:1 or better on the ground painted under it`, faint.length === 0, brief(faint, t => `${t.ink} on ${t.ground} ${text(t)}`));
    if (floor.weight) {
        const thin = live.filter(t => t.weight < floor.weight);
        check(`${label}: no text lighter than ${floor.weight}`, thin.length === 0, brief(thin, text));
        const tight = live.filter(t => t.lines > 1 && t.lineHeight !== null && t.lineHeight < 1.4);
        check(`${label}: no wrapped text tighter than 1.4`, tight.length === 0, brief(tight, t => `${t.lineHeight} ${text(t)}`));
    }
    const fingers = read.targets.filter(t => t.w < floor.target || t.h < floor.target);
    check(`${label}: every control ${Math.ceil(floor.target)}px both ways (${read.targets.length} controls)`, fingers.length === 0,
        brief(fingers, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
    check(`${label}: no two controls over each other`, read.overlaps.length === 0, brief(read.overlaps, o => `${o.by} «${o.words}»`));
    check(`${label}: no control's words past its edge`, read.spills.length === 0, brief(read.spills, o => `${o.by} «${o.words}»`));
    same(`${label}: the page is as wide as the phone`, read.page.scrollWidth, width);
    check(`${label}: nothing off the side`, read.offside.length === 0, brief(read.offside, o => `${o.left}..${o.right} ${o.where}`));
    check(`${label}: nothing cut`, read.cut.length === 0, brief(read.cut, c => `${c.by} «${c.words}» ${c.where}`));
    check(`${label}: nothing out of reach - the dialog scrolls to all of it`, read.unreachable.length === 0,
        brief(read.unreachable, u => `${u.top}..${u.bottom} «${u.words}»`));
}

const titleOnGlass = page => page.evaluate(() => {
    const content = document.querySelector('#paydayModal .modal-content');
    const title = document.getElementById('paydayTitle');
    const t = title.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    return t.top >= Math.max(c.top, 0) - 1 && t.bottom <= Math.min(c.bottom, window.innerHeight) + 1 && content.scrollTop === 0;
});

// THE BANDS «דוחות» DRAWS, read off the page as it opens (the default account) - each group's
// cycle, its dates, and the cells of its band (the work table's footer, or «סיכום התקופה»).
function sheetBandsInPage() {
    REPORT_SECTION = 'workers'; REPORT_WORKERS = null; REPORT_PRESET = 'fortnight';
    REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_CARD_GRID = true;
    showView('reports');
    const clean = text => text.replace(/[⁦-⁩‎‏]/g, '');
    const section = document.querySelector('#reportsView .report-payroll');
    const groups = [];
    let current = null;
    [...section.children].forEach(node => {
        if (node.tagName === 'H3' && node.getAttribute('data-cycle')) {
            const m = /(\d\d)\/(\d\d)\/(\d{4}) - (\d\d)\/(\d\d)\/(\d{4})/.exec(clean(node.textContent));
            current = { cycle: node.getAttribute('data-cycle'), span: m ? [`${m[3]}-${m[2]}-${m[1]}`, `${m[6]}-${m[5]}-${m[4]}`] : null, nodes: [] };
            groups.push(current);
        } else if (current) current.nodes.push(node);
    });
    return groups.map(group => {
        const holder = group.nodes.find(node => node.classList.contains('report-reconcile-group'))
            || group.nodes.find(node => node.classList.contains('report-payroll-group'));
        const cells = holder ? [...holder.querySelectorAll('tfoot td')] : [];
        return { cycle: group.cycle, span: group.span, cells: cells.map(cell => [cell.getAttribute('data-label'), cell.textContent]) };
    }).filter(group => group.cells.length);
}
const deskCardsInPage = () => [...document.querySelectorAll('#paydayBody .payday-card')].map(card => ({
    key: card.dataset.group, cycle: card.dataset.cycle,
    figures: [...card.querySelectorAll('.payday-figure')].map(cell => [cell.querySelector('.payday-figure-label').textContent,
        cell.querySelector('.payday-value').textContent])
}));

// WHERE «סגירת שבוע» IS NOT DRAWN (revision 2, criterion 12): the writer gate shut, or a record
// nobody approved - weeklyCloseEntryButton() answers null and «יום תשלום» stands alone, at full
// width, where the base drew nothing; the board under it moves down by that row. Runs in the
// page: `how` 'unapproved' takes the approval off the record IN MEMORY first (nothing committed).
function aloneRow(how) {
    if (how === 'unapproved') {
        const plan = planCarryMigration(State.schedule);
        const held = State.schedule.ledger && State.schedule.ledger.migrations;
        if (held && Object.prototype.hasOwnProperty.call(held, String(plan.id))) delete held[String(plan.id)];
    }
    ADVANCE_WORKER = null; OWES_PAGE = null;
    render();
    const take = () => {
        const box = document.querySelector('#advancesView .owes');
        const row = box.querySelector(':scope > .owes-actions');
        const next = row ? row.nextElementSibling : box.firstElementChild;
        const r = row ? row.getBoundingClientRect() : null;
        return {
            weekly: document.querySelector('#advancesView .weekly-close-entry') !== null,
            buttons: row ? [...row.children].map(node => {
                const q = node.getBoundingClientRect();
                return { words: node.textContent, id: node.id, w: Math.round(q.width), h: Math.round(q.height) };
            }) : [],
            rowHeight: r ? Math.round(r.height * 10) / 10 : 0,
            gap: row ? parseFloat(getComputedStyle(row).marginBottom) : 0,
            boxWidth: Math.round(box.getBoundingClientRect().width),
            next: next ? next.className : null,
            nextTop: next ? next.getBoundingClientRect().top + window.scrollY : null
        };
    };
    const drawn = take();
    const was = paydayEntryButton;
    paydayEntryButton = undefined;
    render();
    const without = take();
    paydayEntryButton = was;
    render();
    return { gate: carryReportingEnabled(State.schedule), writes: ledgerWritesEnabled(), drawn, without };
}
const ALONE = [];
async function holdAlone(label, page, read, large) {
    const tall = large ? 52 : 48;
    same(`${label}: «סגירת שבוע» is not drawn, and «יום תשלום» stands alone in the row`,
        [read.drawn.weekly, read.drawn.buttons.map(one => one.words)], [false, ['יום תשלום']]);
    const one = read.drawn.buttons[0] || { w: 0, h: 0 };
    check(`${label}: at the board's full width, ${tall}px tall or more`, Math.abs(one.w - read.drawn.boxWidth) <= 1 && one.h >= tall,
        JSON.stringify([one.w, one.h, read.drawn.boxWidth]));
    const words = await measure(page, ['#advancesView .owes-actions']);
    check(`${label}: its words inside it`, words.spills.length === 0 && words.cut.length === 0,
        brief(words.spills.concat(words.cut), o => `${o.by} «${o.words}»`));
    given(`${label}: the same board under the row and with no row at all (a build without the file)`,
        read.drawn.next === read.without.next && read.without.buttons.length === 0 && read.without.weekly === false,
        `${read.drawn.next} / ${read.without.next}`);
    const moved = Math.round((read.drawn.nextTop - read.without.nextTop) * 10) / 10;
    const row = Math.round((read.drawn.rowHeight + read.drawn.gap) * 10) / 10;
    check(`${label}: the board moves down by that row and nothing more - ${moved}px (the button ${read.drawn.rowHeight}px + the gap ${read.drawn.gap}px)`,
        Math.abs(moved - row) <= 1, `${moved} / ${row}`);
    ALONE.push(`${label}: ${moved}px`);
}

// ================================================================== B12, B18: every phone, scheme and mode
for (const [width, height] of PHONES) {
    for (const scheme of SCHEMES) {
        for (const large of [false, true]) {
            const label = `${width}x${height} ${scheme}${large ? ', large display' : ''}`;
            suite(`${label}: the row on «מקדמות», the desk, its floors`);
            const { context, page } = await phone(server.url, { width, height, scheme, large });
            await toAdvances(page);
            const before = await disk(page);

            // ---- the row
            const row = await page.evaluate(() => {
                const node = document.querySelector('#advancesView .owes-actions');
                const next = node.nextElementSibling;
                return { first: node.parentNode.firstElementChild === node,
                    buttons: [...node.children].map(button => {
                        const r = button.getBoundingClientRect();
                        return { words: button.textContent, id: button.id, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
                    }),
                    nextTop: next.getBoundingClientRect().top + window.scrollY, next: next.className };
            });
            same(`${label}: one row first in the board - «יום תשלום», then «סגירת שבוע»`, [row.first, row.buttons.map(one => one.words)],
                [true, ['יום תשלום', 'סגירת שבוע']]);
            check(`${label}: side by side, half the row each`, row.buttons[0].top === row.buttons[1].top
                && Math.abs(row.buttons[0].w - row.buttons[1].w) <= 1, JSON.stringify(row.buttons));
            const rowRead = await measure(page, ['#advancesView .owes-actions']);
            const tall = large ? 52 : 48;
            check(`${label}: both buttons ${tall}px tall or more, and 44 wide or more`, row.buttons.every(one => one.h >= tall && one.w >= 44),
                JSON.stringify(row.buttons.map(one => [one.w, one.h])));
            check(`${label}: their words inside them`, rowRead.spills.length === 0 && rowRead.cut.length === 0, brief(rowRead.spills.concat(rowRead.cut), o => `${o.by} «${o.words}»`));
            const without = await page.evaluate(() => {
                const was = paydayEntryButton;
                paydayEntryButton = undefined;
                render();
                const weekly = document.querySelector('#advancesView .owes > .weekly-close-entry');
                const next = weekly.nextElementSibling;
                const out = { nextTop: next.getBoundingClientRect().top + window.scrollY, next: next.className,
                    weeklyWidth: Math.round(weekly.getBoundingClientRect().width), boardWidth: Math.round(weekly.parentNode.getBoundingClientRect().width) };
                paydayEntryButton = was;
                render();
                return out;
            });
            const moved = Math.round(row.nextTop - without.nextTop);
            given(`${label}: the same board under the row and under the button alone`, row.next === without.next, `${row.next} / ${without.next}`);
            if (large && width === 320) check(`${label}: the board under the row moves 18px at most (both words wrap here)`, moved >= 0 && moved <= 18, `${moved}px`);
            else same(`${label}: the board under the row does not move`, moved, 0);
            check(`${label}: without the file «סגירת שבוע» stands at the board's full width`, without.weeklyWidth === without.boardWidth,
                `${without.weeklyWidth} / ${without.boardWidth}`);
            await tapOn(page, '#advancesView .owes-actions .weekly-close-entry');
            await page.waitForTimeout(200);
            same(`${label}: «סגירת שבוע» still opens from the row, at its title`, await page.evaluate(() => {
                const out = [document.getElementById('weeklyCloseModal').style.display, document.activeElement && document.activeElement.id];
                closeWeeklyClose();
                return out;
            }), ['flex', 'weeklyCloseTitle']);
            await page.waitForTimeout(100);
            check(`${label}: and opening it wrote nothing`, (await disk(page)) === before);

            // ---- the desk, read
            await openDesk(page);
            check(`${label}: the desk opens at its title, on the glass`, await titleOnGlass(page));
            // Fix round 1: the dialog opens on the figure it is for. At 320 with the mode the lead
            // above the cards took six lines and the first «לתשלום» stood under the glass's edge.
            const pay = await page.evaluate(() => {
                const value = document.querySelector('#paydayBody .payday-card .payday-figure-pay .payday-value').getBoundingClientRect();
                const box = document.querySelector('#paydayModal .modal-content').getBoundingClientRect();
                const actions = document.querySelector('#paydayModal .modal-actions').getBoundingClientRect();
                return { top: Math.round(value.top), bottom: Math.round(value.bottom), from: Math.round(Math.max(box.top, 0)),
                    to: Math.round(Math.min(box.bottom, window.innerHeight, actions.top)) };
            });
            check(`${label}: as it opens, the first card's «לתשלום» is on the glass`, pay.top >= pay.from && pay.bottom <= pay.to, JSON.stringify(pay));
            holdFloors(`${label}: the desk`, await measure(page, ['#paydayModal']), large ? LARGE : FLOOR, width);
            await page.evaluate(() => document.querySelectorAll('#paydayModal .payday-fold').forEach(node => node.click()));
            await page.waitForTimeout(150);
            same(`${label}: every «לפי עובד» unfolded`, await page.evaluate(() => [...document.querySelectorAll('#paydayModal .payday-fold')]
                .map(node => node.getAttribute('aria-expanded') === 'true' && !document.getElementById(node.getAttribute('aria-controls')).hidden)),
            [true, true]);
            // Fix round 1: open and shut were the same button to the eye.
            same(`${label}: an unfolded «לפי עובד» is marked on the glass, and a folded one is not`, await page.evaluate(() => {
                const fold = document.querySelector('#paydayModal .payday-fold');
                const open = getComputedStyle(fold).boxShadow;
                fold.click();
                const shut = getComputedStyle(fold).boxShadow;
                fold.click();
                return [open !== 'none', shut];
            }), [true, 'none']);
            holdFloors(`${label}: the desk, every man unfolded`, await measure(page, ['#paydayModal']), large ? LARGE : FLOOR, width);
            if (SHOTS && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large))) {
                const name = `${width}x${height}-${scheme}${large ? '-large' : ''}`;
                await page.evaluate(() => { document.querySelectorAll('#paydayModal .payday-fold').forEach(node => node.click()); document.querySelector('#paydayModal .modal-content').scrollTop = 0; });
                await page.waitForTimeout(150);
                await page.screenshot({ path: join(SHOTS, `payday-desk-${name}.jpg`), type: 'jpeg', quality: 82 });
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);

            // ---- the record with every check, in memory: the floors again, on all of it
            await page.evaluate(deskRecord);
            await page.waitForTimeout(150);
            await openDesk(page);
            same(`${label}: on that record the desk says b, c, e and f (and a: this phone has no cloud)`, await page.evaluate(() =>
                [...document.querySelectorAll('#paydayBody .payday-check')].map(node => node.className.replace('payday-check payday-check-', ''))),
            ['notReady', 'unclosed', 'unpriced', 'review', 'hoursUnpriced', 'forgotten']);
            holdFloors(`${label}: the desk with every check`, await measure(page, ['#paydayModal']), large ? LARGE : FLOOR, width);
            if (SHOTS && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large))) {
                const name = `${width}x${height}-${scheme}${large ? '-large' : ''}`;
                await page.evaluate(() => { const before = document.querySelector('#paydayBody .payday-before'); before.scrollIntoView({ block: 'start' }); });
                await page.waitForTimeout(150);
                await page.screenshot({ path: join(SHOTS, `payday-checks-${name}.jpg`), type: 'jpeg', quality: 82 });
            }
            await page.keyboard.press('Escape');
            check(`${label}: reading, unfolding and closing the desk wrote nothing`, (await disk(page)) === before);

            // ---- Thursday 12/11 on the same record (fix round 1: the review's state the screens'
            // walk cannot hold - a period ends on a Thursday only, and the walk is a Tuesday): the
            // morning of payday, today typed for nobody - «היום, » on every card, check d naming the
            // men, «לסגירה» one line for them. Its floors, on all of it.
            await page.clock.setSystemTime(new Date(THURSDAY));
            await page.evaluate(() => { OWES_KEPT = null; ADVANCE_WORKER = null; OWES_PAGE = null; render(); });
            await page.waitForTimeout(150);
            await openDesk(page);
            same(`${label}: Thursday, today typed for nobody - «היום, » on every card, d, and «לסגירה» one line in d's look`, await page.evaluate(() => [
                [...document.querySelectorAll('#paydayBody .payday-card-head')].every(node => node.textContent.indexOf('היום, ') === 0),
                document.querySelectorAll('#paydayBody .payday-check-endsToday').length,
                document.querySelectorAll('#paydayBody .payday-held-today').length,
                document.querySelectorAll('#paydayBody .payday-held').length]), [true, 1, 1, 0]);
            holdFloors(`${label}: the desk on Thursday, today not typed`, await measure(page, ['#paydayModal']), large ? LARGE : FLOOR, width);
            await page.keyboard.press('Escape');
            check(`${label}: and on Thursday too, nothing written`, (await disk(page)) === before);

            // ---- a record nobody approved, in memory: «סגירת שבוע» not drawn, the desk's button alone
            const unapproved = await page.evaluate(aloneRow, 'unapproved');
            given(`${label}: the record, its approval taken off in memory, is one nobody approved`, unapproved.gate === false && unapproved.writes === true);
            await holdAlone(`${label}, a record nobody approved`, page, unapproved, large);
            check(`${label}: and that wrote nothing either`, (await disk(page)) === before);
            // Fix round 1: the desk itself on that record - the plain bands and «מקדמות»'s own
            // sentence in place of «לסגירה» - to the floors.
            await openDesk(page);
            same(`${label}: on a record nobody approved the desk reads the old way - «מקדמות»'s sentence, no «לסגירה»`, await page.evaluate(() => [
                document.querySelectorAll('#paydayBody .payday-gate').length, document.querySelectorAll('#paydayBody .payday-close').length]), [1, 0]);
            holdFloors(`${label}: the desk on a record nobody approved`, await measure(page, ['#paydayModal']), large ? LARGE : FLOOR, width);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
            if (SHOTS && width === 440 && scheme === 'dark' && !large) {
                await page.reload({ waitUntil: 'load' });
                await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
                await toAdvances(page);
                await page.screenshot({ path: join(SHOTS, 'payday-row-440x956-dark.jpg'), type: 'jpeg', quality: 82 });
            }
            await context.close();
        }
    }
}

// ================================================================== B13 the tap, the placeholder, the band
{
    suite('375x667 light: the tap paints «מחשב את החשבונות…» first; the figures are the band «דוחות» draws');
    const { context, page } = await phone(server.url, { width: 375, height: 667, scheme: 'light' });
    await toAdvances(page);
    await page.evaluate(() => { PAYDAY_KEPT = null; OWES_KEPT = null; });
    const first = await page.evaluate(() => new Promise(done => {
        const began = performance.now();
        window.__paydayBegan = began;
        document.getElementById('paydayEntry').click();
        requestAnimationFrame(() => done({ shown: getComputedStyle(document.getElementById('paydayModal')).display,
            text: document.getElementById('paydayBody').textContent,
            figures: document.querySelectorAll('#paydayBody .payday-value').length }));
    }));
    same('in the frame after the tap: the dialog, «מחשב את החשבונות…» and not one figure', first, { shown: 'flex', text: PLACEHOLDER, figures: 0 });
    await page.waitForFunction(() => PAYDAY && PAYDAY.state === 'shown', null, { timeout: 15000 });
    const took = await page.evaluate(() => performance.now() - window.__paydayBegan);
    console.log(`        (the seeded crew: tap to figures in ${Math.round(took)} ms)`);
    check('the figures within 1,500 ms of the tap', took <= 1500, `${Math.round(took)} ms`);
    const desk = await page.evaluate(deskCardsInPage);
    await page.keyboard.press('Escape');
    const bands = await page.evaluate(sheetBandsInPage);
    given('«דוחות» drew a band for each group', bands.length === desk.length && desk.length === 2, JSON.stringify(bands.map(band => band.span)));
    desk.forEach(card => {
        const [cycle, from, to] = card.key.split('|');
        const band = bands.find(one => one.cycle === cycle && (!one.span || (one.span[0] === from && one.span[1] === to)));
        const cell = name => { const found = band && band.cells.find(([label]) => label === name); return found ? found[1] : null; };
        const [gross, taken, pay] = card.figures;
        same(`${card.key}: «נצבר» as «דוחות» prints it`, gross[1], cell('נצבר'));
        same(`${card.key}: «לתשלום» as «דוחות» prints it`, pay[1], cell('לתשלום'));
        if (cell(taken[0]) !== null) {
            same(`${card.key}: «${taken[0]}» as «דוחות» prints it (a nought blank there)`, taken[1], cell(taken[0]) === '' ? '0' : cell(taken[0]));
        } else {
            // No such column on the work table: nobody in the group was handed an advance in the
            // period. What came off is then what the band's two printed figures differ by.
            same(`${card.key}: «${taken[0]}» (no such column there) is «נצבר» less «לתשלום»`,
                Number(bare(taken[1])), Math.round((Number(bare(gross[1])) - Number(bare(pay[1]))) * 100) / 100);
        }
    });
    await context.close();
}

// ================================================================== B14 a build without the file
{
    suite('a build without the file: «מקדמות» drawn rectangle for rectangle as the base draws it');
    for (const [width, height, scheme, large] of [[375, 667, 'light', false], [320, 568, 'dark', true]]) {
        const label = `${width}x${height} ${scheme}${large ? ', large display' : ''}`;
        const rects = async (url, undefine) => {
            const { context, page } = await phone(url, { width, height, scheme, large });
            await toAdvances(page);
            const out = await page.evaluate(undefine => {
                if (undefine) { paydayEntryButton = undefined; render(); }
                const board = document.querySelector('#advancesView .owes');
                return [board, ...board.querySelectorAll('*')].filter(node => node.getClientRects().length).map(node => {
                    const r = node.getBoundingClientRect();
                    return [node.tagName, node.className, Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)];
                });
            }, undefine);
            await context.close();
            return out;
        };
        const base = await rects(baseServer.url, false);
        const here = await rects(server.url, true);
        given(`${label}: the base draws a board with «סגירת שבוע» in it`, base.length > 5 && base.some(node => /weekly-close-entry/.test(node[1])));
        same(`${label}: with paydayEntryButton undefined, every rectangle of the board is the base's`, here, base);
    }
}

// ================================================================== B15 every door
{
    suite('Thursday 12/11, the record with every check: every door, tapped, lands where it says');
    const { context, page } = await phone(server.url, { width: 375, height: 667, scheme: 'light' });
    await page.clock.setSystemTime(new Date(THURSDAY));
    await page.evaluate(deskRecord);
    await toAdvances(page);
    const before = await disk(page);
    await openDesk(page);
    const doors = await page.evaluate(() => [...document.querySelectorAll('#paydayBody .payday-door')].map(node => node.textContent.replace(/[⁦-⁩]/g, '')));
    same('the doors of the desk, in the order they stand', doors, ['הצג את החשבון 30/10 - 05/11', 'עובדים ואתרים', 'לרישום היום',
        'המקדמות של מוחמד אבו ראס חוסיין', 'עובדים ואתרים', 'מקדמות', 'לסגירת שבוע', '💬 תלוש לכל עובד', 'סגירות שנרשמו']);
    // Fix round 1, THE MORNING THE DESK IS FOR: today is typed for nobody yet, so «סגירת שבוע»
    // holds every man whose period ends today - and check d names them. «לסגירה» counted them in
    // one line in the warning's look; it repeated check d's sentence a man, in a red list, under
    // «אין עכשיו חשבונות לסגור».
    same('Thursday, today not typed: «לסגירה» says the men check d names in one line, in d\'s own look - no red list, no «אין עכשיו חשבונות לסגור»',
        await page.evaluate(() => {
            const section = document.querySelector('#paydayBody .payday-close');
            const today = section.querySelector('.payday-held-today');
            const d = document.querySelector('#paydayBody .payday-check-endsToday');
            const look = node => { const style = getComputedStyle(node); return [style.backgroundColor, style.borderInlineStartColor, style.borderInlineStartWidth]; };
            const text = document.getElementById('paydayBody').textContent.replace(/[⁦-⁩]/g, '');
            return { today: today && today.textContent, red: section.querySelectorAll('.payday-held').length, nobody: section.querySelectorAll('.payday-close-say').length,
                look: Boolean(today && d) && JSON.stringify(look(today)) === JSON.stringify(look(d)),
                d: text.split('נגמרות היום, והיום עוד לא נרשם להם').length - 1, held: text.split('התקופה שלו נגמרת היום').length - 1 };
        }), { today: '13 עובדים לא ייסגרו עד שיירשם להם היום.', red: 0, nobody: 0, look: true, d: 1, held: 0 });
    await page.keyboard.press('Escape');
    const where = () => page.evaluate(() => ({
        view: currentView, desk: document.getElementById('paydayModal').style.display,
        workers: REPORT_WORKERS ? [...REPORT_WORKERS] : null, range: [REPORT_RANGE.from, REPORT_RANGE.to],
        advanceWorker: ADVANCE_WORKER, owesPage: OWES_PAGE, date: State.date,
        weekly: document.getElementById('weeklyCloseModal').style.display, slips: document.getElementById('payslipsModal').style.display,
        focus: document.activeElement && document.activeElement.id,
        inDesk: document.getElementById('paydayModal').contains(document.activeElement),
        onGroup: Boolean(document.activeElement) && document.activeElement === document.querySelector('#reportsView .report-payroll .report-group'),
        onMan: Boolean(document.activeElement) && document.activeElement === document.querySelector('#advancesView .advance-workers .advance-worker-card'),
        searchOnGlass: (() => {
            const search = document.querySelector('#advancesView input[type="search"]');
            if (!search || currentView !== 'advances') return null;
            const r = search.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight;
        })()
    }));
    const reset = () => page.evaluate(() => {
        if (typeof closeWeeklyClose === 'function') closeWeeklyClose();
        if (typeof closePayslips === 'function' && document.getElementById('payslipsModal').style.display === 'flex') closePayslips();
        REPORT_WORKERS = null; REPORT_PRESET = 'fortnight'; REPORT_RANGE.from = null; REPORT_RANGE.to = null;
        ADVANCE_WORKER = null; OWES_PAGE = null; showView('advances'); window.scrollTo(0, 0);
    });
    const landed = [];
    const slipsKey = await page.evaluate(() => localStorage.getItem('farkadPayslipsProgress'));
    for (let n = 0; n < doors.length; n += 1) {
        await reset();
        await page.waitForTimeout(150);
        await openDesk(page);
        if (doors[n] === '💬 תלוש לכל עובד') await page.evaluate(() => localStorage.removeItem('farkadPayslipsProgress'));
        const slipsBefore = await disk(page);
        await tapOn(page, `#paydayBody .payday-door >> nth=${n}`);
        await page.waitForTimeout(250);
        const at = await where();
        landed.push(at);
        if (doors[n] === '💬 תלוש לכל עובד') {
            // THE CENSUS: the one door that opens a screen which keeps its place writes what that
            // screen's own opener writes - and nothing else.
            const changed = JSON.parse(await page.evaluate(() => JSON.stringify(Object.keys(localStorage))))
                .filter(key => !/^farkad:(openBuilds|writeTick)/.test(key));
            const after = await disk(page);
            const written = JSON.parse(after).filter(pair => !JSON.parse(slipsBefore).some(old => old[0] === pair[0] && old[1] === pair[1])).map(pair => pair[0]);
            same('the payslips from the desk: one key written, the list\'s own', written, ['farkadPayslipsProgress']);
            given('and the disk still holds every other key', changed.length >= JSON.parse(slipsBefore).length);
            const fromDesk = JSON.parse(await page.evaluate(() => localStorage.getItem('farkadPayslipsProgress')));
            await reset();
            await page.evaluate(() => { localStorage.removeItem('farkadPayslipsProgress'); });
            await page.evaluate(() => { REPORT_SECTION = 'workers'; showView('reports'); });
            await page.waitForTimeout(200);
            await page.evaluate(() => { document.querySelector('#reportsView details.report-output-actions').open = true; });
            await tapOn(page, '#payslipsEntry');
            await page.waitForTimeout(250);
            const fromEntry = JSON.parse(await page.evaluate(() => localStorage.getItem('farkadPayslipsProgress')));
            const steady = value => JSON.stringify(Object.assign({}, value, { open: value && value.open ? Object.assign({}, value.open, { at: 'T' }) : value.open }));
            same('the bytes are those «הפקת דוח» ← «💬 תלוש לכל עובד» writes (the moment apart)', steady(fromDesk), steady(fromEntry));
            await page.evaluate(kept => {
                if (document.getElementById('payslipsModal').style.display === 'flex') closePayslips();
                if (kept === null) localStorage.removeItem('farkadPayslipsProgress'); else localStorage.setItem('farkadPayslipsProgress', kept);
            }, slipsKey);
        }
    }
    const pick = (n, fields) => fields.map(field => landed[n][field]);
    same('b: the pay sheet narrowed to סאמר ח\'טיב, at his open week', pick(0, ['view', 'desk', 'workers', 'range']),
        ['reports', 'none', ['w06'], ['2026-10-30', '2026-11-05']]);
    same('c: the roster', pick(1, ['view', 'desk']), ['roster', 'none']);
    same('d: the day screen, on today', pick(2, ['view', 'desk', 'date']), ['day', 'none', '2026-11-12']);
    same('e: his advances, where «לסדר את המקדמה» is', pick(3, ['view', 'advanceWorker']), ['advances', 'w03']);
    same('f: the roster', pick(4, ['view', 'desk']), ['roster', 'none']);
    same('h: the list of «מקדמות»', pick(5, ['view', 'advanceWorker', 'owesPage']), ['advances', null, null]);
    // Fix round 1: from a desk opened on «מקדמות» this door was «סגור» under another name - the page
    // where it was, the keyboard on <body>. It lands where an advance is recorded: the men's list
    // and its search on the glass, the keyboard on the first man (never on the search: a phone's
    // keyboard would rise over the list).
    same('h: the men\'s list and its search on the glass, the keyboard on the first man', pick(5, ['searchOnGlass', 'onMan', 'focus']), [true, true, '']);
    same('«לסגירת שבוע»: that dialog, entered at its title', pick(6, ['desk', 'weekly', 'focus']), ['none', 'flex', 'weeklyCloseTitle']);
    same('«💬 תלוש לכל עובד»: that list, on the period that ends today, entered at its title', pick(7, ['desk', 'slips', 'focus']),
        ['none', 'flex', 'payslipsTitle']);
    same('«סגירות שנרשמו»: that page of «מקדמות»', pick(8, ['view', 'owesPage']), ['advances', 'closures']);
    // REVISION 2: the focus is where the target put it, never left on a node of the shut desk. The
    // pay sheet focuses its group's heading (showOtherAccount) - a door run in the task of the press
    // lost it to js/ui/modal.js, which gives the keyboard back to the desk's opener at that task's end.
    same('b: the keyboard on the heading the pay sheet focused, not given back to the desk\'s button', pick(0, ['onGroup', 'inDesk']),
        [true, false]);
    same('no door left the keyboard on a node of the shut desk', landed.map(at => at.inDesk), doors.map(() => false));

    // WHEN each door runs, recorded in the page: a door to a dialog opens it in the task of the
    // press; a door to anything else has run nothing of its target when that task ends.
    const timing = [];
    for (let n = 0; n < doors.length; n += 1) {
        await reset();
        await page.waitForTimeout(150);
        await openDesk(page);
        timing.push(await page.evaluate(at => new Promise(resolve => {
            const names = ['showView', 'owesShowAccount', 'showWorkerAdvances', 'owesOpenPage', 'openWeeklyClose', 'openPayslips'];
            const calls = [];
            const real = {};
            names.forEach(name => { real[name] = window[name]; window[name] = function () { calls.push(name); return real[name].apply(this, arguments); }; });
            document.querySelectorAll('#paydayBody .payday-door')[at].click();
            const inTask = calls.slice();
            const shut = document.getElementById('paydayModal').style.display;
            setTimeout(() => {
                names.forEach(name => { window[name] = real[name]; });
                resolve({ inTask, after: calls.slice(), shut });
            }, 60);
        }), n));
        await page.evaluate(kept => {
            if (document.getElementById('payslipsModal').style.display === 'flex') closePayslips();
            if (kept === null) localStorage.removeItem('farkadPayslipsProgress'); else localStorage.setItem('farkadPayslipsProgress', kept);
        }, slipsKey);
    }
    const dialogDoors = ['לסגירת שבוע', '💬 תלוש לכל עובד'];
    check('every door shut the desk in the task of the press', timing.every(one => one.shut === 'none'), JSON.stringify(timing.map(one => one.shut)));
    same('a door to a view: nothing of its target in the task of the press', doors.filter(word => dialogDoors.indexOf(word) === -1)
        .map(word => [word, timing[doors.indexOf(word)].inTask]), doors.filter(word => dialogDoors.indexOf(word) === -1).map(word => [word, []]));
    given('and each of them ran in the task after', doors.every((word, n) => timing[n].after.length > 0), JSON.stringify(timing.map(one => one.after)));
    same('a door to a dialog: its opener in the task of the press', dialogDoors.map(word => timing[doors.indexOf(word)].inTask),
        [['openWeeklyClose'], ['openPayslips']]);
    await reset();
    check('no door wrote anything but the payslips\' own key (taken away again)', (await disk(page)) === before);
    await context.close();
}

// ================================================================== B16 the keyboard
{
    suite('440x956 dark: Escape, the backdrop and «סגור» give the keyboard back; Tab stays inside; «לפי עובד» by the keyboard');
    const { context, page } = await phone(server.url, { width: 440, height: 956, scheme: 'dark' });
    await toAdvances(page);
    const shut = () => page.evaluate(() => ({ open: document.getElementById('paydayModal').style.display, focus: document.activeElement && document.activeElement.id }));
    await openDesk(page);
    same('opened: the focus on its title', await page.evaluate(() => document.activeElement.id), 'paydayTitle');
    // Revision 2: an open desk is a moment somebody is in the middle of something - v205's
    // automatic update waits on midEdit() (js/ui/offline.js) - and a shut one is not.
    same('open: midEdit() is true', await page.evaluate(() => midEdit()), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    same('Escape: shut, the keyboard back on «יום תשלום»', await shut(), { open: 'none', focus: 'paydayEntry' });
    same('shut: midEdit() is false', await page.evaluate(() => midEdit()), false);
    await openDesk(page);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(100);
    same('the backdrop: shut, the keyboard back on «יום תשלום»', await shut(), { open: 'none', focus: 'paydayEntry' });
    await openDesk(page);
    await tapOn(page, '#paydayClose');
    await page.waitForTimeout(100);
    same('«סגור»: shut, the keyboard back on «יום תשלום»', await shut(), { open: 'none', focus: 'paydayEntry' });
    // Drawn again underneath while open: the button is a new node, and it still gets the keyboard back.
    await openDesk(page);
    await page.evaluate(() => { clear(document.getElementById('advancesView')); renderAdvances(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    same('«מקדמות» drawn again under the desk: Escape still gives the keyboard to «יום תשלום»', await shut(), { open: 'none', focus: 'paydayEntry' });
    await openDesk(page);
    const count = await page.evaluate(() => [...document.querySelectorAll('#paydayModal button')].filter(node => node.offsetParent !== null).length);
    const inside = [];
    for (let n = 0; n < count + 3; n += 1) {
        await page.keyboard.press('Tab');
        inside.push(await page.evaluate(() => document.getElementById('paydayModal').contains(document.activeElement)));
    }
    for (let n = 0; n < 3; n += 1) {
        await page.keyboard.press('Shift+Tab');
        inside.push(await page.evaluate(() => document.getElementById('paydayModal').contains(document.activeElement)));
    }
    check(`Tab and Shift+Tab ${inside.length} times: the keyboard never leaves the desk`, inside.every(Boolean), JSON.stringify(inside));
    await page.evaluate(() => document.querySelector('#paydayModal .payday-fold').focus());
    const fold = () => page.evaluate(() => { const node = document.querySelector('#paydayModal .payday-fold');
        return [node.getAttribute('aria-expanded'), document.getElementById(node.getAttribute('aria-controls')).hidden, document.activeElement === node]; });
    await page.keyboard.press('Enter');
    same('Enter on «לפי עובד»: unfolded, the button still under the keyboard', await fold(), ['true', false, true]);
    await page.keyboard.press('Space');
    same('Space: folded again', await fold(), ['false', true, true]);
    // Fix round 1: two cards, two buttons of one name. Each says whose men it unfolds.
    same('each «לפי עובד» is named by its group - its words, the cycle and the dates - and no two alike', await page.evaluate(() => {
        const names = [...document.querySelectorAll('#paydayModal .payday-fold')].map(node => (node.getAttribute('aria-label') || '').replace(/[⁦-⁩]/g, ''));
        return [names.length, names.every(name => name.indexOf('לפי עובד · ') === 0), new Set(names).size];
    }), [2, true, 2]);
    // Fix round 1: CHECK A FOLLOWS THE PHONE'S LINK WHILE THE DESK IS OPEN. A status changes the
    // sync line under the board (#storageNotice, js/sync/status.js) and calls no render(); the desk
    // watches that line. Here the phone is made one that may close, and the line says something
    // new - then put back - and the record is never read again for it.
    same('the sync line changing under the open desk: a goes and comes with it, the record not read again', await page.evaluate(async () => {
        const said = () => document.querySelectorAll('#paydayBody .payday-check-notReady').length;
        const notice = document.getElementById('storageNotice');
        const real = window.weeklyCloseReadyWord;
        const kept = PAYDAY_KEPT;
        const before = said();
        window.weeklyCloseReadyWord = () => null;
        notice.textContent = `${notice.textContent} `;
        await new Promise(done => setTimeout(done, 60));
        const synced = said();
        window.weeklyCloseReadyWord = real;
        notice.textContent = notice.textContent.trim();
        await new Promise(done => setTimeout(done, 60));
        return { before, synced, again: said(), read: PAYDAY_KEPT !== kept, inDesk: document.getElementById('paydayModal').contains(document.activeElement) };
    }), { before: 1, synced: 0, again: 1, read: false, inDesk: true });
    await page.keyboard.press('Escape');
    await context.close();
}

// ================================================================== B17 a commit under the open desk
{
    suite('375x667 dark: a commit under the open desk - the placeholder at once, the new figures after the draws stop, the scroll kept');
    const { context, page } = await phone(server.url, { width: 375, height: 667, scheme: 'dark' });
    await toAdvances(page);
    await openDesk(page);
    const weekly = () => page.evaluate(() => {
        const card = document.querySelector('#paydayBody .payday-card[data-cycle="weekly"]');
        return card ? card.querySelector('.payday-figure-gross .payday-value').textContent : null;
    });
    const was = await weekly();
    const scrolled = await page.evaluate(() => { const content = document.querySelector('#paydayModal .modal-content'); content.scrollTop = 260; return content.scrollTop; });
    given('the desk scrolls, and was scrolled', scrolled > 100, String(scrolled));
    // The keyboard on the second card's «לפי עובד» (fix round 1: a redraw dropped it to <body>).
    const held = await page.evaluate(() => { const fold = document.querySelectorAll('#paydayModal .payday-fold')[1]; fold.focus({ preventScroll: true }); return fold.dataset.focus; });
    // Thursday's day written for רון לוי (paid by the week) - a commit, and render() after it.
    await page.evaluate(() => State.commit(assignPlace(State.schedule, '2026-11-12', 'w07', 'actual', 'p1')));
    const stale = await page.evaluate(() => ({ state: PAYDAY.state, text: document.getElementById('paydayBody').textContent,
        figures: document.querySelectorAll('#paydayBody .payday-value').length, scrollTop: document.querySelector('#paydayModal .modal-content').scrollTop }));
    same('at once: the placeholder over the figures, no figure of the record before, the dialog where it was', stale,
        { state: 'stale', text: PLACEHOLDER, figures: 0, scrollTop: scrolled });
    // Fix round 1: drawn at the body's top it stood above the visible part of a scrolled desk, and
    // the dialog was an empty white box until the draws stopped. It is where the person is looking.
    const glass = await page.evaluate(() => {
        const said = document.querySelector('#paydayBody .payday-reading').getBoundingClientRect();
        const box = document.querySelector('#paydayModal .modal-content').getBoundingClientRect();
        const actions = document.querySelector('#paydayModal .modal-actions').getBoundingClientRect();
        const to = Math.min(box.bottom, window.innerHeight, actions.top);
        return { said: [Math.round(said.top), Math.round(said.bottom)], glass: [Math.round(Math.max(box.top, 0)), Math.round(to)],
            on: said.top >= Math.max(box.top, 0) - 1 && said.bottom <= to + 1,
            keyboard: document.activeElement && document.activeElement.id };
    });
    check('meanwhile «מחשב את החשבונות…» is on the glass, at the scrolled position', glass.on, JSON.stringify(glass));
    same('and the keyboard waits on the title, inside the desk', glass.keyboard, 'paydayTitle');
    await page.waitForFunction(() => PAYDAY && PAYDAY.state === 'shown', null, { timeout: 8000 });
    const now = await weekly();
    // רון לוי: 400 + 10 x (6 mod 4) a day (tests/screens.mjs's seed).
    same('once the draws stopped: read again - the day written ahead is in the week\'s «נצבר» (+420)', Number(now) - Number(was), 420);
    same('and the dialog is where it was scrolled to', await page.evaluate(() => document.querySelector('#paydayModal .modal-content').scrollTop), scrolled);
    same('and the keyboard is back on the control it was on - drawn again, found by what it is', await page.evaluate(() => [
        document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus : null,
        document.getElementById('paydayModal').contains(document.activeElement)]), [held, true]);
    await page.keyboard.press('Escape');
    await context.close();
}

// ================================================================== B18 doubled text
//
// Every font doubled, at the three phones, with «תצוגה גדולה» off and on (fix round 1: at 320 and
// 375 the figures broke in the middle - «4250» as «425» over «0», «32020» as «3202» over «0»,
// «-1500» as «-150» over «0», and «נוכה מהשכר» as «מהשכ» over «ר» - a first line that is another
// amount; this block measured only what was cut, and a wrapped number is not cut).
for (const [width, height] of PHONES) {
    for (const large of [false, true]) {
        const label = `${width}x${height} light${large ? ', large display' : ''}, every font doubled`;
        suite(`${label}: the desk still fits, no figure of it is broken, and its last door is reachable`);
        const { context, page } = await phone(server.url, { width, height, scheme: 'light', large });
        await page.evaluate(deskRecord);
        await toAdvances(page);
        const doubled = await page.evaluate(doubleEveryFont);
        given(`${label}: the cascade is doubled`, doubled > 300, String(doubled));
        await page.evaluate(() => render());
        await page.waitForTimeout(250);
        const row = await measure(page, ['#advancesView .owes-actions']);
        check(`${label}: the row's words still inside its buttons`, row.spills.length === 0 && row.cut.length === 0, brief(row.spills.concat(row.cut), o => `${o.by} «${o.words}»`));
        await openDesk(page);
        await page.evaluate(() => document.querySelectorAll('#paydayModal .payday-fold').forEach(node => node.click()));
        await page.waitForTimeout(150);
        const split = await page.evaluate(splitFigures);
        given(`${label}: every card's figures and every man's are there to measure`, split.figures >= 12, `${split.figures} figures`);
        same(`${label}: every figure on one line, the cards' and each man's (${split.figures})`, split.broken, []);
        same(`${label}: every word of a figure's label whole - a label breaks between its words only`, split.labels, []);
        same(`${label}: each card's count kept with its word, and on one line`, [split.counts, split.countsBroken], [2, []]);
        const read = await measure(page, ['#paydayModal']);
        same(`${label}: no sideways scroll`, read.page.scrollWidth, width);
        check(`${label}: nothing off the side`, read.offside.length === 0, brief(read.offside, o => `${o.left}..${o.right} ${o.where}`));
        check(`${label}: nothing cut`, read.cut.length === 0, brief(read.cut, c => `${c.by} «${c.words}» ${c.where}`));
        check(`${label}: no control's words past its edge`, read.spills.length === 0, brief(read.spills, o => `${o.by} «${o.words}»`));
        const last = await page.evaluate(() => {
            const content = document.querySelector('#paydayModal .modal-content');
            content.scrollTop = content.scrollHeight;
            const doors = document.querySelectorAll('#paydayBody .payday-door');
            const door = doors[doors.length - 1].getBoundingClientRect();
            const box = content.getBoundingClientRect();
            return { top: Math.round(door.top), bottom: Math.round(door.bottom), boxTop: Math.round(box.top), boxBottom: Math.round(box.bottom),
                close: Math.round(document.getElementById('paydayClose').getBoundingClientRect().bottom) };
        });
        check(`${label}: scrolled to its end, the last door and «סגור» are on the glass`, last.top >= last.boxTop - 1 && last.bottom <= last.boxBottom + 1
            && last.close <= last.boxBottom + 1, JSON.stringify(last));
        if (SHOTS && width === 320) {
            await page.evaluate(() => { document.querySelector('#paydayModal .modal-content').scrollTop = 0; document.querySelector('#paydayBody .payday-figures').scrollIntoView({ block: 'start' }); });
            await page.waitForTimeout(120);
            await page.screenshot({ path: join(SHOTS, `payday-doubled-320x568${large ? '-large' : ''}.jpg`), type: 'jpeg', quality: 82 });
        }
        await page.keyboard.press('Escape');
        await context.close();
    }
}

// ================================================================== B20 the writer gate shut
//
// The other way «סגירת שבוע» is not drawn: a build whose writer is shut (the one test seam,
// FARKAD_FLAG_OVERRIDES, set before the scripts load). On every phone, scheme and mode the
// desk's button alone, and the board's move measured - and the desk still opens from it.
for (const [width, height] of PHONES) {
    for (const scheme of SCHEMES) {
        for (const large of [false, true]) {
            const label = `${width}x${height} ${scheme}${large ? ', large display' : ''}, the writer gate shut`;
            suite(`${label}: «יום תשלום» alone, and the board's move measured`);
            const { context, page } = await phone(server.url, { width, height, scheme, large,
                before: async browserContext => browserContext.addInitScript(() => { window.FARKAD_FLAG_OVERRIDES = { ledgerWrites: false }; }) });
            await toAdvances(page);
            const before = await disk(page);
            const read = await page.evaluate(aloneRow, 'as it is');
            given(`${label}: this build cannot write a close, on a record that is approved`, read.writes === false && read.gate === true);
            await holdAlone(label, page, read, large);
            await openDesk(page);
            check(`${label}: the desk opens from it, at its title, on the glass`, await titleOnGlass(page));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
            check(`${label}: the keyboard back on «יום תשלום», and nothing written`,
                (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'paydayEntry' && (await disk(page)) === before);
            await context.close();
        }
    }
}
console.log(`\n        (where «סגירת שבוע» is not drawn the board moves down by the desk's row:\n         ${ALONE.join('\n         ')})`);

// ================================================================== B19
{
    suite('nothing threw');
    check('no uncaught error on any page', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
}

await browser.close();
await server.close();
await baseServer.close();
rmSync(baseDir, { recursive: true, force: true });
report();
