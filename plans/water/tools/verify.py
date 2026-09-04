"""Measure the three sheets against W-01, in the drawing area only.

The two ways this split can lie are symmetrical: a foreign system left on a sheet
(a red pipe on the cold sheet), or a piece of the sheet's own system dropped with
the rest.  Both are counted here against W-01's own drawings, not against a
picture of them.
"""
import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pymupdf

SRC = (sys.argv[1] if len(sys.argv) > 1 else
       "/root/.claude/uploads/097e067f-7934-5ac6-a5af-f4ec2ffd23cd/e11c0ecd-MEP_Rev02_Print_A1.pdf")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE) if os.path.basename(HERE) == "tools" else HERE

COLD, HOT, RET, NAVY = "#0b5ed7", "#d61f26", "#e46a6f", "#0a3d91"
PLAN = pymupdf.Rect(60, 460, 1600, 2020)          # the drawing window, in A1 points

EXPECT = {                       # colours the plan window may and may not contain
    "W-02": ({COLD, NAVY}, {RET}),                # keeps the boiler point 13 feeds
    "W-03": ({HOT, NAVY}, {COLD, RET}),
    "W-04": ({RET, NAVY}, {COLD}),                # keeps the boiler, so HOT is checked by box
}
BOILER = pymupdf.Rect(1210, 850, 1510, 940)       # A1 points; the only hot allowed off W-03


def strip(t):
    """The block text without its markup, as it will read on the sheet."""
    import re
    return re.sub(r"<[^>]+>", "", t)


def squash(t):
    return "".join(t.split())


def hexc(c):
    if c is None:
        return None
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(v * 255)))) for v in c)


def plan_paths(path):
    """Paths inside the drawing window, keyed by colour and identified by their rect."""
    pg = pymupdf.open(path)[0]
    out = collections.defaultdict(collections.Counter)
    for d in pg.get_drawings():
        r = d["rect"]
        if not (PLAN.x0 <= r.x0 and r.x1 <= PLAN.x1 and PLAN.y0 <= r.y0 and r.y1 <= PLAN.y1):
            continue
        key = (round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1))
        for c in (hexc(d.get("color")), hexc(d.get("fill"))):
            if c:
                out[c][key] += 1
    return out


def main():
    src = pymupdf.open(SRC)
    one = pymupdf.open()
    one.insert_pdf(src, from_page=2, to_page=2)
    one.save(os.path.join(HERE, "_w01.pdf"))
    base = plan_paths(os.path.join(HERE, "_w01.pdf"))
    print("W-01 plan window, paths per colour:")
    for c in (COLD, HOT, RET, NAVY):
        print(f"   {c}: {sum(base.get(c, collections.Counter()).values())}")

    bad = 0
    for name, (must, must_not) in EXPECT.items():
        got = plan_paths(os.path.join(OUT, f"{name}.pdf"))
        print(f"\n{name}")
        for c in must:
            b, g = base.get(c, collections.Counter()), got.get(c, collections.Counter())
            missing = sum((b - g).values())
            added = sum((g - b).values())
            mark = "ok " if missing == 0 else "!! "
            if missing:
                bad += 1
            print(f"  {mark}kept {c}: {sum(b.values()) - missing} of W-01's {sum(b.values())}"
                  f"{f' (+{added} drawn by this build)' if added else ''}")
        for c in must_not:
            k = sum(got.get(c, collections.Counter()).values())
            if k:
                bad += 1
            print(f"  {'ok ' if k == 0 else '!! '}removed {c}: {k} left")
        if name in ("W-02", "W-04"):
            stray = [k for k in got.get(HOT, collections.Counter())
                     if not BOILER.contains(pymupdf.Rect(*k))]
            if stray:
                bad += 1
            print(f"  {'ok ' if not stray else '!! '}hot outside the boiler group: {len(stray)}"
                  f" (total hot kept {sum(got.get(HOT, collections.Counter()).values())})")

    # every balloon that should be on a sheet, and none that should not
    want = {"W-02": set(range(1, 27)),
            "W-03": {1, 5, 6, 7, 9, 11, 12, 13, 14, 22, 23, 24},
            "W-04": {13}}
    for name, nums in want.items():
        pg = pymupdf.open(os.path.join(OUT, f"{name}.pdf"))[0]
        found = set()
        for d in pg.get_drawings():
            r = d["rect"]
            if hexc(d.get("color")) != "#111827" or not (35 < r.width < 39 and 35 < r.height < 39):
                continue
            t = pg.get_textbox(pymupdf.Rect(r.x0 + 3, r.y0 + 3, r.x1 - 3, r.y1 - 3)).strip()
            t = "".join(ch for ch in t if ch.isdigit())
            if t:
                found.add(int(t))
        mark = "ok " if found == nums else "!! "
        if found != nums:
            bad += 1
        print(f"{mark}{name} balloons: {sorted(found)}")
        if found != nums:
            print(f"     expected {sorted(nums)}")

    # a block that overflows its hole is silently clipped by the browser, so check that
    # the LAST thing each block is supposed to say actually made it onto the sheet
    import re
    import blocks as B
    from sheet import SUMMARY, LEGEND_RECT, BAND_RECT, NOTES_X, TABLE_X
    for name in ("W-02", "W-03", "W-04"):
        pg = pymupdf.open(os.path.join(OUT, f"{name}.pdf"))[0]
        notes = pg.get_textbox(pymupdf.Rect(NOTES_X[0], BAND_RECT[1], NOTES_X[1], BAND_RECT[3]))
        seen = [int(m) for m in re.findall(r"\.(\d{1,2})(?=[\s. ])", notes)]
        want = len(B.NOTES[name])
        ok = seen and max(seen) == want
        bad += 0 if ok else 1
        print(f"  {'ok ' if ok else '!! '}{name} notes: {max(seen) if seen else 0} of {want} numbered")

        legend = pg.get_textbox(pymupdf.Rect(*LEGEND_RECT))
        tail = SUMMARY[name][-1][0]
        ok = tail in legend
        bad += 0 if ok else 1
        print(f"  {'ok ' if ok else '!! '}{name} legend reaches its last summary row ({tail!r})")

        table = pg.get_textbox(pymupdf.Rect(TABLE_X[0], BAND_RECT[1], TABLE_X[1], BAND_RECT[3]))
        tail = B.LOOP_ROWS[-1][0] if name == "W-04" else "26" if name == "W-02" else "24"
        ok = tail in table
        bad += 0 if ok else 1
        print(f"  {'ok ' if ok else '!! '}{name} table reaches its last row ({tail!r})")

    print("\nFAILURES:", bad)
    return bad


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
