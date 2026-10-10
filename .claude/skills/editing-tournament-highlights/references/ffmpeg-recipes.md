# FFmpeg Recipes

Tested with FFmpeg 9 (gyan.dev full build) on Windows/Git Bash. Quote paths;
this repo's path contains spaces. Work on copies in `<work>/`, never on `input/`.

## Inspect

```bash
ffprobe -v error -show_format -show_streams "clip.mp4"            # full specs
ffmpeg -ss 41.0 -i "clip.mp4" -t 2 -vf "fps=5,scale=480:-2,tile=5x2" -frames:v 1 around-41s.jpg   # 0.2s steps around a moment
ffmpeg -ss 42.3 -i "clip.mp4" -frames:v 1 -q:v 2 frame.jpg         # single still (also for thumbnails)
```

## iPhone HDR → SDR (do this FIRST if triage flags HDR)

iPhones record HLG (Dolby Vision) HEVC by default. Untreated, it looks grey and
washed out in every SDR player and Instagram. Tone-map before any grade. State the
input space explicitly: zscale fails with "no path between colorspaces" otherwise.

```bash
-vf "zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
```
**Then tag the output as SDR** — FFmpeg otherwise copies the source's bt2020/HLG tags onto
the SDR pixels, every player shows wrong colours, and HyperFrames renders via its slow HDR
path into 10-bit HEVC. Output flags alone are NOT enough (frame side-data overrides them) —
end the filter chain with `setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`
AND pass `-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv`.
Verify with `ffprobe -show_entries stream=color_transfer` → must read `bt709`.
For PQ (`smpte2084`) sources use `tin=smpte2084`. Hable can look slightly flat;
the grade afterwards adds contrast back. Prepend this chain to the normalize filters below.

## Normalize selects (do this before assembling)

Trim + convert every select to the same 1080×1920 / 30fps / yuv420p
intermediate, so HyperFrames and the concat step never fight mixed sources.
`-ss` before `-i` is fast; it is frame-accurate when re-encoding.

```bash
# Portrait source
ffmpeg -y -ss 12.4 -i in.mp4 -t 2.2 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p" \
  -c:v libx264 -preset medium -crf 16 -c:a aac -b:a 192k -ar 48000 sel-03.mp4

# Landscape → crop on action (x offset chosen from the contact sheet; 0=left, iw-ow=right)
ffmpeg -y -ss 5 -i land.mp4 -t 2 -vf "crop=ih*9/16:ih:(iw-ow)*0.62:0,scale=1080:1920,fps=30,format=yuv420p" -c:v libx264 -crf 16 -c:a aac sel-04.mp4

# Landscape → blurred fill
ffmpeg -y -ss 5 -i land.mp4 -t 2 -filter_complex \
 "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:2,eq=brightness=-0.12[bg];[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p" \
 -c:v libx264 -crf 16 -c:a aac sel-05.mp4
```

## Stabilize (shaky handheld)

```bash
ffmpeg -i shaky.mp4 -vf vidstabdetect=shakiness=6:result=t.trf -f null -
ffmpeg -y -i shaky.mp4 -vf "vidstabtransform=input=t.trf:smoothing=20:zoom=4,unsharp=5:5:0.6" -c:v libx264 -crf 16 stable.mp4
```

## Speed

```bash
# Constant slow-mo from 60fps source → 40% speed, output 30fps (no interpolation needed)
ffmpeg -y -i sel.mp4 -vf "setpts=PTS/0.4,fps=30" -an slow.mp4
# 30fps source → 50% with motion interpolation (check for warping!)
ffmpeg -y -i sel.mp4 -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1,setpts=2*PTS,fps=30" -an slow.mp4
# Ramp = split into 3 segments (normal / slow / normal) and concat; or keyframe playbackRate in HyperFrames
# Freeze frame for 0.8s at the end of a select
ffmpeg -y -i sel.mp4 -vf "tpad=stop_mode=clone:stop_duration=0.8" freeze.mp4
```

## Grade

```bash
# Normalize-ish: auto-ish levels via eq + white balance nudge
-vf "eq=contrast=1.06:brightness=0.02:saturation=1.05,colorbalance=rs=0.03:bs=-0.03"
# Floodlit turf fix: pull greens, warm skin
-vf "hue=s=1,colorchannelmixer=gg=0.94,colorbalance=rm=0.04:gm=-0.03:bm=-0.02"
# Luxury Noir look
-vf "eq=contrast=1.12:saturation=0.85:gamma=0.97,colorbalance=rh=0.05:gh=0.02:bh=-0.04:bs=0.02,vignette=PI/5"
# Golden Hour Film look (+ grain)
-vf "colorbalance=rm=0.06:gm=0.02:bm=-0.06,eq=contrast=0.94:saturation=0.95,curves=all='0/0.06 1/0.96',noise=alls=8:allf=t,vignette=PI/4"
# Stadium Energy look
-vf "eq=contrast=1.2:saturation=1.1,curves=all='0/0 0.25/0.18 0.75/0.82 1/1',unsharp=5:5:0.5"
# Real LUT if the user supplies one
-vf "lut3d=file='look.cube'"
```
Check grades side by side: extract the same frame from each look and tile with `hstack`.

## Audio

```bash
# Extract a real-sound moment (cheer) to layer under music
ffmpeg -y -ss 41.5 -i clip.mp4 -t 2.5 -vn -af "afade=t=in:d=0.1,afade=t=out:st=2.1:d=0.4" -c:a pcm_s16le cheer.wav
# Measure loudness of a mix
ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=summary -f null -
# Cut music to length at a bar boundary with fade
ffmpeg -y -i track.mp3 -t 36 -af "afade=t=out:st=33:d=3" bed.wav
```

## Delivery

```bash
# Master (from HyperFrames render or final concat): 2-pass loudness is ideal; 1-pass shown
ffmpeg -y -i render.mp4 -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p -r 30 \
  -af "loudnorm=I=-14:TP=-1:LRA=11" -c:a aac -b:a 192k -ar 48000 -movflags +faststart master.mp4

# Messaging-friendly (small; check the target app's current size limit)
ffmpeg -y -i master.mp4 -c:v libx264 -preset slow -crf 24 -maxrate 3M -bufsize 6M -c:a aac -b:a 128k -movflags +faststart share.mp4

# Thumbnail/cover (pick the best GLORY frame)
ffmpeg -y -ss 24.5 -i master.mp4 -frames:v 1 -q:v 2 cover.jpg

# Verify
ffprobe -v error -show_entries format=duration,size:stream=width,height,r_frame_rate,codec_name -of default=nw=1 master.mp4
```
