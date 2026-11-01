// v122: a named settings door, reachable sections, and navigation that never edits work.
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('settings browser uses the named tree', served.ok);
const browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const page = await browser.newPage({viewport: {width: 390, height: 844}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.goto(server.url);
    await page.evaluate(() => {
        State.schedule.workers = [{id: 'w_settings', name: 'עובד בדיקה', active: true, dailyRate: 450}];
        State.schedule.places = [{id: 'p_settings', name: 'אתר בדיקה', active: true}];
        State.commitRoster();
        render();
    });
    const before = await page.evaluate(() => JSON.stringify(State.schedule));
    suite('visible settings and quick section navigation');
    same('the header says settings rather than an unexplained icon', await page.locator('#settingsBtn').innerText(), 'הגדרות');
    await page.locator('#settingsBtn').click();
    for (const [label, target] of [['גיבוי ושחזור', 'settingsBackups'], ['מכשיר ועזרה', 'settingsHelp'], ['כללי', 'settingsDaily']]) {
        await page.locator('.settings-nav').getByRole('button', {name: label, exact: true}).click();
        same(`${label}: keyboard follows navigation`, await page.evaluate(() => document.activeElement.id), target);
        check(`${label}: heading is below the fixed navigation`, await page.locator(`#${target}`).evaluate(node => {
            const rect = node.getBoundingClientRect();
            const nav = document.querySelector('.settings-nav').getBoundingClientRect();
            return rect.top >= nav.bottom - 1 && rect.bottom < innerHeight;
        }));
    }
    await page.locator('.settings-nav').getByRole('button', {name: 'מכשיר ועזרה', exact: true}).click();
    await page.locator('#diagnosticToggle').click();
    check('technical details remain available in help', await page.locator('#diagnosticText').isVisible());
    await page.evaluate(() => renderSettingsIfOpen());
    check('live rerender preserves the open technical report', await page.locator('#diagnosticText').isVisible());
    same('one technical group after redraw', await page.locator('#diagnosticGroup').count(), 1);
    await page.keyboard.press('Escape');
    same('closing returns focus to the labelled button', await page.evaluate(() => document.activeElement.id), 'settingsBtn');
    await page.locator('#settingsBtn').click();
    same('reopening begins with current sync information', await page.locator('.settings-body').evaluate(node => node.scrollTop), 0);

    suite('phone reminders replace the Calendar handoff');
    same('both reminder times are readable', await page.locator('.push-reminder-times strong').allTextContents().then(values => values.join(',')), '18:00,10:00');
    check('no calendar handoff remains', await page.locator('a[href^="webcal:"]').count() === 0);
    check('no enabled claim without a server', !(await page.locator('#pushReminderTest').isVisible()));
    await page.locator('.push-reminder-help').evaluate(node => node.open = true);
    check('both platforms and existing-calendar cancellation are explained', /iPhone/.test(await page.locator('.push-reminder-help').innerText()) && /Galaxy/.test(await page.locator('.push-reminder-help').innerText()) && /כפולה/.test(await page.locator('.push-reminder-help').innerText()));
    suite('backup age describes a browser handoff, never a verified saved file');
    const backupCases = [
        ['missing', null, 'אין במכשיר הזה רישום של ייצוא קובץ גיבוי.', true],
        ['today', '2026-10-05', 'קובץ גיבוי נמסר לדפדפן: היום.', false],
        ['yesterday', '2026-10-04', 'קובץ גיבוי נמסר לדפדפן: אתמול.', false],
        ['six days', '2026-09-29', 'קובץ גיבוי נמסר לדפדפן: לפני 6 ימים.', false],
        ['seven days', '2026-09-28', 'קובץ גיבוי נמסר לדפדפן: לפני 7 ימים.', true],
        ['nine days', '2026-09-26', 'קובץ גיבוי נמסר לדפדפן: לפני 9 ימים.', true],
        ...[['malformed', 'not-a-date'], ['empty', ''], ['impossible', '2026-02-30'],
            ['future', '2026-10-06']].map(([name, date]) =>
            [name, date, 'מועד מסירת קובץ הגיבוי לדפדפן אינו ידוע.', true])
    ];
    await page.evaluate(() => { todayStr = () => '2026-10-05'; });
    for (const status of ['offline', 'synced']) {
        for (const [name, date, text, warn] of backupCases) {
            const unchanged = await page.evaluate(({date, status}) => {
                if (date === null) Store.remove('scheduleData:lastBackup');
                else Store.set('scheduleData:lastBackup', date);
                FarkadSync.status = status;
                const snapshot = () => JSON.stringify({schedule: State.schedule,
                    storage: Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
                    memory: Store.memory, outbox: [...FarkadSync._outbox]});
                const before = snapshot();
                renderBackupAge();
                return snapshot() === before;
            }, {date, status});
            same(`${status}/${name}: accurate handoff wording`, await page.locator('#backupAge').textContent(), text);
            same(`${status}/${name}: freshness warning`, await page.locator('#backupAge').evaluate(n => n.classList.contains('hint-warn')), warn);
            check(`${status}/${name}: presentation preserves schedule, storage and outbox`, unchanged);
        }
    }
    const help = await page.locator('.settings-group-backup > p').last().textContent();
    check('helper asks to check Files or Downloads and retain another copy',
        help.includes('קבצים') && help.includes('הורדות') && help.includes('עותק נוסף')
        && help.includes('סנכרון פעיל אינו אישור שהקובץ נשמר'));
    same('local and cloud snapshot sections remain present', await page.locator('#restorePoints, #cloudRestorePoints').count(), 2);

    suite('settings layout on small phones, large text, desktop and dark mode');
    for (const [width, scheme, scale] of [[320, 'light', 1], [390, 'light', 1], [430, 'dark', 1], [1000, 'light', 1], [320, 'light', 2], [320, 'dark', 2]]) {
        await page.setViewportSize({width, height: 844});
        await page.emulateMedia({colorScheme: scheme});
        // Let the existing 120ms background transition finish after changing theme.
        await page.waitForTimeout(180);
        // Text zoom, not geometric zoom: labels must wrap without shrinking controls.
        if (scale === 2) await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('#settingsPanel *')]
                .map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        });
        const geometry = await page.evaluate(() => {
            const panel = document.getElementById('settingsPanel');
            const body = panel.querySelector('.settings-body');
            const box = panel.getBoundingClientRect();
            return {
                inside: box.left >= -1 && box.right <= innerWidth + 1,
                overflow: body.scrollWidth > body.clientWidth + 1,
                small: [...panel.querySelectorAll('button, a[href], select')].filter(node => node.offsetParent !== null)
                    .filter(node => {const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44;}).map(node => node.textContent),
                nav: panel.querySelector('.settings-nav').getBoundingClientRect().bottom,
                bodyHeight: body.clientHeight
            };
        });
        check(`${width}/${scheme}/${scale}: inside viewport`, geometry.inside && !geometry.overflow, JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: usable controls and scrolling region`, !geometry.small.length && geometry.bodyHeight > 200, JSON.stringify(geometry));
        const backupFits = [];
        for (const [, date] of backupCases) {
            backupFits.push(await page.evaluate(date => {
                if (date === null) Store.remove('scheduleData:lastBackup');
                else Store.set('scheduleData:lastBackup', date);
                renderBackupAge();
                return [...document.querySelectorAll('.settings-group-backup > p')].every(n =>
                    n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1);
            }, date));
        }
        check(`${width}/${scheme}/${scale}: every backup status and helper fits without clipping`, backupFits.every(Boolean));
        if (process.env.SETTINGS_SCREENSHOT_DIR && scale === 1) {
            await page.locator('.settings-body').evaluate(node => node.scrollTop = 0);
            await page.screenshot({path: `${process.env.SETTINGS_SCREENSHOT_DIR}/settings-${width}-${scheme}.png`});
        }
        if (scale === 2) await page.evaluate(() => document.querySelectorAll('#settingsPanel *').forEach(node => node.style.removeProperty('font-size')));
    }
    same('opening, navigating and inspecting settings preserves worker data', await page.evaluate(() => JSON.stringify(State.schedule)), before);

    // ---------------------------------------------------------------- D4b, the real button
    //
    // A CONFLICT BETWEEN TWO WINDOWS OF THIS APP, ANSWERED BY A TAP, on a phone where
    // sync was never configured - which is every phone until firebase-config.js is
    // filled in. v163 added this family of hold and left the panel offering a decision
    // only when the CLOUD's side was known, so the question could never be answered and
    // the record stayed split. Driven here through the panel a person actually touches:
    // the row, its two lines, the button, and what the record says afterwards.
    //
    // The other window is simulated the way the other window really behaves - it writes
    // the whole record to localStorage - because that is precisely what this device
    // cannot distinguish from a second tab of itself.
    suite('a two-window conflict is answerable with no cloud, through the panel');
    await page.keyboard.press('Escape');
    const setUp = await page.evaluate(() => {
        State.schedule.workers = [{id: 'w_hold', name: 'עובד החזקה', active: true, dailyRate: 400}];
        State.schedule.places = [{id: 'p_one', name: 'אתר אחד', active: true},
            {id: 'p_two', name: 'אתר שני', active: true},
            {id: 'p_three', name: 'אתר שלישי', active: true}];
        State.commitRoster();
        const day = todayStr();
        State.date = day;
        State.commit(assignPlace(State.schedule, day, 'w_hold', 'actual', 'p_one', 'normal'));

        // The other window: the same day moved to the second site, written straight to
        // the record with a NEWER stamp, which is what makes it the other window's answer
        // rather than a record that has gone backwards.
        const held = JSON.parse(localStorage.getItem('scheduleData:v2'));
        held.days[day].actual.w_hold.entries = [{placeId: 'p_two'}];
        held.updatedAt = new Date(Date.now() + 60000).toISOString();
        held.updatedBy = 'd_other_window';
        localStorage.setItem('scheduleData:v2', JSON.stringify(held));

        // And this window, which has not seen that, moves the man to the third site.
        State.commit(assignPlace(State.schedule, day, 'w_hold', 'actual', 'p_three', 'normal'));
        return {day, rows: FarkadSync.heldRecords().map(row =>
            ({path: row.path, heard: row.heard, answerable: row.answerable}))};
    });
    check('the conflict is held, and the panel can answer it with no cloud',
        setUp.rows.length === 1 && setUp.rows[0].heard === false
        && setUp.rows[0].answerable === true, JSON.stringify(setUp.rows));

    // The refusal said so, in a dialog. A person reads it and closes it; so does this.
    check('the refused edit was said out loud, not swallowed',
        await page.locator('#askModal').isVisible());
    await page.keyboard.press('Escape');
    await page.locator('#askModal').waitFor({state: 'hidden'});

    await page.locator('#settingsBtn').click();
    const card = page.locator('#heldRecords .held-row').first();
    check('the row is drawn', await card.count() === 1);
    const lines = await card.locator('.held-side').allTextContents();
    check('it names this device and the other window as the two sides, not the cloud',
        lines.length === 2 && lines[0].indexOf('במכשיר הזה:') === 0
        && lines[1].indexOf('במכשיר, מחלון אחר:') === 0, JSON.stringify(lines));
    check('and both answers are offered as buttons',
        await card.getByRole('button', {name: 'להשאיר את שלי', exact: true}).count() === 1
        && await card.getByRole('button', {name: 'לקחת מהחלון האחר', exact: true}).count() === 1);

    await card.getByRole('button', {name: 'להשאיר את שלי', exact: true}).click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(day => ({
        rows: FarkadSync.heldRecords().length,
        answers: Object.keys(localStorage).filter(key => key.indexOf('farkad:holdanswer:') === 0).length,
        onScreen: entriesFor(State.schedule, day, 'w_hold', 'actual').map(e => e.placeId).sort().join('+'),
        onDisk: (() => {
            const record = JSON.parse(localStorage.getItem('scheduleData:v2'));
            return ((((record.days || {})[day] || {}).actual || {}).w_hold || {entries: []})
                .entries.map(e => e.placeId).sort().join('+');
        })()
    }), setUp.day);
    check('THE DECISION IS ON THE DISK, NAMING THE OPERATION', after.answers === 1,
        String(after.answers));
    check('the question is gone from the panel', after.rows === 0, String(after.rows));
    check('and the record now holds what the person chose',
        after.onDisk === after.onScreen && after.onDisk.indexOf('p_three') !== -1,
        JSON.stringify(after));

    check('no uncaught errors during navigation', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
