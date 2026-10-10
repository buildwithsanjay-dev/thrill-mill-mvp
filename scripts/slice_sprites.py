"""Cut a season's decoration sheets (white background) into individual transparent WebPs.

usage (from the repo root; needs Pillow, NumPy, SciPy):
  python scripts/slice_sprites.py scripts/sprite_specs/halloween.json

The spec lists every raw sheet, how to cut it and what to name each piece (reading order:
rows top-to-bottom, left-to-right; null = skip that piece). Modes:
  color  full-colour art: white background removed, edges de-haloed
  mask   flat black art: saved as WHITE with alpha = darkness, so the app can tint it any colour
Scenes are full-bleed backgrounds: optionally paint out a watermark box, then re-encode.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

PAD = 8


def color_cut(f: np.ndarray, holes_min: int) -> np.ndarray:
    """RGBA float from an RGB float sheet with a white background (colour-to-alpha on the bg)."""
    mn, mx = f.min(axis=2), f.max(axis=2)
    light = (mn > 200) & ((mx - mn) < 40)
    lab, n = ndi.label(light)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    if holes_min:  # big enclosed white areas (e.g. the inside of a ring) are background too
        sizes = ndi.sum(light, lab, range(1, n + 1))
        bg |= np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= holes_min])
    soft = ndi.binary_dilation(bg, iterations=2)
    alpha = np.ones(mn.shape, np.float32)
    a = ((255.0 - f[soft]) / 255.0).max(axis=1)
    alpha[soft] = a
    out = f.copy()
    safe = np.maximum(a, 1e-3)[:, None]
    out[soft] = np.clip((f[soft] - 255.0 * (1 - safe)) / safe, 0, 255)
    alpha[alpha < 0.03] = 0
    return np.dstack([out, alpha * 255.0])


def mask_cut(f: np.ndarray) -> np.ndarray:
    lum = f.mean(axis=2)
    alpha = np.clip((255.0 - lum) / 255.0 * 1.15, 0, 1)
    alpha[alpha < 0.06] = 0
    return np.dstack([np.full(lum.shape + (3,), 255.0), alpha * 255.0])


def pieces(rgba: np.ndarray, merge: int, min_area: int):
    """Label pieces: blobs closer than `merge` px are one piece; returns rows of (label, slice)."""
    fg = rgba[..., 3] > 30
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=merge))
    lab = np.where(fg | (rgba[..., 3] > 0), lab, 0)
    # a piece sitting mostly inside another's box belongs with it (a star tucked in a moon's curve)
    parent = list(range(n + 1))

    def root(i):
        while parent[i] != i:
            i = parent[i]
        return i

    def area(s):
        return (s[0].stop - s[0].start) * (s[1].stop - s[1].start)

    objs = ndi.find_objects(lab)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = objs[i], objs[j]
            if not (a and b):
                continue
            ih = min(a[0].stop, b[0].stop) - max(a[0].start, b[0].start)
            iw = min(a[1].stop, b[1].stop) - max(a[1].start, b[1].start)
            if ih > 0 and iw > 0 and ih * iw > 0.5 * min(area(a), area(b)):
                parent[root(j + 1)] = root(i + 1)
    lab = np.array([root(i) for i in range(n + 1)])[lab]
    sizes = ndi.sum(fg, lab, range(1, n + 1))
    objs = ndi.find_objects(lab, max_label=n)
    boxes = sorted(((i + 1, objs[i]) for i in range(n) if objs[i] and sizes[i] >= min_area),
                   key=lambda b: (b[1][0].start + b[1][0].stop) / 2)
    rows, cur = [], []
    for b in boxes:  # same row while vertical spans overlap
        if cur and b[1][0].start > max(c[1][0].stop for c in cur):
            rows.append(cur)
            cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    return lab, [b for r in rows for b in sorted(r, key=lambda b: b[1][1].start)]


def body_centre(alpha: np.ndarray):
    """Centre of the chunky body (thin wings eroded away) — keeps animation frames aligned."""
    core = ndi.binary_erosion(alpha > 128, iterations=18)
    if not core.any():
        core = alpha > 128
    return ndi.center_of_mass(core)


def save(rgba: np.ndarray, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba.round().astype(np.uint8), "RGBA").save(dest, quality=92, method=6)
    print(f"{dest}  {rgba.shape[1]}x{rgba.shape[0]}")


def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    raw, out = Path(spec["raw_dir"]), Path(spec["out_dir"])

    for sc in spec.get("scenes", []):
        img = np.array(Image.open(raw / sc["src"]).convert("RGB"))
        for x0, y0, x1, y1 in sc.get("erase", []):
            shift = x1 - x0 + 20  # copy the same rows from just left of the box
            img[y0:y1, x0:x1] = img[y0:y1, x0 - shift: x1 - shift]
        dest = out / sc["out"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img).save(dest, quality=88, method=6)
        print(f"{dest}  {img.shape[1]}x{img.shape[0]}")

    for sh in spec["sheets"]:
        f = np.array(Image.open(raw / sh["src"]).convert("RGB")).astype(np.float32)
        rgba = mask_cut(f) if sh["mode"] == "mask" else color_cut(f, sh.get("holes_min", 0))
        lab, found = pieces(rgba, sh.get("merge", 10), sh.get("min_area", 150))
        names = sh["names"]
        if len(found) != len(names):
            sys.exit(f"{sh['src']}: found {len(found)} pieces, spec names {len(names)}")
        crops = []
        for name, (k, sl) in zip(names, found):
            if name is None:
                continue
            r = rgba[sl].copy()
            r[..., 3] *= lab[sl] == k
            ys, xs = np.nonzero(r[..., 3] > 4)
            crops.append((name, r[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]))

        if sh.get("frames"):  # animation frames: one canvas, bodies on the same spot
            centres = [body_centre(r[..., 3]) for _, r in crops]
            left = max(c[1] for c in centres)
            right = max(r.shape[1] - c[1] for (_, r), c in zip(crops, centres))
            up = max(c[0] for c in centres)
            down = max(r.shape[0] - c[0] for (_, r), c in zip(crops, centres))
            W, H = int(np.ceil(left + right)) + 2 * PAD, int(np.ceil(up + down)) + 2 * PAD
            for (name, r), (cy, cx) in zip(crops, centres):
                canvas = np.zeros((H, W, 4), np.float32)
                y0, x0 = int(round(PAD + up - cy)), int(round(PAD + left - cx))
                canvas[y0: y0 + r.shape[0], x0: x0 + r.shape[1]] = r
                save(canvas, out / f"{name}.webp")
        else:
            for name, r in crops:
                save(np.pad(r, ((PAD, PAD), (PAD, PAD), (0, 0))), out / f"{name}.webp")


if __name__ == "__main__":
    main()
