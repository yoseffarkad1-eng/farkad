"""What each mark on W-01 belongs to: a water system, a sheet region, a callout.

The colours are the drawing's own legend, read back out of the content stream:
    #0b5ed7 cold      #d61f26 hot        #e46a6f circulation
    #0a3d91 the Ø25 main and the manifold cabinets (shared by all three)
Everything else is the building, the frame and the words — it stays on every sheet.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from units import parse, hexc

H = 1684.08                      # the A2 sheet the A1 print is an enlargement of
A1_SCALE = 1.4136100000
A1_YOFF = 1.995

COLD, HOT, RET, MAIN, BASE = "cold", "hot", "ret", "main", "base"

STROKE_PAINTS = {b"S", b"s", b"B", b"B*", b"b", b"b*"}
FILL_PAINTS = {b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*"}

# sheet regions, in A2 points measured from the TOP-LEFT corner
REGIONS = {
    "legend":  (60.0, 52.0, 342.0, 352.0),
    "schem":   (348.0, 56.0, 651.0, 300.0),
    "band":    (30.0, 1436.0, 1160.0, 1656.0),   # notes + points table + title block
}


def top(b):
    """A unit's bbox with y measured from the top of the sheet, like a drawing is read."""
    return (b[0], H - b[3], b[2], H - b[1])


def colours(u):
    cols = set()
    if u.kind == "text":
        cols.add(hexc(u.fill))
    else:
        if u.paint_op in STROKE_PAINTS:
            cols.add(hexc(u.stroke))
        if u.paint_op in FILL_PAINTS:
            cols.add(hexc(u.fill))
    return cols


def family(u):
    c = colours(u)
    if "#0b5ed7" in c:                      return COLD
    if "#d61f26" in c or "#fff1f2" in c:    return HOT
    if "#e46a6f" in c:                      return RET
    if "#0a3d91" in c or "#eef4ff" in c:    return MAIN
    return BASE


def region(u):
    if not u.bbox:
        return None
    x0, y0, x1, y1 = top(u.bbox)
    for name, (rx0, ry0, rx1, ry1) in REGIONS.items():
        if x0 >= rx0 - 1 and y0 >= ry0 - 1 and x1 <= rx1 + 1 and y1 <= ry1 + 1:
            return name
    return "plan"


def callouts(units):
    """Return {point number: [unit indices]} for the 26 numbered balloons.

    A balloon is a 26.1pt circle in #111827; the leader that points at the fixture
    is the path drawn immediately before it, and the number is the glyph run drawn
    immediately after.  Dropping a fixture means dropping all three together — a
    leader left pointing at nothing is worse than no balloon at all.
    """
    out = {}
    for i, u in enumerate(units):
        if u.kind != "path" or hexc(u.stroke) != "#111827" or u.paint_op != b"S":
            continue
        w = u.bbox[2] - u.bbox[0]
        h = u.bbox[3] - u.bbox[1]
        if not (25.5 < w < 27 and 25.5 < h < 27):
            continue
        cx = (u.bbox[0] + u.bbox[2]) / 2
        cy = (u.bbox[1] + u.bbox[3]) / 2
        num, group = None, [i]
        if i > 0 and units[i-1].kind == "path" and hexc(units[i-1].fill) == "#ffffff":
            group.append(i - 1)                                   # the balloon's white disc
        for j in range(i - 2, max(i - 5, -1), -1):                # the leader line
            v = units[j]
            if v.kind == "path" and hexc(v.stroke) == "#111827" and v.paint_op == b"S":
                vw, vh = v.bbox[2] - v.bbox[0], v.bbox[3] - v.bbox[1]
                if not (25.5 < vw < 27 and 25.5 < vh < 27):
                    group.append(j)
                break
        for j in range(i + 1, min(i + 4, len(units))):
            v = units[j]
            if v.kind == "text" and v.bbox and abs((v.bbox[0]+v.bbox[2])/2 - cx) < 14 \
               and abs((v.bbox[1]+v.bbox[3])/2 - cy) < 14:
                group.append(j)
                num = j
        out[i] = {"centre": (cx, cy), "group": group, "text_unit": num}
    return out
