"""A PDF content-stream lexer and unit splitter.

The three water sheets are made by DELETING content from the original sheet,
never by redrawing it: every wall, every label and every pipe keeps the exact
geometry the engineer drew.  To delete safely we must know where each painted
thing starts and ends in the byte stream, and what colour it was painted with.
"""
import re

WS = b"\x00\t\n\x0c\r "
DELIM = b"()<>[]{}/%"

def lex(data):
    """Yield (kind, value, start, end).  kind in num/name/str/hexstr/arr/dict/op."""
    i, n = 0, len(data)
    while i < n:
        c = data[i:i+1]
        if c in WS:
            i += 1; continue
        if c == b"%":
            j = data.find(b"\n", i)
            i = n if j < 0 else j+1
            continue
        start = i
        if c == b"/":
            i += 1
            while i < n and data[i:i+1] not in WS and data[i:i+1] not in DELIM:
                i += 1
            yield ("name", data[start:i], start, i); continue
        if c == b"(":
            depth, i = 0, i
            while i < n:
                ch = data[i:i+1]
                if ch == b"\\": i += 2; continue
                if ch == b"(": depth += 1
                elif ch == b")":
                    depth -= 1
                    if depth == 0: i += 1; break
                i += 1
            yield ("str", data[start:i], start, i); continue
        if c == b"<" and data[i+1:i+2] == b"<":
            depth, i = 0, i
            while i < n:
                if data[i:i+2] == b"<<": depth += 1; i += 2; continue
                if data[i:i+2] == b">>":
                    depth -= 1; i += 2
                    if depth == 0: break
                    continue
                if data[i:i+1] == b"(":
                    d2 = 0
                    while i < n:
                        ch = data[i:i+1]
                        if ch == b"\\": i += 2; continue
                        if ch == b"(": d2 += 1
                        elif ch == b")":
                            d2 -= 1
                            if d2 == 0: i += 1; break
                        i += 1
                    continue
                i += 1
            yield ("dict", data[start:i], start, i); continue
        if c == b"<":
            j = data.find(b">", i)
            i = n if j < 0 else j+1
            yield ("hexstr", data[start:i], start, i); continue
        if c == b"[":
            depth, i = 0, i
            while i < n:
                ch = data[i:i+1]
                if ch == b"(":
                    d2 = 0
                    while i < n:
                        c2 = data[i:i+1]
                        if c2 == b"\\": i += 2; continue
                        if c2 == b"(": d2 += 1
                        elif c2 == b")":
                            d2 -= 1
                            if d2 == 0: i += 1; break
                        i += 1
                    continue
                if ch == b"[": depth += 1
                elif ch == b"]":
                    depth -= 1
                    if depth == 0: i += 1; break
                i += 1
            yield ("arr", data[start:i], start, i); continue
        if c in b"]>})":     # stray delimiter, skip
            i += 1; continue
        # number or operator
        while i < n and data[i:i+1] not in WS and data[i:i+1] not in DELIM:
            i += 1
        tok = data[start:i]
        if re.fullmatch(rb"[+-]?(\d+\.?\d*|\.\d+)", tok):
            yield ("num", tok, start, i)
        else:
            yield ("op", tok, start, i)

PATH_OPS = {b"m", b"l", b"c", b"v", b"y", b"h", b"re"}
PAINT_OPS = {b"S", b"s", b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"n"}
CLIP_OPS = {b"W", b"W*"}


def mat_mul(a, b):
    return (a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
            a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
            a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5])


def apply(m, x, y):
    return (m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5])
