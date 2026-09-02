// A DOM small enough to run js/ui/reports.js in Node, and real enough to READ back.
//
// The harness's document is a set of nulls: every "is anything on screen?" guard takes
// its null branch, which is right for the data layer and useless here. The question this
// suite asks is what the SCREEN says about a number, so the nodes have to hold text,
// children and classes, and querySelectorAll has to descend.
export function makeDom() {
    function node(tag) {
        const self = {
            tagName: String(tag).toUpperCase(),
            nodeName: String(tag).toUpperCase(),
            children: [],
            attributes: {},
            style: {},
            className: '',
            type: '',
            value: '',
            _text: '',
            classList: {
                add(name) { self.className = (self.className + ' ' + name).trim(); },
                remove(name) {
                    self.className = self.className.split(/\s+/).filter(c => c && c !== name).join(' ');
                },
                contains(name) { return self.className.split(/\s+/).indexOf(name) !== -1; },
                toggle(name, on) {
                    if (on) self.classList.add(name); else self.classList.remove(name);
                }
            },
            appendChild(child) { self.children.push(child); child.parentNode = self; return child; },
            insertBefore(child, before) {
                const at = self.children.indexOf(before);
                self.children.splice(at === -1 ? self.children.length : at, 0, child);
                child.parentNode = self;
                return child;
            },
            removeChild(child) {
                const at = self.children.indexOf(child);
                if (at !== -1) self.children.splice(at, 1);
                return child;
            },
            remove() { if (self.parentNode) self.parentNode.removeChild(self); },
            setAttribute(name, value) { self.attributes[name] = String(value); },
            getAttribute(name) {
                return Object.prototype.hasOwnProperty.call(self.attributes, name)
                    ? self.attributes[name] : null;
            },
            addEventListener() {},
            removeEventListener() {},
            focus() {},
            querySelector(selector) { return self.querySelectorAll(selector)[0] || null; },
            querySelectorAll(selector) {
                const steps = String(selector).trim().split(/\s+/);
                let pool = descendants(self);
                steps.forEach((step, index) => {
                    const matched = pool.filter(item => matches(item, step));
                    pool = index === steps.length - 1
                        ? matched
                        : matched.reduce((all, item) => all.concat(descendants(item)), []);
                });
                return pool;
            }
        };

        Object.defineProperty(self, 'firstChild', { get: () => self.children[0] || null });
        Object.defineProperty(self, 'lastElementChild',
            { get: () => self.children[self.children.length - 1] || null });
        Object.defineProperty(self, 'childNodes', { get: () => self.children });
        Object.defineProperty(self, 'textContent', {
            get() {
                if (self.children.length === 0) return self._text;
                return self._text + self.children.map(child => child.textContent).join('');
            },
            set(value) {
                self.children.length = 0;
                self._text = value === null || value === undefined ? '' : String(value);
            }
        });
        return self;
    }

    function descendants(root) {
        const out = [];
        root.children.forEach(child => { out.push(child); descendants(child).forEach(g => out.push(g)); });
        return out;
    }

    function matches(item, step) {
        if (step.startsWith('.')) return item.classList.contains(step.slice(1));
        if (step.startsWith('#')) return item.attributes.id === step.slice(1);
        return item.tagName === step.toUpperCase();
    }

    const body = node('body');
    const head = node('head');
    const byId = {};
    return {
        body,
        head,
        createElement: node,
        getElementById: id => byId[id] || null,
        // A modal the app writes into. Registered on demand so openWorkerDays can run.
        register(id) {
            const made = node('div');
            made.attributes.id = id;
            byId[id] = made;
            return made;
        },
        querySelector: selector => body.querySelector(selector),
        querySelectorAll: selector => body.querySelectorAll(selector),
        addEventListener() {},
        removeEventListener() {}
    };
}

// Every row of a report table, as the text a person sees.
export function tableText(section) {
    const table = section.querySelectorAll('TABLE')[0];
    if (!table) return null;
    const rowsIn = tag => table.querySelectorAll(tag + ' TR').map(tr =>
        tr.children.map(cell => cell.textContent));
    return { head: rowsIn('THEAD'), body: rowsIn('TBODY'), foot: rowsIn('TFOOT') };
}
