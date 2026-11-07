// The seder to each worker (v167): one WhatsApp message per man, each with his own site
// and who is with him, opened one tap at a time from the WhatsApp dialog.
//
//   node tests/seder.test.mjs
//
// The owner, 2026-11-02: every night, after the seder, one action should reach each worker
// with where he works and with whom. He taps send in WhatsApp for each one himself, and
// that is fine - but whoever is NOT working must not be on the list at all, Rima's men have
// nothing to do with this message, and the message is in Hebrew. Everything below follows
// from those sentences:
//
//   the list is the men with a site that day, in the layer the day's group message reads -
//     nobody marked נעדר, nobody on a הכל חופש day, nobody with no site, never Rima, and a
//     man on two sites once, with both;
//   each man's message names the day and the date, his site or sites, and who else is on
//     each of them by name - never himself, never Rima;
//   a phone number becomes a wa.me number only when it is plainly an Israeli mobile, and
//     anything else is said to be no usable number rather than guessed at - and two men on
//     the list with one number are each told so, and neither is dropped;
//   what was opened, and who was left out, is kept per date on this phone - through Store,
//     never in the record, never in the outbox, never in a backup or the rescue file, never
//     sent to the cloud, and never shown against another date.
//
// The screen - the entry in the WhatsApp dialog, the ticks, the run through WhatsApp, the
// marks, and a reload in the middle of it - is in tests/seder.browser.mjs.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const SEDER_FILE = new URL('../js/ui/seder.js', import.meta.url);
// Read when it is there. Before the feature existed every block below failed on its own
// line, which is the red this suite was written against; a missing file must not turn
// that into one crash that says nothing about which guarantee is missing.
const SEDER = existsSync(SEDER_FILE) ? readFileSync(SEDER_FILE, 'utf8') : '';
const TICK = 6;

const DAY = '2026-11-05';       // a Thursday
const OTHER = '2026-11-08';     // the Sunday after
const HOLIDAY = '2026-11-06';   // the Friday between, which הכל חופש is pressed on
const KEY = 'farkadSederProgress';

const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;

// THE PINNED WORDS. Hebrew strings are product decisions (CLAUDE.md, law 6), and the owner
// approved these on 2026-11-07: js/ui/seder.js keeps every one of them in one block, and a
// change there moves the line here, deliberately, in the same commit.
const HELLO = name => `שלום ${named(name)},`;
const HEADING = 'סידור עבודה ליום חמישי 05/11/2026:';
const SITE = name => `📍 ${named(name)}`;
const WITH = (...names) => `👷 איתך: ${names.map(named).join(', ')}`;
const OPENED = '✓ נפתח בוואטסאפ';
const SHARED = (...names) => `⚠️ מספר משותף עם ${names.map(named).join(', ')}`;

const WORKERS = () => [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד עבד אל רחמן', active: true, dailyRate: 400, hourlyRate: 0,
        phone: '+972 54-123-4567' },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0, phone: '' },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, hourlyRate: 0, phone: '0501112233' },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, hourlyRate: 0, phone: '0549998877' },
    { id: 'w_06', name: 'Ali Hassan', active: true, dailyRate: 400, hourlyRate: 0, phone: '1234' },
    { id: 'w_07', name: 'ח\'אלד', active: true, dailyRate: 400, hourlyRate: 0, phone: '0587654321' }
];
const PLACES = () => [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true },
    { id: 'p_04', name: 'נתניה', active: true }
];

// js/ui/seder.js is a classic script; it is reached the way tests/rima.test.mjs reaches
// js/ui/reports.js - run into the device's own scope, after everything it reads.
function load(device) {
    vm.runInContext(SEDER, device.ctx, { filename: 'js/ui/seder.js' });
    return device;
}

function bare(id, storage) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-11-04');
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    return device;
}

// The evening this whole suite is about, on DAY:
//   אחמד at הרצליה; מוחמד at הרצליה AND חיפה; יוסי (no phone) at חיפה; ח'אלד at חיפה;
//   Ali Hassan (a number that is not one) alone at פרדסיה, where Rima has two men;
//   סמיר marked נעדר; עלי with nothing recorded - and an entry in the OTHER layer, which
//   the group message does not read either; Rima alone, three men, at נתניה.
// And אחמד again on OTHER, so the same man can be asked about on two dates.
function crewPhone(id) {
    const device = load(bare(id));
    device.State.schedule.workers = WORKERS();
    device.State.schedule.places = PLACES();
    device.State.save({ silent: true });
    const work = (date, workerId, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, 'actual', placeId));
    work(DAY, 'w_01', 'p_01');
    work(DAY, 'w_02', 'p_01');
    work(DAY, 'w_02', 'p_02');
    work(DAY, 'w_03', 'p_02');
    work(DAY, 'w_06', 'p_03');
    work(DAY, 'w_07', 'p_02');
    device.State.commit(device.call('markAbsent', device.State.schedule, DAY, 'w_04', 'actual'));
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_05', 'plan', 'p_01'));
    device.State.commit(device.call('setRimaCount', device.State.schedule, DAY, 'p_03', 2));
    device.State.commit(device.call('setRimaCount', device.State.schedule, DAY, 'p_04', 3));
    work(OTHER, 'w_01', 'p_01');
    return device;
}

// "Close the app and open it again": the disk carried into a fresh context.
function reopen(device) {
    const again = load(bare(device.id, device.dump()));
    again.State.load();
    return again;
}

const crew = (device, date) => device.call('sederCrew', device.State.schedule, date || DAY,
    device.State.layer);
const rowOf = (device, workerId, date) => crew(device, date).find(row => row.workerId === workerId);
const messageOf = (device, workerId, date) =>
    device.call('sederMessage', rowOf(device, workerId, date), date || DAY);

// One block per guarantee. A block that throws - before the feature existed, every one of
// them did - is a failed check under its own name, not the end of the run.
async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

await block('the list is the men with a site that day, and nobody else', async () => {
    const device = crewPhone('d_list');
    given('the other layer holds an entry for the man with nothing recorded',
        device.call('entriesFor', device.State.schedule, DAY, 'w_05', 'plan').length === 1);
    const rows = crew(device);
    same('the men with a site, in roster order, each once',
        rows.map(row => row.workerId), ['w_01', 'w_02', 'w_03', 'w_06', 'w_07']);
    check('a man marked נעדר is not on it', !rows.some(row => row.workerId === 'w_04'));
    check('nor a man with nothing recorded, though the other layer has him on a site',
        !rows.some(row => row.workerId === 'w_05'));
    same('a man on two sites is listed once, with both, in the order his day holds them',
        rows.find(row => row.workerId === 'w_02').sites.map(site => site.name), ['הרצליה', 'חיפה']);
    same('each site names who else is on it, himself left out',
        rows.map(row => row.sites.map(site => site.others)),
        [[['מוחמד עבד אל רחמן']], [['אחמד'], ['יוסי', 'ח\'אלד']],
            [['מוחמד עבד אל רחמן', 'ח\'אלד']], [[]], [['מוחמד עבד אל רחמן', 'יוסי']]]);
    check('the site only Rima was on lists nobody',
        !rows.some(row => row.sites.some(site => site.placeId === 'p_04')));
    same('and the man beside Rima\'s two at פרדסיה is alone as far as the list knows',
        rows.find(row => row.workerId === 'w_06').sites.map(site => site.others), [[]]);
    check('Rima is never a person on it', !JSON.stringify(rows).includes('רימא'));

    // The layer: whatever the day's group message reads, this reads.
    same('the day is read in the layer the WhatsApp message reads', device.State.layer, 'actual');
    const group = device.call('dayMessage', DAY, device.State.layer, 'pin');
    const bulleted = device.State.schedule.workers
        .filter(worker => group.includes(`• ${named(worker.name)}`)).map(worker => worker.id);
    same('and it is exactly the men the group message puts under a site', rows.map(row => row.workerId),
        bulleted);
});

await block('a הכל חופש day has nobody on the list', async () => {
    const device = crewPhone('d_holiday');
    // What הכל חופש writes (markAllHoliday, js/ui/day.js): absent, for every active man with
    // no record yet - and only them. A man already on a site keeps it.
    device.State.commit(device.call('assignPlace', device.State.schedule, HOLIDAY, 'w_01', 'actual', 'p_01'));
    const missing = device.State.activeWorkers().filter(worker =>
        !device.call('workerDay', device.State.schedule, HOLIDAY, worker.id, 'actual'));
    given('six men had nothing on the holiday', missing.length === 6, String(missing.length));
    device.State.commitMany(missing.map(worker =>
        device.call('markAbsent', device.State.schedule, HOLIDAY, worker.id, 'actual')));
    same('on the holiday only the man who was already on a site is listed',
        crew(device, HOLIDAY).map(row => row.workerId), ['w_01']);
    device.State.commit(device.call('markAbsent', device.State.schedule, HOLIDAY, 'w_01', 'actual'));
    same('and with him off too, the list is empty', crew(device, HOLIDAY), []);
});

await block('each man\'s message: the day, his site, who is with him - in Hebrew', async () => {
    const device = crewPhone('d_message');
    same('one site, one colleague',
        messageOf(device, 'w_01'),
        [HELLO('אחמד'), HEADING, '', SITE('הרצליה'), WITH('מוחמד עבד אל רחמן')].join('\n'));
    same('two sites, each with its own people',
        messageOf(device, 'w_02'),
        [HELLO('מוחמד עבד אל רחמן'), HEADING, '', SITE('הרצליה'), WITH('אחמד'), '',
            SITE('חיפה'), WITH('יוסי', 'ח\'אלד')].join('\n'));
    // The owner, 2026-11-07: no «👷 איתך: אין עובדים נוספים» - Rima's men can be on that
    // site, and "nobody else" would be a claim the record contradicts.
    same('alone on a site, the site line and nothing under it - no claim about who else is there, and no word of Rima\'s two men',
        messageOf(device, 'w_06'),
        [HELLO('Ali Hassan'), HEADING, '', SITE('פרדסיה')].join('\n'));
    same('alone on one of two sites, only that site goes without the line',
        device.call('sederMessage', { name: 'אחמד', sites: [{ name: 'פרדסיה', others: [] },
            { name: 'הרצליה', others: ['יוסי'] }] }, DAY),
        [HELLO('אחמד'), HEADING, '', SITE('פרדסיה'), '', SITE('הרצליה'), WITH('יוסי')].join('\n'));
    same('a man with no number still has his message worked out - only the sending is missing',
        messageOf(device, 'w_03'),
        [HELLO('יוסי'), HEADING, '', SITE('חיפה'), WITH('מוחמד עבד אל רחמן', 'ח\'אלד')].join('\n'));

    const all = crew(device).map(row => device.call('sederMessage', row, DAY));
    check('no message names a man who is not working that day',
        all.every(text => !text.includes(named('סמיר')) && !text.includes(named('עלי'))));
    check('no message mentions Rima, or the site only Rima was on',
        all.every(text => !text.includes('רימא') && !text.includes('נתניה')));
    check('no message tells a man that nobody else is with him',
        all.every(text => !text.includes('אין עובדים נוספים')));
    check('no message tells a man he is with himself',
        crew(device).every(row => !device.call('sederMessage', row, DAY).split('\n')
            .filter(line => line.startsWith('👷')).some(line => line.includes(named(row.name)))));
    check('no message carries a phone number, an ID or a pay figure',
        all.every(text => !/\d{5,}|₪/.test(text)), JSON.stringify(all.map(text => text.match(/\d{5,}/))));
    check('every message opens in Hebrew, with the man\'s own name',
        crew(device).every(row => device.call('sederMessage', row, DAY).startsWith(HELLO(row.name))));
    same('and the date is the day being sent, not today', all.filter(text => text.includes(HEADING)).length,
        all.length);
});

await block('a phone number is a wa.me number only when it is plainly an Israeli mobile', async () => {
    const device = load(bare('d_phone'));
    const usable = [
        ['052-884-1930', '972528841930'],
        ['0528841930', '972528841930'],
        [' 052 884 1930 ', '972528841930'],
        ['+972 52-884-1930', '972528841930'],
        ['972528841930', '972528841930'],
        ['00972-52-884-1930', '972528841930'],
        ['+972 (0)52-884-1930', '972528841930'],
        ['٠٥٢٨٨٤١٩٣٠', '972528841930'],
        ['0587654321', '972587654321']
    ];
    usable.forEach(([typed, number]) => {
        same(`«${typed}» is ${number}`, device.call('sederWaNumber', typed), number);
    });
    const unusable = ['', '   ', null, undefined, '1234', '03-1234567', '052-884-193', '052-884-19301',
        '+970 59-123-4567', '+1 212 555 0100', 'אין', '0528841930 / 0541234567', '972-3-1234567'];
    unusable.forEach(typed => {
        same(`«${typed}» is not a usable number`, device.call('sederWaNumber', typed), '');
    });
});

await block('the link opens his own chat with his own message in it', async () => {
    const device = crewPhone('d_link');
    const row = rowOf(device, 'w_02');
    const text = device.call('sederMessage', row, DAY);
    const url = device.call('sederUrl', row.number, text);
    same('the number on the row is the one wa.me is given', row.number, '972541234567');
    check('wa.me, his number, then the text', url.startsWith('https://wa.me/972541234567?text='), url.slice(0, 60));
    same('the text decodes back to his message exactly', decodeURIComponent(url.split('?text=')[1]), text);
    same('and a URL parser reads the same text', new URL(url).searchParams.get('text'), text);
    same('the two men with no usable number have none on their rows',
        crew(device).filter(one => !one.number).map(one => one.workerId), ['w_03', 'w_06']);
});

// Two men with one number - the same man entered twice, a number copied onto the wrong row,
// or two brothers on one phone - have both messages opened in one chat, and the man whose
// phone it is not gets nothing. The roster badges it; the list has to say it too, on the
// two rows, and leave the deciding to the owner.
await block('two men on tonight\'s list with one number are each told so, and neither is dropped', async () => {
    const device = crewPhone('d_shared');
    // ח'אלד's number typed the other way round from אחמד's: the same phone once it is read as
    // digits. And סמיר, marked נעדר tonight, carries מוחמד's.
    const phone = (workerId, typed) => {
        device.State.schedule.workers.find(worker => worker.id === workerId).phone = typed;
    };
    phone('w_07', '+972 52 884 1930');
    phone('w_04', '054-123-4567');
    given('the two numbers read as one', rowOf(device, 'w_07').number === '972528841930'
        && rowOf(device, 'w_01').number === '972528841930');
    const rows = crew(device);
    same('each of the two names the other, and nobody else is told anything',
        rows.map(row => [row.workerId, row.sharedWith]),
        [['w_01', ['ח\'אלד']], ['w_02', []], ['w_03', []], ['w_06', []], ['w_07', ['אחמד']]]);
    same('a number shared with a man who is not working tonight is no note: one message goes to it',
        rowOf(device, 'w_02').sharedWith, []);
    same('nor do two men with no usable number share one',
        rows.filter(row => !row.number).map(row => [row.workerId, row.sharedWith]), [['w_03', []], ['w_06', []]]);
    same('both stay reachable and chosen: whether both go to that chat is the owner\'s call',
        [device.call('sederRun', rows, DAY).reachable, device.call('sederIsOn', DAY, 'w_01'),
            device.call('sederIsOn', DAY, 'w_07')], [3, true, true]);
    const w01 = rowOf(device, 'w_01');
    const w07 = rowOf(device, 'w_07');
    same('each door goes to the one chat with his own message',
        [w01, w07].map(row => new URL(device.call('sederUrl', row.number, device.call('sederMessage', row, DAY))))
            .map(url => [url.pathname, url.searchParams.get('text').split('\n')[0]]),
        [['/972528841930', HELLO('אחמד')], ['/972528841930', HELLO('ח\'אלד')]]);

    // The note is the list's, not part of his message: correcting the other man's number
    // takes it away and leaves his own mark standing.
    device.call('sederMarkOpened', DAY, w01, device.call('sederMessage', w01, DAY));
    phone('w_07', '0587654321');
    same('once the other number is corrected the note is gone', rowOf(device, 'w_01').sharedWith, []);
    same('and his own mark still stands', device.call('sederState', DAY, rowOf(device, 'w_01')), 'opened');
    same('the note is the roster\'s own word, naming the other man',
        device.global('SEDER_TEXT').shared(named('ח\'אלד')), SHARED('ח\'אלד'));
});

await block('everyone is chosen until he is left out, and the run goes down the list', async () => {
    const device = crewPhone('d_run');
    const rows = crew(device);
    same('every man with a number starts chosen',
        rows.filter(row => row.number).map(row => device.call('sederIsOn', DAY, row.workerId)),
        [true, true, true]);
    const first = device.call('sederRun', rows, DAY);
    same('the run starts at the first of them', first.next && first.next.workerId, 'w_01');
    same('three can be reached, three are chosen, none opened', [first.reachable, first.total, first.done],
        [3, 3, 0]);
    same('a man with no usable number is on the list and says so instead of being sendable',
        rows.filter(row => !row.number).map(row => device.call('sederState', DAY, row)),
        ['nophone', 'nophone']);

    check('leaving a man out is accepted', device.call('sederSetOn', DAY, 'w_02', false) === true);
    const w01 = rows.find(row => row.workerId === 'w_01');
    check('opening the first is recorded',
        device.call('sederMarkOpened', DAY, w01, device.call('sederMessage', w01, DAY)) === true);
    const second = device.call('sederRun', crew(device), DAY);
    same('the next is past both the man opened and the man left out',
        second.next && second.next.workerId, 'w_07');
    same('one of the two chosen is opened', [second.total, second.done], [2, 1]);
    same('the first is marked opened', device.call('sederState', DAY, w01), 'opened');
    same('and the mark says opened in WhatsApp', device.global('SEDER_TEXT').opened, OPENED);
    check('never that it was sent - the app cannot know whether send was pressed',
        !/נשלח|שלחת/.test(device.global('SEDER_TEXT').opened));

    const w07 = rows.find(row => row.workerId === 'w_07');
    device.call('sederMarkOpened', DAY, w07, device.call('sederMessage', w07, DAY));
    const third = device.call('sederRun', crew(device), DAY);
    same('with both chosen men opened the run is over', [third.next, third.total, third.done], [null, 2, 2]);
    same('the man left out can be put back in', [device.call('sederSetOn', DAY, 'w_02', true),
        device.call('sederRun', crew(device), DAY).next.workerId], [true, 'w_02']);
});

await block('the progress is per date, and survives the app being closed', async () => {
    const device = crewPhone('d_dates');
    const w01 = rowOf(device, 'w_01');
    device.call('sederSetOn', DAY, 'w_02', false);
    device.call('sederMarkOpened', DAY, w01, device.call('sederMessage', w01, DAY));

    const again = reopen(device);
    same('after a reopen the mark is still there', again.call('sederState', DAY, rowOf(again, 'w_01')),
        'opened');
    same('and the man left out is still left out', again.call('sederIsOn', DAY, 'w_02'), false);
    same('so the run picks up where it stopped', again.call('sederRun', crew(again), DAY).next.workerId,
        'w_07');

    const other = rowOf(again, 'w_01', OTHER);
    given('the same man works on the other date', Boolean(other));
    same('on another date he is not marked', again.call('sederState', OTHER, other), '');
    same('nor is anybody left out there', again.call('sederIsOn', OTHER, 'w_02'), true);
    same('and that date\'s run starts from the top', again.call('sederRun', crew(again, OTHER), OTHER)
        .next.workerId, 'w_01');
});

await block('a mark is not believed once the seder it was opened for has changed', async () => {
    const device = crewPhone('d_changed');
    const w01 = rowOf(device, 'w_01');
    device.call('sederMarkOpened', DAY, w01, device.call('sederMessage', w01, DAY));
    given('he was opened', device.call('sederState', DAY, rowOf(device, 'w_01')) === 'opened');
    // Moved after his message went out: הרצליה is no longer true.
    device.State.commit(device.call('unassignPlace', device.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_01', 'actual', 'p_03'));
    same('he is marked changed, not opened', device.call('sederState', DAY, rowOf(device, 'w_01')),
        'changed');
    same('and he is back at the head of the run', device.call('sederRun', crew(device), DAY).next.workerId,
        'w_01');
    // The man who was with him there is changed too: his line named אחמד.
    const w02 = rowOf(device, 'w_02');
    device.call('sederMarkOpened', DAY, w02, device.call('sederMessage', w02, DAY));
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_07', 'actual', 'p_01'));
    same('a man whose colleagues changed is changed too', device.call('sederState', DAY, rowOf(device, 'w_02')),
        'changed');
    // A corrected number: the old message went to the old number.
    const w07 = rowOf(device, 'w_07');
    device.call('sederMarkOpened', DAY, w07, device.call('sederMessage', w07, DAY));
    device.State.schedule.workers.find(worker => worker.id === 'w_07').phone = '0581112233';
    same('and so is a man whose number was corrected after it was opened',
        device.call('sederState', DAY, rowOf(device, 'w_07')), 'changed');
});

await block('none of it is the record: not the schedule, not the outbox, not the fence', async () => {
    const device = crewPhone('d_record');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);

    const w01 = rowOf(device, 'w_01');
    device.call('sederSetOn', DAY, 'w_02', false);
    device.call('sederMarkOpened', DAY, w01, device.call('sederMessage', w01, DAY));
    device.call('sederSetListOpen', DAY, true);

    same('the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);
    same('so is the record on the disk', device.raw('scheduleData:v2'), disk);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write counter did not move: this is not a record the rescue file carries',
        device.Store.fenceState(), fence);
    const kept = JSON.parse(device.raw(KEY));
    same('it is on the disk under its own key, by date', Object.keys(kept), [DAY]);
    check('holding the mark and the man left out', Boolean(kept[DAY].opened.w_01) && kept[DAY].off.w_02 === true,
        device.raw(KEY));
});

await block('none of it leaves the phone: no backup, no rescue file, no cloud', async () => {
    const cloud = makeCloud();
    const device = crewPhone('d_cloud');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0,
        5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    const w01 = rowOf(device, 'w_01');
    device.call('sederSetOn', DAY, 'w_02', false);
    device.call('sederMarkOpened', DAY, w01, device.call('sederMessage', w01, DAY));
    device.call('sederSetListOpen', DAY, true);
    await settle(TICK * 20);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);

    // The control, so the silence above is about this feature and not a dead connection.
    device.State.commit(device.call('assignPlace', device.State.schedule, OTHER, 'w_07', 'actual', 'p_02'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled,
        String(cloud.attempts.length - attempts));

    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)),
        JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text),
        JSON.parse(JSON.stringify(device.State.schedule)));
    check('with nothing of the progress in it',
        !backup.text.includes(KEY) && !backup.text.includes('"sig"') && !backup.text.includes('"off"'));

    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')),
        JSON.stringify(rescue && rescue.name));
    check('and the rescue file does not carry it either', !rescue.text.includes(KEY));
});

await block('a disk that refuses it keeps the session going and says so', async () => {
    const device = crewPhone('d_full');
    device.Store.set('scheduleData:snap:2026-11-01', JSON.stringify(device.State.schedule));
    given('there is a restore point a full disk could be tempted to spend',
        device.raw('scheduleData:snap:2026-11-01') !== null && typeof device.Store.reclaim === 'function');
    same('a disk that takes it says it was kept', [device.call('sederSetOn', DAY, 'w_07', false),
        device.call('sederProgressKept')], [true, true]);

    device.setQuota(key => key === KEY);
    check('a write the disk refuses is reported, not believed', device.call('sederSetOn', DAY, 'w_02', false) === false);
    same('this session still holds the choice', device.call('sederIsOn', DAY, 'w_02'), false);
    same('and says it was not kept', device.call('sederProgressKept'), false);
    check('no restore point was spent making room for it',
        device.raw('scheduleData:snap:2026-11-01') !== null);
    check('nor was the record touched', device.raw('scheduleData:v2') !== null
        && JSON.parse(device.raw('scheduleData:v2')).days[DAY].actual.w_01.entries.length === 1);

    const again = reopen(device);
    same('so after a reopen only what reached the disk is there - which is what the note warned',
        [again.call('sederIsOn', DAY, 'w_07'), again.call('sederIsOn', DAY, 'w_02')], [false, true]);
});

await block('progress that will not read is no progress, and nothing is reparented', async () => {
    const device = crewPhone('d_broken');
    device.putRaw(KEY, '{"2026-11-05": {"off": {"w_01": tru');
    const again = reopen(device);
    same('an unreadable progress reads as nobody opened and nobody left out',
        [again.call('sederIsOn', DAY, 'w_01'), again.call('sederState', DAY, rowOf(again, 'w_01'))], [true, '']);
    same('and the list is the list', crew(again).map(row => row.workerId), ['w_01', 'w_02', 'w_03', 'w_06', 'w_07']);
    check('the first choice made writes a readable progress over it (it is a preference, not a record)',
        again.call('sederSetOn', DAY, 'w_02', false) === true && JSON.parse(again.raw(KEY))[DAY].off.w_02 === true);

    device.putRaw(KEY, '{"__proto__": {"open": true, "at": 1}, "2026-11-05": {"opened": {"__proto__":'
        + ' {"at": 1, "sig": "x"}, "constructor": {"at": 1, "sig": "y"}}, "off": {"__proto__": true,'
        + ' "constructor": true, "w_01": true}, "at": 1}}');
    const poisoned = reopen(device);
    same('a poisoned name is not a worker and not a date', [poisoned.call('sederIsOn', DAY, 'w_01'),
        poisoned.call('sederIsOn', DAY, 'w_02')], [false, true]);
    check('and nothing landed on a prototype',
        poisoned.call('sederResumeDate', Date.now()) === null && ({}).sig === undefined && ({}).open === undefined
        && poisoned.global('Object').prototype.sig === undefined);
});

await block('it keeps a fortnight of evenings, not every evening for ever', async () => {
    const device = crewPhone('d_bounded');
    const keep = device.global('SEDER_KEEP_DATES');
    given('a limit is declared', Number.isInteger(keep) && keep > 0, String(keep));
    const dates = Array.from({ length: keep + 6 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    dates.forEach(date => device.call('sederSetOn', date, 'w_01', false));
    const held = Object.keys(JSON.parse(device.raw(KEY))).sort();
    same('only the latest evenings are kept', held, dates.slice(-keep));
    same('and an evening that was dropped reads as untouched', device.call('sederIsOn', dates[0], 'w_01'), true);
});

await block('a list left open when the app went away comes back, briefly', async () => {
    const device = crewPhone('d_resume');
    const window = device.global('SEDER_RESUME_MS');
    given('the window is minutes, not hours', Number.isFinite(window) && window >= 5 * 60000
        && window <= 60 * 60000, String(window));
    device.call('sederSetListOpen', DAY, true);
    const at = Date.now();
    same('a list open a moment ago is the one to come back to', device.call('sederResumeDate', at + 60000), DAY);
    const again = reopen(device);
    same('it survives the app being killed in the background', again.call('sederResumeDate', at + 60000), DAY);
    same('but not once the run has been left longer than the window',
        again.call('sederResumeDate', at + window + 60000), null);
    again.call('sederSetListOpen', DAY, false);
    same('and never a list that was closed', again.call('sederResumeDate', at + 60000), null);
    same('a closed list stays closed across a reopen', reopen(again).call('sederResumeDate', at + 60000), null);
});

// Every word the feature shows or sends, as the owner approved it on 2026-11-07, and the
// block's keys too - so a word cannot change, or a new one arrive, without this file moving.
await block('the words the owner approved, every one of them, and no other', async () => {
    const T = crewPhone('d_words').global('SEDER_TEXT');
    same('the block holds exactly these words',
        Object.keys(T).sort(), ['allDone', 'changed', 'close', 'count', 'entry', 'go', 'heading', 'hello',
            'lead', 'noPhone', 'nobody', 'noneChosen', 'notKept', 'openOne', 'opened', 'progress', 'shared',
            'site', 'title', 'with'].sort());
    same('the way in', T.entry, '👷 לכל עובד בנפרד');
    same('the title', T.title, 'סידור לכל עובד');
    same('one man', T.count(1), 'עובד אחד');
    same('seven men', T.count(7), '7 עובדים');
    same('the lead', T.lead,
        'כל עובד מקבל הודעה משלו: איפה הוא עובד ועם מי. וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.');
    same('nobody that day', T.nobody, 'אין ביום הזה עובדים עם אתר עבודה.');
    same('no usable number', T.noPhone, 'אין מספר טלפון תקין');
    same('one number for two men', T.shared('ח\'אלד'), '⚠️ מספר משותף עם ח\'אלד');
    same('opened', T.opened, OPENED);
    same('changed since it was opened', T.changed, '⚠️ השתנה מאז שנפתח - כדאי לפתוח שוב');
    same('a row\'s door, read aloud', T.openOne('אחמד'), 'פתח בוואטסאפ את ההודעה לאחמד');
    same('the run\'s button', T.go('אחמד'), '💬 פתח בוואטסאפ: אחמד');
    same('the progress', T.progress(1, 4), 'נפתחו 1 מתוך 4');
    same('all done', T.allDone, '✓ כל ההודעות שנבחרו נפתחו בוואטסאפ');
    same('nobody chosen', T.noneChosen, 'לא נבחר אף עובד');
    same('close', T.close, 'סגור');
    same('the marks were not kept', T.notKept, '⚠️ הסימונים לא נשמרו במכשיר - אם האפליקציה תיסגר, הם יאבדו.');
    same('the greeting', T.hello('אחמד'), 'שלום אחמד,');
    same('the heading', T.heading('יום חמישי', '05/11/2026'), HEADING);
    same('a site', T.site('הרצליה'), '📍 הרצליה');
    same('who is with him', T.with('מוחמד, יוסי'), '👷 איתך: מוחמד, יוסי');
});

report();
