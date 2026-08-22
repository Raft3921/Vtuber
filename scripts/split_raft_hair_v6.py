from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "members/raft/parts/cleaned/hair-master-v5.png"
OUT = ROOT / "members/raft/parts/cleaned"

src = Image.open(SOURCE).convert("RGBA")
alpha = src.getchannel("A")
w, h = src.size

# All files keep the original 1254px coordinate system.  The overlaps are
# deliberate hidden roots, so a rotating lock never opens a scalp gap.
x_ranges = [(250, 522), (504, 768), (750, 1010)]
groups = {
    "back": lambda x, y: y >= 465 or (y >= 360 and (x < 390 or x > 870)),
    "upper": lambda x, y: y <= 375,
    "front": lambda x, y: 350 <= y <= 700,
}

for group, accepts in groups.items():
    for index, (x0, x1) in enumerate(x_ranges, 1):
        mask = Image.new("L", (w, h), 0)
        pixels = mask.load()
        source_alpha = alpha.load()
        for y in range(h):
            for x in range(max(0, x0), min(w, x1)):
                if source_alpha[x, y] and accepts(x, y):
                    pixels[x, y] = source_alpha[x, y]
        piece = src.copy()
        piece.putalpha(mask)
        piece.save(OUT / f"hair-{group}-{index}-v6.png", optimize=True)

# Narrow internal cover drawn above the face but below all moving locks.
# It only occupies the group boundary, avoiding a second visible hairstyle.
seam_mask = Image.new("L", (w, h), 0)
seam_pixels = seam_mask.load()
source_alpha = alpha.load()
for y in range(330, 430):
    for x in range(w):
        seam_pixels[x, y] = source_alpha[x, y]
seam = src.copy()
seam.putalpha(seam_mask)
seam.save(OUT / "hair-seam-cap-v6.png", optimize=True)
