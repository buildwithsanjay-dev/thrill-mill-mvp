# Cutting Craft

## Cut types (use deliberately)

| Cut | What | When |
|---|---|---|
| **Hard cut** | Instant change | Default. 80%+ of all cuts. |
| **Cut on action** | Cut mid-motion, next shot continues motion | BATTLE sequences: kick → ball in net |
| **Match cut** | Similar shape/motion across two shots | Ball → ball, arm swing → arm swing, circle → trophy |
| **J-cut** | Next shot's audio starts 0.3–0.8s early | Crowd roar leads into the peak shot |
| **L-cut** | Previous audio continues over next shot | Cheer continues over the celebration close-up |
| **Smash cut** | Quiet/slow → instantly loud/fast | Pre-peak silence → peak |
| **Jump cut** | Same angle, time skip | Warm-up montage, energetic rhythm |
| **Flash frame** | 1–2 white/brand frames between shots | Max 2 per video, on the biggest beats |

## Transitions (the signature palette)

Pick **one** signature per video (style preset decides). Use it 2–4 times at
beat boundaries (ARRIVAL→BATTLE, BATTLE→PEAK, GLORY→BOND). Everything else is a hard cut.

| Transition | Feel | Duration | Best for |
|---|---|---|---|
| Whip pan (motion-blur slide) | Energy, sport | 6–10 frames | Stadium Energy |
| Zoom punch-through | Impact | 8–12 frames | Battle → Peak |
| Light leak / film burn | Warm, nostalgic | 12–20 frames | Golden Hour Film |
| Luma / gradient wipe | Elegant | 15–24 frames | Luxury Noir |
| Mask reveal through type | Premium, editorial | 18–30 frames | Title moments in any luxury style |
| Dip to black | Chapter break, gravitas | 8–12 frames | Before GLORY or TAG |
| Glitch/RGB split | Edgy | 4–6 frames | Only if the club asks for "hype" |

**Never:** star wipes, page curls, cube spins, default dissolves between action
shots (dissolves are for time passing, not for energy).
Implementation: `hyperframes-animation` → transitions; `hyperframes-keyframes` for punch-ins, zooms and whips.

## Speed ramps & slow motion

- Ramp shape: 100% → 30% (into the key frame) → hold 0.4–0.8s → 100%+ (out). Ease in and out; never use a linear speed change.
- True slow-mo needs ≥50fps source (triage flags it). 30fps source → max ~60%
  slowdown using frame blending (`minterpolate`); judge visually, since motion
  interpolation warps limbs and balls. If it warps, use freeze-frame + punch-in instead.
- Freeze frame + flash + text (the "player card" moment): good for MVP/champion reveal.
- Peak moment: 1 real-time pass → instant replay from a tighter crop in slow-mo.

## Reframing to 9:16

- Portrait source: use as is, scale to 1080×1920.
- Landscape source, options in order of preference:
  1. **Crop on action** (1080×1920 window from a ≥1080p frame, i.e. 608×1080 slice scaled): follow
     the ball/players; animate the crop x-position if action moves (keyframed pan).
  2. **Blurred-fill**: landscape centered, same clip blurred + darkened behind
     (good for wide shots that lose meaning when cropped).
  3. **Split stack**: two landscape shots stacked top/bottom (BATTLE montage).
- Never letterbox with plain black on a social vertical.

## Safe zones (1080×1920)

- **Title/key text:** x 90–990, y 220–1500. The bottom ~420px is covered by
  Instagram/WhatsApp UI (caption, buttons); the top ~200px by status/profile.
- **Faces:** keep key faces in the middle 60% of height.
- Min sizes: titles 120–220px, labels 56–72px, score digits 180–320px.

## Typography motion

- Titles enter in 0.35–0.6s, hold, exit in 0.25–0.4s (exits are faster than entries).
- Good entries: mask reveal (text slides up from behind a line), letter-spacing
  collapse (wide → tight), per-word stagger (60–90ms), scale 1.08→1.0 with
  blur 8→0px. Bad: bounce, spin, typewriter (unless it's a "stat" moment).
- Kinetic text on beats: one word per beat for hype lines ("ONE · TURF · ONE · CROWN").
- Score card: digits count up quickly, or snap in, then hold ≥2.5s. Winner's
  score in the accent color; loser's in neutral, never in red (respect the losing team).
- Use at most 2 typefaces (display + support), plus numerals from the display face.

## Color grade

- First **normalize** (exposure, white balance) so every clip looks shot on the same day,
  then **look**. Turf under floodlights tends to go green/yellow; pull green
  saturation down and warm the skin tones slightly.
- Apply one look to the whole video. Shifting the grade by beat is allowed: BATTLE cooler and
  more contrasty, BOND warmer and softer.
- Light vignette (10–20%) helps on phone footage. Add film grain only in film styles.
- Recipes: `ffmpeg-recipes.md` → Grade.

## Sound design & mix

Layers (bottom → top): music bed → ambience (real crowd/turf audio) → SFX
(whoosh on transitions, impact on title slams, riser into peak) → narration.

- Keep the **real audio** from the best moments (ball strike, shout, cheer) mixed in,
  ducking the music 6–10 dB for those 1–2s. Real sound is what makes it feel authentic.
- Narration: music ducks 8–10 dB under the voice; music returns over 300ms after each line.
- Pre-peak: music filtered/low (or cut) for 0.3–0.6s, then peak at full.
- End: let the music resolve naturally or fade on the final chord. Never cut the music off mid-phrase.
- Master: −14 LUFS integrated, −1 dBTP true peak (social standard).
- Mechanics: `hyperframes-audio` (ducking, voiceover carve, fades).

## Music selection

**REQUIRED:** follow `references/music-selection.md` and `music-catalogue.json`. For this audience the
song is chosen first (known/trending South Indian song, right lane, safe lyrics), then the edit is
cut to it. Stock/royalty-free music is a flagged last resort only.
- Use the song's famous section (hook / drop / signature riff), with its drop landing on the energy shot.
  Cut the track (edit at bar boundaries) to fit the video length rather than
  stretching the video to fit the track.
- Detect beats: `npx hyperframes beats <project>` (see hyperframes-cli).
