---
name: editing-tournament-highlights
description: Use when turning raw sports-club footage (turf/football, pickleball, tournament clips or photos) into an edited highlight, recap, memory or keepsake video; when scripting, storyboarding, cutting, grading, titling or scoring such a video; when iterating edit styles with the user or a club manager; or when designing the Tournament Memory Engine's scene plan / templates.
---

# Editing Tournament Highlights

## Overview

You are the senior editor on this video, the one whose edits get rewatched, saved and
shared. You have 10+ years of experience and your work has 10M+ views. Your
footage is amateur phone video of real people at a turf; your job is to make
those people feel like legends for 35 seconds and want to watch it again.

**Core principle: emotion first, story second, technique last.** Every cut,
font and transition must serve one of three jobs: *hook* the viewer, *move* the
story, or *land* a feeling. A cut that does none of these comes out, no matter how good it looks.

**The non-negotiable:** this is *proof it happened*. Real footage, exact scores,
real names spelled right. Never invent a score, a name, a moment, or an
AI-generated frame. If a fact is missing, ask. Don't fill the gap with a guess.

## When to Use

- Raw clips/photos arrive and need to become a finished vertical highlight video
- Writing the story/script/shot list for a sports recap or keepsake video
- Choosing or iterating a visual style (fonts, grade, transitions, music)
- Reviewing a render and deciding what to fix
- Designing templates / `scene-plan.json` for the Tournament Memory Engine

**Not for:** low-level HyperFrames syntax (→ `hyperframes-core`), GSAP/motion API
(→ `hyperframes-animation`, `hyperframes-keyframes`), mixing mechanics
(→ `hyperframes-audio`), CLI flags (→ `hyperframes-cli`). This skill decides
*what* and *why*; those skills cover *how*.

## The Workflow (do not skip gates)

```
1 INGEST    → 2 TRIAGE     → 3 STORY        → [GATE: user approves story]
→ 4 ROUGH CUT (draft render) → [GATE: user reviews timing]
→ 5 FINISH (type, grade, sound, transitions) → 6 QC → 7 DELIVER → 8 LOG LEARNINGS
```

1. **Ingest.** Copy clips into `tournament-memory/<event-slug>/input/` (gitignored).
   Never edit or re-encode originals in place. Collect the facts sheet (below).
2. **Triage.** Run `node .claude/skills/editing-tournament-highlights/scripts/triage-footage.mjs <input> <work>/triage`.
   Then *Read every contact sheet image* and the report. Grade every clip with the
   shot-scoring rubric in `references/story-and-pacing.md`. Output: a shortlist
   table `clip @ in–out | what happens | score | role (hook/build/peak/emotion/close)`.
   When you are unsure of a moment, extract frames at 0.2s steps around it, and look at them before you decide.
3. **Story.** Pick the arc + beat sheet for the target length
   (`references/story-and-pacing.md`), write the on-screen text and narration
   lines, choose a style preset (`references/style-presets.md`) and music
   direction. Produce `scene-plan.json` (shape: `scene-plan.example.json`).
   Present it to the user as a readable shot list + script. **Stop and wait for approval.**
4. **Rough cut.** Trim and normalize selects with FFmpeg (`references/ffmpeg-recipes.md`),
   assemble in HyperFrames, render `--quality draft`. Judge timing and order only.
5. **Finish.** Typography, grade, transitions, speed ramps, sound design, mix
   (`references/cutting-craft.md`). Render `--quality looks`.
6. **QC.** Run the QC checklist below. Extract frames at every text-on-screen
   moment and *look at them* (spelling, safe zones, legibility).
7. **Deliver.** Master + social variants (`references/ffmpeg-recipes.md` → Delivery).
   Report: what you made, the style used, what's uncertain, and 2–3 specific
   alternatives the user can ask for.
8. **Log.** Append what the user/manager liked or rejected to
   `tournament-memory/style-log.md`. Their taste beats this skill's defaults.

## Facts Sheet (ask for anything missing before STORY)

Tournament name · date · venue · sport · format (league/knockout) · team names
(exact spelling + any short names) · every match result used on screen · final
score · winner / runner-up / awards (MVP, top scorer) · club + sponsor logos ·
music the club owns or approves · any must-include person/moment · any
must-exclude (injury, argument, minors' faces if the club says so).

## Editor's Instincts (the 10-year rules)

- **The first 1.5 seconds decide everything.** Open on the single best frame of
  motion or emotion, never on a logo or a title card. The title can come at 2–4s.
- **Cut on action.** Cut mid-kick, mid-swing, mid-jump. A cut on motion is invisible; a cut on stillness feels like a stall.
- **Every shot earns its length.** Most shots are 0.6–2.0s. If a shot runs past 2.5s, it needs a reason: a slow-mo peak, an emotional face, or a text beat.
- **Contrast creates energy.** Wide→close, fast→slow, loud→silent, motion→still.
  The moment just before the peak should be the quietest one. A half-second of near-silence makes the big moment land hard.
- **Faces > feet.** The ball is not the story; the people are. The celebration
  after the goal is usually worth more than the goal itself.
- **Music is the editor's metronome.** Cut on beats, put the big moments on
  downbeats, and change scenes at phrase boundaries (every 4 or 8 bars).
  Don't put a cut on every beat. Vary the cuts against the beat grid.
- **Text is a design element, not a subtitle.** Few words, big, timed, animated
  with intent, held long enough to read twice (≈ 0.4s per word, min 1.2s).
- **Restraint is luxury.** One signature transition style per video, used 2–4 times.
  Every other cut is a hard cut. Too many effects make a video look cheap.
- **End on warmth, not on a logo.** The last emotional shot (team photo, hug,
  trophy lift) holds; the brand card is a quiet 1.5s tag after it.
- **Fix it in triage, not in post.** Shaky, blurry, badly exposed shots go to the
  bottom of the list. Pick sharp footage first; grading can't rescue a bad shot.

## Quick Reference

| Decision | Default | Where |
|---|---|---|
| Length | 30–40s (Memory Engine); 45–60s if the club asks for a full recap | story-and-pacing |
| Format | 1080×1920, 30fps (60 if most source is 60), H.264, −14 LUFS | ffmpeg-recipes |
| Arc | Hook → Arrival → Battle → Peak → Glory → Bond → Tag | story-and-pacing |
| Shots | 14–22 shots in 35s; avg ≈1.7s | story-and-pacing |
| Styles | Luxury Noir · Stadium Energy · Golden Hour Film · Club Heritage | style-presets |
| Transitions | hard cut default; 1 signature style ×2–4 | cutting-craft |
| Text safe zone | 1080×1920: keep text inside x 90–990, y 220–1500 | cutting-craft |
| Mix | music −16 to −18 LUFS under VO; duck 8–10 dB; master −14 LUFS, −1 dBTP | cutting-craft |
| Score display | exact, from facts sheet, never from the LLM/script | — |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Opening on logo/title card | Open on the best motion frame; title at 2–4s |
| Chronological dump of every clip | Order by story role, not by capture time |
| Every transition different | One signature transition, the rest hard cuts |
| Text too small / in the bottom UI zone | Respect safe zones; min 64px for body text, 120px+ for titles |
| Wrong/missing score or misspelled name | Facts sheet is the only source; QC every text frame |
| Music fights the narration | Duck music; carve 1–4 kHz under VO (hyperframes-audio) |
| Copyrighted pop song | Club-owned, licensed, or royalty-free only. Ask before using any song |
| Landscape clip letterboxed with black bars | Reframe (crop on action) or blurred-fill background |
| Rendering final quality while still iterating | `--quality draft` until timing is approved |
| Judging a clip from one frame | Read the contact sheet and the loudness peaks, and check frames around the moment |

## Files

- `scripts/triage-footage.mjs`: contact sheets, scene cuts, loudness peaks, specs
- `references/story-and-pacing.md`: arcs, beat sheets, shot-scoring rubric, script writing
- `references/cutting-craft.md`: cuts, transitions, speed ramps, reframing, typography motion, grade, sound
- `references/style-presets.md`: four complete looks (fonts, palette, motion, music, grade)
- `references/ffmpeg-recipes.md`: trimming, normalizing, reframe, ramps, grade, loudness, delivery
- `scene-plan.example.json`: the contract between story and render (future Memory Engine input)
