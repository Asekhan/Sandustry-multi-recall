"""Research node icons: the Recall Shard's 16x16 icon with the portal cap (2, 5, 10) in a 3x5 pixel font,
bottom-right, white on a dark outline. Writes src/sprites/net<N>.png; build.py copies them into mod/sprites.
Needs Pillow; run only when the icons change (the PNGs are committed).

    python -I tools/make_icons.py [path to recall_shard_icon.png]
"""
import pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = sys.argv[1] if len(sys.argv) > 1 else (ROOT.parent.parent.parent / "Sandustry Art" / "references" / "sandustry-sprites"
                                            / "raw" / "vanilla-installed" / "dist" / "mods" / "recall_shard_icon.png")
DIGITS = {"0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
          "2": ["111", "001", "111", "100", "111"], "5": ["111", "100", "111", "001", "111"]}

for cap in ("2", "5", "10"):
    im = Image.open(SRC).convert("RGBA")
    w = 4 * len(cap) - 1
    x0, y0 = 16 - w - 1, 16 - 5 - 1  # 1 px margin for the outline
    on = {(x0 + 4 * i + x, y0 + y) for i, ch in enumerate(cap) for y, row in enumerate(DIGITS[ch]) for x, c in enumerate(row) if c == "1"}
    for (x, y) in on:  # outline first
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if 0 <= x + dx < 16 and 0 <= y + dy < 16 and (x + dx, y + dy) not in on:
                    im.putpixel((x + dx, y + dy), (16, 12, 24, 255))
    for p in on:
        im.putpixel(p, (255, 255, 255, 255))
    out = ROOT / "src" / "sprites" / f"net{cap}.png"
    im.save(out)
    print(out)
