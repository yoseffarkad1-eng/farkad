// A small PDF reader, for looking at what actually came out of the printer.
//
// The print tests could stop at "the modal's computed display is none", and that is the
// assertion that has been quietly wrong before: it is a claim about a stylesheet, not
// about a page. What lands on paper is decided by pagination, by the page box, by which
// glyphs the renderer put where - and the only artefact that holds all of that is the PDF
// itself. So the suite prints one, opens it, and reads it.
//
// This is not a general PDF library. It reads the subset Chromium emits: object bodies
// found by scanning, FlateDecode content streams, embedded subset fonts with a ToUnicode
// CMap, and the handful of operators a printed page uses. That is enough to answer the
// questions worth asking - what text is on page three, is any page blank, is anything
// painted grey across the whole sheet, does the table run off the edge - and small enough
// to be read by whoever has to trust it.

import zlib from 'node:zlib';

// ---------------------------------------------------------------- objects

// Every `N 0 obj ... endobj` in the file, by object number. Chromium writes a plain
// uncompressed xref table, but scanning is simpler and does not care which.
function readObjects(buffer) {
    const text = buffer.toString('latin1');
    const objects = new Map();
    const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const number = Number(match[1]);
        const start = match.index + match[0].length;
        const end = text.indexOf('endobj', start);
        if (end < 0) continue;
        objects.set(number, { start, end, body: text.slice(start, end) });
    }
    return { text, objects };
}

// The bytes of an object's stream, inflated when it says it is deflated.
function streamOf(buffer, text, entry) {
    const at = text.indexOf('stream', entry.start);
    if (at < 0 || at > entry.end) return null;

    let start = at + 'stream'.length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;

    const end = text.indexOf('endstream', start);
    if (end < 0) return null;

    const raw = buffer.subarray(start, end);
    if (!/\/FlateDecode/.test(entry.body)) return raw;
    try {
        return zlib.inflateSync(raw);
    } catch (error) {
        return null;
    }
}

function refIn(body, key) {
    const match = new RegExp(`${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(body);
    return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------- fonts
//
// A subset font maps its own byte codes to glyphs, and only the ToUnicode CMap says what
// those glyphs are. Without it a page of Hebrew reads as a page of random bytes - which
// is exactly how a text check can pass while showing nothing.

function parseToUnicode(source) {
    const map = new Map();
    if (!source) return map;


    const hexToString = hex => {
        let out = '';
        for (let i = 0; i + 3 < hex.length + 1; i += 4) {
            out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
        }
        return out;
    };

    const chars = /beginbfchar([\s\S]*?)endbfchar/g;
    let block;
    while ((block = chars.exec(source)) !== null) {
        const pair = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
        let entry;
        while ((entry = pair.exec(block[1])) !== null) {
            map.set(parseInt(entry[1], 16), hexToString(entry[2]));
        }
    }

    const ranges = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((block = ranges.exec(source)) !== null) {
        const triple = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
        let entry;
        while ((entry = triple.exec(block[1])) !== null) {
            const from = parseInt(entry[1], 16);
            const to = parseInt(entry[2], 16);
            const first = parseInt(entry[3], 16);
            for (let code = from; code <= to && code - from < 65536; code += 1) {
                map.set(code, String.fromCharCode(first + (code - from)));
            }
        }
    }
    return map;
}

// ---------------------------------------------------------------- matrices

const multiply = (a, b) => [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5]
];

const applyTo = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

// ---------------------------------------------------------------- content streams

// The operators a printed page uses, and nothing else: the graphics stack, the text
// object, the two string-showing operators, and rectangle fills - which is how a
// full-page background arrives.
function readContent(content, fonts) {
    const texts = [];
    const fills = [];

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let fill = [0, 0, 0];
    let font = null;
    let textMatrix = [1, 0, 0, 1, 0, 0];
    let lineMatrix = [1, 0, 0, 1, 0, 0];
    let pendingRect = null;

    // The operand stack, in the order PostScript-style content puts them: operands first,
    // operator last.
    const tokens = content.toString('latin1')
        .match(/<[0-9a-fA-F\s]*>|\((?:\\.|[^\\)])*\)|\[|\]|\/[^\s/<>[\]()]+|[-+]?[\d.]+|[A-Za-z'"*]+/g) || [];

    let operands = [];
    const num = at => Number(operands[operands.length - at]) || 0;

    // A composite font addresses its glyphs with TWO bytes, not one. Decoding those a
    // byte at a time is how a page of Hebrew reads back as a row of quotation marks -
    // which looks enough like text to pass a careless check.
    const decode = raw => {
        if (!font) return raw;
        const width = font.bytes;
        const map = font.map;
        let out = '';

        const codes = [];
        if (raw.startsWith('<')) {
            const hex = raw.slice(1, -1).replace(/\s+/g, '');
            const step = width * 2;
            for (let i = 0; i + step <= hex.length; i += step) {
                codes.push(parseInt(hex.slice(i, i + step), 16));
            }
        } else {
            const body = raw.slice(1, -1).replace(/\\([nrtbf()\\])/g, '$1');
            for (let i = 0; i + width <= body.length; i += width) {
                codes.push(width === 2
                    ? (body.charCodeAt(i) << 8) + body.charCodeAt(i + 1)
                    : body.charCodeAt(i));
            }
        }

        codes.forEach(code => { out += map.has(code) ? map.get(code) : ''; });
        return out;
    };

    const show = raw => {
        const text = decode(raw);
        if (!text) return;
        const where = applyTo(multiply(textMatrix, ctm), 0, 0);
        texts.push({ text, x: where.x, y: where.y });
    };

    tokens.forEach(token => {
        switch (token) {
            case 'q': stack.push({ ctm, fill }); break;
            case 'Q': {
                const held = stack.pop();
                if (held) { ctm = held.ctm; fill = held.fill; }
                break;
            }
            case 'cm':
                ctm = multiply([num(6), num(5), num(4), num(3), num(2), num(1)], ctm);
                break;
            case 're':
                pendingRect = { x: num(4), y: num(3), w: num(2), h: num(1) };
                break;
            case 'rg': fill = [num(3), num(2), num(1)]; break;
            case 'g': fill = [num(1), num(1), num(1)]; break;
            case 'f':
            case 'f*':
            case 'F': {
                if (pendingRect) {
                    const a = applyTo(ctm, pendingRect.x, pendingRect.y);
                    const b = applyTo(ctm, pendingRect.x + pendingRect.w, pendingRect.y + pendingRect.h);
                    fills.push({
                        x: Math.min(a.x, b.x),
                        y: Math.min(a.y, b.y),
                        w: Math.abs(b.x - a.x),
                        h: Math.abs(b.y - a.y),
                        color: fill.slice()
                    });
                    pendingRect = null;
                }
                break;
            }
            case 'BT':
                textMatrix = [1, 0, 0, 1, 0, 0];
                lineMatrix = textMatrix;
                break;
            case 'Tf': {
                const name = operands.filter(item => String(item).startsWith('/')).pop();
                font = fonts.get(String(name).slice(1)) || null;
                break;
            }
            case 'Tm':
                textMatrix = [num(6), num(5), num(4), num(3), num(2), num(1)];
                lineMatrix = textMatrix;
                break;
            case 'Td':
                lineMatrix = multiply([1, 0, 0, 1, num(2), num(1)], lineMatrix);
                textMatrix = lineMatrix;
                break;
            case 'TD':
                lineMatrix = multiply([1, 0, 0, 1, num(2), num(1)], lineMatrix);
                textMatrix = lineMatrix;
                break;
            case 'T*':
                lineMatrix = multiply([1, 0, 0, 1, 0, -12], lineMatrix);
                textMatrix = lineMatrix;
                break;
            case 'Tj':
            case "'":
            case '"': {
                const raw = operands.filter(item =>
                    String(item).startsWith('(') || String(item).startsWith('<')).pop();
                if (raw) show(raw);
                break;
            }
            case 'TJ': {
                operands.filter(item =>
                    String(item).startsWith('(') || String(item).startsWith('<'))
                    .forEach(show);
                break;
            }
            default: break;
        }

        // Operands accumulate; an operator consumes them. Anything that is not a bare
        // token is an operand.
        if (/^[-+]?[\d.]+$/.test(token) || token.startsWith('/') || token.startsWith('(')
            || token.startsWith('<') || token === '[' || token === ']') {
            operands.push(token);
        } else {
            operands = [];
        }
    });

    return { texts, fills };
}

// ---------------------------------------------------------------- the file

export function readPdf(buffer) {
    const { text, objects } = readObjects(buffer);

    // Pages, in document order. /Type /Page is enough: Chromium writes one object per
    // page and the kids array is in order.
    const pageNumbers = [];
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(text);
    if (kids) {
        const refs = kids[1].match(/(\d+)\s+\d+\s+R/g) || [];
        refs.forEach(ref => pageNumbers.push(Number(/(\d+)/.exec(ref)[1])));
    }
    if (pageNumbers.length === 0) {
        objects.forEach((entry, number) => {
            if (/\/Type\s*\/Page\b/.test(entry.body)) pageNumbers.push(number);
        });
        pageNumbers.sort((a, b) => a - b);
    }

    const pages = pageNumbers.map((number, index) => {
        const entry = objects.get(number);
        if (!entry) return { index, width: 0, height: 0, texts: [], fills: [] };

        const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(entry.body);
        const width = box ? Number(box[3]) : 0;
        const height = box ? Number(box[4]) : 0;

        // The fonts this page can use, each with its ToUnicode map.
        const fonts = new Map();
        const fontBlock = /\/Font\s*<<([^>]*)>>/.exec(entry.body);
        if (fontBlock) {
            const named = fontBlock[1].match(/\/(\w+)\s+(\d+)\s+\d+\s+R/g) || [];
            named.forEach(item => {
                const parsed = /\/(\w+)\s+(\d+)/.exec(item);
                const fontEntry = objects.get(Number(parsed[2]));
                if (!fontEntry) return;

                // A Type0 font points at a descendant; the ToUnicode is on the parent.
                let toUnicode = refIn(fontEntry.body, '/ToUnicode');
                if (toUnicode === null) {
                    const descendant = /\/DescendantFonts\s*\[\s*(\d+)/.exec(fontEntry.body);
                    if (descendant) {
                        const child = objects.get(Number(descendant[1]));
                        if (child) toUnicode = refIn(child.body, '/ToUnicode');
                    }
                }
                const cmapEntry = toUnicode === null ? null : objects.get(toUnicode);
                const cmap = cmapEntry ? streamOf(buffer, text, cmapEntry) : null;
                fonts.set(parsed[1], {
                    map: parseToUnicode(cmap ? cmap.toString('latin1') : ''),
                    bytes: /\/Subtype\s*\/Type0\b/.test(fontEntry.body) ? 2 : 1
                });
            });
        }

        const contentRef = refIn(entry.body, '/Contents');
        const contentEntry = contentRef === null ? null : objects.get(contentRef);
        const content = contentEntry ? streamOf(buffer, text, contentEntry) : null;
        const read = content ? readContent(content, fonts) : { texts: [], fills: [] };

        return { index, width, height, texts: read.texts, fills: read.fills };
    });

    return { pages };
}

// Everything one page says, as one string.
export function pageText(page) {
    return page.texts.map(item => item.text).join('');
}

// A fill that covers most of the sheet in something that is not white. The grey page.
export function heavyFills(page) {
    const area = page.width * page.height;
    if (!area) return [];
    return page.fills.filter(fill => {
        const covers = (fill.w * fill.h) / area;
        const white = fill.color.every(channel => channel >= 0.98);
        return covers > 0.5 && !white;
    });
}
