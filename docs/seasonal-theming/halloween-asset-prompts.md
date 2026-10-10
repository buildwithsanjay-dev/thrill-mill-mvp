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
| Background | Ask for **transparent PNG** | Can't do transparency → **solid flat magenta `#FF00FF`** (I key it out) |
| Square sheets | 1024×1024 | 1:1 |
| Scenes | 1536×1024 (landscape) | 16:9 |
| Mascot poses | 1024×1024 | 1:1 |
| Consistency | Attach the reference images listed per prompt | Same — use "ingredients"/reference upload |

**Style reference:** attach your favourite home-screen mockup (the richer purple one) to every prompt
as a style reference, This is what keeps the separate
generations looking like one set.

**Where to save:** drop every output into `assets/seasons-raw/halloween/` (repo root, gitignored so the
big raw PNGs never ride along in an EAS build upload) using the file name given per prompt. If you
generate in both tools, suffix `-gpt` / `-flow` (e.g. `P2-celebrate-gpt.png`) and I'll pick per asset.
I'll cut out, trim, resize to @1x/@2x/@3x WebP and place the final set under
`mobile/assets/seasons/halloween/`.

## STYLE LOCK — paste at the top of every prompt

```
STYLE LOCK (Thrill Mill Club — Halloween asset set):
Polished 2D vector illustration for a mobile sports-club app, matching the attached style reference:
clean rounded shapes, soft gradient shading with one highlight and one shadow tone, gentle warm glow
on lit objects, subtle darker outline. Friendly and playful Halloween — cute, never scary: no blood,
no gore, no realistic skulls, no horror faces.
Palette only: navy #0B2545, deep navy #0A1220, teal #0E7C86, pumpkin orange #EA5F14, amber #F5A524,
moon yellow #F6D365, deep purple #3B1E54, lavender #CDBFE6, off-white #F4F7FB, near-black #1A1A2E.
Absolutely no text, letters, numbers, logos or watermarks anywhere in the image.
Every object fully inside the frame with ~10% empty margin; nothing cropped at the edges; no drop
shadow on the background, no floor, no ground plane unless the prompt asks for one.
BACKGROUND: transparent PNG. If transparency is not supported, use a solid flat pure magenta #FF00FF
background with no gradient, texture or vignette, and do not use magenta anywhere in the artwork.
```

(For the two scene prompts S1/S2 ignore the BACKGROUND line — scenes are full-bleed.)

---

## A. Mascot — see [mascot.md](mascot.md)

The mascot now has its own doc: one base character derived from the club logo, 7 base poses, and an
"edit only the outfit" prompt per festival. For Halloween, follow mascot.md step 4 with the
**Halloween** outfit row (pumpkin mask pushed up like a visor + purple cape) on each of the 7 base
poses, saving to `assets/seasons-raw/halloween/P1-wave.png` … `P7-resting.png`.

Pose → where it's used: P1 Home hero · P2 success pop-ups · P3 info / booking requested ·
P4 error pop-ups · P5 warning pop-ups · P6 Leaderboard · P7 empty "no games yet".

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

### SP3 — Empty-state ghosts → `SP3-ghosts.png`
Replaces the grey circle icon on every "nothing here yet" state.
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

### SP6 — White silhouettes (recoloured in code) → `SP6-silhouettes.png`
```
[STYLE LOCK — override the palette: draw everything in pure flat white #FFFFFF only,
no shading, no outline, no other colours]
Sprite sheet of separate flat white silhouette shapes, each with wide gaps:
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
[STYLE LOCK — override the palette: pure white #FFFFFF line art only, uniform 3px stroke,
outline style, no fills, no shading]
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
THE CENTER OF THE RING MUST BE COMPLETELY EMPTY (transparent / magenta) — it is a frame for a
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

## Where each asset goes (screen-by-screen)

Placement rules: decorations never cover a number, price, credit balance, button label or input;
never take taps (purely visual); functional elements (date chips, time-slot grid, poll options,
form fields, sport chips) stay untouched. Respect the phone's Reduce Motion setting and a new
**Profile → Appearance → "Festive decorations"** on/off switch.

| Screen | Free space observed | Assets |
|---|---|---|
| **App header** (every tab) | Thin bar, empty between title and bell | Twilight gradient (code), 1–3 bats (SP1) flying across every ~20–40 s, tiny witch hat (SP5-2) perched on the logo badge |
| **Home** | Big gap above + below greeting; empty-state card; navy credits card | S1/S2 hero behind greeting with P1 peeking at right; 🎃 replaces 👋 (emoji, code); crows (SP2) occasionally; ghost (SP3-1) + cobweb corner (SP6-1) in "No upcoming events"; cobweb + SP4 cluster + sparkles (SP6) on credits card; jack-o'-lantern football (SP5-1) as Book-a-Slot icon; faint bat/star page pattern (composed from SP6) |
| **Book a Slot** | Gap above title, gap between team card and "Select Sport", venue photo | Hero band (S1/S2, shorter crop) behind title; dangling spider (SP5-4) dropping from the top right on a slow loop; cobweb corner over the venue photo; date/slot grid untouched |
| **My Teams** | Gap under "Your sports communities"; navy team cards with faded football watermark | Hero band behind title; pumpkin-football (SP5-1) replaces the faded watermark on each navy card; bunting (SP10) under the stats card |
| **Team detail** | Team photo banner; navy credits card | Cobweb corner + 2 bats over the photo; SP4 cluster on credits card |
| **Team chat** | Huge empty middle area | Faint doodle wallpaper (SP7, tinted at ~6% opacity); optional seasonal quick-reply "Happy Halloween 🎃" (text, code) |
| **Leaderboard** | Gap above title; space around podium | Hero band with P6 (trophy) on the right; trophy icon → pumpkin trophy (SP5-6); graveyard strip (SP6-2) faint behind the podium; witch hat on the #1 avatar |
| **Profile** | Avatar area; "No games played this week yet." | Pumpkin-vine ring (SP9) around the photo; P7 resting replaces the plain empty text area; "Festive decorations" toggle row in Appearance |
| **Pop-ups** (`AppDialog`, used everywhere) | Icon circle at the top of every dialog | Mascot replaces the icon circle: success → P2 + confetti (SP8) burst, info/pending → P3, error → P4, warning → P5. A small coloured badge (tick / ! / ×) stays on the mascot's corner so the meaning is clear without the art |
| **Empty states** (Notifications, Wallet activity, Leaderboard, Teams, Book) | Grey circle icon | Matching ghost from SP3 |
| **Welcome / onboarding** | Turf photo, logo badge | Bats (SP1) crossing the photo, witch hat on the logo badge, SP4 cluster at the sheet's top edge |
| **Tab bar** | Line above the tabs | Bunting (SP10) strung along the top edge; witch hat on the active tab icon |
| **Push notifications** | System-drawn, can't be illustrated | Text only: 🎃 prefix on the title. No financial detail in the body (unchanged rule) |
| **Admin screens** | — | Header bats + gradient only; Admin work screens stay plain |
| **App icon / splash** | — | Not themed — needs a new store build each time; out of scope for server-switched seasons |

## Checklist

- [ ] Mascot concept + base sheet approved by manager (mascot.md steps 1–3)
- [ ] Halloween outfit on P1–P7 (mascot.md step 4) · S1–S2 · SP1–SP10 generated and saved to `assets/seasons-raw/halloween/`
- [ ] Hand back to Claude for cut-out, optimisation, and implementation
