// הסעות, shared: one plan of the rides on all three phones.
//
// The owner, 2026-11-10, having tried the picture on his own phone: "add the feature to
// the other accounts" - and, offered two meanings, ONE SHARED PLAN: he seats the men, the
// other two phones see the same cars and the same riders, and may change them. The design
// and everything it was measured against is docs/transport-spec.md, "Phase 3: shared".
// This file is all of the client half; js/ui/transport.js calls it at five marked places
// and knows nothing else about it.
//
// WHAT THIS FILE IS NOT, and each line is a test (tests/transport.share.test.mjs):
//
//   - IT IS NOT THE RECORD'S SYNC. It names nothing in js/sync/ but the adapter that is
//     handed to it: no outbox, no journal, no send claim, no receipt, and never the
//     record's status sentence. The plans are documents of their own
//     (schedules/<doc>/transport/settings and …/day_<date>), so not one byte of them is in
//     the schedule document, and a transport write that is refused, lost or late is not an
//     error of the record and cannot hold one of its writes.
//   - IT IS OFF UNLESS THE BUILD SAYS SO (TRANSPORT_SHARE below) AND THIS PHONE TURNED
//     הסעות ON. With either shut, every function here returns before it reads a key.
//   - IT NEVER MAKES THE SCREEN WAIT. js/ui/transport.js writes a change to the phone
//     first, as it always did, and tells this file afterwards.
//
// HOW IT KEEPS TWO PEOPLE FROM OVERWRITING EACH OTHER. A shared document carries a
// revision. A write says "I was built on revision N, and I am N+1"; the adapter checks
// that inside a transaction and firestore.rules checks it again. Of two phones that built
// on the same N one lands, and the other is refused and handed the document that won. The
// unit is the WHOLE DAY on purpose: "a man is in one seat" is a rule about the whole day,
// and a merge of fields cannot see it (docs/transport-spec.md, 3.4).
//
// WHAT THE LOSER GETS. His copy is put aside on his own disk, the plan that won is drawn,
// and one sentence says so with two buttons - use mine, or keep the shared one. "Use mine"
// is an ordinary change that goes up through the same check; nothing here can force a
// write over a revision it has not seen.

// THE GATE. OPEN since v186 (it shipped shut in v185, which every phone was to take
// first). Open does not mean the cloud allows it: the rules that allow these documents
// are pasted by the owner by hand, and a phone that meets the rules of before says «עדיין
// לא משותף», keeps its plans on itself, and asks again by itself (docs/releases.md, v186).
// Shut again by editing this line, in a commit: every phone then keeps the plans it
// holds, and the documents stay in the cloud. The suites still measure the SHUT path,
// through the one test seam the app has, FARKAD_FLAG_OVERRIDES (js/model/schema.js) - the
// way LEDGER_WRITES is gated in js/model/ledger.js - which no shipped file defines.
const TRANSPORT_SHARE = true;

function transportShareOn() {
    return typeof FARKAD_FLAGS !== 'undefined' && FARKAD_FLAGS
        && typeof FARKAD_FLAGS.transportShare === 'boolean'
        ? FARKAD_FLAGS.transportShare : TRANSPORT_SHARE === true;
}

// What this phone knows about one shared document: { rev, base, sent? }.
//   rev   the cloud revision this phone's copy was last equal to
//   base  the shared part at that revision, as canonical text
//   sent  { rev, text } - what is on its way, written BEFORE the request leaves, so that a
//         request which landed while the app was being closed is recognised as this
//         phone's own at the next opening and not taken for somebody else's change
// THERE IS NO "DIRTY" FLAG. A document is owed to the cloud exactly when the shared part
// of the local copy is not `base`. A flag is a second fact that has to be written in step
// with the first; a crash between the two would hide a change, and this cannot.
const TRANSPORT_SHARED_PREFIX = 'farkadTransport:shared:';
// The copy that lost: { v, why: 'first' | 'changed', text, at }. One per document.
const TRANSPORT_ASIDE_PREFIX = 'farkadTransport:aside:';
const TRANSPORT_SHARE_SETTINGS = 'settings';
const TRANSPORT_SHARE_DAY = 'day_';

const TransportShare = (function () {
    'use strict';

    let adapter = null;
    let stopListening = null;
    let heard = false;          // a live answer has come since this connection began
    let stale = false;          // the last answer was from before the signal went
    let listenerDead = false;
    let refused = false;        // the cloud refuses the transport paths
    let sending = null;         // the name of the document on its way
    let adopting = false;       // a local write that is the cloud's, not the person's
    let flushTimer = null;
    let retryTimer = null;
    let relistenTimer = null;
    let staleTimer = null;
    let retryStep = 0;
    let relistenStep = 0;
    let drawn = null;           // what the line on the screen was last built from
    const blocked = Object.create(null);   // a cloud document this build cannot read
    const stuck = Object.create(null);     // a shared plan not drawn for want of room: this
                                           // phone's copy could not be put aside, or the
                                           // disk would not take the plan

    const api = {
        // Milliseconds. Small in the suites; a phone on a building site is not helped by
        // a tighter loop than this.
        flushDelayMs: 300,
        staleGraceMs: 1500,
        retryMs: 5000,
        retryMaxMs: 300000
    };

    function active() {
        return transportShareOn() && typeof transportEnabled === 'function' && transportEnabled();
    }

    // ------------------------------------------------------------------ canonical text
    //
    // The same content gives the same text, whatever order its keys were written in: two
    // phones that mean the same plan must be able to find that out by comparing strings.
    function ordered(value) {
        if (Array.isArray(value)) return value.map(ordered);
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).sort().forEach(key => { out[key] = ordered(value[key]); });
            return out;
        }
        return value;
    }
    function text(value) { return JSON.stringify(ordered(value)); }

    function isDayName(name) {
        return typeof name === 'string' && name.indexOf(TRANSPORT_SHARE_DAY) === 0
            && name.length === TRANSPORT_SHARE_DAY.length + 10
            && isRealDate(name.slice(TRANSPORT_SHARE_DAY.length));
    }
    function dateOf(name) { return name.slice(TRANSPORT_SHARE_DAY.length); }
    function isName(name) { return name === TRANSPORT_SHARE_SETTINGS || isDayName(name); }
    function localKey(name) {
        return name === TRANSPORT_SHARE_SETTINGS ? TRANSPORT_SETTINGS_KEY : TRANSPORT_DAY_PREFIX + dateOf(name);
    }

    // The shared part of what this phone holds, as canonical text - or null when there is
    // nothing ON THE DISK for it. A list of vehicles nobody on this phone ever changed is
    // the seven every phone starts with, held in memory only; it is not this phone's to
    // publish. A day's `marks` are this phone's own taps and are not in it.
    //
    // THE SESSION'S COPY WHEN THERE IS ONE, the disk's otherwise - and a day that is not
    // open is read off the disk WITHOUT being loaded: transportDayOf would copy bytes that
    // will not read to a key of their own and keep the day in memory, and asking what is
    // owed must not write or remember anything (transportPeekDay, for the same reason).
    //
    // BOTH SIDES GO THROUGH THE SAME READER. What this phone holds is passed through
    // transportReadSettings / transportReadDay exactly as a document from the cloud is
    // (cloudText), so "the same plan" is decided on what the reader keeps and on nothing
    // else. Without that, a field the reader writes on the way in but the screen does not
    // set (or the reverse) would make a phone disagree with its own echo for ever.
    function sharedText(name, raw, session) {
        if (raw === null || raw === undefined) return null;
        const parsed = transportJson(raw);
        if (!parsed) return null;
        if (name === TRANSPORT_SHARE_SETTINGS) {
            const held = session || parsed;
            return text({ vehicles: transportReadSettings({ vehicles: JSON.parse(JSON.stringify(held.vehicles || [])) }).vehicles });
        }
        const day = transportReadDay(JSON.parse(JSON.stringify(session || parsed)));
        return text({ date: dateOf(name), unavailable: day.unavailable, status: day.status, trips: day.trips });
    }
    function localText(name) {
        let raw = null;
        try { raw = Store.get(localKey(name)); } catch (error) { raw = null; }
        const session = name === TRANSPORT_SHARE_SETTINGS ? transportSettingsMemory : transportDays[dateOf(name)];
        return sharedText(name, raw, session || null);
    }

    // WHAT THE NEXT OPENING WILL READ, which is not always what this session holds. The
    // session's copy can be AHEAD of the disk: a change the disk refused stays in memory
    // and the screen says so (transportWrite, «השינוי לא נשמר במכשיר»). A share record is
    // believed, at the next opening, of whatever the disk holds then - so a record moved
    // to a plan only memory had, or a revision built on one and sent, makes the disk's
    // OLDER plan read as this phone's change to the cloud's, and it is sent over the other
    // phone's with no copy aside and no notice anywhere: measured in the review of v189
    // (c3), a seat and a vehicle turned off gone from every phone. So a record is moved
    // only to what the disk holds, and nothing is sent that the disk does not hold.
    // Read past Store's session cache (Store.durableGet): that cache is what this session
    // wrote and believes; the disk is what the next one will read. With no disk at all
    // (js/store.js: there "memory is the whole of storage") Store's memory is the storage,
    // and nothing in it outlives the session to come back as an older plan.
    function stored(key) {
        try { return Store.available === false ? Store.get(key) : Store.durableGet(key); } catch (error) { return null; }
    }
    function diskText(name) {
        return sharedText(name, stored(localKey(name)), null);
    }
    // The disk holds what this session holds.
    function onDisk(name) {
        return localText(name) === diskText(name);
    }

    function isEmptyText(name, value) {
        if (name === TRANSPORT_SHARE_SETTINGS) return false;
        return value === text({ date: dateOf(name), unavailable: {}, status: {}, trips: {} });
    }

    // A document from the cloud, read as THIS build reads its own: through the screen's
    // readers, so an id that could land on a prototype, a seat count that is not one or a
    // status nobody offers is dropped here exactly as it would be off the disk. Null for
    // a document this build must not touch: another version, no revision, the wrong day.
    function cloudText(name, data) {
        if (!isPlainObject(data) || data.v !== 1 || !Number.isInteger(data.revision) || data.revision < 1) return null;
        if (name === TRANSPORT_SHARE_SETTINGS) {
            if (!Array.isArray(data.vehicles)) return null;
            return text({ vehicles: transportReadSettings({ vehicles: data.vehicles }).vehicles });
        }
        if (data.date !== dateOf(name)) return null;
        const day = transportReadDay({ unavailable: data.unavailable, status: data.status, trips: data.trips });
        return text({ date: data.date, unavailable: day.unavailable, status: day.status, trips: day.trips });
    }

    // ------------------------------------------------------------------ this phone's records
    function readJson(key) {
        let raw = null;
        try { raw = Store.get(key); } catch (error) { raw = null; }
        if (raw === null || raw === undefined) return null;
        try {
            const parsed = JSON.parse(raw);
            return isPlainObject(parsed) ? parsed : null;
        } catch (error) { return null; }
    }
    function readMeta(name) {
        const meta = readJson(TRANSPORT_SHARED_PREFIX + name);
        if (!meta || !Number.isInteger(meta.rev) || meta.rev < 1 || typeof meta.base !== 'string') return null;
        const sent = isPlainObject(meta.sent) && Number.isInteger(meta.sent.rev) && typeof meta.sent.text === 'string'
            ? { rev: meta.sent.rev, text: meta.sent.text } : null;
        return { rev: meta.rev, base: meta.base, sent };
    }
    // What is on its way for a document that was never shared has no revision to sit
    // beside, so it is kept on its own: { rev: 0, base: null, sent }.
    function readSent(name) {
        const meta = readJson(TRANSPORT_SHARED_PREFIX + name);
        return meta && isPlainObject(meta.sent) && Number.isInteger(meta.sent.rev)
            && typeof meta.sent.text === 'string' ? { rev: meta.sent.rev, text: meta.sent.text } : null;
    }
    function writeMeta(name, meta) {
        return Store.setVerified(TRANSPORT_SHARED_PREFIX + name, JSON.stringify(meta), { optional: true }) === true;
    }
    function readAside(name) {
        const aside = readJson(TRANSPORT_ASIDE_PREFIX + name);
        return aside && aside.v === 1 && typeof aside.text === 'string'
            && (aside.why === 'first' || aside.why === 'changed') ? aside : null;
    }

    // ------------------------------------------------------------------ taking the cloud's
    //
    // A plan onto the disk through the screen's own writer (transportWrite: a key held
    // because its bytes would not read is never written over; optional; verified; the
    // hook) - true when the disk has it. `cloud`: the plan is the cloud's, not the
    // person's. Then the hook must not send it back, and a refusal must not raise the
    // screen's «השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד.» - that sentence is
    // about a change of the person's that memory holds and the disk does not, and a
    // refused adoption leaves none: memory stays what the disk holds (adopt, below).
    function put(key, value, cloud) {
        const before = transportKept;
        if (cloud) adopting = true;
        let kept = false;
        try { kept = transportWrite(key, value) === true; } finally { if (cloud) adopting = false; }
        // No disk at all: what was written is what every reading of this session finds.
        if (!kept && Store.available === false && Store.get(key) === JSON.stringify(value)) kept = true;
        if (!kept && cloud) transportKept = before;
        return kept;
    }

    // A day or the list, as it would be with the shared part of `data` in place of its own
    // - built BESIDE the session's copy, which is not touched. THAT day and no other, and
    // its own marks stay: a mark is this phone's tap on a driver's chat, not part of the
    // plan. (The key order of the copy is the original's, so its bytes on the disk are
    // what an edit in place wrote.)
    function withShared(name, data) {
        if (name === TRANSPORT_SHARE_SETTINGS) {
            const settings = Object.assign({}, transportSettings());
            settings.vehicles = transportReadSettings({ vehicles: data.vehicles }).vehicles;
            settings.seeded = true;
            return settings;
        }
        const day = Object.assign({}, transportDayOf(dateOf(name)));
        const read = transportReadDay({ unavailable: data.unavailable, status: data.status, trips: data.trips });
        day.unavailable = read.unavailable;
        day.status = read.status;
        day.trips = read.trips;
        return day;
    }
    // The session's copy, replaced - only by a copy the disk now holds.
    function holdInSession(name, value) {
        if (name === TRANSPORT_SHARE_SETTINGS) transportSettingsMemory = value;
        else transportDays[dateOf(name)] = value;
    }

    // The shared part of a document, put on this phone in place of what was there. THE
    // LOCAL WRITE FIRST, the share record second: stopped between the two, the phone holds
    // the cloud's plan with an older share record, which reads as "owed", goes up, and is
    // answered "that is what is there already". The other order would leave the OLD plan
    // beside a NEW record, read as this phone's change to the winner, and be sent over it.
    //
    // AND INTO MEMORY ONLY ONCE THE DISK HAS IT. This used to change the session's copy in
    // place and then save it: a disk that refused the save left the other phone's plan
    // drawn and held in memory over the older plan on the disk - which the next answer
    // from the cloud found equal to itself ('same'), recorded as this phone's revision, and
    // after a reopen sent the disk's older plan over the other phone's (stored, above).
    // Refused now, the session's copy stays what it was, which is what the disk holds,
    // and the line says there was no room (take, 'stuck').
    function adopt(name, data, revision, value) {
        const next = withShared(name, data);
        if (!put(localKey(name), next, true)) return false;
        holdInSession(name, next);
        writeMeta(name, { rev: revision, base: value });
        return true;
    }

    // One document, as the cloud has it. Answers what was done with it, for the suites.
    function take(name, data) {
        if (!isName(name)) return 'ignored';
        const value = cloudText(name, data);
        if (value === null) { blocked[name] = true; return 'blocked'; }
        delete blocked[name];
        const revision = data.revision;
        const meta = readMeta(name);
        if (meta && revision <= meta.rev) return 'old';
        const sent = meta ? meta.sent : readSent(name);
        // This phone's own write, come back. What went up was on the disk when it went
        // (flush sends nothing else), so the disk holds it, or a later change of the
        // person's made on top of it.
        if (sent && sent.rev === revision && sent.text === value) {
            writeMeta(name, { rev: revision, base: value });
            return 'echo';
        }
        const mine = localText(name);
        // The same fact, written twice, is one fact - ONCE THE DISK HOLDS IT. Memory can
        // say what the cloud says while the disk still holds the plan before it (a change
        // the disk refused); recorded then, the record would claim a plan the disk does
        // not have (stored, above). So the disk is given the plan the way any adopted plan
        // is, and the record follows only if it took it.
        if (mine === value) {
            if (diskText(name) !== value) {
                if (!adopt(name, data, revision, value)) return 'unkept';
                delete stuck[name];
                return 'adopted';
            }
            writeMeta(name, { rev: revision, base: value });
            delete stuck[name];
            return 'same';
        }
        const nothingHere = mine === null || (!meta && isEmptyText(name, mine));
        if (nothingHere || (meta && mine === meta.base)) {
            // Refused by the disk: nothing is drawn that the disk did not take, and
            // nothing goes up from this document until it can be (owes) - the line says
            // there is no room for the shared plan, and the next word from the cloud asks
            // the disk again.
            if (!adopt(name, data, revision, value)) { stuck[name] = true; return 'stuck'; }
            delete stuck[name];
            return 'adopted';
        }
        // This phone holds something else: a plan it never shared, or a change made on a
        // revision that has since moved. The cloud's is drawn - and ONLY AFTER this
        // phone's copy is safely aside. If the copy cannot be kept, nothing is adopted.
        const asideKey = TRANSPORT_ASIDE_PREFIX + name;
        let before = null;
        try { before = Store.get(asideKey); } catch (error) { before = null; }
        const aside = { v: 1, why: meta ? 'changed' : 'first', text: mine, at: Date.now() };
        if (Store.setVerified(asideKey, JSON.stringify(aside), { optional: true }) !== true) {
            stuck[name] = true;
            return 'stuck';
        }
        if (!adopt(name, data, revision, value)) {
            // Aside, and the shared plan then refused by the disk: this phone's copy is
            // still the plan on the screen and on the disk, so the copy aside goes back to
            // what it was. Left, it would be offered with «מוצג השיבוץ המשותף» beside a
            // shared plan that is not drawn.
            if (before === null || before === undefined) Store.remove(asideKey);
            else Store.setVerified(asideKey, before, { optional: true });
            stuck[name] = true;
            return 'stuck';
        }
        delete stuck[name];
        return 'aside';
    }

    // ------------------------------------------------------------------ what is owed
    function localNames() {
        const names = [TRANSPORT_SHARE_SETTINGS];
        const cutoff = addDays(todayStr(), -TRANSPORT_KEEP_DAYS);
        Store.keys().forEach(key => {
            if (key.indexOf(TRANSPORT_DAY_PREFIX) !== 0 || key.length !== TRANSPORT_DAY_PREFIX.length + 10) return;
            const date = key.slice(TRANSPORT_DAY_PREFIX.length);
            if (isRealDate(date) && !(date < cutoff)) names.push(TRANSPORT_SHARE_DAY + date);
        });
        return names;
    }
    function owes(name) {
        if (blocked[name] || stuck[name]) return false;
        const mine = localText(name);
        if (mine === null) return false;
        const meta = readMeta(name);
        return meta ? mine !== meta.base : !isEmptyText(name, mine);
    }
    function firstOwed() {
        const names = localNames();
        for (let i = 0; i < names.length; i += 1) if (owes(names[i])) return names[i];
        return null;
    }
    // What goes up: owed, AND on the disk. A copy that only memory holds (the disk
    // refused it, and the screen says «השינוי לא נשמר במכשיר») is not this phone's to
    // publish - the answer to it, or its echo, would be recorded as a revision of a plan
    // the disk does not have (stored, above). It waits for a write that lands: the
    // person's next change (the hook asks again) or another window's (diskChanged).
    function firstToSend() {
        const names = localNames();
        for (let i = 0; i < names.length; i += 1) if (owes(names[i]) && onDisk(names[i])) return names[i];
        return null;
    }

    // ------------------------------------------------------------------ sending
    function schedule(ms) {
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, ms === undefined ? api.flushDelayMs : ms);
    }

    // PROGRESS IS THE RECORD MOVING. A write is answered at once with the next one only
    // when this phone's record of the document has moved past the revision the write was
    // built on - landed, or a newer plan taken. Anything else goes through the ladder
    // (retryLater). This used to count any answer to a conflict as progress, including
    // one that recorded nothing: a disk that refuses the record (full, or refusing only
    // that key) left the record where it was, the same document owed on the same old
    // revision, and the next write went at once, for ever - measured in the review of
    // v189 (c4) at some 1,400 transactions in two seconds, every one a billable read on
    // the project the record syncs through, for as long as the app is open. A write that
    // landed and could not be recorded is the same case and goes the same way. (The
    // other ways in at once - a word from the cloud, the signal back, the screen opened -
    // each wait for something outside this file, and none of them is answered by itself.)
    function moved(name, base) {
        const now = readMeta(name);
        return Boolean(now) && now.rev > base;
    }

    // One document at a time, and never before the cloud has been HEARD: a phone that has
    // not been told what is there must not be the one to say what is there.
    function flush() {
        clearTimeout(flushTimer);
        flushTimer = null;
        if (!active() || !adapter || !heard || stale || sending) return;
        const name = firstToSend();
        if (!name) { draw(); return; }
        const meta = readMeta(name);
        const base = meta ? meta.rev : 0;
        const value = localText(name);
        const sent = { rev: base + 1, text: value };
        writeMeta(name, meta ? { rev: meta.rev, base: meta.base, sent } : { rev: 0, base: null, sent });
        let who = null;
        try { who = Store.get('farkad:deviceId'); } catch (error) { who = null; }
        const doc = Object.assign(JSON.parse(value), {
            v: 1, revision: base + 1, updatedAt: new Date().toISOString(),
            updatedBy: typeof who === 'string' && who ? who.slice(0, 100) : 'unknown'
        });
        sending = name;
        const using = adapter;
        let request = null;
        try { request = Promise.resolve(using.write(name, base, doc)); } catch (error) { request = Promise.reject(error); }
        request.then(() => {
            const now = readMeta(name);
            if (!now || now.rev < base + 1) writeMeta(name, { rev: base + 1, base: value });
            refused = false;
            return moved(name, base);
        }, error => {
            const code = error && error.code;
            if (code === 'conflict' && error.document) {
                // Refused because the document moved, and handed the one that won.
                // Acted on at once only if taking it moved the record (moved, above):
                // a document this build cannot read, one that is not newer than what it
                // has, a plan the disk would not take, a record the disk would not take -
                // the ladder below asks again later.
                take(name, error.document);
                redraw();
                return moved(name, base);
            }
            if (code === 'permission-denied') refused = true;
            return false;
        }).then(more => {
            // An answer to a connection that is gone (signed out, or signed in again):
            // whatever is on its way now is the new connection's, and not this one's to end.
            if (using !== adapter) return;
            sending = null;
            if (more) { retryStep = 0; schedule(0); }
            else retryLater();
            draw();
        });
        draw();
    }

    function retryLater() {
        clearTimeout(retryTimer);
        const wait = Math.min(api.retryMaxMs, api.retryMs * Math.pow(2, Math.min(retryStep, 10)));
        retryStep += 1;
        retryTimer = setTimeout(flush, wait);
    }

    // ------------------------------------------------------------------ listening
    function listen() {
        stopNow();
        if (!active() || !adapter) return;
        listenerDead = false;
        const using = adapter;
        const from = TRANSPORT_SHARE_DAY + addDays(todayStr(), -TRANSPORT_KEEP_DAYS);
        try {
            stopListening = using.subscribe(from, (docs, info) => {
                if (using !== adapter || !active()) return;
                if (!info || info.live !== true) {
                    // The SDK's cache speaking: from before the signal went, and it says
                    // nothing about now. NOT BELIEVED AT ONCE - a listener that has
                    // something cached says it first and the server's answer a moment
                    // later, and «אין חיבור» flashed on a phone with four bars is a lie
                    // for that moment. If no live answer follows, then it is said.
                    if (!staleTimer && !stale) {
                        staleTimer = setTimeout(() => {
                            staleTimer = null;
                            if (using !== adapter) return;
                            stale = true;
                            draw();
                        }, api.staleGraceMs);
                    }
                    return;
                }
                clearTimeout(staleTimer);
                staleTimer = null;
                relistenStep = 0;
                stale = false;
                listenerDead = false;
                refused = false;
                // The list of vehicles first: a day is drawn against it.
                const list = (Array.isArray(docs) ? docs : []).filter(one => one && isName(one.name))
                    .sort((a, b) => (a.name === TRANSPORT_SHARE_SETTINGS ? -1 : b.name === TRANSPORT_SHARE_SETTINGS ? 1
                        : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
                let changed = false;
                list.forEach(one => {
                    let did = 'ignored';
                    try { did = take(one.name, one.data); } catch (error) { did = 'ignored'; }
                    if (did === 'adopted' || did === 'aside' || did === 'stuck') changed = true;
                });
                heard = true;
                if (changed) redraw();
                else draw();
                schedule(0);
            }, error => {
                if (using !== adapter) return;
                listenerDead = true;
                heard = false;
                refused = Boolean(error && error.code === 'permission-denied');
                stopNow();
                clearTimeout(relistenTimer);
                // Asked again on a ladder: half a minute, then doubling, never slower than
                // retryMaxMs. Rules that are not published yet are not published in the
                // next half minute either, and a phone left open must not ask all night.
                relistenTimer = setTimeout(listen, Math.min(api.retryMaxMs, api.retryMs * 6 * Math.pow(2, Math.min(relistenStep, 10))));
                relistenStep += 1;
                draw();
            });
        } catch (error) {
            listenerDead = true;
            stopListening = null;
        }
    }
    function stopNow() {
        const stop = stopListening;
        stopListening = null;
        if (typeof stop === 'function') { try { stop(); } catch (error) { /* it is gone either way */ } }
    }

    // ------------------------------------------------------------------ what the screen says
    //
    // 'off'        nothing is said: the gate is shut, the switch is off, or this phone has
    //              no cloud and never shared a plan - the screen of today
    // 'notShared'  the cloud refuses these documents
    // 'noRoom'     a copy could not be put aside, or the disk would not take the plan,
    //              so the shared plan was not drawn (one sentence for both, written for
    //              the first: its «לשמור בצד» is not what failed in the second)
    // 'waiting'    something on this phone is not in the cloud yet
    // 'unchecked'  nothing heard, or heard from before the signal went
    // 'checking'   connected, the first answer has not come
    // 'shared'     heard, and nothing owed
    function state() {
        if (!active()) return 'off';
        if (!adapter) return everShared() ? 'unchecked' : 'off';
        if (refused) return 'notShared';
        if (Object.keys(stuck).length > 0) return 'noRoom';
        if (firstOwed()) return 'waiting';
        if (Object.keys(blocked).length > 0) return 'unchecked';
        if (stale || listenerDead) return 'unchecked';
        if (!heard) return 'checking';
        return 'shared';
    }
    function everShared() {
        return Store.keys().some(key => key.indexOf(TRANSPORT_SHARED_PREFIX) === 0);
    }
    function stateText(what) {
        const T = TRANSPORT_TEXT;
        return { notShared: T.shareNotShared, noRoom: T.shareNoRoom, waiting: T.shareWaiting,
            unchecked: T.shareUnchecked, checking: T.shareChecking, shared: T.shareShared }[what] || '';
    }

    // The copies aside the open screen is about: the list's, and the day's on the glass.
    function notices(date) {
        const out = [];
        if (!active()) return out;
        [TRANSPORT_SHARE_SETTINGS].concat(isRealDate(date) ? [TRANSPORT_SHARE_DAY + date] : []).forEach(name => {
            const aside = readAside(name);
            if (aside) out.push({ name, why: aside.why });
        });
        return out;
    }
    function noticeText(notice) {
        const T = TRANSPORT_TEXT;
        const list = notice.name === TRANSPORT_SHARE_SETTINGS;
        if (notice.why === 'first') return list ? T.shareFirstList : T.shareFirstDay;
        return list ? T.shareChangedList : T.shareChangedDay;
    }

    // "Use mine": this phone's copy becomes its plan again, which is an ordinary change -
    // it goes up through the same check as any other, against the revision this phone
    // has SEEN. If the document moved again meanwhile, this phone loses again and is told
    // again. Nothing here writes over a revision it was not built on.
    //
    // ON A COPY, as adopt is, and for the same reason: it used to put the copy in memory
    // and then save it, so a disk that refused it left "mine" drawn and SENT over a shared
    // plan the disk still held - and after a reopen the disk's shared plan went up again
    // as this phone's change, reversing "use mine" on every phone with nothing said.
    // Refused now, the shared plan stays drawn, the copy stays aside with its two buttons
    // (asked again, it is tried again), nothing is sent, and the screen says the change
    // was not saved (transportWrite, «השינוי לא נשמר במכשיר»).
    function useMine(name) {
        const aside = readAside(name);
        if (!active() || !aside) return false;
        let mine = null;
        try { mine = JSON.parse(aside.text); } catch (error) { mine = null; }
        if (!isPlainObject(mine)) return false;
        let kept = false;
        if (isName(name)) {
            const next = withShared(name, mine);
            kept = put(localKey(name), next, false);
            if (kept) holdInSession(name, next);
        }
        // The copy aside goes only once the plan it was a copy of is on the disk again.
        if (kept) Store.remove(TRANSPORT_ASIDE_PREFIX + name);
        redraw();
        return kept;
    }
    function keepShared(name) {
        if (!active() || !readAside(name)) return false;
        Store.remove(TRANSPORT_ASIDE_PREFIX + name);
        draw();
        return true;
    }

    // The line and the notices, in a node of their own above the list (index.html,
    // #transportShare): outside the body, which is rebuilt on every change. Rebuilt only
    // when what it says changes, so a button on it keeps the keyboard through a redraw of
    // the cars.
    function draw() {
        if (typeof document === 'undefined' || !document.getElementById) return;
        const host = document.getElementById('transportShare');
        if (!host) return;
        const what = state();
        const date = typeof transportDate === 'undefined' ? null : transportDate;
        const list = what === 'off' ? [] : notices(date);
        const key = what + '|' + list.map(one => one.name + ':' + one.why).join(',');
        if (key === drawn) return;
        drawn = key;
        clear(host);
        host.hidden = what === 'off';
        if (what === 'off') return;
        const T = TRANSPORT_TEXT;
        const line = el('p', 'transport-share-line', stateText(what));
        line.id = 'transportShareLine';
        line.dataset.state = what;
        host.appendChild(line);
        list.forEach(notice => {
            const box = el('div', 'transport-share-notice');
            box.dataset.notice = notice.name;
            box.appendChild(el('p', null, noticeText(notice)));
            const row = el('div', 'transport-row transport-wrap');
            const mine = button(notice.name === TRANSPORT_SHARE_SETTINGS ? T.shareUseMineList : T.shareUseMineDay,
                'btn-secondary', () => {
                    askConfirm({
                        title: notice.name === TRANSPORT_SHARE_SETTINGS ? T.shareUseMineListTitle : T.shareUseMineDayTitle,
                        message: T.shareUseMineLead, ok: T.shareUseMineOk, cancel: T.cancel
                    }).then(yes => { if (yes) useMine(notice.name); });
                });
            mine.dataset.shareMine = notice.name;
            const keep = button(T.shareKeepShared, 'btn-secondary', () => keepShared(notice.name));
            keep.dataset.shareKeep = notice.name;
            row.appendChild(mine);
            row.appendChild(keep);
            box.appendChild(row);
            host.appendChild(box);
        });
    }
    // The cars as well: something on the disk changed under the open screen.
    function redraw() {
        drawn = null;
        if (typeof renderTransportIfOpen === 'function') {
            try { renderTransportIfOpen(); } catch (error) { /* the line below still says it */ }
        }
        // The seder's journey (js/ui/journey.js) reads the rides too - its bar over this
        // screen is redrawn by the line above, but its last look and its strip are drawn
        // with this screen SHUT, and a plan adopted from another phone is news to them.
        if (typeof renderJourneyIfOpen === 'function') {
            try { renderJourneyIfOpen(); } catch (error) { /* the journey draws at its next step */ }
        }
        draw();
    }

    // Share records and copies aside of days the phone no longer keeps.
    function prune() {
        const cutoff = addDays(todayStr(), -TRANSPORT_KEEP_DAYS);
        Store.keys().forEach(key => {
            [TRANSPORT_SHARED_PREFIX, TRANSPORT_ASIDE_PREFIX].forEach(prefix => {
                if (key.indexOf(prefix + TRANSPORT_SHARE_DAY) !== 0) return;
                const date = key.slice(prefix.length + TRANSPORT_SHARE_DAY.length);
                if (isRealDate(date) && date < cutoff) Store.remove(key);
            });
        });
    }

    function reset() {
        clearTimeout(flushTimer);
        clearTimeout(retryTimer);
        clearTimeout(relistenTimer);
        clearTimeout(staleTimer);
        flushTimer = retryTimer = relistenTimer = staleTimer = null;
        stopNow();
        heard = false;
        stale = false;
        listenerDead = false;
        refused = false;
        sending = null;
        retryStep = 0;
        relistenStep = 0;
        Object.keys(blocked).forEach(name => { delete blocked[name]; });
        Object.keys(stuck).forEach(name => { delete stuck[name]; });
    }

    // ------------------------------------------------------------------ the five hooks, and the adapter's two
    return Object.assign(api, {
        // js/sync/firebase-adapter.js, once somebody is signed in: { write, subscribe }.
        connect(transportAdapter) {
            if (!transportShareOn()) return false;
            reset();
            adapter = transportAdapter && typeof transportAdapter.write === 'function'
                && typeof transportAdapter.subscribe === 'function' ? transportAdapter : null;
            if (adapter && !api._watching && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                api._watching = true;
                window.addEventListener('online', () => {
                    retryStep = 0;
                    relistenStep = 0;
                    if (!adapter || !active()) return;
                    if (listenerDead || !stopListening) listen();
                    schedule(0);
                });
            }
            listen();
            draw();
            return Boolean(adapter);
        },
        disconnect() {
            if (!transportShareOn()) return;
            reset();
            adapter = null;
            draw();
        },
        // js/ui/transport.js, after a write of its own reached (or did not reach) the disk.
        changed() {
            if (adopting || !active()) return;
            if (adapter) schedule();
            draw();
        },
        // The switch was turned.
        switched() {
            if (!transportShareOn()) return;
            if (transportEnabled()) { if (adapter) listen(); } else reset();
            drawn = null;
            draw();
        },
        // The screen was opened.
        opened() {
            if (!active()) return;
            prune();
            if (adapter && (listenerDead || !stopListening)) listen();
            if (adapter) schedule(0);
        },
        // The screen was drawn.
        draw() { draw(); },
        // ANOTHER WINDOW of this app, on this phone, wrote a transport key (the browser's
        // `storage` event, which is told to every window but the one that wrote). This
        // window's copy of that day or of the list is now older than the disk - and a
        // change made on top of an old copy would be written over what the other window
        // just adopted, and then SENT, as this phone's change to the winner. So the old
        // copy is dropped and the screen drawn from the disk. Only where sharing is on:
        // with the gate shut two windows behave as they always did.
        diskChanged(key) {
            if (!active() || typeof key !== 'string') return false;
            if (key === TRANSPORT_SETTINGS_KEY) transportSettingsMemory = null;
            else if (key.indexOf(TRANSPORT_DAY_PREFIX) === 0 && key.length === TRANSPORT_DAY_PREFIX.length + 10) {
                delete transportDays[key.slice(TRANSPORT_DAY_PREFIX.length)];
            } else if (key.indexOf(TRANSPORT_SHARED_PREFIX) !== 0 && key.indexOf(TRANSPORT_ASIDE_PREFIX) !== 0) return false;
            // Store answers a read with what THIS window last wrote under a key (its
            // session cache, js/store.js) before it asks the disk; the other window's
            // write is on the disk. Every transport write is optional, and an optional
            // write the disk refused is never left in that cache - so dropping the entry
            // loses nothing and lets the next read see the disk.
            Store.forget(key);
            redraw();
            if (adapter) schedule();
            return true;
        },
        // For the switch's own sentence in ⋯.
        on() { return transportShareOn(); },
        state,
        notices,
        useMine,
        keepShared,
        // For the suites, and for nobody else.
        take(name, data) { return active() ? take(name, data) : 'off'; },
        flush,
        owed() { return active() ? firstOwed() : null; },
        text
    });
}());

// A top-level `const` of a classic script is a binding, not a property of window, and the
// adapter is the one ES module of the app (js/sync/boot.js says the same of FarkadSync).
if (typeof window !== 'undefined') window.FarkadTransportShare = TransportShare;

// The switch's card in ⋯ was built before this file loaded, with the sentence of a build
// that shares nothing. Where the gate is open that sentence is wrong, so it is said again.
// With the gate shut this file does nothing at load but the line above.
if (transportShareOn() && typeof transportRenderSwitch === 'function') {
    try { transportRenderSwitch(); } catch (error) { /* the card says the old sentence */ }
}
if (transportShareOn() && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', event => {
        try { TransportShare.diskChanged(event && event.key); } catch (error) { /* this window keeps its copy */ }
    });
}
