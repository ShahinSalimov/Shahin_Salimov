"""Finalizes YouTube metadata for Video #4 Ötzi: real chapter timestamps from timeline.json. Usage: meta.py ROOT"""
import sys, json, re, os
S = sys.argv[1]; HERE = os.path.dirname(os.path.abspath(__file__))
tl = json.load(open(f"{S}/timeline.json")); off = {int(k): v for k, v in tl["sec_off"].items()}
def ts(t): t = int(t); return f"{t // 60:02d}:{t % 60:02d}"
CH = [(1, "Cold open: a body in the ice"), (2, "Introduction"), (3, "The discovery, 1991"), (4, "Who was Ötzi?"),
      (5, "His clothes, his tools, his copper axe"), (6, "61 tattoos"), (7, "The last two days"), (8, "The arrowhead"),
      (9, "The suspects"), (10, "What we know vs. what we don't"), (11, "Outro")]
chap = "\n".join(f"{'00:00' if n == 1 else ts(off[n])} {t}" for n, t in CH)
src = open(f"{HERE}/YouTube_metadata_Otzi.txt").read()
src = re.sub(r"=== FULL VIDEO \(.*?\) ===", f"=== FULL VIDEO ({ts(tl['total'])}) ===", src)
src = re.sub(r"CHAPTERS.*?\n\n", "CHAPTERS\n" + chap + "\n\n", src, flags=re.S)
open(f"{S}/deliver/YouTube_metadata_Otzi.txt", "w").write(src); print(chap)
