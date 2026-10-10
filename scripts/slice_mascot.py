"""Slice a 4/3/3 mascot sheet into individual transparent WebP poses.

usage: python slice_mascot.py <out_root> <season>=<sheet> [<season>=<sheet> ...]
All seasons share one canvas size per kind (body / face) so poses swap without jumping.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# Reading order on the sheet (row 1: 4 bodies, row 2: 3 bodies, row 3: 3 busts).
NAMES = [
    ("wave-hello", "body"), ("oops-sorry", "body"), ("waiting-watch", "body"), ("hold-on", "body"),
    ("trophy-champion", "body"), ("napping", "body"), ("welcome-open-arms", "body"),
    ("face-sad", "face"), ("face-worried", "face"), ("face-sleepy", "face"),
]
PAD = 12


def cut_out(rgb: np.ndarray):
    """Return (rgba float, figure labels) with the white sheet background removed."""
    f = rgb.astype(np.float32)
    mn, mx = f.min(axis=2), f.max(axis=2)
    light = (mn > 200) & ((mx - mn) < 40)  # white paper + pale grey ground shadows
    lab, _ = ndi.label(light)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    # include a 2px ring of anti-aliased edge pixels
    soft = ndi.binary_dilation(bg, iterations=2)

    # colour-to-alpha against white: pale shadows become translucent dark shadows,
    # anti-aliased edges lose their white halo.
    alpha = np.ones(mn.shape, np.float32)
    a = ((255.0 - f[soft]) / 255.0).max(axis=1)
    alpha[soft] = a
    out = f.copy()
    safe = np.maximum(a, 1e-3)[:, None]
    out[soft] = np.clip((f[soft] - 255.0 * (1 - safe)) / safe, 0, 255)
    alpha[alpha < 0.03] = 0

    fg = alpha > 0.15
    fg = ndi.binary_opening(fg, iterations=1)
    # Big blobs are the figures; small ones (sparkle lines, "zzz", a dropped ball) are
    # given to whichever figure is nearest.
    seeds, n = ndi.label(ndi.binary_dilation(fg, iterations=6))
    sizes = ndi.sum(fg, seeds, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 20000]
    seeds[~np.isin(seeds, keep)] = 0
    _, (iy, ix) = ndi.distance_transform_edt(seeds == 0, return_indices=True)
    grouped = np.where(alpha > 0, seeds[iy, ix], 0)
    rgba = np.dstack([out, alpha * 255.0])
    return rgba, grouped, keep


def order(grouped, keep):
    objs = ndi.find_objects(grouped)
    boxes = [(k, objs[k - 1]) for k in keep]
    # cluster into rows by vertical centre, then left-to-right
    boxes.sort(key=lambda b: (b[1][0].start + b[1][0].stop) / 2)
    rows, cur, last = [], [], None
    for b in boxes:
        cy = (b[1][0].start + b[1][0].stop) / 2
        if last is not None and cy - last > 150:
            rows.append(cur)
            cur = []
        cur.append(b)
        last = cy
    rows.append(cur)
    return [b for r in rows for b in sorted(r, key=lambda b: b[1][1].start)]


def main():
    out_root = Path(sys.argv[1])
    sheets = [arg.split("=", 1) for arg in sys.argv[2:]]
    crops = {}
    for season, path in sheets:
        rgba, grouped, keep = cut_out(np.array(Image.open(path).convert("RGB")))
        figs = order(grouped, keep)
        if len(figs) != len(NAMES):
            sys.exit(f"{path}: found {len(figs)} figures, expected {len(NAMES)}")
        for (name, kind), (k, sl) in zip(NAMES, figs):
            region = rgba[sl].copy()
            region[..., 3] *= grouped[sl] == k  # drop bits of neighbouring figures
            ys, xs = np.nonzero(region[..., 3] > 8)
            region = region[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
            crops[(season, name)] = (kind, region)

    for kind in ("body", "face"):
        sel = [r for (k, r) in crops.values() if k == kind]
        W = max(r.shape[1] for r in sel) + 2 * PAD
        H = max(r.shape[0] for r in sel) + 2 * PAD
        for (season, name), (k, r) in crops.items():
            if k != kind:
                continue
            canvas = np.zeros((H, W, 4), np.float32)
            y0 = H - PAD - r.shape[0]  # bottom-aligned: feet / bust edge on one baseline
            x0 = (W - r.shape[1]) // 2
            canvas[y0: y0 + r.shape[0], x0: x0 + r.shape[1]] = r
            dest = out_root / season / f"{name}.webp"
            dest.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(canvas.round().astype(np.uint8), "RGBA").save(dest, quality=92, method=6)
            print(f"{dest}  {W}x{H}")


if __name__ == "__main__":
    main()
