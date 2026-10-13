# Sign-in screen — animated wave (2 new frames, base + Halloween)

Same idea as the header bats: a 3-frame cycle swapped on a timer reads as motion
with zero extra libraries. The existing `wave-hello` pose becomes frame 1 (arm
raised high); this generates frames 2 and 3 so the arm sweeps down and out,
completing one wave before looping back to frame 1.

**Do this as an edit of the existing image, not a new generation** — same
discipline as every other pose in `mascot.md`: attach the current pose, change
only the one thing asked, keep everything else pixel-identical in spirit (same
face, markings, outfit, proportions, camera angle, ground shadow, background).

## Settings
Same as the rest of the asset pack (`halloween-asset-prompts.md`): ChatGPT
1024×1024 / Flow 1:1, plain white or transparent background, save every output
into `assets/seasons-raw/mascot/` (base) or `assets/seasons-raw/halloween/`
(Halloween) — gitignored, final cut-outs go to `mobile/assets/mascot/<season>/`
the same way `wave-hello.webp` already did.

---

## Base edition (2 prompts)

**Attach:** `assets/seasons-raw/mascot/wave-hello.webp` (the current base pose)
to both prompts below.

### Frame 2 — arm mid-wave → `wave-hello-mid.png`
```
Edit the attached image. Keep the character EXACTLY the same — same face,
eyes, expression, head shape and markings, body proportions, colours, outfit,
camera angle, size and position in the frame, ground shadow and background.
Change ONLY the raised arm: lower it from straight-up to roughly ear height,
tilted outward about 30 degrees, paw still open in a wave — mid-swing of a
friendly side-to-side wave. Everything else, including the rest of the pose,
stays identical. No text anywhere.
```

### Frame 3 — arm out → `wave-hello-out.png`
```
Edit the attached image. Keep the character EXACTLY the same — same face,
eyes, expression, head shape and markings, body proportions, colours, outfit,
camera angle, size and position in the frame, ground shadow and background.
Change ONLY the raised arm: extend it out to the side at roughly shoulder
height, paw open in a wave, as if mid-swing the opposite direction from
raised-straight-up — the far end of a friendly side-to-side wave. Everything
else, including the rest of the pose, stays identical. No text anywhere.
```

---

## Halloween edition (2 prompts)

**Attach:** `assets/seasons-raw/halloween/wave-hello.webp` (the current
Halloween-costumed pose — mask pushed up like a visor, cape, teal bandana) to
both prompts below, so the costume carries over automatically instead of
being re-described.

### Frame 2 — arm mid-wave → `halloween/wave-hello-mid.png`
```
Edit the attached image. Keep the character EXACTLY the same — same face,
eyes, expression, head shape, markings, pumpkin mask worn pushed up on top of
the head, cape, outfit, colours, camera angle, size and position in the
frame, ground shadow and background. Change ONLY the raised arm: lower it
from straight-up to roughly ear height, tilted outward about 30 degrees, paw
still open in a wave — mid-swing of a friendly side-to-side wave. Everything
else, including the cape and the rest of the pose, stays identical. No text
anywhere.
```

### Frame 3 — arm out → `halloween/wave-hello-out.png`
```
Edit the attached image. Keep the character EXACTLY the same — same face,
eyes, expression, head shape, markings, pumpkin mask worn pushed up on top of
the head, cape, outfit, colours, camera angle, size and position in the
frame, ground shadow and background. Change ONLY the raised arm: extend it
out to the side at roughly shoulder height, paw open in a wave, as if
mid-swing the opposite direction from raised-straight-up — the far end of a
friendly side-to-side wave. Everything else, including the cape and the rest
of the pose, stays identical. No text anywhere.
```

---

## Check before saving each one
- Only the arm moved — face, outfit, cape, ground shadow, everything else
  pixel-for-pixel the same read as the source image.
- Same crop/zoom/position as the source — frame-swapping only reads as
  animation if the body doesn't jump between frames.
- If a frame drifts off-model, redo it with the same prompt rather than
  accepting a slightly-different-looking character.

## Once generated — tell me and I'll wire it up
Slice to the same size/format as the existing `wave-hello.webp`, drop into
`mobile/assets/mascot/base/` and `mobile/assets/mascot/halloween/` as
`wave-hello-mid.webp` / `wave-hello-out.webp`, and I'll add a small 3-frame
cycle to the Sign-in screen's mascot — the exact same technique already
running for the header bats (`HeaderBats.tsx`), just a slower cadence (a wave
is a calmer gesture than a bat flap).
