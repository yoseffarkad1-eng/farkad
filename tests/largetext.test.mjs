// «תצוגה גדולה» - the large display (v191) - the half that is decidable without a browser.
//
//   node tests/largetext.test.mjs
//
// The owner, 2026-11-11: one of the people who use this is 62 and far-sighted. The mode is
// ONE switch on ONE phone (js/ui/display.js); what it looks like is css/large.css, and
// that half is measured on the glass in tests/largetext.browser.mjs. Here:
//
//   - the words of the row, word for word (law 6: proposed, in the style of «הסעות» above
//     it, and a change to one moves the line here in the same commit);
//   - the preference: exactly the byte '1' is ON; absent, empty, damaged, somebody else's
//     idea of true, a disk that throws - every one of them is OFF, read once, and reading
//     it writes nothing and says nothing;
//   - the class: on <html> the moment the file is loaded on a phone that has the mode on,
//     and not otherwise - with nothing below js/store.js loaded yet;
//   - it is not the record: turning it on and off moves not one byte of the schedule, the
//     outbox, the journal or the write counter, and writes one key and no other;
//   - none of it leaves the phone: not the cloud, not the backup, not the rescue file;
//   - a disk that refuses it costs the choice at the next opening and nothing else;
//   - the stylesheet's own promise, read as text: every rule of css/large.css is under the
//     class and inside `@media screen`, there is no zoom, no transform: scale and no root
//     font-size in it, and the page loads it last and the script first after Store.
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const read = path => {
    const file = new URL(path, import.meta.url);
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
};
const DISPLAY = read('../js/ui/display.js');
const SHEET = read('../css/large.css');
const PAGE = read('../index.html');
const TICK = 6;
const KEY = 'farkadDisplay:large';
const CLASS = 'display-large';
const DAY = '2026-11-10';

// THE PINNED WORDS. Proposed 2026-11-11, not approved word by word; the owner corrects.
const WORDS = {
    title: 'תצוגה גדולה',
    sub: 'אותיות וכפתורים גדולים יותר',
    lead: 'מגדיל את האותיות, המספרים והכפתורים בכל המסכים. פועל במכשיר הזה בלבד.',
    stateOn: 'מופעל במכשיר הזה',
    stateOff: 'כבוי',
    switchOn: 'הפעלת תצוגה גדולה במכשיר הזה',
    switchOff: 'כיבוי תצוגה גדולה במכשיר הזה'
};

// <html>, as much of it as the file touches: a class list that remembers.
function fakeRoot() {
    const names = new Set();
    return { names, classList: { toggle(name, on) { if (on) names.add(name); else names.delete(name); return on; },
        contains: name => names.has(name) } };
}

function phone(id, storage) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.root = fakeRoot();
    device.ctx.document.documentElement = device.root;
    device.renders = 0;
    device.ctx.render = () => { device.renders += 1; };
    vm.runInContext(DISPLAY, device.ctx, { filename: 'js/ui/display.js' });
    return device;
}

function crewPhone(id, storage) {
    const device = phone(id, storage);
    device.State.schedule.workers = [{ id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_02', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
    return device;
}

const others = device => {
    const disk = device.dump();
    delete disk[KEY];
    return JSON.stringify(Object.keys(disk).sort().map(key => [key, disk[key]]));
};
const whole = device => JSON.stringify(Object.keys(device.dump()).sort().map(key => [key, device.dump()[key]]));

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

given('js/ui/display.js is there to read', DISPLAY.length > 0);
given('css/large.css is there to read', SHEET.length > 0);

await block('the words of the row, word for word', async () => {
    const device = phone('d_words');
    const text = JSON.parse(JSON.stringify(vm.runInContext('DISPLAY_TEXT', device.ctx)));
    same('every word the row can say', text, WORDS);
    same('and they are frozen: no other file can change one', vm.runInContext('Object.isFrozen(DISPLAY_TEXT)', device.ctx), true);
    same('the key, and the class', [vm.runInContext('DISPLAY_LARGE_KEY', device.ctx), vm.runInContext('DISPLAY_LARGE_CLASS', device.ctx)], [KEY, CLASS]);
    check('no existing sentence was reworded for it: the neighbour\'s two states are said the same way',
        text.stateOn === 'מופעל במכשיר הזה' && text.stateOff === 'כבוי');
});

await block('a new phone: the mode is off, and nothing was written to find that out', async () => {
    const device = phone('d_new');
    same('off', device.call('displayLarge'), false);
    same('the class is not on <html>', [...device.root.names], []);
    same('no key was written', device.raw(KEY), null);
});

await block('exactly the byte 1 is on; everything else is off, and is left as it was found', async () => {
    const on = phone('d_on', { [KEY]: '1' });
    same("'1': on", on.call('displayLarge'), true);
    same('and the class is on <html> from the moment the file loaded', [...on.root.names], [CLASS]);
    for (const raw of ['', '0', 'true', 'on', 'yes', '11', ' 1', '1 ', '1\n', 'null', '{"on":true}', '["1"]', '\u0000', 'כן', '١']) {
        const device = phone('d_bad', { [KEY]: raw, other: 'kept' });
        const before = whole(device);
        same(`${JSON.stringify(raw)}: off`, device.call('displayLarge'), false);
        same(`${JSON.stringify(raw)}: no class`, [...device.root.names], []);
        same(`${JSON.stringify(raw)}: the disk is byte for byte what it was - nothing repaired, nothing removed`, whole(device), before);
    }
});

await block('a disk that will not be read is a phone with the mode off, not an app that does not start', async () => {
    const device = makeDevice({ deviceId: 'd_throw', storage: { [KEY]: '1' } });
    device.root = fakeRoot();
    device.ctx.document.documentElement = device.root;
    const get = device.Store.get;
    device.Store.get = key => { if (key === KEY) throw new Error('the disk said no'); return get.call(device.Store, key); };
    let threw = null;
    try { vm.runInContext(DISPLAY, device.ctx, { filename: 'js/ui/display.js' }); } catch (error) { threw = error; }
    same('loading the file threw nothing', threw, null);
    same('off', device.call('displayLarge'), false);
    same('no class', [...device.root.names], []);
    device.Store.get = get;
    same('and the key it could not read is still there, untouched', device.raw(KEY), '1');
});

await block('with no document at all the file still loads (the Node devices, a worker)', async () => {
    const device = makeDevice({ deviceId: 'd_nodoc', storage: { [KEY]: '1' } });
    let threw = null;
    try { vm.runInContext(DISPLAY, device.ctx, { filename: 'js/ui/display.js' }); } catch (error) { threw = error; }
    same('it threw nothing', threw, null);
    same('and still knows the phone\'s choice', device.call('displayLarge'), true);
    same('applying it reports that there was nothing to apply it to', device.call('displayApply'), false);
});

await block('the preference is read once per session', async () => {
    const device = phone('d_once', { [KEY]: '1' });
    let reads = 0;
    const get = device.Store.get;
    device.Store.get = key => { if (key === KEY) reads += 1; return get.call(device.Store, key); };
    for (let i = 0; i < 5; i += 1) device.call('displayLarge');
    device.call('displayApply');
    same('no further read after the one at load', reads, 0);
    device.putRaw(KEY, '0');
    same('so a key changed under a running session does not flip the screen mid-evening', device.call('displayLarge'), true);
});

await block('on and off: one key, the class, and the screen drawn again', async () => {
    const device = crewPhone('d_switch');
    const before = others(device);
    device.call('displaySetLarge', true);
    same('on: the key is the one byte', device.raw(KEY), '1');
    same('on: the class is on <html>', [...device.root.names], [CLASS]);
    check('on: the screen was drawn again, so the bars are measured at their new height', device.renders >= 1, String(device.renders));
    same('on: every other key on the disk is byte for byte what it was', others(device), before);
    const again = phone('d_switch', device.dump());
    same('closed and opened: still on, and the class is there before anything is drawn', [again.call('displayLarge'), [...again.root.names]], [true, [CLASS]]);
    again.call('displaySetLarge', false);
    same('off: the key is GONE, not set to something else', again.raw(KEY), null);
    same('off: the class is gone', [...again.root.names], []);
    same('off: every other key on the disk is byte for byte what it was', others(again), before);
    same('closed and opened: off', phone('d_switch', again.dump()).call('displayLarge'), false);
});

await block('it is not the record: not the schedule, not the outbox, not the fence', async () => {
    const device = crewPhone('d_record');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);
    device.call('displaySetLarge', true);
    device.call('displaySetLarge', false);
    device.call('displaySetLarge', true);
    same('the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);
    same('so is the record on the disk', device.raw('scheduleData:v2'), disk);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write counter did not move: this is not a record the rescue file carries', device.Store.fenceState(), fence);
    same('the rescue file\'s own rule does not count the key as a record', device.call('isFarkadSnapshotKey', KEY), false);
    check('the key is nowhere inside the record', !device.raw('scheduleData:v2').includes('farkadDisplay') && !schedule.includes('display'));
});

await block('none of it leaves the phone: no cloud, no backup, no rescue file', async () => {
    const cloud = makeCloud();
    const device = crewPhone('d_cloud');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    device.call('displaySetLarge', true);
    await settle(TICK * 20);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);
    check('which has no word of it', !doc.includes('farkadDisplay') && !doc.includes(CLASS));

    // The control, so the silence above is about this feature and not a dead connection.
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_02', 'actual', 'p_01'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled, String(cloud.attempts.length - attempts));

    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)), JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text), JSON.parse(JSON.stringify(device.State.schedule)));
    check('with nothing of the mode in it', !backup.text.includes('farkadDisplay') && !backup.text.includes(CLASS));

    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')), JSON.stringify(rescue && rescue.name));
    check('and the rescue file does not carry it either', !rescue.text.includes('farkadDisplay') && !rescue.text.includes(CLASS));
    same('it is still on this phone', device.raw(KEY), '1');

    // A second phone that adopts this one's record adopts nothing of the mode.
    const other = phone('d_other');
    other.Sync.connect(cloud.adapter);
    await settleUntil(() => other.Sync.status === 'synced' && other.State.schedule.workers.length === 2, 5000);
    given('the second phone has the first one\'s crew', other.State.schedule.workers.length === 2, String(other.State.schedule.workers.length));
    same('the second phone is not large because the first one is', [other.call('displayLarge'), other.raw(KEY), [...other.root.names]], [false, null, []]);
});

await block('a disk that refuses the write costs the choice at the next opening, and nothing else', async () => {
    const device = crewPhone('d_full');
    const record = device.raw('scheduleData:v2');
    const set = device.Store.set;
    device.Store.set = (key, value, options) => key === KEY ? false : set.call(device.Store, key, value, options);
    let threw = null;
    try { device.call('displaySetLarge', true); } catch (error) { threw = error; }
    same('it threw nothing', threw, null);
    same('the screen is large now all the same', [device.call('displayLarge'), [...device.root.names]], [true, [CLASS]]);
    same('the record was not touched to make room for a preference', device.raw('scheduleData:v2'), record);
    device.Store.set = set;
    same('nothing reached the disk, so the next opening is off', phone('d_full', device.dump()).call('displayLarge'), false);
});

await block('the stylesheet\'s promise, read as text', async () => {
    const bare = SHEET.replace(/\/\*[\s\S]*?\*\//g, '');
    const firstBrace = bare.indexOf('{');
    same('the whole file is inside one @media screen', bare.slice(0, firstBrace).trim(), '@media screen');
    // Every selector of every style rule, at any depth of @media.
    const selectors = [];
    let depth = 0;
    let buffer = '';
    const stack = [];
    for (const ch of bare) {
        if (ch === '{') { stack.push(buffer.trim()); buffer = ''; depth += 1; continue; }
        if (ch === '}') {
            const head = stack.pop();
            if (head && !head.startsWith('@')) selectors.push(head);
            buffer = ''; depth -= 1; continue;
        }
        if (ch === ';' ) { buffer = ''; continue; }
        buffer += ch;
    }
    same('every brace that was opened was shut', depth, 0);
    given('it found the rules', selectors.length > 300, String(selectors.length));
    const split = text => { const out = []; let level = 0; let cur = '';
        for (const ch of text) { if (ch === '(' || ch === '[') level += 1; if (ch === ')' || ch === ']') level -= 1;
            if (ch === ',' && level === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; }
        if (cur.trim()) out.push(cur.trim()); return out; };
    const loose = selectors.flatMap(split).filter(one => !/^(:root|html)\.display-large(?![\w-])/.test(one));
    same('EVERY selector of EVERY rule begins under the class - so without the class the file matches nothing', loose.slice(0, 5), []);
    check('no zoom', !/(^|[;{\s])zoom\s*:/.test(bare));
    check('no transform: scale', !/scale\s*\(/.test(bare));
    check('no font-size on the root: the bars are fixed and a larger root would push them off the glass',
        !/(:root|html)\.display-large(\[[^\]]*\]|:not\([^)]*\))*\s*\{[^}]*font-size/.test(bare));
    check('no bar height is written into it (law 8): --nav-h, --day-actions-h and --topbar-h are measured',
        !/--(nav-h|day-actions-h|topbar-h|bars-h|kb-h)\s*:/.test(bare));
    check('no site colour is redefined', !/--site-\d+\s*:/.test(bare));
    check('nothing in it is for paper', !/@media[^{]*print/.test(bare) && !/@page/.test(bare));

    const sheets = [...PAGE.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    same('the page loads it fourth and last', sheets, ['css/app.css', 'css/readability.css', 'css/design.css', 'css/large.css']);
    const scripts = [...PAGE.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    same('and the script that puts the class on is the first after Store', scripts.slice(0, 3), ['js/store.js', 'js/ui/display.js', 'js/recovery.js']);
    // v191's review: loaded at the end of <body> the two ran after the page's own markup,
    // and the top bar and the tab bar were painted small for a frame and then jumped.
    const head = PAGE.slice(0, PAGE.indexOf('</head>'));
    check('and both load in the HEAD, after the four sheets: they run before one element of the body exists',
        head.includes('<script src="js/store.js"') && head.includes('<script src="js/ui/display.js"')
        && head.indexOf('<script src="js/store.js"') > head.indexOf('href="css/large.css"'),
        `</head>@${PAGE.indexOf('</head>')}`);
    // A value that is not a size is said again unchanged (v191's review: `.cell-absent`'s
    // `font-size: 0` had no copy, a copy of a weaker rule won in its place, and every
    // absent man's cell on the week read «—נעדר»).
    const base = ['app.css', 'readability.css', 'design.css'].map(name => read(`../css/${name}`).replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
    const hiding = [...base.matchAll(/([^{}]+)\{[^}]*?(?:^|[;{\s])font-size\s*:\s*0(?:px)?\s*(?:!important)?\s*[;}]/gm)].map(m => m[1].trim());
    given('the sheets hide words with font-size: 0', hiding.length >= 2, hiding.join(' | '));
    same('every one of them is said again, unchanged, under the class',
        hiding.filter(sel => !new RegExp(`:root\\.display-large ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{\\s*font-size:\\s*0;`).test(bare)), []);
    check('store.js and recovery.js still precede the sync group', scripts.indexOf('js/recovery.js') < scripts.indexOf('js/sync/sync.js'));
    check('the file touches the disk only through Store', !/localStorage|sessionStorage|indexedDB/.test(DISPLAY.replace(/\/\/[^\n]*/g, '')));
    check('and calls no dialog of the browser (law 11)', !/\b(alert|confirm|prompt)\s*\(/.test(DISPLAY));
});

report();
