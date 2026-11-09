// v169: ONE FAMILY OF GLYPHS ON THE BUTTONS.
//
// The buttons carried their pictures as emoji typed into their labels - 💬 🖨️ 🖼️ 📊 🔄 💾 📂
// ↩️ ☁️ 📋 ↕ 🧹 ↧ 🚀 👷 📅 🏗️ - beside tab icons that are drawn strokes. An emoji is drawn by
// the phone, not by this app: the same button is one picture on an iPhone and another on a
// Galaxy, both in colours nobody here chose, and on a dark screen in the sun a full-colour
// printer next to a monochrome calendar reads as two apps glued together.
//
// WHAT THIS DOES NOT DO, and it is most of the design. It does not change one label. Every
// one of those strings is a product decision and many are pinned word for word by the
// suites (law 6), and dozens of call sites build them. So the label stays exactly as it was
// written: the emoji is still the first thing in the button's text, wrapped in a span the
// stylesheet takes off the glass, and the drawn glyph stands beside it. `textContent` reads
// what it always read, and so does the button's ACCESSIBLE NAME: the span is clipped to a
// pixel, not display:none and not aria-hidden, because either of those takes the emoji out
// of the name - and «↕ סדר מחדש» is what a screen reader has always announced and what the
// suites find the button by (measured: with aria-hidden the reorder button stopped
// answering to its own name). Nothing about how the app is heard changes; only what is
// drawn. And if css/design.css never arrives the emoji is simply visible again - the
// button is never left with no picture and no word.
//
// WHY AN OBSERVER and not a call from each place a button is made: buttons are born in
// forty places, some are in index.html, and several are RELABELLED later by assigning
// textContent (the copy-a-day button names a different day on every render). A call site
// that was missed would be a button that kept its emoji, and a relabel would silently take
// the glyph off again. Watching the document is one mechanism with no call site to forget.
// It only ever looks at buttons and <summary> rows (and one handset on the crew page), and
// only at their FIRST text node:
//
//   - never at a textarea, an input, or any other element, so the WhatsApp message and the
//     seder's messages - which are what a person is about to SEND, emoji included - are
//     shown exactly as they will arrive;
//   - never at a name: a worker or a site whose name starts with one of these characters
//     is typed into a span inside the button, not into the button's own first text node,
//     and this file does not descend.
//
// Its own edits re-enter the observer once, find a first text node that no longer starts
// with an emoji, and stop. Nothing here reads or writes the record, the store or the cloud.
const FarkadIcons = (function () {
    const NS = 'http://www.w3.org/2000/svg';

    // 24x24, stroke 1.9, round caps - the tab bar's own hand. `fill` marks the one glyph
    // that is a silhouette (WhatsApp's mark is not a line drawing and is not ours to redraw).
    const GLYPHS = {
        whatsapp: { fill: true, d: ['M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zM8.8 7.9c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.400s1 2.800 1.200 3c.1.2 2 3.200 5 4.400 2.500 1 3 .8 3.500.7.5 0 1.700-.7 2-1.400.2-.7.2-1.300.1-1.400-.1-.1-.3-.2-.6-.4l-2-1c-.3-.1-.5-.1-.7.2l-.9 1.100c-.2.2-.3.2-.6.1-.3-.2-1.200-.5-2.300-1.500-.9-.8-1.400-1.700-1.600-2-.2-.3 0-.5.1-.6l.5-.5.3-.5v-.5l-.9-2.200c-.2-.5-.5-.5-.7-.5h-.7z'] },
        print: { d: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'] },
        image: { d: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'm21 15-5-5L5 21'] },
        chart: { d: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'] },
        refresh: { d: ['M21 12a9 9 0 0 1-15.5 6.2L3 16', 'M3 12a9 9 0 0 1 15.5-6.2L21 8', 'M21 3v5h-5', 'M3 21v-5h5'] },
        save: { d: ['M12 3v12', 'm8 11 4 4 4-4', 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'] },
        folder: { d: ['M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'] },
        back: { d: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'] },
        cloud: { d: ['M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 7 19z'] },
        paste: { d: ['M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M9 4V3h6v1', 'M9 10h6', 'M9 14h6'] },
        sort: { d: ['M8 4v16', 'm5 17 3 3 3-3', 'M16 20V4', 'm13 7 3-3 3 3'] },
        sweep: { d: ['m14 4 6 6', 'M4 20l6-6', 'm7 11 6 6-3 3H4v-6z'] },
        copy: { d: ['M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'] },
        bolt: { d: ['M13 2 4 14h7l-1 8 9-12h-7z'] },
        people: { d: ['M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 5a3.5 3.5 0 0 1 0 6.5', 'M18 14.5a6 6 0 0 1 3.5 5.5'] },
        calendar: { d: ['M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z', 'M3 10h18', 'M8 3v4', 'M16 3v4'] },
        site: { d: ['M4 21V8l8-5 8 5v13', 'M9 21v-6h6v6'] },
        phone: { d: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2'] }
    };

    // The emoji as the labels spell them, with and without the variation selector some
    // keyboards add. Longest first, so 🖨️ is not read as 🖨 with a stray selector left over.
    const MARKS = [
        ['💬', 'whatsapp'], ['🖨️', 'print'], ['🖨', 'print'], ['🖼️', 'image'], ['🖼', 'image'],
        ['📊', 'chart'], ['🔄', 'refresh'], ['💾', 'save'], ['📂', 'folder'],
        ['↩️', 'back'], ['☁️', 'cloud'], ['☁', 'cloud'], ['📋', 'paste'],
        ['↕', 'sort'], ['🧹', 'sweep'], ['↧', 'copy'], ['🚀', 'bolt'], ['👷', 'people'],
        ['📅', 'calendar'], ['🏗️', 'site'], ['🏗', 'site'], ['📞', 'phone']
    ];

    // What is looked at: buttons, <summary> rows, and the one label that is neither - the
    // handset in front of a man's number on the crew page (js/ui/roster.js).
    const DRESSED = 'button, summary, .roster-meta > span';

    function glyph(name) {
        const spec = GLYPHS[name];
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        // Sized in attributes as well as in the stylesheet: an SVG with no size is 300x150,
        // and this must stay a small picture on the day the stylesheet does not load.
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('class', 'btn-ico');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('fill', spec.fill ? 'currentColor' : 'none');
        if (!spec.fill) {
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '1.9');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
        }
        spec.d.forEach(d => {
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        });
        return svg;
    }

    function dress(node) {
        const first = node.firstChild;
        // A text node and nothing else: an element first means this button was already
        // dressed, or was built from parts that are not this file's to rearrange.
        if (!first || first.nodeType !== 3) return;
        const text = first.nodeValue;
        for (let i = 0; i < MARKS.length; i++) {
            const mark = MARKS[i][0];
            if (text.lastIndexOf(mark, 0) !== 0) continue;
            const kept = document.createElement('span');
            kept.className = 'btn-emoji';
            kept.textContent = mark;
            // The rest of the label, untouched - its leading space included, so the
            // button's textContent is character for character what the call site wrote.
            first.nodeValue = text.slice(mark.length);
            node.insertBefore(glyph(MARKS[i][1]), first);
            node.insertBefore(kept, node.firstChild);
            node.classList.add('has-ico');
            return;
        }
    }

    function sweep(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.matches && root.matches(DRESSED)) dress(root);
        if (!root.querySelectorAll) return;
        const found = root.querySelectorAll(DRESSED);
        for (let i = 0; i < found.length; i++) dress(found[i]);
    }

    function start() {
        if (typeof document === 'undefined' || !document.body) return;
        sweep(document.body);
        if (typeof MutationObserver !== 'function') return;
        new MutationObserver(records => {
            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                // A relabel (textContent = '…') arrives as childList on the button itself,
                // and an edit of its text node as characterData under it. Only the button
                // is looked at then - never the whole subtree of whatever changed, or a
                // list rebuilt row by row would be re-read once per row.
                const owner = record.target.nodeType === 1 ? record.target : record.target.parentNode;
                if (owner && owner.matches && owner.matches(DRESSED)) dress(owner);
                for (let j = 0; j < record.addedNodes.length; j++) sweep(record.addedNodes[j]);
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    return { start, sweep, glyph };
})();

FarkadIcons.start();
