# Halloween asset pack — generation prompts

Seasonal theming, season 1 of 7 (Navratri, Halloween, Diwali, Christmas/New Year, Pongal, Holi, IPL).
Mockups that approved the direction: the two ChatGPT/Flow home-screen renders shared on 2026-10-10.

## How these assets get used (read before generating)

The mockups were flat pictures of a whole screen. The real app can't use a whole-screen picture — the
text, numbers, buttons and lists are live and change per user. So the season is built from **separate
layers** that the app places *around* the real UI:

- **Text, numbers, buttons, icons stay real code.** Nothing an asset shows may contain text.
- **Every asset is one isolated object** (or a sheet of isolated objects) on a transparent/keyable
  background, so it can be positioned, scaled, tinted and animated independently.
- **All motion is done in code** (bats crossing the header, pumpkins flickering, mascot bouncing in a
  pop-up). The images only need to be the still frames.
- **Both light and dark mode** must work — scenes come in a day and a night version; single-colour
  silhouettes are generated white and recoloured in code.
- The same "slots" (hero band, card corners, empty states, pop-up mascot, tab-bar trim…) are reused on
  every screen and every festival. Diwali later = the same list of slots, new art.

## Settings for both tools

| | ChatGPT (image gen) | Google Flow (Nano Banana / Imagen) |
|---|---|---|
| Background | **Plain white** (same as the mascot sheets — I cut it out) | **Plain white** |
| Square sheets | 1024×1024 | 1:1 |
| Scenes | 1536×1024 (landscape) | 16:9 |
| Mascot poses | 1024×1024 | 1:1 |
| Consistency | Attach the reference images listed per prompt | Same — use "ingredients"/reference upload |

**Style reference (attach to every prompt):**
- Sprites SP1–SP10 → `assets/seasons-raw/halloween/indie-halloween-sheet.webp`, so the props are drawn
  with the same outline, flat shading and colours as Indie and sit naturally next to him.
- Scenes S1/S2 → `assets/seasons-raw/halloween/mockup-home-rich.webp` for the mood and palette.

**Where to save:** drop every output into `assets/seasons-raw/halloween/` (repo root, gitignored so the
big raw PNGs never ride along in an EAS build upload) using the file name given per prompt. If you
generate in both tools, suffix `-gpt` / `-flow` (e.g. `indie-halloween-sheet-gpt.webp`) and I'll pick per asset.
I'll cut out, trim, resize to @1x/@2x/@3x WebP and place the final set under
`mobile/assets/seasons/halloween/`.

## STYLE LOCK — paste at the top of every prompt

```
STYLE LOCK (Thrill Mill Club — Halloween asset set):
Flat 2D sticker illustration in EXACTLY the style of the attached mascot sheet: chunky rounded
shapes, the same warm dark-brown outline, solid flat colour fills with one soft darker shade per
colour, gentle glow only on lit objects (candles, jack-o'-lanterns). Do NOT draw the mascot — only the
objects asked for. Friendly and playful Halloween — cute, never scary: no blood, no gore, no
realistic skulls, no horror faces.
Palette only: navy #0B2545, deep navy #0A1220, teal #0E7C86, pumpkin orange #EA5F14, amber #F5A524,
moon yellow #F6D365, deep purple #3B1E54, lavender #CDBFE6, off-white #F4F7FB, near-black #1A1A2E.
Absolutely no text, letters, numbers, logos or watermarks anywhere in the image.
Every object fully inside the frame with ~10% empty margin; nothing cropped at the edges; no drop
shadow on the background, no floor, no ground plane unless the prompt asks for one.
BACKGROUND: plain pure white #FFFFFF, no gradient, texture, vignette or ground shadow. When there are
several objects, keep wide clear gaps of white between them so each can be cut out separately.
```

(For the two scene prompts S1/S2 ignore the BACKGROUND line — scenes are full-bleed.)

---

## A. Mascot — Indie in Halloween costume

Base art (saved): `assets/seasons-raw/mascot/indie-2d-sheet.webp` (hero, turnaround, A1–A4, F1–F6)
and `indie-2d-sheet-2.webp` (N1–N7, F7–F9). Pose IDs and where each is used: [mascot.md](mascot.md).

**Rule:** edit the base sheets — Indie's body, face and colours never change; only the costume and
props are added. Attach the base sheet and ask for an *edit*, not a new image.

**The Halloween costume (same on every pose):**
- A carved jack-o'-lantern pumpkin mask worn **pushed up on top of his head like a visor**, between
  his ears, so his face and expression stay fully visible.
- A short deep-purple (#3B1E54) cape with orange (#EA5F14) lining, tied at the neck over the teal
  bandana.
- Jersey, bandana, wristbands, track pants and sneakers stay exactly as they are.
- Wherever the lime pickleball appears it becomes a **pumpkin pickleball**: orange, same size, the
  holes arranged as a smiling jack-o'-lantern face.

### H1 — Halloween edit of sheet 1 → `halloween/indie-halloween-sheet.webp`
Attach `indie-2d-sheet.webp`.
```
Edit the attached character sheet. Keep EVERYTHING exactly the same — the same character, every
figure in the same position, pose, size, expression, face, markings, body colours, outfit, line
style, flat shading and grey ground shadows, and the same white background. Add a Halloween
costume to EVERY figure, drawn in the same flat 2D style:
1) a carved jack-o'-lantern pumpkin mask worn pushed up on top of his head like a visor, sitting
between his ears, with the face fully visible underneath — friendly carved smile on the pumpkin;
2) a short deep-purple (#3B1E54) cape with orange (#EA5F14) lining, tied at the neck over the teal
bandana, flowing naturally with each pose (seen from behind in the back views);
3) every lime-green pickleball becomes an orange pumpkin pickleball of the same size, its holes
arranged as a little smiling jack-o'-lantern face.
On the head-and-shoulders busts in the bottom row, show the pumpkin mask on top of the head and
the cape collar at the shoulders.
Do not change anything else. No text, no new background, no extra characters.
```

### H2 — Halloween edit of sheet 2 → `halloween/indie-halloween-sheet-2.webp`
Attach `indie-2d-sheet-2.webp`.
```
Edit the attached character sheet. Keep EVERYTHING exactly the same — the same character, every
figure in the same position, pose, size, expression, face, markings, body colours, outfit, line
style, flat shading and grey ground shadows, and the same white background. Add a Halloween
costume to EVERY figure, drawn in the same flat 2D style:
1) a carved jack-o'-lantern pumpkin mask worn pushed up on top of his head like a visor, between
his ears, face fully visible underneath;
2) a short deep-purple (#3B1E54) cape with orange (#EA5F14) lining, tied at the neck over the teal
bandana;
3) every lime-green pickleball becomes an orange pumpkin pickleball with a smiling jack-o'-lantern
face made of its holes.
Pose-specific changes, keeping each pose itself unchanged:
- waving figure (top row, 1st): add two tiny friendly bats fluttering near his raised paw;
- "oops" figure (top row, 2nd): replace the dropped ball with a tipped-over orange pumpkin candy
  bucket and a few wrapped sweets spilled on the ground;
- watch-checking figure (top row, 3rd): a small orange pumpkin candy bucket hangs from the arm that
  holds the ball;
- "hold on" figure (top row, 4th): no extra props;
- trophy figure (middle row, 1st): the trophy becomes a golden cup shaped like a carved
  jack-o'-lantern;
- napping figure (middle row, 2nd): he naps with his head on a large pumpkin instead of the ball,
  and the pumpkin mask has slipped down over one ear;
- welcome figure (middle row, 3rd): a few candy-corn pieces and small stars bursting around his
  open arms;
- sad bust (bottom row, 1st): the pumpkin mask droops to one side;
- worried bust (bottom row, 2nd): no extra props;
- sleepy bust (bottom row, 3rd): the pumpkin mask tilted down over one eye.
Do not change anything else. No text, no new background, no extra characters.
```

### H3 (optional) — the Home "reveal" → `halloween/indie-halloween-masked-wave.webp`
For the Home hero: he peeks in wearing the mask fully down, then I animate it lifting.
Attach `indie-halloween-sheet-2.webp`.
```
Using the waving character in the top-left of the attached sheet as the exact reference — same
pose, outfit, cape, proportions and flat 2D style — draw him with the carved jack-o'-lantern mask
pulled fully DOWN over his face (his ears poke out through the top of the pumpkin, the carved face
smiling), still waving one paw high. Single character, centered, soft grey oval ground shadow,
white background, no text. Square image.
```

### If a figure comes out wrong
Sheet edits sometimes drop or redraw a figure. Redo just that one:
```
Edit the attached image of this character. Keep him exactly the same — face, markings, colours,
pose, expression, outfit, flat 2D style and ground shadow. Add only: a carved jack-o'-lantern
mask pushed up on top of his head like a visor (face visible), a short deep-purple #3B1E54 cape
with orange #EA5F14 lining tied at the neck, and [the pose-specific change from H2, if any].
No text, white background.
```
(Crop the single figure out of the base sheet first and attach that crop.)

---

## B. Scenes (hero band behind the greeting / page titles)

Used behind "GOOD AFTERNOON, SANJAY", "Leaderboard", "My Teams", "Book a Slot". Day version 5AM–5PM
(matches the app's day pricing band), night version after 5PM and always in dark mode.

### S1 — Hero, day/dusk (light mode) → `S1-hero-day.png`
```
[STYLE LOCK — ignore the BACKGROUND line, this is a full-bleed scene]
Wide landscape banner illustration, Halloween dusk over a football turf.
COMPOSITION IS CRITICAL: the LEFT 55% of the image must be calm, low-detail and low-contrast —
only soft lavender #CDBFE6 sky and light mist — because dark navy title text will sit on top of it.
All the interest is in the RIGHT 45%: a large pale-yellow full moon with soft glow, a silhouetted
football goalpost and two stadium floodlight towers on the horizon, a soft line of dark
purple-silhouetted trees behind the turf. A gentle low-lying mist across the turf.
The bottom 20% of the image fades smoothly into solid flat #F4F7FB (off-white) so it blends into
the app page. No pumpkins, no characters, no bats (added separately). No text.
Landscape 16:9 / 3:2.
```

### S2 — Hero, night (dark mode / after 5PM) → `S2-hero-night.png`
```
[STYLE LOCK — ignore the BACKGROUND line, this is a full-bleed scene]
Exactly the same composition as the attached S1 image — same moon position, goalpost,
floodlight towers, tree line and mist — but at night: deep navy #0B2545 to deep purple #3B1E54
sky with tiny scattered stars, the moon brighter with a stronger glow, floodlights faintly on.
LEFT 55% stays calm and dark with low detail because white text will sit on top of it.
The bottom 20% fades smoothly into solid flat #0A1220 (near-black navy).
No pumpkins, characters or bats. No text. Landscape 16:9 / 3:2.
```
Attach: S1 (generate S1 first).

---

## C. Sprites and sheets

### SP1 — Bat flap frames → `SP1-bat-frames.png`
```
[STYLE LOCK]
Animation frame sheet: the SAME cute cartoon bat (near-black #1A1A2E body, purple #3B1E54 wing
membranes, tiny fangs, big friendly eyes) shown 3 times in a single horizontal row, evenly
spaced with wide gaps, identical size and identical body position in each:
frame 1 wings fully raised, frame 2 wings level/outstretched, frame 3 wings fully lowered.
Facing right, as if flying to the right. Square image.
```

### SP2 — Crow flap frames → `SP2-crow-frames.png`
```
[STYLE LOCK]
Animation frame sheet: the SAME stylised cartoon crow (near-black #1A1A2E with a subtle
navy sheen, small orange beak, friendly round eye) shown 3 times in a single horizontal row,
evenly spaced with wide gaps, identical size and body position, side view flying right:
frame 1 wings up, frame 2 wings level, frame 3 wings down. Square image.
```

### SP3 — Empty-state ghosts → `SP3-ghosts.png` — ❌ DROPPED
Not needed any more: Indie covers the empty states (`napping`, `welcome-open-arms`, `face-thinking`).
Kept below for reference only — skip it.
```
[STYLE LOCK]
Sprite sheet of 6 small, cute, friendly white ghosts (soft off-white #F4F7FB with lavender
#CDBFE6 shading, rosy cheeks, happy faces) in a 3×2 grid, each in its own cell with wide gaps,
same size and style:
1) ghost hugging a calendar, 2) ghost holding a notification bell,
3) ghost holding a small stack of gold coins, 4) ghost holding a small trophy,
5) two ghosts high-fiving, 6) ghost holding a speech bubble (empty bubble, no text).
Square image.
```

### SP4 — Card-corner pumpkin cluster → `SP4-pumpkin-cluster.png`
Sits on the bottom-right corner of the navy credits cards (Home, Team detail).
```
[STYLE LOCK]
A small arrangement sitting on an invisible ledge: one large and one small carved
jack-o'-lantern, both glowing warm orange from inside with friendly smiling faces, a short lit
white candle with a soft flame between them, and a couple of dark purple leaves at the base.
Lit as if on a dark navy surface (warm glow, rim light). Arranged in a compact cluster that is
wider than tall. Square image.
```

### SP5 — Small props sheet → `SP5-props.png`
```
[STYLE LOCK]
Sprite sheet of 6 separate small objects in a 3×2 grid, each in its own cell with wide gaps,
consistent scale and style:
1) a football painted as a jack-o'-lantern (orange ball, carved smiling face) — front view,
2) a small orange witch hat with a purple band — straight-on view, sitting upright,
3) a single candy corn,
4) a cute small spider hanging from a single thin vertical silk thread (thread reaches the top of its cell),
5) a small glowing jack-o'-lantern,
6) a golden trophy cup shaped like a carved pumpkin.
Square image.
```

### SP6 — Silhouettes (recoloured in code) → `SP6-silhouettes.png`
```
[STYLE LOCK — override the style: draw everything as pure flat BLACK #000000 shapes only,
no shading, no outline, no other colours. I recolour them in code.]
Sprite sheet of separate flat black silhouette shapes, each with wide gaps:
1) a delicate corner spiderweb filling a quarter-circle, anchored to the top-left corner of its
   cell (thin clean lines),
2) a long, low horizontal strip: graveyard fence with three rounded tombstones and a bare
   tree, wider than tall,
3) a four-point sparkle star, 4) a small crescent moon, 5) a tiny flying bat silhouette,
6) a small round dot-star.
Arrange on a 3×2 grid except item 2, which spans the full width of the bottom row.
Square image.
```

### SP7 — Chat wallpaper doodles → `SP7-chat-doodles.png`
For a faint WhatsApp-style doodle pattern behind Team Chat. I'll compose the seamless tile myself.
```
[STYLE LOCK — override the style: pure BLACK #000000 line art only, uniform thick stroke,
outline style, no fills, no shading. I recolour and fade them in code.]
Sprite sheet of 12 simple doodle icons in a 4×3 grid with wide gaps, same line weight and size:
pumpkin, bat, ghost, witch hat, candy corn, crescent moon with star, spiderweb, cauldron,
football, pickleball paddle with ball, lantern, wrapped candy. Square image.
```

### SP8 — Pop-up confetti pieces → `SP8-confetti.png`
Burst around the mascot when a booking succeeds.
```
[STYLE LOCK]
Sprite sheet of 9 tiny separate confetti pieces in a 3×3 grid with wide gaps, flat and simple:
candy corn, wrapped orange candy, wrapped purple candy, tiny bat, tiny orange star,
tiny amber star, small orange paper strip curl, small purple paper strip curl, tiny pumpkin.
Square image.
```

### SP9 — Avatar frame → `SP9-avatar-frame.png`
Ring around the profile photo (Profile screen; small version around the header avatar).
```
[STYLE LOCK]
A circular decorative frame / wreath: a thin ring of curling green-and-purple pumpkin vines
with small orange pumpkins at the bottom, a few leaves, and one tiny bat hanging from the top.
THE CENTER OF THE RING MUST BE COMPLETELY EMPTY PLAIN WHITE — it is a frame for a
round photo. Ring is perfectly circular, thin (about 10% of the diameter), centered.
Square image.
```

### SP10 — Bunting pieces → `SP10-bunting.png`
Strung above the tab bar and under page titles; I'll repeat them along a curved string in code.
```
[STYLE LOCK]
Sprite sheet of 3 separate hanging paper bunting flags, each hanging from a short horizontal
piece of string across the top of its cell, in a single row with wide gaps, same size:
1) orange #EA5F14 triangular pennant, 2) deep purple #3B1E54 triangular pennant,
3) a black paper bat-shaped cut-out flag. Slight paper texture, flat lighting. Square image.
```

---

## Final Halloween asset set (sliced 2026-10-10)

Mascot: `mobile/assets/mascot/halloween/` (21 poses — see mascot.md).
Decorations: `mobile/assets/seasons/halloween/` (49 files), cut by
`python scripts/slice_sprites.py scripts/sprite_specs/halloween.json`.

| Files | What |
|---|---|
| `hero-day`, `hero-night` | Background scenes (1376×768), watermark removed |
| `bat-wings-up/-level/-down` | Bat flap frames, one shared canvas (bodies aligned) |
| `crow-wings-up/-level/-down` | Crow flap frames, same |
| `pumpkin-cluster` | Two jack-o'-lanterns + candle |
| `prop-pumpkin-football`, `prop-witch-hat`, `prop-candy-corn`, `prop-spider`, `prop-jack-o-lantern`, `prop-pumpkin-trophy`, `prop-pumpkin-purple` | Props (`prop-pumpkin-purple` has a slightly menacing face — not planned for use) |
| `confetti-*` (9) | Burst pieces for success pop-ups |
| `bunting-orange/-purple/-bat` | Bunting flags |
| `avatar-ring` | Ring for the profile photo (centre transparent) |
| `shape-cobweb`, `shape-sparkle`, `shape-moon`, `shape-bat`, `shape-dot`, `shape-graveyard` | **White** masks — tint in code (`tintColor`) per theme |
| `doodle-*` (12) | **White** line-art masks for the chat wallpaper — tint + fade in code |

## Screen coverage — every route in the app (37)

Three layers reach every screen without per-screen work: **pop-ups** (one `AppDialog` → mascot),
**empty states** (one `EmptyState` → mascot), and a **faint page pattern** (shape-bat / sparkle / dot,
~5% opacity) behind every screen's background. On top of that:

| Screen(s) | Halloween treatment |
|---|---|
| Home | `hero-day/-night` behind the greeting + `wave-hello` peeking; bats across the header, an occasional crow; 🎃 in the greeting; `shape-cobweb` + `pumpkin-cluster` + sparkles on the credits card; `prop-pumpkin-football` as the Book-a-Slot icon |
| Book | Shorter hero band behind the title; `prop-spider` dropping on a thread; cobweb corner on the venue photo. Date chips and slot grid untouched |
| My Teams | Hero band behind the title; `prop-pumpkin-football` replaces the faded football watermark on the navy cards; bunting under the stats card |
| Leaderboard | Hero band with `trophy-champion`; `prop-pumpkin-trophy` next to the title; `shape-graveyard` faint behind the podium; `prop-witch-hat` on the #1 avatar |
| Profile | `avatar-ring` around the photo; `napping` for "No games played yet"; new "Festive decorations" on/off switch under Appearance |
| Team details | Cobweb corner + bats over the team photo; `pumpkin-cluster` on the credits card |
| Team chat | Doodle wallpaper (`doodle-*`, tinted, ~6%) |
| Booking details | Cobweb corner on the turf photo |
| Wallet activity | `pumpkin-cluster` on the balance card; `napping` when empty |
| Notifications | Mascot face per notification type; `napping` when empty |
| Create team (4 steps) / add members / join team | `confetti-pumpkin` as the active step dot; page pattern |
| Team created | `celebrate-jump` + confetti burst (replaces the plain tick animation) |
| Welcome | Bats crossing the turf photo; `prop-witch-hat` on the logo badge; `hero-standing` |
| Sign in / profile setup | `wave-hello`; page pattern |
| Permissions | `face-surprised` beside the notifications ask |
| Ready to play | `celebrate-jump` + confetti burst |
| Tab bar (both apps) | Bunting along the top edge; `prop-witch-hat` on the active tab |
| Admin screens (12) | Header bats + page pattern + pop-ups only — work screens stay plain |
| Push notifications | Text only: 🎃 in the title |

**Verdict: the asset set is complete for Halloween — nothing more to generate.**
Known limits, handled in code rather than new art: the near-black bats/crows are low-contrast on the
dark-mode header, so they get a faint moonlight glow there; the hero scenes are 1376 px wide, sharp
up to full phone width.

## Checklist

- [ ] Mascot concept + base sheet approved by manager (mascot.md steps 1–3)
- [x] Mascot H1 + H2 sliced into `mobile/assets/mascot/halloween/`
- [x] S1–S2 · SP1, SP2, SP4–SP10 generated and sliced into `mobile/assets/seasons/halloween/`
- [ ] Build: season engine, mascot pop-ups, decorations per the coverage table and saved to `assets/seasons-raw/halloween/`
- [ ] Hand back to Claude for cut-out, optimisation, and implementation
