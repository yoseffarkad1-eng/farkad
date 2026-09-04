"""Split a content stream into painted units, each with colour, dash and bbox.

A "unit" is one thing that leaves a mark: a painted path, or one glyph run.
Everything else (clips, marked content, form invocations) is left untouched so
that deleting a unit can never change how the rest of the sheet is drawn.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from cslex import lex, PATH_OPS, PAINT_OPS, mat_mul, apply

SHOW_OPS = {b"Tj", b"TJ", b"'", b'"'}


def hexc(rgb):
    if rgb is None:
        return None
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(v * 255)))) for v in rgb)


def gray(v):      return (v, v, v)
def cmyk(c, m, y, k):
    return ((1-c)*(1-k), (1-m)*(1-k), (1-y)*(1-k))


class Unit:
    __slots__ = ("kind", "stroke", "fill", "dash", "lw", "bbox", "paint_at",
                 "paint_op", "spans", "start", "end", "pts")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


def parse(data):
    """Return (units, tokens). Coordinates are in the stream's own user space."""
    toks = list(lex(data))
    units = []
    ctm = (1, 0, 0, 1, 0, 0)
    stroke, fill = (0, 0, 0), (0, 0, 0)
    dash, lw = None, 1.0
    stack = []
    operands = []            # (kind, value, start, end)
    pts = []                 # device-space points of the path under construction
    cur = (0.0, 0.0)
    path_start = None
    in_text = False
    tstate = None

    def num(t):
        try: return float(t[1])
        except ValueError: return 0.0

    for t in toks:
        kind, val, s, e = t
        if kind != "op":
            operands.append(t); continue
        op = val

        if op == b"q":
            stack.append((ctm, stroke, fill, dash, lw))
        elif op == b"Q":
            if stack:
                ctm, stroke, fill, dash, lw = stack.pop()
        elif op == b"cm" and len(operands) >= 6:
            m = tuple(num(x) for x in operands[-6:])
            ctm = mat_mul(m, ctm)
        elif op == b"w" and operands:
            lw = num(operands[-1])
        elif op == b"d" and len(operands) >= 2:
            dash = operands[-2][1].decode("latin-1") + " " + operands[-1][1].decode("latin-1")
        elif op == b"g" and operands:   fill = gray(num(operands[-1]))
        elif op == b"G" and operands:   stroke = gray(num(operands[-1]))
        elif op == b"rg" and len(operands) >= 3: fill = tuple(num(x) for x in operands[-3:])
        elif op == b"RG" and len(operands) >= 3: stroke = tuple(num(x) for x in operands[-3:])
        elif op == b"k" and len(operands) >= 4:  fill = cmyk(*[num(x) for x in operands[-4:]])
        elif op == b"K" and len(operands) >= 4:  stroke = cmyk(*[num(x) for x in operands[-4:]])
        elif op == b"sc" or op == b"scn":
            nums = [num(x) for x in operands if x[0] == "num"]
            if len(nums) == 3: fill = tuple(nums[-3:])
            elif len(nums) == 1: fill = gray(nums[-1])
        elif op == b"SC" or op == b"SCN":
            nums = [num(x) for x in operands if x[0] == "num"]
            if len(nums) == 3: stroke = tuple(nums[-3:])
            elif len(nums) == 1: stroke = gray(nums[-1])
        elif op == b"BT":
            in_text = True
            tstate = {"fill": fill, "stroke": stroke, "spans": [], "start": s,
                      "tm": (1, 0, 0, 1, 0, 0), "pts": []}
        elif op == b"ET":
            if tstate is not None:
                xs = [p[0] for p in tstate["pts"]]; ys = [p[1] for p in tstate["pts"]]
                bbox = (min(xs), min(ys), max(xs), max(ys)) if xs else None
                units.append(Unit(kind="text", stroke=tstate["stroke"], fill=tstate["fill"],
                                  dash=None, lw=0, bbox=bbox, spans=tstate["spans"],
                                  start=tstate["start"], end=e))
            in_text = False; tstate = None
        elif in_text and op in (b"Tm", b"Td", b"TD", b"T*", b"TL", b"Tf"):
            if op == b"Tm" and len(operands) >= 6:
                tstate["tm"] = tuple(num(x) for x in operands[-6:])
            elif op in (b"Td", b"TD") and len(operands) >= 2:
                tm = tstate["tm"]
                tstate["tm"] = mat_mul((1, 0, 0, 1, num(operands[-2]), num(operands[-1])), tm)
        elif in_text and op in SHOW_OPS:
            tm = tstate["tm"]
            x, y = apply(mat_mul(tm, ctm), 0, 0)
            tstate["pts"].append((x, y))
            first = operands[0][2] if operands else s
            tstate["spans"].append((first, e))
            # a show operator advances the text matrix; the next Td is relative
        elif op in PATH_OPS:
            if path_start is None:
                path_start = operands[0][2] if operands else s
            if op == b"m" or op == b"l":
                if len(operands) >= 2:
                    cur = (num(operands[-2]), num(operands[-1]))
                    pts.append(apply(ctm, *cur))
            elif op == b"c" and len(operands) >= 6:
                v = [num(x) for x in operands[-6:]]
                for i in range(0, 6, 2):
                    pts.append(apply(ctm, v[i], v[i+1]))
                cur = (v[4], v[5])
            elif op in (b"v", b"y") and len(operands) >= 4:
                v = [num(x) for x in operands[-4:]]
                for i in range(0, 4, 2):
                    pts.append(apply(ctm, v[i], v[i+1]))
                cur = (v[2], v[3])
            elif op == b"re" and len(operands) >= 4:
                x, y, w, h = [num(z) for z in operands[-4:]]
                for cx, cy in ((x, y), (x+w, y), (x+w, y+h), (x, y+h)):
                    pts.append(apply(ctm, cx, cy))
        elif op in PAINT_OPS:
            if op != b"n" and pts:
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                units.append(Unit(kind="path", stroke=stroke, fill=fill, dash=dash, lw=lw,
                                  bbox=(min(xs), min(ys), max(xs), max(ys)), pts=list(pts),
                                  paint_at=(s, e), paint_op=op, start=path_start, end=e))
            pts = []; path_start = None
        elif op in (b"W", b"W*"):
            pass
        if op not in (b"BI",):
            operands = []
    return units, toks
