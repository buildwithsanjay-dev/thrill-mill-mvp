# Sign-in screen — animated wave (one 3-frame sheet, base + Halloween)

Same idea as the header bats' flap cycle (`SP1-bat-frames` in
`halloween-asset-prompts.md`) and the same sheet format — one landscape image
with all 3 frames side by side, cut apart afterward. The existing
`wave-hello` pose is frame 1 (arm raised high); this generates frames 2 and 3
in the same sheet so the arm sweeps down and out, completing one wave before
looping back to frame 1.

**One prompt per edition, one image each** — attach the current `wave-hello`
pose, ask for a 3-frame sheet that starts from that exact pose and adds the
two new arm positions beside it, same discipline as every other pose in
`mascot.md`: identical face, markings, outfit, proportions, camera angle,
ground shadow and background across all 3 frames — only the raised arm moves.

## Settings
Landscape **16:9** (ChatGPT) / **16:9** (Flow), plain white or transparent
background. Save into `assets/seasons-raw/mascot/` (base) or
`assets/seasons-raw/halloween/` (Halloween) — both gitignored; tell me once
saved and I'll cut the sheet into the 2 new frame files and wire up the
animation.

---

## Base edition → `wave-hello-frames.png`

**Attach:** `assets/seasons-raw/mascot/wave-hello.webp` (the current base pose)

```
Animation frame sheet: the SAME character as the attached reference image —
identical face, eyes, expression, head shape, markings, body proportions,
colours, outfit, camera angle, scale, position in frame, ground shadow and
background — shown 3 times in a single horizontal row, evenly spaced with
wide gaps between them, identical size and pose in every frame except the
raised arm:

FRAME 1 (leftmost): arm raised straight up, paw open in a wave — exactly
matching the attached reference image, unchanged.
FRAME 2 (middle): arm lowered from straight-up to roughly ear height, tilted
outward about 30 degrees, paw still open — the mid-swing of a friendly
side-to-side wave.
FRAME 3 (rightmost): arm extended out to the side at roughly shoulder
height, paw open in a wave — the far end of the same wave swing.

Landscape 16:9. No text, labels, numbers or dividers anywhere.
```

---

## Halloween edition → `halloween/wave-hello-frames.png`

**Attach:** `assets/seasons-raw/halloween/wave-hello.webp` (the current
Halloween-costumed pose — pumpkin mask worn pushed up like a visor, cape,
teal bandana) so the costume carries over automatically instead of being
re-described.

```
Animation frame sheet: the SAME character as the attached reference image —
identical face, eyes, expression, head shape, markings, pumpkin mask worn
pushed up on top of the head, cape, outfit, colours, camera angle, scale,
position in frame, ground shadow and background — shown 3 times in a single
horizontal row, evenly spaced with wide gaps between them, identical size
and pose in every frame except the raised arm:

FRAME 1 (leftmost): arm raised straight up, paw open in a wave — exactly
matching the attached reference image, unchanged.
FRAME 2 (middle): arm lowered from straight-up to roughly ear height, tilted
outward about 30 degrees, paw still open — the mid-swing of a friendly
side-to-side wave. Cape and mask unchanged from frame 1.
FRAME 3 (rightmost): arm extended out to the side at roughly shoulder
height, paw open in a wave — the far end of the same wave swing. Cape and
mask unchanged from frame 1.

Landscape 16:9. No text, labels, numbers or dividers anywhere.
```

---

## Check before saving
- All 3 frames read as the same character at the same size and distance —
  nothing jumps, zooms or shifts position between frames.
- Only the arm differs between frames — face, outfit, cape, ground shadow
  identical across all 3.
- Frame 1 genuinely matches the attached reference (not a redrawn version of
  it) — this preserves consistency with the `wave-hello.webp` already in the
  app.
- Even spacing, no overlap, nothing cropped at the edges.

If it comes out wrong, regenerate with the same prompt rather than accepting
a frame that drifts off-model.

## Once generated — tell me and I'll wire it up
I'll crop the sheet into 3 equal frames, save `wave-hello-mid.webp` and
`wave-hello-out.webp` into `mobile/assets/mascot/base/` and
`mobile/assets/mascot/halloween/` (frame 1 stays the existing
`wave-hello.webp`), and add a slow 3-frame cycle to the Sign-in screen's
mascot — the same technique already running for the header bats
(`HeaderBats.tsx`), just a calmer cadence.
