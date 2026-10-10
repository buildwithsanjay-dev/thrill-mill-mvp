"""Slice Indie mascot sheets into individual transparent WebP poses.

usage (from the repo root; needs Pillow, NumPy, SciPy):
  python scripts/slice_mascot.py <out_root> <season>=<sheet>:<layout> [...]

layouts:
  moods    indie-2d-sheet-2 layout — 4 bodies / 3 bodies / 3 busts
  actions  indie-2d-sheet layout   — big hero / 5 turnaround / 4 action bodies / 6 busts

Every season gets the same file names. All bodies share one canvas, all faces another, both
bottom-aligned, and the actions sheet (drawn at a smaller scale) is resized to match the moods
sheet — so swapping pose or season never makes Indie jump or change size. Always pass the base
sheets in the same run as a new season so the shared canvases cover every season.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

PAD = 12
SKIP = None
# Rows top-to-bottom, figures left-to-right. "ref-*" figures are measured for scaling, not saved.
LAYOUTS = {
    "moods": [
        [("wave-hello", "body"), ("oops-sorry", "body"), ("waiting-watch", "body"), ("hold-on", "body")],
        [("trophy-champion", "body"), ("napping", "body"), ("welcome-open-arms", "body")],
        [("face-sad", "face"), ("face-worried", "face"), ("face-sleepy", "face")],
    ],
    "actions": [
        [("hero-standing", "hero")],
        [("turnaround-front", "ref-body"), SKIP, SKIP, SKIP, SKIP],
        [("run-lets-go", "body"), ("celebrate-jump", "body"), ("wink-nice", "body"), ("throw-game-on", "body")],
        [("face-smile", "face"), ("face-wink", "face"), ("face-excited", "face"),
         ("face-surprised", "face"), ("face-thinking", "face"), ("face-laughing", "face")],
    ],
}
# Same standing pose / same bust framing on both sheets, used to match their scales.
SCALE_REFS = {"body": ("waiting-watch", "turnaround-front"), "face": ("face-worried", "face-smile")}


def cut_out(rgb: np.ndarray):
    """Return (rgba float, per-pixel figure label, figure labels) with the white sheet removed."""
    f = rgb.astype(np.float32)
    mn, mx = f.min(axis=2), f.max(axis=2)
    light = (mn > 200) & ((mx - mn) < 40)  # white paper + pale grey ground shadows
    lab, _ = ndi.label(light)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    soft = ndi.binary_dilation(bg, iterations=2)  # + 2px ring of anti-aliased edge pixels

    # colour-to-alpha against white: pale shadows become translucent dark shadows,
    # anti-aliased edges lose their white halo.
    alpha = np.ones(mn.shape, np.float32)
    a = ((255.0 - f[soft]) / 255.0).max(axis=1)
    alpha[soft] = a
    out = f.copy()
    safe = np.maximum(a, 1e-3)[:, None]
    out[soft] = np.clip((f[soft] - 255.0 * (1 - safe)) / safe, 0, 255)
    alpha[alpha < 0.03] = 0

    fg = ndi.binary_opening(alpha > 0.15, iterations=1)
    # Big blobs are the figures. Each small blob (sparkle lines, "zzz", "?", a star, a dropped
    # ball) goes WHOLE to the nearest figure in its own row, so a mark sitting between two
    # figures or two rows is never split or handed to the wrong one.
    blobs, n = ndi.label(ndi.binary_dilation(fg, iterations=1))
    sizes = ndi.sum(fg, blobs, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 8000]
    seeds = np.where(np.isin(blobs, keep), blobs, 0)
    objs = ndi.find_objects(blobs)
    bands = [(min(objs[k - 1][0].start for k, _ in r), max(objs[k - 1][0].stop for k, _ in r), [k for k, _ in r])
             for r in rows_of(seeds, keep)]
    dist = {k: ndi.distance_transform_edt(seeds != k) for k in keep}
    for i in range(1, n + 1):
        if i in keep or sizes[i - 1] == 0:
            continue
        sl = objs[i - 1]
        cy = (sl[0].start + sl[0].stop) / 2
        cands = next((ks for top, bot, ks in bands if top <= cy <= bot), keep)
        mask = blobs[sl] == i
        best = min(cands, key=lambda k: dist[k][sl][mask].min())
        seeds[sl][mask] = best
    # faint pixels outside every blob (soft shadow edges) follow the nearest figure pixel
    _, (iy, ix) = ndi.distance_transform_edt(seeds == 0, return_indices=True)
    grouped = np.where(alpha > 0, seeds[iy, ix], 0)
    return np.dstack([out, alpha * 255.0]), grouped, keep


def rows_of(grouped, keep):
    objs = ndi.find_objects(grouped)
    boxes = sorted(((k, objs[k - 1]) for k in keep), key=lambda b: (b[1][0].start + b[1][0].stop) / 2)
    rows, cur, last = [], [], None
    for b in boxes:
        cy = (b[1][0].start + b[1][0].stop) / 2
        if last is not None and cy - last > 150:
            rows.append(cur)
            cur = []
        cur.append(b)
        last = cy
    rows.append(cur)
    return [sorted(r, key=lambda b: b[1][1].start) for r in rows]


def resize(region: np.ndarray, scale: float) -> np.ndarray:
    if abs(scale - 1) < 0.01:
        return region
    h, w = region.shape[:2]
    size = (round(w * scale), round(h * scale))
    a = region[..., 3:] / 255.0
    pre = np.dstack([region[..., :3] * a, region[..., 3]])  # premultiply so edges don't darken
    chans = [np.asarray(Image.fromarray(pre[..., i].astype(np.float32), "F").resize(size, Image.LANCZOS))
             for i in range(4)]
    out = np.clip(np.dstack(chans), 0, 255)
    a2 = np.maximum(out[..., 3:] / 255.0, 1e-6)
    out[..., :3] = np.where(out[..., 3:] > 0, np.clip(out[..., :3] / a2, 0, 255), 0)
    return out


def main():
    out_root = Path(sys.argv[1])
    crops = {}  # (season, name) -> (kind, rgba)
    layouts = {}  # season -> set of layouts used
    for arg in sys.argv[2:]:
        season, rest = arg.split("=", 1)
        path, layout = rest.rsplit(":", 1)
        rgba, grouped, keep = cut_out(np.array(Image.open(path).convert("RGB")))
        rows = rows_of(grouped, keep)
        spec = LAYOUTS[layout]
        got = [len(r) for r in rows]
        if got != [len(r) for r in spec]:
            sys.exit(f"{path}: found rows {got}, expected {[len(r) for r in spec]}")
        for spec_row, row in zip(spec, rows):
            for entry, (k, sl) in zip(spec_row, row):
                if entry is SKIP:
                    continue
                name, kind = entry
                region = rgba[sl].copy()
                region[..., 3] *= grouped[sl] == k  # drop bits of neighbouring figures
                ys, xs = np.nonzero(region[..., 3] > 8)
                crops[(season, name)] = (kind, region[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1])
        layouts.setdefault(season, set()).add(layout)

    # Bring the actions sheet to the moods sheet's scale (per season, falling back to base).
    def scale_for(season, kind):
        big, small = SCALE_REFS[kind]
        for s in (season, "base"):
            if (s, big) in crops and (s, small) in crops:
                return crops[(s, big)][1].shape[0] / crops[(s, small)][1].shape[0]
        sys.exit(f"no {kind} scale reference for {season}: pass both base sheets")

    # measure every scale before resizing anything (resizing a reference would skew the rest)
    scales = {(s, k): scale_for(s, k) for s in layouts if "actions" in layouts[s] for k in SCALE_REFS}
    for (season, name), (kind, r) in list(crops.items()):
        if kind in ("body", "face") and name in _names("actions"):
            crops[(season, name)] = (kind, resize(r, scales[(season, kind)]))

    for kind in ("body", "face", "hero"):
        sel = [r for (k, r) in crops.values() if k == kind]
        W = max(r.shape[1] for r in sel) + 2 * PAD
        H = max(r.shape[0] for r in sel) + 2 * PAD
        for (season, name), (k, r) in sorted(crops.items()):
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


def _names(layout):
    return {e[0] for row in LAYOUTS[layout] for e in row if e is not SKIP and e[1] != "ref-body"}


if __name__ == "__main__":
    main()
