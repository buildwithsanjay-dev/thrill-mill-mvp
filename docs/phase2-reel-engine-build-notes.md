# Phase 2: Reel Engine Build Notes

**Status:** local prototype working (Trial 01 delivered 2026-10-10). Backend not started.
**Purpose:** everything learned while building the first reels with Claude Code, written so the
cloud backend can be built from facts instead of re-discovering them. Read with
`docs/phase2-tournament-memory-engine.md` (original handoff; parts of it are superseded below).

**Superseded from the handoff doc:**
- Input is **video clips** (plus optional photos), not photos only.
- Output is an **Instagram-Reel-style 30–40 s keepsake** (wholesome, happy ending, music-led), not a score-card recap.
- Hosting recommendation moved from Cloudflare to **Google Cloud Run Jobs + Vertex AI (Gemini)**.

---

## 1. Where everything lives

| Thing | Path |
|---|---|
| Editor skill (craft rules, playbooks) | `.claude/skills/editing-tournament-highlights/SKILL.md` + `references/` |
| Music selection playbook | `.claude/skills/editing-tournament-highlights/references/music-selection.md` |
| Song catalogue (memory of researched songs + client feedback) | `.claude/skills/editing-tournament-highlights/music-catalogue.json` |
| Footage triage script | `.claude/skills/editing-tournament-highlights/scripts/triage-footage.mjs` |
| Music analysis script | `.claude/skills/editing-tournament-highlights/scripts/analyze-music.mjs` |
| Picture + sound builder | `.claude/skills/editing-tournament-highlights/scripts/build-edit.mjs` |
| Worked example (plan + overlay composition) | `tournament-memory/trial-01/edit-plan.json`, `tournament-memory/trial-01/comp/index.html` |
| Fonts / music library (gitignored media) | `tournament-memory/_library/fonts/`, `tournament-memory/_library/music/` |
| Raw footage, renders (gitignored) | `tournament-memory/**/input/`, `work/`, `out/` |

---

## 2. The pipeline (what the backend must reproduce)

```
UPLOAD → VALIDATE → TRIAGE → UNDERSTAND (AI) → MUSIC PICK (AI) → PLAN (AI)
       → BUILD PICTURE+SOUND → OVERLAY RENDER → MUX + EXPORT → QC (code + AI) → DELIVER
```

| Stage | Deterministic or AI | Tool | Output |
|---|---|---|---|
| Validate | code | ffprobe | reject corrupt / over-limit files with a plain-language reason |
| Triage | code | `triage-footage.mjs` | per-clip specs, HDR flag, scene cuts, 1 s loudness curve + peaks, timestamped contact sheets |
| Understand | **AI** (vision) | contact sheets today; Gemini native video in backend | shot list: clip @ in–out, what happens, score 0–10, story role |
| Music pick | **AI** (text) | admin-managed monthly library + `music-catalogue.json` | 1 song + 2 backups, hook section |
| Music analysis | code (once per song, at upload) | `analyze-music.mjs` | tempo, drift-free beat grid, energy lifts |
| Plan | **AI** (reasoning) | the skill's story/pacing rules | `edit-plan.json` (shots on the beat grid, text, transitions) |
| Build | code | `build-edit.mjs` | `work/base.mp4` (graded, frame-exact hard cuts) + `work/mix.wav` |
| Overlay render | code | HyperFrames template filled from the plan | titles, transitions, light leaks, end card over base.mp4 |
| Export | code | FFmpeg | master, WhatsApp, Instagram-NO-MUSIC, cover.jpg |
| QC | code + **AI** | ffprobe/loudness/black-frame checks + 8 frames to a vision model | pass, or one targeted retry |

**Rule that keeps cost low:** the AI only *watches, decides and checks*. It never writes HTML or
FFmpeg commands at runtime. It fills a fixed JSON contract (`edit-plan.json`) that deterministic code executes.

---

## 3. Input footage: what real phones produce

Measured from the club's own footage (Sunday community event, 2026-09-21):

- **iPhone default:** HEVC, 10-bit, **HLG HDR** (`color_transfer=arib-std-b67`, bt2020), **2160×3840 portrait at ~60 fps**, with rotation tags.
- **Bitrate:** ~7 MB/s → **~400 MB per minute**. One event = 37 clips / 1.55 GB.
- Clip length in practice: 1.6–6.5 s for "moments"; longer clips exist (up to ~180 MB).
- Instagram reference downloads: 576×1024 or 720×1280, 30 fps, already edited (useful for pacing analysis only).

**Proposed limits per reel job** (pending manager sign-off):
- ≤ 15 clips, each ≤ 60 s, ≤ 5 min total
- ≤ 10 photos
- **compress on the phone** before upload (portrait → 1080×1920, ≤ 60 fps, ~10 Mbps; landscape keeps up to 2160p because it gets cropped)
- ≤ 500 MB per job, resumable upload
- raw footage deleted 7 days after the reel is ready
- **6 clips / 21 s of footage only stretched to a 22 s reel. 10–15 clips are needed for 30–40 s.**

---

## 4. Processing rules learned the hard way

1. **HDR → SDR first.** Untreated HLG looks grey and washed out everywhere. Working chain (input space must be explicit or zscale fails with "no path between colorspaces"):
   `zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv`
2. **Re-tag the output as SDR.** FFmpeg copies the source's bt2020/HLG tags onto SDR pixels. Output flags alone are not enough: end the filter chain with
   `setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv` **and** pass `-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv`.
   Mis-tagged base video made HyperFrames take its HDR path: **8 m 49 s render vs 1 m 42 s** once fixed, plus a 10-bit HEVC output that phones display wrongly.
3. **Count shots in frames, not seconds.** `-t 1.333` drifted one frame and pushed every later cut off the beat. Use `-frames:v round(dur×fps)`.
4. **Guard source length.** A slow-mo shot consumes `dur × speed` seconds of source. Refuse a shot that needs more than exists (the clip's last frame is missing otherwise).
5. **Slow motion:** 60 fps sources slow to ~0.65× cleanly with `setpts=(PTS-STARTPTS)/speed,fps=30`. 30 fps sources need interpolation (risk of warping).
6. **Normalise every shot** to one intermediate: 1080×1920, 30 fps, yuv420p, x264 CRF 14, SDR-tagged. Then plain concat with `-c copy`.
7. **Loudness:** master at **−14 LUFS integrated, −1.5 dBTP** (`loudnorm`). Trial 01 measured −14.0 exactly.
8. **Delivery set:** master (H.264, faststart), WhatsApp copy (CRF 23, ≤ 4 Mbps → ~11 MB for 22 s), Instagram-NO-MUSIC copy (real sound only), cover JPG from the group-photo moment.

---

## 5. How the edit is judged and built (craft)

**Story arc:** HOOK (best moment, 0–2.5 s) → ARRIVAL → ENERGY (lands on the music's lift) → SURPRISE / warmth → BOND (group photo, longest hold) → club END CARD.

**Pacing from the club's references** (scene-cut analysis):

| Reference | Length | Cuts | Avg shot |
|---|---|---|---|
| Thrill Mill "happy weekend" (house style) | 42 s | 28 | ~1.45 s |
| Tournament edit (marked most important) | 50 s | 42 | ~1.15 s |
| Tamil turf edits 1 & 2 | 20 s / 37 s | few hard cuts | long handheld takes joined by whip / zoom-blur transitions |

**Thrill Mill house style** (from the club's own reel):
- short warm English captions with one Tamil-slang touch ("vera level")
- gold bold serif capitals (Playfair Display Black) paired with a white handwritten script (Great Vibes)
- soft glow on text, white-flash transitions
- ends on the group photo, then the **logo on cream** ("THE THRILL MILL CLUB · PLAY · COMPETE · CONNECT")

**Transitions used:** hard cuts by default; zoom-blur punch on the music lift; whip blur into a reveal; white-glow flash into the group photo and the end card; warm light leaks at the open, the warm middle and the bond.

**Text safety:** sky band for wide shots, lower band for close-ups; no-wrap titles; keep x 90–990 px; darken the top of overcast frames for contrast. QC snapshots caught a mid-word wrap ("FAM / ILY"), an overlap with a dancer's head, and low contrast on grey sky. Always render snapshots before the final render.

**HyperFrames gotchas:**
- never animate `letterSpacing` (it snaps to whole pixels; animate per-letter `x` instead)
- give every repeated `fromTo` `immediateRender:false`
- its bundled Chrome failed on this Windows PC (exit 3221225595); `HYPERFRAMES_BROWSER_PATH` pointed at the puppeteer chrome-headless-shell works

---

## 6. Music: the decision trail

1. Royalty-free Western stock music (Mixkit) was **rejected by the client** ("the vibe is very bad"). A trending Jailer 2 song over the same cut worked.
2. Film songs can't be downloaded by the engine (piracy). Instagram's library is licensed by Meta for use **inside Instagram only**; uploading a reel with a film song mixed in risks muting.
3. **Agreed direction:** an **admin-managed monthly library** of ~15 songs uploaded through the app's Admin panel. Each song is analysed once at upload (tempo, beats, chorus, suggested 30/40 s window). The AI picks per edit from the active library, and a monthly research run *suggests* the list to the admin.
4. **Posting:** deliver the Instagram-NO-MUSIC cut plus "add <song> in Instagram, start at mm:ss". Film songs mixed into in-app/WhatsApp copies remain a licensing decision for the owner.
5. Instagram **Business** accounts get a restricted music library. Check which account type posts the reels.

---

## 7. Measured numbers (Trial 01)

| Metric | Value |
|---|---|
| Wall-clock, footage in → delivered | ~32 min (≈ 23 min without the HDR bug) |
| Machine time for a clean run | ~4–5 min (triage ~1 min, build ~45 s, render 1 m 42 s, exports ~35 s) |
| Disk for one 22 s reel | ~770 MB total (most is deletable intermediates) |
| AI cost of the interactive Claude Code session | ≈ $5 (Opus 5.5 rates; ~55 calls re-reading ~260 K tokens) |
| Projected backend AI cost | ≈ $0.09–0.34 per reel (fixed 3–4 calls, see §8) |

---

## 8. Backend direction (decided vs pending)

**Recommended:** Supabase (uploads, jobs table, auth, status, push) + **Google Cloud Run Jobs, Mumbai (`asia-south1`)** + **Gemini on Vertex AI**.

| Job | Model | ≈ Cost per reel |
|---|---|---|
| Footage analysis (native video + audio) | Gemini 3 Flash | $0.05 |
| Music pick from the library | Gemini Flash-Lite | $0.001 |
| Story + edit plan | Gemini 3.1 Pro | $0.11 |
| QC on 8 rendered frames | Gemini 3 Flash | $0.01 |
| **Total** | | **≈ $0.17** (all-Flash ≈ $0.09, all-Pro ≈ $0.34; batch ≈ −50 %) |

**Cost per month after the free trial, 20 reels:** ≈ $4 on Google (budget $7), plus Supabase Pro if the app
isn't already on it. Cloudflare Workers ($5 plan) + Gemini ≈ $9 for the same 20 reels.
OpenRouter adds a 5.5 % top-up fee and can't use Google credits.

**Reliability design:**
- direct-to-storage resumable uploads
- server-side validation before any spend
- queue (Cloud Tasks) with a concurrency cap
- per-stage checkpoints, so retries resume and never re-pay AI
- ≤ 3 retries with timeouts and a per-job cost cap
- JSON-schema-validated AI output, with a rule-based fallback edit
- automatic output QC
- READY/FAILED push notifications with plain-language reasons
- per-job cost logging

**Pending decisions:**
- the manager's Google Cloud sign-up (only when the worker is ready; the 90-day credit clock starts at sign-up)
- developer access (Editor + Project IAM Admin, or a few manager-run IAM commands)
- final input limits
- the regeneration policy (e.g. 2 free re-edits per tournament; a re-edit re-runs plan + render only)
- the AI provider, via a blind test: Gemini Flash / Gemini Pro / Claude on the same footage
- whether music is mixed into in-app copies

---

## 9. Next build steps

1. More local trials (Trial 02: same event, new clips, first song from the Oct 2026 shortlist) to lock in quality.
2. Turn the overlay composition into a **fixed template per style** that reads `edit-plan.json` (no per-reel HTML).
3. Benchmark the render on **CPU only** to size Cloud Run machines.
4. Package FFmpeg + Node + headless Chrome + HyperFrames + scripts as one Docker image (~1–1.5 GB) and run it end to end against the APIs; **log real tokens and cost per reel.**
5. Deploy to staging on Cloud Run, then load and failure tests, then app integration (upload with compression and limits, status, playback, push).
