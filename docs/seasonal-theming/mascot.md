# Club mascot — base character + seasonal outfits

One mascot, used in every festival. **The character never changes — only outfit, accessories and
props do.** Halloween = pumpkin mask, Pongal = veshti and shirt, and so on.

## The rule that keeps him consistent

AI image tools redraw a character slightly differently every time you ask from scratch. So:

1. Generate the **base character once** (step 1–2) and get it approved.
2. Generate the **7 base poses once**, in the plain base outfit (step 3).
3. For every festival, **edit each base pose image** with the outfit-swap prompt (step 4) — always
   starting from the *base* pose file, never from last festival's costume version (copies of copies
   drift).

Use image **editing**, not generation, for step 4: in ChatGPT attach the base pose and ask for the
change; in Google Flow use the base pose as the reference/ingredient image. Both tools are good at
"keep everything, change only X" edits.

Save files to `assets/seasons-raw/mascot/` (base) and `assets/seasons-raw/<season>/` (outfits),
same background rules as the asset prompt pack: transparent in ChatGPT, flat magenta `#FF00FF` in Flow.

---

## ✅ In-app mascot files (sliced 2026-10-10)

Base set = `indie-2d-sheet-2.webp` (owner's pick). Each season is a folder with the **same file
names**, so the app swaps season by changing only the folder:

```
mobile/assets/mascot/<season>/
  wave-hello.webp        hold-on.webp            welcome-open-arms.webp
  oops-sorry.webp        trophy-champion.webp    face-sad.webp
  waiting-watch.webp     napping.webp            face-worried.webp
                                                 face-sleepy.webp
```
Seasons done: `base`, `halloween`. Full-body poses share one 429×518 canvas and faces one 356×349
canvas, bottom-aligned, so swapping poses or seasons never makes Indie jump or resize. Backgrounds
are transparent; the grey ground shadow became a soft translucent shadow that works in light and
dark mode.

New season: generate its edit of `indie-2d-sheet-2.webp` (same 4/3/3 layout), then run from the repo
root (needs Python with Pillow, NumPy, SciPy):
```
python scripts/slice_mascot.py mobile/assets/mascot base=assets/seasons-raw/mascot/indie-2d-sheet-2.webp diwali=assets/seasons-raw/diwali/indie-diwali-sheet-2.webp
```
Always pass `base=` too: all seasons are cut to one shared canvas size.

**Gap:** this set has no "celebrate" (big success, e.g. Booking confirmed) and no "small win"
pose — those are `A2`/`A3` on `indie-2d-sheet.webp`, not on sheet 2.

---

## ✅ Final 2D sheet (2026-10-10) and where each pose is used

Approved sheet: save as `assets/seasons-raw/mascot/indie-2d-sheet.webp`. It contains:

| ID | On the sheet | Mood |
|---|---|---|
| `HERO` | Big top figure, ball in hand, paw on hip | Confident, friendly |
| `T1–T5` | Turnaround row (front, ¾, side, back, back-¾) | Reference only — not shown in the app |
| `A1` | Running with the ball, motion lines | Eager, "let's go" |
| `A2` | Jumping, eyes closed, ball raised | Big celebration |
| `A3` | Wink with the ball and a star | Small win, "done!" |
| `A4` | Determined throw | Competitive, game on |
| `F1` | Face: smile | Pleased |
| `F2` | Face: wink | Friendly, inviting |
| `F3` | Face: fists up, eyes closed | Excited |
| `F4` | Face: open mouth + "!" | Heads-up, attention |
| `F5` | Face: paw on chin + "?" | Thinking, explaining |
| `F6` | Face: laughing + sparkle lines | Delighted |

### Missing moods (generate these — prompts below)

The app's most frequent pop-ups are errors and pending reviews, and the sheet is all positive moods.
These are missing:

| ID | Pose | Why it's needed |
|---|---|---|
| `N1` | Waving hello / goodbye | Home hero (cropped as a peek), welcome screen, "Sign out?" |
| `N2` | Apologetic "oops" | Every error: "Could not…", "Booking failed", "Hold expired", "Team is full", "Message not sent"… (~45 pop-ups) |
| `N3` | Waiting patiently, checking a watch | "Booking submitted" (pending Admin review), "Request sent", membership under review |
| `N4` | "Hold on" paw raised | Confirmations: "Cancel this booking?", "Withdraw this request?", "Delete your account?", "Make X the Host?" |
| `N5` | Holding a trophy high | Leaderboard header, #1 team |
| `N6` | Napping / resting | Empty states: "No upcoming events", "No games played yet", "No notifications yet", "No activity yet" |
| `N7` | Open-arms welcome | Team invite, join request approved, "No Teams yet — create one" |
| `F7` | Face: sad / sorry | Notifications: booking declined/cancelled, join request declined, no-refund cancellation |
| `F8` | Face: worried | Notification: membership needs attention |
| `F9` | Face: sleepy | Small empty states |

Why `N3` matters: today "Booking submitted" is styled as a success. A Host's booking is only
*pending* until an Admin approves it, so it must not show the big celebration (`A2`). `A2` is kept
for the moment it's actually confirmed.

### Prompt — missing moods sheet → `indie-2d-sheet-2.webp`
Attach `indie-2d-sheet.webp`.
```
Using the attached character sheet as the exact reference, draw NEW poses of the SAME character —
identical face, markings, ear shape, eye colour, curled tail, outfit, colours, proportions, line
style, flat shading and soft grey oval ground shadows as in the attached sheet. Do not redesign
anything; only the pose and expression change. White background, no text or labels.
Portrait 2:3 layout, evenly spaced with wide gaps, same scale as the small full-body figures on the
attached sheet.
ROW 1 (full body): (N1) standing, waving one paw high in a friendly hello, big smile;
(N2) apologetic "oops" — ears drooping slightly, small sweat drop, sheepish smile, shrugging with
both paws up, the pickleball dropped at his feet — sorry but not crying;
(N3) standing patiently, looking at a wristwatch on his raised wrist with a calm hopeful smile, ball
tucked under the other arm; (N4) one paw raised palm-out in a gentle "hold on a second" gesture,
eyebrows raised, kind attentive expression.
ROW 2 (full body): (N5) proudly holding a golden trophy cup above his head with both paws, chest
out, eyes closed with pride; (N6) curled up napping on the ground with his head resting on the
pickleball, eyes closed, a small "z" bubble; (N7) arms wide open in a warm welcome, happy open-mouth
smile.
ROW 3 (head-and-shoulders busts, same framing and size as the bottom row of the attached sheet):
(F7) sad, sorry face — ears down, eyes glossy, small frown; (F8) worried face — eyebrows up and
together, a small sweat drop, slightly gritted smile; (F9) sleepy face — half-closed eyes, small yawn.
```

If one pose comes out off-model, redo just that one:
```
Using the attached character sheet as the exact reference, draw ONE new pose of the SAME character —
identical face, markings, outfit, colours, proportions and flat style, with the same soft grey
oval ground shadow. Only the pose and expression change. White background, no text.
Pose: [copy the pose line from the table above]. Single character, centered, square image.
```

### Pop-ups → mascot

Pop-ups are the single `AppDialog`, so this covers every screen (including Admin's).

| Pop-up kind | Examples from the app | Mascot |
|---|---|---|
| Big success | Booking confirmed, Booking approved, Team created, Membership activated | `A2` jump |
| Small success | Profile saved, Poll posted, Invite sent, Slot blocked, Team notified | `A3` wink |
| **Pending (new kind)** | Booking submitted, Request sent (join / account deletion), membership request submitted | `N3` waiting |
| Error | Could not …, Booking failed, Sign in failed, Hold expired, Team is full, Message not sent, Search failed | `N2` oops |
| Confirmation | Cancel this booking?, Withdraw this request?, Delete your account?, Make X the Host?, Unblock this slot? | `N4` hold on |
| Sign out? | Sign out? | `N1` wave |
| Nudge / explanation | Slot already passed, membership under review, only Host/Co-host can book, Missing details, Enter a code, Permission needed | `F5` thinking (in the icon circle) |
| Outcome with bad news | Booking cancelled — no refund, Booking declined | `F7` sad (in the icon circle) |

The current coloured tick / ! / × badge stays on the mascot's corner, so the meaning is still clear
without the art.

### In-app notification list (bell) → small face per type

Push notifications in the phone's tray are drawn by Android and can't show the mascot. The in-app
notification list can, as a small round face on each row:

| Notification | Face |
|---|---|
| Booking confirmed | `F3` excited |
| Booking declined / cancelled | `F7` sad |
| Added to a booking | `F2` wink |
| Game reminder (~2h before) | `A1` run (cropped) |
| Membership approved | `F6` delighted |
| Membership needs attention | `F8` worried |
| Join request approved | `F6` delighted |
| Join request declined | `F7` sad |
| Team invite | `F2` wink |
| Team poll | `F5` thinking |
| Host transferred / role changed | `F4` heads-up |
| Admin: new membership request, new slot booking, booking needs review, booking cancelled by a team | `F4` heads-up |

### Screens and empty states → mascot

| Where | Mascot |
|---|---|
| Home hero (peeking in from the right) | `N1` wave, cropped |
| Welcome / onboarding | `HERO` |
| Ready-to-play (end of sign-up) | `A2` jump |
| Leaderboard header | `N5` trophy |
| Empty: no upcoming events, no games played, no notifications, no activity | `N6` napping |
| Empty: no Teams yet | `N7` welcome |
| Empty search: no matching activity, no bookings found, no teams found | `F5` thinking |

---

## ✅ Chosen (2026-10-10): "Indie" — redraw the approved 3D concept as a flat 2D sticker character

Approved: the 3D Concept D render (Indie with the lime pickleball). Final art is **2D**, in the style
of the manager's reference sheet (the 3×3 grid of chunky blue monsters in seasonal outfits). Save the
3D render as `assets/seasons-raw/mascot/indie-3d-approved.webp` and the reference sheet as
`assets/seasons-raw/mascot/style-reference.png` — both are attached to every prompt below.

Unlike the reference sheet (where the monster turns orange for the pumpkin, black for the bat),
**Indie's body never changes colour — costumes only go on top.**

**Character bible — paste into every mascot prompt:**
```
CHARACTER: "Indie", an Indian Pariah dog pup standing upright — warm tan/fawn coat; cream blaze
between the eyes, cream muzzle, cheeks and chest; tall upright pointed ears with pink insides; big
round brown eyes with white highlights; dark brown nose; small pink tongue tip; curled tail with a
cream tip. BASE OUTFIT: navy sleeveless jersey with teal, orange and amber speed-line stripes
across the chest; teal bandana knotted at the side of the neck; teal wristbands; navy track pants
with an orange-and-teal side stripe; orange-and-white sneakers. No badge, collar tag, backpack,
letters, numbers or logos.
```

**2D style lock — paste into every mascot prompt:**
```
STYLE: flat 2D vector sticker illustration matching the attached style reference sheet — simple,
chunky, rounded shapes; solid flat colour fills with just one soft darker shade per colour; no
gradients, no textures, no glossy highlights, no 3D rendering; clean edges with no outline (or a very
subtle same-hue outline); a soft light-grey oval ground shadow under the feet. Slightly chunkier,
cuter proportions than the 3D concept (bigger head, shorter body) so he reads clearly at small
sizes, but the same face, markings, colours and outfit. No text anywhere.
Transparent background (or flat pure magenta #FF00FF if transparency isn't available).
```

### 2D-1 — Base character, flat 2D → `BASE-2d.png`
Attach: `indie-3d-approved.webp` (the character) + `style-reference.png` (the style only).
```
Redraw the character from the FIRST attached image as a flat 2D sticker illustration in the style
of the SECOND attached image. Keep his identity exactly: face, markings, ear shape, eye colour,
curled tail, outfit and colours. Only the rendering style changes from 3D to flat 2D.
[CHARACTER BIBLE]
[2D STYLE LOCK]
Pose: standing, front three-quarter view, holding the lime-green pickleball (with its small holes)
in one raised paw, other paw on hip, friendly confident smile. Single character, centered,
nothing cropped. Square image.
```
Generate 3–4 times, pick one with the manager. **Everything below is edited from or references this
file.**

### 2D-2 — Base pose sheet (3×3) → `BASE-poses-sheet.png`
Like the top row of the reference sheet: same outfit, different moods. One image keeps all 9
consistent; I'll slice it into single files.
Attach: `BASE-2d.png` + `style-reference.png`.
```
A character sheet of the SAME character as the attached BASE image, identical design and outfit,
drawn 9 times in a 3×3 grid, each in its own cell with wide even gaps, all the same size, each with
its own small grey oval ground shadow:
row 1: (1) peeking and waving one paw high, big happy grin; (2) jumping with both arms up holding a
football, eyes closed with joy; (3) patient smile looking at a wristwatch on one raised wrist;
row 2: (4) apologetic "oops" shrug with palms up and a small sweat drop; (5) one paw raised
palm-out in a friendly "wait a second" gesture, eyebrows raised; (6) holding a golden trophy above
his head, proud smile;
row 3: (7) sitting relaxed, leaning back, football beside him, sleepy half-smile; (8) hugging the
lime pickleball with little floating hearts around his head; (9) thinking, paw on chin, one
eyebrow raised.
[CHARACTER BIBLE]
[2D STYLE LOCK]
Square image, high resolution.
```
Poses 1–7 = P1–P7 in step 3 below. 8 = "love" (join request approved, added to a team);
9 = "thinking" (loading / empty search).

### 2D-3 — Seasonal outfit overview (3×3) → `SEASONS-overview-sheet.png`
The equivalent of your reference sheet: one image showing Indie in all 9 looks. It's for the
manager to approve the costumes before the per-pose edits.
Attach: `BASE-2d.png` + `style-reference.png`.
```
A character sheet of the SAME character as the attached BASE image — identical face, markings,
body colour and proportions in every cell; only the outfit and props change. 9 versions in a 3×3
grid, each in its own cell with wide even gaps, same size, each with a small grey oval ground
shadow, all in the same cheerful standing pose with one paw waving:
(1) base sports outfit with the lime pickleball;
(2) Navratri: orange-and-teal mirror-work kediyu jacket, bandhani turban, dandiya sticks;
(3) Halloween: carved jack-o'-lantern pumpkin mask pushed up on top of his head like a visor (face
visible), short purple cape with orange lining, pumpkin candy bucket;
(4) Diwali: amber-and-orange silk kurta with gold border, marigold garland, holding a lit clay diya;
(5) Christmas: red Santa cap with white trim, red-and-white knitted scarf, small gift box;
(6) New Year: shiny orange party cone hat, star-shaped sunglasses on his head, party popper with
confetti;
(7) Pongal: white veshti with teal-and-gold border, white half-sleeve shirt, gold-bordered shoulder
cloth, holding a stalk of sugarcane;
(8) Holi: white kurta splashed with pink, yellow, green and blue colour powder, colour smudges on
his cheeks, a pichkari water gun;
(9) Cricket: teal-and-orange cricket jersey with no team names or logos, cricket cap, cricket bat.
[CHARACTER BIBLE — keep his body colours; ignore the base outfit where a costume replaces it]
[2D STYLE LOCK]
Square image, high resolution.
```

Once the manager approves 2D-2 and 2D-3, continue with **step 4** below (edit each base pose with
that season's outfit) to get every pose in every costume. Steps 1–2 below are superseded.

---

## Step 1 — Concept round (pick one with the manager)

All three are derived from the logo: lime pickleball, navy "TM" athlete figure, teal/orange/amber speed
lines, bowling pin, arcade joystick, orange paddle. Attach the logo to each prompt.

**Manager's direction (2026-10-10): a Paw-Patrol-*inspired* pup → Concept D below.** A–C stay as
fallbacks.

### Concept D — "Indie", the club's hero pup (manager's pick) → `C-D-pup.png`

**What "inspired by" may borrow, and what it must not.** Paw Patrol is a Spin Master trademark and
copyright. A commercial app with a lookalike pup risks a takedown or Play Store complaint. So we
borrow the *qualities* that make it appealing, never the *specifics*:

| Borrow (generic) | Never copy (Paw Patrol-specific) |
|---|---|
| A brave, upbeat, heroic puppy with a "job" | Any named character, or their breed + colour combo (German Shepherd in blue police gear, Dalmatian in red fire gear, Cockapoo in pink aviator gear, Bulldog in yellow construction gear…) |
| Chunky, rounded 3D-cartoon look, big glossy eyes | The shield-shaped collar badge with an emblem, the "pup pack" backpack with gadgets, the lookout tower, the logo/lettering, the catchphrases |
| A uniform that says what the pup does (ours: sports kit) | The words "Paw Patrol" or any character name in our app, store listing or marketing |
| A team of pups with different roles (later, optional) | Prompts that say "Paw Patrol" or "in the style of Paw Patrol" — the tools then produce near-copies |

Our pup is an **Indian Pariah ("Indie") dog** — a breed none of the show's main characters use, and a
local touch for an Indian club.

```
Mascot character design for a sports & gaming club app, using the colours of the attached logo.
A brave, upbeat puppy hero: an Indian Pariah ("Indie") dog pup — warm fawn/tan short coat with a
cream chest and muzzle, tall upright pointed ears, a curled tail, big glossy brown eyes, a
confident, friendly grin with a tiny tongue tip showing. Chunky rounded chibi proportions,
about 2.5 heads tall, standing upright on two legs like a cartoon hero.
BASE outfit: a navy #0B2545 sporty jersey vest with teal #0E7C86, orange #EA5F14 and amber
#F5A524 speed-line stripes across the chest like the logo's motion lines, a teal sports bandana
knotted around the neck, teal wristbands on the front paws, orange-and-white sneakers on the back
paws. No badge, no collar tag, no backpack, no letters, numbers or logos anywhere.
Holding the lime-green pickleball from the logo in one paw.
Soft 3D cartoon render style (smooth rounded forms, gentle studio lighting, slight glossy
highlights), cheerful family-animation feel. Full body, front three-quarter view, heroic pose.
Single character, centered, nothing cropped, no text.
Transparent background (or flat pure magenta #FF00FF if transparency isn't available).
```

Optional later (Leaderboard / onboarding): a crew of two more original pups, one per sport —
```
Same art style, two new original pups to join the attached pup as a team, each different in breed
and colour from the attached pup and from each other: a Beagle pup in a teal turf-football kit
with a football, and a Shih Tzu pup in an amber pickleball kit with an orange paddle. Same base
jersey design with speed-line stripes, same bandana style in their own colour. No badges, no collar
tags, no backpacks, no text. Standing side by side with the attached pup in the middle.
```

**Style note:** a 3D-cartoon pup next to the flat-vector decorations (bats, cobwebs, pumpkins) in the
asset pack can look mismatched. If D is chosen, I'll update the asset pack's STYLE LOCK to "soft 3D
cartoon" so the props match the pup.

**Earlier recommendation: A.** The lime pickleball is the most distinctive thing in the logo, nobody
else owns it, and a round ball head takes masks, hats and turbans easily.

### Concept A — "the Pickleball buddy" → `C-A-pickleball.png`
```
Mascot character design for a sports & gaming club app, derived from the attached logo.
A cute, energetic, chibi-proportioned character (about 2.5 heads tall) whose head IS the lime-green
pickleball from the logo — bright lime #C6E03A with the small round holes of a pickleball spread
around the top and sides, leaving the face area clean. Big expressive dark eyes with white
highlights, bold eyebrows, a cheeky confident grin. Small rounded arms and legs, white gloves-like
hands with 4 fingers.
Outfit (this is the BASE outfit): navy #0B2545 sporty jersey with teal #0E7C86, orange #EA5F14 and
amber #F5A524 speed-line stripes across the chest like the logo's motion lines, teal wristbands,
navy shorts, orange-and-white sneakers. No letters, numbers or logos on the clothes.
Holding an orange #EA5F14 pickleball paddle like the one in the logo.
Polished 2D vector illustration, clean rounded shapes, soft shading, subtle outline, friendly and
modern like an Indian sports/fintech app mascot. Full body, front three-quarter view, standing in a
confident pose. Single character, centered, nothing cropped, no text anywhere.
Transparent background (or flat pure magenta #FF00FF if transparency isn't available).
```

### Concept B — "the TM athlete" → `C-B-athlete.png`
```
Mascot character design for a sports & gaming club app, derived from the attached logo.
Bring the logo's running athlete figure (formed by the "T" and "M" strokes, with a round head) to
life as a cute chibi character about 2.5 heads tall: a round head with big expressive eyes and a
cheeky grin, a navy #0B2545 body with sporty shapes echoing the angular "TM" strokes, teal
#0E7C86 and orange #EA5F14 speed-line trails behind him as if always in motion.
BASE outfit: navy sporty jersey with teal/orange/amber speed-line stripes, teal wristbands,
orange-and-white sneakers. No letters, numbers or logos on the clothes.
Balancing the lime-green pickleball from the logo on one finger.
Polished 2D vector illustration, clean rounded shapes, soft shading, subtle outline, friendly.
Full body, front three-quarter view. Single character, centered, nothing cropped, no text.
Transparent background (or flat pure magenta #FF00FF).
```

### Concept C — "the Panther" (from the earlier mockup) → `C-C-panther.png`
```
Mascot character design for a sports & gaming club app, using the colours of the attached logo.
A chubby, friendly black panther cub, chibi proportions about 2.5 heads tall, big amber eyes,
small rounded ears, short whiskers, cheeky confident smile.
BASE outfit: navy #0B2545 sporty jersey with teal #0E7C86, orange #EA5F14 and amber #F5A524
speed-line stripes across the chest like the logo's motion lines, teal wristbands, navy shorts,
orange-and-white sneakers. No letters, numbers or logos on the clothes.
Holding the lime-green pickleball from the logo.
Polished 2D vector illustration, clean rounded shapes, soft shading, subtle outline, friendly.
Full body, front three-quarter view. Single character, centered, nothing cropped, no text.
Transparent background (or flat pure magenta #FF00FF).
```

Generate each 2–3 times; send the best of each to the manager.

---

## Step 2 — Lock the base character → `BASE-sheet.png`

Attach the approved concept image.
```
Character reference sheet. Redraw the EXACT character from the attached image — identical face,
head, colours, proportions and base outfit — three times side by side at the same scale, evenly
spaced with clear gaps: front view, three-quarter view, side view. Neutral standing pose, arms
relaxed, no props. Same flat-shaded vector style. No text, no labels.
Transparent background (or flat pure magenta #FF00FF). Landscape 3:2.
```

**Character bible** (write the final details here once approved, and paste this line into every later
prompt so the tools keep him on-model):
`Character: [concept], [head], [eye colour], [base outfit], chibi ~2.5 heads tall.`

---

## Step 3 — The 7 base poses (base outfit, generated once)

Attach `BASE-sheet.png` to each. Prefix each with:
```
Same character as the attached reference sheet — identical face, head, colours, proportions and
base outfit. Same vector style. Single character, centered, full body, nothing cropped, no text.
Transparent background (or flat pure magenta #FF00FF). Square image.
```

| File | Used for | Pose (append to the prefix) |
|---|---|---|
| `P1-wave.png` | Home hero (peeks in from the right) | Half-turned to the viewer, leaning in from the right as if peeking around a corner, one hand waving high, big happy grin. |
| `P2-celebrate.png` | Success pop-ups (booking confirmed, team created, membership approved) | Mid-jump, both arms up, holding a football high in one hand, eyes closed with joy, wide open-mouth smile. |
| `P3-waiting.png` | Info / "Booking requested" (awaiting admin review) | Standing calmly, looking at a wristwatch on one raised wrist with a patient, hopeful smile, other hand on hip. |
| `P4-oops.png` | Error pop-ups (not enough credits, slot taken…) | Apologetic "oops" face, small sweat drop, shrugging with both palms up. Sweet and sorry — not crying, not comedic. |
| `P5-careful.png` | Warning pop-ups (cancel within 24h, confirm actions) | One hand raised palm-out in a friendly "wait a second" gesture, eyebrows raised, attentive caring expression. |
| `P6-trophy.png` | Leaderboard | Proudly holding a golden trophy cup above his head, chest out, big proud smile. |
| `P7-resting.png` | Empty states ("No games played this week yet") | Sitting relaxed on the ground leaning back on one hand, football resting beside him, sleepy content half-smile. |

These base poses are also the **everyday mascot** for days with no festival.

---

## Step 4 — Seasonal outfit swap (edit each base pose)

Attach the **base pose** (e.g. `P2-celebrate.png`), paste the template, fill in the season's outfit.
Save as `<season>/P2-celebrate.png` etc.

```
Edit the attached image. Keep the character EXACTLY the same: same face, eyes, expression, head
shape and markings, body proportions, colours, pose, hand and finger positions, camera angle, size
and position in the frame. Keep the same vector style and the same background.
Change ONLY the outfit and accessories:
[OUTFIT FOR THIS SEASON]
[PROP SWAP FOR THIS POSE, if any]
Clothes must fit naturally around the existing pose. No text, letters or numbers anywhere.
```

### Outfits per season (paste into `[OUTFIT FOR THIS SEASON]`)

| Season | Outfit | Prop swaps |
|---|---|---|
| **Navratri / Dussehra** | Bright orange-and-teal kediyu-style jacket with small round mirror-work embroidery over the jersey, a colourful bandhani-print pagdi (turban) on the head. | Hands that are free hold a pair of decorated dandiya sticks. P2: dandiya sticks raised instead of the football. |
| **Halloween** | A carved jack-o'-lantern pumpkin mask — **worn pushed up on top of the head like a visor so the face stays fully visible** — and a short purple #3B1E54 cape with an orange lining. | P2: football painted as a jack-o'-lantern. P4: shrugging over an empty pumpkin candy bucket at his feet. P6: trophy shaped like a carved pumpkin. P7: sitting on a large pumpkin instead of the ground. |
| **Diwali** | Festive amber-and-orange silk kurta with gold border embroidery over the base, a marigold garland around the neck. | P3: holding a lit clay diya instead of checking the watch (still patient smile). P2: a lit sparkler (phuljhadi) in the raised hand. |
| **Christmas** | Red Santa cap with white fur trim, a red-and-white knitted scarf. | P2: a wrapped gift box instead of the football. |
| **New Year** (Dec 31 – Jan 1) | Shiny orange party cone hat, star-shaped sunglasses pushed up on the head. | P2: a party popper bursting confetti. |
| **Pongal / Sankranti** | Traditional white veshti (dhoti) with a teal-and-gold border, a crisp white half-sleeve shirt, a small angavastram (shoulder cloth) with gold border, a tilak dot on the forehead. Barefoot or simple sandals. | P2: holding a stalk of sugarcane high. P3: standing beside a clay pongal pot overflowing with rice. |
| **Holi** | A plain white kurta covered in splashes of pink, yellow, green and blue gulal; colour powder smudges on the cheeks. | P2: a pichkari (water gun) squirting a colour stream. |
| **Cricket season** (Mar–May) | A teal-and-orange cricket jersey and a cricket helmet (or cap), batting gloves. **No team names, no league logos** (avoid using a real league's branding). | P2: cricket bat raised in celebration. P6: holding a cricket trophy. |

Halloween note: you asked for a pumpkin mask. A mask over the face hides the expression, and the
pop-ups depend on that expression (happy vs. sorry). Hence "pushed up like a visor". For P1 (the
Home hero peek) you can do one version with the mask fully on as a fun reveal, and I'll animate it
lifting.

---

## File checklist per season

`P1-wave` · `P2-celebrate` · `P3-waiting` · `P4-oops` · `P5-careful` · `P6-trophy` · `P7-resting`
(7 edits per season × 8 outfits = 56 edits; the base set is 1 sheet + 7 poses.)
