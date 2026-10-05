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

    suite('calendar handoff is explicit and does not claim notification permission');
    same('default reminder excludes Friday and Saturday',await page.locator('#calendarReminderDays').inputValue(),'workdays');
    same('the chosen time is readable',await page.locator('.calendar-reminder-time strong').innerText(),'18:00');
    for(const kind of ['workdays','friday','everyday']) {
        await page.locator('#calendarReminderDays').selectOption(kind);
        const path=`calendars/daily-${kind}-1800.ics`;
        same(`${kind}: native Calendar link`,await page.locator('#calendarReminderOpen').getAttribute('href'),`webcal://yoseffarkad1-eng.github.io/farkad/${path}`);
        same(`${kind}: manual subscription address`,await page.locator('#calendarReminderAddress').inputValue(),`https://yoseffarkad1-eng.github.io/farkad/${path}`);
        same(`${kind}: downloadable alternative`,await page.locator('#calendarReminderDownload').getAttribute('href'),path);
        const response=await page.request.get(server.url+'/'+path);
        check(`${kind}: served calendar includes an alarm`,response.ok()&&(await response.text()).includes('BEGIN:VALARM'));
    }
    await page.locator('#calendarReminderDays').selectOption('workdays');
    await page.locator('#calendarReminderOpen').evaluate(link=>link.addEventListener('click',event=>event.preventDefault(),{once:true}));
    await page.locator('#calendarReminderOpen').click();
    check('opening requires confirmation in Calendar',/אשר.*ביומן.*התראות/.test(await page.locator('#calendarReminderStatus').innerText()));
    await page.locator('#calendarReminderIPhoneHelp summary').click();
    check('repeat and cancellation are explained',/כפולות/.test(await page.locator('#calendarReminderIPhoneHelp').innerText()));
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.calendarCopied=text;}}}));
    await page.getByRole('button',{name:'העתקת כתובת היומן',exact:true}).click();
    same('copy shares only the public subscription address',await page.evaluate(()=>window.calendarCopied),await page.locator('#calendarReminderAddress').inputValue());
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
    await page.getByRole('button',{name:'העתקת כתובת היומן',exact:true}).click();
    check('a denied clipboard selects the address for manual copying',await page.locator('#calendarReminderAddress').evaluate(n=>document.activeElement===n&&n.selectionStart===0&&n.selectionEnd===n.value.length));
    check('copy failure is not called success',(await page.locator('#calendarReminderStatus').innerText()).includes('לא הושלמה'));
    if(process.env.CALENDAR_SCREENSHOT_DIR) {
        await page.locator("#calendarReminderDays").selectOption("workdays");
        await page.locator('#calendarReminderIPhoneHelp summary').click();
        await page.locator('.calendar-reminder').scrollIntoViewIfNeeded();
        await page.screenshot({path:`${process.env.CALENDAR_SCREENSHOT_DIR}/Farkad-v141-Calendar-Reminder.png`});
    }

    suite('Galaxy setup uses the phone calendar and never claims activation');
    const android = await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true,
        userAgent:'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
    android.on('pageerror',error=>errors.push(error.message));
    try {
        await android.goto(server.url);
        await android.locator('#settingsBtn').click();
        same('Galaxy selects its own setup automatically',await android.locator('#calendarReminderDevice').inputValue(),'android');
        check('Galaxy hides the iPhone-only handoff',!(await android.locator('#calendarReminderIPhone').isVisible())&&await android.locator('#calendarReminderAndroid').isVisible());
        await android.locator('.calendar-reminder-android-help summary').click();
        for(const [kind,words] of [['workdays','ראשון עד חמישי'],['friday','ראשון עד שישי'],['everyday','בכל יום']]) {
            await android.locator('#calendarReminderDays').selectOption(kind);
            check(`${kind}: the Android guide follows the chosen days`,(await android.locator('#calendarReminderAndroidRepeat').innerText()).includes(words));
        }
        check('Galaxy explicitly requires saving and notification permission',(await android.locator('#calendarReminderAndroid [role="status"]').innerText()).includes('אחרי שתשמור אותה ביומן ותאפשר התראות'));
        check('Galaxy offers editing the series instead of duplicating reminders',(await android.locator('#calendarReminderAndroid').innerText()).includes('כל סדרת האירועים'));
        await android.locator('#calendarReminderDevice').selectOption('iphone');
        check('manual iPhone choice exposes the subscription',await android.locator('#calendarReminderOpen').isVisible()&&!(await android.locator('#calendarReminderAndroid').isVisible()));
        await android.keyboard.press('Escape');
        await android.locator('#settingsBtn').click();
        same('reopening preserves the manual device choice',await android.locator('#calendarReminderDevice').inputValue(),'iphone');
    } finally { await android.close(); }

    suite('settings layout on small phones, large text, desktop and dark mode');
    for (const device of ['iphone','android']) {
    await page.locator('#calendarReminderDevice').selectOption(device);
    await page.locator(device==='android' ? '.calendar-reminder-android-help' : '#calendarReminderIPhoneHelp').evaluate(node=>node.open=true);
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
                small: [...panel.querySelectorAll('button, a[href], select, .calendar-reminder input')].filter(node => node.offsetParent !== null)
                    .filter(node => {const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44;}).map(node => node.textContent),
                nav: panel.querySelector('.settings-nav').getBoundingClientRect().bottom,
                bodyHeight: body.clientHeight
            };
        });
        check(`${device}/${width}/${scheme}/${scale}: inside viewport`, geometry.inside && !geometry.overflow, JSON.stringify(geometry));
        check(`${device}/${width}/${scheme}/${scale}: usable controls and scrolling region`, !geometry.small.length && geometry.bodyHeight > 200, JSON.stringify(geometry));
        if (process.env.SETTINGS_SCREENSHOT_DIR && scale === 1) {
            await page.locator('.settings-body').evaluate(node => node.scrollTop = 0);
            await page.screenshot({path: `${process.env.SETTINGS_SCREENSHOT_DIR}/settings-${width}-${scheme}.png`});
        }
        if (scale === 2) await page.evaluate(() => document.querySelectorAll('#settingsPanel *').forEach(node => node.style.removeProperty('font-size')));
    }
    }
    same('opening, navigating and inspecting settings preserves worker data', await page.evaluate(() => JSON.stringify(State.schedule)), before);
    check('no uncaught errors during navigation', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
