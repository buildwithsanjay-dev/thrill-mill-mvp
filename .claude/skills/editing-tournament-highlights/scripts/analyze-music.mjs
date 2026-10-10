#!/usr/bin/env node
// Music analysis for an editor who can't listen: tempo, beat grid, energy
// curve, and "lift" points (where the track gets bigger — the moments to land
// the peak shot on). Writes <out>/music-report.md + music-report.json.
//
// Usage: node analyze-music.mjs <music-dir-or-file> <output-dir>
// Requires ffmpeg on PATH.

import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

const SR = 11025;
const HOP = 256; // ~23 ms analysis frames
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: node analyze-music.mjs <music-dir-or-file> <output-dir>');
  process.exit(1);
}
mkdirSync(resolve(out), { recursive: true });

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const buf = r.stdout;
  const n = buf.length / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768;
  return x;
}

function analyze(x) {
  const frames = Math.floor((x.length - HOP) / HOP);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * HOP; i < f * HOP + HOP; i++) s += x[i] * x[i];
    energy[f] = Math.sqrt(s / HOP);
  }
  // Onset strength: positive change in log energy (cheap spectral-flux stand-in).
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const d = Math.log(energy[f] + 1e-6) - Math.log(energy[f - 1] + 1e-6);
    onset[f] = d > 0 ? d : 0;
  }
  const fps = SR / HOP;
  // Tempo by autocorrelation of the onset envelope, 70–170 BPM, with a mild
  // preference for the 90–130 range where most "uplifting" tracks sit.
  let best = { bpm: 0, score: -1 };
  for (let bpm = 70; bpm <= 170; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let f = Math.ceil(lag); f < frames; f++) {
      const l = f - lag;
      const i = Math.floor(l);
      const v = onset[i] * (1 - (l - i)) + onset[i + 1] * (l - i);
      s += onset[f] * v;
    }
    s /= frames;
    const weight = bpm >= 90 && bpm <= 130 ? 1.08 : 1;
    if (s * weight > best.score) best = { bpm, score: s * weight };
  }
  // Refine tempo + phase together with a comb fit over the whole track.
  // Autocorrelation gets the neighbourhood; the comb is drift-sensitive (a
  // 0.5 BPM error misplaces beats by ~0.4 s after 20 s), so it nails the value.
  const combAt = (t) => {
    const i = Math.floor(t);
    // small window absorbs frame quantisation
    return Math.max(onset[i - 1] ?? 0, onset[i] ?? 0, onset[i + 1] ?? 0);
  };
  let fit = { bpm: best.bpm, off: 0, s: -1 };
  for (let bpm = best.bpm - 4; bpm <= best.bpm + 4; bpm += 0.05) {
    const p = (60 / bpm) * fps;
    for (let off = 0; off < p; off += 0.25) {
      let s = 0;
      for (let t = off; t < frames - 1; t += p) s += combAt(t);
      if (s > fit.s) fit = { bpm, off, s };
    }
  }
  best.bpm = Number(fit.bpm.toFixed(2));
  const period = (60 / fit.bpm) * fps;
  const phase = { off: fit.off };
  const beats = [];
  for (let t = phase.off; t < frames; t += period) beats.push(Number((t / fps).toFixed(3)));
  // Energy per 0.5 s in dB and lift points (next 4 s ≥ 3 dB louder than previous 4 s).
  const win = Math.round(fps / 2);
  const curve = [];
  for (let f = 0; f + win <= frames; f += win) {
    let s = 0;
    for (let i = f; i < f + win; i++) s += energy[i] * energy[i];
    curve.push({ t: Number((f / fps).toFixed(1)), db: Number((10 * Math.log10(s / win + 1e-9)).toFixed(1)) });
  }
  const lifts = [];
  for (let i = 8; i + 8 <= curve.length; i++) {
    const before = curve.slice(i - 8, i).reduce((a, c) => a + c.db, 0) / 8;
    const after = curve.slice(i, i + 8).reduce((a, c) => a + c.db, 0) / 8;
    if (after - before >= 3) lifts.push({ t: curve[i].t, gainDb: Number((after - before).toFixed(1)) });
  }
  // Keep the strongest lift per 6 s neighbourhood.
  const merged = [];
  for (const l of lifts) {
    const last = merged[merged.length - 1];
    if (last && l.t - last.t < 6) {
      if (l.gainDb > last.gainDb) merged[merged.length - 1] = l;
    } else merged.push(l);
  }
  // Snap lifts to the nearest beat so they're usable as cut points.
  const snap = (t) => beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), beats[0] ?? t);
  return {
    duration: Number((x.length / SR).toFixed(2)),
    bpm: best.bpm,
    barSec: Number(((60 / best.bpm) * 4).toFixed(3)),
    firstBeat: beats[0] ?? 0,
    beats,
    curve,
    lifts: merged.map((l) => ({ ...l, beat: snap(l.t) })),
  };
}

const spark = (curve) => {
  const c = '▁▂▃▄▅▆▇█';
  // one char per 2 s
  const pts = curve.filter((_, i) => i % 4 === 0).map((p) => p.db);
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  return pts.map((d) => c[hi === lo ? 0 : Math.round(((d - lo) / (hi - lo)) * 7)]).join('');
};

const files = statSync(src).isDirectory()
  ? readdirSync(src).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase())).map((f) => join(src, f))
  : [src];

const report = [];
for (const f of files) {
  process.stderr.write(`analyzing ${basename(f)}\n`);
  report.push({ file: basename(f), ...analyze(decode(f)) });
}
writeFileSync(join(out, 'music-report.json'), JSON.stringify(report, null, 2));
const md = ['# Music report', '', '| Track | Len | BPM | Bar (s) | First beat | Lifts (s, snapped to beat) | Energy (1 char = 2 s) |', '|---|---|---|---|---|---|---|'];
for (const r of report) {
  md.push(`| ${r.file} | ${r.duration.toFixed(0)}s | ${r.bpm} | ${r.barSec} | ${r.firstBeat.toFixed(2)} | ${r.lifts.map((l) => `${l.beat.toFixed(1)} (+${l.gainDb}dB)`).join(', ') || '—'} | \`${spark(r.curve)}\` |`);
}
writeFileSync(join(out, 'music-report.md'), md.join('\n'));
console.log(md.join('\n'));
