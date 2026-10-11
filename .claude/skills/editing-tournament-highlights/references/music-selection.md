# Music Selection: South Indian Reels

For a Tamil audience **the song is half the reel**. People stop scrolling because they know the
song before they've understood the picture. A perfectly timed edit to a generic stock track loses
to an average edit on a song everyone knows. (Learned in Trial 01: royalty-free folk-pop was rejected
outright, while the same cut with a new Jailer 2 song worked.)

## The non-negotiables

1. **Known or trending, never anonymous.** Every candidate must be either *trending now* or an
   *evergreen classic* the audience sings along to. Stock / royalty-free music is a last-resort
   fallback for in-app copies only, and must be flagged as such.
2. **South Indian first.** Tamil first, then pan-South crossovers everyone in Tamil Nadu knows
   (Telugu/Malayalam mega-hits). No Hindi / North Indian songs unless the client asks.
3. **Lyrics must suit the event.** These reels go to families, women's groups and kids. Reject songs
   whose hook line is about drinking, smoking, violence, stalking or heartbreak, even if they trend.
   If unsure what a Tamil lyric says, ask the user before recommending it.
4. **Recognisable in 2 seconds.** Start the reel on the song's most famous moment (the hook, the
   signature BGM riff or the iconic line), never on a slow intro.
5. **Never source the audio ourselves.** Film songs are copyrighted. The user/club supplies a
   legally obtained file for timing; posting uses Instagram's licensed audio (see Licensing).

## Step 1: Read the brief → pick a lane

| Event / footage | Lane | What it sounds like | Avoid |
|---|---|---|---|
| Tournament, finals, walk-outs, trophy | **Mass / hero** | Anirudh-style hero anthem, big drums, chant hook | Soft melodies |
| Sports crowd, cricket/box-cricket, team pride | **Stadium anthem** | Whistle/chant, crowd-singable | Romance songs |
| Community day, dance, weekend fun | **Kuthu / celebration** | Thappu/folk percussion, dance hook, joyful | Slow or sad songs |
| Women's event, women's team | **Empowering celebration** | Pride + joy, women-centric anthems | Songs objectifying women |
| Friends' turf night, casual games | **Friendship / vibe** | Friendship anthems, light indie, banter energy | Heavy mass BGM |
| Families, kids, wholesome memories | **Feel-good melody** | Warm, bright, singable, mid-tempo | Item numbers |

**Read the footage too.** Use triage loudness and motion: lots of dancing and cheering pushes towards kuthu or mass; calm,
smiling, bonding footage pushes towards feel-good melody. A **hybrid** works well for 30–40 s
reels when the song itself shifts (melodic opening → big chorus). Prefer one song that does that over stitching two songs together.

## Step 2: Score the candidates (pick the top 3)

| Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **Recognition** | Unknown | Niche | Popular | Everyone sings it |
| **Trend momentum** | Faded / overused last year | Steady | Rising | Peak right now, or untouchable evergreen |
| **Mood fit** (lane above) | Wrong | Partial | Good | Exact |
| **Footage energy match** | Mismatch | — | Matches | — |
| **Hook usable in the reel length** | No clear hook in ≤ 40 s | — | Yes | — |
| **Lyric safety** | **FAIL = reject** | | PASS | |

Max 13. Recommend only songs that score ≥ 9 and pass on lyrics. Present the top 3 as:
`Song (Film, Composer, year): lane, why it fits this footage, which part to use`.

**Trend timing:** new film songs spike around the audio launch and peak in the **2–4 weeks after
the film releases**, then fade. "Last season's overused hit" is the worst slot: it reads as dated.
Either be on the current wave or go evergreen.

## Step 3: Choose the part of the song (where most edits go wrong)

Reels use **one** famous section, not the song from the top. In order of preference:

1. **The section Instagram already uses.** Open the song's audio page in Instagram: the most-used
   snippet is the one the audience recognises. Record its start time in the catalogue.
2. **The chorus / hook drop.** Find it with `analyze-music.mjs`: the biggest *lift* that **repeats**
   later in the song is almost always the chorus. A single lift that never repeats is a bridge or intro hit.
3. **The signature BGM riff.** Anirudh-style mass tracks often have an instrumental riff more famous than any lyric.

Then fit the window to the edit:

- **Start on a bar**, 1–2 bars *before* the drop, so the drop lands on the energy shot (around 5–7 s into the reel).
- **End on a phrase end** or the song's own hit. Never cut mid-word; fade out over 1–2 s only if the phrase won't resolve.
- For 30–40 s reels, one window usually covers *pre-chorus → chorus → post-chorus hit*. Check that the hook line falls on the emotional shot (the group photo or the trophy), not over the end card.
- Record `offset` (song time at reel 0:00) in the edit plan. That same number goes into the posting note.

## Step 4: Cut to the song, not on top of it

- Run `analyze-music.mjs` on the supplied file: tempo, beat grid, lifts.
- **Kuthu / folk percussion:** cut on the strong drum hits (thappu). The audience feels those beats in
  their body, so a cut that misses them feels wrong even to non-editors.
- **Mass anthems:** the drop is the event. Hold a near-silent or filtered beat before it, then smash-cut on the drop.
- **Melodies:** cut on phrase changes (every 2 bars), not every beat. Let shots breathe.
- **Vocals vs real sound:** when the singer is on a line, duck the crowd/cheer sounds under it. Bring real sound up only in instrumental gaps.

## Licensing and posting (practical, not optional)

- **Posting to Instagram:** export the `-instagram-NO-MUSIC` version, then add the song from Instagram's
  library and set the start to the plan's `offset`. Write that into the delivery note:
  *"Add '<song>' in Instagram, start at 0:48."* Instagram's own library is licensed for use on Instagram.
- **Business accounts have a restricted music library.** If the club posts from an Instagram
  *Business* account, many film songs may not be available there; Creator/personal accounts usually
  get the full library. Check which account type posts the reel **before** promising a song.
- **WhatsApp / in-app copies with the song burned in** are a licensing grey area for a business. Flag it;
  don't decide it silently. For the eventual SaaS, in-app playback of film songs needs a label licence
  (or the stock fallback).
- The user supplies the audio file. Never download film songs from YouTube rippers or "masstamilan"-type sites.

## Keeping the catalogue fresh

`music-catalogue.json` (next to this skill) is the working memory. Refresh it at the start of every
trial, or weekly:

1. Check Spotify's Tamil viral/trending playlists and new film audio launches (search: "<film> songs", "trending Tamil reels").
2. Ask the user/manager what's trending in Instagram's Reels audio. It's the real source of truth, and Claude can't see it.
3. For each song: set `status` (`trending` / `evergreen` / `fading`) and `verified` (date), and fill
   `hook_start` once someone has checked the Instagram snippet or the analyser has found the chorus.
4. Add the outcome after each trial: `feedback` = what the client said. Songs the manager loved move up;
   rejected songs get the reason recorded.

Never fill BPM, hook times or lyric meanings from memory. Measure, verify, or leave `null`.
