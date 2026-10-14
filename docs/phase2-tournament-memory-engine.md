# Phase 2 — Tournament Memory Engine (handoff doc)

**Status:** Planning / research only. Nothing built yet. Not part of the current MVP.

> **Update 2026-10-14:** a local prototype now exists and several assumptions below changed
> (video-clip input, Instagram-reel-style output, Google Cloud Run + Gemini instead of Cloudflare).
> Read `docs/phase2-reel-engine-build-notes.md` first. It records the working pipeline, measured
> numbers, gotchas and the pending decisions.

**Why this file exists:** this work is being moved to its own conversation so it
doesn't mix with the main app's coding/development context. Paste this whole
file into that new conversation to continue from here.

**Scope note:** `CLAUDE.md` (the main project instructions) currently locks the
MVP to Turf/Pickleball booking + Team management only, explicitly **"no
verified match results/tournaments."** This feature — and the related RizzFit
integration below — are the reason that boundary will need to move in Phase 2.
Don't quietly extend the current Supabase schema for this from inside the main
coding conversation; it belongs here first.

---

## 1. What this feature actually is

When a club runs a tournament, an umpire/host takes ~20–30 photos (sometimes a
short video) of the matches as they happen. Once the tournament ends, the goal
is to automatically produce **one combined 30–40 second vertical (9:16) highlight
video for the whole tournament** — real photos, real scores, narration, music,
animated text — and make it visible inside the app to everyone who played in
that tournament.

Two side benefits, not the primary goal: it doubles as a shareable marketing
asset, and it means ThrillMill never needs to pay for separate marketing-video
production.

**Immediate next step (what to actually do first):** produce ONE sample video
and get it in front of the higher-up for a go/no-go call — *before* building
any cloud automation. Needs either real sample tournament photos + team
names/scores, or explicit sign-off to mock one up with placeholder content
first just to nail the visual style.

## 2. Correction to the attached research report — already confirmed

A research report (`ThrillMill_Tournament_Memory_Engine_Report.docx`, dated
2026-10-06) was produced ahead of this and is the source for most of the detail
below. **One thing in it is wrong and has already been corrected:** the report
designs a **per-team** model — a video generated every time a team is
eliminated, so a 10-team bracket produces 10 separate videos.

**What's actually wanted for Phase 1: ONE combined video per tournament, not
per team.** This is simpler and cheaper than what the report modeled, not a
scaled-down version of it:
- **Trigger** becomes "tournament status → COMPLETED" (one event), not "team
  eliminated" (N events per tournament).
- **Volume** drops from the report's 200 memories/month (20 tournaments × 10
  teams) to **20/month** — every cost line in the report's §11 (LLM planning,
  TTS, container render-minutes) shrinks by ~10x accordingly.
- **Data model** simplifies: the memory/output table only needs
  `tournament_id` as its key, not a `tournament_id + team_id` combination.

Everything else below is the report's content, kept for reference, with this
correction already applied in the recommendation.

## 3. Recommended architecture (from the report, adjusted to per-tournament)

**Principle:** Supabase owns business data and the canonical permanent media
store. Cloudflare owns async execution and the rendering workload. AI is used
only for story/script planning and narration — never for generating the actual
video pixels.

Flow: tournament marked COMPLETED in Supabase → Supabase DB webhook calls a
protected Cloudflare Worker → Worker enqueues a render job in Cloudflare Queues
→ queue consumer starts a Cloudflare Container only when a job exists (scale to
zero when idle) → renderer fetches tournament data + short-lived signed photo
URLs from Supabase → Gemini creates a compact scene plan + narration script →
Gemini TTS generates narration audio → HyperFrames + FFmpeg composite real
photos, exact scores, animated text, narration, preset music/SFX into the final
MP4 → MP4 stored back in Supabase Storage → Supabase Realtime tells the app the
memory is READY.

**Stack:** Supabase Pro (existing backend + canonical media store) + Cloudflare
Workers (webhook/API) + Cloudflare Queues (job management) + Cloudflare
Containers (HyperFrames/FFmpeg rendering) + a Gemini model for scene/script
planning + a Gemini TTS model for narration + a ThrillMill-owned/licensed
music+SFX library. Cloudflare R2 is optional/staging-only — Supabase Storage is
the one canonical store, no permanent duplicate.

**Why not a generative AI video model:** the product being sold is *proof it
happened* — real photos, exact scores, no hallucinated numbers or warped
faces/logos. A generative model can silently get a score or a face wrong; a
compositional pipeline (real assets + fixed template) can't. Cost and latency
are also far more predictable this way (fixed platform cost + small LLM/TTS
usage vs. cost scaling with generated seconds and retries).

**Suggested Supabase additions (adjust `tournament_memories` to drop the
per-team key per the correction above):**
- `tournament_media` — id, tournament_id, team_id, match_id, storage_path,
  captured_at, media_type
- `memory_jobs` — id, tournament_id, trigger_reason, status, attempts, error,
  created_at, completed_at (per-tournament now, not per-team)
- `tournament_memories` — id, tournament_id, video_path, status, duration,
  created_at (per-tournament now, not per-team)
- `tournaments` / `matches` / `scores` — **these don't exist yet** in the
  current schema at all (see the scope note at the top). Whoever builds this
  has to decide first whether tournament/match data is native to ThrillMill or
  ingested from RizzFit's API (see §5).
- Idempotency: unique key on `tournament_id` (was `tournament_id + team_id +
  memory_scope` in the original per-team design) so a duplicate webhook/retry
  can't double-render or double-bill TTS.

**Reliability/security carried over from the report, still applies:**
HMAC/secret-authenticate the Supabase→Cloudflare webhook; keep Gemini +
Supabase service-role credentials in Cloudflare secrets, never in the mobile
app; use short-lived signed Supabase Storage URLs for the renderer; queue
retries + dead-letter path; status transitions queued → processing → ready /
failed; render timeout + max retry count; benchmark real render time before
promising an SLA.

## 4. Cost shape (directionally — re-verify before committing)

The report's cost estimates were built for 200 memories/month (per-team
model); with the per-tournament correction, assume roughly **1/10th the
LLM/TTS/render cost** the report lists, on top of the same fixed Supabase Pro
($25/mo) + Cloudflare Workers Paid (~$5/mo) baseline — i.e. the fixed platform
cost dominates, and the actual AI generation cost per tournament is small
either way. All provider prices (Gemini model names/pricing, Cloudflare
Containers pricing) are time-sensitive — the original report flagged this
explicitly and it was correct to do so; re-check current pricing immediately
before any real procurement decision, don't trust numbers from an October 2026
report once real implementation starts.

## 5. Open question — resolve before building the data model

Does tournament/match/score data live natively in ThrillMill, or does it come
from RizzFit once their API is available (see §6)? These may end up being the
same underlying data arriving from two different directions. Don't build this
feature's data model twice — decide this first.

## 6. Related Phase 2 work — RizzFit integration

Separately planned for the same phase: **RizzFit** (rizzfitt.com) is a live,
separate platform where multiple clubs list and host tournaments — teams pay
RizzFit directly to enter, fixtures/scoring happen on RizzFit's side. ThrillMill
Club's job there is integration, not rebuilding their system: once RizzFit
shares their Swagger/API spec, build a UI inside this app for members to
discover/enter RizzFit-hosted tournaments. Not started — waiting on RizzFit to
provide API credentials/docs. This and the Memory Engine are very likely
connected (see §5) — both assume tournament data this app doesn't currently
model.

## 7. Tooling already available in this project

The `brag` skill and `hyperframes-*` skills (hyperframes-core, hyperframes-cli,
hyperframes-animation, hyperframes-audio, hyperframes-creative,
hyperframes-keyframes) are already installed project-locally under
`.claude/skills/` from earlier marketing-video work this app's team did — these
are the same HyperFrames tooling the research report itself recommends for the
compositional render step, so the new conversation can start directly from
local composition experiments without any new tooling setup.

## 8. Source report

Full original research: `ThrillMill_Tournament_Memory_Engine_Report.docx`
(uploaded 2026-10-09, research dated 2026-10-06). This handoff doc is a
condensed, corrected version of it — re-read the original docx if a section
here needs more detail than is reproduced above.
