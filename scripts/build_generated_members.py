from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "mai": Path("/Users/Raft/.codex/generated_images/01a003ff-81f5-7be0-8ca8-85c2be460930/exec-4d858ee7-56df-4e89-9ad8-3662acf13635.png"),
    "yansan": Path("/Users/Raft/.codex/generated_images/01a003ff-81f5-7be0-8ca8-85c2be460930/exec-d7ce54fb-682e-42aa-a883-fcb8e491bde7.png"),
    "muto": Path("/Users/Raft/.codex/generated_images/01a003ff-81f5-7be0-8ca8-85c2be460930/exec-5ef32974-b449-4682-a242-152a5e169ab1.png"),
    "moron": Path("/Users/Raft/.codex/generated_images/01a003ff-81f5-7be0-8ca8-85c2be460930/exec-9e2887bf-6e70-4674-9434-0005daede024.png"),
}


def dilate(mask, radius):
    out = mask.copy()
    for _ in range(radius):
        p = np.pad(out, 1)
        out = np.logical_or.reduce([
            p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:],
            p[:-2, :-2], p[:-2, 2:], p[2:, :-2], p[2:, 2:], out,
        ])
    return out


def hair_core(slug, rgb, yy):
    r, g, b = [rgb[..., i].astype(np.int16) for i in range(3)]
    green = (g > 145) & (g > r * 1.55) & (g > b * 1.55)
    peach = (r > 170) & (g > 120) & (b > 95) & (r > b * 1.08)
    if slug == "mai":
        color = ((np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b]) < 72) & (r > 70))
        limit = yy < 800
    elif slug == "yansan":
        brown = (r > 45) & (r > g * 1.12) & (g > b * 1.14) & (b < 105)
        blue = (b > 65) & (b > r * 1.22) & (b > g * 1.08)
        color = brown | blue
        limit = yy < 750
    elif slug == "muto":
        white = (np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b]) < 65) & (r > 85)
        navy = (b > 28) & (b > r * 1.16) & (b > g * 1.10)
        color = white | navy
        limit = yy < 870
    else:
        color = (r > 125) & (g > 55) & (b < 105) & (r > g * 1.15)
        limit = yy < 920
    return color & limit & ~green & ~peach, green


def save_layer(rgb, mask, path, darken=1.0):
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(rgb * darken, 0, 255).astype(np.uint8)
    rgba[..., 3] = mask.astype(np.uint8) * 255
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def build(slug, source):
    target = ROOT / "members" / slug / "parts"
    cleaned = target / "cleaned"
    source_dir = target / "source"
    cleaned.mkdir(parents=True, exist_ok=True)
    source_dir.mkdir(parents=True, exist_ok=True)
    image = Image.open(source).convert("RGBA")
    image.save(source_dir / "generated-v1.png", optimize=True)
    arr = np.array(image)
    rgb = arr[..., :3]
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    core, green = hair_core(slug, rgb, yy)
    non_green = ~green
    hair = dilate(core, 5) & non_green & (yy < (930 if slug == "moron" else 880))

    # Remove the movable hair from the body/face plate. The full dark rear plate
    # below the moving pieces guarantees that no green scalp gap can be exposed.
    base = arr.copy()
    base[hair, :3] = (0, 255, 0)
    base[hair, 3] = 255
    Image.fromarray(base, "RGBA").save(cleaned / "base.png", optimize=True)

    save_layer(rgb, hair, cleaned / "hair-seam-cap-v6.png", 0.86)
    save_layer(rgb, hair, cleaned / "hair.png")

    # Semantic, non-identical regions. Each pixel belongs to a real section;
    # only a narrow seam overlap is used so slight rotations cannot open holes.
    side = ((xx < 395) | (xx > 860)) & (yy > 300)
    center_under = (xx >= 500) & (xx < 755) & (yy >= 430) & (yy < 620)
    upper = yy < 480
    back = hair & (side | center_under)
    upper_mask = hair & upper & ~side & ~center_under
    front = hair & ~(back | upper_mask)
    groups = {"back": back, "upper": upper_mask, "front": front}
    cuts = [(0, 520), (500, 755), (735, w)]
    names = {"back": "hair-back", "upper": "hair-upper", "front": "hair-front"}
    for group, group_mask in groups.items():
        save_layer(rgb, group_mask, cleaned / f"{names[group]}-v4.png")
        for index, (left, right) in enumerate(cuts, 1):
            piece = group_mask & (xx >= left) & (xx < right)
            save_layer(rgb, piece, cleaned / f"{names[group]}-{index}-v13.png")

    # Legacy loader names remain tiny aliases of the current semantic layers.
    save_layer(rgb, back, cleaned / "hair-back-v5.png")
    save_layer(rgb, back, cleaned / "hair-back-v4.png")
    save_layer(rgb, back, cleaned / "hair-back.png")
    save_layer(rgb, upper_mask, cleaned / "hair-upper.png")


for slug, source in SOURCES.items():
    build(slug, source)
    print(f"built {slug}")
