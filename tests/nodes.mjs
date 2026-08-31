// Enough DOM to run the app's real render functions and read what they built.
//
// Not a browser: the browser suites measure pixels, and what is asked through this is
// whether a column, a tray, a row or a control exists at all - a question about the nodes
// a production function appends, and one worth asking of the production function rather
// than of a paraphrase of it.
//
// It lived inside tests/vehicles.test.mjs, which is where it was needed first. A second
// suite needing it is the moment a copy would have been made, and two copies of a DOM
// stub drift in exactly the way that makes one suite pass a check the other fails.

export function makeNode(tag) {
    const kids = [];
    const node = {
        tagName: String(tag).toUpperCase(), childNodes: kids, attrs: {}, style: {},
        className: '', type: '', value: '', href: '', download: '', onerror: null,
        parentNode: null, listeners: {}, _text: '',
        get firstChild() { return kids[0] || null; },
        appendChild(child) { child.parentNode = node; kids.push(child); return child; },
        // A form that opens BESIDE the row it belongs to, rather than at the end of the
        // list. A stub without it does not fail a check - it throws, from inside the
        // production function, which reads as the app being broken.
        insertBefore(child, before) {
            const at = before === null || before === undefined ? -1 : kids.indexOf(before);
            child.parentNode = node;
            if (at < 0) kids.push(child); else kids.splice(at, 0, child);
            return child;
        },
        removeChild(child) {
            const at = kids.indexOf(child);
            if (at >= 0) kids.splice(at, 1);
            child.parentNode = null;
            return child;
        },
        setAttribute(key, value) { node.attrs[key] = String(value); },
        getAttribute(key) { return node.attrs[key] === undefined ? null : node.attrs[key]; },
        addEventListener(name, fn) { (node.listeners[name] = node.listeners[name] || []).push(fn); },
        removeEventListener() {}, focus() {}, click() {},
        // A retired list hides its panel by finding it FROM the list - not by an id in
        // the shell - so a stub answering null would let that check pass without the
        // panel ever having been reached.
        closest(selector) {
            const want = String(selector).replace(/^\./, '');
            for (let up = node.parentNode; up; up = up.parentNode) {
                if (String(up.className).split(/\s+/).indexOf(want) >= 0) return up;
            }
            return null;
        },
        querySelectorAll(selector) {
            const want = String(selector).trim();
            const hit = item => (want.charAt(0) === '.'
                ? String(item.className).split(/\s+/).indexOf(want.slice(1)) >= 0
                : item.tagName === want.toUpperCase());
            const out = [];
            const walk = item => item.childNodes.forEach(child => {
                if (hit(child)) out.push(child);
                walk(child);
            });
            walk(node);
            return out;
        },
        querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
        get textContent() {
            return kids.length ? kids.map(child => child.textContent).join(' ') : node._text;
        },
        set textContent(value) {
            kids.length = 0;
            node._text = value === null || value === undefined ? '' : String(value);
        },
        get classList() {
            const of = () => new Set(String(node.className).split(/\s+/).filter(Boolean));
            return {
                add(...names) { const set = of(); names.forEach(n => set.add(n)); node.className = [...set].join(' '); },
                remove(...names) { const set = of(); names.forEach(n => set.delete(n)); node.className = [...set].join(' '); },
                toggle(name, on) { if (on) this.add(name); else this.remove(name); },
                contains(name) { return of().has(name); }
            };
        }
    };
    return node;
}
