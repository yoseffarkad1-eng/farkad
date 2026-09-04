"""Split W-01 into three sheets: cold (W-02), hot (W-03) and the circulation loop (W-04).

Nothing is redrawn.  The plan on each sheet is W-01's own geometry with the other
systems deleted from the content stream, so a pipe on W-03 is at the millimetre
where the engineer put it — not where a tracing put it.  Only the words around it
(legend, schematic, notes, table, title block) are new, and every figure in them
is read back off W-01.
"""
import sys, os, re, math, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pymupdf
from units import parse, hexc
from model import callouts, family, region, H, COLD, HOT, RET, MAIN, BASE
from filt import hide
import blocks
from sheet import page, LEGEND_RECT, SCHEM_RECT, BAND_RECT

HERE = os.path.dirname(os.path.abspath(__file__))
# when the tools sit in plans/water/tools/, the sheets belong one level up
OUT = os.path.dirname(HERE) if os.path.basename(HERE) == "tools" else HERE
SRC = (sys.argv[1] if len(sys.argv) > 1 else
       "/root/.claude/uploads/097e067f-7934-5ac6-a5af-f4ec2ffd23cd/e11c0ecd-MEP_Rev02_Print_A1.pdf")
PAGE = 2                                     # W-01, the water sheet of the MEP set
FULLPAGE_XREF = 457                          # the A2 sheet the A1 print enlarges
S, YOFF = 1.41361, 1.995                     # A2 point -> A1 point
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

# The boiler and its callout are hot-coloured, but the boiler is where point 13's cold
# ends and where the circulation loop begins, so the cold and loop sheets keep them.
# The shut-off just above it sits on the Ø20 hot outlet, which those sheets delete —
# keeping it would leave a valve floating on no pipe, so these boxes exclude it.
BOILER_BOX = [(858.0, 605.0, 1000.0, 662.0),    # the boiler symbol and its leader
              (960.0, 583.0, 1065.0, 610.0)]    # the "דוד חשמלי 150 ל׳" callout

SHEETS = {
    "W-02": {"keep": {BASE, MAIN, COLD}, "balloons": set(range(1, 27)),
             "keep_box": (HOT, BOILER_BOX)},
    "W-03": {"keep": {BASE, MAIN, HOT}, "drop_markers": True,
             "balloons": set(blocks.HOT_POINTS) | {blocks.BOILER_POINT}},
    "W-04": {"keep": {BASE, MAIN, RET}, "balloons": {blocks.BOILER_POINT},
             "keep_box": (HOT, BOILER_BOX), "drop_markers": True},
}


def a2_to_a1(x0, y0, x1, y1):
    return pymupdf.Rect(x0 * S, y0 * S + YOFF, x1 * S, y1 * S + YOFF)


def in_box(u, box):
    if not u.bbox:
        return False
    x0, y0, x1, y1 = u.bbox[0], H - u.bbox[3], u.bbox[2], H - u.bbox[1]
    return x0 >= box[0] and y0 >= box[1] and x1 <= box[2] and y1 <= box[3]


def point_numbers(units, cs, doc):
    """Read each balloon's number off the rendered sheet, so the map is the drawing's."""
    pg = doc[PAGE]
    out = {}
    for i, info in cs.items():
        cx, cy = info["centre"]
        tx, ty = cx * S, (H - cy) * S + YOFF
        raw = pg.get_textbox(pymupdf.Rect(tx - 16, ty - 16, tx + 16, ty + 16)).strip().replace("\n", "")
        m = re.search(r"(\d+)$", raw)
        if not m:
            raise SystemExit(f"balloon at {cx:.0f},{cy:.0f} has no readable number: {raw!r}")
        out[i] = int(m.group(1))
    if sorted(out.values()) != list(range(1, 27)):
        raise SystemExit(f"expected balloons 1..26, got {sorted(out.values())}")
    return out


def dots_by_point(units, cs, nums):
    """Each fixture's marker sits exactly on the tip of its balloon's leader."""
    tips = {}
    for i, info in cs.items():
        cx, cy = info["centre"]
        lead = [j for j in info["group"]
                if units[j].kind == "path" and units[j].paint_op == b"S" and j < i - 1]
        if lead and units[lead[0]].pts:
            tips[nums[i]] = max(units[lead[0]].pts,
                                key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
    out = {}
    for i, u in enumerate(units):
        if u.kind != "path" or hexc(u.fill) != "#0b5ed7" or u.paint_op not in (b"f", b"f*"):
            continue
        if region(u) != "plan":
            continue
        w, h = u.bbox[2] - u.bbox[0], u.bbox[3] - u.bbox[1]
        if w >= 14 or h >= 14:
            continue
        c = ((u.bbox[0] + u.bbox[2]) / 2, (u.bbox[1] + u.bbox[3]) / 2)
        n, d = min(((n, math.hypot(t[0] - c[0], t[1] - c[1])) for n, t in tips.items()),
                   key=lambda z: z[1])
        if d > 1.0:
            raise SystemExit(f"marker at {c} matches no leader tip (nearest {n}, {d:.1f}pt)")
        out[n] = i
    return out


def main():
    data = None
    doc0 = pymupdf.open(SRC)
    data = doc0.xref_stream(FULLPAGE_XREF)
    units, _ = parse(data)
    cs = callouts(units)
    nums = point_numbers(units, cs, doc0)
    dots = dots_by_point(units, cs, nums)
    balloon_units = {nums[i]: set(info["group"]) | ({dots[nums[i]]} if nums[i] in dots else set())
                     for i, info in cs.items()}
    print(f"W-01: {len(units)} painted units, {len(cs)} balloons, {len(dots)} fixture markers")

    subprocess.run(["bash", os.path.join(HERE, "mkoverlay.sh")], check=True,
                   stdout=subprocess.DEVNULL)

    for name, spec in SHEETS.items():
        keep, want = spec["keep"], spec["balloons"]
        kept_balloon_units = set()
        for n in want:
            kept_balloon_units |= balloon_units[n]
        all_balloon_units = set().union(*balloon_units.values())

        markers = set(dots.values()) if spec.get("drop_markers") else set()
        drop = []
        for i, u in enumerate(units):
            if i in markers:
                drop.append(i); continue
            if region(u) in ("legend", "schem", "band"):
                drop.append(i); continue
            if i in all_balloon_units:
                if i not in kept_balloon_units:
                    drop.append(i)
                continue
            f = family(u)
            if f in keep:
                continue
            box = spec.get("keep_box")
            if box and f == box[0] and any(in_box(u, b) for b in box[1]):
                continue
            drop.append(i)

        out = pymupdf.open(SRC)
        out.update_stream(FULLPAGE_XREF, hide(data, units, drop))
        out.select([PAGE])
        pg = out[0]

        # the hot sheet loses the blue fixture markers with the cold; put red ones back.
        # Point 13 is the boiler's COLD feed, not a hot draw-off — its symbol is the
        # boiler box, and a red dot there would claim a hot point that does not exist.
        if name == "W-03":
            for n in want:
                if n not in dots or n == blocks.BOILER_POINT:
                    continue
                u = units[dots[n]]
                cx = (u.bbox[0] + u.bbox[2]) / 2
                cy = (u.bbox[1] + u.bbox[3]) / 2
                r = (u.bbox[2] - u.bbox[0]) / 2
                pg.draw_circle(pymupdf.Point(cx * S, (H - cy) * S + YOFF), r * S,
                               color=None, fill=(0.839, 0.122, 0.149), width=0)

        # The overlay paints nothing outside its three blocks and has no page
        # background, so it goes on in ONE stamp.  Stamping each block separately
        # would put a clipped copy of the whole overlay on the sheet three times —
        # invisible, but three copies of every word to anyone extracting the text.
        ov = pymupdf.open(os.path.join(HERE, f"ov_{name}.pdf"))
        pg.show_pdf_page(pymupdf.Rect(0, 0, ov[0].rect.width, ov[0].rect.height), ov, 0)

        out.set_metadata({"title": f"תוכנית מים — {name} · {blocks.TITLES[name][0]} · דירת קרקע"})
        path = os.path.join(OUT, f"{name}.pdf")
        out.save(path, garbage=3, deflate=True)
        pymupdf.open(path)[0].get_pixmap(dpi=100).save(os.path.join(OUT, f"{name}.png"))
        print(f"{name}: dropped {len(drop)} of {len(units)} units -> {path}")


if __name__ == "__main__":
    main()
