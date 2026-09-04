"""Draw the replacement legend, schematic, notes, table and title block.

These are printed by Chromium at the sheet's own A1 size and then stamped into
the holes cut in W-01, so every coordinate here is in A1 points measured from
the top-left corner of the sheet — the same frame the original blocks sat in.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from blocks import (POINTS, HOT_POINTS, LEGEND, NOTES, TITLES, LOOP_ROWS, FOOT,
                    COLD, HOT, RET, NAVY)

LEGEND_RECT = (94.72, 86.81, 473.56, 488.27)
SCHEM_RECT = (502.00, 90.20, 910.00, 414.30)
BAND_RECT = (48.06, 2038.40, 1634.13, 2334.90)
BAND_SPLIT = 1162.00                      # the rule between the title block and the notes
NOTES_X = (565.40, 1152.30)
TABLE_X = (53.70, 558.40)

CSS = """
@page { size: 1684.08pt 2384.28pt; margin: 0 }
html, body { margin:0; padding:0; background:transparent }
body { font-family:"DejaVu Sans", sans-serif; direction:rtl; color:#1a1a1a;
       -webkit-print-color-adjust:exact; print-color-adjust:exact }
.blk { position:absolute; background:#fff; box-sizing:border-box; overflow:hidden }
.legend { border:1.8pt solid #1a1a1a; padding:9pt 12pt }
.schem  { border:1.8pt solid #1a1a1a }
h2 { margin:0 0 5pt; font-size:13.62pt; font-weight:bold; text-align:right;
     border-bottom:1.4pt solid #1a1a1a; padding-bottom:5pt }
.lrow { display:flex; align-items:center; gap:9pt; font-size:9.41pt; line-height:1.15;
        padding:2.1pt 0 }
.lrow .sym { flex:0 0 44pt; height:15pt; display:flex; align-items:center; justify-content:center }
.lrow .txt { flex:1 1 auto; text-align:right }
.lrow.ref { margin-top:3pt; padding-top:5pt; border-top:.8pt solid #c9d0d6; color:#5a6672 }

.summary { margin-top:auto; border-top:1.2pt solid #1a1a1a; padding-top:5pt }
.summary .sh { font-size:9.41pt; font-weight:bold; text-align:right; margin-bottom:3pt }
.summary table { width:100%; font-size:8.21pt }
.summary td { border:0; border-bottom:.6pt solid #e3e7ea; padding:1.5pt 1pt; text-align:left }
.summary td.k { text-align:right; color:#5a6672; width:96pt }

.idx { border:1.2pt solid #1a1a1a; padding:6pt 8pt }
.idx .ih { font-size:8.81pt; font-weight:bold; text-align:right; margin-bottom:3pt;
           border-bottom:.9pt solid #1a1a1a; padding-bottom:2.6pt }
.idx .ir { display:flex; gap:6pt; font-size:8.21pt; padding:1.9pt 0; color:#5a6672 }
.idx .ir b { flex:0 0 34pt; text-align:right }
.idx .ir.on { color:#1a1a1a; font-weight:bold }

.schem .st { font-size:10.41pt; font-weight:bold; text-align:center; padding:5.5pt 0 5pt;
             border-bottom:1.2pt solid #1a1a1a }
.schem .sfoot { font-size:5.6pt; font-weight:bold; text-align:center; color:#374151;
                padding:0 6pt 2.4pt }
.schem .sindex { font-size:5.6pt; text-align:center; color:#5a6672; padding:0 6pt 5pt;
                 border-top:.6pt solid #e3e7ea; margin:0 8pt; padding-top:2.6pt }
.schem .sindex b { color:#1a1a1a }

.band { border-left:1.06pt solid #1a1a1a; border-right:1.06pt solid #1a1a1a;
        border-bottom:1.06pt solid #1a1a1a; border-top:1.4pt solid #1a1a1a }
.col { position:absolute; top:0 }
h3 { margin:0 0 6pt; font-size:12.42pt; font-weight:bold; text-align:right;
     border-bottom:1.2pt solid #1a1a1a; padding-bottom:4pt }

ol.notes { margin:0; padding:0 13pt 0 0; font-size:7.9pt; line-height:1.36 }
ol.notes li { margin-bottom:1.9pt; text-align:justify }

table { border-collapse:collapse; width:100%; font-size:7.61pt }
th, td { border:.7pt solid #9aa4ad; padding:1.7pt 3.2pt; text-align:center }
th { background:#e8edf2; font-weight:bold }
td.nm { text-align:right }
.tfoot { font-size:7.61pt; line-height:1.35; margin-top:4pt; text-align:justify }

.tb .big { font-size:24.84pt; font-weight:bold; text-align:right; line-height:1.05 }
.tb .sub { font-size:10.01pt; color:#5a6672; text-align:right; margin-bottom:9pt }
.tb .sheet { font-size:21.63pt; font-weight:bold; text-align:right; line-height:1.1 }
.tb .sheet2 { font-size:12.42pt; font-weight:bold; text-align:right; margin-bottom:6pt }
.tb table { font-size:10.01pt }
.tb td { border:0; border-bottom:.8pt solid #c9d0d6; padding:3.4pt 2pt; text-align:left }
.tb td.k { text-align:right; font-weight:bold; width:74pt }
"""

# --------------------------------------------------------------------- symbols
def sym(kind, accent=None):
    s = '<svg width="44" height="15" viewBox="0 0 44 15">'
    mid = 7.5
    if kind == "line-cold-20":
        s += f'<line x1="1" y1="{mid}" x2="43" y2="{mid}" stroke="{COLD}" stroke-width="4.4" stroke-linecap="round"/>'
    elif kind == "line-cold-16":
        s += f'<line x1="1" y1="{mid}" x2="43" y2="{mid}" stroke="{COLD}" stroke-width="2.6" stroke-linecap="round"/>'
    elif kind == "line-hot-20":
        s += f'<line x1="1" y1="{mid}" x2="43" y2="{mid}" stroke="{HOT}" stroke-width="4.4" stroke-linecap="round"/>'
    elif kind == "line-hot-16":
        s += f'<line x1="1" y1="{mid}" x2="43" y2="{mid}" stroke="{HOT}" stroke-width="2.6" stroke-linecap="round"/>'
    elif kind == "line-main":
        s += f'<line x1="1" y1="{mid}" x2="43" y2="{mid}" stroke="{NAVY}" stroke-width="5.4" stroke-linecap="round"/>'
    elif kind == "line-ret":
        s += (f'<line x1="1" y1="{mid}" x2="43" y2="{mid}" stroke="{RET}" stroke-width="2.8" '
              f'stroke-dasharray="5 3.4" stroke-linecap="butt"/>')
    elif kind == "cabinet":
        s += f'<rect x="8" y="1.5" width="28" height="12" fill="#fff" stroke="{NAVY}" stroke-width="1.6"/>'
        if accent == COLD:
            s += f'<line x1="10.5" y1="7.5" x2="33.5" y2="7.5" stroke="{COLD}" stroke-width="1.9"/>'
        elif accent == HOT:
            s += f'<line x1="10.5" y1="7.5" x2="33.5" y2="7.5" stroke="{HOT}" stroke-width="1.9"/>' 
    elif kind == "submani":
        s += (f'<rect x="11" y="2" width="22" height="11" fill="#eef4ff" stroke="{NAVY}" stroke-width="1.3"/>'
              f'<text x="22" y="8.4" font-size="5.1" font-family="DejaVu Sans" font-weight="bold" '
              f'text-anchor="middle" fill="{NAVY}">מש</text>')
        if accent == HOT:
            s += f'<line x1="13" y1="10.6" x2="31" y2="10.6" stroke="{HOT}" stroke-width="1"/>' 
    elif kind == "valve":
        c = accent or NAVY
        s += (f'<path d="M14,2.2 L14,12.8 L22,7.5 Z" fill="{c}"/>'
              f'<path d="M30,2.2 L30,12.8 L22,7.5 Z" fill="{c}"/>'
              f'<line x1="22" y1="7.5" x2="22" y2="1.6" stroke="{c}" stroke-width="1.5"/>'
              f'<line x1="18" y1="1.6" x2="26" y2="1.6" stroke="{c}" stroke-width="1.5"/>')
    elif kind == "meter":
        s += (f'<line x1="6" y1="{mid}" x2="38" y2="{mid}" stroke="{NAVY}" stroke-width="1.5"/>'
              f'<circle cx="22" cy="7.5" r="5.6" fill="#fff" stroke="{NAVY}" stroke-width="1.6"/>'
              f'<circle cx="22" cy="7.5" r="2.3" fill="none" stroke="{NAVY}" stroke-width="1.4"/>'
              f'<circle cx="22" cy="7.5" r="0.9" fill="{NAVY}"/>')
    elif kind == "pr":
        s += (f'<rect x="9" y="2" width="26" height="11" fill="#fff" stroke="{NAVY}" stroke-width="1.6"/>'
              f'<text x="22" y="10.6" font-size="6.4" font-family="DejaVu Sans" font-weight="bold" '
              f'text-anchor="middle" fill="{NAVY}">PR</text>')
    elif kind == "bib":
        s += (f'<circle cx="22" cy="5.4" r="3.2" fill="none" stroke="{COLD}" stroke-width="1.8"/>'
              f'<line x1="22" y1="8.6" x2="22" y2="13" stroke="{COLD}" stroke-width="1.8"/>'
              f'<line x1="18.6" y1="13" x2="25.4" y2="13" stroke="{COLD}" stroke-width="1.8"/>')
    elif kind == "dot-cold":
        s += f'<circle cx="22" cy="7.5" r="3.4" fill="{COLD}"/>'
    elif kind == "dot-hot":
        s += f'<circle cx="22" cy="7.5" r="3.4" fill="{HOT}"/>'
    elif kind == "balloon":
        s += (f'<circle cx="22" cy="7.5" r="6" fill="#fff" stroke="#111827" stroke-width="1.5"/>'
              f'<text x="22" y="9.9" font-size="7" font-family="DejaVu Sans" font-weight="bold" '
              f'text-anchor="middle" fill="#111827">1</text>')
    elif kind == "boiler":
        s += (f'<rect x="10" y="1.6" width="24" height="12" fill="#fff1f2" stroke="{HOT}" stroke-width="1.9"/>'
              f'<circle cx="22" cy="7.6" r="3.5" fill="none" stroke="{HOT}" stroke-width="1.5"/>'
              f'<text x="22" y="9.9" font-size="5.2" font-family="DejaVu Sans" font-weight="bold" '
              f'text-anchor="middle" fill="{HOT}">D</text>')
    elif kind == "pump":
        s += (f'<circle cx="22" cy="7.5" r="5.4" fill="#fff" stroke="{RET}" stroke-width="1.8"/>'
              f'<path d="M19.6,4.4 L26,7.5 L19.6,10.6 Z" fill="{RET}"/>')
    elif kind == "checkvalve":
        s += (f'<line x1="6" y1="{mid}" x2="38" y2="{mid}" stroke="{RET}" stroke-width="1.5"/>'
              f'<path d="M15,2.6 L15,12.4 L23,7.5 Z" fill="none" stroke="{RET}" stroke-width="1.6"/>'
              f'<line x1="25" y1="2.6" x2="25" y2="12.4" stroke="{RET}" stroke-width="1.9"/>')
    elif kind == "clock":
        s += (f'<circle cx="22" cy="7.5" r="5.6" fill="#fff" stroke="{NAVY}" stroke-width="1.5"/>'
              f'<line x1="22" y1="7.5" x2="22" y2="3.6" stroke="{NAVY}" stroke-width="1.3"/>'
              f'<line x1="22" y1="7.5" x2="25.2" y2="9.1" stroke="{NAVY}" stroke-width="1.3"/>')
    elif kind == "ref":
        s += (f'<rect x="12" y="2.4" width="20" height="10.2" fill="#fff" stroke="#9aa4ad" '
              f'stroke-width="1" stroke-dasharray="2.4 1.8"/>')
    s += "</svg>"
    return s


def legend_html(sheet):
    rows = ""
    for kind, txt in LEGEND[sheet]:
        cls = "lrow ref" if kind == "ref" else "lrow"
        rows += f'<div class="{cls}"><div class="sym">{sym(kind, VALVE_ACCENT[sheet])}</div><div class="txt">{txt}</div></div>'
    x0, y0, x1, y1 = LEGEND_RECT
    srows = "".join(f'<tr><td class="k">{k}</td><td>{v}</td></tr>' for k, v in SUMMARY[sheet])
    summ = (f'<div class="summary"><div class="sh">נתוני המערכת</div>'
            f'<table>{srows}</table></div>')
    return (f'<div class="blk legend" style="left:{x0}pt;top:{y0}pt;width:{x1-x0}pt;height:{y1-y0}pt;'
            f'display:flex;flex-direction:column">'
            f'<h2>מקרא — {SYSNAME[sheet]}</h2><div>{rows}</div>{summ}</div>')


SYSNAME = {"W-02": "מים קרים", "W-03": "מים חמים", "W-04": "קו מחזור"}
# The accent a sheet's symbols are drawn in — the colour that survived on that sheet.
VALVE_ACCENT = {"W-02": COLD, "W-03": HOT, "W-04": None}

# A short read of the system, so the legend box carries a summary and not white space.
SUMMARY = {
    "W-02": [("נקודות מים", "26 · 7 ברזי שטיפה"), ("ארונות מחלקים", "מ1 · מ2 · מש1–מש8"),
             ("היררכיה", "Ø25 → Ø20 → Ø16"),
             ("לחץ עבודה", "3.5 בר · מווסת מעל 4.0"), ("ספיקה מרבית", "1.5 מ״ק/שעה · ≈1.3 מ/ש")],
    "W-03": [("נקודות חם", "11 + הזנת הדוד"), ("מקור חום", "דוד חשמלי 150 ל׳"),
             ("יציאות חם", "מ1 — 3 חם + הזנה מהדוד · מ2 — 2 חם"),
             ("מחלקי משנה עם חם", "מש1 · מש2 · מש3 · מש5 · מש6"),
             ("שטאף תרמוסטטי", "3 יח׳ · נק׳ 22–24"), ("בידוד", "Ø20 איזור מבודד · חשוף 13 מ״מ"),
             ("לחץ עבודה", "3.5 בר")],
    "W-04": [("קוטר", "Ø16"), ("אורך הלולאה", "≈22 מ׳ הלוך־חזור"),
             ("מסלול", "דוד · מ1 · מ2 · חזרה לדוד"), ("ציוד", "משאבה · אל־חוזר · שעון שבת"),
             ("בידוד", "קטעים חשופים · 13 מ״מ")],
}

# ------------------------------------------------------------------ schematics
MANIS = [  # (label, points under it, how many of them, zone caption, x centre in the svg)
    ("מש8", "18–19", 2, "מרפסת דר׳", 60),
    ("מש7", "16–17", 2, "מרפסת מע׳", 152),
    ("מש6", "5", 1, "מטבחון", 244),
    ("מש5", "1–4", 4, "מטבח", 336),
    ("מש4", "20–21", 2, "חצר", 470),
    ("מש3", "14–15, 22, 25", 4, "שירותי אורחים", 562),
    ("מש2", "9–13, 24", 6, "משפחתי+כביסה", 654),
    ("מש1", "6–8, 23, 26", 5, "רחצה ה׳ + מרפסת", 746),
]
HOT_UNDER = {"מש1": ("6, 7, 23", 3), "מש2": ("9, 11, 12, 24", 4), "מש3": ("14, 22", 2),
             "מש5": ("1", 1), "מש6": ("5", 1)}

SW, SH = 820, 560          # schematic viewBox
M1X, M2X = 700, 250        # the two manifold cabinets
MY, MYH = 300, 46          # cabinet top and height
SUBY, SUBH = 430, 40       # sub-manifold row


def _cabinets(colour_pairs):
    """The two manifold cabinets and the Ø25 trunk between them."""
    g = ""
    for x, label in ((M1X, "מ1 · ראשי"), (M2X, "מ2 · מטבח")):
        g += (f'<rect x="{x-88}" y="{MY}" width="176" height="{MYH}" fill="#eef4ff" '
              f'stroke="{NAVY}" stroke-width="3"/>'
              f'<text x="{x}" y="{MY+29}" font-size="15" font-weight="bold" text-anchor="middle" '
              f'fill="{NAVY}">{label}</text>')
    return g


def schem_svg(sheet):
    g = ''
    if sheet == "W-02":
        # meter, valve and pressure reducer at the head; the Ø25 trunk reaches מ2 first
        g += (f'<line x1="812" y1="150" x2="{M2X}" y2="150" stroke="{NAVY}" stroke-width="6"/>'
              f'<circle cx="790" cy="150" r="22" fill="#fff" stroke="{NAVY}" stroke-width="3.4"/>'
              f'<circle cx="790" cy="150" r="9" fill="none" stroke="{NAVY}" stroke-width="3"/>'
              f'<path d="M726,128 L726,172 L757,150 Z" fill="{NAVY}"/>'
              f'<path d="M736,128 L736,172 L705,150 Z" fill="{NAVY}"/>'
              f'<line x1="731" y1="150" x2="731" y2="118" stroke="{NAVY}" stroke-width="3"/>'
              f'<line x1="712" y1="118" x2="750" y2="118" stroke="{NAVY}" stroke-width="3"/>'
              f'<rect x="608" y="132" width="70" height="36" fill="#fff" stroke="{NAVY}" stroke-width="3"/>'
              f'<text x="643" y="158" font-size="17" font-weight="bold" text-anchor="middle" fill="{NAVY}">PR</text>'
              f'<text x="700" y="98" font-size="13" font-weight="bold" text-anchor="middle" fill="#1a1a1a">'
              f'הזנה ראשית Ø25 · מד מים ¾״ · מגוף · מסנן Y · מווסת 3.5 בר</text>'
              f'<line x1="{M2X}" y1="150" x2="{M2X}" y2="{MY}" stroke="{NAVY}" stroke-width="6"/>')
        g += _cabinets(None)
        g += (f'<line x1="{M2X+88}" y1="{MY+23}" x2="{M1X-88}" y2="{MY+23}" stroke="{NAVY}" stroke-width="5"/>'
              f'<text x="{(M1X+M2X)//2}" y="{MY-8}" font-size="13" font-weight="bold" text-anchor="middle" '
              f'fill="{NAVY}">Ø25</text>')
        for label, pts, n, zone, x in MANIS:
            src = M1X if label in ("מש1", "מש2", "מש3", "מש4") else M2X
            g += (f'<path d="M{x},{SUBY} L{x},{MY+MYH+16} L{src},{MY+MYH+16} L{src},{MY+MYH}" '
                  f'fill="none" stroke="{COLD}" stroke-width="3.4"/>')
            g += _submani(x, label, pts, zone, COLD, stubs=n)
        g += (f'<text x="{M1X+150}" y="{MY+MYH+52}" font-size="12" font-weight="bold" fill="{COLD}">Ø20</text>'
              f'<text x="{M1X+150}" y="{SUBY+SUBH+34}" font-size="12" font-weight="bold" fill="{COLD}">Ø16</text>')
    elif sheet == "W-03":
        # the boiler is the source; hot leaves מ1 and reaches מ2
        g += (f'<rect x="{M1X-90}" y="120" width="180" height="52" fill="#fff1f2" stroke="{HOT}" stroke-width="3.4"/>'
              f'<text x="{M1X}" y="152" font-size="15" font-weight="bold" text-anchor="middle" fill="{HOT}">'
              f'דוד חשמלי 150 ל׳</text>'
              f'<line x1="{M1X+40}" y1="172" x2="{M1X+40}" y2="{MY}" stroke="{HOT}" stroke-width="5"/>'
              f'<text x="{M1X+96}" y="{MY-16}" font-size="12" font-weight="bold" text-anchor="middle" '
              f'fill="{HOT}">Ø20 חם מהדוד</text>'
              f'<line x1="{M1X-40}" y1="172" x2="{M1X-40}" y2="{MY}" stroke="{COLD}" stroke-width="3"/>'
              f'<text x="{M1X-100}" y="{MY-16}" font-size="12" font-weight="bold" text-anchor="middle" '
              f'fill="{COLD}">Ø16 קר · נק׳ 13</text>')
        g += _cabinets(None)
        g += (f'<line x1="{M2X+88}" y1="{MY+30}" x2="{M1X-88}" y2="{MY+30}" stroke="{HOT}" stroke-width="4.4"/>'
              f'<text x="{(M1X+M2X)//2}" y="{MY+52}" font-size="13" font-weight="bold" text-anchor="middle" '
              f'fill="{HOT}">Ø20 חם</text>')
        for label, pts, n, zone, x in MANIS:
            if label not in HOT_UNDER:
                g += _submani(x, label, "—", zone, "#c9d0d6", faded=True)
                continue
            hp, hn = HOT_UNDER[label]
            src = M1X if label in ("מש1", "מש2", "מש3", "מש4") else M2X
            g += (f'<path d="M{x},{SUBY} L{x},{MY+MYH+16} L{src},{MY+MYH+16} L{src},{MY+MYH}" '
                  f'fill="none" stroke="{HOT}" stroke-width="3.4"/>')
            g += _submani(x, label, hp, zone, HOT, stubs=hn)
        g += (f'<text x="{M1X+150}" y="{MY+MYH+52}" font-size="12" font-weight="bold" fill="{HOT}">Ø20</text>'
              f'<text x="{M1X+150}" y="{SUBY+SUBH+34}" font-size="12" font-weight="bold" fill="{HOT}">Ø16</text>')
    else:                                                     # W-04 — the loop
        g += (f'<rect x="{M1X-90}" y="120" width="180" height="52" fill="#fff1f2" stroke="{HOT}" stroke-width="3.4"/>'
              f'<text x="{M1X}" y="152" font-size="15" font-weight="bold" text-anchor="middle" fill="{HOT}">'
              f'דוד חשמלי 150 ל׳</text>')
        g += _cabinets(None)
        g += (f'<line x1="{M1X+40}" y1="172" x2="{M1X+40}" y2="{MY}" stroke="{HOT}" stroke-width="5"/>'
              f'<line x1="{M2X+88}" y1="{MY+30}" x2="{M1X-88}" y2="{MY+30}" stroke="{HOT}" stroke-width="4.4"/>'
              f'<text x="{(M1X+M2X)//2}" y="{MY+52}" font-size="12.5" font-weight="bold" text-anchor="middle" '
              f'fill="{HOT}">Ø20 חם — הלוך</text>')
        # the return: out of מ2, left, up, across to the pump, into the boiler
        g += (f'<path d="M{M2X},{MY} L{M2X},232 L{M1X-96},232" fill="none" stroke="{RET}" '
              f'stroke-width="4" stroke-dasharray="13 9"/>'
              f'<line x1="{M1X-96}" y1="232" x2="{M1X-96}" y2="146" stroke="{RET}" stroke-width="4" '
              f'stroke-dasharray="13 9"/>'
              f'<line x1="{M1X-96}" y1="146" x2="{M1X-90}" y2="146" stroke="{RET}" stroke-width="4"/>'
              f'<circle cx="450" cy="232" r="26" fill="#fff" stroke="{RET}" stroke-width="3.4"/>'
              f'<path d="M439,219 L468,232 L439,245 Z" fill="{RET}"/>'
              f'<text x="450" y="196" font-size="12.5" font-weight="bold" text-anchor="middle" fill="{RET}">'
              f'משאבת סחרור</text>'
              f'<path d="M552,219 L552,245 L574,232 Z" fill="none" stroke="{RET}" stroke-width="3"/>'
              f'<line x1="576" y1="219" x2="576" y2="245" stroke="{RET}" stroke-width="3.4"/>'
              f'<text x="566" y="278" font-size="12.5" font-weight="bold" text-anchor="middle" fill="{RET}">'
              f'מגוף אל־חוזר</text>'
              f'<text x="{M2X-100}" y="226" font-size="13" font-weight="bold" text-anchor="start" fill="{RET}">'
              f'קו מחזור Ø16 — חוזר</text>')
        for label, pts, n, zone, x in MANIS:
            g += _submani(x, label, "", zone, "#c9d0d6", faded=True)
        g += (f'<text x="410" y="{SUBY-24}" font-size="12" text-anchor="middle" fill="#5a6672">'
              f'המחלקים והמחלקים המשניים — רקע להתמצאות</text>')
    return f'<svg width="100%" height="100%" viewBox="0 0 {SW} {SH}" preserveAspectRatio="xMidYMid meet">{g}</svg>'


def _submani(x, label, pts, zone, colour, faded=False, stubs=0):
    fill = "#f4f6f8" if faded else "#eef4ff"
    stroke = "#c9d0d6" if faded else NAVY
    tcol = "#9aa4ad" if faded else NAVY
    g = (f'<rect x="{x-40}" y="{SUBY}" width="80" height="{SUBH}" fill="{fill}" '
         f'stroke="{stroke}" stroke-width="2.6"/>'
         f'<text x="{x}" y="{SUBY+26}" font-size="14" font-weight="bold" text-anchor="middle" '
         f'fill="{tcol}">{label}</text>')
    if pts and pts != "—" and stubs:
        step = 11 if stubs > 4 else 14
        first = x - step * (stubs - 1) / 2
        for k in range(stubs):
            g += (f'<line x1="{first + k * step}" y1="{SUBY+SUBH}" x2="{first + k * step}" '
                  f'y2="{SUBY+SUBH+22}" stroke="{colour}" stroke-width="2.6"/>')
        g += (f'<text x="{x}" y="{SUBY+SUBH+46}" font-size="13" font-weight="bold" text-anchor="middle" '
              f'fill="#1a1a1a">{pts}</text>')
    cy = SUBY + SUBH + (72 if (pts and pts != "—" and stubs) else 22)
    g += (f'<text x="{x}" y="{cy}" font-size="10.5" text-anchor="middle" '
          f'fill="{"#9aa4ad" if faded else "#374151"}">{zone}</text>')
    return g


SCHEM_TITLE = {
    "W-02": "סכמת מים קרים — Ø25 ראשי → Ø20 לאיזור → Ø16 לנקודה",
    "W-03": "סכמת מים חמים — דוד → מחלק → Ø20 לאיזור → Ø16 לנקודה",
    "W-04": "סכמת קו המחזור — דוד → מ1 → מ2 → קו חוזר Ø16 → דוד",
}
SCHEM_FOOT = {
    "W-02": "מכל מחלק קו Ø20 אחד לכל איזור → מחלק משני (מש) → קו Ø16 ייעודי לכל נקודה · המספרים לפי טבלת נקודות המים",
    "W-03": "רק מחלקי המשנה שיש בהם נקודות חם מוזנים; המספרים לפי טבלת נקודות החם שבגיליון זה",
    "W-04": "לולאה אחת Ø16, ≈22 מ׳ הלוך־חזור · משאבת סחרור ומגוף אל־חוזר על קו החוזר · סדר ההתקנה לפי הפרט",
}


def schem_html(sheet):
    x0, y0, x1, y1 = SCHEM_RECT
    return (f'<div class="blk schem" style="left:{x0}pt;top:{y0}pt;width:{x1-x0}pt;height:{y1-y0}pt;'
            f'display:flex;flex-direction:column">'
            f'<div class="st">{SCHEM_TITLE[sheet]}</div>'
            f'<div style="flex:1 1 auto;min-height:0;padding:2pt 5pt 0">{schem_svg(sheet)}</div>'
            f'<div class="sfoot">{SCHEM_FOOT[sheet]}</div>'
            f'<div class="sindex">{set_index(sheet)}</div></div>')


def set_index(sheet):
    key = sheet.replace("-", "‑")
    parts = []
    for k, v in (("W‑01", "כל המערכות (מקור)"), ("W‑02", "מים קרים"),
                 ("W‑03", "מים חמים"), ("W‑04", "קו מחזור")):
        parts.append(f'<b>{k}</b> {v}' if k == key else f'{k} {v}')
    return "סט גיליונות המים: " + " · ".join(parts)


# ----------------------------------------------------------------- bottom band
def points_table(sheet):
    if sheet == "W-04":
        rows = "".join(f'<tr><td class="nm" style="font-weight:bold;width:96pt">{k}</td>'
                       f'<td class="nm">{v}</td></tr>' for k, v in LOOP_ROWS)
        return (f'<h3>נתוני קו המחזור</h3><table>{rows}</table>'
                f'<div class="tfoot">{FOOT[sheet]}</div>')
    if sheet == "W-03":
        rows = [p for p in POINTS if p[0] in HOT_POINTS]
        head = '<tr><th style="width:22pt">מס׳</th><th>נקודה / צרכן</th><th style="width:34pt">חם</th>' \
               '<th style="width:34pt">קר</th><th style="width:52pt">מחלק·מש</th></tr>'
        body = "".join(f'<tr><td>{n}</td><td class="nm">{nm}</td><td>{hot}</td><td>{cold}</td><td>{mm}</td></tr>'
                       for n, nm, cold, hot, mm in rows)
        extra = ('<tr style="background:#fbfbfc"><td>13</td>'
                 '<td class="nm">דוד חשמלי 150 ל׳ — הזנת קר; יציאת החם אל מ1</td>'
                 '<td>—</td><td>Ø16</td><td>מ1·מש2</td></tr>')
        return (f'<h3>טבלת נקודות מים חמים</h3><table>{head}{body}{extra}</table>'
                f'<div class="tfoot">{FOOT[sheet]}</div>')
    half = 13
    def col(rows):
        head = '<tr><th style="width:20pt">מס׳</th><th>נקודה / צרכן</th><th style="width:32pt">קר</th>' \
               '<th style="width:48pt">מחלק·מש</th></tr>'
        body = "".join(f'<tr><td>{n}</td><td class="nm">{nm}</td><td>{cold}</td><td>{mm}</td></tr>'
                       for n, nm, cold, hot, mm in rows)
        return f'<table>{head}{body}</table>'
    return (f'<h3>טבלת נקודות מים</h3>'
            f'<div style="display:flex;gap:8pt">'
            f'<div style="flex:1">{col(POINTS[:half])}</div>'
            f'<div style="flex:1">{col(POINTS[half:])}</div></div>'
            f'<div class="tfoot">{FOOT[sheet]}</div>')


def band_html(sheet):
    name, sub, colour = TITLES[sheet]
    x0, y0, x1, y1 = BAND_RECT
    rows = [("פרויקט", "דירת קרקע · בניין 6 קומות מעל קומת עמודים"),
            ("היקף", "דירה + 3 מרפסות + חצר כניסה וחנייה פרטית"),
            ("קנה מידה", "1:50 · גיליון A2"),
            ("מס' גיליון", f'<b style="font-size:12.42pt">{sheet}</b>'),
            ("מקור", "פוצל מגיליון W‑01 · אותה גיאומטריה"),
            ("מהדורה", "01 — לאחר הערות המזמין (03.09.2026)"),
            ("תאריך", "03.09.2026"),
            ("מתכנן / רישיון", "______________________"),
            ("יזם / מזמין", "______________________")]
    trs = "".join(f'<tr><td class="k">{k}</td><td>{v}</td></tr>' for k, v in rows)
    tb = (f'<div class="col tb" style="left:{BAND_SPLIT-x0+13}pt;width:{x1-BAND_SPLIT-26}pt;padding-top:9pt">'
          f'<div class="big">תכנון מערכות</div>'
          f'<div class="sub">אינסטלציה · ביוב · מיזוג אוויר · חשמל</div>'
          f'<div class="sheet" style="color:{colour}">{name}</div>'
          f'<div class="sheet2">{sub}</div>'
          f'<table>{trs}</table></div>')
    notes = "".join(f'<li>{n}</li>' for n in NOTES[sheet])
    nt = (f'<div class="col" style="left:{NOTES_X[0]-x0}pt;width:{NOTES_X[1]-NOTES_X[0]}pt;padding-top:9pt">'
          f'<h3>הערות כלליות</h3><ol class="notes">{notes}</ol></div>')
    tbl = (f'<div class="col" style="left:{TABLE_X[0]-x0}pt;width:{TABLE_X[1]-TABLE_X[0]}pt;padding-top:9pt">'
           f'{points_table(sheet)}</div>')
    return (f'<div class="blk band" style="left:{x0}pt;top:{y0}pt;width:{x1-x0}pt;height:{y1-y0}pt;'
            f'position:absolute">'
            f'<div style="position:absolute;left:{BAND_SPLIT-x0}pt;top:0;width:1.06pt;height:100%;'
            f'background:#1a1a1a"></div>{tb}{nt}{tbl}</div>')


def page(sheet):
    return (f'<!doctype html><meta charset="utf-8"><style>{CSS}</style>'
            f'{legend_html(sheet)}{schem_html(sheet)}{band_html(sheet)}')
