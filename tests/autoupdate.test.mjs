// The update at the next LAUNCH (v205), decided in Node.
//
//   node tests/autoupdate.test.mjs
//
// js/ui/offline.js runs for real in a V8 context whose clock, DOM and service-worker container
// are fakes that behave as a browser's do: a worker asked to take over hands over
// (controllerchange) as 'activating' and is 'activated' later; a page goes to the background and
// comes back by its own visibilitychange; a press is a pointerdown on the window.
// tests/update.test.mjs drives the same rule against a real deploy and a real worker.
//
// THE RULE. The owner asked (2026-11-19) for the update to come with no press. It comes at the
// next launch only: a fresh page, a build waiting, nothing pressed or typed since the page
// loaded, midEdit() false, and no other window of the app (asked of the worker) - then a cover
// over the glass, skip-waiting to that worker, and a reload once THAT worker has taken over and
// is activated and nothing came up under the cover; any failure, or 12 s, and the cover comes
// down, the banner offers it, and the page never reloads by itself after. Everything else is
// v204's. The third review of v205 (on bdaed5e) is the last block of sections, each red there.
// Two candidates that reloaded a page in use (684c0f2, 81ca7a3) were stopped by review; the last
// sections hold that none of what they did is left: a leaving or a return reloads nothing.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OFFLINE = readFileSync(ROOT + 'js/ui/offline.js', 'utf8');
const RealDate = Date;

// ================================================================== a phone, in a context

function device({ controlledAtLoad = true, waitingAtLoad = true, others = 0, answers = true, channels = true } = {}) {
    let clock = new RealDate(2026, 10, 19, 10, 0).getTime();
    let serial = 0;
    const timers = [];
    const setTimeout = (fn, ms) => { serial += 1; timers.push({ id: serial, at: clock + (ms || 0), fn }); return serial; };
    const clearTimeout = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
    const tick = ms => {
        const until = clock + ms;
        for (;;) {
            timers.sort((a, b) => a.at - b.at);
            const next = timers[0];
            if (!next || next.at > until) break;
            timers.shift();
            clock = next.at;
            next.fn();
        }
        clock = until;
    };

    const bags = { window: {}, document: {}, container: {} };
    const on = (bag, type, fn) => { (bag[type] = bag[type] || []).push(fn); };
    const off = (bag, type, fn) => { bag[type] = (bag[type] || []).filter(f => f !== fn); };
    const fire = (bag, type, event = {}) => [...(bag[type] || [])].forEach(fn => fn(event));

    const byId = new Map();
    const node = (id, extra = {}) => {
        const classes = new Set();
        const listeners = {};
        const made = Object.assign({
            id, tagName: 'DIV', value: '', style: { display: '' }, children: [], attrs: {}, dataset: {},
            textContent: '', hidden: false, blurred: 0, isConnected: true,
            classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
            appendChild(child) { this.children.push(child); return child; },
            setAttribute(name, value) { this.attrs[name] = String(value); },
            getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
            removeAttribute(name) { delete this.attrs[name]; },
            addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
            blur() { this.blurred += 1; if (document.activeElement === this) document.activeElement = null; },
            dispatch(type, event) { [...(listeners[type] || [])].forEach(fn => fn(event)); },
            listeners
        }, extra);
        if (id) byId.set(id, made);
        return made;
    };
    const banner = node('updateBanner', { style: { display: 'none' } });
    const cover = node('launchCover', { hidden: true });
    const dayView = node('dayView');
    const script = node(null, { tagName: 'SCRIPT' });
    const body = node('body', { children: [dayView, banner, cover, script] });
    const panels = ['settingsPanel', 'transportPanel', 'journeyPanel', 'reorderPanel', 'dayDrawer'].map(id => node(id));
    const modals = [];

    const posted = [];
    // The worker's answer to the launch's question, as sw.js gives it: on the port the page
    // opened, a moment later. `others` other windows; no answer at all when `answers` is false.
    const answer = { others, answers };
    const worker = (name, state) => {
        const listeners = {};
        return {
            name, state,
            postMessage(message, ports) {
                posted.push({ t: clock, to: name, message });
                if (message && message.type === 'other-windows' && ports && ports[0] && answer.answers) {
                    const port = ports[0];
                    Promise.resolve().then(() => port.postMessage({ type: 'other-windows', others: answer.others }));
                }
            },
            addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
            removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
            become(next) { this.state = next; [...(listeners.statechange || [])].forEach(fn => fn({})); }
        };
    };
    const old = worker('old', 'activated');
    const fresh = worker('new', 'installed');
    const registration = {
        waiting: waitingAtLoad ? fresh : null,
        installing: null,
        update: () => Promise.resolve(),
        addEventListener() {}
    };
    const container = {
        controller: controlledAtLoad ? old : null,
        register: () => Promise.resolve(registration),
        getRegistration: () => Promise.resolve(registration),
        addEventListener: (type, fn) => on(bags.container, type, fn)
    };

    const session = new Map();
    const reloads = [];
    const document = {
        visibilityState: 'visible',
        hidden: false,
        activeElement: null,
        body,
        addEventListener: (type, fn) => on(bags.document, type, fn),
        getElementById: id => byId.get(id) || null,
        querySelectorAll: selector => (selector === '.modal' ? modals : [])
    };
    class FakeDate extends RealDate {
        constructor(...args) { if (args.length) super(...args); else super(clock); }
        static now() { return clock; }
    }
    const ctx = {
        console, JSON, Math, Number, String, Boolean, Object, Array, RegExp, Error, Promise, Set, Map,
        Date: FakeDate, setTimeout, clearTimeout,
        window: {
            addEventListener: (t, fn) => on(bags.window, t, fn),
            removeEventListener: (t, fn) => off(bags.window, t, fn),
            sessionStorage: { getItem: k => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: k => session.delete(k) }
        },
        document,
        navigator: { serviceWorker: container },
        location: { protocol: 'https:', reload: () => reloads.push({ t: clock, covered: cover.hidden === false }) },
        APP_VERSION: 'v205',
        clear: n => { n.children = []; },
        el: (tag, cls, text) => ({ tag, text }),
        button: (label, cls, fn) => ({ label, onclick: fn }),
        askTell: text => { told.push(text); },
        settingsSendTo: () => {}
    };
    const told = [];
    if (channels) {
        ctx.MessageChannel = class {
            constructor() {
                const one = { onmessage: null };
                const two = { postMessage: data => { if (typeof one.onmessage === 'function') one.onmessage({ data }); } };
                this.port1 = one;
                this.port2 = two;
            }
        };
    }
    vm.createContext(ctx);
    vm.runInContext(OFFLINE, ctx);

    const event = () => {
        const e = { prevented: 0, stopped: 0, cancelable: true };
        e.preventDefault = () => { e.prevented += 1; };
        e.stopImmediatePropagation = () => { e.stopped += 1; };
        e.stopPropagation = () => { e.stopped += 1; };
        return e;
    };
    const hide = () => { document.visibilityState = 'hidden'; document.hidden = true; fire(bags.document, 'visibilitychange'); };
    const show = () => { document.visibilityState = 'visible'; document.hidden = false; fire(bags.document, 'visibilitychange'); };
    const press = () => fire(bags.window, 'pointerdown', event());
    const key = () => { const e = event(); fire(bags.window, 'keydown', e); return e; };
    const handover = (state = 'activating', to = fresh) => {
        registration.waiting = null;
        to.state = state;
        container.controller = to;
        fire(bags.container, 'controllerchange');
    };
    const asked = () => posted.filter(p => p.message === 'skip-waiting');
    const questions = () => posted.filter(p => p.message && p.message.type === 'other-windows');
    const openModal = () => { const m = node('dialog' + modals.length, { style: { display: 'flex' } }); modals.push(m); return m; };
    const covered = () => cover.hidden === false;
    const bannerUp = () => banner.style.display === '';
    const pressBanner = label => {
        const b = banner.children.find(child => child && child.label === label);
        if (b) b.onclick();
        return Boolean(b);
    };
    return { ctx, tick, bags, fire, hide, show, press, key, handover, asked, questions, posted, reloads, banner, cover, panels,
        modals, openModal, node, registration, container, old, fresh, worker, document, covered, bannerUp, pressBanner, session,
        event, dayView, script, answer, told };
}

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
async function launched(options = {}, before = null) {
    const d = device(options);
    if (before) before(d);
    d.ctx.registerOffline();
    await flush();
    return d;
}

// ================================================================== the launch
{
    suite('a fresh, untouched launch with a build waiting covers the glass, hands over, and reloads onto it');

    const d = await launched();
    check('the cover is up at once', d.covered());
    same('with its one line', d.cover.textContent, 'מעדכן לגרסה חדשה…');
    same('the waiting build - THAT worker - was asked to take over, once', d.asked().map(p => p.to), ['new']);
    check('no banner over it', !d.bannerUp());
    d.handover('activating');
    same('the handover, the worker still activating: no reload yet', d.reloads.length, 0);
    d.fresh.become('activated');
    same('activated: the reload, with the cover still up', d.reloads.map(r => r.covered), [true]);
    d.tick(20000);
    same('and only the one', d.reloads.length, 1);

    // Activated already when it handed over: the reload at once.
    const e = await launched();
    e.handover('activated');
    same('a handover already activated reloads at once', e.reloads.length, 1);

    // Found only at the 1.5 s re-check, the page still untouched.
    const f = await launched({ waitingAtLoad: false });
    check('nothing waiting at the start: no cover', !f.covered());
    f.registration.waiting = f.fresh;
    f.tick(1500);
    await flush();                                       // the worker's answer to the question
    check('the waiting build found at the re-check: the cover', f.covered() && f.asked().length === 1);
}

{
    suite('a launch somebody touched first takes nothing: the banner offers it, as in v204');

    const d = await launched({}, d => d.press());
    check('touched before the boot asked: no cover', !d.covered());
    same('nothing asked of the waiting build', d.asked().length, 0);
    check('the banner offers it', d.bannerUp());
    d.tick(60000);
    same('a minute on, nothing reloaded', d.reloads.length, 0);

    const e = await launched({ waitingAtLoad: false });
    e.key();                                             // his first key, before the re-check
    e.registration.waiting = e.fresh;
    e.tick(1500);
    check('touched before the re-check found it: no cover, the banner', !e.covered() && e.bannerUp() && e.asked().length === 0);

    const g = await launched({}, g => { g.openModal(); });
    check('a dialog open at the launch (midEdit): no cover, the banner', !g.covered() && g.bannerUp() && g.asked().length === 0);

    const h = await launched({}, h => { h.document.activeElement = h.node(null, { tagName: 'INPUT', value: '12' }); });
    check('a box holding digits with the focus (midEdit): no cover', !h.covered() && h.asked().length === 0);

    // Brought back whole from the back-forward cache before the re-check: not a launch.
    const b = await launched({ waitingAtLoad: false });
    b.fire(b.bags.window, 'pageshow', { persisted: true });
    b.registration.waiting = b.fresh;
    b.tick(1500);
    check('a page restored from the back-forward cache is no launch: no cover', !b.covered() && b.asked().length === 0);
}

{
    suite('a handover that never comes: the cover down at 12 s, the banner, and no reload ever after');

    const d = await launched();
    given('the cover is up', d.covered());
    d.tick(11900);
    check('11.9 s: still up', d.covered());
    d.tick(200);
    check('12 s: the cover is down', !d.covered());
    check('and the banner offers the update', d.bannerUp());
    same('nothing reloaded', d.reloads.length, 0);
    d.handover('activating');
    d.fresh.become('activated');
    same('the handover and the activation arriving after: still no reload', d.reloads.length, 0);
    let prevented = 0;
    const late = d.key();
    prevented = late.prevented;
    same('the keys are his again', prevented, 0);
    check('a press of «רענן עכשיו» then reloads, as in v204', d.pressBanner('רענן עכשיו') && d.reloads.length === 1);

    // The handover came in time but the activation did not.
    const e = await launched();
    e.tick(3000);
    e.handover('activating');
    e.tick(9100);
    check('handed over, never activated within 12 s: the cover down, no reload', !e.covered() && e.reloads.length === 0);
    e.fresh.become('activated');
    same('activated afterwards: still no reload', e.reloads.length, 0);
}

{
    suite('the cover eats a tap and a key, and moves no focus: nothing a box holds can be committed');

    // A box with the focus and nothing in it - not midEdit, so the launch goes ahead.
    const d = await launched({}, d => {
        d.document.activeElement = d.node('rimaBox', { tagName: 'INPUT', value: '' });
    });
    given('the launch went ahead', d.covered());
    const box = d.document.activeElement;
    const tap = d.event();
    (d.cover.listeners.pointerdown || []).forEach(fn => fn(tap));
    const down = d.event();
    (d.cover.listeners.mousedown || []).forEach(fn => fn(down));
    check('a tap on the cover is taken and stopped there', tap.prevented > 0 && tap.stopped > 0);
    check('and its mousedown prevented - the browser moves no focus', down.prevented > 0);
    const stroke = d.key();
    check('a key is taken and stopped', stroke.prevented > 0 && stroke.stopped > 0);
    d.handover('activated');
    same('blur was never called on the box that had the focus', box.blurred, 0);
    check('and it still has the focus when the page goes', d.document.activeElement === box);
    same('the reload happened', d.reloads.length, 1);
}

{
    suite('a first install is never reloaded, and never covered');

    const d = await launched({ controlledAtLoad: false, waitingAtLoad: false });
    d.container.controller = d.old;
    d.fire(d.bags.container, 'controllerchange');
    d.hide();
    d.show();
    check('claimed, left and come back to: never reloaded, never covered', d.reloads.length === 0 && !d.covered());

    const e = await launched({ controlledAtLoad: false, waitingAtLoad: true });
    check('a build "waiting" with nothing in charge yet is no update: no cover', !e.covered() && e.asked().length === 0);
}

{
    suite('law 7 and the press are v204\'s: another window catches up when nobody types; «רענן עכשיו» reloads');

    const d = await launched({ waitingAtLoad: false }, d => d.press());
    const dialog = d.openModal();
    d.handover('activated');                             // another window took the update
    same('the other window, a dialog open: not yet', d.reloads.length, 0);
    dialog.style.display = 'none';
    d.tick(500);
    same('the dialog shut: caught up at the next half second, as in v204', d.reloads.length, 1);

    const e = await launched({}, e => e.press());
    check('a touched launch: the banner', e.bannerUp());
    check('pressed: the build asked to take over', e.pressBanner('רענן עכשיו') && e.asked().length === 1);
    e.handover('activating');
    same('the handover: the reload, as in v204 (it does not wait for the activation)', e.reloads.length, 1);
}

// ================================================================== nothing live is left
{
    suite('a leaving or a return reloads nothing - every live path the reviews of 684c0f2 and 81ca7a3 found');

    const leaveAndCome = d => { d.hide(); d.tick(3000); d.show(); d.tick(3000); };

    // 81ca7a3 P1: a count erased to retype, the box still focused (empty, so not midEdit).
    const erased = await launched({}, e => e.press());
    const box = erased.node('rima', { tagName: 'INPUT', value: '' });
    erased.document.activeElement = box;
    leaveAndCome(erased);
    check('the erased count box: no reload, nothing asked, no blur',
        erased.reloads.length === 0 && erased.asked().length === 0 && box.blurred === 0 && erased.document.activeElement === box);

    // 684c0f2 P1-B: an inline advance with 500 typed, the focus on the empty note.
    const advance = await launched({}, a => a.press());
    advance.document.activeElement = advance.node('note', { tagName: 'INPUT', value: '' });
    leaveAndCome(advance);
    check('the advance being typed: no reload, nothing asked', advance.reloads.length === 0 && advance.asked().length === 0);

    // 81ca7a3 P1: «רענן עכשיו» pressed while a box holds digits, then the ⋯ sheet open.
    const refused = await launched({}, r => r.press());
    refused.document.activeElement = refused.node('count', { tagName: 'INPUT', value: '7' });
    refused.pressBanner('רענן עכשיו');
    refused.handover('activated');
    refused.panels[0].classList.add('open');
    leaveAndCome(refused);
    check('the refused press, the box still holding 7: no reload at a leaving or a return',
        refused.reloads.length === 0);
    refused.document.activeElement = null;
    refused.tick(500);
    same('v204\'s own way: the reload once the box is left', refused.reloads.length, 1);

    // 684c0f2 P1-C / 81ca7a3 P2: the place kept across midnight. No reload, and no note.
    const night = await launched({}, n => n.press());
    leaveAndCome(night);
    check('past any midnight: nothing reloaded and no place note kept', night.reloads.length === 0 && night.session.size === 0);

    // 684c0f2 P1-A / P2 / P3-2: no apply at a leaving or a return, touched or not.
    const quiet = await launched({ waitingAtLoad: false }, q => q.press());
    quiet.registration.waiting = quiet.fresh;
    leaveAndCome(quiet);
    check('a build that arrived while the page was in use: a leaving and a return ask nothing, reload nothing - the banner offers it',
        quiet.asked().length === 0 && quiet.reloads.length === 0 && quiet.bannerUp());
}

// ================================================================== the third review (bdaed5e)
{
    suite('P1 (third review): a launch with another window of the app open takes nothing - the banner, as in v204');

    const d = await launched({ others: 1 });
    same('the worker was asked whether this is the only window, once', d.questions().length, 1);
    same('another window answered: nothing asked of the waiting build', d.asked().length, 0);
    check('the cover came down, and the banner offers the update', !d.covered() && d.bannerUp());
    d.tick(60000);
    same('a minute on, nothing reloaded', d.reloads.length, 0);
    // The other window presses «רענן עכשיו» later: this window catches up by law 7, v204's way.
    d.handover('activated');
    d.tick(500);
    same('a press in the other window later catches this one up, as in v204', d.reloads.length, 1);

    const quiet = await launched({ answers: false });
    check('no answer from the worker: the cover is up while it waits', quiet.covered());
    quiet.tick(1000);
    check('a second and no answer: the cover down, the banner, nothing asked', !quiet.covered() && quiet.bannerUp() && quiet.asked().length === 0);

    const none = await launched({ channels: false });
    check('no way to ask (no MessageChannel): the banner, nothing asked', !none.covered() && none.bannerUp() && none.asked().length === 0);

    const alone = await launched({ others: 0 });
    check('the only window: the build asked to take over, the cover still up', alone.covered() && alone.asked().length === 1);
}

{
    suite('P2 (third review): the build made redundant under the cover ends the launch at once, and the banner\'s press reaches the newer one');

    const d = await launched();
    given('the launch asked the waiting build', d.asked().length === 1);
    d.tick(2000);
    // A newer build installs under the cover: the one asked becomes redundant.
    const newer = d.worker('newer', 'installed');
    d.registration.waiting = newer;
    d.fresh.become('redundant');
    check('the cover comes down at once, not at 12 s', !d.covered());
    check('the banner offers the update', d.bannerUp());
    same('nothing reloaded', d.reloads.length, 0);
    check('pressed: skip-waiting goes to the newer build, not the redundant one',
        d.pressBanner('רענן עכשיו') && d.asked().map(p => p.to).join() === 'new,newer', d.asked().map(p => p.to).join());

    // The same through the press itself: a worker in hand that is redundant is not posted to.
    const e = await launched({}, e => e.press());
    given('a touched launch: the banner over the waiting build', e.bannerUp());
    const later = e.worker('later', 'installed');
    e.registration.waiting = later;
    e.fresh.become('redundant');
    e.pressBanner('רענן עכשיו');
    same('the press goes to the build really waiting', e.asked().map(p => p.to), ['later']);
}

{
    suite('P3-a (third review): a dialog raised under the cover is never reloaded away - the cover comes down instead');

    const d = await launched();
    d.tick(3000);
    d.openModal();                                       // e.g. a lost close told, under the cover
    d.handover('activating');
    d.fresh.become('activated');
    same('handed over and activated with a dialog up: no reload', d.reloads.length, 0);
    check('the cover is down so the dialog is seen', !d.covered());
    check('and the update stays offered: updateWaiting() and the banner', d.ctx.updateWaiting() && d.bannerUp());
    d.modals[0].style.display = 'none';
    check('once he has read it, a press reloads', d.pressBanner('רענן עכשיו') && d.reloads.length === 1);

    const e = await launched();
    e.handover('activated');
    same('with no dialog, the launch reloads as before', e.reloads.length, 1);
}

{
    suite('P3-b (third review): a handover after the give-up keeps the update offered, and a press made long before it still reloads');

    const d = await launched();
    d.tick(12100);
    given('the launch gave up at 12 s', !d.covered() && d.bannerUp());
    d.handover('activating');
    d.fresh.become('activated');
    same('the late handover and activation reload nothing by themselves', d.reloads.length, 0);
    check('updateWaiting() still says an update is there', d.ctx.updateWaiting());
    d.pressBanner('אחר כך');
    d.hide();
    d.show();
    check('«אחר כך», then a return: the banner offers it again', d.bannerUp());
    d.ctx.checkForUpdate();
    await flush();
    d.tick(1300);
    await flush();
    same('«בדוק עדכון» reloads, rather than call this build current', [d.reloads.length, d.told], [1, []]);

    const e = await launched();
    e.tick(12100);
    e.pressBanner('אחר כך');
    e.show();
    check('a return before the handover still offers the waiting build', e.bannerUp());
    e.pressBanner('רענן עכשיו');
    e.tick(5000);                                        // the handover comes 5 s after the press
    e.handover('activated');
    e.tick(500);
    same('a press made more than 4 s before the handover still reloads', e.reloads.length, 1);
}

{
    suite('P3-d (third review): under the cover a click or typing dispatched on a control is stopped, and the page is hidden from assistive technology');

    const d = await launched({ answers: false });       // the cover up, the question pending
    given('covered', d.covered());
    const click = d.event();
    d.fire(d.bags.window, 'click', click);
    check('a click dispatched on a control (as assistive technology does) is stopped on the window', click.prevented > 0 && click.stopped > 0);
    const typed = d.event();
    d.fire(d.bags.window, 'beforeinput', typed);
    const input = d.event();
    d.fire(d.bags.window, 'input', input);
    check('and so are typed characters', typed.prevented > 0 && typed.stopped > 0 && input.stopped > 0);
    same('the page under the cover is hidden from assistive technology, the cover itself is not',
        [d.dayView.getAttribute('aria-hidden'), d.banner.getAttribute('aria-hidden'), d.cover.getAttribute('aria-hidden'), d.script.getAttribute('aria-hidden')],
        ['true', 'true', null, null]);
    d.dayView.setAttribute('aria-hidden', 'true');      // (it was put there by the cover)
    d.tick(1000);
    check('the cover down: the page back for assistive technology, clicks are his again',
        !d.covered() && d.dayView.getAttribute('aria-hidden') === null && d.banner.getAttribute('aria-hidden') === null);
    const after = d.event();
    d.fire(d.bags.window, 'click', after);
    same('a click after the cover is not stopped', after.prevented + after.stopped, 0);
}

report();
