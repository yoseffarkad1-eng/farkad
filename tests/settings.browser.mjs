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

    suite('settings layout on small phones, large text, desktop and dark mode');
    for (const [width, scheme, scale] of [[320, 'light', 1], [390, 'light', 1], [430, 'dark', 1], [1000, 'light', 1], [320, 'light', 2]]) {
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
                small: [...panel.querySelectorAll('button')].filter(node => node.offsetParent !== null)
                    .filter(node => {const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44;}).map(node => node.textContent),
                nav: panel.querySelector('.settings-nav').getBoundingClientRect().bottom,
                bodyHeight: body.clientHeight
            };
        });
        check(`${width}/${scheme}/${scale}: inside viewport`, geometry.inside && !geometry.overflow, JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: usable controls and scrolling region`, !geometry.small.length && geometry.bodyHeight > 200, JSON.stringify(geometry));
        if (process.env.SETTINGS_SCREENSHOT_DIR && scale === 1) {
            await page.locator('.settings-body').evaluate(node => node.scrollTop = 0);
            await page.screenshot({path: `${process.env.SETTINGS_SCREENSHOT_DIR}/settings-${width}-${scheme}.png`});
        }
        if (scale === 2) await page.evaluate(() => document.querySelectorAll('#settingsPanel *').forEach(node => node.style.removeProperty('font-size')));
    }
    same('opening, navigating and inspecting settings preserves worker data', await page.evaluate(() => JSON.stringify(State.schedule)), before);
    check('no uncaught errors during navigation', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
