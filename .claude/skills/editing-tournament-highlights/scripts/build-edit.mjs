#!/usr/bin/env node
// Picture + sound assembly from an edit plan (the "EDL"). Produces, next to the plan:
//   work/shots/sNN.mp4  — each shot trimmed, HDR→SDR tone-mapped, reframed to 9:16,
//                         speed-changed and graded, at the exact output duration
//   work/base.mp4       — all shots hard-cut together (+ tail filler for an end card)
//   work/mix.wav        — music bed from its offset, real-sound moments layered with
//                         ducking, fades, loudness-normalised to -14 LUFS / -1 dBTP
// Transitions, text and graphics are layered on top of base.mp4 by the HyperFrames
// composition, which keeps cut timing frame-exact here.
//
// Usage: node build-edit.mjs <edit-plan.json> [--only-audio]

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';

const planPath = resolve(process.argv[2] ?? '');
if (!existsSync(planPath)) {
  console.error('Usage: node build-edit.mjs <edit-plan.json> [--only-audio]');
  process.exit(1);
}
const onlyAudio = process.argv.includes('--only-audio');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const root = dirname(planPath);
const rel = (p) => (isAbsolute(p) ? p : join(root, p));
const work = join(root, 'work');
const shotsDir = join(work, 'shots');
mkdirSync(shotsDir, { recursive: true });

const { width: W = 1080, height: H = 1920, fps = 30 } = plan.output ?? {};
const TONEMAP = {
  'arib-std-b67': 'zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv',
  smpte2084: 'zscale=tin=smpte2084:pin=bt2020:min=bt2020nc:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv',
};

function ff(args, label) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`ffmpeg failed (${label}):\n${r.stderr}`);
    process.exit(1);
  }
}
function durationOf(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}
function transferOf(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_transfer', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return r.stdout.trim();
}
const srcPath = (s) => join(rel(plan.sourceDir ?? '.'), s);
// FFmpeg copies the SOURCE colour tags (iPhone: bt2020 / HLG) onto the output even after
// tone-mapping the pixels to SDR. Mis-tagged files display wrong everywhere and push
// HyperFrames onto its slow HDR path. Always stamp outputs as Rec.709 SDR explicitly.
const SDR_TAGS = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];

// ---------- picture ----------
let t = 0;
const timeline = [];
if (!onlyAudio) {
  const list = [];
  plan.shots.forEach((s, i) => {
    const id = s.id ?? `s${String(i + 1).padStart(2, '0')}`;
    const file = srcPath(s.src);
    const speed = s.speed ?? 1;
    const span = s.dur * speed; // source seconds consumed
    const tm = TONEMAP[transferOf(file)];
    // Exact frame counts keep every later cut on the beat grid.
    const frames = Math.round(s.dur * fps);
    const avail = durationOf(file) - s.in;
    if (span > avail - 1 / fps) {
      console.error(`[${id}] needs ${span.toFixed(3)}s of source from ${s.in}s but only ${avail.toFixed(3)}s exist — move "in" earlier or lower "speed"`);
      process.exit(1);
    }
    const reframe =
      s.reframe === 'crop' && s.cropX !== undefined
        ? `crop=ih*9/16:ih:(iw-ow)*${s.cropX}:0,scale=${W}:${H}`
        : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
    const vf = [
      tm,
      reframe,
      `setpts=(PTS-STARTPTS)/${speed}`,
      `fps=${fps}`,
      s.grade ?? plan.grade,
      // frame-level colour props win over output flags — stamp SDR here too
      'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
      'format=yuv420p',
    ].filter(Boolean).join(',');
    const out = join(shotsDir, `${id}.mp4`);
    process.stderr.write(`[${id}] ${s.src} @${s.in}s ×${speed} → ${s.dur}s\n`);
    ff(['-ss', String(s.in), '-t', String(span + 0.2), '-i', file, '-vf', vf, '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-r', String(fps), ...SDR_TAGS, out], id);
    list.push(`file '${out.replace(/\\/g, '/')}'`);
    timeline.push({ id, start: Number(t.toFixed(3)), dur: frames / fps, frames, src: s.src, in: s.in, speed, why: s.why });
    t += frames / fps;
  });
  if (plan.tail?.dur) {
    const out = join(shotsDir, 'tail.mp4');
    const tf = Math.round(plan.tail.dur * fps);
    ff(['-f', 'lavfi', '-i', `color=c=${plan.tail.color ?? 'black'}:s=${W}x${H}:r=${fps}`, '-frames:v', String(tf), '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', ...SDR_TAGS, out], 'tail');
    list.push(`file '${out.replace(/\\/g, '/')}'`);
    timeline.push({ id: 'tail', start: Number(t.toFixed(3)), dur: tf / fps, frames: tf });
    t += tf / fps;
  }
  writeFileSync(join(work, 'concat.txt'), list.join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', join(work, 'concat.txt'), '-c', 'copy', join(work, 'base.mp4')], 'concat');
  writeFileSync(join(work, 'timeline.json'), JSON.stringify({ total: Number(t.toFixed(3)), shots: timeline }, null, 2));
} else {
  t = JSON.parse(readFileSync(join(work, 'timeline.json'), 'utf8')).total;
}

// ---------- sound ----------
const total = t;
const m = plan.music;
const inputs = ['-ss', String(m.offset ?? 0), '-t', String(total + 0.5), '-i', rel(m.file)];
const fadeOut = m.fadeOut ?? 2;
// Duck the music under each real-sound moment (gain in dB, smooth via volume eval).
const ducks = (plan.realAudio ?? []).map((r) => `between(t,${r.at - 0.15},${r.at + r.dur + 0.15})`);
const duckDb = m.duckDb ?? -7;
let musicChain = `[0:a]aresample=48000,volume=${m.gainDb ?? 0}dB`;
if (ducks.length) musicChain += `,volume='if(${ducks.join('+')},${Math.pow(10, duckDb / 20).toFixed(3)},1)':eval=frame`;
musicChain += `,afade=t=in:d=${m.fadeIn ?? 0.15},afade=t=out:st=${(total - fadeOut).toFixed(2)}:d=${fadeOut},atrim=0:${total}[mus]`;
const chains = [musicChain];
const mixLabels = ['[mus]'];
(plan.realAudio ?? []).forEach((r, i) => {
  inputs.push('-ss', String(r.in), '-t', String(r.dur), '-i', srcPath(r.src));
  const ms = Math.round(r.at * 1000);
  chains.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${r.gainDb ?? -6}dB,afade=t=in:d=0.12,afade=t=out:st=${(r.dur - 0.3).toFixed(2)}:d=0.3,adelay=${ms}|${ms}[r${i}]`);
  mixLabels.push(`[r${i}]`);
});
chains.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad[out]`);
ff([...inputs, '-filter_complex', chains.join(';'), '-map', '[out]', '-t', String(total), '-c:a', 'pcm_s16le', join(work, 'mix.wav')], 'mix');

console.log(`base.mp4 + mix.wav ready — ${total.toFixed(3)}s`);
