// v172: THE SETTINGS SHEET IN STRICT ORDER, in a real browser.
//
// Until v172 the ⋯ sheet was nine open cards in one scroll. It is now three sections of
// rows that open in place, and that change has exactly two ways to hurt somebody:
//
//   a thing a person must see is behind a shut row - a record held for a decision, a
//   refused sync, a phone whose records will not read, a restore that never finished;
//
//   a thing a person does from memory has moved or gone - a button that is not there, a
//   sentence that changed, a row that is open today and shut tomorrow.
//
// So this file pins the ORDER (three sections, nine cards, by their own titles), the
// POSTURE (what is open when the sheet opens, and that it is the same every time), the
// rule that a redraw neither opens nor shuts anything, every reason a row opens by
// itself, and an INVENTORY: every control and every sentence that was on the v171 sheet,
// by tag, id, words and inline handler, found again with every row open.
//
// What it does not say: anything about an iPhone. <details> in a home-screen WebKit, the
// row under a thumb, VoiceOver reading a heading inside a <summary> - none of that is
// measured by a headless Chromium, and docs/releases.md says so first.
import {chromium} from 'playwright';
import {createECDH, randomBytes} from 'node:crypto';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('settings order uses the named tree', served.ok, served.wrong.slice(0, 3).join(' | '));
const browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const errors = [];

// THE ORDER, as the owner asked for it on 2026-11-09 and as index.html now has it.
const ORDER = [
    {id: 'settingsDaily', section: 'כללי', cards: ['ענן וסנכרון', 'תזכורות בטלפון', 'הסעות']},
    {id: 'settingsBackups', section: 'גיבוי ושחזור', cards: ['גיבוי', 'ייבוא ושחזור', 'שחזור חירום']},
    {id: 'settingsHelp', section: 'מכשיר ועזרה', cards: ['עדכון וגרסה', 'מצב המכשיר', 'מידע טכני']}
];
// 'card' is the one that is not a row and cannot be shut.
const POSTURE = {'ענן וסנכרון': 'card', 'תזכורות בטלפון': false, 'הסעות': false,
    'גיבוי': true, 'ייבוא ושחזור': false, 'שחזור חירום': false,
    'עדכון וגרסה': false, 'מצב המכשיר': false, 'מידע טכני': false};
const FOLD = {'תזכורות בטלפון': 'settingsFoldReminders', 'הסעות': 'transportSwitchCard',
    'גיבוי': 'settingsFoldBackup', 'ייבוא ושחזור': 'settingsFoldRestore',
    'שחזור חירום': 'settingsFoldRescue', 'עדכון וגרסה': 'settingsFoldUpdate',
    'מצב המכשיר': 'settingsFoldDevice', 'מידע טכני': 'diagnosticGroup'};

// THE INVENTORY OF THE v171 SHEET. Captured once, on 2026-11-09, from the tree of commit
// b640c5a (`git archive b640c5a`, served by tests/serve.mjs, 440x956) by the function
// `inventory` below, with every <details> forced open and the technical report shown -
// and then captured again from this tree and compared: identical, line for line. It is
// written out rather than re-derived on each run so that a later change which drops a
// control fails HERE, against a list a person can read. A control is `tag | id | words |
// inline handler`; the three with no inline handler are built by script and are pressed
// further down instead.
const CONTROLS = [
    "button |  | גיבוי ושחזור | settingsJump('settingsBackups')",
    'button |  | חזרה✕ | closeSettings()',
    "button |  | כללי | settingsJump('settingsDaily')",
    "button |  | מכשיר ועזרה | settingsJump('settingsHelp')",
    'button |  | ↩️ שחזר מצב קודם | restoreLocalBackup()',
    'button |  | 💾 ייצא נתונים גולמיים | exportRecoveryData()',
    'button |  | 💾 שמור קובץ גיבוי | exportBackup()',
    "button |  | 📂 טען קובץ גיבוי | document.getElementById('importInput').click()",
    'button |  | 🔄 בדוק עדכון | checkForUpdate()',
    'button | diagnosticCopy | העתק | ',
    'button | diagnosticToggle | הסתר מידע טכני | ',
    'button | pushReminderDisable | כיבוי ההתראות במכשיר הזה | FarkadReminders.disable()',
    'button | pushReminderEnable | הפעלת התראות במכשיר הזה | FarkadReminders.enable()',
    'button | pushReminderRefresh | בדיקה מחדש | FarkadReminders.refresh()',
    'button | pushReminderTest | שליחת התראת ניסיון | FarkadReminders.test()',
    'button | syncAuthBtn | ☁️ התחבר לענן | farkadSignIn()',
    'button | transportSwitch | הפעלת הסעות במכשיר הזה | ',
    'input | importInput |  | importBackup(event)',
    'select | pushReminderDays |  | FarkadReminders.daysChanged()',
    'textarea | diagnosticText |  | '
];
// WHAT THE SHEET GAINED SINCE v171, by name (v186): the pay book's one row. Its button has
// no inline handler - it is made by js/ui/accounts.js, like every control that file draws.
const ADDED_SINCE = {
    controls: ['button |  | פנקס שכר - הכנה והפעלה | '],
    sentences: ['פנקס שכר (סגירת חשבון, תשלומים וארכיון): עוד לא הופעל ברישום הזה.', 'פנקס שכר - הכנה והפעלה']
};
// Every run of words on the sheet, sorted. Four lines are left out because what they say
// depends on the moment and not on the build - the sync sentence and its reason, the
// reminder status while it is still checking, and the version - and each of those is
// held elsewhere (tests/smoke.mjs, tests/reminders.browser.mjs, and the last check here).
const SENTENCES = [
    '10:00', '18:00', 'Galaxy / Android:', 'iPhone:',
    'אחסון והתקנה',
    'אין במכשיר הזה רישום של ייצוא קובץ גיבוי.',
    'אם כבר הוספת תזכורת ליומן, הסר את יומן פרקד ב־iPhone או את סדרת האירועים ב־Galaxy כדי למנוע תזכורת כפולה.',
    'באילו ערבים להזכיר?',
    'בדוק עדכון',
    'בדוק שהקובץ נשמר ב״קבצים״ או ב״הורדות״ ושמור עותק נוסף במקום אחר. סנכרון פעיל אינו אישור שהקובץ נשמר.',
    'בדיקה אם יש גרסה חדשה לאפליקציה',
    'בדיקה מחדש',
    'בערב · רישום עובדים',
    'גיבוי', 'גיבוי ושחזור', 'גיבוי ושחזור',
    'הגדרות',
    'ההתראות אינן כוללות שמות עובדים או סכומי כסף. לחיצה פותחת את רישום היום; הרישום לא משתנה מעצמו.',
    'הסעות',
    'הסתר מידע טכני',
    'העברת מקדמות לחשבון נמשך',
    'העתק',
    'הפעלת הסעות במכשיר הזה',
    'הפעלת התראות במכשיר הזה',
    'התחבר לענן',
    'התראה מפרקד גם כשהמסך נעול',
    'חזרה',
    'חיבור ותזכורות',
    'טען קובץ גיבוי',
    'ייבוא ושחזור',
    'ייצא נתונים גולמיים',
    'יש מקום פנוי במכשיר.',
    'כבוי',
    'כדי לראות התראה במסך הנעילה, אפשר התראות לפרקד בהגדרות הטלפון. מצב שקט, מיקוד וחיבור לרשת עשויים להשפיע על ההצגה.',
    'כיבוי ההתראות במכשיר הזה',
    'כל יום',
    'כלי עזר לטיפול בתקלה',
    'כללי', 'כללי',
    'כשצריך לבדוק משהו',
    'למחרת בבוקר · בדיקה ועדכון',
    'לפי שעון ישראל · בכל מכשיר מפעילים בנפרד',
    'לשחזור חירום בלבד.',
    'מידע טכני',
    'מידע על ההתראות',
    'מכשיר ועזרה', 'מכשיר ועזרה',
    'מצב החיבור של המכשיר הזה',
    'מצב המכשיר',
    'עדכון וגרסה',
    'עותק נוסף של העבודה',
    'ענן וסנכרון',
    'פועל בדפדפן - לא מותקן על מסך הבית.',
    'פרקד · ניהול עובדים',
    'פתח את פרקד מהסמל במסך הבית, לחץ על הפעלה ואשר התראות. נדרש iOS 16.4 ומעלה.',
    'פתח ב־Chrome או Samsung Internet, לחץ על הפעלה ואשר התראות במכשיר.',
    'פתיחת גיבוי או חזרה למצב קודם',
    'ראשון עד חמישי', 'ראשון עד שישי',
    'שורות טכניות לצילום או להעתקה, כשמשהו נראה לא במקום על המסך. אין בהן שמות של עובדים או אתרים, אין סכומים ואין סיסמאות.',
    'שחזור חירום',
    'שחזור מחליף את הנתונים הקיימים. המצב הנוכחי נשמר כגיבוי מקומי לפני כן.',
    'שחזר מצב קודם',
    'שיבוץ העובדים לרכבים והודעה לכל נהג. מופעל בכל מכשיר בנפרד. במכשיר שמחובר לענן, השיבוץ ורשימת הרכבים משותפים עם הטלפונים האחרים שהפעילו הסעות. לא נכלל בגיבוי.',
    'שיבוץ עובדים לרכבים',
    'שליחת התראת ניסיון',
    'שמור קובץ גיבוי',
    'שמירת עותק של הנתונים בקובץ',
    'תזכורות בטלפון',
    'תזכורת הבוקר תגיע למחרת כל ערב שנבחר.',
    '↩️', 'ⓘ', '☁️', '✕', '💾', '💾', '📂', '🔄'
];

// Runs in the page. Every row forced open and the report shown, so that "it is still
// there" is asked of the whole sheet and not of what happens to be unfolded.
function inventory() {
    const panel = document.getElementById('settingsPanel');
    panel.querySelectorAll('details').forEach(node => { node.open = true; });
    const toggle = document.getElementById('diagnosticToggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    const squash = text => text.replace(/\s+/g, ' ').trim();
    const controls = [...panel.querySelectorAll('button, select, input, textarea, a[href]')].map(node => {
        const tag = node.tagName.toLowerCase();
        const handler = node.getAttribute('onclick') || node.getAttribute('onchange') || '';
        const words = tag === 'textarea' || tag === 'input' || tag === 'select' ? '' : squash(node.textContent);
        return [tag, node.id || '', words, handler].join(' | ');
    }).sort();
    const sentences = [];
    const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        if (node.parentElement.closest('svg, textarea, #appVersion, #settingsSyncStatus, '
            + '#settingsSyncReason, #pushReminderStatus')) continue;
        const own = squash(node.nodeValue);
        if (own) sentences.push(own);
    }
    return {controls, sentences: sentences.sort()};
}

async function open(options = {}) {
    const context = await browser.newContext({
        viewport: {width: options.width || 440, height: options.height || 956},
        colorScheme: options.scheme || 'dark', ...(options.touch ? {isMobile: true, hasTouch: true} : {})});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (options.init) await page.addInitScript(options.init.fn, options.init.arg);
    await page.goto(server.url);
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    if (options.seed !== false) await page.evaluate(() => {
        State.schedule.workers = [{id: 'w_order', name: 'עובד בדיקה', active: true, dailyRate: 450}];
        State.schedule.places = [{id: 'p_order', name: 'אתר בדיקה', active: true}];
        State.commitRoster();
        render();
    });
    return page;
}
const openSheet = async page => {
    await page.locator('#settingsBtn').click();
    await page.locator('#diagnosticGroup').waitFor({state: 'attached'});
};
const layout = page => page.evaluate(() =>
    [...document.querySelectorAll('#settingsPanel .settings-section')].map(section => ({
        id: section.querySelector('.settings-section-title h3').id,
        section: section.querySelector('.settings-section-title h3').textContent,
        cards: [...section.querySelectorAll('.settings-group')]
            .map(card => card.querySelector('.settings-card-head h3').textContent)
    })));
const posture = page => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('#settingsPanel .settings-group')].map(card =>
        [card.querySelector('.settings-card-head h3').textContent,
            card.tagName === 'DETAILS' ? card.open : 'card'])));
const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).open, id);
const row = (page, title) => page.locator(`#${FOLD[title]} > summary`);

try {
    // ------------------------------------------------------------------ order and posture
    const page = await open();
    const record = await page.evaluate(() => JSON.stringify(State.schedule));
    await openSheet(page);

    suite('three sections, nine cards, in the order that was asked for');
    same('the sections and their cards, by their own titles', await layout(page), ORDER);
    same('the jump buttons name the same three sections, in the same order',
        await page.locator('.settings-nav button').allTextContents(), ORDER.map(part => part.section));
    check('the advances review stands directly under the sync card, and is not a row',
        await page.evaluate(() => {
            const box = document.getElementById('carryMigrationBox');
            return box.previousElementSibling === document.querySelector('.settings-group-sync')
                && !box.closest('details');
        }));
    check('the sync card is a plain card: nothing in it is inside anything that can be shut',
        await page.evaluate(() => ['settingsSyncStatus', 'settingsSyncReason', 'heldRecords', 'syncAuthBtn']
            .every(id => !document.getElementById(id).closest('details'))
            && document.querySelector('.settings-group-sync').tagName === 'SECTION'));
    check('every other card is a native <details> whose <summary> is the card head',
        await page.evaluate(() => [...document.querySelectorAll('#settingsPanel .settings-group')]
            .filter(card => !card.classList.contains('settings-group-sync'))
            .every(card => card.tagName === 'DETAILS' && card.classList.contains('settings-fold')
                && card.firstElementChild.tagName === 'SUMMARY'
                && card.firstElementChild.classList.contains('settings-card-head')
                && card.querySelector(':scope > .settings-fold-body'))));
    check('every card has a picture at its head',
        await page.evaluate(() => [...document.querySelectorAll('#settingsPanel .settings-group')]
            .every(card => card.querySelector('.settings-card-head > .settings-card-icon svg'))));

    suite('what is open when the sheet opens, and that it is the same every time');
    same('on opening: sync fixed open, backup open, everything else shut', await posture(page), POSTURE);
    check('the one filled button is on screen without a tap or a scroll at 440x956',
        await page.locator('.backup-primary').evaluate(node => {
            const box = node.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight && node.offsetParent !== null;
        }));
    check('the sync sentence is on screen without a tap', await page.locator('#settingsSyncStatus').isVisible());

    await row(page, 'תזכורות בטלפון').click();
    await row(page, 'מצב המכשיר').click();
    await row(page, 'גיבוי').click();
    const chosen = {...POSTURE, 'תזכורות בטלפון': true, 'מצב המכשיר': true, 'גיבוי': false};
    same('a tap on a row opens it in place, and a tap on an open one shuts it', await posture(page), chosen);
    check('an opened row shows what it holds', await page.locator('#pushReminderDays').isVisible()
        && await page.locator('#storageRoom').isVisible());
    check('a shut row hides what it holds', !(await page.locator('.backup-primary').isVisible()));

    suite('a redraw neither opens nor shuts anything a person chose');
    await page.evaluate(() => { render(); renderSettingsIfOpen(); renderSettings(); });
    same('render() and a settings redraw leave the rows alone', await posture(page), chosen);
    const adopted = await page.evaluate(() => {
        // A snapshot from another phone: the same record with one more man on it.
        const raw = JSON.parse(JSON.stringify(State.schedule));
        raw.workers = raw.workers.concat([{id: 'w_other', name: 'עובד מהענן', active: true, dailyRate: 400}]);
        raw.updatedAt = new Date(Date.now() + 60000).toISOString();
        raw.updatedBy = 'd_other_phone';
        try { FarkadSync.receive(raw); } catch (error) { return 'threw: ' + error.message; }
        return State.schedule.workers.some(worker => worker.id === 'w_other');
    });
    same('a snapshot from another phone was adopted under the open sheet', adopted, true);
    same('and it left the rows alone', await posture(page), chosen);
    await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
    same('the connection changing leaves the rows alone', await posture(page), chosen);
    await page.evaluate(() => FarkadReminders.refresh());
    await page.waitForTimeout(300);
    same('a reminder check with nothing to report leaves the rows alone', await posture(page), chosen);

    suite('closing, and every opening starts from the same place');
    await page.keyboard.press('Escape');
    same('Escape closes and focus returns to the settings button',
        await page.evaluate(() => [document.getElementById('settingsPanel').classList.contains('open'),
            document.activeElement.id]), [false, 'settingsBtn']);
    await openSheet(page);
    same('reopening is the default again, not what the last person left', await posture(page), POSTURE);
    same('and starts at the top', await page.locator('.settings-body').evaluate(node => node.scrollTop), 0);
    same('with focus on the title', await page.evaluate(() => document.activeElement.id), 'settingsTitle');
    await row(page, 'ייבוא ושחזור').click();
    await page.locator('.settings-close').click();
    same('«חזרה» closes and focus returns to the settings button',
        await page.evaluate(() => [document.getElementById('settingsPanel').classList.contains('open'),
            document.activeElement.id]), [false, 'settingsBtn']);
    await openSheet(page);
    same('and the next opening is the default again', await posture(page), POSTURE);
    check('nothing about the rows is kept in storage',
        await page.evaluate(() => Object.keys(localStorage).every(key => !/fold|settings/i.test(key))));

    suite('the keyboard: a row is a control, and focus stays on the sheet');
    await row(page, 'מידע טכני').focus();
    await page.keyboard.press('Enter');
    same('Enter on a focused row opens it', await isOpen(page, 'diagnosticGroup'), true);
    await page.keyboard.press('Enter');
    same('and Enter again shuts it', await isOpen(page, 'diagnosticGroup'), false);
    await page.keyboard.press('Tab');
    // The failure this caught when it was written: the trap counted the button INSIDE the
    // shut last row as the last control, and Tab from the row itself left for <body>.
    check('Tab from the last row goes to the first control on the sheet, not out of it',
        await page.evaluate(() => document.activeElement.classList.contains('settings-close')),
        await page.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className));
    await row(page, 'גיבוי').focus();
    await page.keyboard.press('Tab');
    check('Tab from an open row goes into it', await page.evaluate(() =>
        document.activeElement.classList.contains('backup-primary')));
    await row(page, 'ייבוא ושחזור').focus();
    await page.keyboard.press('Tab');
    check('Tab from a shut row goes to the next row, never to something inside the shut one',
        await page.evaluate(() => document.activeElement === document.querySelector('#settingsFoldRescue > summary')));
    await page.locator('.settings-close').focus();
    await page.keyboard.press('Shift+Tab');
    check('and Shift+Tab from the first goes back to the last row',
        await page.evaluate(() => document.activeElement === document.querySelector('#diagnosticGroup > summary')));

    // ------------------------------------------------------------------ nothing was removed
    suite('nothing was removed: the v171 sheet, control by control and sentence by sentence');
    const found = await page.evaluate(inventory);
    // MOVED AT v186 (Phase 8 of the pay book), deliberately, and by ADDING: the sheet
    // gained one sentence and one button - the pay book's row under כללי, drawn by
    // js/ui/accounts.js on a record nobody has turned on (docs/payroll-activation.md).
    // It is the ONE thing a person sees of the pay book in the build as it ships. The
    // v171 lists above are untouched, so "nothing was removed" still asks what it asked;
    // what was added is named here, apart, so that it cannot grow unnoticed.
    same('every control, with its id, its words and its inline handler - the v171 sheet, and the one row added since',
        found.controls, CONTROLS.concat(ADDED_SINCE.controls).sort());
    same('every sentence, word for word - the same', found.sentences, SENTENCES.concat(ADDED_SINCE.sentences).sort());
    same('what was added is one sentence and one button, both in the first section and neither behind a shut row',
        await page.evaluate(() => {
            const box = document.getElementById('paybookActivationBox');
            return [Boolean(box), box ? box.closest('section.settings-section').id : null,
                box ? Boolean(box.closest('details')) : null, box ? box.querySelectorAll('button').length : null];
        }), [true, 'settingsDailySection', false, 1]);
    same('the version line names this build', await page.locator('#appVersion').textContent(),
        await page.evaluate(() => `גרסה ${APP_VERSION}`));
    // The three controls a script builds have no handler to read, so they are pressed.
    await page.locator('#transportSwitch').click();
    same('the transport switch still switches', [await page.locator('#transportSwitch').textContent(),
        await page.locator('#transportSwitchState').textContent(),
        await page.evaluate(() => Boolean(document.getElementById('transportEntry')))],
        ['כיבוי הסעות במכשיר הזה', 'מופעל במכשיר הזה', true]);
    await page.locator('#transportSwitch').click();
    same('and switches back', await page.locator('#transportSwitch').textContent(), 'הפעלת הסעות במכשיר הזה');
    check('the technical report is shown by its button and names the build',
        (await page.locator('#diagnosticText').inputValue()).includes('app.build=')
        && await page.locator('#diagnosticCopy').isVisible());
    await page.locator('#diagnosticToggle').click();
    same('and hidden by it again', [await page.locator('#diagnosticText').isVisible(),
        await page.locator('#diagnosticToggle').textContent()], [false, '🛠️ הצג מידע טכני']);
    const filled = await page.evaluate(() => {
        const paint = getComputedStyle(document.querySelector('.backup-primary')).backgroundColor;
        return [...document.querySelectorAll('#settingsPanel button')]
            .filter(node => node.checkVisibility() && getComputedStyle(node).backgroundColor === paint)
            .map(node => node.textContent.trim());
    });
    same('one filled button on the whole sheet, with every row open', filled, ['💾 שמור קובץ גיבוי']);
    await page.keyboard.press('Escape');
    same('opening, folding, redrawing and inspecting changed no day and no rate',
        await page.evaluate(() => JSON.stringify({days: State.schedule.days, places: State.schedule.places,
            mine: State.schedule.workers.filter(worker => worker.id === 'w_order')})),
        JSON.stringify({days: JSON.parse(record).days, places: JSON.parse(record).places,
            mine: JSON.parse(record).workers.filter(worker => worker.id === 'w_order')}));
    await page.context().close();

    // ------------------------------------------------------------------ folding writes nothing
    suite('opening and shutting rows writes nothing: not the record, not the store');
    {
        const quiet = await open();
        await openSheet(quiet);
        await quiet.waitForTimeout(400);
        const disk = () => quiet.evaluate(() => JSON.stringify([State.schedule,
            Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])]));
        const before = await disk();
        for (const title of Object.keys(FOLD)) await row(quiet, title).click();
        for (const title of Object.keys(FOLD)) await row(quiet, title).click();
        same('every row opened and shut again: the disk is byte for byte what it was', await disk(), before);
        await quiet.context().close();
    }

    // ------------------------------------------------------------------ rows that open themselves
    suite('שחזור חירום opens itself over a record that will not read');
    {
        const broken = await open({seed: false});
        await broken.evaluate(() => localStorage.setItem('scheduleData:v2', '{"schemaVersion":2,"workers":[{"id":"w_'));
        await broken.reload();
        await broken.waitForFunction(() => typeof Recovery !== 'undefined' && Recovery.problems.length > 0);
        // The app says so in a dialog at boot. A person reads it and closes it; so does this.
        await broken.locator('#askModal').waitFor({state: 'visible'});
        await broken.locator('#askOk').click();
        check('the banner over every screen still carries its own export button, one tap away',
            await broken.locator('#recoveryBanner').getByRole('button', {name: /ייצא נתונים גולמיים/}).isVisible());
        await openSheet(broken);
        same('the row is open when the sheet is', await isOpen(broken, 'settingsFoldRescue'), true);
        check('and its export button is there to be pressed',
            await broken.locator('#settingsFoldRescue').getByRole('button', {name: /ייצא נתונים גולמיים/}).isVisible());
        // The dialog at that boot says «בדוק את הימים האחרונים מול נקודות השחזור», and the
        // restore points are in ייבוא ושחזור - so that row is open beside it.
        same('with the row the boot dialog sends a person to, and nothing else',
            await posture(broken), {...POSTURE, 'שחזור חירום': true, 'ייבוא ושחזור': true});
        await row(broken, 'שחזור חירום').click();
        await broken.evaluate(() => { render(); renderSettings(); });
        same('shut by a person, it stays shut through a redraw while the problem stands',
            await isOpen(broken, 'settingsFoldRescue'), false);
        await broken.keyboard.press('Escape');
        await openSheet(broken);
        same('and is open again the next time the sheet opens', await isOpen(broken, 'settingsFoldRescue'), true);
        await broken.context().close();

        const later = await open();
        await openSheet(later);
        same('a healthy phone: the row is shut', await isOpen(later, 'settingsFoldRescue'), false);
        await later.evaluate(() => { Recovery.damaged('farkad:test:unreadable', '{"half', 'רשומת בדיקה לא נקראה.'); render(); });
        same('a record that stops reading while the sheet is open opens the row then',
            await isOpen(later, 'settingsFoldRescue'), true);
        await later.context().close();
    }

    suite('ייבוא ושחזור opens itself over a restore that is unfinished, unreadable, or just answered');
    {
        const restoring = await open();
        await restoring.evaluate(() => { FarkadSync.replacementOutstanding = () => true; });
        await openSheet(restoring);
        same('a restore still outstanding: the row is open', await isOpen(restoring, 'settingsFoldRestore'), true);
        check('and both restore doors are there', await restoring.getByRole('button', {name: /טען קובץ גיבוי/}).isVisible()
            && await restoring.getByRole('button', {name: /שחזר מצב קודם/}).isVisible());
        await restoring.context().close();

        const blind = await open();
        // The state SYNC_REASON_BLIND describes, whose sentence ends «טען קובץ גיבוי דרך ⋯ ←
        // שחזור»: the person is sent to this row by name.
        await blind.evaluate(() => { FarkadSync.replaceDamaged = true; });
        await openSheet(blind);
        same('a pending restore this phone cannot read: the row it is sent to is open',
            await isOpen(blind, 'settingsFoldRestore'), true);
        await blind.context().close();

        // THE WAY BACK FOR SOMEBODY WHO HAS JUST LOST THE RECORD. A restore point is never
        // taken of an empty crew, so an empty crew beside a restore point is a phone that
        // held a record and now shows none.
        const lost = await open();
        await lost.evaluate(() => {
            takeDailySnapshot();
            State.schedule.workers = []; State.schedule.days = {};
            State.save(); render();
        });
        await openSheet(lost);
        same('the crew is gone and a restore point exists: the row is open',
            await isOpen(lost, 'settingsFoldRestore'), true);
        check('and the date to go back to is on the screen with no tap at all',
            await lost.locator('#restorePoints button').first().isVisible());
        await lost.context().close();

        const cloudOnly = await open();
        await cloudOnly.evaluate(() => {
            // No restore point on this phone at all; the only way back is the cloud's copy,
            // which is listed on a promise after the sheet has been drawn.
            const kept = JSON.parse(JSON.stringify(State.schedule));
            FarkadSync.adapter = {update: () => Promise.resolve(), save: () => Promise.resolve(),
                archive: () => Promise.resolve(), archiveDates: () => Promise.resolve(['2026-11-08']),
                archiveRead: () => Promise.resolve(kept)};
            Object.keys(localStorage).filter(key => key.indexOf('scheduleData:snap:') === 0)
                .forEach(key => localStorage.removeItem(key));
            State.schedule.workers = []; State.schedule.days = {};
            State.save(); render();
        });
        await openSheet(cloudOnly);
        same('the crew is gone, no local restore point, the cloud not yet heard: shut',
            await isOpen(cloudOnly, 'settingsFoldRestore'), false);
        // Set and drawn in one turn: this page has no cloud to stay synced with, and the
        // list is only asked for while the status says synced.
        await cloudOnly.evaluate(() => { FarkadSync.status = 'synced'; renderCloudRestorePoints(); });
        await cloudOnly.waitForFunction(() => document.querySelector('#cloudRestorePoints button'));
        same('the cloud\'s copies arrive under the open sheet: the row opens then',
            await isOpen(cloudOnly, 'settingsFoldRestore'), true);
        check('and the cloud date is on the screen with no tap', await cloudOnly.locator('#cloudRestorePoints button').first().isVisible());
        await cloudOnly.context().close();

        const partial = await open();
        await partial.evaluate(() => takeDailySnapshot());
        await openSheet(partial);
        same('a restore point beside a crew that is still there: an ordinary day, the row is shut',
            await isOpen(partial, 'settingsFoldRestore'), false);
        await row(partial, 'ייבוא ושחזור').click();
        check('one tap on the row and the dates are there - no second fold to open',
            await partial.locator('#restorePoints button').first().isVisible());
        await partial.context().close();

        const answered = await open();
        await openSheet(answered);
        same('no restore anywhere: the row is shut', await isOpen(answered, 'settingsFoldRestore'), false);
        await answered.evaluate(() => tellRestoreResult({ok: true}, 'שוחזר.'));
        await answered.locator('#askModal').waitFor({state: 'visible'});
        same('a restore answering: the row is open under its answer', await isOpen(answered, 'settingsFoldRestore'), true);
        await answered.locator('#askOk').click();
        await answered.context().close();
    }

    suite('תזכורות בטלפון opens itself when the server does not know a subscribed phone');
    {
        const key = createECDH('prime256v1'); key.generateKeys();
        const publicKey = key.getPublicKey().toString('base64url');
        const serialized = {endpoint: 'https://fcm.googleapis.com/fcm/send/local-order',
            keys: {p256dh: publicKey, auth: randomBytes(16).toString('base64url')}};
        const init = {fn: ({serialized}) => {
            window.pushFixture = {permission: 'granted', known: false};
            const subscription = {endpoint: serialized.endpoint, toJSON: () => serialized, unsubscribe: async () => true};
            const registration = {pushManager: {getSubscription: async () => subscription, subscribe: async () => subscription}};
            Object.defineProperty(navigator.serviceWorker, 'ready', {get: () => Promise.resolve(registration)});
            Object.defineProperty(window, 'PushManager', {value: function () {}, configurable: true});
            Object.defineProperty(window, 'Notification', {value: {get permission() { return window.pushFixture.permission; },
                requestPermission: async () => window.pushFixture.permission}, configurable: true});
        }, arg: {serialized}};
        const transport = publicKey => FarkadReminders.setTransport(async data => {
            if (data.action === 'config') return {publicKey};
            if (data.action === 'status') return window.pushFixture.known
                ? {id: 'a'.repeat(64), enabled: true, days: 'workdays'} : {enabled: false};
            return {enabled: false};
        });
        const settled = target => target.waitForFunction(() => !document.getElementById('pushReminderRefresh').disabled
            && !/בודק/.test(document.getElementById('pushReminderStatus').textContent));

        const lost = await open({init});
        await lost.evaluate(transport, publicKey);
        await openSheet(lost);
        await lost.waitForFunction(() => document.getElementById('settingsFoldReminders').open);
        check('subscribed here, unknown to the server: the row opens when the server answers',
            await lost.locator('#pushReminderStatus').isVisible()
            && (await lost.locator('#pushReminderStatus').textContent()).includes('כבויות'));
        await settled(lost);
        await row(lost, 'תזכורות בטלפון').click();
        await lost.evaluate(() => { render(); renderSettings(); });
        same('shut by a person, it stays shut through a redraw', await isOpen(lost, 'settingsFoldReminders'), false);
        await lost.context().close();

        const fine = await open({init});
        await fine.evaluate(() => { window.pushFixture.known = true; });
        await fine.evaluate(transport, publicKey);
        await openSheet(fine);
        await fine.waitForFunction(() => document.getElementById('pushReminderStatus').textContent.includes('מופעלות'));
        same('subscribed and registered: nothing to see, the row stays shut', await isOpen(fine, 'settingsFoldReminders'), false);
        await fine.context().close();

        const blocked = await open({init});
        await blocked.evaluate(() => { window.pushFixture.known = true; window.pushFixture.permission = 'denied'; });
        await blocked.evaluate(transport, publicKey);
        await openSheet(blocked);
        await blocked.waitForFunction(() => document.getElementById('settingsFoldReminders').open);
        check('registered, but the phone now blocks notifications: the row opens and says so',
            (await blocked.locator('#pushReminderStatus').textContent()).includes('חסומות'));
        await blocked.context().close();

        const arrived = await open();
        await arrived.evaluate(() => FarkadReminders.openToday());
        await openSheet(arrived);
        // Deliberate, and the reason is in js/ui/settings.js: the tap on a reminder is made
        // every evening and is followed by the backup, which an open reminders row would
        // push two screens down.
        same('arriving from a reminder notification does NOT open the row', await posture(arrived), POSTURE);
        await arrived.context().close();
    }

    suite('עדכון וגרסה opens itself over a waiting build, and for a check asked from outside it');
    {
        const waiting = await open();
        await waiting.evaluate(() => { waitingWorker = {postMessage() {}}; });
        await openSheet(waiting);
        same('a build installed and waiting: the row is open', await isOpen(waiting, 'settingsFoldUpdate'), true);
        check('with the version and the button', await waiting.locator('#appVersion').isVisible()
            && await waiting.getByRole('button', {name: /בדוק עדכון/}).isVisible());
        await waiting.context().close();

        const arriving = await open();
        await openSheet(arriving);
        same('no build waiting: the row is shut', await isOpen(arriving, 'settingsFoldUpdate'), false);
        await arriving.evaluate(() => showUpdateBanner({postMessage() {}}));
        same('a build that arrives while the sheet is open opens the row then', await isOpen(arriving, 'settingsFoldUpdate'), true);
        await arriving.context().close();

        const asked = await open();
        await asked.evaluate(() => { swRegistration = null; checkForUpdate(); });
        await asked.locator('#askModal').waitFor({state: 'visible'});
        await asked.locator('#askOk').click();
        await openSheet(asked);
        same('a check pressed with the sheet shut: the row is open at the next opening',
            await isOpen(asked, 'settingsFoldUpdate'), true);
        await asked.keyboard.press('Escape');
        await openSheet(asked);
        same('once - the opening after that is the default', await isOpen(asked, 'settingsFoldUpdate'), false);
        await asked.context().close();
    }

    suite('מצב המכשיר opens itself over a warning, and the two quiet rows never do');
    {
        const full = await open();
        await full.evaluate(() => { capacityState = () => 'critical'; });
        await openSheet(full);
        same('no room left for a way back: the row is open', await isOpen(full, 'settingsFoldDevice'), true);
        check('and the warning is what it shows', await full.locator('#storageRoom').evaluate(node =>
            node.classList.contains('hint-warn') && node.offsetParent !== null));
        await full.context().close();

        // Every reason at once, on one phone: the two rows with nothing urgent stay shut.
        const everything = await open();
        await everything.evaluate(() => {
            capacityState = () => 'low';
            waitingWorker = {postMessage() {}};
            FarkadSync.replaceDamaged = true;
            Recovery.damaged('farkad:test:unreadable', '{"half', 'רשומת בדיקה לא נקראה.');
            FarkadReminders.needsAttention = () => true;
        });
        await openSheet(everything);
        await everything.waitForFunction(() => document.getElementById('settingsFoldReminders').open);
        same('every reason standing: הסעות and מידע טכני are still shut, everything else is open',
            await posture(everything), {'ענן וסנכרון': 'card', 'תזכורות בטלפון': true, 'הסעות': false,
                'גיבוי': true, 'ייבוא ושחזור': true, 'שחזור חירום': true,
                'עדכון וגרסה': true, 'מצב המכשיר': true, 'מידע טכני': false});
        await everything.context().close();
    }

    // ------------------------------------------------------------------ geometry
    suite('the rows on three phones, both schemes: targets, fields, width, the jump buttons');
    for (const [width, height] of [[440, 956], [375, 667], [320, 568]]) {
        for (const scheme of ['dark', 'light']) {
            const tag = `${width}x${height}/${scheme}`;
            const phone = await open({width, height, scheme, touch: true});
            await openSheet(phone);
            for (const state of ['as opened', 'every row open']) {
                if (state === 'every row open') {
                    await phone.evaluate(() => {
                        document.querySelectorAll('#settingsPanel details').forEach(node => { node.open = true; });
                        document.getElementById('diagnosticToggle').click();
                    });
                }
                const measured = await phone.evaluate(() => {
                    const panel = document.getElementById('settingsPanel');
                    const body = panel.querySelector('.settings-body');
                    // checkVisibility, not offsetParent: Chromium lays out what is inside a
                    // shut <details> and gives it an offsetParent; it only does not paint it.
                    const shown = node => node.checkVisibility();
                    const box = node => node.getBoundingClientRect();
                    return {
                        rows: [...panel.querySelectorAll('.settings-fold > summary')].map(node =>
                            [node.textContent.trim().slice(0, 14), Math.round(box(node).width), Math.round(box(node).height)]),
                        small: [...panel.querySelectorAll('button, select, summary, a[href]')].filter(shown)
                            .filter(node => box(node).width < 44 || box(node).height < 44)
                            .map(node => node.textContent.trim().slice(0, 20)),
                        fine: [...panel.querySelectorAll('select, input, textarea')].filter(shown)
                            .filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).map(node => node.id),
                        sideways: body.scrollWidth > body.clientWidth + 1
                            || document.documentElement.scrollWidth > innerWidth + 1,
                        outside: [...panel.querySelectorAll('.settings-group, .settings-fold > summary, .settings-fold-body > *')]
                            .filter(shown).filter(node => box(node).left < -1 || box(node).right > innerWidth + 1).length,
                        chevrons: [...panel.querySelectorAll('.settings-fold > summary')]
                            .map(node => getComputedStyle(node, '::after').width).filter(width => width !== '9px').length,
                        marker: [...panel.querySelectorAll('.settings-fold > summary')]
                            .filter(node => getComputedStyle(node).display !== 'flex').length
                    };
                });
                check(`${tag}, ${state}: every row is at least 56px tall and wider than a finger`,
                    measured.rows.length === 8 && measured.rows.every(([, w, h]) => h >= 56 && w >= 44),
                    JSON.stringify(measured.rows));
                same(`${tag}, ${state}: nothing a finger lands on is under 44px either way`, measured.small, []);
                same(`${tag}, ${state}: no field under 16px`, measured.fine, []);
                check(`${tag}, ${state}: no sideways scroll and nothing off the glass`,
                    !measured.sideways && measured.outside === 0, JSON.stringify(measured));
                check(`${tag}, ${state}: every row draws its own corner and no browser triangle`,
                    measured.chevrons === 0 && measured.marker === 0, JSON.stringify(measured));
            }
            if (scheme === 'dark') {
                await phone.keyboard.press('Escape');
                await openSheet(phone);
                for (const part of [ORDER[1], ORDER[2], ORDER[0]]) {
                    await phone.locator('.settings-nav').getByRole('button', {name: part.section, exact: true}).click();
                    same(`${tag}: «${part.section}» moves focus to its heading`,
                        await phone.evaluate(() => document.activeElement.id), part.id);
                    check(`${tag}: and the heading is clear of the fixed navigation`,
                        await phone.locator(`#${part.id}`).evaluate(node => {
                            const rect = node.getBoundingClientRect();
                            const nav = document.querySelector('.settings-nav').getBoundingClientRect();
                            return rect.top >= nav.bottom - 1 && rect.bottom < innerHeight;
                        }));
                }
                check(`${tag}: after «${ORDER[0].section}» the sync sentence is on the glass`,
                    await phone.locator('#settingsSyncStatus').evaluate(node => {
                        const rect = node.getBoundingClientRect();
                        return rect.top >= 0 && rect.bottom <= innerHeight;
                    }));
            }
            await phone.context().close();
        }
    }

    suite('200% text: a title wraps, a row grows, nothing is clipped');
    for (const [width, height] of [[440, 956], [375, 667], [320, 568]]) {
        const big = await open({width, height, scheme: 'dark', touch: true});
        await openSheet(big);
        const grown = await big.evaluate(() => {
            const panel = document.getElementById('settingsPanel');
            const before = [...panel.querySelectorAll('.settings-fold > summary')].map(node => node.getBoundingClientRect().height);
            // Text zoom, not geometric zoom: the words double and the boxes must make room.
            [...panel.querySelectorAll('*')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)])
                .forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
            const body = panel.querySelector('.settings-body');
            const heads = [...panel.querySelectorAll('.settings-card-head')];
            return {
                clipped: heads.flatMap(head => [...head.querySelectorAll('h3, .hint')].filter(node => {
                    const text = node.getBoundingClientRect(), box = head.getBoundingClientRect();
                    return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
                        || text.left < box.left - 1 || text.right > box.right + 1
                        || text.top < box.top - 1 || text.bottom > box.bottom + 1
                        || text.left < -1 || text.right > innerWidth + 1;
                }).map(node => node.textContent)),
                hidden: heads.filter(head => getComputedStyle(head).overflow !== 'visible').length,
                sideways: body.scrollWidth > body.clientWidth + 1,
                grew: [...panel.querySelectorAll('.settings-fold > summary')]
                    .every((node, index) => node.getBoundingClientRect().height >= before[index]),
                small: [...panel.querySelectorAll('button, select, summary')].filter(node => node.checkVisibility())
                    .filter(node => node.getBoundingClientRect().width < 44 || node.getBoundingClientRect().height < 44).length
            };
        });
        same(`${width}: no title and no line under one is clipped or pushed out of its row`, grown.clipped, []);
        check(`${width}: no row hides what overflows it, no sideways scroll, every target still 44px`,
            grown.hidden === 0 && !grown.sideways && grown.grew && grown.small === 0, JSON.stringify(grown));
        await big.context().close();
    }

    check('no uncaught errors anywhere in the run', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
