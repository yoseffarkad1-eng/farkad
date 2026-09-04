"""Delete painted units from a content stream without disturbing anything else."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from units import parse, hexc

def hide(data, units, drop_idx):
    """Return a new stream with the given units erased.

    A path is erased by turning its paint operator into `n` (same byte length,
    so clipping paths and the q/Q stack are untouched).  A glyph run is erased by
    blanking the show operator and its operand, which keeps BT/ET, marked content
    and the text matrix intact — an unbalanced EMC would break every later page
    object, and no label is worth that.
    """
    edits = []
    for i in drop_idx:
        u = units[i]
        if u.kind == "path":
            s, e = u.paint_at
            edits.append((s, e, b"n" + b" " * (e - s - 1)))
        else:
            for s, e in u.spans:
                edits.append((s, e, b" " * (e - s)))
    edits.sort()
    out = bytearray(data)
    for s, e, rep in edits:
        out[s:e] = rep
    return bytes(out)
